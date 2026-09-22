import assert from "node:assert/strict";
import test from "node:test";

import { CatalogRepositoryError } from "@celebix/saas-data";

import { createProductDeletionService } from "./product-deletion-service.ts";

const PRODUCT = "20000000-0000-4000-8000-000000000001";
const MEDIA = "30000000-0000-4000-8000-000000000001";
const OPERATION = "40000000-0000-4000-8000-000000000001";
const STORE = "10000000-0000-4000-8000-000000000001";
const KEY = `stores/${STORE}/products/${PRODUCT}/${MEDIA}.webp`;
const now = new Date("2026-09-22T09:00:00.000Z");
const tenantContext = { store: { id: STORE } } as any;
const input = Object.freeze({
  tenantContext,
  now,
  productId: PRODUCT,
  operationId: OPERATION,
  expectedVersion: 7,
  confirmation: "Test ürün",
});

test("product deletion proves every owned media object absent before relational deletion", async () => {
  const calls: string[] = [];
  let attempts = 0;
  const service = createProductDeletionService({
    catalog: {
      async deleteProduct() {
        calls.push(`delete:${++attempts}`);
        if (attempts === 1) throw new CatalogRepositoryError("cleanup_pending");
        return { resourceKind: "product", resourceId: PRODUCT, deleted: true, auditId: OPERATION, replayed: false };
      },
    } as any,
    async resolveMediaRuntime() { return {
      media: {
        async listProductMediaLifecycle() {
          calls.push("list");
          return [{ id: MEDIA, productId: PRODUCT, status: "archived", cleanupState: "eligible", version: 9 }];
        },
        async claimArchivedProductMediaCleanup() {
          calls.push("claim");
          return { mediaId: MEDIA, productId: PRODUCT, objectKey: KEY, mediaType: "image/webp", byteSize: 12, expectedVersion: 9 };
        },
        async recordArchivedProductMediaObjectDeleted() {
          calls.push("proof");
          return { media: { id: MEDIA }, replayed: false };
        },
      },
      storage: {
        async delete(key: string) { assert.equal(key, KEY); calls.push("object-delete"); },
        async head(key: string) { assert.equal(key, KEY); calls.push("absence-proof"); return { kind: "not_found" }; },
      },
    } as any; },
  });

  const result = await service.delete(input);
  assert.equal(result.deleted, true);
  assert.deepEqual(calls, ["delete:1", "list", "claim", "object-delete", "absence-proof", "proof", "delete:2"]);
});

test("product deletion skips media whose object absence was already committed", async () => {
  let destructiveStorageCalls = 0;
  let attempts = 0;
  const service = createProductDeletionService({
    catalog: {
      async deleteProduct() {
        if (++attempts === 1) throw new CatalogRepositoryError("cleanup_pending");
        return { resourceKind: "product", resourceId: PRODUCT, deleted: true, auditId: OPERATION, replayed: false };
      },
    } as any,
    async resolveMediaRuntime() { return {
      media: { async listProductMediaLifecycle() { return [{ id: MEDIA, productId: PRODUCT, status: "archived", cleanupState: "object_deleted", version: 11 }]; } },
      storage: { async delete() { destructiveStorageCalls += 1; }, async head() { return { kind: "not_found" }; } },
    } as any; },
  });

  await service.delete(input);
  assert.equal(destructiveStorageCalls, 0);
});

test("storage failure keeps the archived product retryable and never reports deletion", async () => {
  let relationalAttempts = 0;
  const service = createProductDeletionService({
    catalog: {
      async deleteProduct() { relationalAttempts += 1; throw new CatalogRepositoryError("cleanup_pending"); },
    } as any,
    async resolveMediaRuntime() { return {
      media: {
        async listProductMediaLifecycle() { return [{ id: MEDIA, productId: PRODUCT, status: "archived", cleanupState: "eligible", version: 9 }]; },
        async claimArchivedProductMediaCleanup() { return { mediaId: MEDIA, productId: PRODUCT, objectKey: KEY, mediaType: "image/webp", byteSize: 12, expectedVersion: 9 }; },
      },
      storage: { async delete() { throw new Error("r2 unavailable"); }, async head() { return { kind: "found" }; } },
    } as any; },
  });

  await assert.rejects(service.delete(input), (error: unknown) => error instanceof CatalogRepositoryError && error.code === "cleanup_failed");
  assert.equal(relationalAttempts, 1);
});

test("successful product deletion invalidates only the exact public media cache entry", async () => {
  const invalidations: unknown[] = [];
  let mediaRuntimeResolutions = 0;
  const service = createProductDeletionService({
    catalog: { async deleteProduct() { return { resourceKind: "product", resourceId: PRODUCT, deleted: true, auditId: OPERATION, replayed: false }; } } as any,
    async resolveMediaRuntime() { mediaRuntimeResolutions += 1; return null; },
    cache: { async invalidateEntry(selected: unknown) { invalidations.push(selected); } } as any,
  });
  await service.delete(input);
  assert.equal(mediaRuntimeResolutions, 0);
  assert.deepEqual(invalidations, [{
    storeId: STORE,
    dataClass: "catalog",
    schemaVersion: "v1",
    scope: "product-media",
    input: { productId: PRODUCT },
  }]);
});
