import "server-only";

import { createHash } from "node:crypto";

import type { Cache } from "@celebix/saas-cache";
import {
  CatalogRepositoryError,
  type CatalogRepository,
  type DeleteProductInput,
} from "@celebix/saas-data";

import { createArchivedProductMediaCleanupService } from "../server-media/cleanup-service.ts";
import type { ServerMediaRuntime } from "../server-media/runtime.ts";

function cleanupOperationId(deletionOperationId: string, mediaId: string): string {
  const bytes = Buffer.from(createHash("sha256").update(`product-delete:${deletionOperationId}:${mediaId}`).digest("hex").slice(0, 32), "hex");
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createProductDeletionService(dependencies: Readonly<{
  catalog: CatalogRepository;
  resolveMediaRuntime(): Promise<ServerMediaRuntime | null>;
  cache?: Cache | null;
}>) {
  if (!dependencies?.catalog || typeof dependencies.resolveMediaRuntime !== "function") {
    throw new Error("product_deletion_service_invalid");
  }
  return Object.freeze({
    async delete(input: DeleteProductInput) {
      try {
        const result = await dependencies.catalog.deleteProduct(input);
        await dependencies.cache?.invalidateEntry({
          storeId: input.tenantContext.store.id,
          dataClass: "catalog",
          schemaVersion: "v1",
          scope: "product-media",
          input: { productId: input.productId },
        }).catch(() => undefined);
        return result;
      } catch (error) {
        if (!(error instanceof CatalogRepositoryError) || error.code !== "cleanup_pending") throw error;
      }

      let runtime;
      try {
        runtime = await dependencies.resolveMediaRuntime();
        if (runtime === null) throw new Error("product_media_runtime_unavailable");
        const cleanup = createArchivedProductMediaCleanupService({ repository: runtime.media, storage: runtime.storage });
        const media = await runtime.media.listProductMediaLifecycle({
          tenantContext: input.tenantContext,
          now: input.now,
          productId: input.productId,
          includeArchived: true,
        });
        for (const item of media) {
          if (item.cleanupState === "object_deleted") continue;
          await cleanup.cleanup({
            tenantContext: input.tenantContext,
            now: input.now,
            operationId: cleanupOperationId(input.operationId, item.id),
            productId: input.productId,
            mediaId: item.id,
            expectedVersion: item.version,
          });
        }
      } catch {
        throw new CatalogRepositoryError("cleanup_failed");
      }

      const result = await dependencies.catalog.deleteProduct(input);
      await dependencies.cache?.invalidateEntry({
        storeId: input.tenantContext.store.id,
        dataClass: "catalog",
        schemaVersion: "v1",
        scope: "product-media",
        input: { productId: input.productId },
      }).catch(() => undefined);
      return result;
    },
  });
}
