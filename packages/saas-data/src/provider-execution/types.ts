import type {
  MerchantAdminProviderJob,
  MerchantAdminProviderJobStatus,
  MerchantAdminJson,
  MerchantProviderCapability,
  MerchantProviderProfile,
  PaymentProviderExecutionAuthority,
  TenantContext,
} from "@celebix/saas-contracts";

import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";
import type { SealedMerchantProviderCredential } from "./credential-crypto.ts";

export interface MerchantProviderAuthorityInput {
  readonly tenantContext: TenantContext;
  readonly now: Date;
}

export interface ListMerchantProviderProfilesInput extends MerchantProviderAuthorityInput {
  readonly capability: MerchantProviderCapability;
}

export interface SaveMerchantProviderProfileInput extends ListMerchantProviderProfilesInput {
  readonly operationId: string;
  readonly profileId: string;
  readonly providerCode: string;
  readonly publicConfig: Readonly<Record<string, MerchantAdminJson>>;
  readonly maskedAccountReference: string;
  readonly sealedCredentials: SealedMerchantProviderCredential;
  readonly credentialDigest: string;
  readonly executionAuthority: Readonly<PaymentProviderExecutionAuthority> | null;
  readonly expectedVersion: number;
}

export interface MerchantProviderValidationIdentity {
  readonly environment: "test" | "live";
  readonly adapterVersion: number;
}

export interface SaveMerchantProviderVerificationProfileInput extends ListMerchantProviderProfilesInput {
  readonly operationId: string;
  readonly profileId: string;
  readonly providerCode: string;
  readonly publicConfig: Readonly<Record<string, MerchantAdminJson>>;
  readonly maskedAccountReference: string;
  readonly sealedCredentials: SealedMerchantProviderCredential;
  readonly credentialDigest: string;
  readonly validationIdentity: Readonly<MerchantProviderValidationIdentity>;
  readonly expectedVersion: number;
}

export interface RevokeMerchantProviderProfileInput extends MerchantProviderAuthorityInput {
  readonly operationId: string;
  readonly profileId: string;
  readonly expectedVersion: number;
}

export interface MerchantProviderProfileRepository {
  list(input: ListMerchantProviderProfilesInput): Promise<readonly MerchantProviderProfile[]>;
  save(input: SaveMerchantProviderProfileInput): Promise<MerchantProviderProfile>;
  disable(input: RevokeMerchantProviderProfileInput): Promise<MerchantProviderProfile>;
  revoke(input: RevokeMerchantProviderProfileInput): Promise<MerchantProviderProfile>;
}

export interface MerchantProviderVerificationProfileRepository {
  saveVerification(input: SaveMerchantProviderVerificationProfileInput): Promise<MerchantProviderProfile>;
}

export interface PostgresMerchantProviderProfileRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly audit: (
    event: Readonly<{ type: "merchant_provider_profile_commit_unknown" }>,
  ) => void | Promise<void>;
}

export interface ClaimMerchantProviderWorkInput {
  readonly workerId: string;
  readonly now: Date;
  readonly leaseExpiresAt: Date;
}

export interface ClaimMerchantProviderValidationInput extends ClaimMerchantProviderWorkInput {
  readonly providerCode: string;
  readonly capability: MerchantProviderCapability;
  readonly executionAuthority: Readonly<PaymentProviderExecutionAuthority>;
}

export interface MerchantProviderValidationClaim {
  readonly profileId: string;
  readonly storeId: string;
  readonly providerCode: string;
  readonly capability: MerchantProviderCapability;
  readonly publicConfig: Readonly<Record<string, MerchantAdminJson>>;
  readonly executionAuthority: Readonly<PaymentProviderExecutionAuthority>;
  readonly sealedCredentials: SealedMerchantProviderCredential;
  readonly credentialVersion: number;
  readonly profileVersion: number;
  readonly leaseId: string;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: string;
}

export interface ClaimMerchantProviderVerificationInput extends ClaimMerchantProviderWorkInput {
  readonly providerCode: string;
  readonly capability: MerchantProviderCapability;
  readonly validationIdentity: Readonly<MerchantProviderValidationIdentity>;
}

export interface MerchantProviderVerificationClaim {
  readonly profileId: string;
  readonly storeId: string;
  readonly providerCode: string;
  readonly capability: MerchantProviderCapability;
  readonly publicConfig: Readonly<Record<string, MerchantAdminJson>>;
  readonly validationIdentity: Readonly<MerchantProviderValidationIdentity>;
  readonly sealedCredentials: SealedMerchantProviderCredential;
  readonly credentialVersion: number;
  readonly profileVersion: number;
  readonly leaseId: string;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: string;
}

