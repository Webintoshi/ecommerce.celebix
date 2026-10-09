import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import React from "react";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";
import * as promotionModel from "../lib/promotions/model.ts";
import * as routes from "../lib/storefront-routes.ts";
import * as deliveryValidation from "../lib/checkout-form.ts";
import { createStorefrontCartClient, StorefrontCartClientError } from "../lib/cart/client.ts";
import type { StorefrontCartClient } from "../lib/cart/types.ts";

const cart = {
  version: 1, currency: "TRY", itemCount: 1, subtotalCents: 10000, shippingCents: 0,
  totalCents: 10000, checkoutReady: true, checkoutBlocker: null,
  items: [{ productId: "10000000-0000-4000-8000-000000000001", variantId: "20000000-0000-4000-8000-000000000001", slug: "test", title: "Ürün", variantTitle: "M", quantity: 1, unitPriceCents: 10000, lineTotalCents: 10000, available: true }],
};
function response(codes: readonly string[]) {
  const discount = codes.includes("SAVE") ? 1000 : 0;
  const quote = {
      cart: { ...cart, totalCents: 10000 - discount, lineDiscountCents: discount, shippingDiscountCents: 0, discountCents: discount, items: cart.items.map(item => ({ ...item, discountCents: discount, payableCents: 10000 - discount })) },
      paymentMethods: [{ kind: "cash_on_delivery", label: "Kapıda ödeme", instructions: "Teslimatta ödeyin." }],
      promotionStatus: { kind: "evaluated" }, appliedPromotions: discount ? [{ name: "İndirim", normalizedCode: "SAVE", benefitKind: "fixed_amount", discountCents: discount, lineDiscountCents: discount, shippingDiscountCents: 0 }] : [],
      rejectedPromotions: codes.filter(code => code !== "SAVE").map(normalizedCode => ({ normalizedCode, reason: "invalid_code" })), gifts: [], progressMessages: [],
  };
  return { quote, quoteDigest: digest(quote) };
}
const digest = (quote: unknown) => createHash("sha256").update(JSON.stringify({ schemaVersion: 2, priceDigest: "c".repeat(64), publicQuote: quote })).digest("hex");
type Form = React.ComponentType<Record<string, unknown>>;
class FixtureCartClientError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}
function loadForm(quote: (_intent: string, codes: readonly string[]) => Promise<unknown>, options: Readonly<{ getCart?: () => typeof cart; startHosted?: StorefrontCartClient["startHosted"]; clientError?: typeof StorefrontCartClientError; bumpOffers?: unknown; add?: StorefrontCartClient["add"]; resolve?: StorefrontCartClient["resolve"]; replaceCart?: (value: unknown) => void }> = {}) {
  const load = componentLoader({
    "next/link": { __esModule: true, default: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("a", props, children) },
    "@/lib/cart/client.ts": { StorefrontCartClientError: options.clientError ?? FixtureCartClientError, storefrontCartClient: { quotePromotionsWithDigest: quote, startHosted: options.startHosted } },
    "@/lib/checkout-form.ts": deliveryValidation,
    "@/lib/format.ts": { formatTry: (cents: number) => `₺${cents / 100}` },
    "@/lib/promotions/model.ts": promotionModel,
    "@/lib/storefront-routes.ts": routes,
    "@/lib/analytics/events.ts": { emitStorefrontCommerceEvent() {}, couponAppliedEvent: () => null },
    "./CartStatusProvider": { useCartStatus: () => ({ cart: options.getCart?.() ?? cart, loading: false, replaceCart: options.replaceCart ?? (() => {}) }) },
    "../lib/cart/client.ts": { storefrontCartClient: { add: options.add, resolve: options.resolve } },
    "../lib/order-bumps/client.ts": { readOrderBumpOffers: async () => options.bumpOffers ?? { cartVersion: null, heading: null, offers: [] } },
    "./use-hydrated": { useHydrated: () => true },
  });
  return load<{ CheckoutForm: Form }>(new URL("./CheckoutForm.tsx", import.meta.url)).CheckoutForm;
}

