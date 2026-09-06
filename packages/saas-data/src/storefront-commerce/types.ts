import type {
  PublicCart,
  PublicCheckoutQuote,
  PublicCheckoutQuoteV2,
  PublicCheckoutReceipt,
  PublicCheckoutReceiptV2,
} from "@celebix/saas-contracts";

import type {
  PostgresPoolLike,
  PostgresTimeoutOptions,
} from "../postgres/pool.ts";

export type StorefrontCredentialCandidate = Readonly<{
  keyId: string;
  digest: string;
}>;
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

export type StorefrontCommerceAttribution = Readonly<{
  firstTouch: Readonly<{ source: string; medium: string; campaign?: string }>;
  lastTouch: Readonly<{ source: string; medium: string; campaign?: string }>;
  referrerHost?: string;
  landingPathGroup: string;
  deviceGroup: "desktop" | "mobile" | "tablet" | "unknown";
  anonymousSessionRef?: string;
}>;

export type StorefrontDelivery = Readonly<{
  contact: Readonly<{
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  }>;
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
  recordCartAttribution(
    input: Readonly<{
      hostname: string;
      now: Date;
      candidates: readonly StorefrontCredentialCandidate[];
      attribution: StorefrontCommerceAttribution;
    }>,
  ): Promise<void>;
  restoreCart(
    input: Readonly<{
      hostname: string;
      now: Date;
      tokenDigest: string;
      cart: StorefrontGeneratedCredential;
    }>,
  ): Promise<
    Readonly<{
      cart: PublicCart;
      restoredItems: number;
      omittedItems: number;
      adjustedItems: number;
    }>
  >;
  resolveCart(
    input: Readonly<{
      hostname: string;
      now: Date;
      candidates: readonly StorefrontCredentialCandidate[];
    }>,
  ): Promise<PublicCart>;
  mutateCart(
    input: Readonly<{
      hostname: string;
      now: Date;
      candidates: readonly StorefrontCredentialCandidate[];
      customerCandidates: readonly StorefrontCredentialCandidate[];
      cart?: StorefrontGeneratedCredential;
      operationId: string;
      action: "add" | "quantity" | "remove";
      expectedVersion: number;
      productId: string;
      variantId: string;
      quantity?: number;
    }>,
  ): Promise<Readonly<{ credentialCreated: boolean; cart: PublicCart }>>;
  createBuyNow(
    input: Readonly<{
      hostname: string;
      now: Date;
      intent: StorefrontGeneratedCredential;
      productId: string;
      variantId: string;
      quantity: number;
      attribution?: StorefrontCommerceAttribution;
    }>,
  ): Promise<void>;
  quote(
    input: Readonly<{
      hostname: string;
      now: Date;
      intentKind: "cart" | "buy_now";
      candidates: readonly StorefrontCredentialCandidate[];
      attribution?: StorefrontCommerceAttribution;
    }>,
  ): Promise<PublicCheckoutQuote>;
  quoteV2(
    input: Readonly<{
      hostname: string;
      now: Date;
      intentKind: "cart" | "buy_now";
      candidates: readonly StorefrontCredentialCandidate[];
      customerCandidates: readonly StorefrontCredentialCandidate[];
      normalizedCodes: readonly string[];
      attribution?: StorefrontCommerceAttribution;
    }>,
  ): Promise<Readonly<{ quote: PublicCheckoutQuoteV2; authorityDigest: string }>>;
  complete(
    input: Readonly<{
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
    }>,
  ): Promise<
    Readonly<{
      receipt: PublicCheckoutReceipt;
      credentialPersistence: StorefrontCheckoutCredentialPersistence;
    }>
  >;
  completeV2(
    input: Readonly<{
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
      normalizedCodes: readonly string[];
    }>,
  ): Promise<
    Readonly<{
      receipt: PublicCheckoutReceiptV2;
      credentialPersistence: StorefrontCheckoutCredentialPersistence;
    }>
  >;
  getReceipt(
    input: Readonly<{
      hostname: string;
      now: Date;
      receiptCandidates: readonly StorefrontCredentialCandidate[];
      customerCandidates: readonly StorefrontCredentialCandidate[];
    }>,
  ): Promise<PublicCheckoutReceipt | PublicCheckoutReceiptV2>;
  listAccountOrders(
    input: Readonly<{
      hostname: string;
      now: Date;
      candidates: readonly StorefrontCredentialCandidate[];
      limit: number;
    }>,
  ): Promise<readonly (PublicCheckoutReceipt | PublicCheckoutReceiptV2)[]>;
}

export type StorefrontCommerceAuditEvent = Readonly<{
  type: "storefront_checkout_commit_unknown";
}>;

export type PostgresStorefrontCommerceRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_host_resolver";
  timeouts: PostgresTimeoutOptions;
  audit: (event: StorefrontCommerceAuditEvent) => void | Promise<void>;
}>;
