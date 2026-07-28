import { createHash } from "node:crypto";

import type { TenantContext } from "@celebix/saas-contracts";
import type { ProductMediaRepository } from "@celebix/saas-data";
import type { ProductMedia, ProductMediaReservation } from "../../../../packages/saas-contracts/src/media/index.ts";
import type { PublicImageMediaType } from "../../../../packages/saas-contracts/src/storefront/index.ts";

import type { ProductMediaStorage } from "./r2-storage.ts";

export type ProductMediaUploadInput = Readonly<{
  tenantContext: TenantContext;
  operationId: string;
  productId: string;
  variantId?: string;
  mediaType: PublicImageMediaType;
  altText: string;
  width: number;
  height: number;
  bytes: Uint8Array;
}>;

export type ProductMediaUploadResult = Readonly<{
  media: ProductMedia;
  replayed: boolean;
}>;

export interface ProductMediaUploadService {
  upload(input: ProductMediaUploadInput): Promise<ProductMediaUploadResult>;
}

type Dependencies = Readonly<{
  repository: ProductMediaRepository;
  storage: ProductMediaStorage;
  now(): Date;
}>;

function unavailable(): Error { return new Error("product_media_upload_unavailable"); }
function isUnavailable(error: unknown): boolean { return (error as { code?: unknown })?.code === "unavailable"; }
function isUnknownStorageWrite(error: unknown): boolean { return (error as { code?: unknown })?.code === "write_unknown"; }
function isKnownStorageRejection(error: unknown): boolean { return (error as { code?: unknown })?.code === "write_rejected"; }
function deriveMediaId(input: Pick<ProductMediaUploadInput, "tenantContext" | "operationId" | "productId">): string {
  const digest = createHash("sha256")
    .update("celebix-product-media-v1\0")
    .update(input.tenantContext.store.id)
    .update("\0")
    .update(input.productId)
    .update("\0")
    .update(input.operationId)
    .digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-8${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

export function createProductMediaUploadService(dependencies: Dependencies): ProductMediaUploadService {
  if (!dependencies?.repository || !dependencies.storage || typeof dependencies.now !== "function") throw unavailable();
  let priorTimestamp = 0;
  function now(): Date {
    const candidate = dependencies.now();
    if (!(candidate instanceof Date) || !Number.isFinite(candidate.getTime())) throw unavailable();
    const timestamp = Math.max(candidate.getTime(), priorTimestamp + 1);
    priorTimestamp = timestamp;
    return new Date(timestamp);
  }
  function lifecycle(input: ProductMediaUploadInput, mediaId: string, payloadSha256: string) {
    return {
      tenantContext: input.tenantContext,
      now: now(),
      operationId: input.operationId,
      mediaId,
      productId: input.productId,
      payloadSha256,
    };
  }
  function assertAuthority(reservation: ProductMediaReservation, input: ProductMediaUploadInput, mediaId: string, payloadSha256: string): void {
    const extension = input.mediaType === "image/jpeg" ? "jpg" : input.mediaType.slice("image/".length);
    if (
      reservation.operationId !== input.operationId || reservation.mediaId !== mediaId ||
      reservation.productId !== input.productId || reservation.mediaType !== input.mediaType ||
      reservation.byteSize !== input.bytes.byteLength || reservation.payloadSha256 !== payloadSha256 ||
      reservation.objectKey !== `stores/${input.tenantContext.store.id}/products/${input.productId}/${mediaId}.${extension}`
    ) throw unavailable();
  }
  function isExactPendingObject(
    selected: Awaited<ReturnType<ProductMediaStorage["head"]>>,
    input: ProductMediaUploadInput,
    payloadSha256: string,
  ): boolean {
    return selected.kind === "found" && selected.byteSize === input.bytes.byteLength && selected.mediaType === input.mediaType && selected.payloadSha256 === payloadSha256 && selected.publication === "pending";
  }
  async function recover(input: ProductMediaUploadInput, mediaId: string, payloadSha256: string): Promise<ProductMediaReservation | null> {
    try {
      const recovered = await dependencies.repository.recoverProductMediaOperation(lifecycle(input, mediaId, payloadSha256));
      assertAuthority(recovered, input, mediaId, payloadSha256);
      return recovered;
    } catch { return null; }
  }
  async function committedMedia(input: ProductMediaUploadInput, mediaId: string, reservation: ProductMediaReservation): Promise<ProductMedia> {
    const selected = await dependencies.repository.listProductMedia({
      tenantContext: input.tenantContext,
      now: now(),
      productId: input.productId,
      includeArchived: true,
    });
    const media = selected.find((candidate) => candidate.id === mediaId);
    if (!media || media.storeId !== input.tenantContext.store.id || media.productId !== input.productId ||
        media.objectKey !== reservation.objectKey || media.publicUrl !== reservation.publicUrl ||
        media.mediaType !== reservation.mediaType || media.byteSize !== reservation.byteSize || media.status !== "active") throw unavailable();
    return media;
  }
  async function complete(input: ProductMediaUploadInput, mediaId: string, reservation: ProductMediaReservation, replayed: boolean): Promise<ProductMediaUploadResult> {
    await dependencies.storage.publish({ objectKey: reservation.objectKey, mediaType: reservation.mediaType, byteSize: reservation.byteSize, payloadSha256: reservation.payloadSha256 });
    return Object.freeze({ media: await committedMedia(input, mediaId, reservation), replayed });
  }
  async function cleanup(input: ProductMediaUploadInput, mediaId: string, payloadSha256: string, objectKey: string): Promise<void> {
    let cleanupAuthority: ProductMediaReservation;
    try {
      cleanupAuthority = await dependencies.repository.requireProductMediaCleanup(lifecycle(input, mediaId, payloadSha256));
      assertAuthority(cleanupAuthority, input, mediaId, payloadSha256);
    } catch (error) {
      if (!isUnavailable(error)) return;
      const recovered = await recover(input, mediaId, payloadSha256);
      if (!recovered) return;
      cleanupAuthority = recovered;
    }
    if (cleanupAuthority.state === "committed" || cleanupAuthority.state === "deleted") return;
    if (cleanupAuthority.state !== "cleanup_required") return;
    try { await dependencies.storage.delete(objectKey); } catch { return; }
    try {
      const deleted = await dependencies.repository.markProductMediaDeleted(lifecycle(input, mediaId, payloadSha256));
      assertAuthority(deleted, input, mediaId, payloadSha256);
    } catch (error) {
      if (isUnavailable(error)) await recover(input, mediaId, payloadSha256);
    }
  }

  return Object.freeze({
    async upload(input: ProductMediaUploadInput): Promise<ProductMediaUploadResult> {
      if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength < 1 || input.bytes.byteLength > 5_242_880) throw unavailable();
      const payloadSha256 = createHash("sha256").update(input.bytes).digest("hex");
      const mediaId = deriveMediaId(input);
      let reservation: ProductMediaReservation;
      let reservationRecovered = false;
      try {
        reservation = await dependencies.repository.reserveProductMedia({
          tenantContext: input.tenantContext,
          now: now(),
          operationId: input.operationId,
          mediaId,
          productId: input.productId,
          ...(input.variantId ? { variantId: input.variantId } : {}),
          mediaType: input.mediaType,
          altText: input.altText,
          width: input.width,
          height: input.height,
          byteSize: input.bytes.byteLength,
          payloadSha256,
        });
      } catch (error) {
        if (!isUnavailable(error)) throw error;
        const recovered = await recover(input, mediaId, payloadSha256);
        if (!recovered) throw error;
        reservation = recovered;
        reservationRecovered = true;
      }
      assertAuthority(reservation, input, mediaId, payloadSha256);
      if (reservation.state === "committed") return complete(input, mediaId, reservation, true);
      if (reservation.state === "cleanup_required") {
        await cleanup(input, mediaId, payloadSha256, reservation.objectKey);
        throw unavailable();
      }
      if (reservation.state === "deleted") throw unavailable();

      if (reservation.state === "reserved") {
        const existing = await dependencies.storage.head(reservation.objectKey);
        if (existing.kind === "found" && !isExactPendingObject(existing, input, payloadSha256)) throw unavailable();
        if (existing.kind === "not_found") {
          let writeVerified = false;
          try {
            await dependencies.storage.put({ objectKey: reservation.objectKey, mediaType: input.mediaType, bytes: input.bytes, payloadSha256 });
          } catch (error) {
            if (isUnknownStorageWrite(error)) {
              const recovered = await dependencies.storage.head(reservation.objectKey);
              if (isExactPendingObject(recovered, input, payloadSha256)) {
                // The one read-only recovery proves the exact write committed.
                writeVerified = true;
              } else {
                throw error;
              }
            } else {
              if (isKnownStorageRejection(error)) await cleanup(input, mediaId, payloadSha256, reservation.objectKey);
              throw error;
            }
          }
          if (!writeVerified && !isExactPendingObject(await dependencies.storage.head(reservation.objectKey), input, payloadSha256)) throw unavailable();
        }
        let uploaded: ProductMediaReservation;
        try {
          uploaded = await dependencies.repository.markProductMediaUploaded(lifecycle(input, mediaId, payloadSha256));
          assertAuthority(uploaded, input, mediaId, payloadSha256);
        } catch (error) {
          if (!isUnavailable(error)) { await cleanup(input, mediaId, payloadSha256, reservation.objectKey); throw error; }
          const recovered = await recover(input, mediaId, payloadSha256);
          if (!recovered) throw error;
          uploaded = recovered;
        }
        if (uploaded.state === "committed") return complete(input, mediaId, uploaded, true);
        if (uploaded.state !== "uploaded") { await cleanup(input, mediaId, payloadSha256, reservation.objectKey); throw unavailable(); }
      }

      try {
        const finalized = await dependencies.repository.finalizeProductMedia(lifecycle(input, mediaId, payloadSha256));
        assertAuthority(finalized, input, mediaId, payloadSha256);
        if (finalized.state !== "committed") throw unavailable();
        return complete(input, mediaId, finalized, reservationRecovered || reservation.state !== "reserved");
      } catch (error) {
        if (isUnavailable(error)) {
          const recovered = await recover(input, mediaId, payloadSha256);
          if (!recovered) throw error;
          if (recovered.state === "committed") return complete(input, mediaId, recovered, true);
        }
        await cleanup(input, mediaId, payloadSha256, reservation.objectKey);
        throw error;
      }
    },
  });
}