test("checkout coupon application and removal re-quote the displayed total without submitting the order", async () => {
  const calls: string[][] = [];
  const Form = loadForm(async (_intent, codes) => { calls.push([...codes]); return response(codes); });
  await withProductBrowser(async ({ container, render, click, change }) => {
    await render(React.createElement(Form, { intentKind: "cart", visualTheme: "shared-checkout" }));
    assert.equal(container.querySelectorAll("form").length, 1, "coupon never nests another form");
    assert.ok(container.querySelector('input[name="coupon"]'), "coupon field is present in checkout");
    await change('input[name="coupon"]', "save");
    await click(".promotion-coupon-controls button");
    assert.deepEqual(calls, [[], ["SAVE"]]);
    assert.match(container.querySelector(".checkout-summary")?.textContent ?? "", /₺90/u);
    assert.equal(container.querySelector(".checkout-field-error"), null, "coupon does not submit delivery");
    await click(".promotion-coupon-list button");
    assert.deepEqual(calls, [[], ["SAVE"], []]);
    assert.match(container.querySelector(".checkout-summary")?.textContent ?? "", /₺100/u);
  });
});

const bumpOffer = { ruleId: "30000000-0000-4000-8000-000000000002", productId: "10000000-0000-4000-8000-000000000002", variantId: "20000000-0000-4000-8000-000000000002", slug: "tamamlayici", title: "Tamamlayıcı ürün", variantTitle: "Varsayılan", priceCents: 2500, currency: "TRY", media: null };
const bumpProjection = { cartVersion: 1, heading: "Birlikte iyi gider", offers: [bumpOffer] };
const validDraft = { firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", phone: "+14155552671", addressLine1: "Cadde 1", city: "İstanbul", district: "Kadıköy", postalCode: "34710", note: "" };

test("checkout acceptance fences the old digest until a fresh quote preserves coupon and delivery inputs", async () => {
  let finishAdd!: (value: typeof cart) => void;
  let finishQuote!: (value: unknown) => void;
  let updated = false;
  const calls: string[][] = [], additions: unknown[] = [];
  const extra = { ...cart.items[0], productId: bumpOffer.productId, variantId: bumpOffer.variantId, slug: bumpOffer.slug, title: bumpOffer.title, unitPriceCents: 2500, lineTotalCents: 2500 };
  const next = { ...cart, version: 2, itemCount: 2, items: [...cart.items, extra], subtotalCents: 12500, totalCents: 12500 };
  const Form = loadForm(async (_intent, codes) => { calls.push([...codes]); if (updated) return new Promise(resolve => { finishQuote = resolve; }); return response(codes); }, {
    bumpOffers: bumpProjection, add: async input => { additions.push(input); return new Promise(resolve => { finishAdd = resolve as never; }); }, replaceCart() { updated = true; },
  });
  await withProductBrowser(async ({ container, render, change, click }) => {
    await render(React.createElement(Form, { intentKind: "cart", initialDraft: validDraft, initialNormalizedCodes: ["SAVE"] }));
    await change('input[name="addressLine1"]', "Cadde 12");
    await click(".order-bump-add");
    assert.equal(container.querySelector<HTMLButtonElement>(".checkout-submit")?.disabled, true);
    assert.equal(container.querySelector<HTMLButtonElement>(".promotion-coupon-controls button")?.disabled, true);
    assert.doesNotMatch(container.querySelector(".checkout-summary")?.textContent ?? "", /₺90/u);
    await React.act(async () => finishAdd(next));
    assert.deepEqual(additions, [{ productId: bumpOffer.productId, variantId: bumpOffer.variantId, quantity: 1, expectedVersion: 1 }]);
    assert.deepEqual(calls, [["SAVE"], ["SAVE"]]);
    assert.equal(container.querySelector<HTMLButtonElement>(".checkout-submit")?.disabled, true);
    const selected = response(["SAVE"]); const quote = { ...selected.quote, cart: { ...selected.quote.cart, version: 2, itemCount: 2, items: [...selected.quote.cart.items, { ...extra, discountCents: 0, payableCents: 2500 }], subtotalCents: 12500, totalCents: 11500 } };
    await React.act(async () => finishQuote({ quote, quoteDigest: digest(quote) }));
    assert.match(container.querySelector(".checkout-summary")?.textContent ?? "", /₺115/u);
    assert.equal(container.querySelector<HTMLInputElement>('input[name="addressLine1"]')?.value, "Cadde 12");
    assert.equal(container.querySelector<HTMLButtonElement>(".checkout-submit")?.disabled, false);
  });
});

test("buy now never offers products for an unrelated normal cart", async () => {
  const Form = loadForm(async (_intent, codes) => response(codes), { bumpOffers: bumpProjection });
  await withProductBrowser(async ({ container, render }) => { await render(React.createElement(Form, { intentKind: "buy_now" })); assert.equal(container.querySelector(".order-bump-add"), null); });
});

test("an uncertain payment keeps its financial operation retrievable and fences new items and coupons", async () => {
  const submissions: unknown[] = [], additions: unknown[] = [];
  const hosted = () => { const selected = response([]); const quote = { ...selected.quote, paymentMethods: [{ id: "30000000-0000-4000-8000-000000000001", kind: "hosted_card", label: "Kart", instructions: "Güvenli ödeme", providerCode: "paytr_iframe", presentation: "iframe", requiredCustomerFields: [] }] }; return { quote, quoteDigest: digest(quote) }; };
  const Form = loadForm(async () => hosted(), { bumpOffers: bumpProjection, add: async input => { additions.push(input); return cart as never; }, startHosted: async input => { submissions.push(input); throw new FixtureCartClientError("request_failed"); } });
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(Form, { intentKind: "cart", initialDraft: validDraft }));
    await click(".checkout-submit"); await click(".order-bump-add");
    assert.deepEqual(additions, []); assert.equal(container.querySelector<HTMLButtonElement>(".promotion-coupon-controls button")?.disabled, true);
    assert.equal(container.querySelector<HTMLFieldSetElement>(".checkout-contact fieldset")?.disabled, true);
    await click(".checkout-submit"); assert.equal(submissions.length, 2); assert.deepEqual(submissions[1], submissions[0]);
  });
});

