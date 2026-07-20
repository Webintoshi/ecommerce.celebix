import assert from "node:assert/strict";
import test from "node:test";

import { createCatalogApiClient } from "../../../apps/customer-panel/lib/catalog-ui/client.ts";
import { createPanelDashboardModel } from "../../../apps/customer-panel/lib/panel-ui/dashboard-model.ts";

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

  const model = createPanelDashboardModel(CHROME, summary);
  assert.equal(calls, 1);
  assert.deepEqual(model.catalogCards.map((card) => card.value), ["4", "3", "1", "2"]);
  assert.equal(model.actions.some((action) => action.href === "/products/new"), true);
  assert.doesNotMatch(JSON.stringify(model), /order|sipariş|revenue|ciro|customer|müşteri/i);
});
