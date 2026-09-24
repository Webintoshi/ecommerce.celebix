import assert from "node:assert/strict";
import test from "node:test";
import { composeManualSku, manualSkuDisplay } from "./sku-prefix.ts";

test("an optional store prefix composes only nonempty suffixes", () => {
  assert.equal(composeManualSku("001", "RSA"), "RSA-001");
  assert.equal(composeManualSku("", "RSA"), "");
  assert.equal(composeManualSku("RSA-001", undefined), "RSA-001");
  assert.equal(manualSkuDisplay("RSA-001", "RSA").suffix, "001");
  assert.equal(manualSkuDisplay("OLD-001", "RSA").legacy, true);
});

test("invalid suffixes cannot produce a malformed or oversized full SKU", () => {
  for (const suffix of ["with space", "-", "a".repeat(61)]) {
    assert.throws(() => composeManualSku(suffix, "RSA"), /invalid_sku/);
  }
});