test("a later input rejection cannot clear an earlier uncertain financial attempt", async () => {
  let attempts = 0;
  const operations: unknown[] = [];
  const Form = loadForm(async () => { const selected = response([]); const quote = { ...selected.quote, paymentMethods: [{ id: "30000000-0000-4000-8000-000000000001", kind: "hosted_card", label: "Kart", instructions: "Güvenli ödeme", providerCode: "paytr_iframe", presentation: "iframe", requiredCustomerFields: [] }] }; return { quote, quoteDigest: digest(quote) }; }, {
    bumpOffers: bumpProjection, startHosted: async input => { operations.push(input); throw new FixtureCartClientError(++attempts === 1 ? "request_failed" : "invalid_input"); },
  });
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(Form, { intentKind: "cart", initialDraft: validDraft }));
    await click(".checkout-submit"); await click(".checkout-submit");
    assert.equal(container.querySelector<HTMLButtonElement>(".order-bump-add")?.disabled, true);
    assert.equal(container.querySelector<HTMLButtonElement>(".promotion-coupon-controls button")?.disabled, true);
    assert.deepEqual(operations[1], operations[0]);
  });
});

test("a known rejected payment followed by an accepted bump submits a fresh operation with the new quote", async () => {
  let updated = false;
  const operations: Record<string, unknown>[] = [];
  const extra = { ...cart.items[0], productId: bumpOffer.productId, variantId: bumpOffer.variantId, title: bumpOffer.title, slug: bumpOffer.slug, unitPriceCents: 2500, lineTotalCents: 2500 };
  const next = { ...cart, version: 2, itemCount: 2, items: [...cart.items, extra], subtotalCents: 12500, totalCents: 12500 };
  const projected = () => { const selected = response([]); const snapshot = updated ? { ...selected.quote.cart, ...next, items: next.items.map(line => ({ ...line, discountCents: 0, payableCents: line.lineTotalCents })) } : selected.quote.cart; const quote = { ...selected.quote, cart: snapshot, paymentMethods: [{ id: "30000000-0000-4000-8000-000000000001", kind: "hosted_card", label: "Kart", instructions: "Güvenli ödeme", providerCode: "paytr_iframe", presentation: "iframe", requiredCustomerFields: [] }] }; return { quote, quoteDigest: digest(quote) }; };
  const Form = loadForm(async () => projected(), { bumpOffers: bumpProjection, add: async () => next as never, replaceCart() { updated = true; }, startHosted: async input => { operations.push(input as unknown as Record<string, unknown>); throw new FixtureCartClientError("invalid_input"); } });
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(Form, { intentKind: "cart", initialDraft: validDraft }));
    await click(".checkout-submit"); await click(".order-bump-add"); await click(".checkout-submit");
    assert.equal(operations.length, 2); assert.notEqual(operations[0].operationId, operations[1].operationId);
    assert.equal(operations[1].cartVersion, 2); assert.equal(operations[1].expectedQuoteDigest, projected().quoteDigest);
    assert.equal(container.querySelector<HTMLInputElement>('input[name="email"]')?.value, validDraft.email);
  });
});

