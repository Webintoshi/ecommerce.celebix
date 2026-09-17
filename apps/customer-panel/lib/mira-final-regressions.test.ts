import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { PromotionTargetPageLoader } from "./promotion-ui/client.ts";
import { PAYMENT_PROVIDER_CATALOG } from "./payment-providers/catalog.ts";
import { buildPaymentSettingsViewModel } from "./payment-settings-ui/model.ts";
import { compile, mounted, click, effectiveCss, input } from "./mira-final-test-support.ts";

const domain = { id: "domain-1", hostname: "shop.example.test", hostnameType: "custom_domain", status: "pending", uiStatus: "dns_pending", primary: false, version: 1, dnsInstructions: [{ type: "CNAME", name: "shop", value: "edge.example.test" }] };
const domainModule = (failLoad = false) => compile("components/settings/domains/StoreDomainSettings.tsx", {
  "@/lib/store-domain-ui/client": { StoreDomainApiError: Error, storeDomainApi: { list: async () => { if (failLoad) throw new Error("Load rejected"); return [domain]; }, recheck: async () => { throw new Error("Action rejected"); } } },
  "@/lib/admin-domain-ui/client": { adminDomainApi: { list: async () => [] } },
});
test("loaded domain cards and recovery links survive clipboard and action rejection", async () => {
  await mounted(domainModule().StoreDomainSettings, { canManage: true }, async (host, window) => {
    Object.defineProperty(window.navigator.clipboard, "writeText", { value: async () => { throw new Error("clipboard denied"); } });
    await click(host, "shop DNS değerini kopyala");
    assert.ok(host.querySelector("article"), "clipboard error must retain loaded domain");
    assert.match(host.textContent, /Teknik kurtarma adresleri/);
    await click(host, "Durumu yenile");
    assert.match(host.textContent, /Action rejected/);
    assert.ok(host.querySelector("article"), "action error must retain loaded domain");
  });
});
test("initial domain failure exposes retry without claiming an empty collection", async () => {
  await mounted(domainModule(true).StoreDomainSettings, { canManage: true }, async host => {
    assert.match(host.textContent, /Load rejected/);
    assert.doesNotMatch(host.textContent, /Henüz özel/);
    assert.ok([...host.querySelectorAll("button")].find((b: any) => b.textContent === "Tekrar dene"));
  });
});

test("the actual customer list uses the canonical open frame with a separate inner toolbar divider", async () => {
  const { CustomerListConsole } = compile("components/customers/CustomerListConsole.tsx", { "@/lib/customer-ui/client": { CustomerApiError: Error, customerApi: { summary: async () => ({ active: 0, archived: 0, consentedEmail: 0, totalSpentCents: 0, currency: "TRY", asOf: "2026-09-09T10:00:00Z" }), list: async () => ({ items: [] }) } } });
  await mounted(CustomerListConsole, { canManage: false }, async host => {
    const frame = host.querySelector('[aria-label="Müşteri çalışma alanı"]');
    assert.equal(frame.className, "surface");
    const style = effectiveCss("components/customers/customer-console.module.css", host.innerHTML, '[aria-label="Müşteri çalışma alanı"]');
    assert.equal(style.borderTopWidth, "0px");
    assert.equal(style.backgroundColor, "transparent");
    const toolbar = effectiveCss("components/customers/customer-console.module.css", host.innerHTML, ".customerToolbar");
    assert.equal(toolbar.borderBottomWidth, "1px");
  });
});

for (const phase of ["loading", "error", "ready"] as const) test(`payment catalog ${phase} never turns unknown into zero`, async () => {
  const { PaymentProviderWorkspace } = compile("components/settings/payment/PaymentProviderCatalogDialog.tsx");
  await mounted(PaymentProviderWorkspace, { cards: [], totalCount: 0, query: "", filters: { category: "all", interactionMode: "all", readiness: "all", environment: "all" }, phase }, async host => {
    if (phase === "ready") assert.match(host.textContent, /0 \/ 0 entegrasyon/);
    else assert.doesNotMatch(host.textContent, /0 \/ 0 entegrasyon/);
  });
});
test("a populated payment catalog displays the real visible and total integration counts", async () => {
  const filters = { category: "all", interactionMode: "all", readiness: "all", environment: "all" } as const;
  const view = buildPaymentSettingsViewModel(PAYMENT_PROVIDER_CATALOG.slice(0, 1), [], [], [], "", filters, true);
  const { PaymentProviderWorkspace } = compile("components/settings/payment/PaymentProviderCatalogDialog.tsx");
  await mounted(PaymentProviderWorkspace, { cards: view.catalog.cards, totalCount: view.catalog.totalCount, phase: "ready", query: "", filters }, async host => {
    assert.match(host.textContent, /1 \/ 1 entegrasyon/);
    assert.match(host.textContent, new RegExp(view.catalog.cards[0]!.label));
  });
});

