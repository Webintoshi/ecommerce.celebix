import type {
  MerchantAdminJson,
  MerchantProviderCapability,
  MerchantProviderProfile,
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

export interface PostgresMerchantProviderProfileRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly audit: (
    event: Readonly<{ type: "merchant_provider_profile_commit_unknown" }>,
  ) => void | Promise<void>;
}
