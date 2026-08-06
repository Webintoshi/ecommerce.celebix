import assert from "node:assert/strict";
import test from "node:test";

import {
  FIXED_STOREFRONT_POLICIES,
  parsePublicCart,
  parsePublicCheckoutQuote,
  parsePublicCheckoutReceipt,
  parsePublicPolicyIndex,
  parsePublicPolicyPage,
  parsePublicProductSearch,
} from "./commerce.ts";

const PRODUCT_ID = "20000000-0000-4000-8000-000000000001";
const VARIANT_ID = "30000000-0000-4000-8000-000000000001";
const MEDIA_ID = "40000000-0000-4000-8000-000000000001";

const PRODUCT = Object.freeze({
  id: PRODUCT_ID,
  slug: "altin-yuzuk",
  title: "Altın Yüzük",
  currency: "TRY" as const,
  status: "active" as const,
  priceCents: 11_271_00,
  available: true,
  variants: Object.freeze([
    Object.freeze({
      id: VARIANT_ID,
      title: "14 Ayar",
      sku: "YZK-1090",
      priceCents: 11_271_00,
      stockTracking: true,
      stockQuantity: 1,
      available: true,
      attributes: Object.freeze({ ayar: "14" }),
    }),
  ]),
  media: Object.freeze([
    Object.freeze({
      id: MEDIA_ID,
      productId: PRODUCT_ID,
      url: "https://media.saas-staging.celebix.site/stores/10000000-0000-4000-8000-000000000001/products/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001.webp",
      mediaType: "image/webp" as const,
      altText: "Altın yüzük",
      width: 1200,
      height: 1200,
      sortOrder: 0,
    }),
  ]),
});

const CART_LINE = Object.freeze({
  productId: PRODUCT_ID,
  variantId: VARIANT_ID,
  slug: "altin-yuzuk",
  title: "Altın Yüzük",
  variantTitle: "14 Ayar",
  media: PRODUCT.media[0],
  quantity: 1,
  unitPriceCents: 11_271_00,
  lineTotalCents: 11_271_00,
  available: true,
});

const CART = Object.freeze({
  version: 4,
  currency: "TRY" as const,
  itemCount: 1,
  subtotalCents: 11_271_00,
  shippingCents: 0,
  totalCents: 11_271_00,
  checkoutReady: true,
  checkoutBlocker: null,
  items: Object.freeze([CART_LINE]),
});

const BANK_TRANSFER = Object.freeze({
  kind: "bank_transfer" as const,
  label: "Banka havalesi",
  instructions: "Sipariş numaranızı açıklamaya yazın.",
  bankName: "Celebix Bank",
  accountHolder: "Güzide Kuyumcu",
  iban: "TR330006100519786457841326",
});

const HOSTED_CARD = Object.freeze({
  kind: "hosted_card" as const,
  id: "81000000-0000-4000-8000-000000000083",
  label: "Kredi veya banka kartı",
  instructions: "Güvenli sağlayıcı ekranında tamamlanır.",
  providerCode: "iyzico_iframe" as const,
  presentation: "redirect" as const,
  requiredCustomerFields: Object.freeze(["identity_number"] as const),
});

const RECEIPT = Object.freeze({
  orderReference: "CBX-2026-000001",
  currency: "TRY" as const,
  subtotalCents: CART.subtotalCents,
  shippingCents: CART.shippingCents,
  totalCents: CART.totalCents,
  paymentStatus: "pending" as const,
  paymentMethod: BANK_TRANSFER,
  delivery: Object.freeze({
    recipientName: "Güzide Elif",
    addressLine1: "Bağdat Caddesi 10",
    city: "İstanbul",
    district: "Kadıköy",
    country: "TR" as const,
  }),
  items: CART.items,
  createdAt: "2026-07-31T12:00:00.000Z",
});

