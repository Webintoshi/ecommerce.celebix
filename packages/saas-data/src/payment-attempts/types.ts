import type { MerchantAdminJson } from "@celebix/saas-contracts";

import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";
import type { SealedMerchantProviderCredential } from "../provider-execution/credential-crypto.ts";

export type PaymentAttemptEnvironment = "test" | "live";

export type PaymentAttemptStatus =
  | "created"
  | "awaiting_customer"
  | "submitted"
  | "provider_outcome_unknown"
  | "authorized"
  | "captured"
  | "failed"
  | "cancelled"
  | "partially_refunded"
  | "refunded"
  | "expired"
  | "reconciliation_required";

export type StoreAuthority = Readonly<{
  storeId: string;
  now: Date;
}>;

export type BeginPaymentAttemptInput = Readonly<{
  authority: StoreAuthority;
  operationId: string;
  fingerprint: string;
  paymentMethodId: string;
  orderReference: string;
  amountMinor: number;
  currency: string;
  callbackBindingDigest: string;
}>;

export type BeginPaymentAttemptResult = Readonly<{
  outcome: "created" | "replayed";
  attemptId: string;
  storeId: string;
  paymentMethodId: string;
  profileId: string;
  providerCode: string;
  environment: PaymentAttemptEnvironment;
  credentialVersion: number;
  amountMinor: number;
  currency: string;
  publicConfig: Readonly<Record<string, MerchantAdminJson>>;
  sealedCredentials: SealedMerchantProviderCredential;
}>;

export type PaymentAttemptMutationResult = Readonly<{
  attemptId: string;
  status: PaymentAttemptStatus;
  version: number;
  providerReference: string | null;
  safeCode: string;
  replayed: boolean;
}>;

export type PaymentAttemptAuthority = Readonly<{
  attemptId: string;
  storeId: string;
  paymentMethodId: string;
  profileId: string;
  providerCode: string;
  environment: PaymentAttemptEnvironment;
  credentialVersion: number;
  orderReference: string;
  amountMinor: number;
  currency: string;
  status: PaymentAttemptStatus;
  version: number;
  providerReference: string | null;
  publicConfig: Readonly<Record<string, MerchantAdminJson>>;
  sealedCredentials: SealedMerchantProviderCredential;
}>;

export type PaymentAttemptReconciliationClaim = PaymentAttemptAuthority & Readonly<{
  outcome: "claimed" | "replayed";
  leaseId: string;
  leaseOwner: string;
  leaseExpiresAt: string;
}>;

export type MarkPaymentAttemptInitializedInput = Readonly<{
  attemptId: string;
  operationId: string;
  fingerprint: string;
  expectedVersion: number;
  credentialVersion: number;
  status: "awaiting_customer" | "submitted" | "failed" | "cancelled" | "expired";
  providerReference: string | null;
  safeCode: string;
  now: Date;
}>;

export type MarkPaymentAttemptUnknownInput = Readonly<{
  attemptId: string;
  operationId: string;
  fingerprint: string;
  expectedVersion: number;
  credentialVersion: number;
  providerReference: string | null;
  safeCode: string;
  now: Date;
}>;

export type GetPaymentCallbackAuthorityInput = Readonly<{
  providerCode: string;
  callbackBindingDigest: string;
  now: Date;
}>;

export type SettlePaymentAttemptCallbackInput = Readonly<{
  providerCode: string;
  callbackBindingDigest: string;
  operationId: string;
  fingerprint: string;
  eventKeyDigest: string;
  expectedVersion: number;
  credentialVersion: number;
  status: "authorized" | "captured" | "failed" | "partially_refunded" | "refunded";
  providerReference: string | null;
  safeCode: string;
  amountMinor: number;
  currency: string;
  now: Date;
}>;

export type ApplyHostedPaymentCallbackInput = Readonly<{
  providerCode: string;
  callbackBindingDigest: string;
  operationId: string;
  fingerprint: string;
  eventKeyDigest: string;
  expectedVersion: number;
  credentialVersion: number;
  status: "captured" | "failed" | "provider_outcome_unknown";
  providerReference: string | null;
  safeCode: string;
  amountMinor: number;
  currency: string;
  now: Date;
}>;

export type ApplyHostedPaymentCallbackResult = PaymentAttemptMutationResult & Readonly<{
  disposition: "applied" | "replayed" | "processing";
}>;

export type ClaimPaymentAttemptReconciliationInput = Readonly<{
  attemptId: string;
  operationId: string;
  fingerprint: string;
  expectedVersion: number;
  workerId: string;
  leaseId: string;
  now: Date;
  leaseExpiresAt: Date;
}>;

export type FinalizePaymentAttemptReconciliationInput = Readonly<{
  attemptId: string;
  operationId: string;
  fingerprint: string;
  expectedVersion: number;
  workerId: string;
  leaseId: string;
  credentialVersion: number;
  status: "captured" | "failed" | "provider_outcome_unknown";
  providerReference: string | null;
  safeCode: string;
  amountMinor: number;
  currency: string;
  now: Date;
}>;

export interface PaymentAttemptRepository {
  begin(input: BeginPaymentAttemptInput): Promise<BeginPaymentAttemptResult>;
  markInitialized(input: MarkPaymentAttemptInitializedInput): Promise<PaymentAttemptMutationResult>;
  markUnknown(input: MarkPaymentAttemptUnknownInput): Promise<PaymentAttemptMutationResult>;
  getCallbackAuthority(input: GetPaymentCallbackAuthorityInput): Promise<PaymentAttemptAuthority>;
  settleCallback(input: SettlePaymentAttemptCallbackInput): Promise<PaymentAttemptMutationResult>;
  applyHostedCallback(input: ApplyHostedPaymentCallbackInput): Promise<ApplyHostedPaymentCallbackResult>;
  claimReconciliation(input: ClaimPaymentAttemptReconciliationInput): Promise<PaymentAttemptReconciliationClaim>;
  finalizeReconciliation(input: FinalizePaymentAttemptReconciliationInput): Promise<PaymentAttemptMutationResult>;
}

export type PaymentAttemptAuditEvent = Readonly<{
  type: "payment_attempt_commit_unknown";
}>;

export type PostgresPaymentAttemptRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_workflow";
  timeouts: PostgresTimeoutOptions;
  audit: (event: PaymentAttemptAuditEvent) => void | Promise<void>;
}>;
