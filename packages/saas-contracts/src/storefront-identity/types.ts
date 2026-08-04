import type { OrderPaymentStatus, OrderStatus } from "../orders/types.ts";

export const STOREFRONT_ACCOUNT_STATUSES = Object.freeze([
  "pending_profile",
  "active",
  "suspended",
] as const);
export type StorefrontAccountStatus = (typeof STOREFRONT_ACCOUNT_STATUSES)[number];

export const STOREFRONT_ACCOUNT_SESSION_KINDS = Object.freeze(["registration", "full"] as const);
export type StorefrontAccountSessionKind = (typeof STOREFRONT_ACCOUNT_SESSION_KINDS)[number];

export type StorefrontAuthStartResult = Readonly<{
  outcome: "accepted";
  retryAfterSeconds: number;
}>;

export type StorefrontAuthVerifyResult = Readonly<
  | { outcome: "authenticated"; profileRequired: false }
  | { outcome: "profile_required"; profileRequired: true }
>;

export interface StorefrontAccountSession {
  readonly kind: StorefrontAccountSessionKind;
  readonly expiresAt: string;
}

export interface StorefrontAccountProfile {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone?: string;
}

export interface StorefrontAccountAddress {
  readonly id: string;
  readonly label: string;
  readonly recipientName: string;
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly district?: string;
  readonly postalCode?: string;
  readonly country: "TR";
  readonly isDefault: boolean;
  readonly version: number;
}

export interface StorefrontAccountFavorite {
  readonly productId: string;
  readonly createdAt: string;
}

export interface StorefrontAccountDevice {
  readonly id: string;
  readonly label: string;
  readonly current: boolean;
  readonly lastSeenAt: string;
  readonly createdAt: string;
}

export interface StorefrontAccountSnapshot {
  readonly status: StorefrontAccountStatus;
  readonly profile: Readonly<StorefrontAccountProfile>;
  readonly addresses: readonly Readonly<StorefrontAccountAddress>[];
  readonly favorites: readonly Readonly<StorefrontAccountFavorite>[];
  readonly devices: readonly Readonly<StorefrontAccountDevice>[];
}

export interface StorefrontAccountOrderItem {
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly lineTotalCents: number;
}

export interface StorefrontAccountOrder {
  readonly orderReference: string;
  readonly status: OrderStatus;
  readonly paymentStatus: OrderPaymentStatus;
  readonly currency: "TRY";
  readonly subtotalCents: number;
  readonly shippingCents: number;
  readonly totalCents: number;
  readonly createdAt: string;
  readonly items: readonly Readonly<StorefrontAccountOrderItem>[];
}

export const STOREFRONT_ACCOUNT_MUTATION_OUTCOMES = Object.freeze([
  "created",
  "updated",
  "removed",
  "revoked",
] as const);
export type StorefrontAccountMutationOutcome = (typeof STOREFRONT_ACCOUNT_MUTATION_OUTCOMES)[number];

export interface StorefrontAccountMutationResult {
  readonly outcome: StorefrontAccountMutationOutcome;
  readonly version: number;
  readonly replayed: boolean;
}
