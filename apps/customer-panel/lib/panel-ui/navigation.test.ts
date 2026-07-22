import assert from "node:assert/strict";
import test from "node:test";
import {
  PANEL_NAVIGATION,
  PANEL_ROUTE_PRESENTATIONS,
  getPanelRoutePresentation,
  getPanelNavigationState,
  isPanelNavigationPathActive,
} from "./navigation.ts";

test("contains every and only currently working merchant destination", () => {
  const hrefs = PANEL_NAVIGATION.flatMap((item) => [
    item.href,
    ...(item.children ?? []).map((child) => child.href),
  ]);
  assert.deepEqual(
    [...new Set(hrefs)],
    [
      "/",
      "/orders",
      "/orders/quick-links",
      "/orders/abandoned-carts",
      "/customers",
      "/customers/segments",
      "/customers/tags",
      "/customers/new",
      "/products",
      "/products/new",
      "/setup",
    ],
  );
  assert.deepEqual(
    PANEL_NAVIGATION.map(({ label }) => label),
    ["Özet", "Siparişler", "Müşteriler", "Ürünler", "Kurulum"],
  );
});

test("keeps the catalog parent active on exact descendants", () => {
  assert.equal(isPanelNavigationPathActive("/products", "/products"), true);
  assert.equal(isPanelNavigationPathActive("/products/new", "/products"), true);
  assert.equal(
    isPanelNavigationPathActive("/products/uuid", "/products"),
    true,
  );
});

test("rejects near-match and alternate path spellings", () => {
  for (const path of [
    "/products-evil",
    "/product",
    "//products",
    "/Products",
  ]) {
    assert.equal(isPanelNavigationPathActive(path, "/products"), false);
  }
});

test("navigation never activates a query fragment or encoded near match", () => {
  for (const pathname of [
    "/products?next=/products",
    "/products#x",
    "/products%2Fevil",
    "/products//evil",
  ]) {
    assert.equal(isPanelNavigationPathActive(pathname, "/products"), false);
  }
});

test("navigation exposes no disabled donor destination", () => {
  const hrefs = JSON.stringify(PANEL_NAVIGATION);
  assert.doesNotMatch(hrefs, /admin|analytics|marketing|discount|settings/i);
});

test("selects only the exact abandoned-cart child", () => {
  assert.equal(
    isPanelNavigationPathActive(
      "/orders/abandoned-carts",
      "/orders/abandoned-carts",
    ),
    true,
  );
  assert.equal(
    isPanelNavigationPathActive(
      "/orders/abandoned-carts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "/orders/abandoned-carts",
    ),
    true,
  );
  for (const pathname of [
    "/orders/abandoned-carts-evil",
    "/orders%2Fabandoned-carts",
    "/orders/abandoned-carts?x=1",
    "/orders//abandoned-carts",
  ])
    assert.equal(
      isPanelNavigationPathActive(pathname, "/orders/abandoned-carts"),
      false,
    );
});

test("matches root only at root", () => {
  assert.equal(isPanelNavigationPathActive("/", "/"), true);
  assert.equal(isPanelNavigationPathActive("/setup", "/"), false);
});

test("contains no deferred module label or href", () => {
  const text = JSON.stringify(PANEL_NAVIGATION);
  assert.doesNotMatch(
    text,
    /marketing|cms|muhasebe|seo|toshi|notification|admin/i,
  );
});

test("selects only exact customer children and safe detail descendants", () => {
  for (const href of [
    "/customers/segments",
    "/customers/tags",
    "/customers/new",
  ] as const) {
    assert.equal(isPanelNavigationPathActive(href, href), true);
    assert.equal(isPanelNavigationPathActive(`${href}/child`, href), false);
  }
  assert.equal(
    isPanelNavigationPathActive(
      "/customers/11111111-1111-4111-8111-111111111111",
      "/customers",
    ),
    true,
  );
  for (const pathname of [
    "/customers-evil",
    "/Customers",
    "/customers//evil",
    "/customers?x=1",
  ]) {
    assert.equal(isPanelNavigationPathActive(pathname, "/customers"), false);
  }
});

test("selects only the exact quick-order child", () => {
  assert.equal(
    isPanelNavigationPathActive("/orders/quick-links", "/orders/quick-links"),
    true,
  );
  for (const pathname of [
    "/orders-evil",
    "/orders/quick-links-evil",
    "/orders/quick-links/child",
    "/orders%2Fquick-links",
    "/orders/quick-links?x=1",
    "/orders/quick-links#x",
    "/orders//quick-links",
  ]) {
    assert.equal(
      isPanelNavigationPathActive(pathname, "/orders/quick-links"),
      false,
    );
  }
});

test("returns immutable navigation and state", () => {
  assert.equal(Object.isFrozen(PANEL_NAVIGATION), true);
  assert.equal(Object.isFrozen(PANEL_NAVIGATION[1].children), true);
  assert.equal(Object.isFrozen(getPanelNavigationState("/products/new")), true);
});

test("maps every supported route to truthful fallback topbar chrome", () => {
  assert.deepEqual(
    [
      "/",
      "/orders",
      "/orders/quick-links",
      "/orders/abandoned-carts",
      "/orders/abandoned-carts/cart-123",
      "/orders/order-123",
      "/customers",
      "/customers/segments",
      "/customers/tags",
      "/customers/new",
      "/customers/customer-123",
      "/products",
      "/products/new",
      "/products/product-123",
      "/setup",
    ].map((pathname) => getPanelRoutePresentation(pathname).title),
    [
      "Özet",
      "Siparişler",
      "Hızlı Siparişler",
      "Terk Edilen Sepetler",
      "Sepet ayrıntısı",
      "Sipariş ayrıntısı",
      "Müşteriler",
      "Segmentler",
      "Etiketler",
      "Yeni müşteri",
      "Müşteri ayrıntısı",
      "Ürün kataloğu",
      "Yeni ürün oluştur",
      "Ürün ayrıntısı",
      "Kurulum durumu",
    ],
  );
});

test("keeps product presentations behind exact routes and a single-segment slash boundary", () => {
  const productTitles = new Set<string>([
    PANEL_ROUTE_PRESENTATIONS.products.title,
    PANEL_ROUTE_PRESENTATIONS.newProduct.title,
    PANEL_ROUTE_PRESENTATIONS.productDetail.title,
  ]);
  for (const pathname of [
    "/products-evil",
    "/product",
    "//products/detail",
    "/Products/detail",
    "/products/",
    "/products/new/draft",
    "/products/product-123/history",
  ]) {
    assert.equal(
      productTitles.has(getPanelRoutePresentation(pathname).title),
      false,
    );
  }
});

test("returns shared immutable route presentation records", () => {
  assert.equal(Object.isFrozen(PANEL_ROUTE_PRESENTATIONS), true);
  assert.equal(
    Object.values(PANEL_ROUTE_PRESENTATIONS).every(Object.isFrozen),
    true,
  );
  assert.equal(
    getPanelRoutePresentation("/products"),
    PANEL_ROUTE_PRESENTATIONS.products,
  );
  assert.equal(
    getPanelRoutePresentation("/unknown"),
    PANEL_ROUTE_PRESENTATIONS.summary,
  );
});