test("resource load failure is unknown, retry recovers, and later failure preserves loaded rows", async () => {
  let reject = true;
  const resource = { id: "resource-1", kind: "collection", name: "Retained collection", slug: "retained", description: "", status: "active", productCount: 0, productIds: [], config: {}, version: 1 };
  const { CatalogResourceConsole } = compile("components/catalog-admin/CatalogResourceConsole.tsx", {
    "@/lib/catalog-admin-ui/client": { CatalogAdminApiError: Error, catalogAdminApi: { resources: async () => { if (reject) throw new Error("Collection unavailable"); return [resource]; }, archiveResource: async () => { throw new Error("Archive rejected"); } } },
    "@/lib/catalog-ui/client": { catalogApi: {} },
  });
  await mounted(CatalogResourceConsole, { kind: "collection", canManage: true }, async host => {
    assert.doesNotMatch(host.textContent, /Henüz koleksiyon yok/);
    reject = false;
    await click(host, "Tekrar dene");
    assert.match(host.textContent, /Retained collection/);
    await click(host, "Arşivle");
    reject = true;
    await click(host, "Tekrar dene");
    assert.match(host.textContent, /Retained collection/);
    assert.match(host.textContent, /Collection unavailable/);
  });
});

for (const width of [1440, 1024, 390]) test(`product editor effective ${width}px cascade preserves usable editor and summary order`, () => {
  const html = '<div class="createWorkspace"><div class="editorLayout"><div class="sections"><div class="onboarding-editor-grid"><textarea></textarea></div><div class="onboarding-variant-builder"></div></div><aside class="stickySummary"></aside></div></div>';
  const layout = effectiveCss("components/catalog-onboarding/product-onboarding.module.css", html, ".editorLayout", width);
  assert.equal(layout.gridTemplateColumns, width > 1024 ? "minmax(0, 1fr) 280px" : "1fr");
  const summary = effectiveCss("components/catalog-onboarding/product-onboarding.module.css", html, ".stickySummary", width);
  if (width <= 1024) { assert.equal(summary.position, "static"); assert.equal(summary.order, "-1"); }
});

const focusCases = [
  ["customers/customer-console.module.css", '<div class="surface"><a class="customerNameLink testFocus"></a></div>', "a"],
  ["catalog/catalog-operations.module.css", '<div class="catalogRoot"><button class="command-button testFocus"></button></div>', "button"],
  ["catalog-admin/catalog-admin-console.module.css", '<div class="surface"><button class="primary testFocus"></button></div>', "button"],
  ["catalog-onboarding/category-management.module.css", '<div class="categoryManager"><button class="primaryButton testFocus"></button></div>', "button"],
  ["catalog-onboarding/product-onboarding.module.css", '<div class="form"><input class="testFocus"></div>', "input"],
  ["catalog/product-description-editor.module.css", '<button class="toolbarButton testFocus"></button>', "button"],
  ["catalog-admin/barcode-label-studio.css", '<div class="barcode-studio"><button class="testFocus"></button></div>', "button"],
  ["inventory/inventory-console.module.css", '<div class="operationFields"><input class="testFocus"></div>', "input"],
  ["pricing/price-list-console.module.css", '<div class="editor"><input class="testFocus"></div>', "input"],
  ["orders/order-drafts.module.css", '<div class="listSurface"><a class="draftNumber testFocus"></a></div>', "a"],
] as const;
for (const [path, html, selector] of focusCases) test(`effective scoped graphite keyboard focus: ${path}`, () => {
  const style = effectiveCss(`components/${path}`, html, selector);
  assert.equal(style.outlineColor, "#2B2B2B", style.outline);
  assert.ok(parseFloat(style.outlineWidth) >= 2);
});

for (const target of ["primaryButton", "refreshButton", "cancelButton", "archiveButton"]) test(`category ${target} effective target is at least 44px`, () => {
  const style = effectiveCss("components/catalog-onboarding/category-management.module.css", `<button class="${target}"></button>`, "button", 390);
  assert.ok(parseFloat(style.minHeight) >= 44);
  if (target === "refreshButton") assert.ok(parseFloat(style.width) >= 44);
});
test("advanced product create footer has a 44px effective target", () => {
  const style = effectiveCss("components/catalog-onboarding/product-onboarding.module.css", '<div class="createWorkspace"><div class="editorActions"><button></button></div></div>', "button", 1024);
  assert.ok(parseFloat(style.minHeight) >= 44);
});

