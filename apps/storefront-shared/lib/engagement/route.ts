import { parseStoreEngagementCaptureRequest, StoreEngagementContractError } from '@celebix/saas-contracts';
import { StoreEngagementRepositoryError } from '@celebix/saas-data';
import type { TrustedStorefrontHostAuthority } from '../trusted-host-authority.ts';
import { StoreEngagementRuntimeError, type StoreEngagementRuntime } from './runtime.ts';
type Dependencies=Readonly<{selectAuthority(headers:Headers):TrustedStorefrontHostAuthority;resolveRuntime():Promise<StoreEngagementRuntime|null>;allowCapture?(hostname:string,headers:Headers):boolean}>;
function json(value:unknown,status=200){return Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});}
function failure(error:unknown){if(error instanceof StoreEngagementContractError||error instanceof StoreEngagementRuntimeError)return json({code:'invalid_input'},400);if(error instanceof StoreEngagementRepositoryError){const code=error.code;const status=code==='invalid_input'?400:code==='not_found'?404:code==='rate_limited'?429:['contact_conflict','campaign_unavailable','cart_unavailable','promotion_unavailable','invalid_reference','limit_exceeded','operation_mismatch','version_conflict'].includes(code)?409:503;return json({code:status===503?'unavailable':code},status);}return json({code:'unavailable'},503);}
async function runtime(deps:Dependencies){try{return await deps.resolveRuntime();}catch{return null;}}
function authorize(deps:Dependencies,request:Request,path:string,method:'GET'|'POST'):string|Response {
 let selected;try{selected=deps.selectAuthority(request.headers);}catch{return json({code:'unavailable'},503);}if(selected.kind!=='trusted')return json({code:'unavailable'},503);
 const url=new URL(request.url);if(request.method!==method||!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!==path||url.search||url.hash)return json({code:'invalid_input'},400);
 if(method==='POST'&&request.headers.get('origin')!==`https://${selected.hostname}`)return json({code:'origin_denied'},403);
 for(const name of request.headers.keys())if(name==='authorization'||['x-store-id','x-tenant-id','x-principal-id','x-customer-id'].includes(name)||name.startsWith('x-celebix-')&&name!=='x-celebix-storefront-proxy')return json({code:'invalid_input'},400);
 return selected.hostname;
}
async function readBody(request:Request):Promise<unknown>{
 if(request.headers.get('content-type')!=='application/json'||request.headers.has('transfer-encoding')||!request.body)throw new StoreEngagementRuntimeError();
 const declared=request.headers.get('content-length');if(declared!==null&&(!/^(?:0|[1-9]\d*)$/u.test(declared)||Number(declared)>2048))throw new StoreEngagementRuntimeError();
 const reader=request.body.getReader();let total=0;const chunks:Uint8Array[]=[];
 try{for(;;){const next=await reader.read();if(next.done)break;total+=next.value.byteLength;if(total>2048){await reader.cancel();throw new StoreEngagementRuntimeError();}chunks.push(next.value);}const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new StoreEngagementRuntimeError();}
}
export function createStoreEngagementRoutes(deps:Dependencies){return Object.freeze({
 async settings(request:Request){const hostname=authorize(deps,request,'/api/store-engagement','GET');if(hostname instanceof Response)return hostname;const selected=await runtime(deps);if(!selected)return json({code:'unavailable'},503);try{return json(await selected.publicSettings(hostname));}catch(error){return failure(error);}},
 async capture(request:Request){const hostname=authorize(deps,request,'/api/cart/contact','POST');if(hostname instanceof Response)return hostname;let input;try{input=parseStoreEngagementCaptureRequest(await readBody(request));const key=request.headers.get('idempotency-key');if(key!==null&&key!==input.operationId)throw new StoreEngagementRuntimeError();}catch(error){return failure(error);}if(deps.allowCapture&&!deps.allowCapture(hostname,request.headers))return json({code:'rate_limited'},429);const selected=await runtime(deps);if(!selected)return json({code:'unavailable'},503);try{return json(await selected.capture(hostname,request.headers.get('cookie'),input));}catch(error){return failure(error);}},
});}
