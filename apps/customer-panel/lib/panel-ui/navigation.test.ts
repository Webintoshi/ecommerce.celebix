import assert from "node:assert/strict";
import test from "node:test";
import {
  PANEL_NAVIGATION,
  PANEL_ROUTE_PRESENTATIONS,
  getPanelRoutePresentation,
  getPanelNavigationState,
  isPanelNavigationPathActive,
} from "./navigation.ts";

test("contains exactly the four working hrefs", () => {
  const hrefs = PANEL_NAVIGATION.flatMap((item) => [
    item.href,
    ...(item.children ?? []).map((child) => child.href),
  ]);
  assert.deepEqual([...new Set(hrefs)], ["/", "/products", "/products/new", "/setup"]);
});

test("keeps the catalog parent active on exact descendants", () => {
  assert.equal(isPanelNavigationPathActive("/products", "/products"), true);
  assert.equal(isPanelNavigationPathActive("/products/new", "/products"), true);
  assert.equal(isPanelNavigationPathActive("/products/uuid", "/products"), true);
});

test("rejects near-match and alternate path spellings", () => {
  for (const path of ["/products-evil", "/product", "//products", "/Products"]) {
    assert.equal(isPanelNavigationPathActive(path, "/products"), false);
  }
});

test("matches root only at root", () => {
  assert.equal(isPanelNavigationPathActive("/", "/"), true);
  assert.equal(isPanelNavigationPathActive("/setup", "/"), false);
});

test("contains no deferred module label or href", () => {
  const text = JSON.stringify(PANEL_NAVIGATION);
  assert.doesNotMatch(text, /order|sipariş|customer|müşteri|marketing|cms|muhasebe|seo|toshi|notification|admin/i);
});

test("returns immutable navigation and state", () => {
  assert.equal(Object.isFrozen(PANEL_NAVIGATION), true);
  assert.equal(Object.isFrozen(PANEL_NAVIGATION[1].children), true);
  assert.equal(Object.isFrozen(getPanelNavigationState("/products/new")), true);
});

test("maps every supported route to truthful fallback topbar chrome", () => {
  assert.deepEqual(
    ["/", "/products", "/products/new", "/products/product-123", "/setup"]
      .map((pathname) => getPanelRoutePresentation(pathname).title),
    ["Genel bakış", "Ürün kataloğu", "Yeni ürün oluştur", "Ürün ayrıntısı", "Kurulum durumu"],
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
    assert.equal(productTitles.has(getPanelRoutePresentation(pathname).title), false);
  }
});

test("returns shared immutable route presentation records", () => {
  assert.equal(Object.isFrozen(PANEL_ROUTE_PRESENTATIONS), true);
  assert.equal(Object.values(PANEL_ROUTE_PRESENTATIONS).every(Object.isFrozen), true);
  assert.equal(getPanelRoutePresentation("/products"), PANEL_ROUTE_PRESENTATIONS.products);
  assert.equal(getPanelRoutePresentation("/unknown"), PANEL_ROUTE_PRESENTATIONS.overview);
});
