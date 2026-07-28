import assert from "node:assert/strict";
import test from "node:test";
import { PostgresProductMediaRepository } from "./index.ts";
import type { PostgresPoolLike } from "../postgres/pool.ts";

const STORE_ID = "10000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "20000000-0000-4000-8000-000000000001";
const MEDIA_ID = "40000000-0000-4000-8000-000000000001";
const OPERATION_ID = "50000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-18T10:00:00.000Z");
const media = { id: MEDIA_ID, storeId: STORE_ID, productId: PRODUCT_ID, objectKey: `stores/${STORE_ID}/products/${PRODUCT_ID}/${MEDIA_ID}.webp`, publicUrl: `https://media.saas-staging.celebix.site/stores/${STORE_ID}/products/${PRODUCT_ID}/${MEDIA_ID}.webp`, mediaType: "image/webp", altText: "Pilot", width: 1200, height: 1200, byteSize: 2048, sortOrder: 0, status: "active", createdAt: now.toISOString(), updatedAt: now.toISOString(), version: 1 };
const tenantContext = { schemaVersion: 1, requestId: OPERATION_ID, principal: { id: "60000000-0000-4000-8000-000000000001", issuer: "https://identity.example.test/oidc", subject: "pilot" }, store: { id: STORE_ID, slug: "pilot-store", status: "active" }, membership: { id: "70000000-0000-4000-8000-000000000001", role: "store_owner", status: "active" }, entitlements: { schemaVersion: 1, planId: "00000000-0000-4000-8000-000000000001", planCode: "free_starter", version: 1, status: "active", features: ["catalog", "media"], limits: { products: 100, staff: 1, storageBytes: 1_000_000_000 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR" } as const;

test("media repository uses TenantContext and tenant-namespaced object key", async () => {
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  const client = { async query(text: string, values?: unknown[]) { queries.push({ text, values }); return text.startsWith("SELECT outcome") ? { rows: [{ outcome: "committed", result_payload: { media } }], rowCount: 1 } : { rows: [], rowCount: 0 }; }, release() {} };
  const pool = { async connect() { return client; } } as unknown as PostgresPoolLike;
  const repository = new PostgresProductMediaRepository({ pool, role: "celebix_saas_app", timeouts: { poolCheckoutMs: 100, statementMs: 100, lockMs: 100, idleTransactionMs: 100 }, audit() {} });
  const result = await repository.attachMedia({ tenantContext, now, operationId: OPERATION_ID, mediaId: MEDIA_ID, productId: PRODUCT_ID, objectKey: media.objectKey, publicUrl: media.publicUrl, mediaType: "image/webp", altText: "Pilot", width: 1200, height: 1200, byteSize: 2048 });
  assert.equal(result.media.storeId, STORE_ID);
  assert.equal(queries.some((query) => query.text === "SET LOCAL ROLE celebix_saas_app"), true);
  const attach = queries.find((query) => query.text.includes("media_attach_product"));
  assert.equal(attach?.text, "SELECT outcome,result_payload FROM saas.media_attach_product($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::text,$11::uuid,$12::uuid,$13::uuid,$14::text,$15::text,$16::text,$17::text,$18::integer,$19::integer,$20::bigint)");
  assert.equal(attach?.values?.length, 20);
  assert.equal(attach?.values?.[13], media.objectKey);
});

test("media repository rejects a browser-selected non-namespaced object key before PostgreSQL", async () => {
  let connects = 0;
  const pool = { async connect() { connects += 1; throw new Error("unexpected"); } } as PostgresPoolLike;
  const repository = new PostgresProductMediaRepository({ pool, role: "celebix_saas_app", timeouts: { poolCheckoutMs: 100, statementMs: 100, lockMs: 100, idleTransactionMs: 100 }, audit() {} });
  await assert.rejects(repository.attachMedia({ tenantContext, now, operationId: OPERATION_ID, mediaId: MEDIA_ID, productId: PRODUCT_ID, objectKey: `products/${PRODUCT_ID}/${MEDIA_ID}.webp`, publicUrl: media.publicUrl, mediaType: "image/webp", altText: "Pilot", width: 1200, height: 1200, byteSize: 2048 }));
  assert.equal(connects, 0);
});
