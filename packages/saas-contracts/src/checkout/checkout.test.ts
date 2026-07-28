import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCheckoutDeliveryInput,
  parseCheckoutQuote,
  parseCheckoutSubmitInput,
  parseCheckoutStatus,
} from "./index.ts";

const CART_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";
const SHIPPING_ID = "33333333-3333-4333-8333-333333333333";
const PAYMENT_ID = "44444444-4444-4444-8444-444444444444";
const OPERATION_ID = "55555555-5555-4555-8555-555555555555";
const NONCE = "A".repeat(43);

function providerMethod(providerCode: "paytr_iframe" | "iyzico_iframe" = "paytr_iframe") {
  return { id: PAYMENT_ID, kind: "provider", label: "Kart", providerCode, logoPath: `/payment-providers/${providerCode.startsWith("paytr") ? "paytr" : "iyzico"}.svg` };
}

function addressFixture() {
  return {
    firstName: "Ayşe", lastName: "Yılmaz", line1: "Atatürk Caddesi 1", district: "Kadıköy",
    city: "İstanbul", countryCode: "TR", phone: "+905551112233",
  };
}

function quoteFixture() {
  return {
    schemaVersion: 1, cartId: CART_ID, cartVersion: 1, checkoutNonce: NONCE, storeName: "Celebix", currency: "TRY", locale: "tr",
    items: [{ id: ITEM_ID, title: "Ürün", variantLabel: null, quantity: 1, unitPriceCents: 10_000, lineTotalCents: 10_000, imagePath: null }],
    shippingOptions: [{ id: SHIPPING_ID, label: "Standart", description: null, priceCents: 2_900 }], selectedShippingId: SHIPPING_ID,
    paymentMethods: [providerMethod()],
    policyLinks: [{ policyType: "distance_sales", label: "Mesafeli satış", href: "/politikalar/distance_sales" }],
    subtotalCents: 10_000, shippingCents: 2_900, discountCents: 0, totalCents: 12_900, discountCode: null,
  };
}

function submitFixture() {
  return { cartVersion: 1, checkoutNonce: NONCE, operationId: OPERATION_ID, paymentMethodId: PAYMENT_ID, consents: { distanceSales: true, preInformation: true } };
}

test("checkout quote enforces exact money arithmetic and one provider", () => {
  const quote = quoteFixture();
  assert.equal(parseCheckoutQuote(quote).totalCents, 12_900);
  assert.throws(() => parseCheckoutQuote({ ...quote, totalCents: 12_901 }));
  assert.throws(() => parseCheckoutQuote({
    ...quote,
    paymentMethods: [...quote.paymentMethods, providerMethod("iyzico_iframe")],
  }));
});

test("checkout quote does not charge shipping without a selected option", () => {
  const quote = quoteFixture();
  assert.throws(() => parseCheckoutQuote({
    ...quote,
    shippingOptions: [],
    selectedShippingId: null,
    shippingCents: 2_900,
  }));
});

test("checkout inputs reject browser authority and hostile objects", () => {
  assert.throws(() => parseCheckoutSubmitInput({
    ...submitFixture(), storeId: CART_ID,
  }));
  const hostile = Object.create({ cartVersion: 1 });
  Object.assign(hostile, submitFixture());
  assert.throws(() => parseCheckoutSubmitInput(hostile));
});

test("checkout quote rejects a transparent proxy at the server boundary", () => {
  assert.throws(() => parseCheckoutQuote(new Proxy(quoteFixture(), {})));
});

test("checkout delivery validates the exact address and optional billing address", () => {
  const input = {
    cartVersion: 1, checkoutNonce: NONCE, operationId: OPERATION_ID, email: "ayse@example.com", marketingOptIn: false,
    shippingAddress: addressFixture(), billingAddress: null, shippingId: SHIPPING_ID, discountCode: null,
  };
  assert.equal(parseCheckoutDeliveryInput(input).email, "ayse@example.com");
  assert.throws(() => parseCheckoutDeliveryInput({ ...input, billingAddress: { ...addressFixture(), countryCode: "US" } }));
});

test("checkout status rejects payment methods that cannot be placed offline", () => {
  assert.deepEqual(parseCheckoutStatus({ kind: "ready" }), { kind: "ready" });
  assert.throws(() => parseCheckoutStatus({ kind: "placed", orderNumber: "CBX-1", paymentStatus: "pending", method: providerMethod() }));
});
