import type { OrderEmailEventType, OrderEmailRecipientKind } from "@celebix/saas-contracts";

import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export const ORDER_EMAIL_REPOSITORY_ERROR_CODES = Object.freeze([
  "invalid_input", "lease_lost", "provider_reference_conflict", "unavailable",
] as const);
export type OrderEmailRepositoryErrorCode = (typeof ORDER_EMAIL_REPOSITORY_ERROR_CODES)[number];

export class OrderEmailRepositoryError extends Error {
  readonly code: OrderEmailRepositoryErrorCode;
  constructor(code: OrderEmailRepositoryErrorCode) {
    super(code);
    this.name = "OrderEmailRepositoryError";
    this.code = code;
  }
}

export interface OrderEmailProjectionItem {
  readonly productName: string;
  readonly variantName?: string;
  readonly sku?: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
  readonly discountCents: number;
  readonly lineTotalCents: number;
}

export interface OrderEmailProjectionAddress {
  readonly recipientName: string;
  readonly line1: string;
  readonly line2?: string;
  readonly district?: string;
  readonly city: string;
  readonly postalCode?: string;
  readonly country: string;
}

export interface OrderEmailProjectionTracking {
  readonly carrier: string;
  readonly trackingNumber: string;
  readonly trackingUrl?: string;
  readonly shippedAt?: string;
}

export interface OrderEmailProjection {
  readonly recipient: string;
  readonly senderLabel: string;
  readonly replyTo?: string;
  readonly storeName: string;
  readonly primaryColor: string;
  readonly logoUrl?: string;
  readonly storefrontOrigin: string;
  readonly adminOrigin?: string;
  readonly orderNumber: string;
  readonly customerName: string;
  readonly currency: string;
  readonly subtotalCents: number;
  readonly shippingCents: number;
  readonly discountCents: number;
  readonly totalCents: number;
  readonly shippingAddress: Readonly<OrderEmailProjectionAddress>;
  readonly tracking?: Readonly<OrderEmailProjectionTracking>;
  readonly items: readonly Readonly<OrderEmailProjectionItem>[];
}

interface OrderEmailClaimBase {
  readonly deliveryId: string;
  readonly storeId: string;
  readonly orderId: string;
  readonly eventType: OrderEmailEventType;
  readonly recipientKind: OrderEmailRecipientKind;
  readonly attemptCount: number;
  readonly idempotencyKey: string;
}

export interface UnsealedOrderEmailClaim extends OrderEmailClaimBase {
  readonly kind: "unsealed";
  readonly projection: Readonly<OrderEmailProjection>;
}

export interface SealedOrderEmailClaim extends OrderEmailClaimBase {
  readonly kind: "sealed";
  readonly firstAttemptAt: string;
  readonly idempotencyExpiresAt: string;
  readonly sealKeyId: string;
  readonly sealedRequest: string;
  readonly requestDigest: string;
}

export type OrderEmailClaim = Readonly<UnsealedOrderEmailClaim | SealedOrderEmailClaim>;
export type OrderEmailClaimBatch = Readonly<
  | { kind: "empty" }
  | { kind: "claimed"; leaseId: string; items: readonly OrderEmailClaim[] }
>;

export interface ClaimOrderEmailInput {
  readonly workerId: string;
  readonly now: Date;
  readonly leaseExpiresAt: Date;
  readonly limit: number;
}

export interface SealOrderEmailInput {
  readonly deliveryId: string;
  readonly leaseId: string;
  readonly workerId: string;
  readonly now: Date;
  readonly sealKeyId: string;
  readonly sealedRequest: Buffer;
  readonly requestDigest: string;
  readonly recipientDigest: string;
  readonly recipientMask: string;
  readonly firstAttemptAt: Date;
  readonly idempotencyExpiresAt: Date;
}

export interface AcceptOrderEmailInput {
  readonly deliveryId: string;
  readonly leaseId: string;
  readonly workerId: string;
  readonly now: Date;
  readonly providerMessageId: string;
}

export interface FailOrderEmailInput {
  readonly deliveryId: string;
  readonly leaseId: string;
  readonly workerId: string;
  readonly now: Date;
  readonly errorCode: string;
  readonly retryable: boolean;
  readonly nextAttemptAt?: Date;
}

export interface RecordOrderEmailProviderEventInput {
  readonly providerEventId: string;
  readonly providerMessageId: string;
  readonly type: "sent" | "delivered" | "delayed" | "failed" | "bounced" | "complained" | "suppressed";
  readonly occurredAt: Date;
  readonly receivedAt: Date;
  readonly safeReasonCode?: string;
}

export interface OrderEmailWorkflowRepository {
  claim(input: ClaimOrderEmailInput): Promise<OrderEmailClaimBatch>;
  seal(input: SealOrderEmailInput): Promise<void>;
  accept(input: AcceptOrderEmailInput): Promise<void>;
  fail(input: FailOrderEmailInput): Promise<"retry_scheduled" | "failed">;
  recordProviderEvent(input: RecordOrderEmailProviderEventInput): Promise<"recorded" | "replayed">;
}

export interface PostgresOrderEmailWorkflowRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_workflow";
  readonly timeouts: PostgresTimeoutOptions;
  readonly uuid: () => string;
}