for (const [path, className] of [["customers/customer-console.module.css", "surface"], ["customers/customer-console.module.css", "form"], ["orders/abandoned-cart-console.module.css", "surface"], ["orders/quick-order-links.module.css", "panel"], ["orders/order-drafts.module.css", "formSection"]]) test(`effective open frame ${path} ${className}`, () => {
  const style = effectiveCss(`components/${path}`, `<section class="${className}"></section>`, "section");
  assert.equal(style.borderTopWidth, "0px");
  assert.equal(style.borderRadius, "0px");
  assert.equal(style.backgroundColor, "transparent");
  assert.equal(style.boxShadow, "none");
});

function luminance(hex: string) {
  assert.match(hex, /^#[\da-f]{6}$/i, `Expected opaque computed color, received ${hex}`);
  const values = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return values[0]! * .2126 + values[1]! * .7152 + values[2]! * .0722;
}
const contrastCases = [
  ["customers/customer-console.module.css", '<div class="customerWorkspace"><div class="detail"><div class="addressTitle"><span></span></div></div></div>', ".addressTitle span", "#FFFDFC"],
  ["customers/customer-console.module.css", '<div class="customerWorkspace"><div class="detail"><div class="noteList"><article><small></small></article></div></div></div>', "small", "#FFFDFC"],
  ["catalog-admin/catalog-admin-console.module.css", '<div class="surface"><span class="previewEyebrow"></span></div>', ".previewEyebrow", "#FFFDFC"],
  ["catalog-admin/catalog-admin-console.module.css", '<div class="surface"><label class="check"><small></small></label></div>', "small", "#FFFDFC"],
  ["catalog-onboarding/product-onboarding.module.css", '<div class="backdrop"><div class="dialog"><span class="eyebrow"></span></div></div>', ".eyebrow", "#FFFDFC"],
  ["orders/order-drafts.module.css", '<div class="listSurface"><dl class="cardFacts"><dt></dt></dl></div>', "dt", "#FFFDFC"],
  ["content/policy-console.module.css", '<div class="statusOptions"><button><small></small></button></div>', "small", "#FFFDFC"],
  ["catalog-admin/barcode-label-studio.css", '<div class="barcode-studio"><div class="barcode-steps"><button class="active"><span></span></button></div></div>', "span", "#FE6100"],
  ["settings/design-settings.module.css", '<div class="stepRail"><button class="active"><span></span></button></div>', "span", "#FE6100"],
] as const;
for (const [path, html, selector, background] of contrastCases) test(`normal text contrast at least 4.5:1 ${path} ${selector}`, () => {
  const color = effectiveCss(`components/${path}`, html, selector).color;
  const a = luminance(color), b = luminance(background);
  assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, `${color} on ${background}`);
});

for (const [path, parent, summary] of [["orders/order-drafts.module.css", "editorWorkspace", "summaryCard"], ["orders/quick-order-links.module.css", "console", "summaryWorkspace"]]) test(`desktop and mobile summary share light palette ${path}`, () => {
  for (const width of [1440, 390]) {
    const style = effectiveCss(`components/${path}`, `<div class="${parent}"><aside class="${summary}"></aside></div>`, "aside", width);
    assert.equal(style.backgroundColor, "#FFFDFC"); assert.equal(style.color, "#2B2B2B");
  }
});
for (const [path, html] of [["customers/customer-console.module.css", '<div class="customerWorkspace"><div class="summaryCard"><span>Müşteri durumu</span><span data-badge>Aktif</span></div></div>'], ["orders/abandoned-cart-console.module.css", '<div class="detailHero"><div><svg></svg><span>Durum</span><span data-badge>Terk edildi</span></div></div>']]) test(`summary status badge stays compact ${path}`, () => {
  const style = effectiveCss(`components/${path}`, html, "[data-badge]");
  assert.equal(style.justifySelf, "start");
});
for (const [path, html] of [["catalog-admin/catalog-admin-console.module.css", '<div class="surface"><label class="check"><input type="checkbox"></label></div>'], ["promotions/promotion-studio.module.css", '<label class="radioLabel"><input type="radio"></label>']]) test(`scoped native choice accent ${path}`, () => {
  assert.equal(effectiveCss(`components/${path}`, html, "input").getPropertyValue("accent-color"), "#FE6100");
});

