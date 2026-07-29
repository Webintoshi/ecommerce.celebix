import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type {
  CheckoutAddress,
  CheckoutQuote,
} from "@celebix/saas-contracts";

import {
  buildDeliveryPayload,
  buildSubmitPayload,
  createCheckoutState,
  formatCheckoutMoney,
  reduceCheckout,
} from "./model.ts";

const address: CheckoutAddress = Object.freeze({
  firstName: "Ahmet",
  lastName: "Yılmaz",
  line1: "Bağdat Caddesi 123",
  district: "Kadıköy",
  city: "İstanbul",
  postalCode: "34710",
  countryCode: "TR",
  phone: "+905551234567",
});

function quote(overrides: Partial<CheckoutQuote> = {}): CheckoutQuote {
  return Object.freeze({
    schemaVersion: 1,
    cartId: "11111111-1111-4111-8111-111111111111",
    cartVersion: 1,
    checkoutNonce: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ",
    storeName: "Minimal Store",
    currency: "TRY",
    locale: "tr",
    items: Object.freeze([Object.freeze({
      id: "22222222-2222-4222-8222-222222222222",
      title: "Kanvas Omuz Çantası",
      variantLabel: "Bej",
      quantity: 1,
      unitPriceCents: 10_000,
      lineTotalCents: 10_000,
      imagePath: null,
    })]),
    shippingOptions: Object.freeze([Object.freeze({
      id: "standard",
      label: "Standart kargo",
      description: null,
      priceCents: 0,
    })]),
    selectedShippingId: "standard",
    paymentMethods: Object.freeze([
      Object.freeze({
        id: "33333333-3333-4333-8333-333333333333",
        kind: "provider",
        label: "iyzico",
        providerCode: "iyzico_iframe",
        logoPath: "/payment-providers/iyzico.svg",
      }),
      Object.freeze({
        id: "44444444-4444-4444-8444-444444444444",
        kind: "bank_transfer",
        label: "Banka havalesi",
        bankName: "Örnek Banka",
        accountHolder: "Minimal Store",
        iban: "TR000000000000000000000000",
        instructions: "Sipariş numaranızı açıklamaya yazın.",
      }),
    ]),
    policyLinks: Object.freeze([
      Object.freeze({
        policyType: "distance_sales",
        label: "Mesafeli Satış Sözleşmesi",
        href: "/politikalar/distance_sales",
      }),
      Object.freeze({
        policyType: "pre_information",
        label: "Ön Bilgilendirme Koşulları",
        href: "/politikalar/pre_information",
      }),
    ]),
    subtotalCents: 10_000,
    shippingCents: 0,
    discountCents: 0,
    totalCents: 10_000,
    discountCode: null,
    ...overrides,
  });
}

test("delivery success replaces the canonical server quote and clears pending state", () => {
  const initial = createCheckoutState(quote());
  const pending = reduceCheckout(initial, { type: "delivery_started" });
  const next = reduceCheckout(pending, {
    type: "delivery_succeeded",
    quote: quote({ cartVersion: 2, shippingCents: 2_500, totalCents: 12_500 }),
  });

  assert.equal(next.pending, null);
  assert.equal(next.quote.cartVersion, 2);
  assert.equal(next.quote.totalCents, 12_500);
});

test("stale cart keeps the last server quote and announces a visible error", () => {
  const initial = createCheckoutState(quote());
  const next = reduceCheckout(initial, { type: "failed", code: "cart_changed" });

  assert.equal(next.quote, initial.quote);
  assert.equal(next.pending, null);
  assert.equal(next.error, "Sepetiniz güncellendi. Lütfen bilgileri yeniden kontrol edin.");
});

test("summary and payment actions change only local presentation state", () => {
  const initial = createCheckoutState(quote());
  const summary = reduceCheckout(initial, { type: "toggle_summary" });
  const payment = reduceCheckout(summary, {
    type: "select_payment",
    paymentMethodId: "44444444-4444-4444-8444-444444444444",
  });

  assert.equal(summary.summaryOpen, true);
  assert.equal(payment.selectedPaymentMethodId, "44444444-4444-4444-8444-444444444444");
  assert.equal(payment.quote, initial.quote);
});

test("payload builders emit only the exact public contract keys", () => {
  const selectedQuote = quote();
  const delivery = buildDeliveryPayload({
    quote: selectedQuote,
    operationId: "55555555-5555-4555-8555-555555555555",
    email: "ornek@example.com",
    marketingOptIn: false,
    shippingAddress: address,
    billingAddress: null,
    shippingId: "standard",
    discountCode: null,
  });
  const submit = buildSubmitPayload({
    quote: selectedQuote,
    operationId: "66666666-6666-4666-8666-666666666666",
    paymentMethodId: "33333333-3333-4333-8333-333333333333",
    identityNumber: "10000000146",
  });

  assert.deepEqual(Object.keys(delivery).sort(), [
    "billingAddress",
    "cartVersion",
    "checkoutNonce",
    "discountCode",
    "email",
    "marketingOptIn",
    "operationId",
    "shippingAddress",
    "shippingId",
  ]);
  assert.deepEqual(Object.keys(submit).sort(), [
    "cartVersion",
    "checkoutNonce",
    "consents",
    "identityNumber",
    "operationId",
    "paymentMethodId",
  ]);
  assert.deepEqual(submit.consents, { distanceSales: true, preInformation: true });
});

test("money formatting is Turkish and never derives a total", () => {
  assert.equal(formatCheckoutMoney(54_890), "548,90 TRY");
});

test("storefront provider logos are exact reviewed byte copies", async () => {
  const fixtures = [
    ["paytr.svg", "7d1d7a2809a734b99339f1440055e26304f3947deda5e96f2601b57049f50f61"],
    ["iyzico.svg", "32244bcbed66a3ec32eb246ef003492a2f37dbb1a658fcc09ad57e702ca2f3a8"],
  ] as const;

  for (const [name, expected] of fixtures) {
    const [source, storefront] = await Promise.all([
      readFile(new URL(`../../../customer-panel/public/payment-providers/${name}`, import.meta.url)),
      readFile(new URL(`../../public/payment-providers/${name}`, import.meta.url)),
    ]);
    assert.equal(createHash("sha256").update(source).digest("hex"), expected);
    assert.equal(createHash("sha256").update(storefront).digest("hex"), expected);
    assert.equal(storefront.equals(source), true);
  }
});
