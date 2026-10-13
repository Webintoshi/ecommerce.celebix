import type {createMerchantWhatsAppCodec} from './codec.ts';
import {isMerchantInternalListener} from '../../../customer-panel/lib/merchant-phone/handler.ts';
type Row=Readonly<Record<string,unknown>>;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
class Invalid extends Error{}
function invalid():never{throw new Invalid();}
function response(code:string,status:number,fields:Row={}){return Response.json({code,...fields},{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});}
export function createMerchantPhoneEnrollmentHandler(options:Readonly<{
 allowedOrigin:string;requireOperator:(request:Request)=>Promise<Readonly<{operatorId:string;totpVerified:boolean}>>;
 phoneIdentity:ReturnType<typeof createMerchantWhatsAppCodec>['phoneIdentity'];
 enroll:(input:Row)=>Promise<Readonly<{outcome:string;authority:Row|null}>>;
}>){
 const owner=new URL(options.allowedOrigin);if(owner.protocol!=='https:'||owner.origin!==options.allowedOrigin||owner.port)throw Error('merchant_enrollment_unavailable');
 return async(request:Request):Promise<Response>=>{
  try{
   const url=new URL(request.url);
   if(request.method!=='POST'||url.pathname!=='/api/security/merchant-phone/enroll'||url.search||url.hash)return response('invalid_input',400);
   if(!['http:','https:'].includes(url.protocol)||url.username||url.password||(url.protocol==='https:'&&!isMerchantInternalListener(url)&&url.origin!==owner.origin))return response('unauthorized',403);
   if(request.headers.get('host')!==owner.hostname||request.headers.get('origin')!==owner.origin||request.headers.get('x-celebix-csrf')!=='merchant-phone-enroll-v1'||['cross-site','same-site'].includes(request.headers.get('sec-fetch-site')??''))return response('unauthorized',403);
   let operator:Readonly<{operatorId:string;totpVerified:boolean}>;try{operator=await options.requireOperator(request);}catch{return response('unauthorized',401);}
   if(operator.totpVerified!==true||!UUID.test(operator.operatorId))return response('unauthorized',401);
   if(request.headers.get('content-type')!=='application/json'||!request.body)invalid();
   const declared=request.headers.get('content-length');if(declared!==null&&(!/^\d+$/u.test(declared)||Number(declared)>4096))invalid();
   const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
   try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>4096){await reader.cancel();invalid();}chunks.push(next.value);}}finally{reader.releaseLock();}
   const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as Record<string,unknown>;
   if(!input||Array.isArray(input)||Object.keys(input).sort().join(',')!=='operationId,phone,principalId,reason'||typeof input.principalId!=='string'||!UUID.test(input.principalId)||typeof input.operationId!=='string'||!UUID.test(input.operationId)||request.headers.get('idempotency-key')!==input.operationId||typeof input.reason!=='string'||typeof input.phone!=='string'||input.phone.length>32)invalid();
   const reason=input.reason.trim();if(reason.length<20||reason.length>500||/[\u0000-\u001f\u007f]/u.test(reason))invalid();
   let phone:ReturnType<ReturnType<typeof createMerchantWhatsAppCodec>['phoneIdentity']>;try{phone=options.phoneIdentity(input.phone);}catch{return response('invalid_phone',400);}
   const {phone:_raw,recipientBudgetDigest:_budget,...encrypted}=phone;
   const result=await options.enroll({operatorId:operator.operatorId,operationId:input.operationId,principalId:input.principalId,reason,...encrypted});
   if(['prepared','already_verified','operation_replayed'].includes(result.outcome)&&result.authority){
    const authority=result.authority;if(authority.principalId!==input.principalId||authority.operationId!==input.operationId||typeof authority.phoneMasked!=='string'||authority.phoneMasked.length>80||typeof authority.phoneVerified!=='boolean')throw Error('merchant_enrollment_unavailable');
    return response('ok',200,{phoneMasked:authority.phoneMasked,phoneVerified:authority.phoneVerified});
   }
   if(result.outcome==='phone_conflict')return response('phone_conflict',409);
   if(result.outcome==='operation_mismatch')return response('operation_mismatch',409);
   if(result.outcome==='membership_denied')return response('unauthorized',403);
   return response('unavailable',503);
  }catch(error){return response(error instanceof Invalid?'invalid_input':'unavailable',error instanceof Invalid?400:503);}
 };
}