for (const paymentKind of ["bank_transfer", "cash_on_delivery"] as const) {
  test(`a first ${paymentKind} input rejection preserves editable fields and permits a fresh bump operation`, async () => {
    let updated = false;
    const submissions: Record<string, unknown>[] = [];
    const additions: unknown[] = [];
    const extra = { ...cart.items[0], productId: bumpOffer.productId, variantId: bumpOffer.variantId, title: bumpOffer.title, slug: bumpOffer.slug, unitPriceCents: 2500, lineTotalCents: 2500 };
    const next = { ...cart, version: 2, itemCount: 2, items: [...cart.items, extra], subtotalCents: 12500, totalCents: 12500 };
    const projected = () => {
      const selected = response([]);
      const quote = { ...selected.quote, ...(updated ? { cart: { ...selected.quote.cart, ...next, items: next.items.map(line => ({ ...line, discountCents: 0, payableCents: line.lineTotalCents })) } } : {}), paymentMethods: [{ kind: paymentKind, label: "Ödeme", instructions: "Teslimatta ödeme", ...(paymentKind === "bank_transfer" ? { bankName: "Celebix Bank", accountHolder: "Mağaza", iban: "TR330006100519786457841326" } : {}) }] };
      return { quote, quoteDigest: digest(quote) };
    };
    const Form = loadForm(async () => projected(), { bumpOffers: bumpProjection, add: async input => { additions.push(input); return next as never; }, replaceCart() { updated = true; } });
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (path, init) => {
      assert.equal(path, "/api/checkout/complete");
      submissions.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({ code: "invalid_input" }, { status: 400 });
    };
    try {
      await withProductBrowser(async ({ container, render, click, change }) => {
        await render(React.createElement(Form, { intentKind: "cart", initialDraft: validDraft }));
        await click(".checkout-submit");
        assert.equal(container.querySelector<HTMLFieldSetElement>(".checkout-contact fieldset")?.disabled, false, "known rejection permits correcting the contact");
        assert.equal(container.querySelector<HTMLFieldSetElement>(".checkout-delivery fieldset")?.disabled, false);
        assert.equal(container.querySelector<HTMLButtonElement>(".order-bump-add")?.disabled, false);
        await change('input[name="addressLine1"]', "Cadde 12");
        await click(".order-bump-add");
        await click(".checkout-submit");
        assert.equal(additions.length, 1);
        assert.equal(submissions.length, 2);
        assert.notEqual(submissions[0].operationId, submissions[1].operationId);
        assert.equal(submissions[1].cartVersion, 2);
        assert.equal(submissions[1].expectedQuoteDigest, projected().quoteDigest);
        assert.equal((submissions[1].shippingAddress as Record<string, unknown>).addressLine1, "Cadde 12");
      });
    } finally { globalThis.fetch = previousFetch; }
  });
}

