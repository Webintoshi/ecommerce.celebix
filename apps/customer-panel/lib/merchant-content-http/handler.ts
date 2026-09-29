import {isMerchantActionAllowed,parseMerchantContentDocument,parseSaveMerchantContentRequest,type MerchantContentKind,type TenantContext} from '@celebix/saas-contracts';
import {normalizeMerchantContentBody} from '../../../../packages/platform-config/src/merchant-content-body.ts';
import {MERCHANT_CONTENT_ERROR_CODES,MerchantContentRepositoryError,type MerchantContentErrorCode} from '@celebix/saas-data';
import {readOrderPanelSessionCookie} from '../order-http/request-input.ts';
import {approvedPanelMutationOriginForStore,hasApprovedPanelMutationOriginShape} from '../panel-origin-authority.ts';
import type{ServerMerchantContentRuntime}from'../server-merchant-content/runtime.ts';
const BASE='/api/merchant-content',UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const STATUS:Readonly<Record<MerchantContentErrorCode,number>>={invalid_input:400,unauthenticated:401,membership_denied:403,store_inactive:403,feature_not_enabled:403,record_not_found:404,invalid_transition:409,version_conflict:409,operation_mismatch:409,operation_not_found:404,durable_authority_invalid:409,unavailable:503,history_unavailable:409,commit_unknown:503};
type Deps=Readonly<{resolveRuntime():Promise<ServerMerchantContentRuntime|null>;now():Date;requestId():string}>;
type Authorized=Readonly<{runtime:ServerMerchantContentRuntime;tenantContext:TenantContext;now:Date}>;
function json(value:unknown,status=200,extra?:HeadersInit){const h=new Headers(extra);h.set('cache-control','no-store');h.set('x-content-type-options','nosniff');return Response.json(value,{status,headers:h});}
function error(code:string,status:number,extra?:HeadersInit){return json({code},status,extra);}
function isResponse(value:unknown):value is Response{return value instanceof Response;}
function id(value:unknown){return typeof value==='string'&&UUID.test(value)?value:null;}
function kind(value:unknown):MerchantContentKind|null{return value==='blog_post'||value==='page'?value:null;}
function privateHeaders(request:Request){for(const [name]of request.headers)if(name==='authorization'||name.startsWith('x-celebix')||['x-store-id','x-tenant-id','x-principal-id','x-membership-id','x-plan-id','x-database-url'].includes(name))return true;return false;}
async function body(request:Request):Promise<unknown>{
  if(request.headers.get('content-type')!=='application/json'||request.headers.get('transfer-encoding')!==null||request.body===null)throw new TypeError();
  const length=request.headers.get('content-length');
  if(length!==null&&(!/^(?:0|[1-9]\d*)$/.test(length)||Number(length)>786432))throw new TypeError();
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{for(;;){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>786432){await reader.cancel().catch(()=>undefined);throw new TypeError();}chunks.push(new Uint8Array(part.value));}}catch{throw new TypeError();}
  if(total===0||(length!==null&&Number(length)!==total))throw new TypeError();
  const bytes=new Uint8Array(total);let cursor=0;for(const chunk of chunks){bytes.set(chunk,cursor);cursor+=chunk.length;}
  try{const decoded=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(new TextEncoder().encode(JSON.stringify(decoded)).length>262144)throw new TypeError();return decoded;}catch{throw new TypeError();}
}
async function authorize(deps:Deps,request:Request,method:'GET'|'POST',path:string,query=false):Promise<Authorized|Response>{
  let runtime:ServerMerchantContentRuntime|null;try{runtime=await deps.resolveRuntime();}catch{return error('unavailable',503);}if(!runtime)return error('unavailable',503);
  if(request.method!==method)return error('method_not_allowed',405,{allow:method});
  if(method==='POST'&&!hasApprovedPanelMutationOriginShape(request,runtime.access.panelOrigin))return error('origin_denied',403);
  let url:URL;try{url=new URL(request.url);}catch{return error('invalid_input',400);}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!==path||(!query&&url.search)||url.hash||privateHeaders(request))return error('invalid_input',400);
  const cookie=readOrderPanelSessionCookie(request);if(cookie.kind!=='present')return error('unauthenticated',401);
  let now:Date,requestId:string;try{now=deps.now();requestId=deps.requestId();}catch{return error('unavailable',503);}if(!(now instanceof Date)||!Number.isFinite(now.getTime())||!UUID.test(requestId))return error('unavailable',503);
  let access;try{access=await runtime.access.resolveCredential({hostname:request.headers.get('host'),credential:cookie.credential,requestId,now:new Date(now)});}catch{return error('unavailable',503);}
  if(access.kind==='unauthenticated')return error('unauthenticated',401);
  if(access.kind==='unauthorized')return error('membership_denied',403);
  if(access.kind!=='authenticated')return error('unavailable',503);
  if(method==='POST'&&!approvedPanelMutationOriginForStore(request,runtime.access.panelOrigin,access.tenantContext.store.slug))return error('origin_denied',403);
  if(!isMerchantActionAllowed(access.tenantContext.membership.role,method==='POST'?'content.manage':'content.read'))return error('membership_denied',403);
  return Object.freeze({runtime,tenantContext:access.tenantContext,now:new Date(now)});
}
function repositoryError(value:unknown){return value instanceof MerchantContentRepositoryError&&(MERCHANT_CONTENT_ERROR_CODES as readonly string[]).includes(value.code)?error(value.code,STATUS[value.code]):error('unavailable',503);}
async function execute(run:()=>Promise<unknown>,parse:(value:unknown)=>unknown){try{return json(parse(await run()));}catch(caught){return repositoryError(caught);}}
function versionQuery(url:string){const params=new URL(url).searchParams;if(params.size<1||params.size>2||[...params.keys()].some(key=>key!=='limit'&&key!=='beforeVersion')||params.getAll('limit').length!==1||params.getAll('beforeVersion').length>1)return null;const rawLimit=params.get('limit');if(!rawLimit||!/^[1-9]\d*$/.test(rawLimit))return null;const limit=Number(rawLimit);if(!Number.isSafeInteger(limit)||limit>50)return null;const rawBefore=params.get('beforeVersion');if(rawBefore!==null&&(!/^[1-9]\d*$/.test(rawBefore)||!Number.isSafeInteger(Number(rawBefore))))return null;return{limit,...(rawBefore===null?{}:{beforeVersion:Number(rawBefore)})};}
export function createMerchantContentHttpHandlers(deps:Deps){return Object.freeze({
  async get(request:Request,rawKind:string,rawId:string){const selected=kind(rawKind),recordId=id(rawId);if(!selected||!recordId)return error('invalid_input',400);const authorized=await authorize(deps,request,'GET',`${BASE}/${rawKind}/${rawId}`);return isResponse(authorized)?authorized:execute(()=>authorized.runtime.merchantContent.get({tenantContext:authorized.tenantContext,now:authorized.now,kind:selected,recordId}),value=>{const document=parseMerchantContentDocument(value);if(document.id!==recordId||document.kind!==selected)throw new TypeError();return document;});},
  async save(request:Request,rawKind:string){const selected=kind(rawKind);if(!selected)return error('invalid_input',400);const authorized=await authorize(deps,request,'POST',`${BASE}/${rawKind}`);if(isResponse(authorized))return authorized;const operationId=id(request.headers.get('idempotency-key'));if(!operationId||request.headers.get('idempotency-key')?.includes(','))return error('invalid_input',400);let parsed;try{const input=await body(request) as Record<string,unknown>;if(!input||typeof input!=='object'||Array.isArray(input)||!input.values||typeof input.values!=='object'||Array.isArray(input.values))throw new TypeError();const values=input.values as Record<string,unknown>;const bodyText=input.bodyAction==='replace'&&typeof values.body==='string'?normalizeMerchantContentBody(values.body):values.body;parsed=parseSaveMerchantContentRequest({...input,values:{...values,body:bodyText}});if(parsed.kind!==selected)throw new TypeError();}catch{return error('invalid_input',400);}return execute(()=>authorized.runtime.merchantContent.save({tenantContext:authorized.tenantContext,now:authorized.now,operationId,request:parsed}),value=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError();const result=value as Record<string,unknown>;if(Reflect.ownKeys(result).length!==2||!Object.hasOwn(result,'document')||!Object.hasOwn(result,'replayed')||typeof result.replayed!=='boolean')throw new TypeError();const document=parseMerchantContentDocument(result.document);if(document.kind!==selected||(parsed.recordId!==null&&document.id!==parsed.recordId))throw new TypeError();return{document,replayed:result.replayed};});},
  async versions(request:Request,rawKind:string,rawId:string){const selected=kind(rawKind),recordId=id(rawId);if(!selected||!recordId)return error('invalid_input',400);const authorized=await authorize(deps,request,'GET',`${BASE}/${rawKind}/${rawId}/versions`,true);if(isResponse(authorized))return authorized;const options=versionQuery(request.url);if(!options)return error('invalid_input',400);return execute(()=>authorized.runtime.merchantContent.listVersions({tenantContext:authorized.tenantContext,now:authorized.now,kind:selected,recordId,...options}),value=>{if(!Array.isArray(value)||value.length>options.limit)throw new TypeError();return{items:value};});},
});}
