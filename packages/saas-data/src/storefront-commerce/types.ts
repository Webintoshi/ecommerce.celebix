import type {
  PublicCart,
  PublicCheckoutQuote,
  PublicCheckoutReceipt,
} from "@celebix/saas-contracts";

import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export type StorefrontCredentialCandidate = Readonly<{ keyId: string; digest: string }>;
export type StorefrontGeneratedCredential = Readonly<{
  id: string;
  keyId: string;
  digest: string;
  expiresAt: Date;
}>;
export type StorefrontCheckoutCredentialPersistence = Readonly<{
  receipt: true;
  customer: boolean;
  receiptKeyId: string;
  customerKeyId: string;
}>;

export type StorefrontDelivery = Readonly<{
  contact: Readonly<{ firstName: string; lastName: string; email: string; phone: string }>;
  shippingAddress: Readonly<{
    line1: string;
    line2?: string;
    city: string;
    district?: string;
    postalCode?: string;
    country: "TR";
  }>;
  note?: string;
}>;

export interface StorefrontCommerceRepository {
  resolveCart(input: Readonly<{ hostname: string; now: Date; candidates: readonly StorefrontCredentialCandidate[] }>): Promise<PublicCart>;
  mutateCart(input: Readonly<{
    hostname: string;
    now: Date;
    candidates: readonly StorefrontCredentialCandidate[];
    cart?: StorefrontGeneratedCredential;
    operationId: string;
    action: "add" | "quantity" | "remove";
    expectedVersion: number;
    productId: string;
    variantId: string;
    quantity?: number;
  }>): Promise<Readonly<{ credentialCreated: boolean; cart: PublicCart }>>;
  createBuyNow(input: Readonly<{
    hostname: string;
    now: Date;
    intent: StorefrontGeneratedCredential;
    productId: string;
    variantId: string;
    quantity: number;
  }>): Promise<void>;
  quote(input: Readonly<{
    hostname: string;
    now: Date;
    intentKind: "cart" | "buy_now";
    candidates: readonly StorefrontCredentialCandidate[];
  }>): Promise<PublicCheckoutQuote>;
  complete(input: Readonly<{
    hostname: string;
    now: Date;
    intentKind: "cart" | "buy_now";
    candidates: readonly StorefrontCredentialCandidate[];
    customerCandidates: readonly StorefrontCredentialCandidate[];
    operationId: string;
    cartVersion: number;
    delivery: StorefrontDelivery;
    paymentKind: "bank_transfer" | "cash_on_delivery";
    generated: Readonly<{
      orderId: string;
      customerId: string;
      addressId: string;
      eventId: string;
      receipt: StorefrontGeneratedCredential;
      customer: StorefrontGeneratedCredential;
    }>;
  }>): Promise<Readonly<{ receipt: PublicCheckoutReceipt; credentialPersistence: StorefrontCheckoutCredentialPersistence }>>;
  getReceipt(input: Readonly<{ hostname: string; now: Date; receiptCandidates: readonly StorefrontCredentialCandidate[]; customerCandidates: readonly StorefrontCredentialCandidate[] }>): Promise<PublicCheckoutReceipt>;
  listAccountOrders(input: Readonly<{ hostname: string; now: Date; candidates: readonly StorefrontCredentialCandidate[]; limit: number }>): Promise<readonly PublicCheckoutReceipt[]>;
}

export type StorefrontCommerceAuditEvent = Readonly<{ type: "storefront_checkout_commit_unknown" }>;

export type PostgresStorefrontCommerceRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_host_resolver";
  timeouts: PostgresTimeoutOptions;
  audit: (event: StorefrontCommerceAuditEvent) => void | Promise<void>;
}>;