test("a later non-card input rejection preserves an earlier ambiguous financial attempt", async () => {
  const submissions: Record<string, unknown>[] = [], additions: unknown[] = [];
  const Form = loadForm(async (_intent, codes) => response(codes), { bumpOffers: bumpProjection, add: async input => { additions.push(input); return cart as never; } });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_path, init) => {
    submissions.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    if (submissions.length === 1) throw new Error("lost response");
    return Response.json({ code: "invalid_input" }, { status: 400 });
  };
  try {
    await withProductBrowser(async ({ container, render, click }) => {
      await render(React.createElement(Form, { intentKind: "cart", initialDraft: validDraft }));
      await click(".checkout-submit"); await click(".checkout-submit"); await click(".order-bump-add");
      assert.deepEqual(submissions[1], submissions[0]);
      assert.deepEqual(additions, []);
      assert.equal(container.querySelector<HTMLFieldSetElement>(".checkout-contact fieldset")?.disabled, true);
      assert.equal(container.querySelector<HTMLButtonElement>(".promotion-coupon-controls button")?.disabled, true);
    });
  } finally { globalThis.fetch = previousFetch; }
});

for (const [name, rejected] of [
  ["extra response fields", () => Response.json({ code: "invalid_input", detail: "untrusted" }, { status: 400 })],
  ["unknown code", () => Response.json({ code: "operation_mismatch" }, { status: 409 })],
  ["server failure", () => Response.json({ code: "invalid_input" }, { status: 500 })],
  ["oversized actual body", () => new Response(JSON.stringify({ code: "invalid_input" }) + " ".repeat(2049), { status: 400, headers: { "content-type": "application/json" } })],
  ["oversized declared body", () => Response.json({ code: "invalid_input" }, { status: 400, headers: { "content-length": "2049" } })],
  ["incorrect content type", () => new Response(JSON.stringify({ code: "invalid_input" }), { status: 400, headers: { "content-type": "text/plain" } })],
] as const) {
  test(`a non-card rejection with ${name} cannot release the uncertain-payment fence`, async () => {
    const submissions: Record<string, unknown>[] = [];
    const Form = loadForm(async (_intent, codes) => response(codes), { bumpOffers: bumpProjection });
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (_path, init) => { submissions.push(JSON.parse(String(init?.body)) as Record<string, unknown>); return rejected(); };
    try {
      await withProductBrowser(async ({ container, render, click }) => {
        await render(React.createElement(Form, { intentKind: "cart", initialDraft: validDraft }));
        await click(".checkout-submit");
        assert.equal(container.querySelector<HTMLFieldSetElement>(".checkout-contact fieldset")?.disabled, true);
        assert.equal(container.querySelector<HTMLButtonElement>(".order-bump-add")?.disabled, true);
        await click(".checkout-submit"); assert.deepEqual(submissions[1], submissions[0]);
      });
    } finally { globalThis.fetch = previousFetch; }
  });
}

test("an unverified ambiguous add never restores the old checkout seal or replays the add", async () => {
  let adds = 0, reads = 0, quotes = 0;
  const Form = loadForm(async (_intent, codes) => { quotes++; return response(codes); }, { bumpOffers: bumpProjection, add: async () => { adds++; throw new Error("lost response"); }, resolve: async () => { reads++; throw new Error("unavailable"); } });
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(Form, { intentKind: "cart", initialDraft: validDraft })); await click(".order-bump-add");
    assert.equal(adds, 1); assert.equal(reads, 1); assert.equal(quotes, 1);
    assert.equal(container.querySelector<HTMLButtonElement>(".checkout-submit")?.disabled, true);
    assert.equal(container.querySelector(".order-bump-add"), null); assert.doesNotMatch(container.querySelector(".checkout-summary")?.textContent ?? "", /₺100/u);
  });
});

