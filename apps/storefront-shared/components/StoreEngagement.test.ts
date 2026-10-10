import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";
import { parseStoreEngagementCaptureRequest, type PublicCart, type StoreEngagementPublicCampaign } from "@celebix/saas-contracts";
import { wheelAward } from "../lib/lucky-wheel/test-utils.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const cart = { version: 1, currency: "TRY", itemCount: 1, subtotalCents: 100, shippingCents: 0, totalCents: 100, checkoutReady: true, checkoutBlocker: null, items: [] } as unknown as PublicCart;
const campaign = (kind: "popup" | "cart_capture" = "cart_capture"): StoreEngagementPublicCampaign => ({ id: "20000000-0000-4000-8000-000000000001", kind, name: "Merhaba", enabled: true, version: 1, config: { schemaVersion: 1, template: "minimal", heading: "Sepetinizi saklayalım", body: "Alışverişinize daha sonra devam edebilirsiniz.", buttonLabel: "Devam et", delaySeconds: 0, repeatDays: 7, devices: { desktop: true, mobile: true }, collectMode: "email", marketingOptInLabel: "Kampanya haberlerini almak istiyorum" }, imageUrl: null, couponCode: null, updatedAt: "2026-10-04T10:00:00.000Z" });
type Bridge = { registerEngagementCart(value: { storefrontId: string; getCart(): PublicCart; closeDrawerAndWait(): Promise<boolean> }): () => void; notifySuccessfulCartAdd(cart: PublicCart): void; readPendingCoupon(id: string): string | null; rememberPendingWheelCoupon(id: string, award: typeof wheelAward): void; acquireEngagementModal(owner: symbol): boolean; releaseEngagementModal(owner: symbol): void };
async function settle(ms = 35) { await React.act(async () => { await new Promise(resolve => window.setTimeout(resolve, ms)); }); }
async function fixture(run: (value: { container: HTMLElement; trigger: HTMLElement; click(selector: string): Promise<void>; add(): Promise<void>; releaseSettings(): Promise<void>; releaseAccount(): Promise<void>; releaseCapture(): Promise<void>; pendingCoupon(): string | null; renderRoute(pathname: string): Promise<void>; captures: Array<Record<string, unknown>>; quoteCalls: string[][]; bridge: Bridge }) => Promise<void>, options: { authenticated?: boolean; sameRoute?: boolean; popup?: boolean; failCapture?: boolean; theme?: string; delayedSettings?: boolean; delayedAccount?: boolean; delayedCapture?: boolean; emptyCart?: boolean; mobileDisabled?: boolean; width?: number; delaySeconds?: number; template?: "minimal" | "image_left" | "discount"; ineligible?: boolean; revoked?: boolean } = {}) {
  const captures: Array<Record<string, unknown>> = [], quoteCalls: string[][] = [];
  let attempts = 0;
  const base = campaign(options.popup ? "popup" : "cart_capture");
  const selected = { ...base, config: { ...base.config, delaySeconds: options.delaySeconds ?? 0, template: options.template ?? "minimal", devices: { desktop: true, mobile: !options.mobileDisabled } }, imageUrl: options.template === "image_left" ? "https://media.example/banner.jpg" : null, couponCode: options.popup ? "MERHABA10" : null };
  const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
  const settingsGate = gate(), accountGate = gate(), captureGate = gate();
  let currentCart = options.emptyCart ? { ...cart, itemCount: 0 } : cart;
  const load = componentLoader({
    "next/navigation": { usePathname: () => window.location.pathname },
    "../lib/engagement/client.ts": { prepareEngagementContact: parseStoreEngagementCaptureRequest, StoreEngagementClientError: Error, createStoreEngagementClient: () => ({ settings: async () => { if (options.delayedSettings) await settingsGate.promise; return { popups: options.popup ? [selected] : [], cartCapture: options.popup ? null : selected }; }, accountSession: async () => { if (options.delayedAccount) await accountGate.promise; return options.authenticated ? "authenticated" : "anonymous"; }, captureContact: async (input: Record<string, unknown>) => { captures.push(input); if (options.delayedCapture) await captureGate.promise; attempts++; if (options.failCapture && attempts === 1) throw Error("request_failed"); return { contactCaptured: true, couponCode: "MERHABA10" }; } }) },
    "../lib/cart/client.ts": { storefrontCartClient: { quotePromotionsWithDigest: async (_intent: string, codes: string[]) => { quoteCalls.push(codes); return { quote: { rejectedPromotions: options.ineligible ? codes.map(normalizedCode => ({ normalizedCode, reason: "not_eligible" })) : [] } }; } } },
    "../lib/lucky-wheel/client.ts": { createLuckyWheelClient: () => ({ settings: async () => ({ campaign: null }), result: async () => ({ ...wheelAward, couponStatus: options.revoked ? "revoked" : "active" }) }) },
  });
  const module = load<{ StoreEngagement: React.ComponentType<{ storefrontId: string; storefrontName: string; brandColor: string }> }>(new URL("./StoreEngagement.tsx", import.meta.url));
  const bridge = load<Bridge>(new URL("../lib/engagement/integration.ts", import.meta.url));
  await withProductBrowser(async ({ container, render, click }) => {
    const previous = globalThis.HTMLElement; Object.assign(globalThis, { HTMLElement: window.HTMLElement });
    if (options.width) (window as unknown as { happyDOM: { setWindowSize(size: { width: number; height: number }): void } }).happyDOM.setWindowSize({ width: options.width, height: 900 });
    document.body.dataset.theme = options.theme ?? "guzide-deniz";
    const trigger = document.createElement("button"); trigger.textContent = "Ürün"; document.body.append(trigger); trigger.focus();
    const retire = bridge.registerEngagementCart({ storefrontId: STORE, getCart: () => currentCart, closeDrawerAndWait: async () => options.sameRoute !== false });
    const element = React.createElement(module.StoreEngagement, { storefrontId: STORE, storefrontName: "Mağaza", brandColor: "#193e32" });
    try {
      await render(element); await settle();
      const release = async (selected: { release(): void }) => { await React.act(async () => selected.release()); await settle(); await settle(); };
      await run({ container, trigger, click, captures, quoteCalls, bridge, pendingCoupon: () => bridge.readPendingCoupon(STORE), releaseSettings: () => release(settingsGate), releaseAccount: () => release(accountGate), releaseCapture: () => release(captureGate), add: async () => { currentCart = cart; await React.act(async () => bridge.notifySuccessfulCartAdd(cart)); await settle(); await settle(); }, renderRoute: async pathname => { window.history.replaceState(null, "", pathname); await render(React.cloneElement(element)); await settle(); } });
    } finally { retire(); Object.assign(globalThis, { HTMLElement: previous }); }
  });
}
test("all four storefronts show capture only after a successful add, with optional unchecked marketing and accessible cancel", async () => {
  for (const theme of ["guzide-deniz", "siora-deniz", "alpler-deniz", "lilyum-deniz"]) await fixture(async ({ container, add, click }) => {
    assert.equal(container.querySelector('[role="dialog"]'), null, "cart load and quantity changes do not show capture");
    await add(); assert.ok(container.querySelector('[role="dialog"]'));
    assert.equal(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked, false);
    await click('button[data-engagement-dismiss]'); assert.equal(container.querySelector('[role="dialog"]'), null);
    await add(); assert.equal(container.querySelector('[role="dialog"]'), null, "cancel does not repeat on subsequent additions");
  }, { theme });
});
test("authenticated visitors, checkout/account routes and a raced drawer close never open capture", async () => {
  await fixture(async ({ container, add }) => { await add(); assert.equal(container.querySelector('[role="dialog"]'), null); }, { authenticated: true });
  await fixture(async ({ container, add }) => { await add(); assert.equal(container.querySelector('[role="dialog"]'), null); }, { sameRoute: false });
  await fixture(async ({ container, add, renderRoute }) => { await renderRoute("/checkout"); await add(); assert.equal(container.querySelector('[role="dialog"]'), null); await renderRoute("/account/login"); await add(); assert.equal(container.querySelector('[role="dialog"]'), null); });
});
test("capture retry keeps entered contact and operation identity, and applies only the server coupon", async () => {
  await fixture(async ({ container, add, click, captures, quoteCalls }) => {
    await add();
    const input = container.querySelector<HTMLInputElement>('input[type="email"]')!;
    await React.act(async () => { const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set; setter?.call(input, "ada@example.com"); input.dispatchEvent(new window.Event("input", { bubbles: true })); });
    await click('button[type="submit"]'); await settle();
    assert.equal(input.value, "ada@example.com"); assert.ok(container.querySelector('[role="alert"]'));
    await click('button[type="submit"]'); await settle();
    assert.equal(captures.length, 2); assert.equal(captures[0].operationId, captures[1].operationId);
    assert.equal(captures[0].marketingConsent, false); assert.deepEqual(quoteCalls, [["MERHABA10"]]);
    assert.ok(container.textContent?.includes("MERHABA10"));
  }, { failCapture: true });
});
test("normal popup is promotional, Escape restores focus and never posts a contact", async () => {
  await fixture(async ({ container, captures, trigger }) => {
    assert.ok(container.querySelector('[role="dialog"]')); assert.equal(container.querySelector("input"), null);
    await React.act(async () => document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(container.querySelector('[role="dialog"]'), null); assert.deepEqual(captures, []);
    assert.equal(document.body.style.overflow, "");
    await settle(); assert.equal(document.activeElement, trigger);
  }, { popup: true });
});
test("an open popup holds the engagement modal lease until dismissal", async () => {
  await fixture(async ({ container, click, bridge }) => {
    assert.ok(container.querySelector('[role="dialog"]'));
    const owner = Symbol("wheel");
    assert.equal(bridge.acquireEngagementModal(owner), false);
    await click('button[data-engagement-dismiss]');
    assert.equal(bridge.acquireEngagementModal(owner), true); bridge.releaseEngagementModal(owner);
  }, { popup: true });
});
test("successful add waits for delayed public configuration and account session without showing a form too soon", async () => {
  await fixture(async ({ container, add, releaseSettings, releaseAccount }) => {
    await add(); assert.equal(container.querySelector('[role="dialog"]'), null);
    await releaseSettings(); assert.equal(container.querySelector('[role="dialog"]'), null);
    await releaseAccount(); assert.ok(container.querySelector('form'));
  }, { delayedSettings: true, delayedAccount: true });
  await fixture(async ({ container, add, releaseAccount }) => {
    await add(); assert.equal(container.querySelector('[role="dialog"]'), null);
    await releaseAccount(); assert.equal(container.querySelector('[role="dialog"]'), null);
  }, { delayedAccount: true, authenticated: true });
});
test("a second successful add cannot cancel the capture delay scheduled by the first add", async () => {
  await fixture(async ({ container, add }) => {
    await add(); await add(); assert.equal(container.querySelector('[role="dialog"]'), null);
    await settle(1100); await settle(); assert.ok(container.querySelector("form"));
  }, { delaySeconds: 1 });
});
test("empty cart promotional coupon is remembered without a quote and applied once after the first accepted add", async () => {
  await fixture(async ({ container, click, quoteCalls, pendingCoupon, add }) => {
    assert.ok(container.querySelector('[role="dialog"]')); await click('button.primary'); await settle();
    assert.deepEqual(quoteCalls, []); assert.equal(pendingCoupon(), "MERHABA10");
    await click('button[data-engagement-dismiss]'); await add();
    assert.deepEqual(quoteCalls, [["MERHABA10"]]); assert.equal(pendingCoupon(), null);
    await add(); assert.deepEqual(quoteCalls, [["MERHABA10"]]);
  }, { popup: true, emptyCart: true });
});
test("empty-cart wheel code survives minimum-basket rejection then requotes on later add; revoked code is cleared", async () => {
  for (const revoked of [false, true]) await fixture(async ({ bridge, add, pendingCoupon, quoteCalls }) => { bridge.rememberPendingWheelCoupon(STORE, wheelAward); assert.equal(pendingCoupon(), wheelAward.couponCode); assert.deepEqual(quoteCalls, []); await add(); assert.equal(pendingCoupon(), revoked ? null : wheelAward.couponCode); await add(); assert.equal(quoteCalls.length, revoked ? 1 : 2); }, { emptyCart: true, ineligible: true, revoked });
});
test("double submit makes one contact command while pending, with cancel always available", async () => {
  await fixture(async ({ container, add, captures, releaseCapture, click }) => {
    await add(); const input = container.querySelector<HTMLInputElement>('input[type="email"]')!;
    await React.act(async () => { const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set; setter?.call(input, "ada@example.com"); input.dispatchEvent(new window.Event("input", { bubbles: true })); });
    await React.act(async () => { const form = container.querySelector("form")!; form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.equal(captures.length, 1); assert.equal(input.disabled, true);
    assert.equal(container.querySelector<HTMLButtonElement>('button.secondary')?.disabled, false);
    await click('button.secondary'); assert.equal(container.querySelector('[role="dialog"]'), null);
    await releaseCapture(); assert.equal(container.querySelector('[role="dialog"]'), null);
    await add(); assert.equal(container.querySelector('[role="dialog"]'), null);
  }, { delayedCapture: true });
});
test("templates use safe resolved image and mobile device selection", async () => {
  for (const template of ["minimal", "image_left", "discount"] as const) await fixture(async ({ container }) => {
    assert.equal(container.querySelector('[role="dialog"]')?.getAttribute("data-template"), template);
    assert.equal(container.querySelector("img")?.getAttribute("src") ?? null, template === "image_left" ? "https://media.example/banner.jpg" : null);
  }, { popup: true, template, width: 390 });
  await fixture(async ({ container, add }) => { await add(); assert.equal(container.querySelector('[role="dialog"]'), null); }, { width: 390, mobileDisabled: true });
});
test("the runtime outside the real four-theme provider closes its drawer and consumes owned history before opening capture", async () => {
  for (const visualTheme of ["guzide-deniz", "siora-deniz", "alpler-deniz", "lilyum-deniz"]) {
    let provider!: { CartStatusProvider: React.ComponentType<Record<string, unknown>>; useCartStatus(): { drawerOpen: boolean; openDrawer(trigger: HTMLElement): void; replaceCart(value: PublicCart): void } };
    const load = componentLoader({
      "next/navigation": { useRouter: () => ({ push() {} }), usePathname: () => window.location.pathname, useSearchParams: () => new URLSearchParams(window.location.search) },
      "@/lib/cart/client.ts": { storefrontCartClient: { resolve: async () => ({ ...cart, itemCount: 0 }) } },
      "./SideCartDrawer": { SideCartDrawer: () => provider.useCartStatus().drawerOpen ? React.createElement("dialog", { open: true, "aria-modal": true, "data-test-drawer": true }, "Sepet") : null },
      "../lib/engagement/client.ts": { createStoreEngagementClient: () => ({ settings: async () => ({ popups: [], cartCapture: campaign() }), accountSession: async () => "anonymous" }) },
      "../lib/cart/client.ts": { storefrontCartClient: { quotePromotionsWithDigest: async () => ({ quote: { rejectedPromotions: [] } }) } },
    });
    provider = load(new URL("./CartStatusProvider.tsx", import.meta.url));
    const { StoreEngagement } = load<{ StoreEngagement: React.ComponentType<{ storefrontId: string; storefrontName: string; brandColor: string }> }>(new URL("./StoreEngagement.tsx", import.meta.url));
    const bridge = load<Bridge>(new URL("../lib/engagement/integration.ts", import.meta.url));
    function Add() {
      const status = provider.useCartStatus();
      return React.createElement("button", { id: "add", onClick: (event: React.MouseEvent<HTMLButtonElement>) => { status.openDrawer(event.currentTarget); status.replaceCart(cart); bridge.notifySuccessfulCartAdd(cart); } }, "Ekle");
    }
    await withProductBrowser(async ({ container, render, click }) => {
      const previous = globalThis.HTMLElement; Object.assign(globalThis, { HTMLElement: window.HTMLElement });
      window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
      window.history.replaceState({ __NA: true, custom: "keep" }, "", "/products/one");
      try {
        await render(React.createElement(React.Fragment, null, React.createElement(provider.CartStatusProvider, { storefrontId: STORE, visualTheme, locale: "tr" }, React.createElement(Add)), React.createElement(StoreEngagement, { storefrontId: STORE, storefrontName: "Mağaza", brandColor: "#193e32" })));
        await settle(); await click("#add");
        for (let attempt = 0; attempt < 6 && !container.querySelector('[data-store-engagement]'); attempt++) await settle();
        assert.equal(container.querySelector('[data-test-drawer]'), null, visualTheme);
        assert.ok(container.querySelector('[data-store-engagement]'), `${visualTheme}: ${JSON.stringify(window.history.state)} ${container.textContent}`);
        assert.equal(container.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"]').length, 1, "only one modal remains");
        assert.equal(window.location.pathname, "/products/one"); assert.equal(window.history.state.custom, "keep");
        assert.equal(window.history.state.__celebixGuzidePanel, undefined); assert.equal(window.history.state.__celebixSioraPanel, undefined);
        await click('button[data-engagement-dismiss]'); await settle(); assert.equal(document.activeElement, container.querySelector("#add"));
      } finally { Object.assign(globalThis, { HTMLElement: previous }); }
    });
  }
});