test("fixed policy definitions expose seven immutable public routes", () => {
  assert.deepEqual(
    FIXED_STOREFRONT_POLICIES.map(({ key, route, label }) => ({ key, route, label })),
    [
      { key: "privacy_security", route: "/policies/privacy-security", label: "Gizlilik ve Güvenlik" },
      { key: "distance_sales", route: "/policies/distance-sales", label: "Mesafeli Satış Sözleşmesi" },
      { key: "kvkk", route: "/policies/kvkk", label: "KVKK" },
      { key: "payment_delivery", route: "/policies/payment-delivery", label: "Ödeme & Teslimat" },
      { key: "cookie_usage", route: "/policies/cookies", label: "Çerez Kullanımı" },
      { key: "returns_exchanges", route: "/policies/returns-exchanges", label: "İade & Değişim" },
      { key: "membership", route: "/policies/membership", label: "Üyelik" },
    ],
  );
  assert.equal(Object.isFrozen(FIXED_STOREFRONT_POLICIES), true);
  assert.equal(FIXED_STOREFRONT_POLICIES.every(Object.isFrozen), true);
});

test("public policy contracts preserve a truthful unavailable projection and reject private authority", () => {
  const draft = parsePublicPolicyPage({
    key: "kvkk",
    label: "KVKK",
    route: "/policies/kvkk",
    published: false,
    updatedAt: "2026-07-31T12:00:00.000Z",
  });
  assert.deepEqual(draft, {
    key: "kvkk",
    label: "KVKK",
    route: "/policies/kvkk",
    published: false,
    updatedAt: "2026-07-31T12:00:00.000Z",
  });
  assert.equal(Object.isFrozen(draft), true);
  assert.throws(() => parsePublicPolicyPage({ ...draft, storeId: crypto.randomUUID() }));
  assert.throws(() => parsePublicPolicyPage({ ...draft, html: "<p>draft leak</p>" }));
  assert.throws(() => parsePublicPolicyPage({ ...draft, route: "/policies/cookies" }));

  const published = parsePublicPolicyPage({ ...draft, published: true, html: "<h2>KVKK</h2><p>Metin</p>" });
  assert.equal(published.html, "<h2>KVKK</h2><p>Metin</p>");
  const index = parsePublicPolicyIndex(FIXED_STOREFRONT_POLICIES.map((policy) => ({ ...policy, published: policy.key === "kvkk" })));
  assert.equal(index.length, 7);
  assert.equal(Object.isFrozen(index), true);
  assert.throws(() => parsePublicPolicyIndex(index.slice(0, 6)));
});

test("public product search is bounded, frozen and rejects private fields", () => {
  const search = parsePublicProductSearch({ items: [PRODUCT], nextCursor: "2026-07-31T12%3A00%3A00.000Z_20000000-0000-4000-8000-000000000001" });
  assert.equal(search.items.length, 1);
  assert.equal(Object.isFrozen(search), true);
  assert.equal(Object.isFrozen(search.items), true);
  assert.throws(() => parsePublicProductSearch({ ...search, storeId: crypto.randomUUID() }));
  assert.throws(() => parsePublicProductSearch({ items: Array.from({ length: 49 }, () => PRODUCT) }));
});

test("public cart validates server-computed totals and exact line authority", () => {
  const parsed = parsePublicCart(CART);
  assert.deepEqual(parsed, CART);
  assert.equal(Object.isFrozen(parsed.items), true);
  assert.equal(Object.isFrozen(parsed.items[0]?.media), true);
  assert.throws(() => parsePublicCart({ ...CART, totalCents: 1 }));
  assert.throws(() => parsePublicCart({ ...CART, itemCount: 2 }));
  assert.throws(() => parsePublicCart({ ...CART, items: [{ ...CART_LINE, credential: "raw" }] }));
  assert.throws(() => parsePublicCart({ ...CART, items: [{ ...CART_LINE, lineTotalCents: 1 }] }));
});

test("public cart checkout blocker is exact and readiness-consistent", () => {
  const paymentBlocked = parsePublicCart({ ...CART, checkoutReady: false, checkoutBlocker: "payment_unavailable" });
  assert.equal(paymentBlocked.checkoutBlocker, "payment_unavailable");
  assert.throws(() => parsePublicCart({ ...CART, checkoutReady: true, checkoutBlocker: "payment_unavailable" }));
  assert.throws(() => parsePublicCart({ ...CART, checkoutReady: false, checkoutBlocker: null }));
  assert.throws(() => parsePublicCart({ ...CART, checkoutReady: false, checkoutBlocker: "provider_unavailable" }));
  assert.throws(() => parsePublicCart({ ...CART, checkoutReady: false, checkoutBlocker: "empty_cart" }));
  assert.equal(parsePublicCart({ ...CART, checkoutReady: false, checkoutBlocker: "stock_unavailable", items: [{ ...CART_LINE, available: false }] }).checkoutBlocker, "stock_unavailable");
});

