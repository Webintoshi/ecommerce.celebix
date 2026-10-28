import 'server-only';
import {isMerchantActionAllowed}from'@celebix/saas-contracts';
import {ProductMediaRepositoryError}from'@celebix/saas-data';
import {readOrderPanelSessionCookie}from'../order-http/request-input.ts';
import type{ServerMediaRuntime}from'../server-media/runtime.ts';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const MAX_BYTES=8*1024*1024;
export type ToshiImageSourceRouteContext=Readonly<{params:Promise<Readonly<{productId:string;mediaId:string}>>}>;
type Dependencies=Readonly<{resolveRuntime():Promise<ServerMediaRuntime|null>;now():Date;requestId():string;fetcher?:typeof fetch;requestBudgetMs?:number}>;
class SourceError extends Error{constructor(readonly code:string,readonly status:number){super(code);}}
function failure(code:string,status:number):Response{return Response.json({code},{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});}
function invalid():never{throw new SourceError('invalid_input',400);}
function shape(request:Request,productId:string,mediaId:string):boolean{
 try{const url=new URL(request.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!==`/api/content-ai/image-source/${productId}/${mediaId}`||request.body!==null)return false;
 for(const[name]of request.headers)if(name==='authorization'||name.startsWith('x-celebix')||['x-panel-session-credential','x-store-id','x-tenant-id','x-principal-id','x-membership-id','x-plan-id','x-database-role','x-database-url'].includes(name))return false;return true;}catch{return false;}
}
async function readBytes(response:Response,expectedBytes:number,run:<T>(operation:()=>Promise<T>)=>Promise<T>):Promise<Uint8Array<ArrayBuffer>>{
 const declared=response.headers.get('content-length');
 if(declared!==null&&(!/^(?:0|[1-9]\d*)$/.test(declared)||Number(declared)!==expectedBytes||Number(declared)>MAX_BYTES)||!response.body){void response.body?.cancel().catch(()=>{});throw new SourceError('image_source_unavailable',502);}
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{
  for(;;){const next=await run(()=>reader.read());if(next.done)break;if(!(next.value instanceof Uint8Array))throw new SourceError('image_source_unavailable',502);size+=next.value.byteLength;if(size>MAX_BYTES||size>expectedBytes)throw new SourceError('image_source_unavailable',502);chunks.push(next.value);}
  if(size!==expectedBytes)throw new SourceError('image_source_unavailable',502);
  const joined=new Uint8Array(size);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}return joined;
 }finally{void reader.cancel().catch(()=>{});reader.releaseLock();chunks.forEach(chunk=>chunk.fill(0));}
}
export function createToshiImageSourceHttpHandler(deps:Dependencies):(request:Request,context:ToshiImageSourceRouteContext)=>Promise<Response>{
 const fetcher=deps.fetcher??globalThis.fetch;
 return async(request,context)=>{
  const controller=new AbortController(),signal=AbortSignal.any([request.signal,controller.signal]);
  const configured=deps.requestBudgetMs??10_000,budget=Number.isSafeInteger(configured)&&configured>0?Math.min(configured,10_000):10_000,deadline=performance.now()+budget;
  const expired=()=>new SourceError(request.signal.aborted?'cancelled':'image_source_timeout',request.signal.aborted?499:504);
  let rejectAbort:(error:unknown)=>void=()=>{};const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject;});void aborted.catch(()=>{});
  const onAbort=()=>rejectAbort(expired());signal.addEventListener('abort',onAbort,{once:true});const timer=setTimeout(()=>controller.abort(),budget);
  const run=async<T>(operation:()=>Promise<T>):Promise<T>=>{if(signal.aborted||performance.now()>=deadline)throw expired();const value=await Promise.race([operation(),aborted]);if(signal.aborted||performance.now()>=deadline)throw expired();return value;};
  try{
   if(request.method!=='GET')return failure('method_not_allowed',405);
   const params=await run(()=>context.params);if(!params||Object.keys(params).sort().join(',')!=='mediaId,productId'||!UUID.test(params.productId)||!UUID.test(params.mediaId)||!shape(request,params.productId,params.mediaId))invalid();
   const runtime=await run(deps.resolveRuntime);if(!runtime)return failure('unavailable',503);
   const cookie=readOrderPanelSessionCookie(request);if(cookie.kind!=='present')return failure('unauthenticated',401);
   const now=deps.now(),requestId=deps.requestId();if(!(now instanceof Date)||!Number.isFinite(now.getTime())||!UUID.test(requestId))return failure('unavailable',503);
   const access=await run(()=>runtime.access.resolveCredential({credential:cookie.credential,hostname:request.headers.get('host'),requestId,now}));
   if(access.kind==='unauthenticated')return failure('unauthenticated',401);if(access.kind==='unauthorized')return failure('membership_denied',403);if(access.kind!=='authenticated')return failure('unavailable',503);
   const tenantContext=access.tenantContext;if(tenantContext.store.status!=='active')return failure('store_inactive',403);if(tenantContext.membership.status!=='active'||!isMerchantActionAllowed(tenantContext.membership.role,'catalog_admin.manage'))return failure('membership_denied',403);
   const media=await run(()=>runtime.media.listProductMedia({tenantContext,now,productId:params.productId}));
   const matches=media.filter(item=>item.id===params.mediaId&&item.status==='active');if(matches.length!==1)return failure('media_not_found',404);const selected=matches[0]!;
   if(selected.storeId!==tenantContext.store.id||selected.productId!==params.productId)return failure('media_not_found',404);
   const extension=selected.mediaType==='image/jpeg'?'jpg':selected.mediaType==='image/png'?'png':selected.mediaType==='image/webp'?'webp':null;
   // Both IDs came from the authenticated product query. No caller URL, stored
   // public URL, path traversal, alternate tenant prefix or query is forwarded.
   if(!extension||selected.objectKey!==`stores/${tenantContext.store.id}/products/${params.productId}/${params.mediaId}.${extension}`||!Number.isSafeInteger(selected.byteSize)||selected.byteSize<1||selected.byteSize>MAX_BYTES)throw new SourceError('image_source_unavailable',502);
   const source=runtime.storage.publicUrl(selected.objectKey),url=new URL(source);
   if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||url.pathname!==`/${selected.objectKey}`||url.href!==source)throw new SourceError('image_source_unavailable',502);
   const response=await run(()=>fetcher(source,{method:'GET',headers:{accept:selected.mediaType},redirect:'error',credentials:'omit',cache:'no-store',signal}));
   if(!(response instanceof Response)||response.status!==200||response.redirected||response.headers.has('location')||response.url&&response.url!==source||response.headers.get('content-type')!==selected.mediaType){void response.body?.cancel().catch(()=>{});throw new SourceError('image_source_unavailable',502);}
   const bytes=await readBytes(response,selected.byteSize,run);
   return new Response(bytes,{status:200,headers:{'content-type':selected.mediaType,'content-length':String(bytes.byteLength),'x-content-type-options':'nosniff','cache-control':'private, max-age=300','vary':'Cookie','cross-origin-resource-policy':'same-origin'}});
  }catch(error){if(error instanceof SourceError)return failure(error.code,error.status);if(error instanceof ProductMediaRepositoryError){const statuses:Readonly<Record<string,number>>={invalid_input:400,membership_denied:403,store_inactive:403,feature_not_enabled:403,product_not_found:404,variant_not_found:404,media_not_found:404};const status=statuses[error.code];return failure(status?error.code:'unavailable',status??503);}return failure('unavailable',503);}
  finally{clearTimeout(timer);signal.removeEventListener('abort',onAbort);}
 };
}
