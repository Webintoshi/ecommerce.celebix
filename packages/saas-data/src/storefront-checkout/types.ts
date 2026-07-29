import type {
  CheckoutAddress,
  CheckoutDeliveryInput,
  CheckoutPolicy,
  CheckoutQuote,
  CheckoutStatus,
  CheckoutSubmissionResult,
  CheckoutSubmitInput,
} from "@celebix/saas-contracts";

import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export type IssueCheckoutNonceInput = Readonly<{
  hostname: string;
  credentialDigest: string;
  now: Date;
}>;

export type UpdateCheckoutDeliveryInput = Readonly<{
  hostname: string;
  credentialDigest: string;
  now: Date;
  delivery: CheckoutDeliveryInput;
}>;

export type SubmitBuiltInCheckoutInput = Readonly<{
  hostname: string;
  credentialDigest: string;
  now: Date;
  submission: CheckoutSubmitInput;
}>;

export type ClassifyCheckoutPaymentMethodInput = SubmitBuiltInCheckoutInput;

export type CheckoutPaymentMethodClassification =
  | Readonly<{ kind: "built_in" }>
  | Readonly<{ kind: "hosted" }>;

export type BeginHostedCheckoutInput = SubmitBuiltInCheckoutInput & Readonly<{
  attemptId: string;
  callbackBindingDigest: string;
}>;

export type GetCheckoutStatusInput = Readonly<{
  hostname: string;
  credentialDigest: string;
  now: Date;
}>;

export type GetCheckoutPolicyInput = Readonly<{
  hostname: string;
  policyType: CheckoutPolicy["policyType"];
  now: Date;
}>;

export type CheckoutOperationRecoveryExpectation =
  | Readonly<{ kind: "built_in" }>
  | Readonly<{
      kind: "hosted";
      submission: CheckoutSubmitInput;
      attemptId: string;
      callbackBindingDigest: string;
    }>;

export type RecoverCheckoutOperationInput = Readonly<{
  hostname: string;
  credentialDigest: string;
  operationId: string;
  fingerprint: string;
  expected: CheckoutOperationRecoveryExpectation;
  now: Date;
}>;

export type HostedCheckoutBasketItem = Readonly<{
  reference: string;
  name: string;
  quantity: number;
  unitAmountMinor: number;
  itemType: "PHYSICAL" | "VIRTUAL";
}>;

export type HostedCheckoutAuthority = Readonly<{
  storeId: string;
  paymentMethodId: string;
  profileId: string;
  providerCode: "paytr_iframe" | "iyzico_iframe";
  orderReference: string;
  amountMinor: number;
  currency: "TRY";
  customer: Readonly<{
    name: string;
    email: string;
    phone: string;
    identityNumber: string | null;
    shippingAddress: CheckoutAddress;
    billingAddress: CheckoutAddress | null;
  }>;
  basket: readonly HostedCheckoutBasketItem[];
  attemptId: string;
  bridgeId: string;
  environment: "test" | "live";
  reservationStatus: "held";
}>;

export type CheckoutOperationRecovery =
  | Readonly<{ kind: "built_in"; submission: CheckoutSubmissionResult }>
  | Readonly<{ kind: "hosted"; authority: HostedCheckoutAuthority }>;

export interface PublicCheckoutRepository {
  issueNonce(input: IssueCheckoutNonceInput): Promise<CheckoutQuote>;
  updateDelivery(input: UpdateCheckoutDeliveryInput): Promise<CheckoutQuote>;
  classifyPaymentMethod(
    input: ClassifyCheckoutPaymentMethodInput,
  ): Promise<CheckoutPaymentMethodClassification>;
  submitBuiltIn(input: SubmitBuiltInCheckoutInput): Promise<CheckoutSubmissionResult>;
  beginHosted(input: BeginHostedCheckoutInput): Promise<HostedCheckoutAuthority>;
  getStatus(input: GetCheckoutStatusInput): Promise<CheckoutStatus>;
  getPolicy(input: GetCheckoutPolicyInput): Promise<CheckoutPolicy>;
  recover(input: RecoverCheckoutOperationInput): Promise<CheckoutOperationRecovery>;
}

export type PublicCheckoutAuditEvent = Readonly<{
  type: "storefront_checkout_commit_unknown";
}>;

export type PostgresPublicCheckoutRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_workflow";
  timeouts: PostgresTimeoutOptions;
  audit: (event: PublicCheckoutAuditEvent) => void | Promise<void>;
}>;
