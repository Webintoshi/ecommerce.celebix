import assert from "node:assert/strict";
import test from "node:test";
import { createCommerceNavigation, isCommerceNavigationStoreEnabled } from "./commerce-navigation.ts";
import { getPanelNavigation, type PanelNavigationItem } from "./navigation.ts";

const flatten = (items: readonly PanelNavigationItem[]): readonly PanelNavigationItem[] => items.flatMap(item => [item, ...flatten(item.children ?? [])]);
const hrefs = (items: readonly PanelNavigationItem[]) => [...new Set(flatten(items).map(item => item.href))].sort();
const allModelItems = (model: ReturnType<typeof createCommerceNavigation>) => [...model.sections.flatMap(section => section.items), ...(model.quickSale ? [model.quickSale] : [])];
const ownerNavigation = () => getPanelNavigation({ analyticsAvailable: true, accountingCommissionsAvailable: true }).filter(item => item.key !== "setup");

test("store rollout requires an exact trusted slug in a valid explicit allowlist", () => {
  assert.equal(isCommerceNavigationStoreEnabled("pilot-shop", "pilot-shop"), true);
  assert.equal(isCommerceNavigationStoreEnabled("pilot-shop", "other-shop, pilot-shop"), true);
  for (const value of [undefined, "", "*", "pilot", "pilot-shop.evil", "https://pilot-shop", "pilot-shop,", "pilot-shop,*", "PILOT-SHOP", "pilot-shop/?enabled=true"]) {
    assert.equal(isCommerceNavigationStoreEnabled("pilot-shop", value), false, String(value));
  }
  for (const value of [undefined, "", "pilot-shop.evil", "PILOT-SHOP", "pilot-shop/", " pilot-shop", "other-shop"]) {
    assert.equal(isCommerceNavigationStoreEnabled(value, "pilot-shop"), false, String(value));
  }
});

test("the new hierarchy preserves every allowed destination without mutating the original menu", () => {
  const original = ownerNavigation(), before = JSON.stringify(original);
  const model = createCommerceNavigation(original);
  assert.deepEqual(hrefs(allModelItems(model)), hrefs(original));
  assert.equal(JSON.stringify(original), before);
  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.sections), true);
  assert.ok(model.sections.every(section => Object.isFrozen(section) && Object.isFrozen(section.items)));
  assert.equal(model.quickSale?.href, "/orders/quick-links");
  assert.equal(model.quickSale?.label, "Yeni satış");
  assert.equal(model.sections.some(section => flatten(section.items).some(item => item.href === "/orders/quick-links")), false);
});

test("products are grouped into four tasks and the existing product-create link stays accessible", () => {
  const model = createCommerceNavigation(ownerNavigation());
  const catalog = model.sections.flatMap(section => section.items).find(item => item.key === "catalog");
  assert.deepEqual(catalog?.children?.map(item => item.label), ["Tüm ürünler", "Gruplandırma", "Ürün özellikleri", "İçe / dışa aktarma"]);
  assert.deepEqual(catalog?.children?.[0].children?.map(item => item.href), ["/products", "/products/new"]);
  assert.deepEqual(catalog?.children?.[1].children?.map(item => item.href), ["/products/categories", "/products/collections", "/products/tags"]);
  assert.deepEqual(catalog?.children?.[2].children?.map(item => item.href), ["/products/attributes", "/products/brands", "/products/extras", "/products/definitions"]);
  assert.deepEqual(catalog?.children?.[3].children?.map(item => item.href), ["/products/auto-import", "/products/bulk-upload"]);
});

test("stock, reference pricing and website tools move to shared or online homes while their pages remain the same", () => {
  const original = ownerNavigation();
  const model = createCommerceNavigation(original);
  const items = model.sections.flatMap(section => section.items);
  const inventory = items.find(item => item.key === "inventory-pricing");
  assert.deepEqual(inventory?.children?.map(item => item.href), ["/products/stock", "/products/price-lists", "/settings/pricing", "/products/barcode-labels"]);
  const website = items.find(item => item.key === "website");
  assert.ok(website && hrefs([website]).includes("/products/reviews"));
  assert.ok(website && hrefs([website]).includes("/content/policies"));
  assert.ok(website && hrefs([website]).includes("/seo/settings"));
  const settings = items.find(item => item.key === "settings");
  assert.ok(settings?.children?.some(item => item.href === "/settings/security"));
  assert.equal(settings?.children?.some(item => item.href === "/settings/pricing" || item.href === "/settings/design"), false);
  const originalStock = flatten(original).find(item => item.href === "/products/stock");
  assert.equal(inventory?.children?.find(item => item.href === "/products/price-lists"), flatten(original).find(item => item.href === "/products/price-lists"));
  assert.equal(inventory?.children?.find(item => item.href === "/products/stock")?.href, originalStock?.href);
});

