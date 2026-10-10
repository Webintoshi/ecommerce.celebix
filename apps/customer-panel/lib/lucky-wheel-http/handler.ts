import {isMerchantActionAllowed,parseLuckyWheelCampaign,parseLuckyWheelConfig,parseLuckyWheelDeleteResult,parseLuckyWheelHistoryResult,parseLuckyWheelRevokeResult,parseLuckyWheelManagedPromotionIndex,type MerchantAction} from '@celebix/saas-contracts';
import {LuckyWheelRepositoryError} from '@celebix/saas-data';
import {authorizeCatalogAdminRequest,catalogAdminHttpError,readCatalogAdminJsonBody,exactCatalogAdminHttpInput,catalogAdminOperationId,catalogAdminHttpId,catalogAdminHttpVersion} from '../catalog-admin-http/handler.ts';
import type {ServerLuckyWheelRuntime} from '../server-lucky-wheel/runtime.ts';
type Dependencies=Readonly<{resolveRuntime():Promise<ServerLuckyWheelRuntime|null>;now():Date;requestId():string}>;
const PATH='/api/discounts/lucky-wheel';
const json=(value:unknown)=>Response.json(value,{headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
function failure(error:unknown):Response {
 if(error instanceof LuckyWheelRepositoryError){const code=error.code,status=code==='invalid_input'?400:code==='unauthenticated'?401:['membership_denied','store_inactive','feature_not_enabled'].includes(code)?403:code==='not_found'?404:code==='rate_limited'?429:['version_conflict','operation_mismatch','campaign_unavailable','promotion_unavailable','invalid_reference','limit_exceeded','active_campaign_conflict','legacy_configuration','quota_exhausted'].includes(code)?409:503;return catalogAdminHttpError(status===503?'unavailable':code,status)}
 return catalogAdminHttpError('unavailable',503);
}
export function createLuckyWheelHandlers(deps:Dependencies){
 async function authorize(request:Request,method:'GET'|'POST',path:string,action:MerchantAction,query:'forbidden'|'allowed'='forbidden'){
  const auth=await authorizeCatalogAdminRequest(deps,request,method,path,query);if(auth instanceof Response)return auth;
  const t=auth.tenantContext;
  if(t.store.status!=='active')return catalogAdminHttpError('store_inactive',403);
  if(t.membership.status!=='active'||!isMerchantActionAllowed(t.membership.role,action))return catalogAdminHttpError('membership_denied',403);
  if(t.entitlements.status!=='active'||!t.entitlements.features.includes('promotions'))return catalogAdminHttpError('feature_not_enabled',403);
  return{...auth,runtime:auth.runtime as ServerLuckyWheelRuntime};
 }
 async function mutation(request:Request,action:'delete'|'revoke-coupons'){
  const auth=await authorize(request,'POST',`${PATH}/${action}`,action==='delete'?'promotions.archive':'promotions.publish');if(auth instanceof Response)return auth;
  const operationId=catalogAdminOperationId(request),row=exactCatalogAdminHttpInput(await readCatalogAdminJsonBody(request,1024),['campaignId','expectedVersion']);
  const campaignId=row?catalogAdminHttpId(row.campaignId):null,expectedVersion=row?catalogAdminHttpVersion(row.expectedVersion):null;
  if(!operationId||!campaignId||!expectedVersion)return catalogAdminHttpError('invalid_input',400);
  const input={tenantContext:auth.tenantContext,now:auth.now,operationId,campaignId,expectedVersion};
  try{if(action==='delete'){const deletion=parseLuckyWheelDeleteResult(await auth.runtime.luckyWheel.deleteCampaign(input));if(deletion.campaignId!==campaignId)throw Error();return json({deletion})}const revocation=parseLuckyWheelRevokeResult(await auth.runtime.luckyWheel.revokeCoupons(input));if(revocation.campaignId!==campaignId)throw Error();return json({revocation})}catch(error){return failure(error)}
 }
 return Object.freeze({
  async managedPromotions(request:Request){
   const auth=await authorize(request,'GET',`${PATH}/managed-promotions`,'promotions.read','allowed');if(auth instanceof Response)return auth;
   const query=new URL(request.url).searchParams,entries=[...query.entries()];if(entries.some(([key])=>!['limit','cursor'].includes(key))||new Set(entries.map(([key])=>key)).size!==entries.length)return catalogAdminHttpError('invalid_input',400);
   const rawLimit=query.get('limit'),limit=rawLimit===null?100:/^[1-9]\d{0,2}$/.test(rawLimit)?Number(rawLimit):0,cursor=query.get('cursor');if(limit<1||limit>200||cursor!==null&&(cursor.length>200||!/^\d{4}-\d{2}-\d{2}T[^|]+[|][a-f0-9-]{36}$/.test(cursor)))return catalogAdminHttpError('invalid_input',400);
   try{const managedPromotions=parseLuckyWheelManagedPromotionIndex(await auth.runtime.luckyWheel.managedPromotions({tenantContext:auth.tenantContext,now:auth.now,limit,cursor}));if(managedPromotions.items.length>limit)throw Error();return json({managedPromotions})}catch(error){return failure(error)}
  },
  async list(request:Request){const auth=await authorize(request,'GET',PATH,'promotions.read');if(auth instanceof Response)return auth;try{const rows=await auth.runtime.luckyWheel.list({tenantContext:auth.tenantContext,now:auth.now});if(!Array.isArray(rows)||rows.length>280)throw Error();const campaigns=rows.map(parseLuckyWheelCampaign);if(new Set(campaigns.map(c=>c.id)).size!==campaigns.length)throw Error();return json({campaigns})}catch(error){return failure(error)}},
  async save(request:Request){
   const auth=await authorize(request,'POST',PATH,'promotions.manage_draft');if(auth instanceof Response)return auth;
   const operationId=catalogAdminOperationId(request),row=exactCatalogAdminHttpInput(await readCatalogAdminJsonBody(request,16384),['name','enabled','config'],['campaignId','expectedVersion']);
   if(!row||!operationId||typeof row.name!=='string'||!row.name||row.name!==row.name.trim()||row.name.length>160||/[\u0000-\u001f\u007f-\u009f]/u.test(row.name)||typeof row.enabled!=='boolean')return catalogAdminHttpError('invalid_input',400);
   if(row.enabled&&!isMerchantActionAllowed(auth.tenantContext.membership.role,'promotions.publish'))return catalogAdminHttpError('membership_denied',403);
   const campaignId=row.campaignId===undefined?undefined:catalogAdminHttpId(row.campaignId),expectedVersion=row.expectedVersion===undefined?undefined:catalogAdminHttpVersion(row.expectedVersion);
   if(campaignId===null||expectedVersion===null||(campaignId===undefined)!==(expectedVersion===undefined))return catalogAdminHttpError('invalid_input',400);
   let config;try{config=parseLuckyWheelConfig(row.config)}catch{return catalogAdminHttpError('invalid_input',400)}
   try{const campaign=parseLuckyWheelCampaign(await auth.runtime.luckyWheel.save({tenantContext:auth.tenantContext,now:auth.now,operationId,...(campaignId===undefined?{}:{campaignId,expectedVersion}),name:row.name,enabled:row.enabled,config}));if(campaign.legacy||campaign.name!==row.name||campaign.enabled!==row.enabled||JSON.stringify(campaign.config)!==JSON.stringify(config)||campaign.version!==(expectedVersion===undefined?1:expectedVersion+1)||(campaignId&&campaign.id!==campaignId))throw Error();return json({campaign})}catch(error){return failure(error)}
  },
  async history(request:Request,rawId:unknown){const campaignId=catalogAdminHttpId(rawId);if(!campaignId)return catalogAdminHttpError('invalid_input',400);const auth=await authorize(request,'GET',`${PATH}/${campaignId}/history`,'promotions.read');if(auth instanceof Response)return auth;try{return json({history:parseLuckyWheelHistoryResult(await auth.runtime.luckyWheel.history({tenantContext:auth.tenantContext,now:auth.now,campaignId,limit:50}))})}catch(error){return failure(error)}},
  deleteCampaign:(request:Request)=>mutation(request,'delete'),revokeCoupons:(request:Request)=>mutation(request,'revoke-coupons'),
 });
}
