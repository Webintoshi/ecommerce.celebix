import assert from "node:assert/strict";
import test from "node:test";
import { createWooCommerceMigrationApi, WooCommerceMigrationApiError } from "./client.ts";

const JOB = "58000000-0000-4000-8000-000000000001";
const OPERATION = "58000000-0000-4000-8000-000000000002";
const PRODUCT = "58000000-0000-4000-8000-000000000003";
const MEDIA = "58000000-0000-4000-8000-000000000004";
const DIGEST = "a".repeat(64);
const NOW = "2026-07-28T12:00:00.000Z";
function job(overrides: Record<string, unknown> = {}) { return { jobId: JOB, sourceDigest: DIGEST, status: "processing", totalProducts: 1, importedProducts: 0, totalMedia: 1, committedMedia: 0, failedMedia: 0, categoryCount: 0, brandCount: 0, version: 1, updatedAt: NOW, replayed: false, ...overrides }; }

test("client sends only same-origin JSON authority and parses exact durable progress", async () => {
  const calls: Array<readonly [string, RequestInit | undefined]> = [];
  const api = createWooCommerceMigrationApi(async (path, init) => { calls.push([String(path), init]); return Response.json(job()); });
  const result = await api.begin({ sourceDigest: DIGEST, totalProducts: 1, totalMedia: 1, categories: [], brands: [] }, OPERATION);
  assert.equal(result.jobId, JOB); assert.equal(Object.isFrozen(result), true);
  assert.equal(calls[0]?.[0], "/api/catalog/admin/migrations/woocommerce");
  assert.equal(new Headers(calls[0]?.[1]?.headers).get("idempotency-key"), OPERATION);
  assert.equal(JSON.stringify(calls).includes("storeId"), false);
});

test("media response rejects extra raw URL authority and public errors remain finite", async () => {
  const hostile = createWooCommerceMigrationApi(async () => Response.json({ kind: "committed", productId: PRODUCT, mediaId: MEDIA, replayed: false, sourceUrl: "https://private.test/a.png" }));
  await assert.rejects(() => hostile.media(JOB, { sourceProductId: "30794", ordinal: 0, sourceUrl: "https://media.test/a.png", altText: "Yüzük" }, OPERATION), (error: unknown) => error instanceof WooCommerceMigrationApiError && error.code === "unavailable");
  const denied = createWooCommerceMigrationApi(async () => Response.json({ code: "membership_denied" }, { status: 403 }));
  await assert.rejects(() => denied.status(JOB), (error: unknown) => error instanceof WooCommerceMigrationApiError && error.code === "membership_denied" && !error.message.includes("private"));
});
