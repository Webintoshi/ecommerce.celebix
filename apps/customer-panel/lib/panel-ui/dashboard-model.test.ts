import assert from "node:assert/strict";
import test from "node:test";
import { readyAuthority, unavailableAuthority } from "./authority-slice.ts";
import type { PanelChromeModel } from "./chrome-model.ts";
import {
  createMerchantDashboardViewModel,
  createPanelDashboardModel,
} from "./dashboard-model.ts";

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
  assert.deepEqual(
    model.cards.map(({ key, value }) => ({ key, value })),
    [
      { key: "store", value: "atlas-store" },
      { key: "membership", value: "Mağaza sahibi" },
      { key: "plan", value: "free_starter · v3" },
      { key: "storefront", value: "atlas-store.celebix.site" },
    ],
  );
});

test("offers every and only working merchant action", () => {
  assert.deepEqual(
    createPanelDashboardModel(chrome).actions.map((action) => action.href),
    [
      "/orders",
      "/orders/quick-links",
      "/orders/abandoned-carts",
      "/customers",
      "/products",
      "/products/new",
      "/discounts",
      "/marketing",
      "/content/blog",
      "/marketplaces",
      "/settings/general",
      "/accounting",
      "/seo",
      "/setup",
    ],
  );
});

test("emits no fake commerce KPI or deferred module", () => {
  assert.doesNotMatch(
    JSON.stringify(createPanelDashboardModel(chrome)),
    /revenue|ciro|conversion|dönüşüm|visitor|analytics|stok toplamı/i,
  );
});

test("uses Özet as the immutable root presentation title", () => {
  const model = createMerchantDashboardViewModel(
    chrome,
    readyAuthority(summary, "2026-07-20T12:00:00.000Z"),
  );
  assert.equal(model.title, "Özet");
  assert.equal(createPanelDashboardModel(chrome).title, "Özet");
  assert.equal(Object.isFrozen(model.actions), true);
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
  assert.deepEqual(
    model.catalogCards.map(({ key, value }) => [key, value]),
    [
      ["products", "4"],
      ["active-products", "3"],
      ["draft-products", "1"],
      ["stock-alerts", "2"],
    ],
  );
  assert.deepEqual(model.catalogReadiness, {
    productsWithoutMedia: 1,
    activeMedia: 7,
    detail: "1 üründe medya eksik · 7 etkin medya",
  });
  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.catalogCards), true);
  assert.equal(Object.isFrozen(model.catalogReadiness), true);
  assert.doesNotMatch(
    JSON.stringify(model),
    /storeId|principal|membershipId|planId|requestId/,
  );
});

test("maps five exact catalog metrics and chart points from durable summary", () => {
  const model = createMerchantDashboardViewModel(
    chrome,
    readyAuthority(summary, "2026-07-20T12:00:00.000Z"),
  );
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
    model.catalog.state === "ready" ? model.catalog.value.chart : [],
    [
      { label: "Toplam ürün", value: 4 },
      { label: "Aktif ürün", value: 3 },
      { label: "Taslak ürün", value: 1 },
      { label: "Stokta olmayan", value: 2 },
      { label: "Etkin medya", value: 7 },
    ],
  );
  assert.doesNotMatch(
    JSON.stringify(model),
    /storeId|tenantId|principal|membershipId|planId|requestId/,
  );
});

test("marks absent commerce domains unsupported without zero KPI", () => {
  const model = createMerchantDashboardViewModel(
    chrome,
    unavailableAuthority(true),
  );
  assert.deepEqual(
    [
      model.orders.state,
      model.analytics.state,
      model.customers.state,
      model.carts.state,
    ],
    ["unsupported", "unsupported", "unsupported", "unsupported"],
  );
  assert.doesNotMatch(
    JSON.stringify(model),
    /revenue|conversion|orderTotal|customerTotal|0 ₺/i,
  );
});

test("keeps dashboard slices deeply frozen", () => {
  const asOf = "2026-07-20T12:00:00.000Z";
  const model = createMerchantDashboardViewModel(
    chrome,
    readyAuthority(summary, asOf),
  );
  assert.equal(Object.isFrozen(model), true);
  assert.equal(model.catalog.state, "ready");
  if (model.catalog.state !== "ready") assert.fail("catalog must be ready");
  assert.equal(model.catalog.asOf, asOf);
  assert.equal(Object.isFrozen(model.catalog), true);
  assert.equal(Object.isFrozen(model.catalog.value), true);
  assert.equal(Object.isFrozen(model.catalog.value.metrics), true);
  assert.equal(model.catalog.value.metrics.every(Object.isFrozen), true);
  assert.equal(Object.isFrozen(model.catalog.value.chart), true);
  assert.equal(model.catalog.value.chart.every(Object.isFrozen), true);
});

test("maps catalog failure to controlled retry state", () => {
  const model = createMerchantDashboardViewModel(
    chrome,
    unavailableAuthority(true),
  );
  assert.deepEqual(model.catalog, { state: "unavailable", retryable: true });
});

test("maps only durable abandoned-cart summary facts without inventing a recovery rate", () => {
  const cartSummary = {
    abandoned: 3,
    recovered: 2,
    lostValueCents: 15_000,
    recoveredValueCents: 8_000,
    currency: "TRY",
    asOf: "2026-07-22T16:00:00.000Z",
  };
  const model = createMerchantDashboardViewModel(
    chrome,
    unavailableAuthority(true),
    undefined,
    readyAuthority(cartSummary, cartSummary.asOf),
  );
  assert.deepEqual(model.carts, {
    state: "ready",
    value: cartSummary,
    asOf: cartSummary.asOf,
  });
  assert.doesNotMatch(JSON.stringify(model.carts), /rate|oran|conversion/i);
  assert.equal(Object.isFrozen(model.carts), true);
  assert.equal(
    model.carts.state === "ready" && Object.isFrozen(model.carts.value),
    true,
  );
});

test("maps only persisted customer totals and consent activity", () => {
  const customerSummary = Object.freeze({
    active: 12,
    archived: 3,
    consentedEmail: 8,
    totalSpentCents: 125_500,
    currency: "TRY",
    asOf: "2026-07-22T16:30:00.000Z",
  });
  const model = createMerchantDashboardViewModel(
    chrome,
    unavailableAuthority(true),
    undefined,
    undefined,
    readyAuthority(customerSummary, customerSummary.asOf),
  );
  assert.deepEqual(model.customers, {
    state: "ready",
    value: customerSummary,
    asOf: customerSummary.asOf,
  });
  assert.doesNotMatch(
    JSON.stringify(model.customers),
    /conversion|growth|lifetime|tahmin|oran/i,
  );
  assert.equal(Object.isFrozen(model.customers), true);
  assert.equal(
    model.customers.state === "ready" && Object.isFrozen(model.customers.value),
    true,
  );
});
