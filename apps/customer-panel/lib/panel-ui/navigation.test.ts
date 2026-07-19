import assert from "node:assert/strict";
import test from "node:test";
import {
  PANEL_NAVIGATION,
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
