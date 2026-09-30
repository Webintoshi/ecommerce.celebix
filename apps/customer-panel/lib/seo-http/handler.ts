import { isMerchantActionAllowed, parseSaveSeoResourceRequest, parseSaveSeoSettingsRequest, parseSaveSeoLinkRequest, parseNotifySeoRequest, type SeoResourceKind, type TenantContext } from '@celebix/saas-contracts';
import { SeoRepositoryError } from '@celebix/saas-data';
import { readOrderPanelSessionCookie } from '../order-http/request-input.ts';
import { approvedPanelMutationOriginForStore, hasApprovedPanelMutationOriginShape } from '../panel-origin-authority.ts';
import type { ServerSeoRuntime } from '../server-seo/runtime.ts';

type Area = 'overview'|'resources'|'settings'|'links'|'notifications'|'checks';
type Deps = Readonly<{resolveRuntime():Promise<ServerSeoRuntime|null>; now():Date; requestId():string}>;
type Authorized = Readonly<{runtime:ServerSeoRuntime; tenantContext:TenantContext; now:Date}>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KINDS=['product','category','page','blog'] as const;
const STATUS:Record<string,number>={invalid_input:400,unauthenticated:401,membership_denied:403,store_inactive:403,feature_not_enabled:403,record_not_found:404,version_conflict:409,operation_mismatch:409,unavailable:503,commit_unknown:503};
function json(value:unknown,status=200){return Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});}
function error(code:string,status:number){return json({code},status);}
function exact(value:unknown,required:string[],optional:string[]=[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!required.includes(key)&&!optional.includes(key)))throw new TypeError('invalid_input');
  return value as Record<string,unknown>;
}
function kind(value:unknown):value is SeoResourceKind{return KINDS.includes(value as SeoResourceKind);}
function uuid(value:unknown):value is string{return typeof value==='string'&&UUID.test(value);}
function version(value:unknown){return Number.isSafeInteger(value)&&(value as number)>=0;}
function nullableText(value:unknown,max:number){return value===null||typeof value==='string'&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);}
async function body(request:Request):Promise<unknown>{
  if(request.headers.get('content-type')!=='application/json'||request.headers.has('transfer-encoding')||!request.body)throw new TypeError();
  const length=request.headers.get('content-length');
  if(length!==null&&(!/^(?:0|[1-9]\d*)$/.test(length)||Number(length)>65536))throw new TypeError();
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{for(;;){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>65536){await reader.cancel();throw new TypeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
  if(!total||length!==null&&Number(length)!==total)throw new TypeError();
  const data=new Uint8Array(total);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
}
async function authorize(deps:Deps,request:Request,method:string,path:string,query=false):Promise<Authorized|Response>{
  let runtime:ServerSeoRuntime|null;try{runtime=await deps.resolveRuntime();}catch{return error('unavailable',503);}if(!runtime)return error('unavailable',503);
  if(request.method!==method)return error('method_not_allowed',405);
  const write=method!=='GET';
  if(write&&!hasApprovedPanelMutationOriginShape(request,runtime.access.panelOrigin))return error('origin_denied',403);
  let url:URL;try{url=new URL(request.url);}catch{return error('invalid_input',400);}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||url.pathname!==path||(!query&&url.search))return error('invalid_input',400);
  for(const [header]of request.headers)if(header==='authorization'||header.startsWith('x-celebix')||['x-store-id','x-tenant-id','x-principal-id','x-membership-id','x-plan-id','x-database-url'].includes(header))return error('invalid_input',400);
  const cookie=readOrderPanelSessionCookie(request);if(cookie.kind!=='present')return error('unauthenticated',401);
  const now=deps.now(),requestId=deps.requestId();if(!(now instanceof Date)||!Number.isFinite(now.getTime())||!uuid(requestId))return error('unavailable',503);
  let access;try{access=await runtime.access.resolveCredential({hostname:request.headers.get('host'),credential:cookie.credential,requestId,now});}catch{return error('unavailable',503);}
  if(access.kind==='unauthenticated')return error('unauthenticated',401);if(access.kind==='unauthorized')return error('membership_denied',403);if(access.kind!=='authenticated')return error('unavailable',503);
  if(write&&!approvedPanelMutationOriginForStore(request,runtime.access.panelOrigin,access.tenantContext.store.slug))return error('origin_denied',403);
  if(!isMerchantActionAllowed(access.tenantContext.membership.role,write?'integrations.manage':'integrations.read'))return error('membership_denied',403);
  return {runtime,tenantContext:access.tenantContext,now};
}
function filters(request:Request){
  const params=new URL(request.url).searchParams,allowed=['kind','query','missing','cursor','limit'];
  if([...params.keys()].some(key=>!allowed.includes(key)||params.getAll(key).length!==1))throw new TypeError();
  const selected=params.get('kind'),query=params.get('query'),missing=params.get('missing'),cursor=params.get('cursor'),rawLimit=params.get('limit');
  if(selected!==null&&!kind(selected)||query!==null&&(query.length>100||/[\u0000-\u001f\u007f]/.test(query))||missing!==null&&missing!=='1'||cursor!==null&&(cursor.length>2048||!cursor)||rawLimit!==null&&(!/^[1-9]\d*$/.test(rawLimit)||Number(rawLimit)>100))throw new TypeError();
  return {...(selected===null?{}:{kind:selected as SeoResourceKind}),...(query===null?{}:{query}),...(missing===null?{}:{missing:true}),...(cursor===null?{}:{cursor}),limit:rawLimit===null?50:Number(rawLimit)};
}
function resourceRequest(value:unknown){const r=exact(value,['expectedVersion','expectedSeoVersion','title','description','canonicalPath','indexing']);if(!version(r.expectedVersion)||!version(r.expectedSeoVersion)||!nullableText(r.title,200)||!nullableText(r.description,4000)||!nullableText(r.canonicalPath,2048)||!['inherit','index','noindex'].includes(String(r.indexing)))throw new TypeError();return r;}
function settingsRequest(value:unknown){const r=exact(value,['expectedVersion','metaTitle','metaDescription','allowIndex','socialTitle','socialDescription','socialAssetId','googleVerification','bingVerification','indexNowEnabled']);if(!version(r.expectedVersion)||typeof r.allowIndex!=='boolean'||typeof r.indexNowEnabled!=='boolean'||!nullableText(r.metaTitle,160)||!nullableText(r.metaDescription,500)||!nullableText(r.socialTitle,160)||!nullableText(r.socialDescription,500)||!(r.socialAssetId===null||uuid(r.socialAssetId))||!nullableText(r.googleVerification,256)||!nullableText(r.bingVerification,256))throw new TypeError();return r;}
function linkRequest(value:unknown){const r=exact(value,['id','expectedVersion','sourceKind','sourceId','targetKind','targetId','anchorText','enabled'],['remove']);if(!(r.id===null||uuid(r.id))||!(r.expectedVersion===null||version(r.expectedVersion))||!kind(r.sourceKind)||!kind(r.targetKind)||!uuid(r.sourceId)||!uuid(r.targetId)||typeof r.anchorText!=='string'||!r.anchorText.trim()||r.anchorText.length>160||typeof r.enabled!=='boolean'||r.remove!==undefined&&typeof r.remove!=='boolean')throw new TypeError();return r;}
function notificationRequest(value:unknown){const r=exact(value,['resources']);if(!Array.isArray(r.resources)||r.resources.length<1||r.resources.length>100)throw new TypeError();for(const value of r.resources){const item=exact(value,['kind','id']);if(!kind(item.kind)||!uuid(item.id))throw new TypeError();}return r;}
async function execute(run:()=>Promise<unknown>){try{return json(await run());}catch(caught){if(caught instanceof SeoRepositoryError)return error(caught.code,STATUS[caught.code]??503);return error('unavailable',503);}}
export function createSeoHttpHandlers(deps:Deps){return Object.freeze({
  async get(request:Request,area:Area){if(area==='checks')return error('invalid_input',400);const authorized=await authorize(deps,request,'GET',`/api/seo/${area}`,area==='resources');if(authorized instanceof Response)return authorized;const {runtime,tenantContext,now}=authorized;let options={};try{if(area==='resources')options=filters(request);}catch{return error('invalid_input',400);}return execute(()=>runtime.seo[area]({tenantContext,now,...options}));},
  async saveResource(request:Request,rawKind:string,id:string){if(!kind(rawKind)||!uuid(id))return error('invalid_input',400);const authorized=await authorize(deps,request,'PATCH',`/api/seo/resources/${rawKind}/${id}`);if(authorized instanceof Response)return authorized;const operationId=request.headers.get('idempotency-key');if(!uuid(operationId))return error('invalid_input',400);let parsed;try{parsed=parseSaveSeoResourceRequest({...resourceRequest(await body(request)),kind:rawKind,id});}catch{return error('invalid_input',400);}return execute(()=>authorized.runtime.seo.saveResource({tenantContext:authorized.tenantContext,now:authorized.now,operationId,request:parsed}));},
  async save(request:Request,area:Area){if(!['settings','links','notifications','checks'].includes(area))return error('invalid_input',400);const authorized=await authorize(deps,request,'POST',`/api/seo/${area}`);if(authorized instanceof Response)return authorized;const operationId=request.headers.get('idempotency-key');if(!uuid(operationId))return error('invalid_input',400);const common={tenantContext:authorized.tenantContext,now:authorized.now,operationId};let value:unknown;try{value=await body(request);}catch{return error('invalid_input',400);}
    try{
      if(area==='checks'){exact(value,[]);return execute(()=>authorized.runtime.seo.startCheck(common));}
      if(area==='settings'){const parsed=parseSaveSeoSettingsRequest(settingsRequest(value));return execute(()=>authorized.runtime.seo.saveSettings({...common,request:parsed}));}
      if(area==='links'){const parsed=parseSaveSeoLinkRequest(linkRequest(value));return execute(()=>authorized.runtime.seo.saveLink({...common,request:parsed}));}
      const parsed=parseNotifySeoRequest(notificationRequest(value));return execute(()=>authorized.runtime.seo.notify({...common,request:parsed}));
    }catch{return error('invalid_input',400);}
  },
});}
