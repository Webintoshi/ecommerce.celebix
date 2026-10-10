import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";
import { wheelAward, wheelCampaign } from "../lib/lucky-wheel/test-utils.ts";
import { LuckyWheelClientError } from "../lib/lucky-wheel/client.ts";

async function fixture(run: (value: { container: HTMLElement; click(selector: string): Promise<void>; spins: unknown[]; applied: string[]; close(): void; reopen(): Promise<void> }) => Promise<void>, options: { uncertain?: boolean; expired?: boolean; saved?: boolean; count?: number; repeatEligible?: boolean; dark?: boolean; refreshMode?: "email" | "phone" } = {}) {
  const spins: unknown[] = [], applied: string[] = []; let failures = 0;
  const selectedAward = options.repeatEligible ? { ...wheelAward, repeatEligibleAt: "2026-10-09T12:00:00.000Z" } : options.expired ? { ...wheelAward, expiresAt: "2026-10-10T13:00:00.000Z", couponStatus: "expired" as const } : wheelAward;
  let award = options.saved ? selectedAward : null;
  const load = componentLoader({ "../lib/lucky-wheel/client.ts": { ...await import("../lib/lucky-wheel/client.ts"), createLuckyWheelClient: () => ({ spin: async (input: unknown) => { spins.push(input); if (options.refreshMode && failures++ === 0) throw new LuckyWheelClientError("version_conflict"); award = selectedAward; if (options.uncertain && failures++ === 0) throw Error("timeout"); return selectedAward; }, result: async () => award, settings: async () => ({ campaign: { ...wheelCampaign(), version: 2, collectMode: options.refreshMode, marketingOptInLabel: "Yeni kampanya izni metni" } }) }) } });
  const { LuckyWheel } = load<{ LuckyWheel: React.ComponentType<Record<string, unknown>> }>(new URL("./LuckyWheel.tsx", import.meta.url));
  await withProductBrowser(async ({ container, render, click }) => {
    const previous = globalThis.HTMLElement; Object.assign(globalThis, { HTMLElement: window.HTMLElement }); window.matchMedia = () => ({ matches: true }) as MediaQueryList;
    let visible = true; const baseCampaign = { ...wheelCampaign(options.count), ...(options.refreshMode ? { collectMode: "email" as const } : {}) }, selectedCampaign = options.dark ? { ...baseCampaign, appearance: { ...baseCampaign.appearance, background: "#101010" } } : baseCampaign; const element = () => visible ? React.createElement(LuckyWheel, { campaign: selectedCampaign, storefrontId: "store", storefrontName: "Mağaza", onClose: () => { visible = false; }, applyCoupon: async (code: string) => { applied.push(code); return "Kod hazır"; } }) : null;
    const settle = async () => { await React.act(async () => { await new Promise(resolve => window.setTimeout(resolve, 35)); }); };
    try { await render(element()); await settle(); await run({ container, click, spins, applied, close() { visible = false; }, reopen: async () => { visible = false; await render(null); visible = true; await render(element()); await settle(); } }); } finally { Object.assign(globalThis, { HTMLElement: previous }); }
  });
}
test("wheel requires contact with unchecked optional consent, shows actual odds and conditions", async () => {
  await fixture(async ({ container, click, spins }) => {
    assert.equal(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked, false);
    assert.ok(container.textContent?.includes("%25")); assert.ok(container.textContent?.includes("100,00"));
    await click('button[type="submit"]'); assert.equal(spins.length, 0); assert.ok(container.querySelector('[role="alert"]'));
    const input = container.querySelector<HTMLInputElement>('input[type="email"]')!;
    await React.act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!.call(input, "ada@example.test"); input.dispatchEvent(new window.Event("input", { bubbles: true })); });
    await click('button[type="submit"]'); assert.equal(spins.length, 1); assert.equal((spins[0] as Record<string, unknown>).marketingConsent, false);
    assert.ok(container.textContent?.includes(wheelAward.couponCode)); assert.equal(container.querySelector('[data-wheel-prize]')?.getAttribute("data-wheel-prize"), wheelAward.prizeId);
  });
});
test("closing an uncertain reply then reopening retrieves saved server award without another spin", async () => {
  await fixture(async ({ container, click, spins, reopen }) => {
    const input = container.querySelector<HTMLInputElement>('input[type="email"]')!;
    await React.act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!.call(input, "ada@example.test"); input.dispatchEvent(new window.Event("input", { bubbles: true })); });
    await click('button[type="submit"]'); assert.ok(container.querySelector('[role="alert"]')); await reopen();
    assert.equal(spins.length, 1); assert.ok(container.textContent?.includes(wheelAward.couponCode));
  }, { uncertain: true });
});
test("expired stored award shows truthful status and disables coupon application", async () => {
  await fixture(async ({ container, applied }) => { assert.ok(container.textContent?.includes("sona erdi")); assert.equal(container.querySelector('[data-wheel-apply]'), null); assert.deepEqual(applied, []); }, { expired: true, saved: true });
});
test("wheel uses the same fixed pointer and accessible modal at 4, 6 and 8 prizes", async () => {
  for (const count of [4, 6, 8]) await fixture(async ({ container }) => { assert.equal(container.querySelectorAll('[data-wheel-slice]').length, count); assert.ok(container.querySelector('[data-wheel-pointer]')); assert.equal(container.querySelector('[role="dialog"]')?.getAttribute("aria-modal"), "true"); }, { count });
});
test("recovered award offers fresh contact participation when browser window has ended", async () => {
  await fixture(async ({ container, click }) => { assert.ok(container.querySelector("[data-wheel-new-participation]")); await click("[data-wheel-new-participation]"); assert.ok(container.querySelector('input[type="email"]')); assert.equal(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked, false); }, { saved: true, repeatEligible: true });
});
test("dark custom campaign background uses readable contrasting body text", async () => { await fixture(async ({ container }) => { assert.equal((container.querySelector('[data-lucky-wheel]') as HTMLElement).style.getPropertyValue("--wheel-ink"), "#ffffff"); }, { dark: true }); });
test("SVG geometry uses bounded decimal coordinates for stable server and browser hydration", async () => { await fixture(async ({ container }) => { for (const element of container.querySelectorAll('[data-wheel-slice] path, [data-wheel-slice] text')) { assert.equal(/\d\.\d{4,}/.test(element.getAttribute("d") ?? element.getAttribute("transform") ?? ""), false); } }, { count: 6 }); });
test("version refresh to phone-only replaces incompatible email field and allows the next spin", async () => {
  await fixture(async ({ container, click, spins }) => {
    const enter = async (type: string, value: string) => { const input = container.querySelector<HTMLInputElement>(`input[type="${type}"]`)!; await React.act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!.call(input, value); input.dispatchEvent(new window.Event("input", { bubbles: true })); }); };
    await enter("email", "ada@example.test"); await click('input[type="checkbox"]'); await click('button[type="submit"]');
    assert.equal(Boolean(container.querySelector('input[type="email"]')), false); assert.equal(container.querySelector<HTMLInputElement>('input[type="tel"]')!.value, ""); assert.equal(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked, false);
    await enter("tel", "05551234567"); await click('button[type="submit"]'); assert.equal(spins.length, 2); assert.equal((spins[1] as Record<string, unknown>).phone, "+905551234567"); assert.equal((spins[1] as Record<string, unknown>).expectedVersion, 2); assert.equal((spins[1] as Record<string, unknown>).marketingConsent, false);
  }, { refreshMode: "phone" });
});
test("version refresh preserves compatible contact while changed permission wording resets consent", async () => {
  await fixture(async ({ container, click }) => { const input = container.querySelector<HTMLInputElement>('input[type="email"]')!; await React.act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!.call(input, "ada@example.test"); input.dispatchEvent(new window.Event("input", { bubbles: true })); }); await click('input[type="checkbox"]'); await click('button[type="submit"]'); assert.equal(container.querySelector<HTMLInputElement>('input[type="email"]')!.value, "ada@example.test"); assert.equal(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked, false); }, { refreshMode: "email" });
});
