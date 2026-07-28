import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createProductMediaUploadService } from "./upload-service.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const PRODUCT = "20000000-0000-4000-8000-000000000001";
const OPERATION = "40000000-0000-4000-8000-000000000001";
const mediaDigest = createHash("sha256").update("celebix-product-media-v1\0").update(STORE).update("\0").update(PRODUCT).update("\0").update(OPERATION).digest("hex");
const MEDIA = `${mediaDigest.slice(0, 8)}-${mediaDigest.slice(8, 12)}-8${mediaDigest.slice(13, 16)}-8${mediaDigest.slice(17, 20)}-${mediaDigest.slice(20, 32)}`;
const bytes = new Uint8Array([1, 2, 3, 4]);
const payloadSha256 = createHash("sha256").update(bytes).digest("hex");
const tenantContext = { schemaVersion: 1, requestId: OPERATION, principal: { id: "60000000-0000-4000-8000-000000000001", issuer: "https://identity.example.test/oidc", subject: "pilot" }, store: { id: STORE, slug: "pilot-store", status: "active" }, membership: { id: "70000000-0000-4000-8000-000000000001", role: "store_owner", status: "active" }, entitlements: { schemaVersion: 1, planId: "00000000-0000-4000-8000-000000000001", planCode: "free_starter", version: 1, status: "active", features: ["catalog", "media"], limits: { products: 100, staff: 1, storageBytes: 1_000_000_000 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR" } as const;
const base = { operationId: OPERATION, mediaId: MEDIA, productId: PRODUCT, objectKey: `stores/${STORE}/products/${PRODUCT}/${MEDIA}.webp`, publicUrl: `https://media.saas-staging.celebix.site/stores/${STORE}/products/${PRODUCT}/${MEDIA}.webp`, mediaType: "image/webp" as const, byteSize: bytes.byteLength, payloadSha256, version: 1 };
const durable = { id: MEDIA, storeId: STORE, productId: PRODUCT, objectKey: base.objectKey, publicUrl: base.publicUrl, mediaType: "image/webp" as const, altText: "Pilot", width: 10, height: 10, byteSize: bytes.byteLength, sortOrder: 0, status: "active" as const, createdAt: "2026-07-28T12:00:00.000Z", updatedAt: "2026-07-28T12:00:00.002Z", version: 1 };
const uploadInput = { tenantContext, operationId: OPERATION, productId: PRODUCT, mediaType: "image/webp" as const, altText: "Pilot", width: 10, height: 10, bytes };

test("operation inspection is read-only and distinguishes absent from exact durable state", async () => {
  const states = ["reserved", "uploaded", "committed", "cleanup_required", "deleted"] as const;
  for (const state of states) {
    const calls: string[] = [];
    const service = createProductMediaUploadService({
      repository: { async recoverProductMediaOperation() { calls.push("recover"); return { ...base, state }; } } as any,
      storage: {} as any,
      now: () => new Date("2026-07-28T12:00:00.000Z"),
    });
    assert.equal(await service.inspectOperation(uploadInput), state);
    assert.deepEqual(calls, ["recover"]);
  }
  const absent = createProductMediaUploadService({
    repository: { async recoverProductMediaOperation() { throw Object.assign(new Error("missing"), { code: "media_not_found" }); } } as any,
    storage: {} as any,
    now: () => new Date("2026-07-28T12:00:00.000Z"),
  });
  assert.equal(await absent.inspectOperation(uploadInput), "absent");
});

test("upload saga reserves writes verifies and finalizes in exact order", async () => {
  const calls: string[] = [];
  const repository = {
    async reserveProductMedia(input: any) { calls.push("reserve"); assert.equal(input.payloadSha256, payloadSha256); return { ...base, state: "reserved" as const }; },
    async markProductMediaUploaded() { calls.push("uploaded"); return { ...base, state: "uploaded" as const, version: 2 }; },
    async finalizeProductMedia() { calls.push("finalize"); return { ...base, state: "committed" as const, version: 3 }; },
    async listProductMedia() { calls.push("list"); return [durable]; },
  } as any;
  const storage = {
    publicUrl() { throw new Error("not called"); },
    async put(input: any) { calls.push("put"); assert.equal(input.payloadSha256, payloadSha256); },
    async head() { calls.push("head"); return calls.filter((call) => call === "head").length === 1 ? { kind: "not_found" } as const : { kind: "found", byteSize: bytes.byteLength, mediaType: "image/webp", payloadSha256, publication: "pending" } as const; },
    async publish() { calls.push("publish"); },
    async unpublish() { throw new Error("not called"); },
    async delete() { calls.push("delete"); },
  };
  const service = createProductMediaUploadService({ repository, storage, now: () => new Date("2026-07-28T12:00:00.000Z") });
  const result = await service.upload({ tenantContext, operationId: OPERATION, productId: PRODUCT, mediaType: "image/webp", altText: "Pilot", width: 10, height: 10, bytes });
  assert.deepEqual(calls, ["reserve", "head", "put", "head", "uploaded", "finalize", "publish", "list"]);
  assert.deepEqual(result.media, durable);
});

test("upload saga recovers an unknown finalize exactly once without a second write", async () => {
  const calls: string[] = [];
  const repository = {
    async reserveProductMedia() { calls.push("reserve"); return { ...base, state: "reserved" as const }; },
    async markProductMediaUploaded() { calls.push("uploaded"); return { ...base, state: "uploaded" as const, version: 2 }; },
    async finalizeProductMedia() { calls.push("finalize"); throw Object.assign(new Error("unavailable"), { code: "unavailable" }); },
    async recoverProductMediaOperation() { calls.push("recover"); return { ...base, state: "committed" as const, version: 3 }; },
    async listProductMedia() { calls.push("list"); return [durable]; },
  } as any;
  const storage = { publicUrl() { throw new Error(); }, async put() { calls.push("put"); }, async head() { calls.push("head"); return { kind: "found", byteSize: bytes.byteLength, mediaType: "image/webp", payloadSha256, publication: "pending" } as const; }, async publish() { calls.push("publish"); }, async unpublish() { throw new Error("not called"); }, async delete() { calls.push("delete"); } };
  const service = createProductMediaUploadService({ repository, storage, now: () => new Date("2026-07-28T12:00:00.000Z") });
  const result = await service.upload({ tenantContext, operationId: OPERATION, productId: PRODUCT, mediaType: "image/webp", altText: "Pilot", width: 10, height: 10, bytes });
  assert.equal(result.media.id, MEDIA);
  assert.equal(calls.filter((call) => call === "finalize").length, 1);
  assert.equal(calls.filter((call) => call === "recover").length, 1);
  assert.equal(calls.includes("delete"), false);
});

test("upload saga recovers an unknown uploaded transition before finalizing", async () => {
  const calls: string[] = [];
  const repository = {
    async reserveProductMedia() { calls.push("reserve"); return { ...base, state: "reserved" as const }; },
    async markProductMediaUploaded() { calls.push("uploaded"); throw Object.assign(new Error("unavailable"), { code: "unavailable" }); },
    async recoverProductMediaOperation() { calls.push("recover"); return { ...base, state: "uploaded" as const, version: 2 }; },
    async finalizeProductMedia() { calls.push("finalize"); return { ...base, state: "committed" as const, version: 3 }; },
    async listProductMedia() { calls.push("list"); return [durable]; },
  } as any;
  const storage = { publicUrl() { throw new Error(); }, async put() { calls.push("put"); }, async head() { calls.push("head"); return { kind: "found", byteSize: bytes.byteLength, mediaType: "image/webp", payloadSha256, publication: "pending" } as const; }, async publish() { calls.push("publish"); }, async unpublish() { throw new Error("not called"); }, async delete() { calls.push("delete"); } };
  const service = createProductMediaUploadService({ repository, storage, now: () => new Date("2026-07-28T12:00:00.000Z") });
  const result = await service.upload({ tenantContext, operationId: OPERATION, productId: PRODUCT, mediaType: "image/webp", altText: "Pilot", width: 10, height: 10, bytes });
  assert.equal(result.media.id, MEDIA);
  assert.deepEqual(calls, ["reserve", "head", "uploaded", "recover", "finalize", "publish", "list"]);
});

test("upload saga resumes a recovered reserved object with HEAD and never repeats its R2 PUT", async () => {
  const calls: string[] = [];
  const repository = {
    async reserveProductMedia() { calls.push("reserve"); throw Object.assign(new Error("unavailable"), { code: "unavailable" }); },
    async recoverProductMediaOperation() { calls.push("recover"); return { ...base, state: "reserved" as const }; },
    async markProductMediaUploaded() { calls.push("uploaded"); return { ...base, state: "uploaded" as const, version: 2 }; },
    async finalizeProductMedia() { calls.push("finalize"); return { ...base, state: "committed" as const, version: 3 }; },
    async listProductMedia() { calls.push("list"); return [durable]; },
  } as any;
  const storage = { publicUrl() { throw new Error(); }, async put() { calls.push("put"); }, async head() { calls.push("head"); return { kind: "found", byteSize: bytes.byteLength, mediaType: "image/webp", payloadSha256, publication: "pending" } as const; }, async publish() { calls.push("publish"); }, async unpublish() { throw new Error("not called"); }, async delete() { calls.push("delete"); } };
  const service = createProductMediaUploadService({ repository, storage, now: () => new Date("2026-07-28T12:00:00.000Z") });
  const result = await service.upload({ tenantContext, operationId: OPERATION, productId: PRODUCT, mediaType: "image/webp", altText: "Pilot", width: 10, height: 10, bytes });
  assert.equal(result.replayed, true);
  assert.deepEqual(calls, ["reserve", "recover", "head", "uploaded", "finalize", "publish", "list"]);
});

test("upload saga recovers an unknown R2 PUT with one HEAD and never cleans or repeats the write", async () => {
  const calls: string[] = [];
  const repository = {
    async reserveProductMedia() { calls.push("reserve"); return { ...base, state: "reserved" as const }; },
    async markProductMediaUploaded() { calls.push("uploaded"); return { ...base, state: "uploaded" as const, version: 2 }; },
    async finalizeProductMedia() { calls.push("finalize"); return { ...base, state: "committed" as const, version: 3 }; },
    async listProductMedia() { calls.push("list"); return [durable]; },
    async requireProductMediaCleanup() { calls.push("cleanup"); throw new Error("must not clean"); },
  } as any;
  let heads = 0;
  const storage = {
    publicUrl() { throw new Error(); },
    async put() { calls.push("put"); throw Object.assign(new Error("outcome unknown"), { code: "write_unknown" }); },
    async head() { calls.push("head"); heads += 1; return heads === 1 ? { kind: "not_found" } as const : { kind: "found", byteSize: bytes.byteLength, mediaType: "image/webp", payloadSha256, publication: "pending" } as const; },
    async publish() { calls.push("publish"); },
    async unpublish() { throw new Error("not called"); },
    async delete() { calls.push("delete"); },
  };
  const service = createProductMediaUploadService({ repository, storage, now: () => new Date("2026-07-28T12:00:00.000Z") });
  const result = await service.upload({ tenantContext, operationId: OPERATION, productId: PRODUCT, mediaType: "image/webp", altText: "Pilot", width: 10, height: 10, bytes });
  assert.equal(result.media.id, MEDIA);
  assert.deepEqual(calls, ["reserve", "head", "put", "head", "uploaded", "finalize", "publish", "list"]);
});

test("upload saga leaves an unresolved R2 PUT reserved without cleanup or a second write", async () => {
  const calls: string[] = [];
  const repository = {
    async reserveProductMedia() { calls.push("reserve"); return { ...base, state: "reserved" as const }; },
    async requireProductMediaCleanup() { calls.push("cleanup"); throw new Error("must not clean"); },
  } as any;
  const unknown = Object.assign(new Error("outcome unknown"), { code: "write_unknown" });
  const storage = {
    publicUrl() { throw new Error(); },
    async put() { calls.push("put"); throw unknown; },
    async head() { calls.push("head"); return { kind: "not_found" } as const; },
    async publish() { throw new Error("not called"); },
    async unpublish() { throw new Error("not called"); },
    async delete() { calls.push("delete"); },
  };
  const service = createProductMediaUploadService({ repository, storage, now: () => new Date("2026-07-28T12:00:00.000Z") });
  await assert.rejects(service.upload({ tenantContext, operationId: OPERATION, productId: PRODUCT, mediaType: "image/webp", altText: "Pilot", width: 10, height: 10, bytes }), unknown);
  assert.deepEqual(calls, ["reserve", "head", "put", "head"]);
});

test("upload saga gives cleanup-required replay one bounded exact delete attempt", async () => {
  const calls: string[] = [];
  const repository = {
    async reserveProductMedia() { calls.push("reserve"); return { ...base, state: "cleanup_required" as const, version: 2 }; },
    async requireProductMediaCleanup() { calls.push("cleanup"); return { ...base, state: "cleanup_required" as const, version: 2 }; },
    async markProductMediaDeleted() { calls.push("deleted"); return { ...base, state: "deleted" as const, version: 3 }; },
  } as any;
  const storage = {
    publicUrl() { throw new Error(); },
    async put() { throw new Error("not called"); },
    async head() { throw new Error("not called"); },
    async publish() { throw new Error("not called"); },
    async unpublish() { throw new Error("not called"); },
    async delete(objectKey: string) { calls.push("delete"); assert.equal(objectKey, base.objectKey); },
  };
  const service = createProductMediaUploadService({ repository, storage, now: () => new Date("2026-07-28T12:00:00.000Z") });
  await assert.rejects(service.upload({ tenantContext, operationId: OPERATION, productId: PRODUCT, mediaType: "image/webp", altText: "Pilot", width: 10, height: 10, bytes }), /product_media_upload_unavailable/);
  assert.deepEqual(calls, ["reserve", "cleanup", "delete", "deleted"]);
});

test("upload saga recovers unknown cleanup and deleted transitions without repeating writes", async () => {
  for (const unknownStage of ["cleanup", "deleted"] as const) {
    const calls: string[] = [];
    const repository = {
      async reserveProductMedia() { calls.push("reserve"); return { ...base, state: "reserved" as const }; },
      async requireProductMediaCleanup() {
        calls.push("cleanup");
        if (unknownStage === "cleanup") throw Object.assign(new Error("unavailable"), { code: "unavailable" });
        return { ...base, state: "cleanup_required" as const, version: 2 };
      },
      async markProductMediaDeleted() {
        calls.push("deleted");
        if (unknownStage === "deleted") throw Object.assign(new Error("unavailable"), { code: "unavailable" });
        return { ...base, state: "deleted" as const, version: 3 };
      },
      async recoverProductMediaOperation() {
        calls.push("recover");
        return { ...base, state: unknownStage === "cleanup" ? "cleanup_required" as const : "deleted" as const, version: unknownStage === "cleanup" ? 2 : 3 };
      },
    } as any;
    const storageFailure = Object.assign(new Error("storage failed"), { code: "write_rejected" });
    const storage = { publicUrl() { throw new Error(); }, async put() { calls.push("put"); throw storageFailure; }, async head() { calls.push("head"); return { kind: "not_found" } as const; }, async publish() { throw new Error("not called"); }, async unpublish() { throw new Error("not called"); }, async delete() { calls.push("delete"); } };
    const service = createProductMediaUploadService({ repository, storage, now: () => new Date("2026-07-28T12:00:00.000Z") });
    await assert.rejects(service.upload({ tenantContext, operationId: OPERATION, productId: PRODUCT, mediaType: "image/webp", altText: "Pilot", width: 10, height: 10, bytes }), storageFailure);
    assert.equal(calls.filter((call) => call === unknownStage).length, 1);
    assert.equal(calls.filter((call) => call === "recover").length, 1);
    assert.equal(calls.filter((call) => call === "delete").length, 1);
    assert.deepEqual(calls.slice(0, 3), ["reserve", "head", "put"]);
  }
});
