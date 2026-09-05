import assert from "node:assert/strict";
import test from "node:test";

import { parsePublicCheckoutQuoteV2 } from "@celebix/saas-contracts";

const PRODUCT = "10000000-0000-4000-8000-000000000001";
const VARIANT = "20000000-0000-4000-8000-000000000001";
const GIFT_PRODUCT = "10000000-0000-4000-8000-000000000002";
const GIFT_VARIANT = "20000000-0000-4000-8000-000000000002";

function quote(overrides: Readonly<Record<string, unknown>> = {}) {
  return parsePublicCheckoutQuoteV2({
    cart: {
      version: 4,
      currency: "TRY",
      itemCount: 1,
      subtotalCents: 1_000,
      shippingCents: 100,
      lineDiscountCents: 200,
      shippingDiscountCents: 50,
      discountCents: 250,
      totalCents: 850,
      checkoutReady: true,
      checkoutBlocker: null,
      items: [
        {
          productId: PRODUCT,
          variantId: VARIANT,
          slug: "deri-canta",
          title: "Deri çanta",
          variantTitle: "Taba",
          quantity: 1,
          unitPriceCents: 1_000,
          lineTotalCents: 1_000,
          discountCents: 200,
          payableCents: 800,
          available: true,
        },
        {
          productId: GIFT_PRODUCT,
          variantId: GIFT_VARIANT,
          slug: "hediye-kartlik",
          title: "Hediye kartlık",
          variantTitle: "Standart",
          quantity: 1,
          unitPriceCents: 0,
          lineTotalCents: 0,
          discountCents: 0,
          payableCents: 0,
          available: true,
        },
      ],
    },
    paymentMethods: [],
    promotionStatus: { kind: "evaluated" },
    appliedPromotions: [
      {
        name: "Sepette yüzde yirmi",
        benefitKind: "percentage",
        lineDiscountCents: 200,
        shippingDiscountCents: 0,
        discountCents: 200,
      },
      {
        name: "Üyelere kargo",
        benefitKind: "free_shipping",
        normalizedCode: "UYELIK",
        lineDiscountCents: 0,
        shippingDiscountCents: 50,
        discountCents: 50,
      },
    ],
    rejectedPromotions: [],
    gifts: [{ variantId: GIFT_VARIANT, quantity: 1, autoAdd: true }],
    progressMessages: ["Bir ürün daha ekleyin.", "Kargo indirimi için 100 TL kaldı."],
    ...overrides,
  });
}

const modulePromise = import("./model.ts").catch(() => null);

test("promotion presentation projects only strict server facts, labels deterministic gifts and two hints", async () => {
  const module = await modulePromise;
  assert.ok(module, "promotion model must exist");
  const result = module.buildPromotionPresentation(quote());

  assert.deepEqual(result.discountFacts, {
    lineDiscountCents: 200,
    shippingDiscountCents: 50,
    discountCents: 250,
    totalCents: 850,
  });
  assert.deepEqual(result.labels, [
    { label: "Sepette yüzde yirmi", trigger: "automatic" },
    { label: "Üyelere kargo", trigger: "code", normalizedCode: "UYELIK" },
  ]);
  assert.deepEqual(result.gifts, [
    { variantId: GIFT_VARIANT, quantity: 1, title: "Hediye kartlık", variantTitle: "Standart" },
  ]);
  assert.deepEqual(result.progressMessages, [
    "Bir ürün daha ekleyin.",
    "Kargo indirimi için 100 TL kaldı.",
  ]);
  assert.equal(Object.isFrozen(result), true);
});

test("promotion presentation hides unavailable and non-auto-added gifts", async () => {
  const module = await modulePromise;
  assert.ok(module, "promotion model must exist");
  const noGift = parsePublicCheckoutQuoteV2({
    cart: {
      version: 1,
      currency: "TRY",
      itemCount: 1,
      subtotalCents: 1_000,
      shippingCents: 0,
      lineDiscountCents: 0,
      shippingDiscountCents: 0,
      discountCents: 0,
      totalCents: 1_000,
      checkoutReady: true,
      checkoutBlocker: null,
      items: [{
        productId: PRODUCT,
        variantId: VARIANT,
        slug: "deri-canta",
        title: "Deri çanta",
        variantTitle: "Taba",
        quantity: 1,
        unitPriceCents: 1_000,
        lineTotalCents: 1_000,
        discountCents: 0,
        payableCents: 1_000,
        available: true,
      }],
    },
    paymentMethods: [],
    promotionStatus: { kind: "evaluated" },
    appliedPromotions: [],
    rejectedPromotions: [],
    gifts: [{ variantId: GIFT_VARIANT, quantity: 1, autoAdd: false }],
    progressMessages: [],
  });

  assert.deepEqual(module.buildPromotionPresentation(noGift).gifts, []);
});

test("every coupon rejection has one generic audience-safe message", async () => {
  const module = await modulePromise;
  assert.ok(module, "promotion model must exist");
  assert.equal(module.couponRejectionMessage("invalid_code"), "Bu kod şu anda uygulanamıyor.");
  assert.equal(module.couponRejectionMessage("not_eligible"), "Bu kod şu anda uygulanamıyor.");
  assert.doesNotMatch(module.couponRejectionMessage("not_eligible"), /audience|segment|campaign|müşteri|VIP/iu);
});

test("coupon normalization is syntax-only and canonical Turkish input never grants authority", async () => {
  const module = await modulePromise;
  assert.ok(module, "promotion model must exist");
  assert.equal(module.normalizeCouponCandidate("indirim_şölen"), "INDIRIM_SOLEN");
  assert.throws(() => module.normalizeCouponCandidate(" indirim "), /coupon_candidate_invalid/u);
});
