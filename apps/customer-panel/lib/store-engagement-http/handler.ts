import { isMerchantActionAllowed, parseStoreEngagementCampaign, parseStoreEngagementConfig, parseStoreEngagementDeleteResult } from '@celebix/saas-contracts';
import { StoreEngagementRepositoryError } from '@celebix/saas-data';
import { authorizeCatalogAdminRequest, catalogAdminHttpError, readCatalogAdminJsonBody, exactCatalogAdminHttpInput, catalogAdminOperationId, catalogAdminHttpId, catalogAdminHttpVersion } from '../catalog-admin-http/handler.ts';
import type { ServerStoreEngagementRuntime } from '../server-store-engagement/runtime.ts';
type Dependencies=Readonly<{resolveRuntime():Promise<ServerStoreEngagementRuntime|null>;now():Date;requestId():string}>;
const PATH='/api/store-engagement/campaigns';
function json(value:unknown){return Response.json(value,{headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});}
function failure(error:unknown):Response {
 if(error instanceof StoreEngagementRepositoryError){const code=error.code;const status=code==='invalid_input'?400:code==='unauthenticated'?401:['membership_denied','store_inactive','feature_not_enabled'].includes(code)?403:code==='not_found'?404:code==='rate_limited'?429:['version_conflict','operation_mismatch','contact_conflict','campaign_unavailable','cart_unavailable','promotion_unavailable','invalid_reference','limit_exceeded','image_invalid'].includes(code)?409:503;return catalogAdminHttpError(status===503?'unavailable':code,status);}
 return catalogAdminHttpError('unavailable',503);
}
export function createStoreEngagementHandlers(deps:Dependencies){
 return Object.freeze({
  async list(request:Request):Promise<Response>{
   const auth=await authorizeCatalogAdminRequest(deps,request,'GET',PATH,'forbidden');if(auth instanceof Response)return auth;
   if(!isMerchantActionAllowed(auth.tenantContext.membership.role,'configuration.read'))return catalogAdminHttpError('membership_denied',403);
   try{const rows=await (auth.runtime as ServerStoreEngagementRuntime).engagement.list({tenantContext:auth.tenantContext,now:auth.now});if(!Array.isArray(rows)||rows.length>21)throw new Error('invalid_result');return json({campaigns:rows.map(parseStoreEngagementCampaign)});}catch(error){return failure(error);}
  },
  async save(request:Request):Promise<Response>{
   const auth=await authorizeCatalogAdminRequest(deps,request,'POST',PATH,'forbidden');if(auth instanceof Response)return auth;
   if(!isMerchantActionAllowed(auth.tenantContext.membership.role,'configuration.manage'))return catalogAdminHttpError('membership_denied',403);
   const operationId=catalogAdminOperationId(request);const row=exactCatalogAdminHttpInput(await readCatalogAdminJsonBody(request,8192),['kind','name','enabled','config'],['campaignId','expectedVersion']);
   if(!row||!operationId||!['popup','cart_capture'].includes(String(row.kind))||typeof row.name!=='string'||row.name!==row.name.trim()||row.name.length<1||row.name.length>160||/[\u0000-\u001f\u007f-\u009f]/u.test(row.name)||typeof row.enabled!=='boolean')return catalogAdminHttpError('invalid_input',400);
   const campaignId=row.campaignId===undefined?undefined:catalogAdminHttpId(row.campaignId);const expectedVersion=row.expectedVersion===undefined?undefined:catalogAdminHttpVersion(row.expectedVersion);
   if(campaignId===null||expectedVersion===null||(campaignId===undefined)!==(expectedVersion===undefined))return catalogAdminHttpError('invalid_input',400);
   let config;try{config=parseStoreEngagementConfig(row.config);}catch{return catalogAdminHttpError('invalid_input',400);}
   try{const campaign=await (auth.runtime as ServerStoreEngagementRuntime).engagement.save({tenantContext:auth.tenantContext,now:auth.now,operationId,...(campaignId===undefined?{}:{campaignId,expectedVersion}),kind:row.kind as 'popup'|'cart_capture',name:row.name,enabled:row.enabled,config});return json({campaign:parseStoreEngagementCampaign(campaign)});}catch(error){return failure(error);}
  },
  async deletePopup(request:Request):Promise<Response>{
   const auth=await authorizeCatalogAdminRequest(deps,request,'POST',`${PATH}/delete`,'forbidden');if(auth instanceof Response)return auth;
   if(!isMerchantActionAllowed(auth.tenantContext.membership.role,'configuration.manage'))return catalogAdminHttpError('membership_denied',403);
   const operationId=catalogAdminOperationId(request),row=exactCatalogAdminHttpInput(await readCatalogAdminJsonBody(request,1024),['campaignId','expectedVersion']);
   const campaignId=row?catalogAdminHttpId(row.campaignId):null,expectedVersion=row?catalogAdminHttpVersion(row.expectedVersion):null;
   if(!operationId||!campaignId||!expectedVersion)return catalogAdminHttpError('invalid_input',400);
   try{const result=parseStoreEngagementDeleteResult(await (auth.runtime as ServerStoreEngagementRuntime).engagement.deletePopup({tenantContext:auth.tenantContext,now:auth.now,operationId,campaignId,expectedVersion}));if(result.campaignId!==campaignId)throw new Error('invalid_result');return json({deletion:result});}catch(error){return failure(error);}
  },
 });
}
