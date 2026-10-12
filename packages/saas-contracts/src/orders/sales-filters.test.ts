import assert from "node:assert/strict";
import test from "node:test";
import * as contracts from "./index.ts";

test("order sales filters accept bounded channels and social platforms without changing the all-orders default", () => {
  assert.equal(typeof contracts.parseOrderSalesFilters, "function");
  assert.deepEqual(contracts.parseOrderSalesFilters({}), {});
  for (const salesChannel of ["manual", "social", "storefront", "quick_link", "marketplace", "manual_import"]) {
    assert.deepEqual(contracts.parseOrderSalesFilters({ salesChannel }), { salesChannel });
  }
  for (const socialPlatform of ["instagram", "facebook", "x", "pinterest", "tiktok", "whatsapp", "other"]) {
    assert.deepEqual(contracts.parseOrderSalesFilters({ salesChannel: "social", socialPlatform }), { salesChannel: "social", socialPlatform });
  }
  for (const value of [{ salesChannel: "all" }, { salesChannel: "in_store" }, { salesChannel: " social" }, { socialPlatform: "instagram" }, { salesChannel: "manual", socialPlatform: "instagram" }, { salesChannel: "social", socialPlatform: "unknown" }, { salesChannel: null }, { salesChannel: "social", storeId: "injected" }]) {
    assert.throws(() => contracts.parseOrderSalesFilters(value), { name: "TypeError", message: "order_contract_invalid" });
  }
});
