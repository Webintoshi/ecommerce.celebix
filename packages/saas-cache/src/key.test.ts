import assert from "node:assert/strict";
import test from "node:test";

import { buildCacheEntryKey, buildNamespaceKey, hashNormalizedInput } from "./key.ts";

test("normalization makes object property order irrelevant", () => {
  assert.equal(hashNormalizedInput({ b: 2, a: [1, { z: true, y: null }] }), hashNormalizedInput({ a: [1, { y: null, z: true }], b: 2 }));
});

test("keys are tenant and data-class scoped and contain no raw query values", () => {
  const a = buildCacheEntryKey({ namespace: "celebix:staging", storeId: "11111111-1111-4111-8111-111111111111", dataClass: "catalog", schemaVersion: "v1", namespaceToken: "token-a", scope: "product", input: { slug: "secret-slug" } });
  const b = buildCacheEntryKey({ namespace: "celebix:staging", storeId: "22222222-2222-4222-8222-222222222222", dataClass: "catalog", schemaVersion: "v1", namespaceToken: "token-a", scope: "product", input: { slug: "secret-slug" } });
  assert.notEqual(a, b);
  assert.equal(a.includes("secret-slug"), false);
  assert.match(a, /^celebix:staging:store:11111111-1111-4111-8111-111111111111:catalog:v1:token-a:product:[a-f0-9]{64}$/);
  assert.equal(buildNamespaceKey("celebix:staging", "11111111-1111-4111-8111-111111111111", "settings"), "celebix:staging:store:11111111-1111-4111-8111-111111111111:settings:namespace");
});

test("unsupported values cannot be normalized into a key", () => {
  assert.throws(() => hashNormalizedInput({ unsafe: undefined }), /cache_key_input_invalid/);
  assert.throws(() => hashNormalizedInput({ unsafe: Number.NaN }), /cache_key_input_invalid/);
});
