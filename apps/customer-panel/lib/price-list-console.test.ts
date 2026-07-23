import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

test("price-list console renders truthful finite list states and the seven persisted columns", async () => {
  const component = await source("components/pricing/PriceListConsole.tsx");
  for (const state of ["loading", "loaded", "empty", "error", "denied", "conflict", "not_found", "unavailable", "verification_unavailable"]) assert.match(component, new RegExp(`["]${state}["]`));
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
  assert.match(component, /draftRules[.]map/);
  assert.match(component, /item[.]rules[.]map/);
  assert.doesNotMatch(component, /rules\[0\]/);
  assert.doesNotMatch(component, /percentage|customerSegment|formStoreId|formCurrency|customerId|resolve_effective_variant_price/);
});

test("price-list console uses durable API results for conflict permission empty and error truth", async () => {
  const component = await source("components/pricing/PriceListConsole.tsx");
  assert.match(component, /pricingErrorState\(error\)/);
  assert.match(component, /next === "conflict"/);
  assert.match(component, /Bu fiyat listelerini görüntüleme yetkiniz yok/);
  assert.match(component, /Henüz fiyat listesi yok/);
  assert.match(component, /Fiyat listeleri yüklenemedi/);
  assert.match(component, /Fiyat listesi bulunamadı/);
  assert.match(component, /Fiyatlandırma hizmeti kullanılamıyor/);
  assert.match(component, /İşlem sonucu doğrulanamıyor/);
  assert.match(component, /createPricingMutationController/);
  assert.match(component, /mutations[.]activate/);
  assert.match(component, /mutations[.]archive/);
  assert.match(component, /mutations[.]save/);
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
  const detail = await source("app/products/price-lists/[priceListId]/page.tsx");
  assert.match(detail, /notFound\(\)/);
  assert.match(detail, /PRICE_LIST_ID/);
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

test("installed Next server redirects signed-out price-list list new and detail routes to login", {
  skip: process.env.CELEBIX_PRICING_NEXT_GUARD !== "1",
  timeout: 120_000,
}, async (context) => {
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") { server.close(); reject(new Error("pricing_guard_port_unavailable")); return; }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
  const panelRoot = fileURLToPath(ROOT);
  const next = fileURLToPath(new URL("../../node_modules/next/dist/bin/next", ROOT));
  const environment = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", CELEBIX_SAAS_AUTH_MODE: "disabled", CELEBIX_DEPLOYMENT_TIER: "test" };
  const child = spawn(process.execPath, [next, "dev", "--webpack", "--port", String(port)], { cwd: panelRoot, env: environment, stdio: ["ignore", "pipe", "pipe"] });
  let diagnostic = "";
  child.stdout.on("data", (chunk) => { diagnostic = `${diagnostic}${String(chunk)}`.slice(-8_192); });
  child.stderr.on("data", (chunk) => { diagnostic = `${diagnostic}${String(chunk)}`.slice(-8_192); });
  context.after(() => { if (child.exitCode === null) child.kill("SIGTERM"); });
  async function request(path: string): Promise<Response> {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      try { return await fetch(`http://127.0.0.1:${port}${path}`, { redirect: "manual", signal: AbortSignal.timeout(60_000) }); }
      catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    throw new Error(`pricing_guard_server_unavailable:${diagnostic}`);
  }
  for (const path of ["/products/price-lists", "/products/price-lists/new", "/products/price-lists/not-a-uuid"]) {
    const response = await request(path);
    assert.equal(response.status, 307, `${path}:${diagnostic}`);
    assert.equal(response.headers.get("location"), "/login", path);
  }
});
