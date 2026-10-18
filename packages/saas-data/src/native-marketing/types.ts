import type { TenantContext } from "@celebix/saas-contracts";
import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export const NATIVE_MARKETING_TEMPLATE_IDS = ["cart", "new_products", "offer", "welcome"] as const;
export type NativeMarketingTemplateId = typeof NATIVE_MARKETING_TEMPLATE_IDS[number];
export interface NativeMarketingLegacyContent { readonly subject: string; readonly heading: string; readonly body: string; readonly buttonLabel: string; readonly buttonPath: string }
export type NativeMarketingBlock =
  | Readonly<{ id: string; type: "heading"; text: string; align: "left" | "center" | "right"; color: string; size: "small" | "medium" | "large" }>
  | Readonly<{ id: string; type: "text"; text: string; align: "left" | "center" | "right"; color: string }>
  | Readonly<{ id: string; type: "image"; assetId: string; alt: string; linkPath: string }>
  | Readonly<{ id: string; type: "image_text"; assetId: string; alt: string; heading: string; text: string; buttonLabel: string; buttonPath: string; imagePosition: "left" | "right" }>
  | Readonly<{ id: string; type: "products"; productIds: readonly string[]; columns: 1 | 2 }>
  | Readonly<{ id: string; type: "button"; label: string; path: string; color: string; align: "left" | "center" | "right" }>
  | Readonly<{ id: string; type: "banner"; heading: string; text: string; backgroundColor: string; textColor: string }>
  | Readonly<{ id: string; type: "divider"; color: string }>
  | Readonly<{ id: string; type: "spacer"; height: 8 | 16 | 24 | 32 }>;
