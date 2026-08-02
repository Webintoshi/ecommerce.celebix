export const MERCHANT_ADMIN_RECORD_KINDS = Object.freeze([
  "discount", "lucky_wheel",
  "email_campaign", "phone_campaign", "whatsapp_campaign",
  "blog_post", "page", "policy",
  "marketplace_connection",
  "general_setting", "language_setting", "payment_setting", "shipping_setting", "administrator_invite",
  "accounting_profile", "invoice_integration",
  "seo_control", "sitemap", "social_preview", "code_integration", "indexing_request",
  "notification_setting", "hero_banner", "promotion_banner", "marquee_setting",
  "seo_geo_profile", "seo_internal_link", "seo_content_entry", "seo_category_entry",
  "seo_page_entry", "seo_product_entry", "ai_setting",
] as const);
export type MerchantAdminRecordKind = (typeof MERCHANT_ADMIN_RECORD_KINDS)[number];
export type MerchantAdminRecordStatus = "draft" | "active" | "archived";
export type MerchantAdminJson = null | boolean | number | string | readonly MerchantAdminJson[] | Readonly<{ [key: string]: MerchantAdminJson }>;
export interface MerchantAdminRecord { readonly id: string; readonly kind: MerchantAdminRecordKind; readonly name: string; readonly config: Readonly<Record<string, MerchantAdminJson>>; readonly status: MerchantAdminRecordStatus; readonly version: number; readonly createdAt: string; readonly updatedAt: string }
export interface MerchantAdminMutationResult { readonly id: string; readonly kind: MerchantAdminRecordKind; readonly status: MerchantAdminRecordStatus; readonly version: number; readonly updatedAt: string; readonly replayed: boolean }
export const MERCHANT_ADMIN_EVENT_KINDS = Object.freeze(["saved", "archived", "coupon_used", "wheel_spin", "delivery_attempt", "sync_job", "invoice_reconciled", "indexing_job"] as const);
export type MerchantAdminEventKind = (typeof MERCHANT_ADMIN_EVENT_KINDS)[number];
export interface MerchantAdminEvent { readonly id: string; readonly recordId: string; readonly recordKind: MerchantAdminRecordKind; readonly eventKind: MerchantAdminEventKind; readonly summary: Readonly<Record<string, MerchantAdminJson>>; readonly occurredAt: string }

export const MERCHANT_ADMIN_PROVIDER_ACTIONS = Object.freeze([
  "delivery", "synchronization", "reconciliation", "indexing",
] as const);
export type MerchantAdminProviderAction = (typeof MERCHANT_ADMIN_PROVIDER_ACTIONS)[number];
export const MERCHANT_ADMIN_PROVIDER_RECORD_KINDS = Object.freeze([
  "email_campaign", "phone_campaign", "whatsapp_campaign",
  "marketplace_connection", "invoice_integration", "indexing_request",
] as const satisfies readonly MerchantAdminRecordKind[]);
export type MerchantAdminProviderRecordKind = (typeof MERCHANT_ADMIN_PROVIDER_RECORD_KINDS)[number];
export const MERCHANT_PROVIDER_CAPABILITIES = Object.freeze([
  "marketplace_sync", "invoice_reconciliation", "email_delivery",
  "phone_delivery", "whatsapp_delivery", "indexing", "payment_processing",
  "ai_assistant",
] as const);
export type MerchantProviderCapability = (typeof MERCHANT_PROVIDER_CAPABILITIES)[number];
export const MERCHANT_PROVIDER_PROFILE_STATUSES = Object.freeze([
  "pending_validation", "active", "disabled", "rotation_required", "revoked",
] as const);
export type MerchantProviderProfileStatus = (typeof MERCHANT_PROVIDER_PROFILE_STATUSES)[number];
export interface MerchantProviderFieldDescriptor {
  readonly key: string;
  readonly label: string;
}
export interface MerchantProviderCredentialFieldDescriptor extends MerchantProviderFieldDescriptor {
  readonly secret: true;
}
export interface MerchantProviderDescriptor {
  readonly providerCode: string;
  readonly capability: MerchantProviderCapability;
  readonly label: string;
  readonly publicFields: readonly Readonly<MerchantProviderFieldDescriptor>[];
  readonly credentialFields: readonly Readonly<MerchantProviderCredentialFieldDescriptor>[];
  readonly adapterVersion?: number;
  readonly environments?: readonly PaymentProviderEnvironment[];
  readonly executionAuthority?: Readonly<PaymentProviderExecutionAuthority> | null;
}
export interface MerchantProviderProfile {
  readonly id: string;
  readonly providerCode: string;
  readonly capability: MerchantProviderCapability;
  readonly publicConfig: Readonly<Record<string, MerchantAdminJson>>;
  readonly maskedAccountReference: string;
  readonly status: MerchantProviderProfileStatus;
  readonly credentialVersion: number;
  readonly version: number;
  readonly lastValidatedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export const MERCHANT_ADMIN_PROVIDER_JOB_STATUSES = Object.freeze([
  "awaiting_provider_activation", "queued", "leased", "provider_outcome_unknown",
  "reconciliation_required", "succeeded", "retryable_failed",
  "permanently_failed", "cancelled",
] as const);
export type MerchantAdminProviderJobStatus = (typeof MERCHANT_ADMIN_PROVIDER_JOB_STATUSES)[number];
export interface MerchantAdminProviderJob {
  readonly id: string;
  readonly recordId: string;
  readonly recordKind: MerchantAdminProviderRecordKind;
  readonly action: MerchantAdminProviderAction;
  readonly status: MerchantAdminProviderJobStatus;
  readonly profileId: string | null;
  readonly providerCode: string | null;
  readonly credentialVersion: number | null;
  readonly attempt: number;
  readonly safeProviderReference: string | null;
  readonly outcomeCode: string | null;
  readonly version: number;
  readonly requestedAt: string;
  readonly updatedAt: string;
}
export interface MerchantAdminProviderJobMutationResult {
  readonly id: string;
  readonly recordId: string;
  readonly recordKind: MerchantAdminProviderRecordKind;
  readonly action: MerchantAdminProviderAction;
  readonly status: MerchantAdminProviderJobStatus;
  readonly profileId: string | null;
  readonly providerCode: string | null;
  readonly credentialVersion: number | null;
  readonly attempt: number;
  readonly safeProviderReference: string | null;
  readonly outcomeCode: string | null;
  readonly version: number;
  readonly updatedAt: string;
  readonly replayed: boolean;
}
import type {
  PaymentProviderEnvironment,
  PaymentProviderExecutionAuthority,
} from "../payment-providers/types.ts";
