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
function loadForm(quote: (_intent: string, codes: readonly string[]) => Promise<unknown>, options: Readonly<{ getCart?: () => typeof cart; startHosted?: StorefrontCartClient["startHosted"]; clientError?: typeof StorefrontCartClientError }> = {}) {
  const load = componentLoader({
    "next/link": { __esModule: true, default: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("a", props, children) },
    "@/lib/cart/client.ts": { StorefrontCartClientError: options.clientError ?? FixtureCartClientError, storefrontCartClient: { quotePromotionsWithDigest: quote, startHosted: options.startHosted } },
    "@/lib/checkout-form.ts": deliveryValidation,
    "@/lib/format.ts": { formatTry: (cents: number) => `₺${cents / 100}` },
    "@/lib/promotions/model.ts": promotionModel,
    "@/lib/storefront-routes.ts": routes,
    "@/lib/analytics/events.ts": { emitStorefrontCommerceEvent() {}, couponAppliedEvent: () => null },
    "./CartStatusProvider": { useCartStatus: () => ({ cart: options.getCart?.() ?? cart, loading: false }) },
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
