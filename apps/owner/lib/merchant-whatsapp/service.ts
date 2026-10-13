import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import type {MerchantWhatsAppCommand,MerchantWhatsAppResult} from '../../../../packages/saas-contracts/src/merchant-whatsapp/types.ts';
import type {AdminWhatsAppOtpDelivery} from '../../../../packages/saas-data/src/admin-login-security/delivery.ts';
import type {createMerchantWhatsAppCodec,MerchantPhonePending} from './codec.ts';

type Row=Readonly<Record<string,unknown>>;
export type MerchantInternalInput=Readonly<{
 schemaVersion:1;action:'state'|'start'|'resend'|'verify'|'complete'|'self_state'|'staff_list'|'staff_create'|'staff_update';
 purpose:'login'|'bind_phone'|'signup';hostname:string;browserCredential?:string;pendingCookie?:string;
 sessionCredential?:string;operationId?:string;ingressAuthenticated?:boolean;trustedIp?:string;payload?:Row;
}>;
export type MerchantCompletion=Readonly<{sessionCredential:string;sessionId:string;sessionIssuedAt:string;sessionExpiresAt:string;destinationStoreId:string;destinationOrigin:string;purpose:'login'|'bind_phone'|'signup'}>;
export type MerchantInternalResult=Readonly<{schemaVersion:1;code:string;state?:Row;pendingCookie?:string;pendingExpiresAt?:string;completion?:MerchantCompletion;retryAfterSeconds?:number}>;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
function unavailable():never{throw Error('merchant_whatsapp_unavailable');}
function str(value:unknown,max=2048){if(typeof value!=='string'||!value||value.length>max||/[\u0000-\u001f\u007f]/u.test(value))unavailable();return value;}
function uuid(value:unknown){const v=str(value,36);if(!UUID.test(v))unavailable();return v;}
function iso(value:unknown){const v=str(value,40);if(!Number.isFinite(Date.parse(v)))unavailable();return new Date(v).toISOString();}
function fields(value:Row|undefined,required:readonly string[],optional:readonly string[]=[]):Row{const row=value??{};if(required.some(k=>!Object.hasOwn(row,k))||Object.keys(row).some(k=>![...required,...optional].includes(k)))unavailable();return row;}
function failure(outcome:string):string{return ({unauthenticated:'fresh_login_required',membership_denied:'fresh_login_required',owner_required:'unauthorized',invalid_input:'invalid_input',invalid_code:'invalid_code',locked:'locked',rate_limited:'rate_limited',phone_conflict:'phone_conflict',staff_limit_reached:'staff_limit_reached',version_conflict:'version_conflict',operation_mismatch:'operation_mismatch',disabled:'feature_not_enabled',not_ready:'not_ready'} as Record<string,string>)[outcome]??'operation_uncertain';}

