import type { PaymentProviderReadiness } from "@celebix/saas-contracts";

export type PaymentAdapterField = Readonly<{
  key: string;
  label: string;
  minimum: number;
  maximum: number;
}>;

export type PaymentAdapterCredentialField = Readonly<PaymentAdapterField & {
  secret: true;
}>;

export type PaymentAdapterCapabilities = Readonly<{
  initialize: boolean;
  callback: boolean;
  query: boolean;
  threeDSecure: boolean;
  installments: boolean;
  preAuth: boolean;
  capture: boolean;
  cancel: boolean;
  refund: boolean;
  partialRefund: boolean;
  tokenization: boolean;
}>;

export type PaymentAdapterPresentationRule =
  | Readonly<{
      kind: "exact_url";
      url: string;
    }>
  | Readonly<{
      kind: "provider_token_url";
      urlPrefix: string;
      token: Readonly<{
        alphabet: "base64url";
        minimum: number;
        maximum: number;
      }>;
    }>;

export type PaymentAdapterPacket = Readonly<{
  providerCode: string;
  familyCode: string;
  modeCode: string;
  adapterVersion: number;
  implementation: "hosted";
  readiness: Readonly<Record<"test" | "live", PaymentProviderReadiness>>;
  endpoints: Readonly<Record<"test" | "live", readonly string[]>>;
  presentation: Readonly<Record<"test" | "live", PaymentAdapterPresentationRule>>;
  publicFields: readonly PaymentAdapterField[];
  credentialFields: readonly PaymentAdapterCredentialField[];
  capabilities: PaymentAdapterCapabilities;
  documentation: readonly Readonly<{
    url: string;
    verifiedAt: string;
    authority: "official";
  }>[];
}>;

export type HostedPaymentInitialization =
  | Readonly<{ kind: "redirect"; url: string; providerReference: string | null }>
  | Readonly<{ kind: "iframe"; url: string; token: string; providerReference: string | null }>
  | Readonly<{ kind: "pending"; providerReference: string | null }>
  | Readonly<{ kind: "rejected"; code: string }>
  | Readonly<{
      kind: "unknown";
      code: "provider_outcome_unknown";
      providerReference: string | null;
    }>;

export type HostedPaymentStatus =
  | Readonly<{ kind: "succeeded"; providerReference: string; paidAmountMinor: number; currency: string }>
  | Readonly<{ kind: "failed"; providerReference: string | null; code: string }>
  | Readonly<{ kind: "pending"; providerReference: string | null }>
  | Readonly<{ kind: "unknown"; providerReference: string | null }>;

export type VerifiedProviderCallback = Readonly<{
  eventKey: string;
  status: "succeeded" | "failed";
  providerReference: string | null;
  paidAmountMinor: number;
  currency: string;
  safeCode: string;
}>;

export type HostedPaymentInitializeInput<TCredential extends object> = Readonly<{
  environment: "test" | "live";
  credential: TCredential;
  attemptId: string;
  orderReference: string;
  amountMinor: number;
  currency: string;
  callbackUrl: string;
  successUrl: string;
  failureUrl: string;
  customer: Readonly<{
    name: string;
    email: string;
    phone: string;
    ipAddress: string;
    address: string;
  }>;
  basket: readonly Readonly<{
    reference: string;
    name: string;
    quantity: number;
    unitAmountMinor: number;
  }>[];
  signal: AbortSignal;
}>;

export type HostedPaymentCallbackInput<TCredential extends object> = Readonly<{
  environment: "test" | "live";
  credential: TCredential;
  method: "POST";
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
  expected: Readonly<{
    attemptId: string;
    orderReference: string;
    amountMinor: number;
    currency: string;
  }>;
}>;

export type HostedPaymentQueryInput<TCredential extends object> = Readonly<{
  environment: "test" | "live";
  credential: TCredential;
  attemptId: string;
  orderReference: string;
  providerReference: string | null;
  amountMinor: number;
  currency: string;
  signal: AbortSignal;
}>;

export interface HostedPaymentAdapter<TCredential extends object> {
  readonly packet: PaymentAdapterPacket;
  parseCredential(value: unknown): TCredential;
  maskAccount(credential: TCredential): string;
  initialize(input: HostedPaymentInitializeInput<TCredential>): Promise<HostedPaymentInitialization>;
  verifyCallback(input: HostedPaymentCallbackInput<TCredential>): Promise<VerifiedProviderCallback>;
  query(input: HostedPaymentQueryInput<TCredential>): Promise<HostedPaymentStatus>;
}
