import type { AnalyticsDashboard, AnalyticsPeriod, TenantContext } from "@celebix/saas-contracts";
import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export interface AnalyticsAuthorityInput { readonly tenantContext: TenantContext; readonly now: Date; readonly period: AnalyticsPeriod }
export interface AnalyticsRepository { dashboard(input: AnalyticsAuthorityInput): Promise<Readonly<AnalyticsDashboard>> }
export interface PostgresAnalyticsRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly audit: (event: Readonly<{ type: "analytics_read_failure" }>) => void | Promise<void>;
}
