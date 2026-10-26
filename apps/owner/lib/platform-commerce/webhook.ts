import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN=/^[A-Za-z0-9_-]{36,256}$/;
const SIGNATURE=/^[0-9a-f]{64}$/;
const SURROGATE=/(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/;
const MAX_BODY_BYTES=65_536;

/** A verified notification selects an attempt to retrieve; it never proves payment. */
export type PlatformIyzicoHppWebhook=Readonly<{
 attemptId:string;
 token:string;
 paymentId:string;
 eventType:'CHECKOUT_FORM_AUTH';
 status:'SUCCESS'|'FAILURE';
 /** Optional unsigned metadata. Do not use this field as a proof or sole dedupe key. */
 eventReference:string|null;
}>;
export type PlatformIyzicoHppWebhookInput=Readonly<{body:Uint8Array;signature:string|null;secretKey:string}>;

function paymentId(value:unknown):string{
 if(typeof value==='number'){
  if(!Number.isSafeInteger(value)||value<=0)throw Error();
  return String(value);
 }
 if(typeof value!=='string'||!/^[1-9][0-9]{0,18}$/.test(value)||BigInt(value)>9223372036854775807n)throw Error();
 return value;
}
function duplicateJsonKeys(raw:string):boolean{
 const stack:Array<{keys:Set<string>;expectingKey:boolean}|null>=[];
 for(const match of raw.matchAll(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]/g)){
  const value=match[0],current=stack.at(-1);
  if(value==='{')stack.push({keys:new Set(),expectingKey:true});
  else if(value==='[')stack.push(null);
  else if(value==='}'||value===']')stack.pop();
  else if(value===','&&current)current.expectingKey=true;
  else if(value.startsWith('"')&&current?.expectingKey){const key=JSON.parse(value)as string;if(current.keys.has(key))return true;current.keys.add(key);current.expectingKey=false;}
 }
 return false;
}

// Official HPP V3 algorithm: https://docs.iyzico.com/en/advanced/webhook
export function verifyPlatformIyzicoHppWebhook(input:PlatformIyzicoHppWebhookInput):PlatformIyzicoHppWebhook|null{
 let secret:Buffer|undefined;
 try{
  if(!(input.body instanceof Uint8Array)||input.body.byteLength<2||input.body.byteLength>MAX_BODY_BYTES
   ||typeof input.signature!=='string'||!SIGNATURE.test(input.signature)
   ||typeof input.secretKey!=='string'||/[\s\u0000-\u001f\u007f-\u009f]/.test(input.secretKey)||SURROGATE.test(input.secretKey))return null;
  secret=Buffer.from(input.secretKey,'utf8');if(secret.byteLength<1||secret.byteLength>256)return null;
  const text=new TextDecoder('utf-8',{fatal:true}).decode(input.body);
  const parsed=JSON.parse(text)as unknown;
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||duplicateJsonKeys(text))return null;
  const raw=parsed as Record<string,unknown>;
  if(Object.keys(raw).length>64||raw.iyziEventType!=='CHECKOUT_FORM_AUTH'||(raw.status!=='SUCCESS'&&raw.status!=='FAILURE')
   ||typeof raw.paymentConversationId!=='string'||!UUID.test(raw.paymentConversationId)
   ||typeof raw.token!=='string'||!TOKEN.test(raw.token))return null;
  const normalizedPaymentId=paymentId(raw.iyziPaymentId);
  if(raw.paymentId!==undefined&&paymentId(raw.paymentId)!==normalizedPaymentId)return null;
  // HPP differs from response signatures: concatenate these fields without separators.
  const expected=createHmac('sha256',secret).update(secret).update(raw.iyziEventType,'utf8')
   .update(normalizedPaymentId,'utf8').update(raw.token,'utf8')
   .update(raw.paymentConversationId,'utf8').update(raw.status,'utf8').digest();
  if(!timingSafeEqual(Buffer.from(input.signature,'hex'),expected))return null;
  const eventReference=typeof raw.iyziReferenceCode==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(raw.iyziReferenceCode)?raw.iyziReferenceCode:null;
  return Object.freeze({attemptId:raw.paymentConversationId,token:raw.token,paymentId:normalizedPaymentId,eventType:'CHECKOUT_FORM_AUTH',status:raw.status,eventReference});
 }catch{return null;}
 finally{secret?.fill(0);}
}
