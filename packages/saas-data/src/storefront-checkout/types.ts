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

export type BeginHostedCheckoutInput = SubmitBuiltInCheckoutInput & Readonly<{
  attemptId: string;
  callbackBindingDigest: string;
  orderId: string;
  orderItemIds: readonly string[];
  orderEventId: string;
  orderNumber: string;
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

export type RecoverCheckoutOperationInput = Readonly<{
  hostname: string;
  credentialDigest: string;
  operationId: string;
  fingerprint: string;
  checkoutNonce: string;
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
    shippingAddress: CheckoutAddress;
    billingAddress: CheckoutAddress | null;
  }>;
  basket: readonly HostedCheckoutBasketItem[];
  attemptId: string;
  bridgeId: string;
  environment: "test" | "live";
  reservationStatus: "held";
}>;

export type CheckoutOperationResult =
  | CheckoutQuote
  | CheckoutSubmissionResult
  | HostedCheckoutAuthority;

export interface PublicCheckoutRepository {
  issueNonce(input: IssueCheckoutNonceInput): Promise<CheckoutQuote>;
  updateDelivery(input: UpdateCheckoutDeliveryInput): Promise<CheckoutQuote>;
  submitBuiltIn(input: SubmitBuiltInCheckoutInput): Promise<CheckoutSubmissionResult>;
  beginHosted(input: BeginHostedCheckoutInput): Promise<HostedCheckoutAuthority>;
  getStatus(input: GetCheckoutStatusInput): Promise<CheckoutStatus>;
  getPolicy(input: GetCheckoutPolicyInput): Promise<CheckoutPolicy>;
  recover(input: RecoverCheckoutOperationInput): Promise<CheckoutOperationResult>;
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
