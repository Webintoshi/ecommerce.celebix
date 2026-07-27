import type {
  MerchantAdminJson,
  MerchantPaymentMethod,
  PaymentMethodKind,
  PaymentMethodMutationResult,
  PaymentMethodReorderResult,
  PaymentMethodState,
  TenantContext,
} from "@celebix/saas-contracts";

import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export interface PaymentMethodAuthorityInput {
  readonly tenantContext: TenantContext;
  readonly now: Date;
}

export type ListPaymentMethodsInput = PaymentMethodAuthorityInput;

export interface SavePaymentMethodInput extends PaymentMethodAuthorityInput {
  readonly operationId: string;
  readonly methodId: string;
  readonly expectedVersion: number;
  readonly kind: PaymentMethodKind;
  readonly profileId: string | null;
  readonly providerCode: string | null;
  readonly label: string;
  readonly config: Readonly<Record<string, MerchantAdminJson>>;
}

export interface SetPaymentMethodStateInput extends PaymentMethodAuthorityInput {
  readonly operationId: string;
  readonly methodId: string;
  readonly expectedVersion: number;
  readonly state: PaymentMethodState;
  readonly emergencyReason: string | null;
}

export interface PaymentMethodOrderItem {
  readonly id: string;
  readonly expectedVersion: number;
  readonly position: number;
}

export interface ReorderPaymentMethodsInput extends PaymentMethodAuthorityInput {
  readonly operationId: string;
  readonly items: readonly Readonly<PaymentMethodOrderItem>[];
}

export interface RecoverPaymentMethodOperationInput extends PaymentMethodAuthorityInput {
  readonly operationId: string;
  readonly fingerprint: string;
}

export type PaymentMethodOperationResult = PaymentMethodMutationResult | PaymentMethodReorderResult;

export interface PaymentMethodRepository {
  list(input: ListPaymentMethodsInput): Promise<readonly MerchantPaymentMethod[]>;
  save(input: SavePaymentMethodInput): Promise<PaymentMethodMutationResult>;
  setState(input: SetPaymentMethodStateInput): Promise<PaymentMethodMutationResult>;
  reorder(input: ReorderPaymentMethodsInput): Promise<PaymentMethodReorderResult>;
  recoverOperation(input: RecoverPaymentMethodOperationInput): Promise<PaymentMethodOperationResult>;
}

export interface PostgresPaymentMethodRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly audit: (
    event: Readonly<{ type: "payment_method_commit_unknown" }>,
  ) => void | Promise<void>;
}