test("cart pending note is locked and rejected note remains editable with its draft", async () => {
  let reject!: (reason: Error) => void;
  const gate = new Promise((_, rejectPromise) => { reject = rejectPromise; });
  const cart = { id: "cart-1", status: "abandoned", currency: "TRY", totalCents: 0, subtotalCents: 0, discountCents: 0, itemCount: 0, items: [], checkoutStartedAt: "2026-09-09T10:00:00Z", lastActivityAt: "2026-09-09T11:00:00Z", abandonedAt: "2026-09-09T11:00:00Z", version: 1 };
  const { AbandonedCartDetailConsole } = compile("components/orders/AbandonedCartConsole.tsx", { "@/lib/abandoned-cart-ui/client": { AbandonedCartApiError: Error, abandonedCartApi: { get: async () => cart, recordRecoveryAttempt: async () => gate } } });
  await mounted(AbandonedCartDetailConsole, { cartId: cart.id, canManage: true }, async (host, window) => {
    const field = host.querySelector('input[maxlength="1000"]');
    await input(window, field, "Retain this note");
    assert.equal(field.value, "Retain this note");
    await click(host, "Not ekle");
    assert.equal(field.readOnly, true, "pending note must reject new typing");
    await act(async () => { reject(new Error("note rejected")); });
    assert.equal(field.readOnly, false);
    assert.equal(field.value, "Retain this note");
    assert.match(host.textContent, /note rejected/);
    assert.equal(host.querySelector('[data-tone]').getAttribute("data-tone"), "neutral");
    const style = effectiveCss("components/orders/abandoned-cart-console.module.css", host.innerHTML, 'input[maxlength="1000"]', 390);
    assert.ok(parseFloat(style.minHeight) >= 44);
  });
});

test("coupon create rejection preserves all five fields and uses in-flow persistent feedback", async () => {
  const { PromotionCodes } = compile("components/promotions/PromotionCodes.tsx", { "@/lib/promotion-ui/client": { promotionErrorMessage: (value: string) => value, promotionApi: { detail: async () => ({ name: "QA", ruleDocument: { trigger: { kind: "automatic" } } }), listCodeBatches: async () => ({ items: [] }), createCodeBatch: async () => { throw new Error("Controlled rejection"); } } } });
  await mounted(PromotionCodes, { promotionId: "promotion-1", timezone: "Europe/Istanbul", canPublish: true, canExportCodes: false, storefrontOrigin: null }, async (host, window) => {
    const fields = [...host.querySelectorAll("fieldset input")];
    const values = ["12", "MIRA", "24", "2", "2027-01-01T12:30"];
    for (let index = 0; index < fields.length; index++) await input(window, fields[index], values[index]!);
    await click(host, "Kuponları oluştur");
    assert.match(host.textContent, /Controlled rejection/);
    assert.deepEqual(fields.map((field: any) => field.value), values);
    const feedback = host.querySelector('[role="status"]');
    assert.ok(feedback);
    for (const width of [390, 1024]) {
      const style = effectiveCss("components/promotions/promotion-studio.module.css", host.innerHTML, '[role="status"]', width);
      assert.ok(!["fixed", "absolute"].includes(style.position), "persistent feedback must participate in layout");
    }
  });
});

for (const orderCount of [0, 3]) test(`customer order history distinguishes empty from unavailable: ${orderCount}`, async () => {
  const { CustomerDetailPresentation } = compile("components/customers/CustomerDetailConsole.tsx");
  await mounted(CustomerDetailPresentation, { data: { id: "customer-1", displayName: "Customer", status: "active", orderCount, totalSpentCents: 0, currency: "TRY", tags: [], segments: [], addresses: [], notes: [], consents: [], createdAt: "2026-09-09T10:00:00Z", updatedAt: "2026-09-09T10:00:00Z" }, workspace: { orders: [], neighbors: {} }, tags: [], segments: [], canManage: false, canArchive: false }, async host => {
    if (orderCount) { assert.doesNotMatch(host.textContent, /bağlı sipariş bulunmuyor/); assert.match(host.textContent, /alınamadı|yüklenemedi|kullanılamıyor/); }
    else assert.match(host.textContent, /bağlı sipariş bulunmuyor/);
  });
});

