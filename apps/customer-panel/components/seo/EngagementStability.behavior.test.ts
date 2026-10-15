import assert from "node:assert/strict";
import test from "node:test";
import React, { act, createElement } from "react";
import { compile, mounted, click, input, effectiveCss } from "../../lib/mira-final-test-support.ts";

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const resource = { id: "11111111-1111-4111-8111-111111111111", kind: "product", name: "Yüzük", path: "/products/yuzuk", locale: "tr", status: "active", version: 1, seoVersion: 1, title: "Yüzük", description: "Açıklama", canonicalPath: null, indexing: "inherit", allowIndex: true, imageUrl: null };
const resourcePage = { items: [resource], total: 1, nextCursor: null };
const dialog = { OrderActionDialog: () => null };

test("SEO resource refresh keeps the same rows mounted, while changed filters hide old results", async () => {
  let pending = deferred<typeof resourcePage>(), reads = 0;
  const client = { resources: async () => ++reads === 1 ? resourcePage : pending.promise };
  const Component = compile("components/seo/SeoContent.tsx", { "@/components/orders/OrderActionDialog": dialog }).SeoContent;
  await mounted(Component, { canManage: true, client }, async (host, window) => {
    const row = host.querySelector("article"), search = host.querySelector('input[type="search"]'); assert.ok(row);
    await click(host, "İçerikleri yenile");
    assert.ok(host.querySelector("article") === row, "same-query refresh must preserve readable row and geometry");
    assert.equal(host.querySelector(".loadingCharts"), null);
    await act(async () => pending.reject(new Error("Okuma başarısız")));
    assert.ok(host.querySelector("article") === row, "refresh error must retain row"); assert.match(host.textContent, /Okuma başarısız/);
    pending = deferred(); await input(window, search, "Yeni sorgu");
    assert.equal(host.querySelector("article"), null, "previous filter results must disappear immediately");
    assert.ok(host.querySelector('[data-seo-loading="content"]'));
  });
});

test("SEO link refresh keeps graph and table in place without inserting the overview skeleton", async () => {
  const pending = deferred<any>(); let reads = 0;
  const links = [{ id: "link", sourceKind: "product", sourceId: "one", sourcePath: "/products/one", targetKind: "page", targetId: "two", targetPath: "/pages/two", anchorText: "Rehber", enabled: true, version: 1 }];
  const client = { links: async () => ++reads === 1 ? { items: links } : pending.promise, resources: async () => ({ items: [], nextCursor: null, total: 0 }) };
  const Component = compile("components/seo/SeoOverview.tsx", { "@/components/orders/OrderActionDialog": dialog }).SeoLinks;
  await mounted(Component, { canManage: true, client }, async host => {
    const table = host.querySelector("table"), graph = host.querySelector('[aria-label="İçerik bağlantı haritası"]');
    await click(host, "Bağlantıları yenile"); assert.ok(host.querySelector("table") === table, "table stays mounted"); assert.ok(host.querySelector('[aria-label="İçerik bağlantı haritası"]') === graph, "graph stays mounted");
    assert.equal(host.querySelector('.loading'), null, "refresh must not push mounted content down");
    await act(async () => pending.reject(new Error("Bağlantılar okunamadı"))); assert.ok(host.querySelector("table") === table, "table stays mounted"); assert.match(host.textContent, /Bağlantılar okunamadı/);
  });
});

test("SEO pagination hides previous-page actions until its requested cursor resolves", async () => {
  const pending = deferred<any>(); let reads = 0;
  const Component = compile("components/seo/SeoContent.tsx", { "@/components/orders/OrderActionDialog": dialog }).SeoContent;
  const client = { resources: async () => ++reads === 1 ? { ...resourcePage, nextCursor: "next" } : pending.promise };
  await mounted(Component, { canManage: true, client }, async host => {
    assert.ok(host.querySelector("article")); await click(host, "Sonraki");
    assert.ok(!host.querySelector("article"), "previous cursor rows must be hidden while the replacement page loads");
    assert.equal(host.querySelector('[aria-label="Yüzük SEO alanlarını düzenle"]'), null); assert.ok(host.querySelector('[data-seo-loading="content"]'));
    await act(async () => pending.resolve({ items: [{ ...resource, id: "22222222-2222-4222-8222-222222222222", name: "İkinci sayfa" }], total: 2, nextCursor: null }));
    assert.match(host.querySelector("article")?.textContent ?? "", /İkinci sayfa/); assert.match(host.textContent, /2\. sayfa/);
  });
});

