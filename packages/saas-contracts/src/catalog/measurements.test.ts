import assert from "node:assert/strict";
import test from "node:test";
import { parseProductMeasurements, parseProductVariant } from "./index.ts";

test("measurements retain independently chosen dimensions and exact milli values", () => {
  const input = { weight: { valueMilli: 14890, unit: "g" }, width: { valueMilli: 125, unit: "m" }, area: { valueMilli: 25125, unit: "m2" }, packageCount: 12 };
  const parsed = parseProductMeasurements(input);
  assert.deepEqual(parsed, input);
  assert.ok(Object.isFrozen(parsed) && Object.isFrozen(parsed.weight));
  assert.deepEqual(parseProductMeasurements({ height: { valueMilli: 1, unit: "cm" } }), { height: { valueMilli: 1, unit: "cm" } });
});

test("measurement validation rejects unknown, incompatible and lossy values", () => {
  for (const input of [null, {}, [], { grams: 14.89 }, { weight: { valueMilli: 14890, unit: "ml" } }, { weight: { valueMilli: 0, unit: "g" } }, { weight: { valueMilli: 1.5, unit: "g" } }, { weight: { valueMilli: Number.MAX_SAFE_INTEGER + 1, unit: "g" } }, { weight: { valueMilli: 1, unit: "g", display: "x" } }, { packageCount: 0 }, { packageCount: 1.5 }]) assert.throws(() => parseProductMeasurements(input));
});

const variant = { id: "11111111-1111-4111-8111-111111111111", productId: "22222222-2222-4222-8222-222222222222", storeId: "33333333-3333-4333-8333-333333333333", title: "Standart", priceCents: 100, stockTracking: true, stockQuantity: 3, status: "active", attributes: {}, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", version: 1 };
test("legacy variants remain valid and optional metadata survives the product read contract", () => {
 assert.equal(parseProductVariant(variant).measurements, undefined);
 assert.deepEqual(parseProductVariant({ ...variant, measurements: { weight: { valueMilli: 14890, unit: "g" } } }).measurements, { weight: { valueMilli: 14890, unit: "g" } });
});
