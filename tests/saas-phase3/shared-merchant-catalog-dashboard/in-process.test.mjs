import assert from "node:assert/strict";
import test from "node:test";

import { createCatalogApiClient } from "../../../apps/customer-panel/lib/catalog-ui/client.ts";
import { readyAuthority } from "../../../apps/customer-panel/lib/panel-ui/authority-slice.ts";
import { createMerchantDashboardViewModel } from "../../../apps/customer-panel/lib/panel-ui/dashboard-model.ts";

const SUMMARY = Object.freeze({
  totalProducts: 4,
  activeProducts: 3,
  draftProducts: 1,
  productLimit: 10,
  activeVariants: 6,
  outOfStockVariants: 2,
  productsWithoutMedia: 1,
  activeMedia: 7,
});

const CHROME = Object.freeze({
  storeSlug: "pilot-store",
  membershipLabel: "Mağaza sahibi",
  planCode: "free_starter",
  planVersion: 1,
  entitlementStatus: "active",
  storefrontHostname: "pilot-store.celebix.site",
  locale: "tr-TR",
});

test("authenticated summary projects truthful dashboard values without unsupported commerce metrics", async () => {
  let calls = 0;
  const summary = await createCatalogApiClient({
    fetch: async (input, init) => {
      calls += 1;
      assert.equal(input, "/api/catalog/summary");
      assert.deepEqual(init, { method: "GET", credentials: "same-origin", cache: "no-store" });
      return Response.json(SUMMARY);
    },
  }).getDashboardSummary();

  const model = createMerchantDashboardViewModel(
    CHROME,
    readyAuthority(summary, "2026-07-20T12:00:00.000Z"),
  );
  assert.equal(calls, 1);
  assert.deepEqual(
    model.catalog.state === "ready"
      ? model.catalog.value.metrics.map(({ key, value }) => [key, value])
      : [],
    [
      ["products", 4],
      ["active-products", 3],
      ["draft-products", 1],
      ["out-of-stock", 2],
      ["active-media", 7],
    ],
  );
  assert.deepEqual(
    [model.orders.state, model.analytics.state, model.customers.state, model.carts.state],
    ["unsupported", "unsupported", "unsupported", "unsupported"],
  );
  assert.equal(model.actions.some((action) => action.href === "/products/new"), true);
  assert.doesNotMatch(
    JSON.stringify(model),
    /orderTotal|sipariş toplamı|revenue|ciro|customerTotal|müşteri toplamı|conversion|trend/i,
  );
  assert.doesNotMatch(JSON.stringify(model), /storeId|tenantId|principal|membershipId|planId|requestId/);
});