test("SEO changed-filter render cannot expose old rows before its passive read effect runs", async () => {
  let holdReadEffects = false;
  const Component = compile("components/seo/SeoContent.tsx", {
    "react": { ...React, useEffect: (effect: any, dependencies: any) => React.useEffect(holdReadEffects ? () => {} : effect, dependencies) },
    "@/components/orders/OrderActionDialog": dialog,
  }).SeoContent;
  await mounted(Component, { canManage: true, client: { resources: async () => resourcePage } }, async (host, window) => {
    assert.ok(host.querySelector("article")); holdReadEffects = true;
    await input(window, host.querySelector('input[type="search"]'), "Başka filtre");
    assert.ok(!host.querySelector("article"), "a committed filter render must hide previous-scope records before effects run");
    assert.ok(host.querySelector('[data-seo-loading="content"]'));
  });
});

test("SEO loading variants represent content, settings, links, and overview independently", async () => {
  const Component = compile("components/seo/SeoShared.tsx").SeoLoading;
  for (const layout of ["content", "settings", "links", "overview"]) await mounted(Component, { layout, label: "Yükleniyor" }, async host => {
    assert.ok(host.querySelector(`[data-seo-loading="${layout}"]`)); assert.equal(host.querySelectorAll("input,button,select,textarea").length, 0);
    assert.equal(!!host.querySelector(".loadingStats"), layout === "overview");
  });
});

test("email initial read renders connection placeholders and sync geometry without false disconnected status", async () => {
  const pending = deferred<any>();
  const Component = compile("components/email-marketing/EmailMarketingConnections.tsx", { "./EmailMarketingConnectDialog": { EmailMarketingConnectDialog: () => null } }).EmailMarketingConnections;
  await mounted(Component, { canManage: true, configured: true, api: { overview: () => pending.promise } }, async host => {
    assert.equal(host.querySelectorAll('[data-email-connection-loading]').length, 2); assert.ok(host.querySelector('[aria-label="Aktarım durumu yükleniyor"]'));
    assert.equal(host.querySelector('.status[data-status="disconnected"]'), null); assert.ok(host.querySelector('[aria-busy="true"]'));
    await act(async () => pending.resolve({ configured: true, connections: [], sync: { queued: 0, verified: 0, blocked: 0, failed: 0, pendingVerification: 0, suppressionCheckedAt: null } }));
    assert.equal(host.querySelector('[data-email-connection-loading]'), null); assert.ok(host.querySelector('[aria-label="Aktarım durumu"]'));
  });
});

test("Google Merchant first read reserves brand, metrics and product rows and retains them during refresh", async () => {
  const pending = deferred<any>(); let reads = 0;
  const overview = { connection: { status: "connected" }, lastSyncedAt: null, identityProfile: { ownBrand: false, brandName: null, version: 0 }, counts: { ready: 1, pending: 0, submitted: 0, approved: 0, limited: 0, disapproved: 0, excluded: 0, failed: 0 } };
  const product = { productId: "product", variantId: "variant", title: "Yüzük", sku: "001", enabled: true, issues: [], status: "ready", attributes: {}, priceCents: 100 };
  const client = { overview: () => ++reads === 1 ? pending.promise : new Promise(() => {}), products: () => reads === 1 ? pending.promise.then(() => ({ items: [product], nextCursor: null })) : new Promise(() => {}) };
  const Component = compile("components/google-merchant/GoogleMerchantConsole.tsx", { "./client": { googleMerchantClient: client }, "@/components/google-marketing/GoogleMarketingConnections": { GoogleMarketingConnections: () => null }, "@/components/orders/OrderActionDialog": dialog }).GoogleMerchantConsole;
  await mounted(Component, { canManage: true }, async host => {
    assert.ok(host.querySelector('[aria-label="Ürün markası yükleniyor"]')); assert.equal(host.querySelectorAll(".loadingMetric").length, 8); assert.ok(host.querySelector(".loadingRow"));
    await act(async () => pending.resolve(overview)); const table = host.querySelector("table"); assert.ok(table);
    await click(host, "Durumu yenile"); assert.ok(host.querySelector("table") === table, "table stays mounted"); assert.ok(host.querySelector('[aria-label="Markası olmayan ürünleri kendi markamızla satıyoruz"]'));
  });
});

