import {accountingUuid,accountingInteger,parseAccountingFilters,parseAccountingIntent,isMerchantActionAllowed,type AccountingMutation,type TenantContext} from '@celebix/saas-contracts';
import {readOrderPanelSessionCookie} from '../order-http/request-input.ts';
import {approvedPanelMutationOriginForStore,hasApprovedPanelMutationOriginShape} from '../panel-origin-authority.ts';
import type {ServerAccountingRuntime} from '../server-accounting/runtime.ts';
export type AccountingReadArea='overview'|'receivables'|'accounts'|'expenses'|'collection-accounts';
export type AccountingHttpDependencies=Readonly<{resolveRuntime():Promise<ServerAccountingRuntime|null>;now():Date;requestId():string}>;
const PATHS:Readonly<Record<AccountingMutation,string>>={collect:'collections',openingDebt:'opening-debts',saveAccount:'accounts',openBalance:'opening-balances',expense:'expenses',transfer:'transfers',settleCard:'card-settlements',reverse:'reversals',returnCredit:'returns',refund:'refunds'};
const STATUS:Readonly<Record<string,number>>={invalid_input:400,unauthenticated:401,membership_denied:403,store_inactive:403,feature_not_enabled:403,origin_denied:403,not_found:404,customer_not_found:404,order_not_found:404,account_not_found:404,resource_not_found:404,version_conflict:409,operation_mismatch:409,overpayment:409,insufficient_funds:409,amount_overflow:409,invalid_transition:409,currency_mismatch:409,durable_authority_invalid:503,unavailable:503,commit_unknown:503};
function json(data:unknown,status=200,headers:HeadersInit={}){return Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...headers}});}
function failure(code:string,status=STATUS[code]??503,headers:HeadersInit={}){return json({code},status,headers);}
type Authorized=Readonly<{runtime:ServerAccountingRuntime;tenantContext:TenantContext;now:Date}>;
async function authorize(deps:AccountingHttpDependencies,request:Request,method:'GET'|'POST',path:string,query=false,cashier=false):Promise<Authorized|Response>{
  try{
    if(request.method!==method)return failure('method_not_allowed',405,{allow:method});
    const runtime=await deps.resolveRuntime();if(!runtime)return failure('unavailable');
    if(method==='POST'&&!hasApprovedPanelMutationOriginShape(request,runtime.access.panelOrigin))return failure('origin_denied');
    const url=new URL(request.url);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||url.pathname!==path||(!query&&url.search))return failure('invalid_input');
    for(const[name]of request.headers)if(name==='authorization'||name.startsWith('x-celebix')||['x-panel-session-credential','x-store-id','x-tenant-id','x-principal-id','x-membership-id','x-plan-id','x-database-role','x-database-url'].includes(name))return failure('invalid_input');
    const cookie=readOrderPanelSessionCookie(request);if(cookie.kind!=='present')return failure('unauthenticated');
    const now=deps.now(),requestId=accountingUuid(deps.requestId());if(!(now instanceof Date)||!Number.isFinite(now.getTime()))return failure('unavailable');
    const access=await runtime.access.resolveCredential({hostname:request.headers.get('host'),credential:cookie.credential,requestId,now:new Date(now)});
    if(access.kind==='unauthenticated')return failure('unauthenticated');if(access.kind==='unauthorized')return failure('membership_denied');if(access.kind!=='authenticated')return failure('unavailable');
    if(method==='POST'&&!approvedPanelMutationOriginForStore(request,runtime.access.panelOrigin,access.tenantContext.store.slug))return failure('origin_denied');
    const role=access.tenantContext.membership.role;
    if(!isMerchantActionAllowed(role,method==='GET'?'accounting.read':'accounting.manage')&&!(cashier&&role==='cashier'))return failure('membership_denied');
    // Durable RPCs check the employee's collection grant for these narrow reads and mutations.
    return {runtime,tenantContext:access.tenantContext,now:new Date(now)};
  }catch{return failure('unavailable');}
}
function query(request:Request,allowed:readonly string[]){const params=new URL(request.url).searchParams;for(const key of params.keys())if(!allowed.includes(key)||params.getAll(key).length!==1)throw TypeError('invalid_input');return parseAccountingFilters(Object.fromEntries(params));}
async function body(request:Request):Promise<unknown>{
  if(request.headers.get('content-type')!=='application/json'||request.headers.has('transfer-encoding')||!request.body)throw TypeError('invalid_input');
  const declared=request.headers.get('content-length');if(declared!==null&&(!/^(0|[1-9]\d*)$/.test(declared)||Number(declared)>65536))throw TypeError('invalid_input');
  const reader=request.body.getReader(),parts:Uint8Array[]=[];let length=0;
  try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>65536){await reader.cancel();throw TypeError('invalid_input');}parts.push(part.value);}}finally{reader.releaseLock();}
  if(length===0||declared!==null&&Number(declared)!==length)throw TypeError('invalid_input');
  const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
