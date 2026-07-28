import assert from "node:assert/strict";
import test from "node:test";
import { PostgresProductMediaRepository } from "./index.ts";
import type { PostgresPoolLike } from "../postgres/pool.ts";

const STORE_ID = "10000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "20000000-0000-4000-8000-000000000001";
const MEDIA_ID = "40000000-0000-4000-8000-000000000001";
const OPERATION_ID = "50000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-18T10:00:00.000Z");
const media = { id: MEDIA_ID, storeId: STORE_ID, productId: PRODUCT_ID, objectKey: `stores/${STORE_ID}/products/${PRODUCT_ID}/${MEDIA_ID}.webp`, publicUrl: `https://media.saas-staging.celebix.site/stores/${STORE_ID}/products/${PRODUCT_ID}/${MEDIA_ID}.webp`, mediaType: "image/webp", altText: "Pilot", width: 1200, height: 1200, byteSize: 2048, sortOrder: 0, status: "archived", createdAt: now.toISOString(), updatedAt: now.toISOString(), archivedAt: now.toISOString(), version: 2 } as const;
const tenantContext = { schemaVersion: 1, requestId: OPERATION_ID, principal: { id: "60000000-0000-4000-8000-000000000001", issuer: "https://identity.example.test/oidc", subject: "pilot" }, store: { id: STORE_ID, slug: "pilot-store", status: "active" }, membership: { id: "70000000-0000-4000-8000-000000000001", role: "store_owner", status: "active" }, entitlements: { schemaVersion: 1, planId: "00000000-0000-4000-8000-000000000001", planCode: "free_starter", version: 1, status: "active", features: ["catalog", "media"], limits: { products: 100, staff: 1, storageBytes: 1_000_000_000 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR" } as const;

test("media reservation derives exact object authority and returns a frozen safe projection", async () => {
  const reservation = {
    operationId: OPERATION_ID,
    mediaId: MEDIA_ID,
    productId: PRODUCT_ID,
    objectKey: `stores/${STORE_ID}/products/${PRODUCT_ID}/${MEDIA_ID}.webp`,
    publicUrl: `https://media.saas-staging.celebix.site/stores/${STORE_ID}/products/${PRODUCT_ID}/${MEDIA_ID}.webp`,
    mediaType: "image/webp",
    byteSize: 2048,
    payloadSha256: "a".repeat(64),
    state: "reserved",
    version: 1,
  } as const;
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  const client = { async query(text: string, values?: unknown[]) { queries.push({ text, values }); return text.startsWith("SELECT outcome") ? { rows: [{ outcome: "reserved", result_payload: reservation }], rowCount: 1 } : { rows: [], rowCount: 0 }; }, release() {} };
  const pool = { async connect() { return client; } } as unknown as PostgresPoolLike;
  const repository = new PostgresProductMediaRepository({ pool, role: "celebix_saas_app", mediaOrigin: "https://media.saas-staging.celebix.site", timeouts: { poolCheckoutMs: 100, statementMs: 100, lockMs: 100, idleTransactionMs: 100 }, audit() {} });

  const result = await repository.reserveProductMedia({
    tenantContext,
    now,
    operationId: OPERATION_ID,
    mediaId: MEDIA_ID,
    productId: PRODUCT_ID,
    mediaType: "image/webp",
    altText: "Pilot",
    width: 1200,
    height: 1200,
    byteSize: 2048,
    payloadSha256: "a".repeat(64),
  });

  assert.deepEqual(result, reservation);
  assert.equal(Object.isFrozen(result), true);
  const reserve = queries.find((query) => query.text.includes("media_reserve_product"));
  assert.ok(reserve);
  assert.equal(reserve.values?.includes(reservation.objectKey), true);
  assert.equal(reserve.values?.includes(reservation.publicUrl), true);
  assert.equal(reserve.values?.includes("private"), false);
});

test("media reservation rejects a projection that changes operation or configured public origin authority", async () => {
  const expected = {
    operationId: OPERATION_ID,
    mediaId: MEDIA_ID,
    productId: PRODUCT_ID,
    objectKey: `stores/${STORE_ID}/products/${PRODUCT_ID}/${MEDIA_ID}.webp`,
    publicUrl: `https://media.saas-staging.celebix.site/stores/${STORE_ID}/products/${PRODUCT_ID}/${MEDIA_ID}.webp`,
    mediaType: "image/webp",
    byteSize: 2048,
    payloadSha256: "a".repeat(64),
    state: "reserved",
    version: 1,
  } as const;
  for (const projection of [
    { ...expected, operationId: "50000000-0000-4000-8000-000000000099" },
    { ...expected, publicUrl: `https://attacker.example/stores/${STORE_ID}/products/${PRODUCT_ID}/${MEDIA_ID}.webp` },
  ]) {
    const client = { async query(text: string) { return text.startsWith("SELECT outcome") ? { rows: [{ outcome: "reserved", result_payload: projection }], rowCount: 1 } : { rows: [], rowCount: 0 }; }, release() {} };
    const pool = { async connect() { return client; } } as unknown as PostgresPoolLike;
    const repository = new PostgresProductMediaRepository({ pool, role: "celebix_saas_app", mediaOrigin: "https://media.saas-staging.celebix.site", timeouts: { poolCheckoutMs: 100, statementMs: 100, lockMs: 100, idleTransactionMs: 100 }, audit() {} });
    await assert.rejects(repository.reserveProductMedia({
      tenantContext,
      now,
      operationId: OPERATION_ID,
      mediaId: MEDIA_ID,
      productId: PRODUCT_ID,
      mediaType: "image/webp",
      altText: "Pilot",
      width: 1200,
      height: 1200,
      byteSize: 2048,
      payloadSha256: "a".repeat(64),
    }));
  }
});

test("media reservation recovery is read-only and unknown commit is never retried", async () => {
  let connects = 0;
  const calls: string[] = [];
  const client = {
    async query(text: string) {
      calls.push(text);
      if (text === "COMMIT") throw new Error("connection lost");
      return text.startsWith("SELECT outcome")
        ? { rows: [{ outcome: "reserved", result_payload: null }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    },
    release() {},
  };
  const pool = { async connect() { connects += 1; return client; } } as unknown as PostgresPoolLike;
  const repository = new PostgresProductMediaRepository({ pool, role: "celebix_saas_app", mediaOrigin: "https://media.saas-staging.celebix.site", timeouts: { poolCheckoutMs: 100, statementMs: 100, lockMs: 100, idleTransactionMs: 100 }, audit() {} });

  await assert.rejects(repository.reserveProductMedia({
    tenantContext,
    now,
    operationId: OPERATION_ID,
    mediaId: MEDIA_ID,
    productId: PRODUCT_ID,
    mediaType: "image/webp",
    altText: "Pilot",
    width: 1200,
    height: 1200,
    byteSize: 2048,
    payloadSha256: "a".repeat(64),
  }));
  assert.equal(connects, 1);
  assert.equal(calls.filter((call) => call.includes("media_reserve_product")).length, 1);
  assert.equal(calls.includes("ROLLBACK"), false);
});

test("archive saga reserves pending authority finalizes once and recovers read-only", async () => {
  const pending = { ...media, status: "pending", archivedAt: undefined, version: 2 } as any;
  delete pending.archivedAt;
  const calls: string[] = [];
  const client = {
    async query(text: string) {
      calls.push(text);
      if (text.includes("media_reserve_product_archive")) return { rows: [{ outcome: "reserved", result_payload: { media: pending } }], rowCount: 1 };
      if (text.includes("media_finalize_product_archive")) return { rows: [{ outcome: "committed", result_payload: { media } }], rowCount: 1 };
      if (text.includes("media_recover_product_archive")) return { rows: [{ outcome: "found", result_payload: { media } }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  const pool = { async connect() { return client; } } as unknown as PostgresPoolLike;
  const repository = new PostgresProductMediaRepository({ pool, role: "celebix_saas_app", mediaOrigin: "https://media.saas-staging.celebix.site", timeouts: { poolCheckoutMs: 100, statementMs: 100, lockMs: 100, idleTransactionMs: 100 }, audit() {} });
  const input = { tenantContext, now, operationId: OPERATION_ID, productId: PRODUCT_ID, mediaId: MEDIA_ID, expectedVersion: 1 };
  assert.equal((await repository.reserveArchiveMedia(input)).media.status, "pending");
  assert.equal((await repository.finalizeArchiveMedia(input)).media.status, "archived");
  assert.equal((await repository.recoverArchiveMedia(input)).replayed, true);
  assert.equal(calls.filter((call) => call.includes("media_reserve_product_archive")).length, 1);
  assert.equal(calls.filter((call) => call.includes("media_finalize_product_archive")).length, 1);
  const recoveryIndex = calls.findIndex((call) => call.includes("media_recover_product_archive"));
  assert.equal(calls.slice(0, recoveryIndex).filter((call) => call === "BEGIN READ ONLY").length, 1);
});

test("archived R2 deletion proof is bound to the exact durable media object and archive operation", async () => {
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  const client = { async query(text: string, values?: unknown[]) { queries.push({ text, values }); return text.startsWith("SELECT outcome") ? { rows: [{ outcome: "deleted", result_payload: { media } }], rowCount: 1 } : { rows: [], rowCount: 0 }; }, release() {} };
  const pool = { async connect() { return client; } } as unknown as PostgresPoolLike;
  const repository = new PostgresProductMediaRepository({ pool, role: "celebix_saas_app", mediaOrigin: "https://media.saas-staging.celebix.site", timeouts: { poolCheckoutMs: 100, statementMs: 100, lockMs: 100, idleTransactionMs: 100 }, audit() {} });
  const result = await repository.markArchivedProductMediaObjectDeleted({ tenantContext, now, operationId: OPERATION_ID, productId: PRODUCT_ID, mediaId: MEDIA_ID, objectKey: media.objectKey });
  assert.equal(result.media.status, "archived");
  const selected = queries.find((query) => query.text.includes("media_mark_archived_object_deleted"));
  assert.ok(selected);
  assert.deepEqual(selected.values?.slice(-4), [OPERATION_ID, MEDIA_ID, PRODUCT_ID, media.objectKey]);
  await assert.rejects(repository.markArchivedProductMediaObjectDeleted({ tenantContext, now, operationId: OPERATION_ID, productId: PRODUCT_ID, mediaId: MEDIA_ID, objectKey: `stores/${STORE_ID}/products/${PRODUCT_ID}/30000000-0000-4000-8000-000000000099.webp` }));
});
