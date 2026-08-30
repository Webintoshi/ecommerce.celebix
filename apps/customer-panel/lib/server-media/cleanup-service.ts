import "server-only";
import type { TenantContext } from "@celebix/saas-contracts";
import type { ProductMediaRepository } from "@celebix/saas-data";
import type { ProductMediaStorage } from "./r2-storage.ts";

export function createArchivedProductMediaCleanupService(dependencies: Readonly<{
  repository: ProductMediaRepository;
  storage: ProductMediaStorage;
}>) {
  return Object.freeze({
    async cleanup(input: Readonly<{
      tenantContext: TenantContext;
      now: Date;
      operationId: string;
      productId: string;
      mediaId: string;
      expectedVersion: number;
    }>) {
      const candidate = await dependencies.repository.claimArchivedProductMediaCleanup(input);
      if (candidate.productId !== input.productId || candidate.mediaId !== input.mediaId || candidate.expectedVersion !== input.expectedVersion) {
        throw new Error("product_media_cleanup_candidate_mismatch");
      }
      await dependencies.storage.delete(candidate.objectKey);
      if ((await dependencies.storage.head(candidate.objectKey)).kind !== "not_found") {
        throw new Error("product_media_cleanup_proof_missing");
      }
      return dependencies.repository.recordArchivedProductMediaObjectDeleted({
        tenantContext: input.tenantContext,
        now: input.now,
        operationId: input.operationId,
        productId: input.productId,
        mediaId: input.mediaId,
        objectKey: candidate.objectKey,
      });
    },
  });
}