test("a pending coupon check cannot submit using an older total", async () => {
  let finish: ((value: unknown) => void) | undefined;
  const Form = loadForm(async (_intent, codes) => codes.length ? await new Promise(resolve => { finish = resolve; }) : response([]));
  await withProductBrowser(async ({ container, render, click, change }) => {
    await render(React.createElement(Form, { intentKind: "cart", visualTheme: "shared-checkout" }));
    await change('input[name="coupon"]', "save");
    await click(".promotion-coupon-controls button");
    assert.equal(container.querySelector<HTMLButtonElement>(".checkout-submit")?.disabled, true);
    assert.equal(container.querySelector<HTMLButtonElement>(".promotion-coupon-controls button")?.disabled, true);
    assert.doesNotMatch(container.querySelector(".checkout-summary")?.textContent ?? "", /₺100/u);
    await React.act(async () => finish?.(response(["SAVE"])));
    assert.match(container.querySelector(".checkout-summary")?.textContent ?? "", /₺90/u);
  });
});

test("coupon Enter applies a rejected code without submitting the delivery form", async () => {
  const calls: string[][] = [];
  const Form = loadForm(async (_intent, codes) => { calls.push([...codes]); return response(codes); });
  await withProductBrowser(async ({ container, render, change }) => {
    await render(React.createElement(Form, { intentKind: "cart", visualTheme: "shared-checkout" }));
    await change('input[name="coupon"]', "bad");
    await React.act(async () => container.querySelector('input[name="coupon"]')!.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    assert.deepEqual(calls, [[], ["BAD"], []]);
    assert.match(container.querySelector(".promotion-coupon-status")?.textContent ?? "", /Bu kod şu anda uygulanamıyor/u);
    assert.equal(container.querySelector(".checkout-field-error"), null);
    assert.equal(container.querySelector(".promotion-coupon-list"), null);
  });
});

test("an unavailable coupon response clears the old quote and recovery installs a fresh total", async () => {
  let fail = true;
  const Form = loadForm(async (_intent, codes) => { if (codes.length && fail) throw new Error("unavailable"); return response(codes); });
  await withProductBrowser(async ({ container, render, change, click }) => {
    await render(React.createElement(Form, { intentKind: "cart", visualTheme: "shared-checkout" }));
    await change('input[name="coupon"]', "save");
    await click(".promotion-coupon-controls button");
    assert.equal(container.querySelector<HTMLButtonElement>(".checkout-submit")?.disabled, true);
    assert.match(container.querySelector(".promotion-coupon-status")?.textContent ?? "", /kontrol edilemedi/u);
    assert.doesNotMatch(container.querySelector(".checkout-summary")?.textContent ?? "", /₺100/u, "failed quote does not display a stale cart total");
    assert.match(container.querySelector(".shared-checkout-summary-toggle")?.textContent ?? "", /Kullanılamıyor/u);
    assert.equal(container.querySelector<HTMLButtonElement>(".promotion-coupon-controls button")?.disabled, false, "coupon can be retried");
    assert.match(container.querySelector(".checkout-shipping-method")?.textContent ?? "", /Hesaplanamadı/u);
    assert.match(container.querySelector(".checkout-payment")?.textContent ?? "", /Ödeme seçenekleri alınamadı/u);
    fail = false;
    await click(".promotion-coupon-controls button");
    assert.match(container.querySelector(".checkout-summary")?.textContent ?? "", /₺90/u);
    assert.equal(container.querySelector<HTMLButtonElement>(".checkout-submit")?.disabled, false);
  });
});

test("shared delivery renders separate names, required postal code, one location row and closed optional note", async () => {
  const Form = loadForm(async (_intent, codes) => response(codes));
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(Form, { intentKind: "cart", visualTheme: "shared-checkout" }));
    for (const field of ["firstName", "lastName", "postalCode", "phone"]) assert.equal(container.querySelector<HTMLInputElement>(`input[name="${field}"]`)?.required, true);
    assert.equal(container.querySelector('input[name="addressLine2"]'), null);
    assert.equal(container.querySelectorAll(".checkout-location-fields input").length, 3);
    assert.equal(container.querySelector<HTMLDetailsElement>(".checkout-optional-fields")?.open, false);
    await click(".checkout-submit");
    assert.match(container.querySelector("#checkout-postalCode-error")?.textContent ?? "", /Posta kodu/u);
    assert.match(container.querySelector("#checkout-firstName-error")?.textContent ?? "", /Adınızı/u);
    assert.match(container.querySelector("#checkout-lastName-error")?.textContent ?? "", /Soyadınızı/u);
  });
});

