import type { StorefrontAsset, StorefrontAssetKind, TenantContext } from "@celebix/saas-contracts";
import type { PublicImageMediaType } from "../../../saas-contracts/src/storefront/types.ts";
import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export const STOREFRONT_ASSET_ERROR_CODES = Object.freeze([
  "invalid_input", "membership_denied", "store_inactive", "feature_not_enabled", "asset_not_found",
  "asset_limit_reached", "version_conflict", "operation_mismatch", "operation_not_found", "commit_unknown", "unavailable",
] as const);
export type StorefrontAssetErrorCode = (typeof STOREFRONT_ASSET_ERROR_CODES)[number];
export type StorefrontAssetAuthorityInput = Readonly<{ tenantContext: TenantContext; now: Date }>;
export type CreateStorefrontAssetInput = StorefrontAssetAuthorityInput & Readonly<{
  operationId: string; assetId: string; kind: StorefrontAssetKind; objectKey: string; publicUrl: string;
  mediaType: PublicImageMediaType; altText: string; width: number; height: number; byteSize: number; contentDigest: string;
}>;
export type ListStorefrontAssetsInput = StorefrontAssetAuthorityInput & Readonly<{ kind?: StorefrontAssetKind; includeArchived?: boolean }>;
export type ArchiveStorefrontAssetInput = StorefrontAssetAuthorityInput & Readonly<{ operationId: string; assetId: string; expectedVersion: number }>;
export type RecoverStorefrontAssetOperationInput = StorefrontAssetAuthorityInput & Readonly<{ operationId: string; operationKind: "create_asset" | "archive_asset"; fingerprint: string }>;
export type StorefrontAssetMutationResult = Readonly<{ asset: StorefrontAsset; replayed: boolean }>;
export type StorefrontAssetRecoveryResult = Readonly<{ kind: "found"; result: StorefrontAssetMutationResult } | { kind: "absent" }>;

export interface StorefrontAssetRepository {
  createAsset(input: CreateStorefrontAssetInput): Promise<StorefrontAssetMutationResult>;
  listAssets(input: ListStorefrontAssetsInput): Promise<readonly StorefrontAsset[]>;
  archiveAsset(input: ArchiveStorefrontAssetInput): Promise<StorefrontAssetMutationResult>;
  recoverOperation(input: RecoverStorefrontAssetOperationInput): Promise<StorefrontAssetRecoveryResult>;
}

export type PostgresStorefrontAssetRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_app";
  timeouts: PostgresTimeoutOptions;
  audit: (event: Readonly<{ type: "storefront_asset_commit_unknown" }>) => void | Promise<void>;
}>;
