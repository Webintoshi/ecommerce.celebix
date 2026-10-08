import assert from "node:assert/strict";
import test from "node:test";

const module = await import("./google-marketing.ts").catch(() => null);
const STORE = "11111111-1111-4111-8111-111111111111";
const ORDER = "22222222-2222-4222-8222-222222222222";
const projection = { gtmContainerId: "GTM-ABC123", ads: { tagId: "AW-123456", conversionLabel: "purchase_Label" }, verificationToken: null };
function fixture(hostname = "shop.example.com") {
  const storage = new Map<string, string>(), scripts: Array<Record<string, unknown>> = [];
  const browser = { location: new URL(`https://${hostname}/checkout/payment/result`), dataLayer: [] as unknown[],
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } },
    document: { cookie: "", createElement: () => { const script: Record<string, unknown> = { remove() { script.removed = true; } }; return script; }, head: { appendChild: (script: Record<string, unknown>) => { scripts.push(script); } } },
  };
  return { browser, scripts, storage };
}
function client(f = fixture(), selected = projection) {
  assert.equal(typeof module?.createGoogleMarketingClient, "function", "Google marketing consent runtime must exist");
  return { f, manager: module!.createGoogleMarketingClient({ storeId: STORE, hostname: "shop.example.com", nonce: "validNonce123456789", projection: selected, browser: f.browser as never }) };
}
test("undecided and declined consent never load Google or queue commerce", () => {
  const { f, manager } = client();
  assert.equal(manager.consent(), "undecided");
  assert.equal(manager.commerce({ name: "product_view", data: { productId: ORDER } }), false);
  manager.setConsent("denied");
  assert.equal(f.scripts.length, 0);
  assert.equal(f.browser.dataLayer.some((entry) => (entry as { event?: string }).event === "view_item"), false);
  const first = Array.from(f.browser.dataLayer[0] as ArrayLike<unknown>);
  assert.deepEqual(first.slice(0, 2), ["consent", "default"]);
  assert.equal((first[2] as { ad_storage: string }).ad_storage, "denied");
});
test("acceptance loads exactly one nonce-bearing GTM runtime after denied defaults", () => {
  const { f, manager } = client(); manager.setConsent("granted"); manager.setConsent("granted");
  assert.equal(f.scripts.length, 1); assert.equal(f.scripts[0]?.src, "https://www.googletagmanager.com/gtm.js?id=GTM-ABC123");
  assert.equal(f.scripts[0]?.nonce, "validNonce123456789");
  assert.ok(f.browser.dataLayer.some((entry) => (entry as Record<string, unknown>)["gtm.blocklist"]));
});
test("Ads-only stores use their actual AW tag and inactive stores load nothing", () => {
  const ads = client(fixture(), { ...projection, gtmContainerId: null } as never); ads.manager.setConsent("granted");
  assert.equal(ads.f.scripts[0]?.src, "https://www.googletagmanager.com/gtag/js?id=AW-123456");
  const empty = client(fixture(), { gtmContainerId: null, ads: null, verificationToken: "verification" } as never); empty.manager.setConsent("granted"); assert.equal(empty.f.scripts.length, 0);
});
test("withdrawal gates further commerce and removes the runtime", () => {
  const { f, manager } = client(); manager.setConsent("granted"); (f.scripts[0]!.onload as () => void)(); manager.setConsent("denied");
  assert.equal(f.scripts[0]!.removed, true); assert.equal(manager.commerce({ name: "begin_checkout", data: {} }), false);
  assert.equal(manager.purchase({ transactionId: ORDER, valueCents: 1250, currency: "TRY" }), false);
  assert.equal(manager.consent(), "denied");
});
test("only confirmed purchase DTOs produce real value with persistent transaction dedup", () => {
  const { f, manager } = client(); manager.setConsent("granted");
  assert.equal(manager.purchase({ transactionId: ORDER, valueCents: 1250, currency: "TRY" }), false, "failed or pending loader cannot consume conversion");
  (f.scripts[0]!.onload as () => void)();
  for (const bad of [null, { status: "paid" }, { transactionId: ORDER, valueCents: -1, currency: "TRY" }, { transactionId: ORDER, valueCents: 1250, currency: "TRY", email: "private@example.com" }]) assert.equal(manager.purchase(bad), false);
  assert.equal(manager.purchase({ transactionId: ORDER, valueCents: 1250, currency: "TRY" }), true);
  assert.equal(manager.purchase({ transactionId: ORDER, valueCents: 1250, currency: "TRY" }), false);
  assert.deepEqual(f.browser.dataLayer.find((entry) => (entry as { event?: string }).event === "purchase"), { event: "purchase", transaction_id: ORDER, value: 12.5, currency: "TRY" });
  const reloaded = client(f); (f.scripts.at(-1)!.onload as () => void)(); assert.equal(reloaded.manager.purchase({ transactionId: ORDER, valueCents: 1250, currency: "TRY" }), false);
});
test("managed Ads purchase is tied to current public destination and stops on Ads disconnect", () => {
  const connected = client(); connected.manager.setConsent("granted"); (connected.f.scripts[0]!.onload as () => void)();
  connected.manager.purchase({ transactionId: ORDER, valueCents: 1250, currency: "TRY" });
  assert.deepEqual(connected.f.browser.dataLayer.at(-1), { event: "celebix_paid_web_purchase", google_ads_destination: "AW-123456/purchase_Label", transaction_id: ORDER, value: 12.5, currency: "TRY" });
  const disconnected = client(fixture(), { ...projection, ads: null } as never); disconnected.manager.setConsent("granted"); (disconnected.f.scripts[0]!.onload as () => void)();
  disconnected.manager.purchase({ transactionId: ORDER, valueCents: 1250, currency: "TRY" });
  assert.equal(disconnected.f.browser.dataLayer.some((entry) => (entry as { event?: string }).event === "celebix_paid_web_purchase"), false);
  assert.equal(disconnected.f.browser.dataLayer.some((entry) => (entry as { event?: string }).event === "purchase"), true);
});
test("commerce mapping only carries approved product data, never PII", () => {
  const { f, manager } = client(); manager.setConsent("granted"); (f.scripts[0]!.onload as () => void)();
  assert.equal(manager.commerce({ name: "product_view", data: { productId: ORDER, currency: "TRY", valueMinor: 9900 } }), true);
  assert.deepEqual(f.browser.dataLayer.at(-1), { event: "view_item", currency: "TRY", value: 99, items: [{ item_id: ORDER, price: 99 }] });
  assert.equal(manager.commerce({ name: "product_view", data: { productId: ORDER, email: "private@example.com" } } as never), false);
  assert.doesNotMatch(JSON.stringify(f.browser.dataLayer), /private@example/);
});
test("approved commerce during script loading is bounded and flushed after load, withdrawal discards it", () => {
  const { f, manager } = client(); manager.setConsent("granted");
  for (let index = 0; index < 55; index++) assert.equal(manager.commerce({ name: "add_to_cart", data: { productId: ORDER, quantity: 1 } }), true);
  assert.equal(f.browser.dataLayer.some((entry) => (entry as { event?: string }).event === "add_to_cart"), false);
  (f.scripts[0]!.onload as () => void)();
  assert.equal(f.browser.dataLayer.filter((entry) => (entry as { event?: string }).event === "add_to_cart").length, 50);
  const withdrawn = client(); withdrawn.manager.setConsent("granted");
  assert.equal(withdrawn.manager.commerce({ name: "product_view", data: { productId: ORDER } }), true);
  withdrawn.manager.setConsent("denied"); withdrawn.manager.setConsent("granted");
  (withdrawn.f.scripts.at(-1)!.onload as () => void)();
  assert.equal(withdrawn.f.browser.dataLayer.some((entry) => (entry as { event?: string }).event === "view_item"), false);
});
test("cross-host and invalid projections never create a Google loader", () => {
  const cross = client(fixture("other.example.com")); cross.manager.setConsent("granted"); assert.equal(cross.f.scripts.length, 0);
  const bad = client(fixture(), { ...projection, gtmContainerId: "GTM-ABC123&evil=1" }); bad.manager.setConsent("granted"); assert.equal(bad.f.scripts.length, 0);
});
test("Google CSP is finite and excludes arbitrary scripts, eval and wildcard origins", () => {
  assert.equal(typeof module?.googleMarketingCspSources, "function");
  const sources = module!.googleMarketingCspSources(projection);
  assert.ok(sources.connect.includes("https://www.googleadservices.com"));
  assert.deepEqual(module!.googleMarketingCspSources({ gtmContainerId: null, ads: null, verificationToken: null }), { script: [], connect: [], image: [], frame: [] });
  assert.doesNotMatch(JSON.stringify(sources), /\*|unsafe-eval|http:|attacker/);
});
test("disposing a started client disables saved callbacks and commerce without revoking stored consent", () => {
  const { f, manager } = client(); let calls = 0;
  assert.equal(manager.hasStarted(), false);
  manager.onReady(() => { calls++; }); manager.setConsent("granted");
  assert.equal(manager.hasStarted(), true);
  const lateLoad = f.scripts[0]!.onload as () => void;
  manager.commerce({ name: "add_to_cart", data: { productId: ORDER } }); manager.dispose();
  assert.equal(f.scripts[0]!.removed, true);
  assert.equal(manager.hasStarted(), true);
  const before = f.browser.dataLayer.length;
  lateLoad(); manager.setConsent("granted"); manager.onReady(() => { calls++; });
  assert.equal(calls, 0); assert.equal(f.scripts.length, 1); assert.equal(f.browser.dataLayer.length, before);
  assert.equal(manager.commerce({ name: "product_view", data: { productId: ORDER } }), false);
  assert.equal(manager.purchase({ transactionId: ORDER, valueCents: 1250, currency: "TRY" }), false);
  assert.equal(JSON.parse(f.storage.get(`celebix:google-consent:v1:${STORE}:shop.example.com`)!).value, "granted");
});
