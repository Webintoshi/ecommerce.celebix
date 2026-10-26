import {commercialUuid} from '@celebix/saas-contracts';
import {readOrderPanelSessionCookie} from '../order-http/request-input.ts';
import {approvedPanelMutationOriginForStore,hasApprovedPanelMutationOriginShape} from '../panel-origin-authority.ts';
import {parsePlatformCheckoutIntent,PlatformCommerceRepositoryError} from '../server-platform-commerce/repository.ts';
import type {ServerPlatformCommerceRuntime} from '../server-platform-commerce/runtime.ts';
type Dependencies=Readonly<{resolveRuntime():Promise<ServerPlatformCommerceRuntime|null>;now():Date;requestId():string;enabled():boolean}>;
const STATUS:Readonly<Record<string,number>>={invalid_input:400,unauthenticated:401,membership_denied:403,store_inactive:403,feature_not_enabled:403,subscription_denied:403,durable_authority_invalid:403,origin_denied:403,operation_mismatch:409,already_owned:409,already_covered:409,purchase_pending:409,unavailable:503,commit_unknown:503};
function fail(code:string,status=STATUS[code]??503){return Response.json({code},{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});}
async function readBody(request:Request):Promise<unknown>{
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??'')||request.headers.has('transfer-encoding')||!request.body)throw Error();
 const declared=request.headers.get('content-length');if(declared!==null&&(!/^(0|[1-9]\d*)$/.test(declared)||Number(declared)>2048))throw Error();
 const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0,timer:ReturnType<typeof setTimeout>|undefined,expired=false;
 try{return await Promise.race([(async()=>{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>2048){void reader.cancel().catch(()=>{});throw Error();}parts.push(chunk.value);}if(expired||size===0||declared!==null&&size!==Number(declared))throw Error();return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts,size))) as unknown;})(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error());void reader.cancel().catch(()=>{});},2000);})]);}finally{if(timer)clearTimeout(timer);reader.releaseLock();}
}
export function createPlatformCheckoutHttpHandler(deps:Dependencies){return async(request:Request):Promise<Response>=>{
 try{
  if(!deps.enabled())return fail('unavailable');
  const url=new URL(request.url);if(request.method!=='POST')return fail('method_not_allowed',405);if(url.pathname!=='/api/platform-checkout'||url.search||url.hash||url.username||url.password)return fail('invalid_input');
  for(const[name]of request.headers)if(name==='authorization'||name.startsWith('x-celebix')||['x-panel-session-credential','x-store-id','x-tenant-id','x-principal-id','x-membership-id','x-plan-id','x-database-role','x-database-url'].includes(name))return fail('invalid_input');
  const runtime=await deps.resolveRuntime();if(!runtime)return fail('unavailable');
  if(!hasApprovedPanelMutationOriginShape(request,runtime.access.panelOrigin))return fail('origin_denied');
  const cookie=readOrderPanelSessionCookie(request);if(cookie.kind!=='present')return fail('unauthenticated');
  const now=deps.now();if(!(now instanceof Date)||!Number.isFinite(now.getTime()))return fail('unavailable');
  const access=await runtime.access.resolveCredential({hostname:request.headers.get('host'),credential:cookie.credential,requestId:commercialUuid(deps.requestId()),now:new Date(now)});
  if(access.kind==='unauthenticated')return fail('unauthenticated');if(access.kind==='unauthorized')return fail('membership_denied');if(access.kind!=='authenticated')return fail('unavailable');
  if(access.support||!['store_owner','admin'].includes(access.tenantContext.membership.role))return fail('membership_denied');
  if(!approvedPanelMutationOriginForStore(request,runtime.access.panelOrigin,access.tenantContext.store.slug))return fail('origin_denied');
  let intent;try{intent=parsePlatformCheckoutIntent(await readBody(request));if(intent.operationId!==commercialUuid(request.headers.get('idempotency-key')))return fail('invalid_input');}catch{return fail('invalid_input');}
  if(intent.kind==='package'&&access.tenantContext.membership.role!=='store_owner')return fail('membership_denied');
  const result=await runtime.commerce.createCheckout({tenantContext:access.tenantContext,now:new Date(now),intent});
  return Response.json(result,{headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
 }catch(error){return fail(error instanceof PlatformCommerceRepositoryError&&Object.hasOwn(STATUS,error.code)?error.code:'unavailable');}
};}