export interface NativeMarketingBlockContent extends NativeMarketingLegacyContent { readonly schemaVersion: 2; readonly blocks: readonly NativeMarketingBlock[] }
export type NativeMarketingContent = NativeMarketingLegacyContent | NativeMarketingBlockContent;
export type NativeMarketingTemplate = NativeMarketingContent & Readonly<{ id: NativeMarketingTemplateId; version: number }>;
export interface NativeMarketingSettings { readonly enabled: boolean; readonly cartReminderEnabled: boolean; readonly secondCartReminderEnabled: boolean; readonly firstDelayMinutes: 60; readonly secondDelayMinutes: 1440; readonly version: number }
export interface NativeMarketingBranding { readonly storeName: string; readonly logoUrl?: string; readonly accentColor: string; readonly storeUrl: string; readonly supportUrl: string; readonly postalAddress?: string }
export interface NativeMarketingQuota { readonly limit: number; readonly used: number; readonly reserved: number; readonly remaining: number; readonly periodEndsAt: string }
export interface NativeMarketingProduct { readonly id: string; readonly title: string; readonly url: string; readonly imageUrl?: string; readonly priceCents: number; readonly currency: string }
export interface NativeMarketingCampaign { readonly id: string; readonly name: string; readonly templateId: NativeMarketingTemplateId; readonly status: "scheduled" | "queued" | "sending" | "completed" | "cancelled"; readonly scheduledAt: string; readonly recipientCount: number; readonly sentCount: number; readonly failedCount: number; readonly version: number; readonly isTest: boolean }
export interface NativeMarketingOverview { readonly settings: NativeMarketingSettings; readonly branding: NativeMarketingBranding; readonly quota: NativeMarketingQuota; readonly eligibleRecipientCount: number; readonly skippedReasonCounts: Readonly<Record<string, number>>; readonly templates: readonly NativeMarketingTemplate[]; readonly campaigns: readonly NativeMarketingCampaign[]; readonly summary: Readonly<{ queued: number; sent: number; failed: number; suppressed: number }> }
export interface NativeMarketingAuthority { readonly tenantContext: TenantContext; readonly now: Date }
export interface QueueNativeMarketingCampaignInput extends NativeMarketingAuthority { readonly operationId: string; readonly templateId: NativeMarketingTemplateId; readonly name: string; readonly scheduledAt?: string; readonly content?: NativeMarketingContent; readonly productIds?: readonly string[] }
export interface TestNativeMarketingCampaignInput extends QueueNativeMarketingCampaignInput { readonly recipient: string }
export interface NativeMarketingAdminRepository {
  overview(input: NativeMarketingAuthority): Promise<NativeMarketingOverview>;
  preview(input: NativeMarketingAuthority & Readonly<{ templateId: NativeMarketingTemplateId; content?: NativeMarketingContent; productIds?: readonly string[] }>): Promise<NativeMarketingProjection>;
  products(input: NativeMarketingAuthority & Readonly<{ query?: string; limit?: number }>): Promise<readonly NativeMarketingProduct[]>;
  saveSettings(input: NativeMarketingAuthority & Readonly<{ operationId: string; expectedVersion: number; enabled: boolean; cartReminderEnabled: boolean; secondCartReminderEnabled: boolean }>): Promise<NativeMarketingSettings>;
  saveTemplate(input: NativeMarketingAuthority & Readonly<{ operationId: string; expectedVersion: number; template: NativeMarketingTemplate }>): Promise<NativeMarketingTemplate>;
  queueCampaign(input: QueueNativeMarketingCampaignInput): Promise<NativeMarketingCampaign>;
  testCampaign(input: TestNativeMarketingCampaignInput): Promise<NativeMarketingCampaign>;
  cancelCampaign(input: NativeMarketingAuthority & Readonly<{ operationId: string; campaignId: string; expectedVersion: number }>): Promise<NativeMarketingCampaign>;
}
export interface NativeMarketingProjectionItem { readonly productId: string; readonly productName: string; readonly url: string; readonly imageUrl?: string; readonly quantity: number; readonly unitPriceCents: number; readonly currency: string }
export interface NativeMarketingProjection { readonly recipient: string; readonly recipientName?: string; readonly senderLabel: string; readonly storeName: string; readonly primaryColor: string; readonly logoUrl?: string; readonly storefrontOrigin: string; readonly supportUrl: string; readonly postalAddress?: string; readonly template: NativeMarketingTemplate; readonly items: readonly NativeMarketingProjectionItem[]; readonly blockImages?: readonly Readonly<{ assetId: string; url: string }>[]; readonly recoveryNeeded: boolean; readonly isTest: boolean }
interface NativeMarketingClaimBase { readonly deliveryId: string; readonly storeId: string; readonly attemptCount: number; readonly idempotencyKey: string }
export interface UnsealedNativeMarketingClaim extends NativeMarketingClaimBase { readonly kind: "unsealed"; readonly projection: NativeMarketingProjection }
export interface SealedNativeMarketingClaim extends NativeMarketingClaimBase { readonly kind: "sealed"; readonly firstAttemptAt: string; readonly idempotencyExpiresAt: string; readonly sealKeyId: string; readonly sealedRequest: string; readonly requestDigest: string }
export type NativeMarketingClaim = Readonly<UnsealedNativeMarketingClaim | SealedNativeMarketingClaim>;
export type NativeMarketingClaimBatch = Readonly<{ kind: "empty" } | { kind: "claimed"; leaseId: string; items: readonly NativeMarketingClaim[] }>;
export interface NativeMarketingLeaseInput { readonly deliveryId: string; readonly leaseId: string; readonly workerId: string; readonly now: Date }
export interface ClaimNativeMarketingInput { readonly workerId: string; readonly now: Date; readonly leaseExpiresAt: Date; readonly limit: number; readonly leaseId?: string; readonly storeIds?: readonly string[] | "*"; readonly testOnly?: boolean }
export interface SealNativeMarketingInput extends NativeMarketingLeaseInput { readonly sealKeyId: string; readonly sealedRequest: Buffer; readonly requestDigest: string; readonly unsubscribeTokenDigest: string; readonly recoveryTokenDigest?: string; readonly firstAttemptAt: Date; readonly idempotencyExpiresAt: Date }
export type NativeMarketingSendResult = Readonly<{ kind: "accepted"; providerMessageId: string } | { kind: "retryable" | "permanent" | "uncertain"; code: string; nextAttemptAt?: Date }>;
export interface NativeMarketingProviderEventInput { readonly providerEventId: string; readonly providerMessageId: string; readonly type: "sent" | "delivered" | "delayed" | "failed" | "bounced" | "complained" | "suppressed"; readonly occurredAt: Date; readonly receivedAt: Date; readonly safeReasonCode?: string }
export interface NativeMarketingWorkflowRepository {
  claim(input: ClaimNativeMarketingInput): Promise<NativeMarketingClaimBatch>;
  authorize(input: NativeMarketingLeaseInput): Promise<boolean>;
  seal(input: SealNativeMarketingInput): Promise<void>;
  finish(input: NativeMarketingLeaseInput & Readonly<{ result: NativeMarketingSendResult }>): Promise<void>;
  recordProviderEvent(input: NativeMarketingProviderEventInput): Promise<"recorded" | "replayed">;
  unsubscribe(input: Readonly<{ tokenDigest: string; now: Date }>): Promise<void>;
}
export type NativeMarketingRepository = NativeMarketingAdminRepository & NativeMarketingWorkflowRepository;
export interface PostgresNativeMarketingRepositoryOptions { readonly pool: PostgresPoolLike; readonly role: "celebix_saas_app" | "celebix_saas_workflow" | "celebix_saas_host_resolver"; readonly timeouts: PostgresTimeoutOptions; readonly uuid?: () => string }
export class NativeMarketingError extends Error { constructor(readonly code: string) { super(code); this.name = "NativeMarketingError"; } }