test("unfiltered orders are named truthfully and no new physical-history or cash-session route is invented", () => {
  const model = createCommerceNavigation(ownerNavigation());
  const physical = model.sections.find(section => section.key === "physical-commerce");
  const online = model.sections.find(section => section.key === "online-commerce");
  assert.deepEqual(physical?.items.map(item => item.href), ["/accounting/accounts"]);
  assert.equal(online?.items.find(item => item.href === "/orders")?.label, "Tüm siparişler");
  assert.equal(flatten(allModelItems(model)).some(item => item.href.includes("?")), false);
  assert.equal(flatten(allModelItems(model)).some(item => String(item.href) === "/accounting/cash-sessions"), false);
});

test("cash and bank moves to one physical shortcut while every other accounting entry stays intact", () => {
  const original = ownerNavigation();
  const sourceAccounting = original.find(item => item.key === "accounting")!;
  const model = createCommerceNavigation(original);
  const accounting = model.sections.flatMap(section => section.items).find(item => item.key === "accounting")!;
  assert.deepEqual(accounting.children, sourceAccounting.children?.filter(item => item.href !== "/accounting/accounts"));
  const cashLeaves = flatten(allModelItems(model)).filter(item => item.href === "/accounting/accounts" && !item.children?.length);
  assert.equal(cashLeaves.length, 1);
  assert.equal(model.sections.find(section => section.key === "physical-commerce")?.items[0], sourceAccounting.children?.find(item => item.href === "/accounting/accounts"));
  assert.ok(sourceAccounting.children?.some(item => item.href === "/accounting/accounts"));
});

test("filtered input cannot gain hidden personnel, accounting, catalog or import links", () => {
  const original = ownerNavigation();
  const visible = original.filter(item => !["accounting", "settings", "catalog", "content", "seo"].includes(item.key));
  const model = createCommerceNavigation(visible);
  assert.deepEqual(hrefs(allModelItems(model)), hrefs(visible));
  assert.equal(model.sections.some(section => section.key === "physical-commerce"), false);
  assert.equal(flatten(allModelItems(model)).some(item => item.href.startsWith("/products") || item.href.startsWith("/settings") || item.href.startsWith("/accounting")), false);
  const reduced = original.map(item => item.key === "settings" ? { ...item, children: item.children?.filter(child => child.href !== "/settings/administrators") } : item);
  assert.equal(flatten(allModelItems(createCommerceNavigation(reduced))).some(item => item.href === "/settings/administrators"), false);
});

test("register navigation is unchanged even when rollout presentation is requested", () => {
  for (const orders of [false, true]) for (const accounting of [false, true]) {
    const original = getPanelNavigation({ analyticsAvailable: true, navigationMode: "register", cashierOrdersAvailable: orders, cashierAccountingAvailable: accounting });
    const model = createCommerceNavigation(original, { navigationMode: "register" });
    assert.equal(model.quickSale, undefined);
    assert.equal(model.sections.length, 1);
    assert.equal(model.sections[0].label, "Mağaza");
    assert.equal(model.sections[0].items, original);
    assert.deepEqual(hrefs(allModelItems(model)), hrefs(original));
  }
});

test("newly permitted destinations remain reachable and converter visibility comes only from input", () => {
  const original = ownerNavigation();
  const catalog = original.find(item => item.key === "catalog")!;
  const converter: PanelNavigationItem = Object.freeze({ key: "allowed-converter", label: "Shopify Dönüştürücü", href: "/products/shopify-converter", icon: "imports" });
  const withConverter = original.map(item => item === catalog ? Object.freeze({ ...item, children: Object.freeze([...(item.children ?? []), converter]) }) : item);
  const future: PanelNavigationItem = Object.freeze({ key: "future-tool", label: "İzinli araç", href: "/toshi", icon: "artificial-intelligence" });
  const input = Object.freeze([...withConverter, future]);
  const model = createCommerceNavigation(input);
  assert.deepEqual(hrefs(allModelItems(model)), hrefs(input));
  const newCatalog = model.sections.flatMap(section => section.items).find(item => item.key === "catalog");
  assert.equal(newCatalog?.children?.find(item => item.key === "catalog-imports")?.children?.at(-1), converter);
  assert.ok(model.sections.find(section => section.key === "management")?.items.some(item => item.href === future.href));
});