export function createOwnerMerchantWhatsAppService(options:Readonly<{
 codec:ReturnType<typeof createMerchantWhatsAppCodec>;
 repository:{command(command:MerchantWhatsAppCommand):Promise<MerchantWhatsAppResult>};
 delivery:AdminWhatsAppOtpDelivery;recipientRateKey:Uint8Array;sessionKeys:ReadonlyMap<string,Uint8Array>;clock:()=>Date;centralLoginHostnames?:ReadonlySet<string>;
}>){
 const {codec}=options,rate=Buffer.from(options.recipientRateKey);
 if(rate.length!==32)unavailable();
 const result=(code:string,extra:Omit<MerchantInternalResult,'schemaVersion'|'code'>={}):MerchantInternalResult=>Object.freeze({schemaVersion:1,code,...extra});
 const call=(action:MerchantWhatsAppCommand['action'],input:Row)=>options.repository.command({action,input} as MerchantWhatsAppCommand);
 const binding=(p:MerchantPhonePending)=>({pendingId:p.pendingId,pendingDigest:p.pendingDigest,browserDigest:p.browserDigest,environment:p.environment});
 function ipDigest(input:MerchantInternalInput){if(input.ingressAuthenticated!==true)unavailable();if(input.trustedIp===undefined)return null;if(!isIP(input.trustedIp))unavailable();return createHmac('sha256',rate).update(JSON.stringify(['celebix/whatsapp-otp/ip-budget/v1',input.trustedIp])).digest('hex');}
 function actor(input:MerchantInternalInput){const credential=str(input.sessionCredential),separator=credential.length-44,keyId=credential.slice(3,separator),key=options.sessionKeys.get(keyId);if(!/^v1\.[A-Za-z0-9._-]{1,64}\.[A-Za-z0-9_-]{43}$/u.test(credential)||!key||Buffer.from(credential.slice(separator+1),'base64url').toString('base64url')!==credential.slice(separator+1))unavailable();return {actorTokenKeyId:keyId,actorTokenDigest:createHmac('sha256',key).update(`celebix-panel-session-v1\n${credential}`).digest('hex')};}
 function pending(input:MerchantInternalInput){if(!input.pendingCookie||!input.browserCredential)return null;const opened=codec.openPending(input.pendingCookie,input.browserCredential,input.hostname);return opened?.purpose===input.purpose?opened:null;}
 function state(row:Row):Row{return Object.freeze({phase:row.challengeId?'code':'phone',...(typeof row.phoneMasked==='string'?{maskedPhone:row.phoneMasked}:{}),...(row.expiresAt?{expiresAt:iso(row.expiresAt)}:{}),...(row.resendAt?{resendAt:iso(row.resendAt)}:{})});}
 function responseFromRead(read:MerchantWhatsAppResult,p:MerchantPhonePending,input:MerchantInternalInput):MerchantInternalResult{
  if(read.outcome==='completed'&&read.authority)return completion(read.authority,p,input);
  if(read.outcome==='phone_verified'&&input.purpose==='signup')return result('phone_verified');
  if(!read.authority)return result(failure(read.outcome));
  if(!['pending','prepared','accepted','failed','ambiguous'].includes(read.outcome))return result(failure(read.outcome));
  if(read.authority.purpose!==input.purpose)unavailable();
  const status=read.authority.status,code=status==='accepted'?'ok':status==='failed'?'delivery_failed':status==='ambiguous'?'delivery_uncertain':'operation_uncertain';
  return result(code,{state:state(read.authority)});
 }
 function completion(row:Row,p:MerchantPhonePending,input:MerchantInternalInput):MerchantInternalResult{
  const op=uuid(row.completedOperationId),escrow=codec.openCompletion(str(row.completionCiphertext,32768),p,op),s=row.session as Row;
  if(!escrow||!s||uuid(s.sessionId)!==escrow.sessionId||uuid(s.familyId)!==escrow.familyId||uuid(row.principalId)!==uuid(s.principalId))unavailable();
  const issued=iso(s.issuedAt),expires=iso(s.expiresAt),now=options.clock().getTime();
  if(Date.parse(issued)>now||Date.parse(expires)<=now||Date.parse(expires)>Date.parse(issued)+8*3600000)unavailable();
  const origin=str(row.destinationOrigin,512),url=new URL(origin);
  if(url.protocol!=='https:'||url.origin!==origin||url.port||url.username||url.password||(input.purpose!=='signup'&&url.hostname!==p.destinationHostname&&!(input.purpose==='login'&&options.centralLoginHostnames?.has(p.destinationHostname))))unavailable();
  return result(input.purpose==='bind_phone'?'phone_bound':'complete',{completion:{sessionCredential:escrow.sessionCredential,sessionId:escrow.sessionId,sessionIssuedAt:issued,sessionExpiresAt:expires,destinationStoreId:uuid(s.activeStoreId),destinationOrigin:origin,purpose:input.purpose}});
 }
 async function read(p:MerchantPhonePending,auth?:ReturnType<typeof actor>){return call('read',{...binding(p),...auth});}
 async function deliver(p:MerchantPhonePending,challenge:{challengeId:string;code:string},phone:string,auth?:ReturnType<typeof actor>):Promise<MerchantWhatsAppResult>{
  let status:'accepted'|'ambiguous'='ambiguous';
  try{const delivered=await options.delivery({phone,code:challenge.code,idempotencyKey:challenge.challengeId,storeName:'Celebix'});if(delivered.recipient===phone.slice(1))status='accepted';}catch{/* An unknown provider result is never resent automatically. */}
  try{return await call('finish_delivery',{...binding(p),challengeId:challenge.challengeId,status});}
  catch{return read(p,auth);}
 }
 async function login(input:MerchantInternalInput):Promise<MerchantInternalResult>{
  const auth=input.purpose==='bind_phone'?actor(input):undefined;
  if(input.action==='start'){
   const budget=ipDigest(input),payload=fields(input.payload,['phone']),prepared=codec.prepare({phone:payload.phone,operationId:uuid(input.operationId),browserCredential:str(input.browserCredential),destinationHostname:input.hostname,purpose:input.purpose});
   let saved:MerchantWhatsAppResult;
   try{saved=await call('prepare',{...prepared.command,ipDigest:budget,...auth});}
   catch{saved=await read(prepared.pending,auth);}
   // Only the native fresh reservation permits one provider attempt. Replays,
   // unknown commits and read recovery cannot re-send this challenge.
   if(saved.outcome==='prepared')saved=await deliver(prepared.pending,{challengeId:prepared.command.challengeId,code:prepared.code},prepared.phone,auth);
   const projected=responseFromRead(saved,prepared.pending,input);
   return result(projected.code,{...projected,...(saved.authority?.expiresAt?{pendingCookie:prepared.cookie,pendingExpiresAt:iso(saved.authority.expiresAt)}:{})});
  }
  const p=pending(input);
  if(!p)return input.action==='state'?result('ok',{state:{phase:'phone'}}):result('fresh_login_required');
  const saved=await read(p,auth);
  if(saved.authority?.purpose!==undefined&&saved.authority.purpose!==input.purpose)unavailable();
  if(input.action==='state'){
   if(!saved.authority)return result('ok',{state:{phase:'phone'}});
   return result('ok',{state:state(saved.authority)});
  }
  if(saved.outcome==='completed')return responseFromRead(saved,p,input);
  if(input.action==='complete')return result('not_ready');
  if(input.purpose==='signup'&&saved.outcome==='phone_verified')return result('phone_verified');
  if(saved.outcome!=='pending'||!saved.authority)return result(failure(saved.outcome));
  if(input.action==='resend'){
   fields(input.payload,[]);const ip=ipDigest(input),challenge=codec.challenge(p,uuid(input.operationId)),row=saved.authority;
   const phone=codec.openPhone(str(row.phoneCiphertext,4096),str(row.phoneKeyId,64),str(row.phoneDigest,64)),identity=codec.phoneIdentity(phone);
   let next:MerchantWhatsAppResult;
   try{next=await call('resend',{...binding(p),...auth,operationId:uuid(input.operationId),challengeId:challenge.challengeId,codeDigest:challenge.codeDigest,ipDigest:ip,recipientBudgetDigest:identity.recipientBudgetDigest});}
   catch{next=await read(p,auth);}
   if(next.outcome==='prepared')next=await deliver(p,challenge,phone,auth);
   return responseFromRead(next,p,input);
  }
  if(input.action!=='verify')unavailable();
  const payload=fields(input.payload,['code']);if(typeof payload.code!=='string'||!/^[0-9]{6}$/u.test(payload.code))return result('invalid_code');
  const material=codec.session(p,uuid(input.operationId)),{sessionCredential:_credential,...session}=material;
  let verified:MerchantWhatsAppResult;
  try{verified=await call('verify',{...binding(p),...auth,...session,challengeId:uuid(saved.authority.challengeId),codeDigest:codec.codeDigest(p,uuid(saved.authority.challengeId),payload.code)});}
  catch{verified=await read(p,auth);}
  if(['issued','phone_bound','operation_replayed'].includes(verified.outcome)&&verified.authority)return completion(verified.authority,p,input);
  return responseFromRead(verified,p,input);
 }
 async function staff(input:MerchantInternalInput):Promise<MerchantInternalResult>{
  const auth=actor(input);
  if(input.action==='self_state'){fields(input.payload,[]);const r=await call('self_state',auth);return r.outcome==='listed'&&r.authority?result('ok',{state:r.authority}):result(failure(r.outcome));}
  if(input.action==='staff_list'){fields(input.payload,[]);const r=await call('staff_list',auth);return r.outcome==='listed'&&r.authority?result('ok',{state:{...r.authority,enabled:true}}):result(failure(r.outcome));}
  const payload=input.action==='staff_create'?fields(input.payload,['phone','displayName','role','expectedVersion'],['existingMembershipId']):fields(input.payload,['staffId','expectedVersion','action'],['displayName','role']);
  let r:MerchantWhatsAppResult;
  if(input.action==='staff_create'){
   const identity=codec.phoneIdentity(payload.phone),{phone:_phone,recipientBudgetDigest:_budget,...encrypted}=identity;
   r=await call('staff_create',{...auth,operationId:uuid(input.operationId),...encrypted,displayName:payload.displayName,role:payload.role,expectedVersion:payload.expectedVersion,...(payload.existingMembershipId?{existingMembershipId:payload.existingMembershipId}:{})});
  }else{
   if(!['update','revoke'].includes(String(payload.action)))unavailable();
   const current=await call('staff_list',auth);if(current.outcome!=='listed'||!Array.isArray(current.authority?.staff))return result(failure(current.outcome));
   const original=(current.authority.staff as Row[]).find(row=>row.staffId===payload.staffId);if(!original)return result('version_conflict');
   r=await call('staff_update',{...auth,operationId:uuid(input.operationId),staffId:payload.staffId,expectedVersion:payload.expectedVersion,displayName:payload.displayName??original.displayName,role:payload.role??original.role,enabled:payload.action==='revoke'?false:original.enabled});
  }
  return ['created','updated','operation_replayed'].includes(r.outcome)&&r.authority?result('ok',{state:{...r.authority,enabled:true}}):result(failure(r.outcome));
 }
 return Object.freeze({codec,
  async getSignupProof(input:Readonly<{pendingCookie:string;browserCredential:string;hostname:string}>){
   const p=pending({...input,schemaVersion:1,action:'state',purpose:'signup'});if(!p)return null;
   const r=await read(p);if(!r.authority||!['phone_verified','completed'].includes(r.outcome))return null;
   if(r.outcome==='phone_verified'&&r.authority.purpose!=='signup')return null;
   return Object.freeze({pending:p,proof:binding(p),principalId:uuid(r.authority.principalId),expiresAt:iso(r.authority.expiresAt),completed:r.outcome==='completed'});
  },
  async claimSignup(input:Readonly<{pending:MerchantPhonePending;storeId:string;operationId:string}>):Promise<MerchantInternalResult>{
   const p=input.pending;if(p.purpose!=='signup')return result('fresh_login_required');
   const material=codec.session(p,uuid(input.operationId)),{sessionCredential:_credential,...session}=material;
   let r:MerchantWhatsAppResult;try{r=await call('claim_signup',{...binding(p),...session,storeId:uuid(input.storeId)});}catch{r=await read(p);}
   if(['issued','operation_replayed','completed'].includes(r.outcome)&&r.authority)return completion(r.authority,p,{schemaVersion:1,action:'complete',purpose:'signup',hostname:p.destinationHostname});
   return result(failure(r.outcome));
  },
  async command(input:MerchantInternalInput):Promise<MerchantInternalResult>{
  try{if(input.schemaVersion!==1||!['login','bind_phone','signup'].includes(input.purpose))unavailable();return ['self_state','staff_list','staff_create','staff_update'].includes(input.action)?await staff(input):await login(input);}
  catch{return result('unavailable');}
 }});
}
