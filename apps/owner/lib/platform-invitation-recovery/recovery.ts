import type {PlatformOperatorContext} from '../../../../packages/saas-contracts/src/platform/types.ts';
import {BodyTooLarge,readBoundedBody} from '../platform/body.ts';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const TOKEN=/^[a-f0-9-]{72}$/;
const ROLES=['store_owner','admin','editor','analyst','cashier'];
export type InvitationRecoveryInput=Readonly<{storeId:string;invitationId:string;operationId:string;expectedVersion:number;includeTargetPrincipal:boolean}>;
export type InvitationRecoveryResult=Readonly<{code:'ok';invitationId:string;url:string}>;
type Client={query(sql:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[]}>};
type Transaction=<T>(write:false,run:(client:Client)=>Promise<T>)=>Promise<T>;
class RecoveryDenied extends Error {constructor(){super('invitation_recovery_denied');}}
function requireValue(value:unknown):asserts value {if(!value)throw new RecoveryDenied();}
function record(value:unknown):Record<string,unknown>{requireValue(value&&typeof value==='object'&&!Array.isArray(value));return value as Record<string,unknown>;}
function input(value:unknown):InvitationRecoveryInput {
 const row=record(value);requireValue(Object.keys(row).sort().join(',')==='expectedVersion,includeTargetPrincipal,invitationId,operationId,storeId');
 for(const key of ['storeId','invitationId','operationId'])requireValue(typeof row[key]==='string'&&UUID.test(row[key]));
 requireValue(Number.isSafeInteger(row.expectedVersion)&&Number(row.expectedVersion)>=0&&Number(row.expectedVersion)<Number.MAX_SAFE_INTEGER&&typeof row.includeTargetPrincipal==='boolean');
 return row as InvitationRecoveryInput;
}
function secureHost(value:unknown):string {
 requireValue(typeof value==='string'&&value.length<=253&&value.includes('.')&&/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value));
 const url=new URL(`https://${value}`);requireValue(url.hostname===value&&url.origin===`https://${value}`&&!url.port);return value;
}
function timestamp(value:unknown):number {requireValue(typeof value==='string');const time=Date.parse(value);requireValue(Number.isFinite(time));return time;}
function one(rows:Record<string,unknown>[]):Record<string,unknown>{requireValue(rows.length===1);return record(rows[0].value);}

export function createInvitationRecoveryRepository(options:Readonly<{issuer:string;transaction:Transaction}>) {
 const issuer=new URL(options.issuer);requireValue(issuer.protocol==='https:'&&!issuer.username&&!issuer.password&&!issuer.search&&!issuer.hash);
 return Object.freeze({async recover(operator:PlatformOperatorContext,value:InvitationRecoveryInput,now:Date):Promise<InvitationRecoveryResult>{
  requireValue(operator.assuranceLevel==='aal2'&&UUID.test(operator.operatorId)&&now instanceof Date&&Number.isFinite(now.getTime()));
  const request=input(value);
  // The existing create RPC's prior-result branch is read-only. An absent prior
  // reaches INSERT, which PostgreSQL refuses in this transaction. Never use a
  // writable transaction or fall back to a new operation key/version here.
  return options.transaction(false,async client=>{
   const detail=one((await client.query('SELECT saas.platform_read($1::uuid,$2::text,$3::jsonb) AS value',[operator.operatorId,'store-detail',JSON.stringify({storeId:request.storeId})])).rows);
   const store=record(detail.store);requireValue(store.id===request.storeId&&store.status==='active'&&Number.isSafeInteger(store.version)&&request.expectedVersion<Number(store.version));
   const invitations=one((await client.query('SELECT saas.platform_invitation_read($1::uuid,$2::jsonb,$3::text) AS value',[operator.operatorId,JSON.stringify({storeId:request.storeId}),options.issuer])).rows);
   requireValue(Array.isArray(invitations.items));const rows=invitations.items.map(record).filter(row=>row.id===request.invitationId);requireValue(rows.length===1);const invitation=rows[0];
   requireValue(invitation.storeId===request.storeId&&invitation.kind==='invite'&&ROLES.includes(String(invitation.role))&&invitation.acceptedAt===null&&timestamp(invitation.expiresAt)>now.getTime());
   requireValue(typeof invitation.recipientEmail==='string'&&invitation.recipientEmail===invitation.recipientEmail.trim().toLowerCase()&&invitation.recipientEmail.length<=320&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitation.recipientEmail));
   requireValue(typeof invitation.targetPrincipalId==='string'&&UUID.test(invitation.targetPrincipalId));
   const host=secureHost(invitation.adminHost);requireValue(Array.isArray(store.adminDomains)&&store.adminDomains.map(record).some(domain=>domain.hostname===host&&domain.status==='active'&&domain.verifiedAt!==null&&timestamp(domain.verifiedAt)<=now.getTime()));
   const payload={storeId:request.storeId,targetEmail:invitation.recipientEmail,...(request.includeTargetPrincipal?{targetPrincipalId:invitation.targetPrincipalId}:{}),role:invitation.role,kind:'invite'};
   const replay=one((await client.query('SELECT saas.platform_invitation_create($1::uuid,$2::jsonb,$3::bigint,$4::text,$5::text) AS value',[operator.operatorId,JSON.stringify(payload),request.expectedVersion,request.operationId,options.issuer])).rows);
   requireValue(replay.outcome==='replayed'&&Number.isSafeInteger(replay.version));const result=record(replay.result);
   requireValue(result.invitationId===request.invitationId&&result.adminHost===host&&result.recipientEmail===invitation.recipientEmail&&typeof result.acceptanceToken==='string'&&TOKEN.test(result.acceptanceToken));
   return Object.freeze({code:'ok',invitationId:request.invitationId,url:`https://${host}/invitations/${result.acceptanceToken}`});
  });
 }});
}