export interface MerchantProviderWorkflowClaim {
  readonly jobId: string;
  readonly recordId: string;
  readonly storeId: string;
  readonly profileId: string;
  readonly providerCode: string;
  readonly capability: MerchantProviderCapability;
  readonly publicConfig: Readonly<Record<string, MerchantAdminJson>>;
  readonly sealedCredentials: SealedMerchantProviderCredential;
  readonly credentialVersion: number;
  readonly jobVersion: number;
  readonly leaseId: string;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: string;
  readonly attempt: number;
}

export interface MerchantProviderValidationResultInput {
  readonly profileId: string;
  readonly providerCode: string;
  readonly capability: MerchantProviderCapability;
  readonly executionAuthority: Readonly<PaymentProviderExecutionAuthority>;
  readonly credentialVersion: number;
  readonly profileVersion: number;
  readonly leaseId: string;
  readonly leaseOwner: string;
  readonly now: Date;
  readonly outcome: "validated" | "rejected";
  readonly outcomeCode: string;
}

export interface MerchantProviderVerificationResultInput {
  readonly profileId: string;
  readonly providerCode: string;
  readonly capability: MerchantProviderCapability;
  readonly validationIdentity: Readonly<MerchantProviderValidationIdentity>;
  readonly credentialVersion: number;
  readonly profileVersion: number;
  readonly leaseId: string;
  readonly leaseOwner: string;
  readonly now: Date;
  readonly outcome: "validated" | "rejected";
  readonly outcomeCode: string;
}

export interface MerchantProviderHeartbeatInput {
  readonly jobId: string;
  readonly leaseOwner: string;
  readonly leaseId: string;
  readonly expectedVersion: number;
  readonly now: Date;
  readonly leaseExpiresAt: Date;
}

export type MerchantProviderExecutionOutcome = Extract<
  MerchantAdminProviderJobStatus,
  "succeeded" | "retryable_failed" | "permanently_failed" | "provider_outcome_unknown" | "reconciliation_required"
>;

export interface MerchantProviderFinalizeInput {
  readonly jobId: string;
  readonly leaseOwner: string;
  readonly leaseId: string;
  readonly expectedVersion: number;
  readonly now: Date;
  readonly outcome: MerchantProviderExecutionOutcome;
  readonly outcomeCode: string;
  readonly safeProviderReference: string | null;
}

export interface MerchantProviderReconcileInput {
  readonly jobId: string;
  readonly workerId: string;
  readonly expectedVersion: number;
  readonly now: Date;
  readonly outcome: Exclude<MerchantProviderExecutionOutcome, "retryable_failed">;
  readonly outcomeCode: string;
  readonly safeProviderReference: string | null;
}

export interface RecoverMerchantProviderWorkflowInput {
  readonly jobId: string;
  readonly operationFingerprint: string;
}

export interface MerchantProviderWorkflowRepository {
  claimProfileValidation(input: ClaimMerchantProviderValidationInput): Promise<Readonly<{ kind: "empty" }> | Readonly<{ kind: "claimed"; profile: MerchantProviderValidationClaim }>>;
  markProfileValidation(input: MerchantProviderValidationResultInput): Promise<MerchantProviderProfile>;
  claim(input: ClaimMerchantProviderWorkInput): Promise<Readonly<{ kind: "empty" }> | Readonly<{ kind: "claimed"; job: MerchantProviderWorkflowClaim }>>;
  heartbeat(input: MerchantProviderHeartbeatInput): Promise<MerchantAdminProviderJob>;
  finalize(input: MerchantProviderFinalizeInput): Promise<MerchantAdminProviderJob>;
  reconcile(input: MerchantProviderReconcileInput): Promise<MerchantAdminProviderJob>;
  recover(input: RecoverMerchantProviderWorkflowInput): Promise<MerchantAdminProviderJob>;
}

export interface MerchantProviderVerificationWorkflowRepository {
  claimProfileVerification(input: ClaimMerchantProviderVerificationInput): Promise<Readonly<{ kind: "empty" }> | Readonly<{ kind: "claimed"; profile: MerchantProviderVerificationClaim }>>;
  markProfileVerification(input: MerchantProviderVerificationResultInput): Promise<MerchantProviderProfile>;
}

export interface PostgresMerchantProviderWorkflowRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_workflow";
  readonly timeouts: PostgresTimeoutOptions;
  readonly uuid: () => string;
  readonly audit: (
    event: Readonly<{
      type:
        | "merchant_provider_finalize_commit_unknown"
        | "merchant_provider_verification_commit_unknown";
    }>,
  ) => void | Promise<void>;
}
