import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import type {MerchantInternalInput,MerchantInternalResult} from './service.ts';
const PATH='/api/internal/merchant-whatsapp',DOMAIN='celebix/merchant-whatsapp/internal/v1';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
function invalid():never{throw Error('merchant_internal_unavailable');}
function origin(value:string){const u=new URL(value);if(u.protocol!=='https:'||u.origin!==value||u.port||u.username||u.password)invalid();return value;}
function keyBytes(key:Uint8Array){if(!(key instanceof Uint8Array)||key.length!==32)invalid();return Buffer.from(key);}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const mac=(key:Uint8Array,value:string)=>createHmac('sha256',key).update(value).digest('hex');
function same(actual:string|null,expected:string){return !!actual&&/^[a-f0-9]{64}$/u.test(actual)&&timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex'));}
function input(value:unknown):MerchantInternalInput{
 if(!value||typeof value!=='object'||Array.isArray(value))invalid();const r=value as Record<string,unknown>;
 if(r.schemaVersion!==1||!['state','start','resend','verify','complete','self_state','staff_list','staff_create','staff_update','staff_delete'].includes(String(r.action))||!['login','bind_phone','signup'].includes(String(r.purpose))||Object.keys(r).some(k=>!['schemaVersion','action','purpose','hostname','browserCredential','pendingCookie','sessionCredential','operationId','ingressAuthenticated','trustedIp','payload'].includes(k)))invalid();
 if(typeof r.hostname!=='string'||r.hostname.length>253||!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(r.hostname))invalid();
 for(const k of ['pendingCookie','browserCredential','sessionCredential']as const)if(r[k]!==undefined&&(typeof r[k]!=='string'||(r[k]as string).length>4096||/[\s;\u0000-\u001f]/u.test(r[k]as string)))invalid();
 if(r.browserCredential!==undefined&&(typeof r.browserCredential!=='string'||!/^[A-Za-z0-9_-]{43}$/u.test(r.browserCredential)||Buffer.from(r.browserCredential,'base64url').toString('base64url')!==r.browserCredential))invalid();
 if(r.operationId!==undefined&&(typeof r.operationId!=='string'||!UUID.test(r.operationId)))invalid();
 if(r.trustedIp!==undefined&&(typeof r.trustedIp!=='string'||!isIP(r.trustedIp)))invalid();
 if(r.ingressAuthenticated!==undefined&&typeof r.ingressAuthenticated!=='boolean')invalid();
 if(r.payload!==undefined&&(!r.payload||typeof r.payload!=='object'||Array.isArray(r.payload)))invalid();
 return Object.freeze(r)as MerchantInternalInput;
}
async function read(response:Request|Response,limit:number){const reader=response.body?.getReader();if(!reader)return '';let size=0;const chunks:Uint8Array[]=[];try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>limit){await reader.cancel();invalid();}chunks.push(next.value);}return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));}finally{reader.releaseLock();}}
function transcript(ownerOrigin:string,time:string,nonce:string,body:string){return [DOMAIN,ownerOrigin,PATH,time,nonce,hash(body)].join('\n');}
export function createMerchantInternalTransport(options:{ownerOrigin:string;keyId:string;secret:Uint8Array;clock?:()=>Date;fetch?:typeof fetch}){
 const base=origin(options.ownerOrigin),key=keyBytes(options.secret),clock=options.clock??(()=>new Date()),send=options.fetch??fetch;if(!/^[A-Za-z0-9._-]{1,64}$/u.test(options.keyId))invalid();
 return Object.freeze({async command(command:MerchantInternalInput):Promise<MerchantInternalResult>{
  const body=JSON.stringify(input(command)),time=clock().toISOString(),nonce=randomUUID(),proof=transcript(base,time,nonce,body),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{const response=await send(new Request(base+PATH,{method:'POST',redirect:'error',signal:controller.signal,headers:{'content-type':'application/json','x-celebix-merchant-key-id':options.keyId,'x-celebix-merchant-time':time,'x-celebix-merchant-nonce':nonce,'x-celebix-merchant-signature':mac(key,proof)},body}));const raw=await read(response,65536);
   if(response.status!==200||!same(response.headers.get('x-celebix-merchant-response-signature'),mac(key,[DOMAIN+'/response',hash(proof),response.status,hash(raw)].join('\n'))))invalid();
   const value=JSON.parse(raw);if(!value||value.schemaVersion!==1||typeof value.code!=='string'||Object.keys(value).some(k=>!['schemaVersion','code','state','pendingCookie','pendingExpiresAt','completion','retryAfterSeconds'].includes(k)))invalid();return Object.freeze(value);
  }catch{return invalid();}finally{clearTimeout(timer);}
 }});
}
export function createMerchantInternalGateway(options:{ownerOrigin:string;keys:ReadonlyMap<string,Uint8Array>;clock?:()=>Date;handle:(input:MerchantInternalInput)=>Promise<MerchantInternalResult>}){
 const base=origin(options.ownerOrigin),keys=new Map([...options.keys].map(([id,key])=>[id,keyBytes(key)])),clock=options.clock??(()=>new Date());
 return async(request:Request):Promise<Response>=>{try{
  const url=new URL(request.url);if(request.method!=='POST'||url.pathname!==PATH||url.search||url.hash||!/^application\/json(?:;\s*charset=utf-8)?$/iu.test(request.headers.get('content-type')??''))invalid();
  const key=keys.get(request.headers.get('x-celebix-merchant-key-id')??''),time=request.headers.get('x-celebix-merchant-time')??'',nonce=request.headers.get('x-celebix-merchant-nonce')??'';
  if(!key||!UUID.test(nonce)||!Number.isFinite(Date.parse(time))||new Date(time).toISOString()!==time||Math.abs(clock().getTime()-Date.parse(time))>45000)invalid();
  const raw=await read(request,16384),proof=transcript(base,time,nonce,raw);if(!same(request.headers.get('x-celebix-merchant-signature'),mac(key,proof)))invalid();const parsed=JSON.parse(raw);if(JSON.stringify(parsed)!==raw)invalid();
  const output=await options.handle(input(parsed)),body=JSON.stringify(output),status=200;return new Response(body,{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','x-celebix-merchant-response-signature':mac(key,[DOMAIN+'/response',hash(proof),status,hash(body)].join('\n'))}});
 }catch{return Response.json({code:'merchant_internal_unavailable'},{status:503,headers:{'cache-control':'no-store'}});}};
}
