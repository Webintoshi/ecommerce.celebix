import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { TenantContext } from "@celebix/saas-contracts";
import { deriveMigrationMediaUploadOperationId, ingestMigrationMediaItem } from "./media-ingestion.ts";

const STORE = "51000000-0000-4000-8000-000000000001";
const PRINCIPAL = "51000000-0000-4000-8000-000000000002";
const MEMBERSHIP = "51000000-0000-4000-8000-000000000003";
const PLAN = "51000000-0000-4000-8000-000000000004";
const JOB = "51000000-0000-4000-8000-000000000005";
const OPERATION = "51000000-0000-4000-8000-000000000006";
const PRODUCT = "51000000-0000-4000-8000-000000000007";
const VARIANT = "51000000-0000-4000-8000-000000000008";
const MEDIA = "51000000-0000-4000-8000-000000000009";
const URL = "https://media.example.test/uploads/yuzuk.png";
const URL_DIGEST = createHash("sha256").update(URL).digest("hex");
const NOW = new Date("2026-07-28T12:00:00.000Z");

function tenant(): TenantContext {
  return {
    schemaVersion: 1, requestId: "private",
    principal: { id: PRINCIPAL, issuer: "https://identity.test/oidc", subject: "private" },
    store: { id: STORE, slug: "guzide", status: "active" },
    membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
    entitlements: { schemaVersion: 1, planId: PLAN, planCode: "pilot", version: 1, status: "active", features: ["catalog"], limits: { products: 2_000, staff: 5, storageBytes: 1_000_000_000 }, validFrom: "2026-01-01T00:00:00.000Z" },
    locale: "tr-TR",
  } as TenantContext;
}
function authority(status: "pending" | "failed" | "committed" = "pending") {
  return Object.freeze({ jobId: JOB, sourceProductId: "30794", productId: PRODUCT, variantId: VARIANT, ordinal: 0, sourceUrlDigest: URL_DIGEST, status, ...(status === "committed" ? { committedMediaId: MEDIA } : {}) });
}
function job() {
  return Object.freeze({ jobId: JOB, sourceDigest: "a".repeat(64), status: "media_processing" as const, totalProducts: 1, importedProducts: 1, totalMedia: 1, committedMedia: 1, failedMedia: 0, categoryCount: 1, brandCount: 1, version: 3, updatedAt: NOW.toISOString(), replayed: false });
}
function input() { return { tenantContext: tenant(), now: NOW, operationId: OPERATION, jobId: JOB, sourceProductId: "30794", ordinal: 0, sourceUrl: URL, altText: "Altın yüzük" }; }

test("authorizes the URL digest before fetch and uploads only to the persisted product mapping", async () => {
  const calls: string[] = [];
  const migration = {
    async authorizeMedia(selected: any) { calls.push("authorize"); assert.equal(selected.sourceUrlDigest, URL_DIGEST); assert.equal(selected.productId, undefined); return authority(); },
    async recordMedia(selected: any) { calls.push("record"); assert.equal(selected.productId, undefined); assert.equal(selected.mediaId, MEDIA); assert.equal(selected.outcome, "committed"); return job(); },
  };
  const result = await ingestMigrationMediaItem(input(), {
    migration: migration as any,
    fetchImage: async () => { calls.push("fetch"); return { bytes: new Uint8Array(24), mediaType: "image/png" as const, width: 2, height: 3, byteSize: 24 }; },
    upload: { async upload(selected: any) { calls.push("upload"); assert.equal(selected.productId, PRODUCT); assert.equal(selected.variantId, VARIANT); assert.equal(selected.operationId, deriveMigrationMediaUploadOperationId({ storeId: STORE, jobId: JOB, sourceProductId: "30794", ordinal: 0 })); assert.notEqual(selected.operationId, OPERATION); return { media: { id: MEDIA, storeId: STORE, productId: PRODUCT, status: "active" }, replayed: false }; } } as any,
  });
  assert.deepEqual(calls, ["authorize", "fetch", "upload", "record"]);
  assert.deepEqual(result, { kind: "committed", job: job(), productId: PRODUCT, mediaId: MEDIA, replayed: false });
  assert.equal(JSON.stringify(result).includes(URL), false);
});

test("a committed migration item replays locally without fetch upload or another record write", async () => {
  const calls: string[] = [];
  const result = await ingestMigrationMediaItem(input(), {
    migration: { async authorizeMedia() { calls.push("authorize"); return authority("committed"); }, async recordMedia() { calls.push("record"); throw new Error("unused"); } } as any,
    fetchImage: async () => { calls.push("fetch"); throw new Error("unused"); },
    upload: { async upload() { calls.push("upload"); throw new Error("unused"); } } as any,
  });
  assert.deepEqual(calls, ["authorize"]);
  assert.deepEqual(result, { kind: "committed", productId: PRODUCT, mediaId: MEDIA, replayed: true });
});

