import type { AnalyticsConnectionMutationResult, AnalyticsConnectionStatus, AnalyticsConnectionView, AnalyticsDashboard, AnalyticsPeriod, TenantContext } from "@celebix/saas-contracts";
import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export type AnalyticsConnectionAuthority = Readonly<{ connectionId:string; websiteId:string; hostname:string; status:AnalyticsConnectionStatus; version:number; lastVerifiedAt:string|null }>;
export type AnalyticsPendingAuthority = AnalyticsConnectionAuthority & Readonly<{ outcome:"pending"|"active"; replayed:boolean }>;
export type PublicAnalyticsTrackerConfig = Readonly<{ websiteId:string; hostname:string }>;
export type AnalyticsPurchaseSource = "storefront"|"quick_link"|"marketplace"|"manual_import"|"manual";
export type AnalyticsOutboxClaim = Readonly<{ eventId:string; leaseToken:string; websiteId:string; hostname:string; attemptCount:number; payload:Readonly<{name:"purchase";valueCents:number;currency:string;source:AnalyticsPurchaseSource}> }>;
export type AnalyticsDeliveryErrorCode = "collector_unavailable"|"collector_rejected"|"collector_response_invalid";

export interface AnalyticsRepository {
  dashboard(input:Readonly<{tenantContext:TenantContext;now:Date;period:AnalyticsPeriod}>):Promise<Readonly<AnalyticsDashboard>>;
  getConnection(input:Readonly<{tenantContext:TenantContext;now:Date}>):Promise<AnalyticsConnectionView>;
  getConnectionAuthority(input:Readonly<{tenantContext:TenantContext;now:Date}>):Promise<AnalyticsConnectionAuthority>;
  beginConnection(input:Readonly<{tenantContext:TenantContext;now:Date;operationId:string;connectionId:string;websiteId:string}>):Promise<AnalyticsPendingAuthority>;
  activateConnection(input:Readonly<{tenantContext:TenantContext;now:Date;operationId:string;connectionId:string;websiteId:string;verifiedHostname:string}>):Promise<AnalyticsConnectionMutationResult>;
  disableConnection(input:Readonly<{tenantContext:TenantContext;now:Date;operationId:string;expectedVersion:number}>):Promise<AnalyticsConnectionMutationResult>;
}
export interface PublicAnalyticsRepository { getTrackerConfig(input:Readonly<{hostname:string;now:Date}>):Promise<PublicAnalyticsTrackerConfig|null> }
export interface AnalyticsOutboxRepository {
  claim(input:Readonly<{now:Date;limit:number;leaseMs:number}>):Promise<readonly AnalyticsOutboxClaim[]>;
  delivered(input:Readonly<{eventId:string;leaseToken:string;now:Date}>):Promise<void>;
  failed(input:Readonly<{eventId:string;leaseToken:string;now:Date;errorCode:AnalyticsDeliveryErrorCode;retryAt:Date;terminal:boolean}>):Promise<void>;
}
export type AnalyticsAuditEvent=Readonly<{type:"analytics_commit_unknown"}>;
export type PostgresAnalyticsRepositoryOptions=Readonly<{pool:PostgresPoolLike;role:"celebix_saas_app";timeouts:PostgresTimeoutOptions;uuid:()=>string;audit:(event:AnalyticsAuditEvent)=>void|Promise<void>}>;
export type PostgresPublicAnalyticsRepositoryOptions=Readonly<{pool:PostgresPoolLike;role:"celebix_saas_host_resolver";timeouts:PostgresTimeoutOptions}>;
export type PostgresAnalyticsOutboxRepositoryOptions=Readonly<{pool:PostgresPoolLike;role:"celebix_saas_workflow";timeouts:PostgresTimeoutOptions}>;
