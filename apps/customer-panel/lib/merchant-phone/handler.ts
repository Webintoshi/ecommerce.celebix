import {randomBytes,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import type {MerchantInternalInput,MerchantInternalResult,MerchantCompletion} from '../../../owner/lib/merchant-whatsapp/service.ts';
import {serializePersistentPanelSessionCookie} from '../panel-session-completion/cookie.ts';
import {merchantPurchaseHintFromSearch,merchantPurchaseDestination} from './purchase-hint.ts';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
class Unauthorized extends Error{}
export class MerchantActorUnavailable extends Error{}
function invalid():never{throw Error('merchant_request_invalid');}
function secure(response:Response){response.headers.set('cache-control','no-store');response.headers.set('referrer-policy','no-referrer');response.headers.set('x-content-type-options','nosniff');return response;}
function error(code:string,status=403){return secure(Response.json({code},{status}));}
function cookie(request:Request,name:string){const h=request.headers.get('cookie');if(!h)return undefined;if(h.length>24576||/[\u0000-\u001f\u007f]/u.test(h))invalid();const found=h.split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));if(found.length>1)invalid();const v=found[0]?.slice(name.length+1);if(v!==undefined&&(!v||v.length>8192||!/^[A-Za-z0-9_.-]+$/u.test(v)))invalid();return v;}
function setCookie(name:string,value:string,seconds:number){if(!/^[A-Za-z0-9_.-]+$/u.test(value)||!Number.isSafeInteger(seconds)||seconds<1||seconds>28800)invalid();return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${seconds}`;}
function clearCookie(name:string){return `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;}
function token(value:unknown){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{43}$/u.test(value)||Buffer.from(value,'base64url').toString('base64url')!==value)invalid();return value;}
function same(left:string,right:string){const a=Buffer.from(left),b=Buffer.from(right);return a.length===b.length&&timingSafeEqual(a,b);}
// Next listener URLs do not replace routed public Host/Origin authority.
export function isMerchantInternalListener(url:URL){const hostname=url.hostname.replace(/^\[|\]$/gu,'');return !hostname.includes('.')||isIP(hostname)!==0;}
function origin(request:Request,allowPurchase=false){const url=new URL(request.url),raw=request.headers.get('host');if(!['http:','https:'].includes(url.protocol)||url.username||url.password||(!allowPurchase&&url.search)||url.hash)invalid();const publicUrl=new URL('https://'+(raw??url.host));if(publicUrl.host!==(raw??url.host)||publicUrl.port||publicUrl.username||publicUrl.password||publicUrl.pathname!=='/'||publicUrl.search||publicUrl.hash||!publicUrl.hostname.includes('.'))invalid();if(url.protocol==='https:'&&!isMerchantInternalListener(url)&&url.origin!==publicUrl.origin)invalid();return publicUrl;}
async function body(request:Request){if(request.headers.get('content-type')!=='application/json'||!request.body)invalid();const reader=request.body.getReader(),chunks:Uint8Array[]=[];let length=0;try{for(;;){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>4096){await reader.cancel();invalid();}chunks.push(next.value);}const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));if(!value||typeof value!=='object'||Array.isArray(value))invalid();return value as Record<string,unknown>;}finally{reader.releaseLock();}}
function exact(row:Record<string,unknown>,required:readonly string[],optional:readonly string[]=[]){if(required.some(k=>!Object.hasOwn(row,k))||Object.keys(row).some(k=>![...required,...optional].includes(k)))invalid();return row;}
function loginState(state:unknown){if(!state||typeof state!=='object'||Array.isArray(state))invalid();const s=state as Record<string,unknown>;exact(s,['phase'],['maskedPhone','expiresAt','resendAt']);if(!['phone','code'].includes(String(s.phase)))invalid();if(s.maskedPhone!==undefined&&(typeof s.maskedPhone!=='string'||s.maskedPhone.length>80))invalid();for(const k of ['expiresAt','resendAt'])if(s[k]!==undefined&&(typeof s[k]!=='string'||!Number.isFinite(Date.parse(s[k]))||new Date(s[k]).toISOString()!==s[k]))invalid();return s;}
function publicError(code:string){const allowed=new Set(['fresh_login_required','unauthorized','invalid_input','invalid_code','locked','rate_limited','phone_conflict','staff_limit_reached','staff_not_disabled','version_conflict','operation_mismatch','feature_not_enabled','not_ready','delivery_failed','delivery_uncertain','operation_uncertain']);return allowed.has(code)?code:'unavailable';}
export function createMerchantPhoneHandlers(options:Readonly<{
 transport:{command(input:MerchantInternalInput):Promise<MerchantInternalResult>};
 requireActor:()=>Promise<string>;authenticateIngress:(request:Request)=>Readonly<{authenticated:boolean;trustedIp?:string}>;
 clock?:()=>Date;randomBytes?:(size:number)=>Uint8Array;purpose?:'login'|'signup';
 completeSession?:(completion:MerchantCompletion,request:Request)=>Promise<Response>;
}>){
 const clock=options.clock??(()=>new Date()),bytes=options.randomBytes??(size=>new Uint8Array(randomBytes(size))),signup=options.purpose==='signup',prefix=signup?'/api/merchant-signup':'/api/merchant-login';
 const names={browser:`__Host-celebix_merchant_${signup?'signup_':''}browser`,csrf:`__Host-celebix_merchant_${signup?'signup_':''}csrf`,pending:`__Host-celebix_merchant_${signup?'signup_':''}pending`,purpose:`__Host-celebix_merchant_${signup?'signup_':''}purpose`,staffCsrf:'__Host-celebix_merchant_staff_csrf'};
 function createToken(){return token(Buffer.from(bytes(32)).toString('base64url'));}
 async function actor(){try{return await options.requireActor();}catch(e){if(e instanceof MerchantActorUnavailable)throw e;throw new Unauthorized();}}
 async function handle(request:Request,action:'state'|'start'|'resend'|'verify'|'complete',bind=false):Promise<Response>{
  try{
   const publicOrigin=origin(request,action==='complete'&&!signup),url=new URL(request.url),path=action==='complete'?'/auth/merchant-phone/complete':`${prefix}/${bind?'bind/':''}${action}`;
   if(url.pathname!==path||(action==='state'||action==='complete'?request.method!=='GET':request.method!=='POST'))invalid();
   let purchaseHint:ReturnType<typeof merchantPurchaseHintFromSearch>;
   try{purchaseHint=action==='complete'?merchantPurchaseHintFromSearch(url.search):undefined;}catch{invalid();}
   if(bind&&signup)invalid();
   if(action==='complete'&&request.headers.get('sec-fetch-site')==='cross-site')invalid();
   const mutating=action!=='state'&&action!=='complete';
   if(mutating&&(request.headers.get('origin')!==publicOrigin.origin||['cross-site','same-site'].includes(request.headers.get('sec-fetch-site')??'')))invalid();
   const savedBrowser=cookie(request,names.browser),savedCsrf=cookie(request,names.csrf),browser=savedBrowser?token(savedBrowser):createToken(),csrf=savedCsrf?token(savedCsrf):createToken();
   if(action!=='state'&&!savedBrowser)invalid();
   if(mutating&&(!savedCsrf||!same(request.headers.get('x-celebix-merchant-phone-csrf')??'',csrf)))return error('csrf_invalid');
   const savedPurpose=action==='complete'?cookie(request,names.purpose):undefined;
   if(savedPurpose!==undefined&&!['login','bind_phone'].includes(savedPurpose))invalid();
   const purpose=action==='complete'?(savedPurpose==='bind_phone'?'bind_phone':'login'):bind?'bind_phone':signup?'signup':'login';
   if(purchaseHint!==undefined&&purpose!=='login')invalid();
   const credential=purpose==='bind_phone'?await actor():undefined;
   const command:MerchantInternalInput={schemaVersion:1,action,purpose,hostname:publicOrigin.hostname,browserCredential:browser,...(cookie(request,names.pending)?{pendingCookie:cookie(request,names.pending)}:{}),...(credential?{sessionCredential:credential}:{})};
   let input=command;
   if(mutating){const payload=await body(request);exact(payload,action==='start'?['phone','operationId']:action==='verify'?['code','operationId']:['operationId']);const op=payload.operationId;if(typeof op!=='string'||!UUID.test(op)||request.headers.get('idempotency-key')!==op)invalid();const {operationId:_id,...value}=payload;
    if(action==='verify'&&(typeof payload.code!=='string'||!/^[0-9]{6}$/u.test(payload.code)))invalid();
    if(action==='start'&&(typeof payload.phone!=='string'||payload.phone.length>32))invalid();
    const ingress=action==='start'||action==='resend'?options.authenticateIngress(request):undefined;
    if(ingress&&!ingress.authenticated)return error('unavailable',503);
    input={...command,operationId:op,payload:value,...(ingress?{ingressAuthenticated:true,...(ingress.trustedIp?{trustedIp:ingress.trustedIp}:{})}:{})};
   }
   const response=await options.transport.command(input);
   if(!response||response.schemaVersion!==1)invalid();
   if(action==='complete'){
    if(!['complete','phone_bound'].includes(response.code)||!response.completion)return error(publicError(response.code),response.code==='fresh_login_required'?401:503);
    const completion=response.completion;if(completion.purpose!==purpose)invalid();
    let final:Response;
    if(completion.destinationOrigin!==publicOrigin.origin){
     if(!options.completeSession)invalid();final=secure(await options.completeSession(completion,request));
    }else{
     final=secure(new Response(null,{status:303,headers:{location:purpose==='bind_phone'?'/settings/security':merchantPurchaseDestination(purchaseHint),'set-cookie':serializePersistentPanelSessionCookie({credential:completion.sessionCredential,issuedAt:completion.sessionIssuedAt,expiresAt:completion.sessionExpiresAt,now:clock()})}}));
    }
    if(final.status<400){for(const name of [names.pending,names.browser,names.csrf,names.purpose])final.headers.append('set-cookie',clearCookie(name));}return final;
   }
   let output:Response;
   if(action==='verify'&&response.code===(bind?'phone_bound':signup?'phone_verified':'complete'))output=secure(Response.json({code:response.code}));
   else if(response.code==='ok'){
    let state=loginState(response.state);
    if(bind){const self=await options.transport.command({...command,action:'self_state',payload:{}});if(self.code!=='ok'||typeof self.state?.phoneVerified!=='boolean'||(self.state.phoneMasked!==null&&typeof self.state.phoneMasked!=='string'))throw new Unauthorized();state={...state,phoneMasked:self.state.phoneMasked,phoneVerified:self.state.phoneVerified};}
    output=secure(Response.json({code:'ok',state,...(action==='state'?{csrfToken:csrf}:{})}));
   }else{const code=publicError(response.code);output=error(code,code==='fresh_login_required'||code==='unauthorized'?401:code==='rate_limited'?429:code==='unavailable'?503:400);}
   if(action==='state'){if(!savedBrowser)output.headers.append('set-cookie',setCookie(names.browser,browser,600));if(!savedCsrf)output.headers.append('set-cookie',setCookie(names.csrf,csrf,600));}
   if(response.pendingCookie!==undefined){if(!response.pendingExpiresAt)invalid();const remaining=Math.floor((Date.parse(response.pendingExpiresAt)-clock().getTime())/1000);if(remaining>600)invalid();output.headers.append('set-cookie',setCookie(names.pending,response.pendingCookie,remaining));output.headers.append('set-cookie',setCookie(names.purpose,purpose,remaining));output.headers.append('set-cookie',setCookie(names.browser,browser,remaining));output.headers.append('set-cookie',setCookie(names.csrf,csrf,remaining));}
   return output;
  }catch(e){return e instanceof Unauthorized?error('unauthorized',401):e instanceof Error&&e.message==='merchant_request_invalid'?error('request_invalid'):error('unavailable',503);}
 }
 async function staff(request:Request,staffId?:string):Promise<Response>{try{
  const publicOrigin=origin(request),url=new URL(request.url);if(url.pathname!==`/api/merchant-staff${staffId?'/'+staffId:''}`||!['GET','POST'].includes(request.method)||staffId&&!UUID.test(staffId))invalid();
  const sessionCredential=await actor(),savedCsrf=cookie(request,names.staffCsrf),csrf=savedCsrf?token(savedCsrf):createToken();let input:MerchantInternalInput={schemaVersion:1,action:'staff_list',purpose:'login',hostname:publicOrigin.hostname,sessionCredential};
  if(request.method==='POST'){
   if(request.headers.get('origin')!==publicOrigin.origin||!savedCsrf||!same(request.headers.get('x-celebix-merchant-staff-csrf')??'',csrf))return error('csrf_invalid');
   const payload=await body(request);exact(payload,staffId?['action','operationId','expectedVersion']:['phone','displayName','role','operationId','expectedVersion'],staffId?['displayName','role']:['existingMembershipId']);const deleting=!!staffId&&payload.action==='delete';if(deleting)exact(payload,['action','operationId','expectedVersion']);const op=payload.operationId;if(typeof op!=='string'||!UUID.test(op)||request.headers.get('idempotency-key')!==op)invalid();const {operationId:_op,...value}=payload;input={...input,action:deleting?'staff_delete':staffId?'staff_update':'staff_create',operationId:op,payload:deleting?{staffId,expectedVersion:payload.expectedVersion}:{...value,...(staffId?{staffId}:{})}};
  }else if(staffId)invalid();
  const response=await options.transport.command(input);if(response.code!=='ok'||!response.state)return error(publicError(response.code),response.code==='unauthorized'||response.code==='fresh_login_required'?401:response.code==='unavailable'?503:400);
  // Strict view model keeps internal principal and encrypted phone fields out
  // of the browser. The staff list has no authentication credentials.
  const {parseStaffState}=await import('../merchant-staff-ui/model.ts');
  // Phone-only staff have no membership until their first verified login.
  // Represent that native null as the public DTO's absent optional field.
  const raw=response.state;const state=parseStaffState({...raw,staff:Array.isArray(raw.staff)?raw.staff.map(item=>{const {principalId:_principal,membershipId,...safe}=item as Record<string,unknown>;return membershipId===null||membershipId===undefined?safe:{...safe,membershipId};}):raw.staff});
  const output=secure(Response.json({code:'ok',state,...(request.method==='GET'?{csrfToken:csrf}:{})}));if(request.method==='GET'&&!savedCsrf)output.headers.append('set-cookie',setCookie(names.staffCsrf,csrf,28800));return output;
 }catch(e){return e instanceof Unauthorized?error('unauthorized',401):e instanceof Error&&e.message==='merchant_request_invalid'?error('request_invalid'):error('unavailable',503);}}
 return Object.freeze({state:(r:Request)=>handle(r,'state'),start:(r:Request)=>handle(r,'start'),resend:(r:Request)=>handle(r,'resend'),verify:(r:Request)=>handle(r,'verify'),complete:(r:Request)=>handle(r,'complete'),bindState:(r:Request)=>handle(r,'state',true),bindStart:(r:Request)=>handle(r,'start',true),bindResend:(r:Request)=>handle(r,'resend',true),bindVerify:(r:Request)=>handle(r,'verify',true),staff});
}
