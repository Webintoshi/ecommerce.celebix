import type { TenantContext } from "@celebix/saas-contracts";
import type { ProductMedia, ProductMediaLifecycle, ProductMediaReservation } from "../../../saas-contracts/src/media/index.ts";
import type { PublicImageMediaType } from "../../../saas-contracts/src/storefront/index.ts";
import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export type MediaAuthorityInput = Readonly<{ tenantContext: TenantContext; now: Date }>;
export type ListProductMediaInput = MediaAuthorityInput & Readonly<{ productId: string; includeArchived?: boolean }>;
export type UpdateProductMediaAltInput = MediaAuthorityInput & Readonly<{ operationId: string; productId: string; mediaId: string; expectedVersion: number; altText: string }>;
export type ReorderProductMediaInput = MediaAuthorityInput & Readonly<{ operationId: string; productId: string; orderedMediaIds: readonly string[] }>;
export type ArchiveProductMediaInput = MediaAuthorityInput & Readonly<{ operationId: string; productId: string; mediaId: string; expectedVersion: number }>;
export type ProductMediaVersionedInput = MediaAuthorityInput & Readonly<{ operationId: string; productId: string; mediaId: string; expectedVersion: number }>;
export type ProductMediaCandidateInput = MediaAuthorityInput & Readonly<{ productId: string; mediaId: string; expectedVersion: number }>;
export type ProductMediaStorageCandidate = Readonly<{
  mediaId: string; productId: string; objectKey: string; mediaType: PublicImageMediaType; byteSize: number; expectedVersion: number;
}>;
export type ProductMediaLifecycleMutationResult = Readonly<{ media: ProductMediaLifecycle; replayed: boolean }>;
export type MarkArchivedProductMediaObjectDeletedInput = MediaAuthorityInput & Readonly<{
  operationId: string; productId: string; mediaId: string; objectKey: string;
}>;
export type MediaMutationResult = Readonly<{ media: ProductMedia; replayed: boolean }>;
export type ReserveProductMediaInput = MediaAuthorityInput & Readonly<{
  operationId: string; mediaId: string; productId: string; variantId?: string;
  mediaType: PublicImageMediaType; altText: string; width: number; height: number;
  byteSize: number; payloadSha256: string;
}>;
export type ProductMediaLifecycleInput = MediaAuthorityInput & Readonly<{
  operationId: string; mediaId: string; productId: string; payloadSha256: string;
}>;

export interface ProductMediaRepository {
  reserveProductMedia(input: ReserveProductMediaInput): Promise<ProductMediaReservation>;
  markProductMediaUploaded(input: ProductMediaLifecycleInput): Promise<ProductMediaReservation>;
  finalizeProductMedia(input: ProductMediaLifecycleInput): Promise<ProductMediaReservation>;
  recoverProductMediaOperation(input: ProductMediaLifecycleInput): Promise<ProductMediaReservation>;
  requireProductMediaCleanup(input: ProductMediaLifecycleInput): Promise<ProductMediaReservation>;
  markProductMediaDeleted(input: ProductMediaLifecycleInput): Promise<ProductMediaReservation>;
  listProductMedia(input: ListProductMediaInput): Promise<readonly ProductMedia[]>;
  listProductMediaLifecycle(input: ListProductMediaInput): Promise<readonly ProductMediaLifecycle[]>;
  updateAltText(input: UpdateProductMediaAltInput): Promise<MediaMutationResult>;
  reorderMedia(input: ReorderProductMediaInput): Promise<readonly ProductMedia[]>;
  reserveArchiveMedia(input: ArchiveProductMediaInput): Promise<MediaMutationResult>;
  finalizeArchiveMedia(input: ArchiveProductMediaInput): Promise<MediaMutationResult>;
  recoverArchiveMedia(input: ArchiveProductMediaInput): Promise<MediaMutationResult>;
  getProductMediaRestoreCandidate(input: ProductMediaCandidateInput): Promise<ProductMediaStorageCandidate>;
  restoreProductMedia(input: ProductMediaVersionedInput): Promise<ProductMediaLifecycleMutationResult>;
  claimArchivedProductMediaCleanup(input: ProductMediaVersionedInput): Promise<ProductMediaStorageCandidate>;
  recordArchivedProductMediaObjectDeleted(input: MarkArchivedProductMediaObjectDeletedInput): Promise<ProductMediaLifecycleMutationResult>;
  markArchivedProductMediaObjectDeleted(input: MarkArchivedProductMediaObjectDeletedInput): Promise<MediaMutationResult>;
}

export type PostgresProductMediaRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_app";
  mediaOrigin: string;
  timeouts: PostgresTimeoutOptions;
  audit: (event: Readonly<{ type: "media_commit_unknown" }>) => void | Promise<void>;
}>;
