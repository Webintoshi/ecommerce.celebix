import assert from "node:assert/strict";
import test from "node:test";
import type { PanelChromeModel } from "./chrome-model.ts";
import { createPanelDashboardModel } from "./dashboard-model.ts";

const chrome: PanelChromeModel = Object.freeze({
  storeSlug: "atlas-store",
  membershipLabel: "Mağaza sahibi",
  planCode: "free_starter",
  planVersion: 3,
  entitlementStatus: "active",
  storefrontHostname: "atlas-store.celebix.site",
  locale: "tr-TR",
});

test("projects exact store, membership, plan, and storefront facts", () => {
  const model = createPanelDashboardModel(chrome);
  assert.deepEqual(model.cards.map(({ key, value }) => ({ key, value })), [
    { key: "store", value: "atlas-store" },
    { key: "membership", value: "Mağaza sahibi" },
    { key: "plan", value: "free_starter · v3" },
    { key: "storefront", value: "atlas-store.celebix.site" },
  ]);
});

test("offers only working product and setup actions", () => {
  assert.deepEqual(createPanelDashboardModel(chrome).actions.map((action) => action.href), [
    "/products",
    "/products/new",
    "/setup",
  ]);
});

test("emits no fake commerce KPI or deferred module", () => {
  assert.doesNotMatch(
    JSON.stringify(createPanelDashboardModel(chrome)),
    /revenue|ciro|order|sipariş|conversion|dönüşüm|visitor|sepet|customer|analytics|stok toplamı/i,
  );
});

test("deep-freezes cards, actions, and the root", () => {
  const model = createPanelDashboardModel(chrome);
  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.cards), true);
  assert.equal(model.cards.every(Object.isFrozen), true);
  assert.equal(Object.isFrozen(model.actions), true);
  assert.equal(model.actions.every(Object.isFrozen), true);
});
