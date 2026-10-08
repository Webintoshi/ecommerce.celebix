import type { StoreEngagementCampaign, StoreEngagementCampaignKind, StoreEngagementConfig, StoreEngagementDeleteResult, TenantContext } from '@celebix/saas-contracts';
import type { ServerPanelAccessRuntime } from '../server-panel-access/runtime.ts';
import { resolveServerCatalogAdminRuntime, type ServerCatalogAdminRuntime } from '../server-catalog-admin/runtime.ts';
export type StoreEngagementSaveInput = Readonly<{tenantContext:TenantContext;now:Date;operationId:string;campaignId?:string;expectedVersion?:number;kind:StoreEngagementCampaignKind;name:string;enabled:boolean;config:StoreEngagementConfig}>;
export type StoreEngagementDeleteInput = Readonly<{tenantContext:TenantContext;now:Date;operationId:string;campaignId:string;expectedVersion:number}>;
type Repository = Readonly<{list(input:Readonly<{tenantContext:TenantContext;now:Date}>):Promise<readonly StoreEngagementCampaign[]>;save(input:StoreEngagementSaveInput):Promise<StoreEngagementCampaign>;deletePopup(input:StoreEngagementDeleteInput):Promise<StoreEngagementDeleteResult>}>;
export type ServerStoreEngagementRuntime = ServerCatalogAdminRuntime & Readonly<{engagement:Repository}>;
const repositories=new WeakMap<ServerPanelAccessRuntime,Repository>();
export function registerServerStoreEngagementRepository(access:ServerPanelAccessRuntime,repository:Repository):void {
 if(access.readiness.mode!=='approved_staging'||access.panelOrigin===null||repositories.has(access)||typeof repository?.list!=='function'||typeof repository?.save!=='function'||typeof repository?.deletePopup!=='function')throw new Error('store_engagement_runtime_invalid');
 repositories.set(access,Object.freeze({list:repository.list.bind(repository),save:repository.save.bind(repository),deletePopup:repository.deletePopup.bind(repository)}));
}
export function resolveServerStoreEngagementRuntime(access:ServerPanelAccessRuntime):ServerStoreEngagementRuntime|null {
 const catalog=resolveServerCatalogAdminRuntime(access),engagement=repositories.get(access);
 return catalog&&engagement?Object.freeze({...catalog,engagement}):null;
}
