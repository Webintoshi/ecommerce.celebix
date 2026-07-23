import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

test("price-list console renders truthful finite list states and the seven persisted columns", async () => {
  const component = await source("components/pricing/PriceListConsole.tsx");
  for (const state of ["loading", "loaded", "empty", "error", "denied", "conflict"]) assert.match(component, new RegExp(`["]${state}["]`));
  for (const label of ["Ad", "Durum", "Kanal", "Hedefleme", "Aktif dönem", "Kalem", "Güncellendi"]) assert.match(component, new RegExp(label));
  assert.match(component, /role="alert"/);
  assert.match(component, new RegExp("/products/price-lists/\\$\\{item[.]id\\}"));
  assert.match(component, /mobileCards/);
});

test("price-list editor is fixed-price, versioned, finite-channel and persisted-tag only", async () => {
  const component = await source("components/pricing/PriceListConsole.tsx");
  for (const marker of ["priceCents", "variantId", "customerTagId", "expectedVersion", "storefront", "quick_order", "datetime-local"]) assert.match(component, new RegExp(marker));
  assert.match(component, /customerApi[.]tags\(\)/);
  assert.match(component, /catalogApi[.]listProducts/);
  assert.match(component, /catalogApi[.]getProduct/);
  assert.match(component, /Açıklayıcı önizleme/);
  assert.match(component, /PostgreSQL/);
  assert.match(component, /status === "active"/);
  assert.match(component, /disabled=\{readOnly/);
  assert.doesNotMatch(component, /percentage|customerSegment|formStoreId|formCurrency|customerId|resolve_effective_variant_price/);
});

test("price-list console uses durable API results for conflict permission empty and error truth", async () => {
  const component = await source("components/pricing/PriceListConsole.tsx");
  assert.match(component, /error instanceof PricingApiError/);
  assert.match(component, /error[.]code === "conflict"/);
  assert.match(component, /Bu fiyat listelerini görüntüleme yetkiniz yok/);
  assert.match(component, /Henüz fiyat listesi yok/);
  assert.match(component, /Fiyat listeleri yüklenemedi/);
  assert.match(component, /pricingApi[.]activate/);
  assert.match(component, /pricingApi[.]archive/);
  assert.match(component, /pricingApi[.]save/);
});

test("price-list pages derive pricing capabilities server-side and pass no TenantContext to clients", async () => {
  for (const [path, mode] of [
    ["app/products/price-lists/page.tsx", "pricing.read"],
    ["app/products/price-lists/new/page.tsx", "pricing.manage"],
    ["app/products/price-lists/[priceListId]/page.tsx", "pricing.read"],
  ] as const) {
    const page = await source(path);
    assert.match(page, /resolveServerPanelAccess\(\)/);
    assert.match(page, new RegExp(mode.replace(".", "[.]")));
    assert.match(page, /<PriceListConsole/);
    assert.doesNotMatch(page, /tenantContext=|storeId=|currency=|customerId=|searchParams|headers\(\)/);
  }
});

test("detail and list modes deny locally before mounting a pricing reader without pricing.read", async () => {
  const component = await source("components/pricing/PriceListConsole.tsx");
  assert.match(component, /if \(mode !== "new" && !props[.]canRead\)/);
  assert.match(component, /Bu fiyat listelerini görüntüleme yetkiniz yok/);
});

test("price-list responsive controls preserve Hemenaku shell and 48px targets", async () => {
  const component = await source("components/pricing/PriceListConsole.tsx");
  const css = await source("components/pricing/price-list-console.module.css");
  assert.match(component, /PanelPageShell/);
  assert.match(component, /PanelPageHeader/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /min-width:\s*48px/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.doesNotMatch(component, /apps\/admin|\/api\/admin|supabase|localStorage|sessionStorage/i);
});