test("a newer cart quote releases order pending after price change and still requires the fresh total", async () => {
  let currentCart = cart;
  let quoteCalls = 0;
  let finishPriceRefresh: ((value: unknown) => void) | undefined;
  let finishCartRefresh: ((value: unknown) => void) | undefined;
  const hostedResponse = () => {
    const selected = response([]);
    const quote = { ...selected.quote, cart: { ...selected.quote.cart, version: currentCart.version }, paymentMethods: [{
      id: "30000000-0000-4000-8000-000000000001", kind: "hosted_card", label: "Kart", instructions: "Güvenli ödeme ekranı.",
      providerCode: "paytr_iframe", presentation: "iframe", requiredCustomerFields: [],
    }] };
    return { quote, quoteDigest: digest(quote) };
  };
  const Form = loadForm(async () => {
    quoteCalls += 1;
    if (quoteCalls === 2) return await new Promise(resolve => { finishPriceRefresh = resolve; });
    if (quoteCalls === 3) return await new Promise(resolve => { finishCartRefresh = resolve; });
    return hostedResponse();
  }, { getCart: () => currentCart, startHosted: async () => { throw new FixtureCartClientError("price_changed"); } });
  const props = { intentKind: "cart", initialDraft: {
    firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", phone: "+14155552671", addressLine1: "Cadde 1",
    city: "İstanbul", district: "Kadıköy", postalCode: "34710", note: "",
  } };
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(Form, props));
    await click(".checkout-submit");
    assert.equal(quoteCalls, 2);
    assert.equal(container.querySelector<HTMLButtonElement>(".checkout-submit")?.disabled, true);
    currentCart = { ...cart, version: 2 };
    await render(React.createElement(Form, props));
    assert.equal(quoteCalls, 2, "newer quote waits for the older cookie response");
    await React.act(async () => finishPriceRefresh?.(hostedResponse()));
    assert.equal(quoteCalls, 3);
    assert.equal(container.querySelector<HTMLButtonElement>(".checkout-submit")?.disabled, true, "newer quote still blocks order submission");
    await React.act(async () => finishCartRefresh?.(hostedResponse()));
    assert.equal(container.querySelector<HTMLButtonElement>(".checkout-submit")?.disabled, false);
    assert.equal(container.querySelector<HTMLFieldSetElement>(".checkout-contact fieldset")?.disabled, false);
    assert.doesNotMatch(container.querySelector(".checkout-submit")?.textContent ?? "", /Hazırlanıyor/u);
    assert.match(container.querySelector(".checkout-status")?.textContent ?? "", /Sipariş özeti güncel/u);
  });
});

test("a rejected coupon keeps feedback but submits the digest for exactly the retained codes", async () => {
  let submittedCodes: readonly string[] | undefined;
  let spuriousPriceChanges = 0;
  const hostedResponse = (codes: readonly string[]) => {
    const selected = response(codes);
    const quote = { ...selected.quote, paymentMethods: [{
      id: "30000000-0000-4000-8000-000000000001", kind: "hosted_card", label: "Kart", instructions: "Güvenli ödeme ekranı.",
      providerCode: "paytr_iframe", presentation: "iframe", requiredCustomerFields: [],
    }] };
    return { quote, quoteDigest: digest(quote) };
  };
  const Form = loadForm(async (_intent, codes) => hostedResponse(codes), { startHosted: async input => {
    submittedCodes = input.normalizedCodes;
    if (input.expectedQuoteDigest !== hostedResponse(input.normalizedCodes ?? []).quoteDigest) {
      spuriousPriceChanges += 1;
      throw new FixtureCartClientError("price_changed");
    }
    throw new FixtureCartClientError("fixture_order_blocked");
  } });
  await withProductBrowser(async ({ container, render, change, click }) => {
    await render(React.createElement(Form, { intentKind: "cart", initialDraft: {
      firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", phone: "+14155552671", addressLine1: "Cadde 1",
      city: "İstanbul", district: "Kadıköy", postalCode: "34710", note: "",
    } }));
    await change('input[name="coupon"]', "bad");
    await click(".promotion-coupon-controls button");
    assert.match(container.querySelector(".promotion-coupon-status")?.textContent ?? "", /Bu kod şu anda uygulanamıyor/u);
    assert.equal(container.querySelector(".promotion-coupon-list"), null);
    await click(".checkout-submit");
    assert.deepEqual(submittedCodes, []);
    assert.equal(spuriousPriceChanges, 0, "rejecting a code without changing the total must not create a price change");
    assert.doesNotMatch(container.querySelector(".checkout-status")?.textContent ?? "", /Fiyat güncellendi/u);
  });
});

