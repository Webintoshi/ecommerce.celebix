import type { TenantContext,SeoResource,SeoResourceKind,SeoSettings,SeoOverview,SeoLink,SeoNotification,SeoIssue,SeoNotificationStatus,SaveSeoResourceRequest,SaveSeoSettingsRequest,SaveSeoLinkRequest,NotifySeoRequest } from '@celebix/saas-contracts';
import type { PostgresPoolLike,PostgresTimeoutOptions } from '../postgres/pool.ts';
export interface SeoAuthorityInput { tenantContext: TenantContext; now: Date }
export interface SeoOperationInput extends SeoAuthorityInput {operationId:string}
export interface SeoRepository {
 overview(input:SeoAuthorityInput):Promise<SeoOverview>;
 resources(input:SeoAuthorityInput&{kind?:SeoResourceKind;query?:string;missing?:boolean;cursor?:string;limit?:number}):Promise<{items:SeoResource[];nextCursor:string|null;total:number}>;
 saveResource(input:SeoOperationInput&{request:SaveSeoResourceRequest}):Promise<{resource:SeoResource;replayed:boolean}>;
 settings(input:SeoAuthorityInput):Promise<SeoSettings>;
 saveSettings(input:SeoOperationInput&{request:SaveSeoSettingsRequest}):Promise<{settings:SeoSettings;replayed:boolean}>;
 links(input:SeoAuthorityInput):Promise<{items:SeoLink[]}>;
 saveLink(input:SeoOperationInput&{request:SaveSeoLinkRequest}):Promise<{link:SeoLink|null;replayed:boolean}>;
 notifications(input:SeoAuthorityInput):Promise<{items:SeoNotification[]}>;
 notify(input:SeoOperationInput&{request:NotifySeoRequest}):Promise<{queued:number;replayed:boolean}>;
 startCheck(input:SeoOperationInput):Promise<{checked:number;total:number;status:string;replayed:boolean}>;
}
export interface PostgresSeoRepositoryOptions {pool:PostgresPoolLike;role:'celebix_saas_app';timeouts:PostgresTimeoutOptions;audit:(event:Readonly<{type:'seo_commit_unknown'}>)=>void|Promise<void>}
export interface PublicSeoRepository {
 get(input:{hostname:string;now:Date;kind:SeoResourceKind;id:string}):Promise<{resource:SeoResource;links:{anchorText:string;path:string}[];settings:SeoSettings}>;
 settings(input:{hostname:string;now:Date}):Promise<SeoSettings>;
 key(input:{hostname:string;now:Date}):Promise<{key:string|null}>;
}
export interface PostgresPublicSeoRepositoryOptions {pool:PostgresPoolLike;role:'celebix_saas_host_resolver';timeouts:PostgresTimeoutOptions}
export interface SeoNotificationLease {id:string;storeId:string;hostname:string;key:string;path:string;attempts:number;leaseId:string}
export interface SeoCheckLease {id:string;storeId:string;hostname:string;path:string;kind:SeoResourceKind|null;resourceId:string|null;leaseId:string}
export interface SeoWorkerRepository {
 claim(input:{now:Date;limit:number;workerId:string}):Promise<{notifications:SeoNotificationLease[];checks:SeoCheckLease[]}>;
 finishNotification(input:{id:string;leaseId:string;now:Date;status:SeoNotificationStatus;httpStatus:number|null;error:string|null;nextAttemptAt:Date|string|null}):Promise<void>;
 finishCheck(input:{id:string;leaseId:string;now:Date;issues:SeoIssue[];error:string|null}):Promise<void>;
}
export interface PostgresSeoWorkerRepositoryOptions {pool:PostgresPoolLike;role:'celebix_saas_workflow';timeouts:PostgresTimeoutOptions}
