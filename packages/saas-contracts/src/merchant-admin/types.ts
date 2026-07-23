export const MERCHANT_ADMIN_RECORD_KINDS = Object.freeze([
  "discount", "lucky_wheel",
  "email_campaign", "phone_campaign", "whatsapp_campaign",
  "blog_post", "page", "policy",
  "marketplace_connection",
  "general_setting", "language_setting", "payment_setting", "shipping_setting", "administrator_invite",
  "accounting_profile", "invoice_integration",
  "seo_control", "sitemap", "social_preview", "code_integration", "indexing_request",
  "notification_setting", "hero_banner", "promotion_banner", "marquee_setting",
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
export const MERCHANT_ADMIN_PROVIDER_JOB_STATUSES = Object.freeze([
  "awaiting_provider_activation", "cancelled",
] as const);
export type MerchantAdminProviderJobStatus = (typeof MERCHANT_ADMIN_PROVIDER_JOB_STATUSES)[number];
export interface MerchantAdminProviderJob {
  readonly id: string;
  readonly recordId: string;
  readonly recordKind: MerchantAdminProviderRecordKind;
  readonly action: MerchantAdminProviderAction;
  readonly status: MerchantAdminProviderJobStatus;
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
  readonly version: number;
  readonly updatedAt: string;
  readonly replayed: boolean;
}
