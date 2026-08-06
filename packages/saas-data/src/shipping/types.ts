import type { ShippingConnection, ShippingProviderCode, ShippingResource, TenantContext } from "@celebix/saas-contracts";
import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";
import type { SealedShippingCredential, ShippingCredentialKeyring } from "./credential-crypto.ts";

export type ShippingAuthorityInput = Readonly<{ tenantContext: TenantContext; now: Date; providerCode: ShippingProviderCode }>;
export type ShippingConnectionSetup = Readonly<{ connection: ShippingConnection; resources: readonly ShippingResource[] }>;
export type SaveShippingConnectionInput = ShippingAuthorityInput & Readonly<{ operationId: string; token: string }>;
export type SaveShippingConnectionResult = Readonly<{ connection: ShippingConnection; validationJobId: string }>;
export type SelectShippingResourcesInput = ShippingAuthorityInput & Readonly<{
  operationId: string; brandResourceId: string; addressResourceId: string; codDeliveredMarksPaid: boolean;
}>;
export type RevokeShippingConnectionInput = ShippingAuthorityInput & Readonly<{ operationId: string }>;

export interface ShippingAdminRepository {
  current(input: ShippingAuthorityInput): Promise<ShippingConnection | null>;
  setup(input: ShippingAuthorityInput): Promise<ShippingConnectionSetup | null>;
  saveConnection(input: SaveShippingConnectionInput): Promise<SaveShippingConnectionResult>;
  selectResources(input: SelectShippingResourcesInput): Promise<ShippingConnection>;
  revokeConnection(input: RevokeShippingConnectionInput): Promise<ShippingConnection>;
}

export interface PostgresShippingAdminRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly keyring: ShippingCredentialKeyring;
  readonly generateId: () => string;
  readonly audit: (event: Readonly<{ type: "shipping_commit_unknown" }>) => void | Promise<void>;
  readonly timeouts: PostgresTimeoutOptions;
}

export type ShippingValidationClaim = Readonly<{
  jobId: string; storeId: string; profileId: string; providerCode: "basit_kargo"; credentialVersion: number;
  leaseId: string; workerId: string; fenceToken: number; version: number;
}>;
export type ClaimShippingValidationInput = Readonly<{
  jobId: string; workerId: string; now: Date; leaseSeconds: number; leaseId: string;
}>;
export type OpenShippingCredentialInput = Readonly<{ claim: ShippingValidationClaim; now: Date }>;
export type OpenedShippingCredential = Readonly<{ providerCode: "basit_kargo"; tokenBytes: Uint8Array }>;
export type ShippingValidationResource = Readonly<{
  id: string; kind: "brand" | "address" | "handler"; providerResourceId: string;
  label: string; active: boolean; digest: string;
}>;
export type CompleteShippingValidationInput = Readonly<{
  claim: ShippingValidationClaim; now: Date; accountIdentityDigest: string; resources: readonly ShippingValidationResource[];
}>;
export type FailShippingValidationInput = Readonly<{
  claim: ShippingValidationClaim; now: Date; failureKind: "credential_invalid" | "rejected" | "throttled" | "temporary_failure";
  safeCode: string; retryAfterSeconds: number | null;
}>;

export interface ShippingWorkflowRepository {
  claimValidation(input: ClaimShippingValidationInput): Promise<ShippingValidationClaim | null>;
  openClaimedCredential(input: OpenShippingCredentialInput): Promise<OpenedShippingCredential>;
  completeValidation(input: CompleteShippingValidationInput): Promise<"completed">;
  failValidation(input: FailShippingValidationInput): Promise<"failed" | "requeued">;
}

export interface PostgresShippingWorkflowRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_workflow";
  readonly keyring: ShippingCredentialKeyring;
  readonly timeouts: PostgresTimeoutOptions;
}

export type ShippingCredentialAuthority = Readonly<{
  providerCode: "basit_kargo"; credentialEnvelope: SealedShippingCredential; credentialDigest: string;
  credentialKeyId: string; credentialVersion: number;
}>;
