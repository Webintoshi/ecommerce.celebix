import {exactInStoreRecord,parseInStoreBootstrap,parseInStoreProduct,parseInStoreSale,parseInStoreSalePage,parseInStoreSaleResult,parseInStoreStaffGrant,parseInStoreUuid,type TenantContext} from '@celebix/saas-contracts';
import {inStoreSalesRepositoryErrorCode,InStoreSalesRepositoryError} from '@celebix/saas-data';
import {approvedPanelMutationOriginForStore} from '../panel-origin-authority.ts';
import {readOrderPanelSessionCookie} from '../order-http/request-input.ts';
import type {ServerInStoreSalesRuntime} from '../server-in-store-sales/runtime.ts';
import {inStoreRequestAuthorityDecision,type InStoreRequestExpectation} from './request-authority.ts';
import {readInStoreMutationInput,readInStoreProductsInput,readInStoreSalesInput,type InStoreMutationKind} from './request-input.ts';
export type InStoreSalesHttpDependencies=Readonly<{resolveRuntime():Promise<ServerInStoreSalesRuntime|null>;now():Date;requestId():string}>;
const BASE='/api/orders/in-store';
const errors:Readonly<Record<string,number>>=Object.freeze({invalid_input:400,unauthenticated:401,membership_denied:403,store_inactive:403,feature_not_enabled:403,origin_denied:403,not_found:404,ambiguous_barcode:409,version_conflict:409,operation_mismatch:409,invalid_transition:409,inventory_conflict:409,pricing_unavailable:409,discount_denied:403,discount_invalid:400,unavailable:503});
function json(value:unknown,status=200,headers:HeadersInit={}):Response{return Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...headers}});}
function error(code:string,status=errors[code]??503,headers:HeadersInit={}):Response{return json({code},status,headers);}
type Authorized={runtime:ServerInStoreSalesRuntime;tenantContext:TenantContext;now:Date};
async function authorize(deps:InStoreSalesHttpDependencies,request:Request,expectation:InStoreRequestExpectation):Promise<Authorized|Response> {
  try {
    const runtime=await deps.resolveRuntime();if(!runtime)return error('unavailable');
    const decision=inStoreRequestAuthorityDecision(request,expectation,runtime.access.panelOrigin);
    if(decision==='method_not_allowed')return error(decision,405,{allow:expectation.method});if(decision!=='approved')return error(decision);
    const cookie=readOrderPanelSessionCookie(request);if(cookie.kind!=='present')return error('unauthenticated');
    const now=deps.now();const requestId=parseInStoreUuid(deps.requestId());if(!(now instanceof Date)||!Number.isFinite(now.getTime()))return error('unavailable');
    const access=await runtime.access.resolveCredential({hostname:request.headers.get('host'),credential:cookie.credential,requestId,now:new Date(now)});
    if(access.kind==='unauthenticated')return error('unauthenticated');if(access.kind==='unauthorized')return error('membership_denied');if(access.kind!=='authenticated')return error('unavailable');
    if(expectation.method!=='GET'&&!approvedPanelMutationOriginForStore(request,runtime.access.panelOrigin,access.tenantContext.store.slug))return error('origin_denied');
    return {runtime,tenantContext:access.tenantContext,now:new Date(now)};
  }catch{return error('unavailable');}
}
async function execute(operation:()=>Promise<unknown>,parse:(value:unknown)=>unknown):Promise<Response>{
  try{return json({data:parse(await operation())});}catch(caught){const code=inStoreSalesRepositoryErrorCode(caught);return code&&Object.hasOwn(errors,code)?error(code):error('unavailable');}
}
function collection<T>(value:unknown,key:string,max:number,parse:(value:unknown)=>T):Readonly<Record<string,readonly T[]>> {
  const r=exactInStoreRecord(value,[key]);const values=r[key];if(!Array.isArray(values)||values.length>max||Object.keys(values).length!==values.length)throw new TypeError('in_store_response_invalid');return Object.freeze({[key]:Object.freeze(values.map(parse))});
}
export function createInStoreSalesHttpHandlers(deps:InStoreSalesHttpDependencies) {
  if(!deps||typeof deps.resolveRuntime!=='function'||typeof deps.now!=='function'||typeof deps.requestId!=='function')throw new TypeError('in_store_http_invalid');
  async function read(request:Request,path:string,query:boolean,run:(auth:Authorized)=>Promise<unknown>,parse:(value:unknown)=>unknown){
    const auth=await authorize(deps,request,{method:'GET',pathname:BASE+path,query});if(auth instanceof Response)return auth;return execute(()=>run(auth),parse);
  }
  async function mutate(request:Request,kind:Exclude<InStoreMutationKind,'create'|'staff'>,rawId:unknown) {
    let saleId:string;try{saleId=parseInStoreUuid(rawId);}catch{return error('invalid_input');}
    const path=`${BASE}/sales/${saleId}${kind==='update'?'':`/${kind}`}`;
    const auth=await authorize(deps,request,{method:kind==='update'?'PATCH':'POST',pathname:path});if(auth instanceof Response)return auth;
    const input=await readInStoreMutationInput(request,kind);if(!input)return error('invalid_input');
    const base={tenantContext:auth.tenantContext,now:auth.now,saleId,operationId:input.operationId};
    return execute(()=>{
      const repo=auth.runtime.sales;
      switch(kind) {
        case 'update':return repo.updateSale({...base,...input.value as import('./request-input.ts').InStoreMutationBodies['update']});
        case 'hold':return repo.holdSale({...base,...input.value as import('./request-input.ts').InStoreMutationBodies['hold']});
        case 'prepare':return repo.prepareSale({...base,...input.value as import('./request-input.ts').InStoreMutationBodies['prepare']});
        case 'payment':return repo.confirmPayment({...base,...input.value as import('./request-input.ts').InStoreMutationBodies['payment']});
        case 'complete':return repo.completeSale({...base,...input.value as import('./request-input.ts').InStoreMutationBodies['complete']});
        case 'cancel':return repo.cancelSale({...base,...input.value as import('./request-input.ts').InStoreMutationBodies['cancel']});
        case 'takeover':return repo.takeoverSale({...base,...input.value as import('./request-input.ts').InStoreMutationBodies['takeover']});
      }
    },v=>{const result=parseInStoreSaleResult(v);if(result.sale.id!==saleId)throw new TypeError('in_store_response_invalid');return result;});
  }
  return Object.freeze({
    bootstrap:(request:Request)=>read(request,'/bootstrap',false,a=>a.runtime.sales.bootstrap({tenantContext:a.tenantContext,now:a.now}),parseInStoreBootstrap),
    searchProducts:(request:Request)=>read(request,'/products',true,a=>{const input=readInStoreProductsInput(request);return input?a.runtime.sales.searchProducts({tenantContext:a.tenantContext,now:a.now,...input}):Promise.reject(new InStoreSalesRepositoryError('invalid_input'));},v=>collection(v,'products',20,parseInStoreProduct)),
    listSales:(request:Request)=>read(request,'/sales',true,a=>{const input=readInStoreSalesInput(request);return input?a.runtime.sales.listSales({tenantContext:a.tenantContext,now:a.now,...input}):Promise.reject(new InStoreSalesRepositoryError('invalid_input'));},parseInStoreSalePage),
    async getSale(request:Request,rawId:unknown){let saleId:string;try{saleId=parseInStoreUuid(rawId);}catch{return error('invalid_input');}return read(request,`/sales/${saleId}`,false,a=>a.runtime.sales.getSale({tenantContext:a.tenantContext,now:a.now,saleId}),parseInStoreSale);},
    async getOperation(request:Request,rawId:unknown){let operationId:string;try{operationId=parseInStoreUuid(rawId);}catch{return error('invalid_input');}return read(request,`/operations/${operationId}`,false,a=>a.runtime.sales.getOperation({tenantContext:a.tenantContext,now:a.now,operationId}),v=>v===null?null:parseInStoreSaleResult(v));},
    async createSale(request:Request){const a=await authorize(deps,request,{method:'POST',pathname:BASE+'/sales'});if(a instanceof Response)return a;const input=await readInStoreMutationInput(request,'create');if(!input)return error('invalid_input');return execute(()=>a.runtime.sales.createSale({tenantContext:a.tenantContext,now:a.now,operationId:input.operationId,...input.value}),parseInStoreSaleResult);},
    updateSale:(request:Request,id:unknown)=>mutate(request,'update',id),holdSale:(request:Request,id:unknown)=>mutate(request,'hold',id),prepareSale:(request:Request,id:unknown)=>mutate(request,'prepare',id),confirmPayment:(request:Request,id:unknown)=>mutate(request,'payment',id),completeSale:(request:Request,id:unknown)=>mutate(request,'complete',id),cancelSale:(request:Request,id:unknown)=>mutate(request,'cancel',id),takeoverSale:(request:Request,id:unknown)=>mutate(request,'takeover',id),
    listStaff:(request:Request)=>read(request,'/staff',false,a=>a.runtime.sales.listStaff({tenantContext:a.tenantContext,now:a.now}),v=>collection(v,'staff',1000,parseInStoreStaffGrant)),
    async setStaffGrant(request:Request,rawId:unknown){let membershipId:string;try{membershipId=parseInStoreUuid(rawId);}catch{return error('invalid_input');}const a=await authorize(deps,request,{method:'POST',pathname:`${BASE}/staff/${membershipId}`});if(a instanceof Response)return a;const input=await readInStoreMutationInput(request,'staff');if(!input)return error('invalid_input');return execute(()=>a.runtime.sales.setStaffGrant({tenantContext:a.tenantContext,now:a.now,membershipId,operationId:input.operationId,...input.value}),parseInStoreStaffGrant);},
  });
}
