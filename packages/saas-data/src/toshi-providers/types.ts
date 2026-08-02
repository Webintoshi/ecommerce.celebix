import type {
  TenantContext,
  ToshiProvider,
  ToshiProviderConnection,
  ToshiProviderModel,
} from "@celebix/saas-contracts";

import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";
import type { SealedMerchantProviderCredential } from "../provider-execution/credential-crypto.ts";

export interface ToshiProviderAuthorityInput {
  readonly tenantContext: TenantContext;
  readonly now: Date;
}

export interface GetToshiProviderConnectionIdentityInput extends ToshiProviderAuthorityInput {
  readonly provider: ToshiProvider;
}

export interface ToshiProviderConnectionIdentity {
  readonly configId: string;
  readonly credentialVersion: number;
  readonly version: number;
}

export interface ConnectToshiProviderInput extends GetToshiProviderConnectionIdentityInput {
  readonly operationId: string;
  readonly configId: string;
  readonly sealedCredentials: SealedMerchantProviderCredential;
  readonly credentialDigest: string;
  readonly credentialVersion: number;
  readonly maskedKey: string;
  readonly selectedModel: string;
  readonly availableModels: readonly ToshiProviderModel[];
  readonly expectedVersion: number;
}

export interface SelectToshiProviderModelInput extends GetToshiProviderConnectionIdentityInput {
  readonly operationId: string;
  readonly selectedModel: string;
  readonly expectedVersion: number;
}

export interface SetDefaultToshiProviderInput extends GetToshiProviderConnectionIdentityInput {
  readonly operationId: string;
  readonly expectedVersion: number;
}

export interface RevokeToshiProviderInput extends SetDefaultToshiProviderInput {}

export interface GetToshiProviderAuthorityInput extends ToshiProviderAuthorityInput {
  readonly provider: ToshiProvider | null;
}

export interface ToshiProviderCredentialAuthority {
  readonly configId: string;
  readonly provider: ToshiProvider;
  readonly selectedModel: string;
  readonly sealedCredentials: SealedMerchantProviderCredential;
  readonly credentialVersion: number;
  readonly version: number;
}

export interface ToshiProviderRepository {
  list(input: ToshiProviderAuthorityInput): Promise<readonly ToshiProviderConnection[]>;
  getConnectionIdentity(input: GetToshiProviderConnectionIdentityInput): Promise<ToshiProviderConnectionIdentity | null>;
  connect(input: ConnectToshiProviderInput): Promise<ToshiProviderConnection>;
  selectModel(input: SelectToshiProviderModelInput): Promise<ToshiProviderConnection>;
  setDefault(input: SetDefaultToshiProviderInput): Promise<ToshiProviderConnection>;
  revoke(input: RevokeToshiProviderInput): Promise<ToshiProviderConnection>;
  getAuthority(input: GetToshiProviderAuthorityInput): Promise<ToshiProviderCredentialAuthority>;
}

export interface PostgresToshiProviderRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly audit: (
    event: Readonly<{ type: "toshi_provider_commit_unknown" }>,
  ) => void | Promise<void>;
}
