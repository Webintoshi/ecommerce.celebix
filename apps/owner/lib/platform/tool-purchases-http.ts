import type {PlatformOperatorContext} from '@celebix/saas-contracts';
import {BodyTooLarge,readBoundedBody} from './body.ts';

export interface ToolPurchaseSettlement {
 action:'tool.purchase.settle';expectedVersion:number;idempotencyKey:string;
 payload:{purchaseId:string;storeId:string;amountCents:number;method:'bank_transfer'|'cash'|'card';reference:string;reason:string};
}
export interface ToolPurchasesHttpDependencies {
 allowedOrigin:string;
 resolveOperator():Promise<{kind:string;operator?:PlatformOperatorContext}>;
 read(operator:PlatformOperatorContext,query:Record<string,unknown>):Promise<unknown>;
 settle(operator:PlatformOperatorContext,input:ToolPurchaseSettlement):Promise<unknown>;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const headers={'Cache-Control':'no-store'};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers});
function invalid():never{throw Object.assign(Error('invalid_input'),{code:'invalid_input'});}
function exact(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(key=>!keys.includes(key)))invalid();
 return value as Record<string,unknown>;
}
function text(value:unknown,max:number):string{if(typeof value!=='string'||!value||value.length>max||value!==value.trim()||/[\x00-\x1f\x7f]/.test(value))invalid();return value;}
function parseSettlement(value:unknown,key:string|null):ToolPurchaseSettlement {
 const row=exact(value,['action','expectedVersion','payload']);
 if(row.action!=='tool.purchase.settle'||!Number.isSafeInteger(row.expectedVersion)||(row.expectedVersion as number)<1)invalid();
 const payload=exact(row.payload,['purchaseId','storeId','amountCents','method','reference','reason']);
 if(typeof payload.purchaseId!=='string'||!uuid.test(payload.purchaseId)||typeof payload.storeId!=='string'||!uuid.test(payload.storeId)||!Number.isSafeInteger(payload.amountCents)||(payload.amountCents as number)<1||!['bank_transfer','cash','card'].includes(payload.method as string))invalid();
 return{action:'tool.purchase.settle',expectedVersion:row.expectedVersion as number,idempotencyKey:text(key,128),payload:{purchaseId:payload.purchaseId,storeId:payload.storeId,amountCents:payload.amountCents as number,method:payload.method as ToolPurchaseSettlement['payload']['method'],reference:text(payload.reference,200),reason:text(payload.reason,500)}};
}
function failure(cause:unknown):Response {
 if(cause instanceof BodyTooLarge)return json({code:'invalid_input',error:'İşlem içeriği çok büyük.'},413);
 const code=(cause as {code?:unknown})?.code;
 if(code==='invalid_input')return json({code,error:'Tahsilat bilgilerini kontrol edin.'},400);
 if(code==='operator_denied')return json({code,error:'Doğrulanmış platform sahibi girişi gerekli.'},403);
 if(code==='record_not_found')return json({code,error:'Satın alma talebi bulunamadı.'},404);
 if(code==='version_conflict'||code==='operation_mismatch'||code==='already_settled')return json({code,error:'Satın alma kaydı değişti. Güncel kaydı kontrol edin; tahsilat bilgileri korunuyor.'},409);
 if(code==='amount_mismatch')return json({code,error:'Tahsilat, talepteki KDV dahil tutarla tam olarak eşleşmelidir.'},422);
 if(code==='receipt_used')return json({code,error:'Bu tahsilat referansı başka bir satın almada kullanılmış. Gerçek ödeme kaydını kontrol edin.'},422);
 if(code==='store_inactive')return json({code,error:'Mağaza etkin olmadığı için araç satın alması tamamlanamadı.'},422);
 if(code==='already_owned')return json({code,error:'Talepteki araçlardan biri mağazada zaten açık. Yeni tahsilat kaydetmeden mevcut hakları kontrol edin.'},422);
 return json({code:code==='commit_unknown'?'commit_unknown':'unavailable',error:'Sonuç doğrulanamadı. Aynı işlem anahtarıyla yeniden deneyin; tahsilat bilgileri korunuyor.'},503);
}
export async function handleToolPurchasesHttp(request:Request,deps:ToolPurchasesHttpDependencies):Promise<Response>{
 try{
  const auth=await deps.resolveOperator();
  if(auth.kind!=='authorized'||!auth.operator)return json({code:auth.kind,error:auth.kind==='mfa_required'?'İki aşamalı doğrulama gerekli.':auth.kind==='unavailable'?'Platform bağlantısı kullanılamıyor.':'Doğrulanmış platform sahibi girişi gerekli.'},auth.kind==='unavailable'?503:auth.kind==='unauthenticated'?401:403);
  if(request.method==='GET'){
   const query:Record<string,unknown>={};
   for(const[key,value]of new URL(request.url).searchParams){if(Object.hasOwn(query,key)||!['storeId','status'].includes(key)||key==='storeId'&&!uuid.test(value)||key==='status'&&!['pending','settled'].includes(value))invalid();query[key]=value;}
   return json(await deps.read(auth.operator,query));
  }
  if(request.method!=='POST')return json({error:'İşlem desteklenmiyor.'},405);
  if(request.headers.get('origin')!==deps.allowedOrigin)return json({error:'İstek doğrulanamadı.'},403);
  const raw=new TextDecoder().decode(await readBoundedBody(request,8192));let body:unknown;
  try{body=JSON.parse(raw);}catch{invalid();}
  return json(await deps.settle(auth.operator,parseSettlement(body,request.headers.get('idempotency-key'))));
 }catch(cause){return failure(cause);}
}