test("hosted HTTP 400 keeps delivery fields, the quote and the same operation for retry without redirect", async () => {
  const submissions: Record<string, unknown>[] = [];
  const navigations: string[] = [];
  let quoteCalls = 0;
  const client = createStorefrontCartClient(async (path, init) => {
    assert.equal(path, "/api/checkout/payment/start");
    submissions.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({ code: "invalid_input" }, { status: 400 });
  }, () => { throw new Error("retry_created_a_new_operation"); });
  const selected = response([]);
  const quote = { ...selected.quote, paymentMethods: [{
    id: "30000000-0000-4000-8000-000000000001", kind: "hosted_card", label: "Kart", instructions: "Güvenli ödeme ekranı.",
    providerCode: "paytr_iframe", presentation: "iframe", requiredCustomerFields: [],
  }] };
  const quoteDigest = digest(quote);
  const Form = loadForm(async () => { quoteCalls += 1; return { quote, quoteDigest }; }, {
    startHosted: client.startHosted, clientError: StorefrontCartClientError,
  });
  const draft = {
    firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", phone: "+14155552671", addressLine1: "Cadde 1",
    city: "İstanbul", district: "Kadıköy", postalCode: "34710", note: "Kapıyı çalın.",
  };
  await withProductBrowser(async ({ container, render, change, click }) => {
    window.location.assign = destination => { navigations.push(String(destination)); };
    await render(React.createElement(Form, { intentKind: "cart", initialDraft: draft }));
    await change('input[name="addressLine1"]', "Cadde 12");
    const enteredFields = Object.keys(draft).map(name => [name, container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)?.value] as const);
    await click(".checkout-submit");
    assert.equal(submissions.length, 1, "the failure must come from the actual hosted HTTP request");
    assert.equal(container.querySelector(".checkout-status")?.textContent, "İletişim ve teslimat bilgilerinizi kontrol edin. Sorun devam ederse mağazayla iletişime geçin.");
    assert.match(container.querySelector(".checkout-summary")?.textContent ?? "", /₺100/u);
    for (const [name, value] of enteredFields) {
      assert.equal(container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)?.value, value, `${name} survives the failed payment start`);
    }
    assert.equal(container.querySelector<HTMLButtonElement>(".checkout-submit")?.disabled, false);
    assert.equal(container.querySelector<HTMLFieldSetElement>(".checkout-contact fieldset")?.disabled, false);
    assert.deepEqual(navigations, []);
    await click(".checkout-submit");
    assert.equal(submissions.length, 2);
    assert.equal(quoteCalls, 1, "an input failure does not discard or refresh the confirmed quote");
    assert.equal(typeof submissions[0]?.operationId, "string");
    assert.deepEqual(submissions[1], submissions[0], "retry keeps the operation, entered information and quote seal");
    assert.equal(submissions[0]?.expectedQuoteDigest, quoteDigest);
    assert.deepEqual(submissions[0]?.contact, { name: "Ada Lovelace", email: draft.email, phone: draft.phone });
    assert.deepEqual(submissions[0]?.shippingAddress, { addressLine1: "Cadde 12", city: draft.city, district: draft.district, postalCode: draft.postalCode });
    assert.equal(submissions[0]?.note, draft.note);
    assert.deepEqual(navigations, []);
  });
});
