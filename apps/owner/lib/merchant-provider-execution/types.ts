import type {
  MerchantAdminJson,
  MerchantProviderCapability,
  PaymentProviderExecutionAuthority,
} from "@celebix/saas-contracts";
import type {
  MerchantProviderCredentialKeyring,
  MerchantProviderValidationIdentity,
  MerchantProviderVerificationWorkflowRepository,
  MerchantProviderWorkflowClaim,
  MerchantProviderWorkflowRepository,
} from "@celebix/saas-data";

export type ProviderExecutionOutcome =
  | Readonly<{ kind: "succeeded"; safeProviderReference: string; outcomeCode: "accepted" }>
  | Readonly<{ kind: "retryable_failed"; outcomeCode: string }>
  | Readonly<{ kind: "permanently_failed"; outcomeCode: string }>
  | Readonly<{ kind: "provider_outcome_unknown"; outcomeCode: "transport_outcome_unknown" }>;

export type MerchantProviderWorkerMode = "validation_only" | "validation_and_execution";

export interface MerchantProviderAdapter {
  readonly providerCode: string;
  readonly capability: MerchantProviderCapability;
  readonly executionAuthority: Readonly<PaymentProviderExecutionAuthority>;
  validateCredential(input: Readonly<{
    credential: Uint8Array;
    publicConfig: Readonly<Record<string, MerchantAdminJson>>;
  }>): Promise<Readonly<{ kind: "validated" }> | Readonly<{ kind: "rejected"; outcomeCode: string }>>;
  execute(input: Readonly<{
    credential: Uint8Array;
    job: MerchantProviderWorkflowClaim;
  }>): Promise<ProviderExecutionOutcome>;
  reconcile(input: Readonly<{
    credential: Uint8Array;
    job: MerchantProviderWorkflowClaim;
  }>): Promise<ProviderExecutionOutcome>;
}

export interface MerchantProviderVerificationAdapter {
  readonly providerCode: string;
  readonly capability: MerchantProviderCapability;
  readonly validationIdentity: Readonly<MerchantProviderValidationIdentity>;
  validateCredential(input: Readonly<{
    credential: Uint8Array;
    publicConfig: Readonly<Record<string, MerchantAdminJson>>;
  }>): Promise<Readonly<{ kind: "validated" }> | Readonly<{ kind: "rejected"; outcomeCode: string }>>;
}

export interface MerchantProviderAdapterRegistry {
  readonly size: number;
  get(providerCode: string, capability: MerchantProviderCapability): MerchantProviderAdapter | null;
  list(): readonly MerchantProviderAdapter[];
}

export interface MerchantProviderVerificationAdapterRegistry {
  readonly size: number;
  get(
    providerCode: string,
    capability: MerchantProviderCapability,
    validationIdentity: Readonly<MerchantProviderValidationIdentity>,
  ): MerchantProviderVerificationAdapter | null;
  list(): readonly MerchantProviderVerificationAdapter[];
}

export type MerchantProviderWorkerResult = Readonly<{ kind:
  | "disabled"
  | "empty"
  | "profile_validated"
  | "profile_rejected"
  | "succeeded"
  | "retryable_failed"
  | "permanently_failed"
  | "provider_outcome_unknown"
  | "reconciliation_required"
}>;

export interface MerchantProviderWorkerOptions {
  readonly mode: MerchantProviderWorkerMode;
  readonly repository: MerchantProviderWorkflowRepository & MerchantProviderVerificationWorkflowRepository;
  readonly registry: MerchantProviderAdapterRegistry;
  readonly verificationRegistry: MerchantProviderVerificationAdapterRegistry;
  readonly keyring: MerchantProviderCredentialKeyring;
  readonly workerId: string;
  readonly now: () => Date;
  readonly leaseDurationMs: number;
  readonly audit: (event: Readonly<{
    operation: "validate" | "execute" | "reconcile";
    classification: MerchantProviderWorkerResult["kind"];
    providerCode: string;
    capability: MerchantProviderCapability;
  }>) => void | Promise<void>;
}

export interface MerchantProviderWorker {
  runOnce(): Promise<MerchantProviderWorkerResult>;
}
