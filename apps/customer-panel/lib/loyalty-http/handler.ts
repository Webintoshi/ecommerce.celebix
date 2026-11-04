import {isMerchantActionAllowed,loyaltyExact,loyaltyInteger,loyaltyText,loyaltyUuid,parseLoyaltyAdminPayload,type LoyaltyAdminAction,type TenantContext} from '@celebix/saas-contracts';
import {LoyaltyRepositoryError} from '@celebix/saas-data';
import {readOrderPanelSessionCookie} from '../order-http/request-input.ts';
import {hasApprovedPanelMutationOriginShape,approvedPanelMutationOriginForStore} from '../panel-origin-authority.ts';
import type {ServerLoyaltyRuntime} from '../server-loyalty/runtime.ts';
type Dependencies=Readonly<{resolveRuntime():Promise<ServerLoyaltyRuntime|null>;now():Date;requestId():string}>;
function json(value:unknown,status=200):Response{return Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});}
function failure(code:string,status:number){return json({code},status);}
type Route=Readonly<{action:LoyaltyAdminAction|'recover';method:'GET'|'POST';payload?:unknown}>;
function route(request:Request):Route|null{
 const url=new URL(request.url),path=url.pathname;if(request.method==='GET'&&path==='/api/loyalty'&&!url.search)return{action:'list',method:'GET',payload:{}};
 const report=/^\/api\/loyalty\/([0-9a-f-]{36})\/report$/u.exec(path);
 if(request.method==='GET'&&report){if([...url.searchParams.keys()].some(k=>!['limit','cursor'].includes(k))||[...new Set(url.searchParams.keys())].some(k=>url.searchParams.getAll(k).length>1))throw new TypeError('invalid_input');return{action:'report',method:'GET',payload:{programId:loyaltyUuid(report[1]),...(url.searchParams.has('limit')?{limit:loyaltyInteger(Number(url.searchParams.get('limit')),1,100)}:{}),...(url.searchParams.has('cursor')?{cursor:loyaltyText(url.searchParams.get('cursor'),2048)}:{})}};}
 const marker=path.slice('/api/loyalty/'.length);if(request.method==='POST'&&path.startsWith('/api/loyalty/')&&!url.search&&['save','pause','duplicate','adjust','approve-pos','prepare-pos-reward','recover'].includes(marker))return{action:marker as Route['action'],method:'POST'};return null;
}
async function body(request:Request):Promise<unknown>{
 if(!/^application\/json(?:\s*;|$)/iu.test(request.headers.get('content-type')??''))throw new TypeError('invalid_input');
 const reader=request.body?.getReader();if(!reader)throw new TypeError('invalid_input');let length=0;const parts:Uint8Array[]=[];
 try{for(;;){const item=await reader.read();if(item.done)break;length+=item.value.byteLength;if(length>65_536){await reader.cancel();throw new TypeError('invalid_input');}parts.push(item.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function authority(tenant:TenantContext,action:LoyaltyAdminAction):boolean{return tenant.store.status==='active'&&tenant.membership.status==='active'&&tenant.entitlements.status==='active'&&tenant.entitlements.features.includes('promotions')&&(action==='approve-pos'||action==='prepare-pos-reward'?['store_owner','admin','cashier'].includes(tenant.membership.role):isMerchantActionAllowed(tenant.membership.role,action==='list'||action==='report'?'promotions.read':'promotions.publish'));}
function privateAuthority(request:Request){return [...request.headers.keys()].some(key=>['authorization','x-panel-session-credential','x-store-id','x-tenant-id','x-principal-id','x-membership-id','x-plan-id','x-database-role','x-database-url'].includes(key)||['x-celebix','x-store-','x-tenant-','x-principal-','x-membership-','x-plan-'].some(prefix=>key.startsWith(prefix)));}
export function createLoyaltyHttpHandler(dependencies:Dependencies){return async function handle(request:Request):Promise<Response>{
 try{
  if(privateAuthority(request))return failure('invalid_input',400);const selected=route(request);if(!selected)return failure('not_found',404);
  const cookie=readOrderPanelSessionCookie(request);if(cookie.kind!=='present')return failure('unauthenticated',401);
  let runtime:ServerLoyaltyRuntime|null;try{runtime=await dependencies.resolveRuntime();}catch{return failure('loyalty_unavailable',503);}if(!runtime)return failure('loyalty_unavailable',503);
  if(selected.method==='POST'&&!hasApprovedPanelMutationOriginShape(request,runtime.access.panelOrigin))return failure('origin_denied',403);
  const now=dependencies.now(),requestId=loyaltyUuid(dependencies.requestId());if(!(now instanceof Date)||!Number.isFinite(now.getTime()))return failure('loyalty_unavailable',503);
  const access=await runtime.access.resolveCredential({hostname:request.headers.get('host'),credential:cookie.credential,requestId,now});
  if(access.kind!=='authenticated')return failure(access.kind==='unauthenticated'?'unauthenticated':access.kind==='unauthorized'?'membership_denied':'loyalty_unavailable',access.kind==='unauthenticated'?401:access.kind==='unauthorized'?403:503);
  if(selected.method==='POST'&&!approvedPanelMutationOriginForStore(request,runtime.access.panelOrigin,access.tenantContext.store.slug))return failure('origin_denied',403);
  let action=selected.action,payload=selected.payload,operationId:string|undefined;
  if(selected.method==='POST'){const command=loyaltyExact(await body(request),['operationId','payload']);operationId=loyaltyUuid(command.operationId);payload=command.payload;}
  const recovering=action==='recover';if(recovering){const original=loyaltyExact(payload,['action','payload']);if(typeof original.action!=='string'||!['save','pause','duplicate','adjust','approve-pos','prepare-pos-reward'].includes(original.action))return failure('invalid_input',400);action=original.action as LoyaltyAdminAction;payload=original.payload;}
  if(action==='recover')return failure('invalid_input',400);if(!authority(access.tenantContext,action))return failure('membership_denied',403);
  const parsed=parseLoyaltyAdminPayload(action,payload),input={tenantContext:access.tenantContext,now,action,payload:parsed,...(operationId?{operationId}:{})};
  const result=recovering?await runtime.loyalty.recover({...input,operationId:operationId!}):await runtime.loyalty.command(input);
  return json(result);
 }catch(error){
  if(error instanceof LoyaltyRepositoryError){const code=error.code;return failure(code,code==='unavailable'||code==='operation_result_invalid'?503:code==='rate_limited'?429:['unauthenticated'].includes(code)?401:['membership_denied','durable_authority_invalid','store_inactive','feature_not_enabled'].includes(code)?403:['not_found','resource_not_found'].includes(code)?404:['version_conflict','operation_mismatch','idempotency_mismatch','conflict','program_limit_reached','limit_exceeded','reward_unavailable','approval_invalid','conditions_not_met','invalid_transition'].includes(code)?409:400);}
  if(error instanceof TypeError||error instanceof SyntaxError)return failure('invalid_input',400);return failure('loyalty_unavailable',503);
 }
};}