type HandlerOptions=Readonly<{origin(request:Request):string|null;resolveOperator():Promise<{kind:string;operator?:PlatformOperatorContext}>;recover(operator:PlatformOperatorContext,input:InvitationRecoveryInput,now:Date):Promise<InvitationRecoveryResult>;now():Date}>;
function response(value:unknown,status:number){return Response.json(value,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});}
export function createInvitationRecoveryHandler(options:HandlerOptions) {
 return async(request:Request):Promise<Response>=>{
  try {
   const auth=await options.resolveOperator();
   if(auth.kind!=='authorized'||!auth.operator||auth.operator.assuranceLevel!=='aal2')return response({code:auth.kind==='unauthenticated'?'unauthenticated':'operator_denied',message:'Doğrulanmış Owner hesabı ve iki aşamalı doğrulama gerekli.'},auth.kind==='unauthenticated'?401:auth.kind==='unavailable'?503:403);
   if(request.method!=='POST')return response({code:'method_not_allowed'},405);
   const origin=options.origin(request),url=new URL(request.url);
   // Next's standalone server uses its internal hostname in request.url behind
   // the proxy. Trust only the configured public origin, never that internal URL.
   if(!origin||request.headers.get('origin')!==origin)return response({code:'origin_denied'},403);
   requireValue(url.pathname==='/api/platform/invitations/recover'&&!url.search&&!url.hash&&request.headers.get('content-type')?.split(';')[0].trim()==='application/json');
   const bytes=await readBoundedBody(request,2048);const parsed=input(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
   const now=options.now();requireValue(now instanceof Date&&Number.isFinite(now.getTime()));
   return response(await options.recover(auth.operator,parsed,new Date(now)),200);
  }catch(error){
   const code=error&&typeof error==='object'?'code' in error?String(error.code):'': '';
   if(code==='25006')return response({code:'invitation_recovery_not_found',message:'Bu hesap ve özgün işlem bilgileriyle davet bağlantısı bulunamadı.'},404);
   if(error instanceof BodyTooLarge)return response({code:'invalid_input',message:'İstek boyutu geçersiz.'},413);
   if(error instanceof RecoveryDenied||error instanceof SyntaxError||error instanceof TypeError)return response({code:'invitation_recovery_denied',message:'Davet ve özgün işlem bilgilerini kontrol edin. Yeni davet oluşturulmadı.'},400);
   return response({code:'invitation_recovery_unavailable',message:'Bağlantı alınamadı. Özgün işlem bilgilerini değiştirmeden yeniden deneyebilirsiniz.'},503);
  }
 };
}
