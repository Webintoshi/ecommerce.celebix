import {isMerchantActionAllowed,parseGoogleMerchantAttributes} from '@celebix/saas-contracts';
import {googleMerchantErrorCode} from '@celebix/saas-data';
import {readOrderPanelSessionCookie} from '../order-http/request-input.ts';
import {approvedPanelMutationOriginForStore,hasApprovedPanelMutationOriginShape} from '../panel-origin-authority.ts';
import type {ServerGoogleMerchantRuntime} from '../server-google-merchant/runtime.ts';
const ROOT='/api/marketplaces/google-merchant';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const STATUS:Record<string,number>={invalid_input:400,unauthenticated:401,membership_denied:403,store_inactive:403,feature_not_enabled:403,wrong_domain:409,not_connected:409,needs_reconnect:409,operation_mismatch:409,commit_unknown:503,unavailable:503};
type Deps=Readonly<{resolveRuntime():Promise<ServerGoogleMerchantRuntime|null>;now():Date;requestId():string}>;
function json(value:unknown,status=200){return Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});}
function error(code:string,status:number){return json({code},status);}
function exact(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>![...required,...optional].includes(k)))throw TypeError();return value as Record<string,unknown>;}
function uuid(value:unknown):string{if(typeof value!=='string'||!UUID.test(value))throw TypeError();return value;}
async function body(request:Request):Promise<unknown>{
 if(request.headers.get('content-type')!=='application/json'||request.headers.has('transfer-encoding')||!request.body)throw TypeError();
 const length=request.headers.get('content-length');if(length!==null&&(!/^(?:0|[1-9]\d*)$/.test(length)||Number(length)>16384))throw TypeError();
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 try{for(;;){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>16384){await reader.cancel();throw TypeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
 if(!total||length!==null&&Number(length)!==total)throw TypeError();const data=new Uint8Array(total);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
}
async function execute(run:()=>Promise<unknown>){try{return json(await run());}catch(caught){const code=googleMerchantErrorCode(caught);return error(code,STATUS[code]??503);}}
export function createGoogleMerchantHttpHandlers(deps:Deps){
 async function authorize(request:Request,method:string,path:string,query=false){
  if(request.method!==method)return error('method_not_allowed',405);
  try{const url=new URL(request.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||url.pathname!==path||!query&&url.search)throw TypeError();for(const [name]of request.headers)if(name==='authorization'||name.startsWith('x-celebix')||['x-store-id','x-tenant-id','x-principal-id','x-membership-id','x-plan-id','x-database-url'].includes(name))throw TypeError();}catch{return error('invalid_input',400);}
  let runtime;try{runtime=await deps.resolveRuntime();}catch{return error('unavailable',503);}if(!runtime)return error('unavailable',503);
  const write=method==='POST';if(write&&!hasApprovedPanelMutationOriginShape(request,runtime.access.panelOrigin))return error('origin_denied',403);
  const cookie=readOrderPanelSessionCookie(request);if(cookie.kind!=='present')return error('unauthenticated',401);
  const now=deps.now(),requestId=deps.requestId();if(!Number.isFinite(now.getTime())||!UUID.test(requestId))return error('unavailable',503);
  let access;try{access=await runtime.access.resolveCredential({hostname:request.headers.get('host'),credential:cookie.credential,requestId,now});}catch{return error('unavailable',503);}
  if(access.kind==='unauthenticated')return error('unauthenticated',401);if(access.kind==='unauthorized')return error('membership_denied',403);if(access.kind!=='authenticated')return error('unavailable',503);
  if(write&&!approvedPanelMutationOriginForStore(request,runtime.access.panelOrigin,access.tenantContext.store.slug))return error('origin_denied',403);
  if(!isMerchantActionAllowed(access.tenantContext.membership.role,write?'integrations.manage':'integrations.read'))return error('membership_denied',403);
  return {runtime,tenantContext:access.tenantContext,now};
 }
 return Object.freeze({
  async get(request:Request,area:'overview'|'products'){
   const authorized=await authorize(request,'GET',area==='overview'?ROOT:ROOT+'/products',area==='products');if(authorized instanceof Response)return authorized;
   const {runtime,tenantContext,now}=authorized;if(area==='overview')return execute(()=>runtime.merchant.overview({tenantContext,now}));
   try{const params=new URL(request.url).searchParams;if([...params.keys()].some(k=>!['cursor','limit'].includes(k)||params.getAll(k).length!==1))throw TypeError();const cursor=params.has('cursor')?uuid(params.get('cursor')):undefined;const raw=params.get('limit')??'25';if(!/^[1-9][0-9]?$/.test(raw)||Number(raw)>50)throw TypeError();return execute(()=>runtime.merchant.products({tenantContext,now,limit:Number(raw),...(cursor?{cursor}:{})}));}catch{return error('invalid_input',400);}
  },
  async post(request:Request,area:'sync'|'preferences',variantId?:string){
   let path;try{path=area==='sync'?ROOT+'/sync':ROOT+'/products/'+uuid(variantId)+'/preferences';}catch{return error('invalid_input',400);}
   const authorized=await authorize(request,'POST',path);if(authorized instanceof Response)return authorized;const {runtime,tenantContext,now}=authorized;
   try{const operationId=uuid(request.headers.get('idempotency-key')),value=await body(request);if(area==='sync'){exact(value,[]);return execute(()=>runtime.merchant.sync({tenantContext,now,operationId}));}
    const v=exact(value,['productId','enabled'],['attributes']);if(typeof v.enabled!=='boolean')throw TypeError();const productId=uuid(v.productId),attributes=v.attributes===undefined?undefined:parseGoogleMerchantAttributes(v.attributes);
    return execute(()=>runtime.merchant.setProductPreferences({tenantContext,now,operationId,productId,variantId:variantId!,enabled:v.enabled as boolean,...(attributes?{attributes}:{})}));
   }catch{return error('invalid_input',400);}
  },
 });
}
