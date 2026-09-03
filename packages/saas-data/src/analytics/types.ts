import type {
  AnalyticsConnectionMutationResult,
  AnalyticsConnectionStatus,
  AnalyticsConnectionView,
  AnalyticsDashboard,
  AnalyticsPeriod,
  CommerceAnalyticsSettings,
  CommerceAnalyticsSnapshot,
  TenantContext,
} from "@celebix/saas-contracts";
import type {
  PostgresPoolLike,
  PostgresTimeoutOptions,
} from "../postgres/pool.ts";

export type AnalyticsConnectionAuthority = Readonly<{
  connectionId: string;
  websiteId: string;
  hostname: string;
  status: AnalyticsConnectionStatus;
  version: number;
  lastVerifiedAt: string | null;
}>;
export type AnalyticsPendingAuthority = AnalyticsConnectionAuthority &
  Readonly<{ outcome: "pending" | "active"; replayed: boolean }>;
export type PublicAnalyticsTrackerConfig = Readonly<{
  websiteId: string;
  hostname: string;
}>;
export type AnalyticsPurchaseSource =
  "storefront" | "quick_link" | "marketplace" | "manual_import" | "manual";
export type AnalyticsLifecycleEventName =
  | "payment_failed"
  | "refund"
  | "order_cancelled"
  | "cart_abandoned"
  | "cart_resumed"
  | "cart_recovered"
  | "recovery_message_queued"
  | "recovery_message_sent"
  | "recovery_message_failed";
export type AnalyticsOutboxPayload =
  | Readonly<{
      name: "purchase";
      valueCents: number;
      currency: string;
      source: AnalyticsPurchaseSource;
      anonymousSessionRef?: string;
    }>
  | Readonly<{
      name: AnalyticsLifecycleEventName;
      schemaVersion: 1;
      currency: string;
      valueMinor: number;
    }>;
export type AnalyticsOutboxClaim = Readonly<{
  eventId: string;
  leaseToken: string;
  websiteId: string;
  hostname: string;
  attemptCount: number;
  payload: AnalyticsOutboxPayload;
}>;
export type AnalyticsDeliveryErrorCode =
  "collector_unavailable" | "collector_rejected" | "collector_response_invalid";
export type CommerceAnalyticsQueryFilters = Readonly<{
  view?:
    | "overview"
    | "funnel"
    | "abandoned-carts"
    | "acquisition"
    | "products"
    | "status";
  device?: string;
  source?: string;
  campaign?: string;
  productId?: string;
  categoryId?: string;
  currency?: string;
  touch?: "first" | "last";
  search?: string;
  lifecycle?: string;
  contact?: "contactable" | "unavailable";
  brandId?: string;
  minimumValueMinor?: number;
  maximumValueMinor?: number;
  productPage?: number;
  cartPage?: number;
  timezone?: string;
}>;
export type CommerceAnalyticsPaidSession = Readonly<{
  anonymousSessionRef: string;
  occurredAt: string;
}>;

export interface AnalyticsRepository {
  dashboard(
    input: Readonly<{
      tenantContext: TenantContext;
      now: Date;
      period: AnalyticsPeriod;
    }>,
  ): Promise<Readonly<AnalyticsDashboard>>;
  commerceTimezone(
    input: Readonly<{ tenantContext: TenantContext; now: Date }>,
  ): Promise<string>;
  commerceSnapshot(
    input: Readonly<{
      tenantContext: TenantContext;
      now: Date;
      rangeStart: Date;
      rangeEnd: Date;
      filters?: CommerceAnalyticsQueryFilters;
    }>,
  ): Promise<Readonly<CommerceAnalyticsSnapshot>>;
  commerceSettings(
    input: Readonly<{ tenantContext: TenantContext; now: Date }>,
  ): Promise<Readonly<CommerceAnalyticsSettings>>;
  paidFunnelSessions(
    input: Readonly<{
      tenantContext: TenantContext;
      now: Date;
      rangeStart: Date;
      rangeEnd: Date;
      filters?: CommerceAnalyticsQueryFilters;
    }>,
  ): Promise<readonly CommerceAnalyticsPaidSession[]>;
  updateCommerceSettings(
    input: Readonly<{
      tenantContext: TenantContext;
      now: Date;
      expectedVersion: number;
      candidateInactivityMinutes: number;
      abandonedInactivityHours: number;
      recoveryLinkHours: number;
      automaticRecoveryEnabled: boolean;
      maximumMessageAttempts: number;
      minimumMessageIntervalHours: number;
      trackingPolicy: "disabled" | "anonymous_commerce";
    }>,
  ): Promise<Readonly<CommerceAnalyticsSettings>>;
  getConnection(
    input: Readonly<{ tenantContext: TenantContext; now: Date }>,
  ): Promise<AnalyticsConnectionView>;
  getConnectionAuthority(
    input: Readonly<{ tenantContext: TenantContext; now: Date }>,
  ): Promise<AnalyticsConnectionAuthority>;
  beginConnection(
    input: Readonly<{
      tenantContext: TenantContext;
      now: Date;
      operationId: string;
      connectionId: string;
      websiteId: string;
    }>,
  ): Promise<AnalyticsPendingAuthority>;
  activateConnection(
    input: Readonly<{
      tenantContext: TenantContext;
      now: Date;
      operationId: string;
      connectionId: string;
      websiteId: string;
      verifiedHostname: string;
    }>,
  ): Promise<AnalyticsConnectionMutationResult>;
  disableConnection(
    input: Readonly<{
      tenantContext: TenantContext;
      now: Date;
      operationId: string;
      expectedVersion: number;
    }>,
  ): Promise<AnalyticsConnectionMutationResult>;
}
export interface PublicAnalyticsRepository {
  getTrackerConfig(
    input: Readonly<{ hostname: string; now: Date }>,
  ): Promise<PublicAnalyticsTrackerConfig | null>;
}
export interface AnalyticsOutboxRepository {
  claim(
    input: Readonly<{ now: Date; limit: number; leaseMs: number }>,
  ): Promise<readonly AnalyticsOutboxClaim[]>;
  delivered(
    input: Readonly<{ eventId: string; leaseToken: string; now: Date }>,
  ): Promise<void>;
  failed(
    input: Readonly<{
      eventId: string;
      leaseToken: string;
      now: Date;
      errorCode: AnalyticsDeliveryErrorCode;
      retryAt: Date;
      terminal: boolean;
    }>,
  ): Promise<void>;
  requeue(input: Readonly<{ eventId: string; now: Date }>): Promise<void>;
}
export type AnalyticsAuditEvent = Readonly<{
  type: "analytics_commit_unknown";
}>;
export type PostgresAnalyticsRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_app";
  timeouts: PostgresTimeoutOptions;
  uuid: () => string;
  audit: (event: AnalyticsAuditEvent) => void | Promise<void>;
}>;
export type PostgresPublicAnalyticsRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_host_resolver";
  timeouts: PostgresTimeoutOptions;
}>;
export type PostgresAnalyticsOutboxRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_workflow";
  timeouts: PostgresTimeoutOptions;
}>;