async function execute(run:()=>Promise<unknown>){try{return json({data:await run()});}catch(error){const code=error instanceof Error&&'code'in error?String(error.code):'unavailable';return failure(Object.hasOwn(STATUS,code)?code:'unavailable');}}
export function createAccountingHttpHandlers(deps:AccountingHttpDependencies){
  if(!deps||typeof deps.resolveRuntime!=='function'||typeof deps.now!=='function'||typeof deps.requestId!=='function')throw TypeError('accounting_http_invalid');
  return Object.freeze({
    async preview(request:Request){
      const auth=await authorize(deps,request,'GET','/api/accounting/collection-preview',true,true);if(auth instanceof Response)return auth;
      let filters,amountCents;try{const params=new URL(request.url).searchParams;for(const key of params.keys())if(!['customerId','orderId','currency','amountCents'].includes(key)||params.getAll(key).length!==1)throw TypeError('invalid_input');const amount=params.get('amountCents');if(amount===null||! /^[1-9]\d*$/.test(amount))throw TypeError('invalid_input');amountCents=accountingInteger(Number(amount),1);params.delete('amountCents');filters=parseAccountingFilters(Object.fromEntries(params));if(!filters.customerId)throw TypeError('invalid_input');}catch{return failure('invalid_input');}
      return execute(()=>auth.runtime.accounting.previewCollection({tenantContext:auth.tenantContext,now:auth.now,customerId:filters.customerId!,amountCents,...(filters.currency?{currency:filters.currency}:{}),...(filters.orderId?{orderId:filters.orderId}:{})}));
    },
    async get(request:Request,area:AccountingReadArea){
      if(!['overview','receivables','accounts','expenses','collection-accounts'].includes(area))return failure('invalid_input');
      const auth=await authorize(deps,request,'GET',`/api/accounting/${area}`,true,area==='receivables'||area==='collection-accounts');if(auth instanceof Response)return auth;
      let filters;try{filters=query(request,area==='collection-accounts'?[]:['dateFrom','dateTo','channel','currency','query','customerId','orderId']);}catch{return failure('invalid_input');}
      if(area==='collection-accounts')return execute(()=>auth.runtime.accounting.collectionAccounts({tenantContext:auth.tenantContext,now:auth.now}));
      return execute(()=>auth.runtime.accounting[area]({tenantContext:auth.tenantContext,now:auth.now,filters}));
    },
    async customer(request:Request,rawId:unknown){
      let customerId;try{customerId=accountingUuid(rawId);}catch{return failure('invalid_input');}
      const auth=await authorize(deps,request,'GET',`/api/accounting/customers/${customerId}`,true,true);if(auth instanceof Response)return auth;
      let filters;try{filters=query(request,['currency']);}catch{return failure('invalid_input');}
      return execute(()=>auth.runtime.accounting.customerAccount({tenantContext:auth.tenantContext,now:auth.now,customerId,...filters}));
    },
    async order(request:Request,rawId:unknown){let orderId;try{orderId=accountingUuid(rawId);}catch{return failure('invalid_input');}const auth=await authorize(deps,request,'GET',`/api/accounting/orders/${orderId}`,false,true);if(auth instanceof Response)return auth;return execute(()=>auth.runtime.accounting.orderFinance({tenantContext:auth.tenantContext,now:auth.now,orderId}));},
    async operation(request:Request,rawId:unknown){let operationId;try{operationId=accountingUuid(rawId);}catch{return failure('invalid_input');}const auth=await authorize(deps,request,'GET',`/api/accounting/operations/${operationId}`,false,true);if(auth instanceof Response)return auth;return execute(()=>auth.runtime.accounting.operation({tenantContext:auth.tenantContext,now:auth.now,operationId}));},
    async mutate<K extends AccountingMutation>(request:Request,kind:K){
      if(!Object.hasOwn(PATHS,kind))return failure('invalid_input');
      const auth=await authorize(deps,request,'POST',`/api/accounting/${PATHS[kind]}`,false,kind==='collect');if(auth instanceof Response)return auth;
      let operationId,intent;try{operationId=accountingUuid(request.headers.get('idempotency-key'));intent=parseAccountingIntent(kind,await body(request));}catch{return failure('invalid_input');}
      const input={tenantContext:auth.tenantContext,now:auth.now,operationId};const repo=auth.runtime.accounting;
      switch(kind){
        case'collect':return execute(()=>repo.collect({...input,intent:parseAccountingIntent('collect',intent)}));
        case'openingDebt':return execute(()=>repo.openingDebt({...input,intent:parseAccountingIntent('openingDebt',intent)}));
        case'saveAccount':return execute(()=>repo.saveAccount({...input,intent:parseAccountingIntent('saveAccount',intent)}));
        case'openBalance':return execute(()=>repo.openBalance({...input,intent:parseAccountingIntent('openBalance',intent)}));
        case'expense':return execute(()=>repo.expense({...input,intent:parseAccountingIntent('expense',intent)}));
        case'transfer':return execute(()=>repo.transfer({...input,intent:parseAccountingIntent('transfer',intent)}));
        case'settleCard':return execute(()=>repo.settleCard({...input,intent:parseAccountingIntent('settleCard',intent)}));
        case'reverse':return execute(()=>repo.reverse({...input,intent:parseAccountingIntent('reverse',intent)}));
        case'returnCredit':return execute(()=>repo.returnCredit({...input,intent:parseAccountingIntent('returnCredit',intent)}));
        case'refund':return execute(()=>repo.refund({...input,intent:parseAccountingIntent('refund',intent)}));
      }
      return failure('invalid_input');
    },
  });
}
