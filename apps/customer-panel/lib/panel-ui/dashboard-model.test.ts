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
const summary = Object.freeze({
  totalProducts: 4,
  activeProducts: 3,
  draftProducts: 1,
  productLimit: 10,
  activeVariants: 6,
  outOfStockVariants: 2,
  productsWithoutMedia: 1,
  activeMedia: 7,
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

test("dashboard omits catalog metrics until real summary exists", () => {
  const model = createPanelDashboardModel(chrome);
  assert.deepEqual(model.catalogCards, []);
  assert.equal(model.catalogReadiness, undefined);
  assert.doesNotMatch(JSON.stringify(model), /0 ürün|0 sipariş|0 ₺/);
});

test("dashboard maps exact catalog summary without private authority", () => {
  const model = createPanelDashboardModel(chrome, summary);
  assert.deepEqual(model.catalogCards.map(({ key, value }) => [key, value]), [
    ["products", "4"],
    ["active-products", "3"],
    ["draft-products", "1"],
    ["stock-alerts", "2"],
  ]);
  assert.deepEqual(model.catalogReadiness, {
    productsWithoutMedia: 1,
    activeMedia: 7,
    detail: "1 üründe medya eksik · 7 etkin medya",
  });
  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.catalogCards), true);
  assert.equal(Object.isFrozen(model.catalogReadiness), true);
  assert.doesNotMatch(JSON.stringify(model), /storeId|principal|membershipId|planId|requestId/);
});
