import assert from "node:assert/strict";
import test from "node:test";
import { PostgresStorefrontAssetRepository, StorefrontAssetRepositoryError } from "./index.ts";
import type { PostgresPoolLike } from "../postgres/pool.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const ASSET = "20000000-0000-4000-8000-000000000001";
const OPERATION = "30000000-0000-4000-8000-000000000001";
const CONTENT_DIGEST = "a".repeat(64);
const NOW = new Date("2026-07-30T12:00:00.000Z");
const asset = Object.freeze({ id: ASSET, storeId: STORE, kind: "hero", objectKey: `stores/${STORE}/storefront/hero/${ASSET}.webp`, publicUrl: `https://media.saas-staging.celebix.site/stores/${STORE}/storefront/hero/${ASSET}.webp`, mediaType: "image/webp", altText: "Hero", width: 1600, height: 900, byteSize: 2048, status: "active", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), version: 1 });
const tenantContext = { schemaVersion: 1, requestId: OPERATION, principal: { id: "40000000-0000-4000-8000-000000000001", issuer: "https://identity.example.test/oidc", subject: "merchant" }, store: { id: STORE, slug: "merchant", status: "active" }, membership: { id: "50000000-0000-4000-8000-000000000001", role: "store_owner", status: "active" }, entitlements: { schemaVersion: 1, planId: "00000000-0000-4000-8000-000000000001", planCode: "free_starter", version: 1, status: "active", features: ["catalog", "media"], limits: { products: 100, staff: 1, storageBytes: 1_000_000_000 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR" } as const;
const timeouts = Object.freeze({ poolCheckoutMs: 100, statementMs: 100, lockMs: 100, idleTransactionMs: 100 });

function repository(outcome = "committed", payload: unknown = { asset }) {
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  const client = { async query(text: string, values?: unknown[]) { queries.push({ text, values }); return text.startsWith("SELECT outcome") ? { rows: [{ outcome, result_payload: payload }], rowCount: 1 } : { rows: [], rowCount: 0 }; }, release() {} };
  return { queries, value: new PostgresStorefrontAssetRepository({ pool: { async connect() { return client; } } as unknown as PostgresPoolLike, role: "celebix_saas_app", publicMediaOrigin: "https://media.saas-staging.celebix.site", timeouts, audit() {} }) };
}

test("storefront asset repository binds the exact server-owned store key", async () => {
  const selected = repository();
  const result = await selected.value.createAsset({ tenantContext, now: NOW, operationId: OPERATION, assetId: ASSET, kind: "hero", objectKey: asset.objectKey, publicUrl: asset.publicUrl, mediaType: "image/webp", altText: "Hero", width: 1600, height: 900, byteSize: 2048, contentDigest: CONTENT_DIGEST });
  assert.equal(result.asset.storeId, STORE);
  assert.equal(selected.queries.some(({ text }) => text === "SET LOCAL ROLE celebix_saas_app"), true);
  assert.match(selected.queries.find(({ text }) => text.includes("storefront_asset_create"))?.text ?? "", /\$19::bigint/);
});

test("storefront asset repository rejects cross-store and cross-kind keys before PostgreSQL", async () => {
  let connects = 0;
  const value = new PostgresStorefrontAssetRepository({ pool: { async connect() { connects += 1; throw new Error(); } } as PostgresPoolLike, role: "celebix_saas_app", publicMediaOrigin: "https://media.saas-staging.celebix.site", timeouts, audit() {} });
  await assert.rejects(value.createAsset({ tenantContext, now: NOW, operationId: OPERATION, assetId: ASSET, kind: "hero", objectKey: asset.objectKey.replace("/hero/", "/logo/"), publicUrl: asset.publicUrl, mediaType: "image/webp", altText: "Hero", width: 1600, height: 900, byteSize: 2048, contentDigest: CONTENT_DIGEST }), /invalid_input/);
  await assert.rejects(value.createAsset({ tenantContext, now: NOW, operationId: OPERATION, assetId: ASSET, kind: "hero", objectKey: asset.objectKey, publicUrl: `https://attacker.example/${asset.objectKey}`, mediaType: "image/webp", altText: "Hero", width: 1600, height: 900, byteSize: 2048, contentDigest: CONTENT_DIGEST }), /invalid_input/);
  assert.equal(connects, 0);
});

test("storefront asset repository exposes commit unknown and supports one read-only recovery", async () => {
  let releases: unknown[] = [];
  const client = { async query(text: string) { if (text === "COMMIT") throw new Error("socket lost"); return text.startsWith("SELECT outcome") ? { rows: [{ outcome: "committed", result_payload: { asset } }], rowCount: 1 } : { rows: [], rowCount: 0 }; }, release(value?: unknown) { releases.push(value); } };
  const value = new PostgresStorefrontAssetRepository({ pool: { async connect() { return client; } } as unknown as PostgresPoolLike, role: "celebix_saas_app", publicMediaOrigin: "https://media.saas-staging.celebix.site", timeouts, audit() {} });
  await assert.rejects(value.createAsset({ tenantContext, now: NOW, operationId: OPERATION, assetId: ASSET, kind: "hero", objectKey: asset.objectKey, publicUrl: asset.publicUrl, mediaType: "image/webp", altText: "Hero", width: 1600, height: 900, byteSize: 2048, contentDigest: CONTENT_DIGEST }), (error: unknown) => error instanceof StorefrontAssetRepositoryError && error.code === "commit_unknown");
  assert.deepEqual(releases, [true]);
});
