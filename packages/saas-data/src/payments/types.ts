import type { SealedEnvelope } from "../quick-orders/token-crypto.ts";
import type {
  PostgresPoolLike,
  PostgresTimeoutOptions,
} from "../postgres/pool.ts";

export interface CheckoutPaymentRepository {
  beginAttempt(input: BeginAttemptInput): Promise<BeginAttemptResult>;
  markProviderReady(
    input: MarkProviderReadyInput,
  ): Promise<ProviderReadyResult>;
  markInitiationUnknown(input: MarkInitiationFailedInput): Promise<void>;
  markInitiationFailed(input: MarkInitiationFailedInput): Promise<void>;
  getPaymentPresentation(
    input: ResolveRedemptionInput,
  ): Promise<PaymentPresentationAuthority>;
  getCallbackAuthority(
    input: Readonly<{ merchantOid: string; now: Date }>,
  ): Promise<CallbackAuthority>;
  settleCallback(
    input: SettleCallbackInput,
  ): Promise<
    Readonly<{
      outcome: "settled" | "replayed" | "failed" | "commit_unknown";
      orderNumber?: string;
    }>
  >;
  beginReconciliationRun(
    input: ReconciliationRunInput,
  ): Promise<Readonly<{ outcome: "acquired" | "busy" }>>;
  claimReconciliation(
    input: ClaimReconciliationInput,
  ): Promise<readonly ReconciliationAuthority[]>;
  claimRedemptionReconciliation(
    input: ResolveRedemptionInput &
      Readonly<{ workerId: string; leaseExpiresAt: Date }>,
  ): Promise<ReconciliationAuthority | undefined>;
  applyReconciliationSuccess(
    input: ApplyReconciliationSuccessInput,
  ): Promise<
    Readonly<{ outcome: "settled" | "replayed"; orderNumber: string }>
  >;
  recordReconciliationUnknown(
    input: RecordReconciliationUnknownInput,
  ): Promise<void>;
  finishReconciliationRun(
    input: Readonly<{ workerId: string; runToken: string; now: Date }>,
  ): Promise<void>;
  cleanupPreProviderAttempts(
    input: CleanupPreProviderAttemptsInput,
  ): Promise<Readonly<{ releasedCount: number }>>;
}
export type ResolveRedemptionInput = Readonly<{
  hostname: string;
  redemptionDigest: string;
  now: Date;
}>;
export type BeginAttemptInput = Readonly<{
  hostname: string;
  redemptionDigest: string;
  attemptId: string;
  merchantOid: string;
  operationId: string;
  fingerprint: string;
  now: Date;
}>;
export type BeginAttemptResult = Readonly<{
  outcome: "created" | "replayed";
  status: "reserved" | "provider_ready" | "initiation_unknown";
  storeId: string;
  attemptId: string;
  merchantOid: string;
  currency: "TRY";
  paymentAmount: number;
  customerEmail: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  basket: readonly Readonly<{
    name: string;
    unitPriceCents: number;
    quantity: number;
  }>[];
  providerConfigId: string;
  configurationDigest: string;
  configurationKeyId: string;
  sealedConfiguration: SealedEnvelope;
}>;
export type MarkProviderReadyInput = Readonly<{
  attemptId: string;
  operationId: string;
  fingerprint: string;
  providerTokenDigest: string;
  sealedProviderToken: SealedEnvelope;
  now: Date;
}>;
export type ProviderReadyResult = Readonly<{
  attemptId: string;
  status: "provider_ready";
  replayed: boolean;
  providerTokenDigest: string;
  sealedProviderToken: SealedEnvelope;
}>;
export type PaymentPresentationAuthority = Readonly<{
  attemptId: string;
  storeId: string;
  merchantOid: string;
  providerTokenDigest: string;
  sealedProviderToken: SealedEnvelope;
}>;
export type MarkInitiationFailedInput = Readonly<{
  attemptId: string;
  operationId: string;
  fingerprint: string;
  now: Date;
}>;
export type CallbackAuthority = Readonly<{
  storeId: string;
  attemptId: string;
  merchantOid: string;
  providerConfigId: string;
  status: "provider_ready" | "initiation_unknown" | "succeeded" | "failed";
  expectedPaymentAmount: number;
  currency: "TRY";
  configurationDigest: string;
  configurationKeyId: string;
  sealedConfiguration: SealedEnvelope;
}>;
export type SettleCallbackInput =
  | Readonly<{
      status: "success";
      merchantOid: string;
      callbackDigest: string;
      operationId: string;
      fingerprint: string;
      paymentAmount: number;
      totalAmount: number;
      currency: "TRY";
      paymentType: "card" | "eft";
      testMode: 1;
      orderId: string;
      orderItemIds: readonly string[];
      orderEventId: string;
      orderNumber: string;
      now: Date;
    }>
  | Readonly<{
      status: "failed";
      merchantOid: string;
      callbackDigest: string;
      operationId: string;
      fingerprint: string;
      totalAmount: number;
      paymentType: "card" | "eft";
      testMode: 1;
      failedReasonCode: string;
      failedReasonMessageDigest: string;
      now: Date;
    }>;
export type ClaimReconciliationInput = Readonly<{
  workerId: string;
  now: Date;
  leaseExpiresAt: Date;
  limit: number;
}>;
export type ReconciliationRunInput = Readonly<{
  workerId: string;
  runTokenDigest: string;
  now: Date;
  leaseExpiresAt: Date;
}>;
export type ReconciliationAuthority = CallbackAuthority &
  Readonly<{ leaseToken: string; attemptNumber: number }>;
export type ApplyReconciliationSuccessInput = Readonly<{
  merchantOid: string;
  workerId: string;
  leaseToken: string;
  operationId: string;
  fingerprint: string;
  paymentAmount: number;
  totalAmount: number;
  currency: "TRY";
  testMode: 1;
  orderId: string;
  orderItemIds: readonly string[];
  orderEventId: string;
  orderNumber: string;
  now: Date;
}>;
export type RecordReconciliationUnknownInput = Readonly<{
  merchantOid: string;
  workerId: string;
  leaseToken: string;
  operationId: string;
  fingerprint: string;
  nextAttemptAt: Date;
  now: Date;
}>;
export type CleanupPreProviderAttemptsInput = Readonly<{
  workerId: string;
  operationId: string;
  fingerprint: string;
  now: Date;
  limit: number;
}>;
export type CheckoutPaymentAuditEvent = Readonly<{
  type: "checkout_payment_commit_unknown";
}>;
export type PostgresCheckoutPaymentRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_workflow";
  timeouts: PostgresTimeoutOptions;
  audit: (event: CheckoutPaymentAuditEvent) => void | Promise<void>;
}>;
