import type { TenantContext } from "@celebix/saas-contracts";
import type { ProductMedia } from "../../../saas-contracts/src/media/index.ts";
import type { PublicImageMediaType } from "../../../saas-contracts/src/storefront/index.ts";
import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export type MediaAuthorityInput = Readonly<{ tenantContext: TenantContext; now: Date }>;
export type AttachProductMediaInput = MediaAuthorityInput & Readonly<{
  operationId: string; mediaId: string; productId: string; variantId?: string;
  objectKey: string; publicUrl: string; mediaType: PublicImageMediaType; altText: string;
  width: number; height: number; byteSize: number;
}>;
export type ListProductMediaInput = MediaAuthorityInput & Readonly<{ productId: string; includeArchived?: boolean }>;
export type UpdateProductMediaAltInput = MediaAuthorityInput & Readonly<{ operationId: string; productId: string; mediaId: string; expectedVersion: number; altText: string }>;
export type ReorderProductMediaInput = MediaAuthorityInput & Readonly<{ operationId: string; productId: string; orderedMediaIds: readonly string[] }>;
export type ArchiveProductMediaInput = MediaAuthorityInput & Readonly<{ operationId: string; productId: string; mediaId: string; expectedVersion: number }>;
export type MediaMutationResult = Readonly<{ media: ProductMedia; replayed: boolean }>;

export interface ProductMediaRepository {
  attachMedia(input: AttachProductMediaInput): Promise<MediaMutationResult>;
  listProductMedia(input: ListProductMediaInput): Promise<readonly ProductMedia[]>;
  updateAltText(input: UpdateProductMediaAltInput): Promise<MediaMutationResult>;
  reorderMedia(input: ReorderProductMediaInput): Promise<readonly ProductMedia[]>;
  archiveMedia(input: ArchiveProductMediaInput): Promise<MediaMutationResult>;
}

export type PostgresProductMediaRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_app";
  timeouts: PostgresTimeoutOptions;
  audit: (event: Readonly<{ type: "media_commit_unknown" }>) => void | Promise<void>;
}>;