test("workspace loaders retain bounded desktop and mobile regions with noninteractive placeholders", async () => {
  const Component = compile("components/merchant-admin/MerchantWorkspaceLoading.tsx").MerchantWorkspaceLoading;
  for (const layout of ["list", "editor", "analytics", "settings"]) await mounted(Component, { layout, label: "Yükleniyor" }, async host => {
    assert.ok(host.querySelector('[role="status"]')); assert.equal(host.querySelectorAll("input,button,textarea,select,a").length, 0);
  });
  for (const width of [1440, 1024, 390]) {
    const html = '<div class="listRegion"><div class="loading list"><div class="row"><span></span><span></span><span></span><span></span><span></span></div></div></div>';
    const region = effectiveCss("components/merchant-admin/merchant-module-console.module.css", html, ".listRegion", width); assert.equal(region.minHeight, width === 390 ? "480px" : "340px");
    const row = effectiveCss("components/merchant-admin/merchant-workspace-loading.module.css", html, ".row", width); assert.equal(row.minHeight, width === 390 ? "144px" : "72px");
  }
});

test("shared settings refresh retains the loaded form and its values through read failure", async () => {
  const pending = deferred<any>(); let reads = 0;
  const api = { records: () => ++reads === 1 ? Promise.resolve([{ id: "settings", kind: "general_setting", name: "Ayarlar", status: "active", version: 1, updatedAt: "2026-10-15T00:00:00Z", config: { storeDisplayName: "Mağazam", timezone: "Europe/Istanbul" } }]) : pending.promise, events: async () => [] };
  const Component = compile("components/merchant-admin/MerchantModuleConsole.tsx", { "@/lib/merchant-admin-ui/client": { merchantAdminApi: api, MerchantAdminApiError: class extends Error {} }, "@/components/merchant-admin/ProviderConnectionPanel": { ProviderConnectionPanel: () => null } }).MerchantModuleConsole;
  await mounted(Component, { kind: "general_setting", canManage: true }, async host => {
    const form = host.querySelector("form"), field = host.querySelector('input[name="storeDisplayName"]'); assert.ok(form); assert.equal(field?.value, "Mağazam");
    const refresh = [...host.querySelectorAll("button")].find((button: any) => button.textContent.trim() === "Yenile") as any; assert.ok(refresh); await act(async () => refresh.click()); assert.ok(host.querySelector("form") === form, "refresh must keep settings form mounted");
    await act(async () => pending.reject(new Error("Bağlantı kesildi"))); assert.ok(host.querySelector("form") === form, "read failure retains usable form"); assert.equal(field?.value, "Mağazam");
  });
});

test("coupon batch refresh keeps the readable table while the authoritative list reloads", async () => {
  let reads = 0; const pending = deferred<any>();
  const api = { detail: async () => ({ name: "Kampanya", ruleDocument: { trigger: { kind: "automatic" } } }), listCodeBatches: () => ++reads === 1 ? Promise.resolve({ items: [{ id: "batch", prefix: "KOD", status: "active", count: 10, used: 0, held: 0, remaining: 10 }], nextCursor: null }) : pending.promise, updateCodeBatch: async () => ({}) };
  const Component = compile("components/promotions/PromotionCodes.tsx", { "@/lib/promotion-ui/client": { promotionApi: api } }).PromotionCodes;
  await mounted(Component, { promotionId: "promotion", timezone: "Europe/Istanbul", storefrontOrigin: null, canPublish: true, canExportCodes: false }, async host => {
    const table = host.querySelector("table"); assert.ok(table); await click(host, "Duraklat"); assert.ok(host.querySelector("table") === table, "batch reload retains table");
    await act(async () => pending.reject(new Error("Okunamadı"))); assert.ok(host.querySelector("table") === table); assert.match(host.textContent, /Kupon grupları yüklenemedi/);
  });
});