for (const phase of ["error", "ready", "populated"] as const) test(`payment summary masks synthetic profiles when catalog ${phase}`, async () => {
  const entry = { ...PAYMENT_PROVIDER_CATALOG.find(item => item.providerCode === "iyzico_iframe")!, readiness: "sandbox_ready" };
  const profile = { id: "40000000-0000-4000-8000-000000000001", providerCode: "iyzico_iframe", capability: "payment_processing", publicConfig: { environment: "test" }, maskedAccountReference: "••••1234", status: "active", credentialVersion: 1, version: 1, lastValidatedAt: null, createdAt: "2026-09-09T10:00:00Z", updatedAt: "2026-09-09T10:00:00Z" };
  const { PaymentSettingsConsole } = compile("components/settings/payment/PaymentSettingsConsole.tsx", {
    "@/lib/payment-method-ui/client": { PaymentMethodApiError: Error, paymentMethodApi: { list: async () => [], catalog: async () => { if (phase === "error") throw new Error("catalog unavailable"); return phase === "populated" ? [entry] : []; } } },
    "@/lib/provider-execution-ui/client": { providerExecutionApi: { definitions: async () => { if (phase !== "populated") throw new Error("must be skipped"); return []; }, profiles: async () => { if (phase !== "populated") throw new Error("must be skipped"); return [profile]; } } },
  });
  await mounted(PaymentSettingsConsole, { canManage: false, storefrontHostname: null }, async host => {
    const metric = [...host.querySelectorAll("dt")].find((node: any) => node.textContent === "Sağlayıcı bağlantısı") as any;
    assert.ok(metric);
    assert.equal(metric.nextElementSibling.textContent, phase === "error" ? "—" : phase === "populated" ? "1" : "0");
  });
});

test("draft editor line input groups use the warm canvas", () => {
  const style = effectiveCss("components/orders/order-drafts.module.css", '<div class="editorWorkspace"><div class="lineRow"></div></div>', ".lineRow");
  assert.equal(style.backgroundColor, "#F8F7F5");
});

test("Toshi exposes a semantic h1 without another visible hero", async () => {
  const { ToshiWorkspace } = compile("components/toshi/ToshiWorkspace.tsx", { "./ToshiAssistant": { ToshiAssistant: () => null } });
  await mounted(ToshiWorkspace, {}, async host => {
    assert.equal(host.querySelectorAll("h1").length, 1);
    const style = effectiveCss("components/toshi/toshi.module.css", host.innerHTML, "h1");
    assert.equal(style.position, "absolute");
    assert.equal(style.width, "1px");
  });
});
test("product create keeps its h1 semantic while the shared route owns visible identity", async () => {
  const { ProductCreateForm } = compile("components/catalog/ProductCreateForm.tsx", {
    "@/lib/catalog-onboarding-ui/client": { CatalogOnboardingApiError: Error, catalogOnboardingClient: { getOptions: async () => null } },
    "@/components/catalog-onboarding/ProductQuickCreateDialog": { ProductQuickCreateDialog: () => null },
    "@/components/catalog-onboarding/ProductAdvancedEditor": { ProductAdvancedEditor: () => null },
  });
  await mounted(ProductCreateForm, {}, async host => {
    assert.equal(host.querySelectorAll("h1").length, 1);
    const style = effectiveCss("components/catalog-onboarding/product-onboarding.module.css", host.innerHTML, "h1");
    assert.equal(style.position, "absolute");
    assert.equal(style.width, "1px");
  });
});

for (const width of [390, 1024]) test(`promotion template entry and next/back focus scroll use header clearance at ${width}px`, async () => {
  const { PromotionEditor } = compile("components/promotions/PromotionEditor.tsx", { "@/lib/promotion-ui/client": { PromotionTargetPageLoader, promotionApi: { targets: async () => ({ items: [], nextCursor: null }), resolveTargets: async () => [] }, promotionErrorMessage: (value: string) => value } });
  // Track the actual element effect, without simulating browser geometry.
  const calls: any[] = [];
  await mounted(PromotionEditor, { templateId: "first_paid_order_percentage", timezone: "Europe/Istanbul", canManage: true, canPublish: false, canArchive: false }, async (host, window) => {
    const editor = host.querySelector('[aria-label="Kampanya düzenleme adımı"]');
    assert.equal(calls.length, 1, "template entry must reveal the editor start");
    const field = host.querySelector('input[maxlength="200"]');
    await input(window, field, "Retained wizard name");
    await click(host, "Devam et");
    await click(host, "Geri");
    assert.equal(host.querySelector('input[maxlength="200"]').value, "Retained wizard name");
    assert.equal(window.document.activeElement, editor);
    assert.equal(calls.length, 3, "each step navigation must reveal its start");
    assert.ok(calls.every(options => options.block === "start"));
    const style = effectiveCss("components/promotions/promotion-studio.module.css", host.innerHTML, '[aria-label="Kampanya düzenleme adımı"]', width);
    assert.ok(parseFloat(style.scrollMarginTop) >= 88, "focused step must clear local topbar");
  }, window => { window.HTMLElement.prototype.scrollIntoView = function(options: any) { calls.push(options); }; });
});
