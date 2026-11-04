import {timingSafeEqual} from 'node:crypto';
import {loyaltyExact,loyaltyUuid,parseLoyaltyCustomerPayload,parseLoyaltyCustomerResult,type LoyaltyCustomerAction} from '@celebix/saas-contracts';
import type {TrustedStorefrontHostAuthority} from '../trusted-host-authority.ts';
import {readAccountJsonRequest} from './request.ts';
import type {AccountLoyaltyRuntime} from './loyalty-runtime.ts';

type Dependencies=Readonly<{selectAuthority(headers:Headers):TrustedStorefrontHostAuthority;resolveRuntime():Promise<AccountLoyaltyRuntime|null>}>;
function json(value:unknown,status=200){return Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});}
function csrf(request:Request){
 const provided=request.headers.get('x-celebix-account-csrf');if(!provided||!/^[A-Za-z0-9_-]{43}$/u.test(provided))return false;
 const values=(request.headers.get('cookie')??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith('__Host-celebix_account_csrf=')).map(x=>x.slice('__Host-celebix_account_csrf='.length));
 return values.length===1&&values[0]!.length===provided.length&&timingSafeEqual(Buffer.from(values[0]!),Buffer.from(provided));
}
export function createAccountLoyaltyRoutes(deps:Dependencies){
 async function run(request:Request,method:'GET'|'POST'){
  try{
   const host=deps.selectAuthority(request.headers);if(host.kind!=='trusted')return json({code:'unavailable',message:'Mağaza doğrulanamadı.'},503);
   const url=new URL(request.url),origin=`https://${host.hostname}`;
   if(request.method!==method||url.pathname!=='/api/account/loyalty'||url.search||url.hash||url.username||url.password)throw new TypeError('invalid_input');
   if(request.headers.has('authorization')||['x-store-id','x-tenant-id','x-principal-id'].some(k=>request.headers.has(k)))throw new TypeError('invalid_input');
   const site=request.headers.get('sec-fetch-site');if(site!==null&&site!=='same-origin')throw new TypeError('invalid_input');
   let action:LoyaltyCustomerAction='list',operationId:string|undefined,payload={};
   if(method==='POST'){
    const input=await readAccountJsonRequest(request,origin,value=>loyaltyExact(value,['action','operationId','payload']));
    if(!csrf(request))return json({code:'csrf_invalid',message:'Güvenlik doğrulaması başarısız. Sayfayı yenileyin.'},403);
    if(input.action!=='prepare-reward'&&input.action!=='approve-pos')throw new TypeError('invalid_input');
    action=input.action;operationId=loyaltyUuid(input.operationId);payload=parseLoyaltyCustomerPayload(action,input.payload);
   }else if(request.headers.get('origin')!==null&&request.headers.get('origin')!==origin)throw new TypeError('invalid_input');
   const runtime=await deps.resolveRuntime();if(!runtime)return json({code:'unavailable',message:'Sadakat bilgileri şu anda yüklenemiyor.'},503);
   const result=await runtime.command({hostname:host.hostname,cookieHeader:request.headers.get('cookie'),action,payload,...(operationId?{operationId}:{})});
   return json(parseLoyaltyCustomerResult(action,result));
  }catch(error){
   const raw=error&&typeof error==='object'&&'code'in error?String(error.code):error instanceof TypeError?'invalid_input':'unavailable';
   const code=['unauthenticated','invalid_input','not_found','reward_unavailable','operation_mismatch','membership_denied','stock_unavailable'].includes(raw)?raw:'unavailable';
   const status=code==='unauthenticated'?401:code==='invalid_input'?400:code==='membership_denied'?403:code==='not_found'?404:['reward_unavailable','operation_mismatch','stock_unavailable'].includes(code)?409:503;
   const message=code==='unauthenticated'?'Sadakat hesabınız için yeniden giriş yapın.':code==='stock_unavailable'?'Hediye şu anda stokta yok. Ödül hakkınız korunuyor.':code==='reward_unavailable'?'Ödül bu sepette kullanılamıyor. Koşullarını ve açık ödeme işlemlerinizi kontrol edin.':code==='invalid_input'?'İşlem bilgilerini kontrol edin.':'İşlem tamamlanamadı. Ödül hakkınız korunuyor; tekrar deneyebilirsiniz.';
   return json({code,message},status);
  }
 }
 return Object.freeze({GET:(r:Request)=>run(r,'GET'),POST:(r:Request)=>run(r,'POST')});
}
