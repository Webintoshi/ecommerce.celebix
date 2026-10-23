import {createHash,randomBytes} from 'node:crypto';
import {hasCommercialCapability,isMerchantActionAllowed,parseTrendyolListingInput,parseTrendyolPricingRule,parseTrendyolSecret,parseTrendyolSellerId,trendyolInteger,trendyolObject,trendyolUuid,type TrendyolErrorCode} from '@celebix/saas-contracts';
import {openTrendyolCredential,sealTrendyolCredential} from '../../../../packages/saas-data/src/trendyol/credential.ts';
import {trendyolErrorCode,trendyolFingerprint} from '../../../../packages/saas-data/src/trendyol/repository.ts';
import {TrendyolProviderError,type TrendyolProviderOption} from '../../../../packages/saas-data/src/trendyol/provider.ts';
import {readOrderPanelSessionCookie} from '../order-http/request-input.ts';
import {approvedPanelMutationOriginForStore,hasApprovedPanelMutationOriginShape} from '../panel-origin-authority.ts';
import type {ServerTrendyolRuntime} from '../server-trendyol/runtime.ts';
const ROOT='/api/marketplaces/trendyol';
type Dependencies=Readonly<{resolveRuntime():Promise<ServerTrendyolRuntime|null>;now():Date;requestId():string}>;
const STATUS:Partial<Record<TrendyolErrorCode,number>>={invalid_input:400,unauthenticated:401,membership_denied:403,store_inactive:403,feature_not_enabled:403,not_connected:409,needs_reconnect:409,operation_mismatch:409,version_conflict:409,commit_unknown:503,unavailable:503,rate_limited:429,provider_rejected:422,mapping_required:409,stock_conflict:409,quota_blocked:409};
export function trendyolHttpErrorCode(error:unknown):TrendyolErrorCode{
 if(error instanceof TrendyolProviderError){switch(error.code){case'provider_limit':return'rate_limited';case'needs_reconnect':return'needs_reconnect';case'invalid_input':return'invalid_input';case'provider_rejected':case'provider_denied':case'provider_conflict':return'provider_rejected';default:return'unavailable';}}
 return trendyolErrorCode(error);
}
function json(value:unknown,status=200){return Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});}
function error(code:string,status:number){return json({code},status);}
async function execute(run:()=>Promise<unknown>){try{return json(await run());}catch(caught){const code=trendyolHttpErrorCode(caught);return error(code,STATUS[code]??503);}}
async function body(request:Request,maximum=65536,webhook=false):Promise<unknown>{
 if(!(webhook?/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??''):request.headers.get('content-type')==='application/json')||!webhook&&request.headers.has('transfer-encoding')||!request.body)throw TypeError();
 const length=request.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>maximum))throw TypeError();
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 try{for(;;){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>maximum){await reader.cancel();throw TypeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
 if(!total||length!==null&&Number(length)!==total)throw TypeError();const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export function trendyolWebhookUrl(origin:string,storeId:string):string{
 trendyolUuid(storeId);const base=new URL(origin);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw TypeError('trendyol_origin_invalid');
 const result=new URL('/api/hooks/marketplace/'+storeId,base).toString();if(/trendyol|dolap|localhost/i.test(result))throw TypeError('trendyol_origin_invalid');return result;
}
const optionsCache=new Map<string,{expires:number;value:Readonly<{items:TrendyolProviderOption[]}>}>();
export function createTrendyolHttpHandlers(deps:Dependencies){
 async function authorize(request:Request,method:string,path:string,query=false){
  if(request.method!==method)return error('method_not_allowed',405);
  try{const u=new URL(request.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash||u.pathname!==path||!query&&u.search)throw TypeError();for(const [name]of request.headers)if(name==='authorization'||name.startsWith('x-celebix')||['x-store-id','x-tenant-id','x-principal-id','x-membership-id','x-plan-id','x-database-url'].includes(name))throw TypeError();}catch{return error('invalid_input',400);}
  let runtime;try{runtime=await deps.resolveRuntime();}catch{return error('unavailable',503);}if(!runtime)return error('unavailable',503);
  const write=method==='POST';if(write&&!hasApprovedPanelMutationOriginShape(request,runtime.access.panelOrigin))return error('origin_denied',403);
  const cookie=readOrderPanelSessionCookie(request);if(cookie.kind!=='present')return error('unauthenticated',401);
  const now=deps.now(),requestId=deps.requestId();try{trendyolUuid(requestId);if(!Number.isFinite(now.getTime()))throw TypeError();}catch{return error('unavailable',503);}
  let access;try{access=await runtime.access.resolveCredential({hostname:request.headers.get('host'),credential:cookie.credential,requestId,now});}catch{return error('unavailable',503);}
  if(access.kind==='unauthenticated')return error('unauthenticated',401);if(access.kind==='unauthorized')return error('membership_denied',403);if(access.kind!=='authenticated')return error('unavailable',503);
  if(write&&!approvedPanelMutationOriginForStore(request,runtime.access.panelOrigin,access.tenantContext.store.slug))return error('origin_denied',403);
  if(!isMerchantActionAllowed(access.tenantContext.membership.role,write?'integrations.manage':'integrations.read'))return error('membership_denied',403);
  if(!hasCommercialCapability(access.tenantContext.entitlements,'marketplaces'))return error('feature_not_enabled',403);
  return {runtime,tenantContext:access.tenantContext,now};
 }
 return Object.freeze({
  async get(request:Request,area:'overview'|'products'|'options'|'order-issues'){
   const authorized=await authorize(request,'GET',area==='overview'?ROOT:ROOT+'/'+area,area==='products'||area==='options');if(authorized instanceof Response)return authorized;
   const {runtime,tenantContext,now}=authorized;
   if(area==='overview')return execute(async()=>{const v=await runtime.repository.overview({tenantContext,now});return{...v,webhookUrl:v.connection.connected?trendyolWebhookUrl(runtime.access.panelOrigin,tenantContext.store.id):null};});
   if(area==='order-issues')return execute(()=>runtime.repository.orderIssues({tenantContext,now}));
   const params=new URL(request.url).searchParams;
   try{
    if(area==='products'){
     if([...params.keys()].some(k=>!['cursor','limit'].includes(k)||params.getAll(k).length!==1))throw TypeError();const cursor=params.has('cursor')?trendyolUuid(params.get('cursor')):undefined;const raw=params.get('limit')??'25';if(!/^[1-9][0-9]?$/.test(raw)||Number(raw)>50)throw TypeError();
     return execute(()=>runtime.repository.products({tenantContext,now,limit:Number(raw),...(cursor?{cursor}:{})}));
    }
    if([...params.keys()].some(k=>!['kind','categoryId','search'].includes(k)||params.getAll(k).length!==1))throw TypeError();
    const kind=params.get('kind');if(!['categories','brands','attributes','cargo'].includes(kind??''))throw TypeError();
    const category=params.get('categoryId');if(category!==null&&!/^[1-9][0-9]{0,9}$/.test(category))throw TypeError();const categoryId=category===null?undefined:trendyolInteger(Number(category),1,2147483647);if(kind==='attributes'&&!categoryId)throw TypeError();
    const search=params.get('search')??'';if(search.length>100||/[\x00-\x1f\x7f]/u.test(search))throw TypeError();
    return execute(async()=>{
     const secret=await runtime.repository.credential({tenantContext,now});const credential=openTrendyolCredential({storeId:tenantContext.store.id,version:secret.credentialVersion,envelope:secret.credential,keyring:runtime.keyring});
     const key=JSON.stringify([kind,categoryId,search]),cached=optionsCache.get(key);if(cached&&cached.expires>Date.now())return cached.value;
     const value=await runtime.provider.options(credential,{kind:kind as 'categories'|'brands'|'attributes'|'cargo',...(categoryId?{categoryId}:{}),...(search?{search}:{})});
     if(optionsCache.size>=32)optionsCache.delete(optionsCache.keys().next().value!);optionsCache.set(key,{expires:Date.now()+3600000,value});return value;
    });
   }catch{return error('invalid_input',400);}
  },
  async post(request:Request,area:'connect'|'settings'|'products'|'sync'|'disconnect'){
   const authorized=await authorize(request,'POST',ROOT+'/'+area);if(authorized instanceof Response)return authorized;
   const {runtime,tenantContext,now}=authorized;let operationId:string,value:unknown;
   try{operationId=trendyolUuid(request.headers.get('idempotency-key'));value=await body(request);}catch{return error('invalid_input',400);}
   const receipt=(action:'connect'|'settings'|'map'|'sync'|'disconnect',payload:unknown)=>runtime.repository.receipt({tenantContext,now,action,operationId,fingerprint:trendyolFingerprint({action,storeId:tenantContext.store.id,payload})});
   const operation=(action:'connect'|'settings'|'map'|'sync'|'disconnect',payload:Readonly<Record<string,unknown>>,fingerprintPayload:unknown=payload)=>runtime.repository.command({tenantContext,now,action,payload:{...payload,operationId,fingerprint:trendyolFingerprint({action,storeId:tenantContext.store.id,payload:fingerprintPayload})}});
   try{
    if(area==='sync'){trendyolObject(value,[]);return execute(()=>operation('sync',{}));}
    if(area==='settings'){const v=trendyolObject(value,['expectedVersion','pricing']);const expectedVersion=trendyolInteger(v.expectedVersion,1,Number.MAX_SAFE_INTEGER),pricing=parseTrendyolPricingRule(v.pricing);return execute(()=>operation('settings',{expectedVersion,pricing}));}
    if(area==='disconnect'){const v=trendyolObject(value,['expectedVersion']);const expectedVersion=trendyolInteger(v.expectedVersion,1,Number.MAX_SAFE_INTEGER);return execute(()=>operation('disconnect',{expectedVersion}));}
    if(area==='connect'){
     const v=trendyolObject(value,['expectedVersion','sellerId','apiKey','apiSecret','pricing']),expectedVersion=trendyolInteger(v.expectedVersion,0,Number.MAX_SAFE_INTEGER-1),sellerId=parseTrendyolSellerId(v.sellerId),apiKey=parseTrendyolSecret(v.apiKey),apiSecret=parseTrendyolSecret(v.apiSecret),pricing=parseTrendyolPricingRule(v.pricing);
     return execute(async()=>{
      const credentialDigest=createHash('sha256').update(JSON.stringify([sellerId,apiKey,apiSecret])).digest('hex'),fingerprintPayload={expectedVersion,sellerId,credentialDigest,pricing};
      const saved=await receipt('connect',fingerprintPayload);if(saved)return saved;
      await runtime.provider.testConnection({sellerId,apiKey,apiSecret});
      const webhookSecret=randomBytes(32).toString('hex');
      const credential=sealTrendyolCredential({storeId:tenantContext.store.id,version:expectedVersion+1,credential:{sellerId,apiKey,apiSecret,webhookSecret},keyring:runtime.keyring});
      return operation('connect',{expectedVersion,sellerId,credential,pricing,webhookHash:createHash('sha256').update(webhookSecret).digest('hex')},fingerprintPayload);
     });
    }
    const listing=parseTrendyolListingInput(value);
    return execute(async()=>{
     const saved=await receipt('map',listing);if(saved)return saved;
     const secret=await runtime.repository.credential({tenantContext,now}),credential=openTrendyolCredential({storeId:tenantContext.store.id,version:secret.credentialVersion,envelope:secret.credential,keyring:runtime.keyring});
     if(listing.enabled&&listing.mode==='existing'){
      const product=await runtime.provider.product(credential,listing.barcode);if(product.archived||!product.approved)throw new TrendyolProviderError('provider_rejected');
     }else if(listing.enabled&&listing.mode==='create'){
      if(![0,1,10,20].includes(listing.vatRate))throw new TrendyolProviderError('invalid_input');
      const schema=await runtime.provider.options(credential,{kind:'attributes',categoryId:listing.categoryId!});
      for(const attribute of schema.items){
       const selected=listing.attributes.find(a=>a.attributeId===attribute.id);
       if(attribute.required&&!selected)throw new TrendyolProviderError('invalid_input');
       if(selected?.value!==undefined&&attribute.allowCustom!==true)throw new TrendyolProviderError('invalid_input');
       if(selected?.valueId!==undefined&&attribute.values&&!attribute.values.some(v=>v.id===selected.valueId))throw new TrendyolProviderError('invalid_input');
      }
      if(listing.attributes.some(a=>!schema.items.some(s=>s.id===a.attributeId)))throw new TrendyolProviderError('invalid_input');
     }
     return operation('map',{...listing});
    });
   }catch{return error('invalid_input',400);}
  },
  async webhook(request:Request,storeId:string){
   if(request.method!=='POST')return error('method_not_allowed',405);
   let runtime;try{trendyolUuid(storeId);const token=request.headers.get('x-api-key');if(!token||!/^[a-f0-9]{64}$/.test(token))return error('unauthorized',401);
    const url=new URL(request.url);if(url.pathname!=='/api/hooks/marketplace/'+storeId||url.search||url.hash)throw TypeError();
    try{await body(request,262144,true);}catch{return error('invalid_input',400);}runtime=await deps.resolveRuntime();if(!runtime)return error('unavailable',503);
    await runtime.workflow.webhook(storeId,createHash('sha256').update(token).digest('hex'),deps.now());return json({accepted:true},202);
   }catch(caught){const code=trendyolHttpErrorCode(caught);return error(code,code==='not_connected'||code==='membership_denied'?401:code==='unavailable'||code==='commit_unknown'?503:400);}
  },
 });
}
