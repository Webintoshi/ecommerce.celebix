import { createHash, randomBytes } from 'node:crypto';
import { isMerchantActionAllowed, parseGoogleMarketingService, parseGoogleMarketingSelection, type TenantContext } from '@celebix/saas-contracts';
import { googleMarketingErrorCode } from '@celebix/saas-data';
import { readOrderPanelSessionCookie } from '../order-http/request-input.ts';
import { approvedPanelMutationOriginForStore, hasApprovedPanelMutationOriginShape } from '../panel-origin-authority.ts';
import type { ServerGoogleMarketingRuntime } from '../server-google-marketing/runtime.ts';

type PostArea='connect'|'apply'|'disconnect'|'complete';
type GetArea='overview'|'resources';
type Deps=Readonly<{resolveRuntime():Promise<ServerGoogleMarketingRuntime|null>;now():Date;requestId():string}>;
type Authorized=Readonly<{runtime:ServerGoogleMarketingRuntime;tenantContext:TenantContext;now:Date;sessionBinding:string}>;
const ROOT='/api/marketing/google';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const STATUS:Record<string,number>={invalid_input:400,oauth_state_invalid:400,unauthenticated:401,membership_denied:403,store_inactive:403,origin_denied:403,oauth_denied:403,provider_denied:403,resource_denied:403,feature_not_enabled:403,record_not_found:404,wrong_domain:409,unsafe_container:409,live_version_conflict:409,version_conflict:409,operation_mismatch:409,operation_busy:409,incremental_authorization_required:409,verification_pending:409,needs_reconnect:409,provider_limit:429,oauth_unconfigured:503,crypto_unavailable:503,ads_project_unapproved:503,unavailable:503};
function json(value:unknown,status=200){return Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});}
function error(code:string,status:number){return json({code},status);}
function exact(value:unknown,required:string[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!required.includes(key)))throw new TypeError();
  return value as Record<string,unknown>;
}
function text(value:unknown,max:number,min=1):string {
  if(typeof value!=='string'||value.length<min||value.length>max||/[\u0000-\u001f\u007f]/u.test(value))throw new TypeError();return value;
}
function version(value:unknown):number {if(!Number.isSafeInteger(value)||(value as number)<0)throw new TypeError();return value as number;}
function operation(request:Request):string {const value=request.headers.get('idempotency-key');if(!value||!UUID.test(value))throw new TypeError();return value;}
async function body(request:Request):Promise<unknown>{
  if(request.headers.get('content-type')!=='application/json'||request.headers.has('transfer-encoding')||!request.body)throw new TypeError();
  const length=request.headers.get('content-length');
  if(length!==null&&(!/^(?:0|[1-9]\d*)$/.test(length)||Number(length)>16_384))throw new TypeError();
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{for(;;){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>16_384){await reader.cancel();throw new TypeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
  if(!total||length!==null&&Number(length)!==total)throw new TypeError();
  const data=new Uint8Array(total);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
}
function requestUrl(request:Request,path:string,query=false):URL {
  const url=new URL(request.url);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||url.pathname!==path||!query&&url.search)throw new TypeError();
  for(const [header]of request.headers)if(header==='authorization'||header.startsWith('x-celebix')||['x-store-id','x-tenant-id','x-principal-id','x-membership-id','x-plan-id','x-database-url'].includes(header))throw new TypeError();
  return url;
}
async function authorize(deps:Deps,request:Request,method:string,path:string,query=false):Promise<Authorized|Response>{
  if(request.method!==method)return error('method_not_allowed',405);
  try{requestUrl(request,path,query);}catch{return error('invalid_input',400);}
  let runtime:ServerGoogleMarketingRuntime|null;try{runtime=await deps.resolveRuntime();}catch{return error('unavailable',503);}if(!runtime)return error('unavailable',503);
  const write=method!=='GET';
  if(write&&!hasApprovedPanelMutationOriginShape(request,runtime.access.panelOrigin))return error('origin_denied',403);
  const cookie=readOrderPanelSessionCookie(request);if(cookie.kind!=='present')return error('unauthenticated',401);
  const now=deps.now(),requestId=deps.requestId();if(!(now instanceof Date)||!Number.isFinite(now.getTime())||!UUID.test(requestId))return error('unavailable',503);
  let access;try{access=await runtime.access.resolveCredential({hostname:request.headers.get('host'),credential:cookie.credential,requestId,now});}catch{return error('unavailable',503);}
  if(access.kind==='unauthenticated')return error('unauthenticated',401);if(access.kind==='unauthorized')return error('membership_denied',403);if(access.kind!=='authenticated')return error('unavailable',503);
  if(write&&!approvedPanelMutationOriginForStore(request,runtime.access.panelOrigin,access.tenantContext.store.slug))return error('origin_denied',403);
  if(!isMerchantActionAllowed(access.tenantContext.membership.role,write?'integrations.manage':'integrations.read'))return error('membership_denied',403);
  return {runtime,tenantContext:access.tenantContext,now,sessionBinding:createHash('sha256').update(cookie.credential).digest('hex')};
}
async function execute(run:()=>Promise<unknown>){try{return json(await run());}catch(caught){const code=googleMarketingErrorCode(caught);return error(code,STATUS[code]??503);}}

// Google first returns to one registered origin. A fragment hop restores the original
// tenant origin, then a same-origin POST also restores Strict support cookies.
function completionBridge():Response {
  const nonce=randomBytes(24).toString('base64');
  const script=`(async()=>{const params=new URLSearchParams(location.hash.slice(1));history.replaceState(null,'','${ROOT}/callback');const status=document.getElementById('status');if(params.has('error')||!params.get('code')||!params.get('state')){location.replace('/marketing/google?google=cancelled');return;}try{const response=await fetch('${ROOT}/complete',{method:'POST',credentials: 'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({state:params.get('state'),code:params.get('code')})});if(!response.ok){status.textContent='Google bağlantısı tamamlanamadı. Yönetim ekranından yeniden bağlanın.';return;}location.replace('/marketing/google?google=connected');}catch{status.textContent='Bağlantı kesildi. Yönetim ekranından yeniden bağlanın.';}})();`;
  return new Response(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google bağlantısı</title></head><body><p id="status" role="status">Google bağlantısı tamamlanıyor…</p><p><a href="/marketing/google">Google Bağlantıları’na dön</a></p><script nonce="${nonce}">${script}</script></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':`default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`}});
}
export function createGoogleMarketingHttpHandlers(deps:Deps){return Object.freeze({
  async get(request:Request,area:GetArea){
    const authorized=await authorize(deps,request,'GET',area==='overview'?ROOT:`${ROOT}/resources`,area==='resources');if(authorized instanceof Response)return authorized;
    const {runtime,tenantContext,now}=authorized;if(area==='overview')return execute(()=>runtime.google.overview({tenantContext,now}));
    let service,accountId;try{const params=new URL(request.url).searchParams;if([...params.keys()].some(k=>!['service','accountId'].includes(k)||params.getAll(k).length!==1))throw new TypeError();service=parseGoogleMarketingService(params.get('service'));accountId=params.has('accountId')?text(params.get('accountId'),160):undefined;}catch{return error('invalid_input',400);}
    return execute(()=>runtime.google.resources({tenantContext,now,service,...(accountId===undefined?{}:{accountId})}));
  },
  async post(request:Request,area:PostArea){
    const authorized=await authorize(deps,request,'POST',`${ROOT}/${area}`);if(authorized instanceof Response)return authorized;
    const {runtime,tenantContext,now,sessionBinding}=authorized;let value:unknown;try{value=await body(request);}catch{return error('invalid_input',400);}
    try{
      if(area==='complete'){const v=exact(value,['state','code']);const state=text(v.state,256,32),code=text(v.code,4096);return execute(()=>runtime.google.complete({tenantContext,now,sessionBinding,state,code}));}
      const operationId=operation(request);
      if(area==='connect'){const v=exact(value,['service']);const service=parseGoogleMarketingService(v.service);return execute(()=>runtime.google.begin({tenantContext,now,service,operationId,sessionBinding,returnOrigin:request.headers.get('origin')!}));}
      const v=exact(value,area==='apply'?['service','expectedVersion','selection']:['service','expectedVersion']);const service=parseGoogleMarketingService(v.service),expectedVersion=version(v.expectedVersion);
      if(area==='disconnect')return execute(()=>runtime.google.disconnect({tenantContext,now,service,expectedVersion,operationId}));
      const selection=parseGoogleMarketingSelection(v.selection);return execute(()=>runtime.google.apply({tenantContext,now,service,expectedVersion,operationId,selection}));
    }catch{return error('invalid_input',400);}
  },
  async callback(request:Request){
    if(request.method!=='GET')return error('method_not_allowed',405);
    let url:URL;try{url=requestUrl(request,`${ROOT}/callback`,true);}catch{return error('invalid_input',400);}
    if(!url.search)return completionBridge();
    let state:string,code:string|undefined,cancelled:boolean;
    try{const p=url.searchParams;const allowed=['state','code','error','error_description','scope','authuser','prompt','hd','iss'];if(url.search.length>8192||[...p.keys()].some(k=>!allowed.includes(k)||p.getAll(k).length!==1))throw new TypeError();state=text(p.get('state'),256,32);cancelled=p.has('error');code=cancelled?undefined:text(p.get('code'),4096);}catch{return error('invalid_input',400);}
    let runtime:ServerGoogleMarketingRuntime|null;try{runtime=await deps.resolveRuntime();}catch{return error('unavailable',503);}if(!runtime)return error('unavailable',503);
    const now=deps.now();if(!Number.isFinite(now.getTime()))return error('unavailable',503);
    try{
      const destination=await runtime.google.resolveOAuthReturn({state,now});if(!destination)return error('invalid_input',400);
      const origin=new URL(destination.returnOrigin);if(origin.protocol!=='https:'||origin.origin!==destination.returnOrigin)return error('invalid_input',400);
      const fragment=new URLSearchParams({state,...(cancelled?{error:'cancelled'}:{code:code!})});
      return new Response(null,{status:303,headers:{location:`${origin.origin}${ROOT}/callback#${fragment}`,'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
    }catch{return error('unavailable',503);}
  },
});}
