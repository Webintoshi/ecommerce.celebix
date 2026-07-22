import assert from "node:assert/strict";
import test from "node:test";
import { MERCHANT_ADMIN_RECORD_KINDS, parseMerchantAdminMutationResult, parseMerchantAdminRecord } from "./index.ts";
const ID = "11111111-1111-4111-8111-111111111111", NOW = "2026-07-22T19:00:00.000Z";
test("parses exact durable merchant module records", () => { const value = parseMerchantAdminRecord({ id: ID, kind: "discount", name: "Yaz indirimi", config: { discountType: "percent", value: 15 }, status: "active", version: 1, createdAt: NOW, updatedAt: NOW }); assert.equal(Object.isFrozen(value.config), true); assert.equal(MERCHANT_ADMIN_RECORD_KINDS.length, 21); for (const hostile of [{ ...value, storeId: ID }, { ...value, config: { apiKey: "private" } }, { ...value, status: "deleted" }]) assert.throws(() => parseMerchantAdminRecord(hostile)); });
test("mutation projections remain exact and replay-aware", () => { const result = parseMerchantAdminMutationResult({ id: ID, kind: "policy", status: "draft", version: 2, updatedAt: NOW, replayed: false }); assert.equal(result.kind, "policy"); assert.throws(() => parseMerchantAdminMutationResult({ ...result, operationId: ID })); });
