import assert from "node:assert/strict";
import test from "node:test";

import {
  FIXED_STOREFRONT_POLICIES,
  PROMOTION_CART_LINE_LIMIT_MESSAGE,
  parsePublicCart,
  parsePublicCartV2,
  parsePublicCheckoutQuote,
  parsePublicCheckoutQuoteV2,
  parsePublicCheckoutReceipt,
  parsePublicCheckoutReceiptV2,
  parsePublicPolicyIndex,
  parsePublicPolicyPage,
  parsePublicProductSearch,
} from "./commerce.ts";

const PRODUCT_ID = "20000000-0000-4000-8000-000000000001";
const VARIANT_ID = "30000000-0000-4000-8000-000000000001";
const MEDIA_ID = "40000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "50000000-0000-4000-8000-000000000001";

const PRODUCT = Object.freeze({
  id: PRODUCT_ID,
  primaryCategoryId: CATEGORY_ID,
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
  categoryId: CATEGORY_ID,
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

const PROMOTION_ID = "60000000-0000-4000-8000-000000000001";
const DISCOUNTED_LINE = Object.freeze({
  ...CART_LINE,
  discountCents: 112_710,
  payableCents: 1_014_390,
});
const AUTO_GIFT_LINE = Object.freeze({
  ...CART_LINE,
  quantity: 1,
  unitPriceCents: 0,
  lineTotalCents: 0,
  discountCents: 0,
  payableCents: 0,
});
const DISCOUNTED_CART = Object.freeze({
  ...CART,
  lineDiscountCents: 112_710,
  shippingDiscountCents: 0,
  discountCents: 112_710,
  totalCents: 1_014_390,
  items: Object.freeze([DISCOUNTED_LINE]),
});
const APPLIED_PROMOTION = Object.freeze({
  name: "Sepette %10",
  benefitKind: "percentage" as const,
  normalizedCode: "YUZDE10",
  lineDiscountCents: 112_710,
  shippingDiscountCents: 0,
  discountCents: 112_710,
});
const DISCOUNTED_QUOTE = Object.freeze({
  cart: Object.freeze({
    ...DISCOUNTED_CART,
    items: Object.freeze([...DISCOUNTED_CART.items, AUTO_GIFT_LINE]),
  }),
  paymentMethods: Object.freeze([BANK_TRANSFER]),
  promotionStatus: Object.freeze({ kind: "evaluated" as const }),
  appliedPromotions: Object.freeze([APPLIED_PROMOTION]),
  rejectedPromotions: Object.freeze([
    Object.freeze({ normalizedCode: "ESKI", reason: "invalid_code" as const }),
  ]),
  gifts: Object.freeze([
    Object.freeze({ variantId: VARIANT_ID, quantity: 1, autoAdd: true }),
  ]),
  progressMessages: Object.freeze(["Ücretsiz kargo için 500 TL daha ekleyin."]),
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
  assert.equal(parsed.items[0]?.categoryId, CATEGORY_ID);
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

test("V2 checkout quote adds only reconciled public promotion facts while V1 stays exact", () => {
  const parsed = parsePublicCheckoutQuoteV2(DISCOUNTED_QUOTE);
  assert.deepEqual(parsed, DISCOUNTED_QUOTE);
  assert.deepEqual(parsePublicCartV2(DISCOUNTED_CART), DISCOUNTED_CART);
  assert.throws(() => parsePublicCartV2(DISCOUNTED_QUOTE.cart));
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.cart.items), true);
  assert.equal(Object.isFrozen(parsed.appliedPromotions[0]), true);
  assert.equal(Object.isFrozen(parsed.rejectedPromotions[0]), true);
  assert.equal(Object.isFrozen(parsed.gifts[0]), true);

  assert.throws(() => parsePublicCheckoutQuote(DISCOUNTED_QUOTE));
  assert.throws(() => parsePublicCart(DISCOUNTED_CART));
  assert.throws(() => parsePublicCheckoutQuoteV2({
    ...DISCOUNTED_QUOTE,
    evaluatorAuthorityDigest: "a".repeat(64),
  }));
  assert.throws(() => parsePublicCheckoutQuoteV2({
    ...DISCOUNTED_QUOTE,
    appliedPromotions: [{ ...APPLIED_PROMOTION, promotionId: PROMOTION_ID }],
  }));
  assert.throws(() => parsePublicCheckoutQuoteV2({
    ...DISCOUNTED_QUOTE,
    gifts: [{ ...DISCOUNTED_QUOTE.gifts[0], promotionId: PROMOTION_ID }],
  }));
  assert.throws(() => parsePublicCheckoutQuoteV2({
    ...DISCOUNTED_QUOTE,
    cart: DISCOUNTED_CART,
  }));
  assert.throws(() => parsePublicCheckoutQuoteV2({
    ...DISCOUNTED_QUOTE,
    cart: { ...DISCOUNTED_QUOTE.cart, items: [AUTO_GIFT_LINE, DISCOUNTED_LINE] },
  }));
  assert.throws(() => parsePublicCheckoutQuoteV2({
    ...DISCOUNTED_QUOTE,
    cart: {
      ...DISCOUNTED_QUOTE.cart,
      items: [DISCOUNTED_LINE, { ...AUTO_GIFT_LINE, quantity: 2 }],
    },
  }));
});

test("V2 cart and public summaries reject inconsistent money, unsafe codes and enumerating rejections", () => {
  assert.throws(() => parsePublicCartV2({ ...DISCOUNTED_CART, discountCents: 1 }));
  assert.throws(() => parsePublicCartV2({ ...DISCOUNTED_CART, lineDiscountCents: 1 }));
  assert.throws(() => parsePublicCartV2({ ...DISCOUNTED_CART, totalCents: 1 }));
  assert.throws(() => parsePublicCartV2({
    ...DISCOUNTED_CART,
    items: [{ ...DISCOUNTED_LINE, payableCents: 1 }],
  }));
  assert.throws(() => parsePublicCheckoutQuoteV2({
    ...DISCOUNTED_QUOTE,
    appliedPromotions: [{ ...APPLIED_PROMOTION, discountCents: 1 }],
  }));
  assert.throws(() => parsePublicCheckoutQuoteV2({
    ...DISCOUNTED_QUOTE,
    rejectedPromotions: [{ normalizedCode: " eski ", reason: "invalid_code" }],
  }));
  assert.throws(() => parsePublicCheckoutQuoteV2({
    ...DISCOUNTED_QUOTE,
    rejectedPromotions: [{ normalizedCode: "ESKI", reason: "conditions_not_met", promotionId: PROMOTION_ID }],
  }));
  assert.throws(() => parsePublicCheckoutQuoteV2({
    ...DISCOUNTED_QUOTE,
    progressMessages: ["one", "two", "three"],
  }));
});

test("V2 never evaluates a prefix of carts beyond the frozen twenty-line promotion bound", () => {
  const lines = Array.from({ length: 21 }, (_, index) => {
    const suffix = String(index + 1).padStart(12, "0");
    return {
      ...DISCOUNTED_LINE,
      productId: `20000000-0000-4000-8000-${suffix}`,
      variantId: `30000000-0000-4000-8000-${suffix}`,
      categoryId: undefined,
      media: undefined,
      unitPriceCents: 100,
      lineTotalCents: 100,
      discountCents: 0,
      payableCents: 100,
    };
  }).map(({ categoryId: _categoryId, media: _media, ...line }) => line);
  const grossCart = {
    ...DISCOUNTED_CART,
    itemCount: 21,
    subtotalCents: 2_100,
    lineDiscountCents: 0,
    shippingDiscountCents: 0,
    discountCents: 0,
    totalCents: 2_100,
    items: lines,
  };
  const limited = {
    cart: grossCart,
    paymentMethods: [BANK_TRANSFER],
    promotionStatus: { kind: "not_evaluated", reason: "cart_line_limit" },
    appliedPromotions: [],
    rejectedPromotions: [],
    gifts: [],
    progressMessages: [PROMOTION_CART_LINE_LIMIT_MESSAGE],
  };
  assert.deepEqual(parsePublicCheckoutQuoteV2(limited), limited);
  assert.throws(() => parsePublicCheckoutQuoteV2({
    ...limited,
    promotionStatus: { kind: "evaluated" },
    progressMessages: [],
  }));
  assert.throws(() => parsePublicCheckoutQuoteV2({
    ...DISCOUNTED_QUOTE,
    promotionStatus: { kind: "not_evaluated", reason: "cart_line_limit" },
    appliedPromotions: [],
    rejectedPromotions: [],
    gifts: [],
    progressMessages: [PROMOTION_CART_LINE_LIMIT_MESSAGE],
    cart: { ...DISCOUNTED_CART, lineDiscountCents: 0, discountCents: 0, totalCents: CART.totalCents,
      items: [{ ...DISCOUNTED_LINE, discountCents: 0, payableCents: DISCOUNTED_LINE.lineTotalCents }] },
  }));
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

test("V2 receipt preserves frozen public discounted facts without weakening V1", () => {
  const receipt = {
    ...RECEIPT,
    lineDiscountCents: DISCOUNTED_CART.lineDiscountCents,
    shippingDiscountCents: DISCOUNTED_CART.shippingDiscountCents,
    discountCents: DISCOUNTED_CART.discountCents,
    totalCents: DISCOUNTED_CART.totalCents,
    items: DISCOUNTED_QUOTE.cart.items,
    promotionStatus: DISCOUNTED_QUOTE.promotionStatus,
    appliedPromotions: DISCOUNTED_QUOTE.appliedPromotions,
    gifts: DISCOUNTED_QUOTE.gifts,
  };
  assert.deepEqual(parsePublicCheckoutReceiptV2(receipt), receipt);
  assert.throws(() => parsePublicCheckoutReceipt(receipt));
  assert.throws(() => parsePublicCheckoutReceiptV2({ ...receipt, totalCents: 1 }));
  assert.throws(() => parsePublicCheckoutReceiptV2({
    ...receipt,
    appliedPromotions: [{ ...APPLIED_PROMOTION, version: 1 }],
  }));
});

test("V2 receipt accepts twenty evaluated merchandise lines plus a same-variant frozen auto-added gift line", () => {
  const merchandise = Array.from({ length: 20 }, (_, index) => {
    const suffix = String(index + 1).padStart(12, "0");
    return {
      productId: `20000000-0000-4000-8000-${suffix}`,
      variantId: `30000000-0000-4000-8000-${suffix}`,
      slug: `evaluated-line-${index + 1}`,
      title: `Evaluated line ${index + 1}`,
      variantTitle: "Default",
      quantity: 1,
      unitPriceCents: 100,
      lineTotalCents: 100,
      discountCents: 5,
      payableCents: 95,
      available: true,
    };
  });
  const giftVariantId = merchandise[0]!.variantId;
  const giftLine = {
    productId: merchandise[0]!.productId,
    variantId: giftVariantId,
    slug: "frozen-auto-added-gift",
    title: "Frozen auto-added gift",
    variantTitle: "Default",
    quantity: 1,
    unitPriceCents: 0,
    lineTotalCents: 0,
    discountCents: 0,
    payableCents: 0,
    available: true,
  };
  const receipt = {
    ...RECEIPT,
    paymentStatus: "completed",
    paymentMethod: HOSTED_CARD,
    subtotalCents: 2_000,
    lineDiscountCents: 100,
    shippingDiscountCents: 0,
    discountCents: 100,
    totalCents: 1_900,
    items: [...merchandise, giftLine],
    promotionStatus: { kind: "evaluated" },
    appliedPromotions: [{
      name: "Twenty-line promotion",
      benefitKind: "percentage",
      lineDiscountCents: 100,
      shippingDiscountCents: 0,
      discountCents: 100,
    }],
    gifts: [{ variantId: giftVariantId, quantity: 1, autoAdd: true }],
  };
  assert.deepEqual(parsePublicCheckoutReceiptV2(receipt), receipt);
});

test("V2 receipt accepts exact 9,999-unit chunks for a 10,000-unit same-variant auto-added gift", () => {
  const paidLine = {
    ...CART_LINE,
    discountCents: 0,
    payableCents: CART_LINE.lineTotalCents,
  };
  const giftLine = {
    ...paidLine,
    slug: "chunked-auto-added-gift",
    title: "Chunked auto-added gift",
    variantTitle: "Gift",
    quantity: 9_999,
    unitPriceCents: 0,
    lineTotalCents: 0,
    payableCents: 0,
  };
  const receipt = {
    ...RECEIPT,
    paymentStatus: "completed" as const,
    paymentMethod: HOSTED_CARD,
    lineDiscountCents: 0,
    shippingDiscountCents: 0,
    discountCents: 0,
    items: [paidLine, giftLine, { ...giftLine, quantity: 1 }],
    promotionStatus: { kind: "evaluated" as const },
    appliedPromotions: [{
      name: "Chunked gift",
      benefitKind: "gift" as const,
      lineDiscountCents: 0,
      shippingDiscountCents: 0,
      discountCents: 0,
    }],
    gifts: [{ variantId: VARIANT_ID, quantity: 10_000, autoAdd: true }],
  };
  assert.deepEqual(parsePublicCheckoutReceiptV2(receipt), receipt);
  assert.throws(() => parsePublicCheckoutReceiptV2({
    ...receipt,
    items: [paidLine, giftLine, { ...giftLine, quantity: 2 }],
  }));
  assert.throws(() => parsePublicCheckoutReceiptV2({
    ...receipt,
    items: [paidLine, { ...giftLine, quantity: 1 }, giftLine],
  }));
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
