import type { PublicCartLine } from "@celebix/saas-contracts";

import type { BeginPaymentAttemptResult } from "../payment-attempts/types.ts";
import type { SealedMerchantProviderCredential } from "../provider-execution/credential-crypto.ts";
import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";
import type { StorefrontCredentialCandidate, StorefrontDelivery } from "../storefront-commerce/types.ts";

export type HostedCheckoutProviderCode = "paytr_iframe" | "iyzico_iframe";
export type HostedCheckoutSessionStatus = "active" | "provider_ready" | "processing" | "captured" | "failed" | "cancelled" | "expired" | "stock_conflict";
export type HostedCheckoutIssuedCredential = Readonly<{ keyId: string; digest: string }>;
export type HostedCheckoutBeginResult = BeginPaymentAttemptResult & Readonly<{
  paymentSessionKeyId: string;
  receiptKeyId: string;
  customerKeyId: string;
}>;

export type HostedCheckoutAuthorityInput = Readonly<{
  hostname: string;
  now: Date;
  intentKind: "cart" | "buy_now";
  candidates: readonly StorefrontCredentialCandidate[];
  cartVersion: number;
  delivery: StorefrontDelivery;
  paymentMethodId: string;
}>;

export type HostedCheckoutAuthority = Readonly<{
  authorityDigest: string;
  storeId: string;
  sourceKind: "cart" | "buy_now";
  sourceId: string;
  sourceVersion: number;
  paymentMethodId: string;
  methodVersion: number;
  profileId: string;
  profileVersion: number;
  providerCode: HostedCheckoutProviderCode;
  environment: "test" | "live";
  credentialVersion: number;
  executionAdapterVersion: number;
  executionEvidenceDigest: string;
  orderReference: string;
  currency: "TRY";
  subtotalMinor: number;
  shippingMinor: number;
  discountMinor: number;
  totalMinor: number;
  delivery: StorefrontDelivery;
  items: readonly PublicCartLine[];
  presentation: "iframe" | "redirect";
  requiredCustomerFields: readonly "identity_number"[];
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  city: string;
  country: "TR";
  postalCode?: string;
  basket: readonly Readonly<{ reference: string; name: string; quantity: number; unitAmountMinor: number; itemType: "PHYSICAL" | "VIRTUAL" }>[];
}>;

export type HostedCheckoutBeginInput = HostedCheckoutAuthorityInput & Readonly<{
  expectedAuthorityDigest: string;
  operationId: string;
  fingerprint: string;
  sessionId: string;
  callbackBindingDigest: string;
  orderId: string;
  customerId: string;
  addressId: string;
  eventId: string;
  receiptId: string;
  customerCredentialId: string;
  paymentSession: HostedCheckoutIssuedCredential;
  receipt: HostedCheckoutIssuedCredential;
  customer: HostedCheckoutIssuedCredential;
}>;

export type HostedCheckoutPresentationSaveInput = Readonly<{
  hostname: string;
  now: Date;
  candidates: readonly StorefrontCredentialCandidate[];
  operationId: string;
  fingerprint: string;
  expectedVersion: number;
  presentationKeyId: string;
  presentationDigest: string;
  sealedPresentation: SealedMerchantProviderCredential;
  presentationExpiresAt: Date;
}>;

export type HostedCheckoutPresentationInput = Readonly<{
  hostname: string;
  now: Date;
  candidates: readonly StorefrontCredentialCandidate[];
}>;

export type HostedCheckoutPresentationState = Readonly<{
  sessionId: string;
  status: "provider_ready";
  version: number;
  providerCode: HostedCheckoutProviderCode;
  presentationExpiresAt: string;
  presentationKeyId?: string;
  presentationDigest?: string;
  sealedPresentation?: SealedMerchantProviderCredential;
}>;

export type HostedCheckoutStatusInput = HostedCheckoutPresentationInput;
export type HostedCheckoutPublicStatus = Readonly<{
  sessionId: string;
  status: HostedCheckoutSessionStatus;
  safeCode: string;
  version: number;
  paymentSessionExpiresAt: string;
}>;

export interface StorefrontHostedCheckoutRepository {
  authority(input: HostedCheckoutAuthorityInput): Promise<HostedCheckoutAuthority>;
  begin(input: HostedCheckoutBeginInput): Promise<HostedCheckoutBeginResult>;
  savePresentation(input: HostedCheckoutPresentationSaveInput): Promise<HostedCheckoutPresentationState>;
  presentation(input: HostedCheckoutPresentationInput): Promise<HostedCheckoutPresentationState>;
  status(input: HostedCheckoutStatusInput): Promise<HostedCheckoutPublicStatus>;
}

export type StorefrontHostedCheckoutAuditEvent = Readonly<{ type: "storefront_hosted_checkout_commit_unknown" }>;
export type PostgresStorefrontHostedCheckoutRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_host_resolver";
  timeouts: PostgresTimeoutOptions;
  audit: (event: StorefrontHostedCheckoutAuditEvent) => void | Promise<void>;
}>;