test("a failed migration item resumes an existing durable upload operation before creating another media", async () => {
  const calls: string[] = [];
  const derived = deriveMigrationMediaUploadOperationId({ storeId: STORE, jobId: JOB, sourceProductId: "30794", ordinal: 0 });
  const result = await ingestMigrationMediaItem(input(), {
    migration: {
      async authorizeMedia() { calls.push("authorize"); return authority("failed"); },
      async recordMedia() { calls.push("record"); return job(); },
    } as any,
    fetchImage: async () => ({ bytes: new Uint8Array(24), mediaType: "image/png" as const, width: 2, height: 3, byteSize: 24 }),
    upload: {
      async inspectOperation(selected: any) { calls.push(`inspect:${selected.operationId}`); return "committed" as const; },
      async upload(selected: any) { calls.push(`upload:${selected.operationId}`); return { media: { id: MEDIA, storeId: STORE, productId: PRODUCT, status: "active" }, replayed: true }; },
    } as any,
  });
  assert.deepEqual(calls, ["authorize", `inspect:${derived}`, `upload:${derived}`, "record"]);
  assert.equal(result.mediaId, MEDIA);
});

test("a failed migration item starts a fresh upload only after read-only proof that the prior operation is deleted", async () => {
  const calls: string[] = [];
  const derived = deriveMigrationMediaUploadOperationId({ storeId: STORE, jobId: JOB, sourceProductId: "30794", ordinal: 0 });
  await ingestMigrationMediaItem(input(), {
    migration: {
      async authorizeMedia() { calls.push("authorize"); return authority("failed"); },
      async recordMedia() { calls.push("record"); return job(); },
    } as any,
    fetchImage: async () => ({ bytes: new Uint8Array(24), mediaType: "image/png" as const, width: 2, height: 3, byteSize: 24 }),
    upload: {
      async inspectOperation(selected: any) { calls.push(`inspect:${selected.operationId}`); return "deleted" as const; },
      async upload(selected: any) { calls.push(`upload:${selected.operationId}`); return { media: { id: MEDIA, storeId: STORE, productId: PRODUCT, status: "active" }, replayed: false }; },
    } as any,
  });
  assert.deepEqual(calls, ["authorize", `inspect:${derived}`, `upload:${OPERATION}`, "record"]);
});

test("digest mismatch is denied before fetch upload and durable mutation", async () => {
  const calls: string[] = [];
  await assert.rejects(() => ingestMigrationMediaItem(input(), {
    migration: { async authorizeMedia() { calls.push("authorize"); throw Object.assign(new Error("not found"), { code: "media_not_found" }); }, async recordMedia() { calls.push("record"); } } as any,
    fetchImage: async () => { calls.push("fetch"); throw new Error("unused"); }, upload: { async upload() { calls.push("upload"); } } as any,
  }), /catalog_migration_media_unavailable/);
  assert.deepEqual(calls, ["authorize"]);
});

test("one fetch failure records a safe retryable terminal code without automatic retry or upload", async () => {
  const calls: string[] = [];
  await assert.rejects(() => ingestMigrationMediaItem(input(), {
    migration: {
      async authorizeMedia() { calls.push("authorize"); return authority(); },
      async recordMedia(selected: any) { calls.push(`record:${selected.safeFailureCode}`); assert.equal(selected.outcome, "failed"); return { ...job(), status: "completed_with_failures", committedMedia: 0, failedMedia: 1 }; },
    } as any,
    fetchImage: async () => { calls.push("fetch"); throw new Error("remote denied"); },
    upload: { async upload() { calls.push("upload"); } } as any,
  }), /catalog_migration_media_unavailable/);
  assert.deepEqual(calls, ["authorize", "fetch", "record:source_fetch_failed"]);
});

test("an upload failure records one safe terminal code and never retries the R2 saga", async () => {
  const calls: string[] = [];
  await assert.rejects(() => ingestMigrationMediaItem(input(), {
    migration: {
      async authorizeMedia() { calls.push("authorize"); return authority(); },
      async recordMedia(selected: any) { calls.push(`record:${selected.safeFailureCode}`); return job(); },
    } as any,
    fetchImage: async () => { calls.push("fetch"); return { bytes: new Uint8Array(24), mediaType: "image/png" as const, width: 2, height: 3, byteSize: 24 }; },
    upload: { async upload() { calls.push("upload"); throw new Error("storage private detail"); } } as any,
  }), /catalog_migration_media_unavailable/);
  assert.deepEqual(calls, ["authorize", "fetch", "upload", "record:media_upload_failed"]);
});

test("a substituted upload projection is rejected without completing the migration ledger", async () => {
  const calls: string[] = [];
  await assert.rejects(() => ingestMigrationMediaItem(input(), {
    migration: {
      async authorizeMedia() { calls.push("authorize"); return authority(); },
      async recordMedia() { calls.push("record"); throw new Error("unused"); },
    } as any,
    fetchImage: async () => { calls.push("fetch"); return { bytes: new Uint8Array(24), mediaType: "image/png" as const, width: 2, height: 3, byteSize: 24 }; },
    upload: { async upload() { calls.push("upload"); return { media: { id: MEDIA, storeId: "51000000-0000-4000-8000-000000000099", productId: PRODUCT, status: "active" }, replayed: false }; } } as any,
  }), /catalog_migration_media_unavailable/);
  assert.deepEqual(calls, ["authorize", "fetch", "upload"]);
});