test("checkout quote exposes only eligible finite payment methods", () => {
  const quote = parsePublicCheckoutQuote({ cart: CART, paymentMethods: [BANK_TRANSFER], estimatedDays: 3 });
  assert.deepEqual(quote, { cart: CART, paymentMethods: [BANK_TRANSFER], estimatedDays: 3 });
  assert.equal(Object.isFrozen(quote.paymentMethods), true);
  assert.throws(() => parsePublicCheckoutQuote({ cart: CART, paymentMethods: [{ kind: "card", label: "Kart", instructions: "x" }] }));
  assert.throws(() => parsePublicCheckoutQuote({ cart: CART, paymentMethods: [{ ...BANK_TRANSFER, iban: "TR00" }] }));
  assert.throws(() => parsePublicCheckoutQuote({ cart: CART, paymentMethods: [{ kind: "cash_on_delivery", label: "Kapıda ödeme", instructions: "Kurye teslimatında ödeyin.", iban: BANK_TRANSFER.iban }] }));
});

test("checkout quote accepts one exact hosted card without private authority", () => {
  const quote = parsePublicCheckoutQuote({ cart: CART, paymentMethods: [HOSTED_CARD] });
  assert.deepEqual(quote.paymentMethods, [HOSTED_CARD]);
  assert.equal(Object.isFrozen(quote.paymentMethods[0]), true);
  assert.equal(Object.isFrozen(quote.paymentMethods[0]?.requiredCustomerFields), true);
  assert.throws(() => parsePublicCheckoutQuote({ cart: CART, paymentMethods: [{ ...HOSTED_CARD, profileId: crypto.randomUUID() }] }));
  assert.throws(() => parsePublicCheckoutQuote({ cart: CART, paymentMethods: [{ ...HOSTED_CARD, requiredCustomerFields: ["card_number"] }] }));
  assert.throws(() => parsePublicCheckoutQuote({ cart: CART, paymentMethods: [{ ...HOSTED_CARD, providerCode: "stripe" }] }));
  assert.throws(() => parsePublicCheckoutQuote({ cart: CART, paymentMethods: [{ ...HOSTED_CARD, presentation: "embedded_html" }] }));
  assert.throws(() => parsePublicCheckoutQuote({ cart: CART, paymentMethods: [HOSTED_CARD, HOSTED_CARD] }));
});

test("checkout receipt stays pending and rejects durable private identifiers", () => {
  const receipt = parsePublicCheckoutReceipt(RECEIPT);
  assert.equal(receipt.paymentStatus, "pending");
  assert.equal(receipt.delivery.city, "İstanbul");
  assert.equal(Object.isFrozen(receipt), true);
  assert.throws(() => parsePublicCheckoutReceipt({ ...receipt, paymentStatus: "paid" }));
  assert.throws(() => parsePublicCheckoutReceipt({ ...receipt, orderId: crypto.randomUUID() }));
  assert.throws(() => parsePublicCheckoutReceipt({ ...receipt, operationId: crypto.randomUUID() }));
});

test("only hosted receipts may be completed", () => {
  const completed = parsePublicCheckoutReceipt({
    ...RECEIPT,
    paymentMethod: HOSTED_CARD,
    paymentStatus: "completed",
  });
  assert.equal(completed.paymentStatus, "completed");
  assert.deepEqual(completed.paymentMethod, HOSTED_CARD);
  assert.throws(() => parsePublicCheckoutReceipt({ ...RECEIPT, paymentMethod: BANK_TRANSFER, paymentStatus: "completed" }));
  assert.throws(() => parsePublicCheckoutReceipt({ ...RECEIPT, paymentMethod: HOSTED_CARD, paymentStatus: "captured" }));
});

test("commerce contracts reject getters without invoking them", () => {
  let invoked = false;
  const cart = Object.defineProperty({ ...CART }, "version", {
    enumerable: true,
    get() {
      invoked = true;
      return 4;
    },
  });
  assert.throws(() => parsePublicCart(cart));
  assert.equal(invoked, false);
});
