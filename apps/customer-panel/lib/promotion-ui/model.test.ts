import assert from "node:assert/strict";
import test from "node:test";

import {
  PROMOTION_TEMPLATES,
  UNSELECTED_GIFT_VARIANT,
  WIZARD_STEPS,
  changePromotionAudience,
  changePromotionBenefit,
  createPromotionDraft,
  decimalToHundredths,
  formatPromotionMinor,
  isoToZonedLocalInput,
  promotionDraftSnapshot,
  promotionDraftFromDetail,
  promotionSummary,
  publishEligibility,
  promotionRuleDocument,
  selectPromotionTarget,
  synchronizePromotionBenefitTargets,
  updatePromotionDraft,
  validatePromotionDraft,
  zonedLocalInputToIso,
  zonedCivilDayStartToIso,
  type PromotionDraft,
} from "./model.ts";

const PRODUCT_ID = "00000000-0000-4000-8000-000000000011";

test("ships the twelve merchant campaign templates and exactly five customer questions", () => {
  assert.deepEqual(PROMOTION_TEMPLATES.map((template) => template.id), [
    "first_paid_order_percentage", "basket_threshold_fixed_amount", "free_shipping", "buy_x_get_y",
    "quantity_tiers", "category_percentage", "bundle_price", "gift", "abandoned_cart", "vip", "influencer_code", "custom",
  ]);
  assert.deepEqual(WIZARD_STEPS, [
    "Müşteri ne kazanacak?", "Nerede geçerli olacak?", "Kimler kullanabilecek?", "Ne zaman ve hangi sınırlarla?", "Sonucu kontrol edin ve yayınlayın",
  ]);
});

test("template presets match the merchant-facing examples and keep the missing gift reference non-serializable", () => {
  const first = createPromotionDraft("first_paid_order_percentage");
  const basket = createPromotionDraft("basket_threshold_fixed_amount");
  const shipping = createPromotionDraft("free_shipping");
  const quantity = createPromotionDraft("quantity_tiers");
  const category = createPromotionDraft("category_percentage");
  const gift = createPromotionDraft("gift");

  assert.deepEqual(first.benefit, { kind: "percentage", percentageBps: 1_000 });
  assert.equal(first.audience, "first_paid_order");
  assert.deepEqual(basket.benefit, { kind: "fixed_amount", amountMinor: 10_000, currency: "TRY" });
  assert.equal(basket.minimumBasketMinor, 100_000);
  assert.equal(shipping.minimumBasketMinor, 75_000);
  assert.deepEqual(quantity.tiers, [{ minimumQuantity: 3, percentageBps: 1_500 }]);
  assert.deepEqual(category.benefit, { kind: "percentage", percentageBps: 2_000 });
  assert.equal(gift.minimumBasketMinor, 500_000);
  assert.equal(gift.benefit.kind, "gift");
  assert.equal(gift.benefit.kind === "gift" ? gift.benefit.giftVariantId : null, UNSELECTED_GIFT_VARIANT);
  assert.equal(gift.selectedTargets.length, 0);
  assert.equal(first.perCustomerUsage, 1);
});

test("changing the benefit never erases fields already entered in another wizard step", () => {
  const original = updatePromotionDraft(createPromotionDraft("custom"), {
    name: "Korunan kampanya",
    minimumBasketMinor: 123_400,
    audience: "customer_tags",
    audienceIds: ["00000000-0000-4000-8000-0000000000ab"],
  });
  const changed = changePromotionBenefit(original, "free_shipping");
  assert.equal(changed.name, original.name);
  assert.equal(changed.minimumBasketMinor, original.minimumBasketMinor);
  assert.equal(changed.audience, original.audience);
  assert.deepEqual(changed.audienceIds, original.audienceIds);
  assert.deepEqual(changed.benefit, { kind: "free_shipping" });
});

test("money formatting preserves every safe-integer minor unit without floating point loss", () => {
  assert.equal(formatPromotionMinor(123_456, "TRY"), "1.234,56\u00a0TRY");
  assert.equal(formatPromotionMinor(Number.MAX_SAFE_INTEGER, "TRY"), "90.071.992.547.409,91\u00a0TRY");
  assert.throws(() => formatPromotionMinor(1.5, "TRY"));
  assert.throws(() => formatPromotionMinor(1, "try"));
});

test("leaving a template intent removes only its template-specific requirement", () => {
  const category = changePromotionBenefit(createPromotionDraft("category_percentage"), "free_shipping");
  const vip = changePromotionAudience(createPromotionDraft("vip"), "everyone");
  assert.equal(category.templateId, "custom");
  assert.equal(vip.templateId, "custom");
  assert.deepEqual(validatePromotionDraft(category), []);
  assert.deepEqual(validatePromotionDraft(vip), []);
});

test("converts datetime-local values in the store timezone and round-trips across DST zones", () => {
  assert.equal(zonedLocalInputToIso("2026-09-05T12:30", "Europe/Istanbul"), "2026-09-05T09:30:00.000Z");
  assert.equal(isoToZonedLocalInput("2026-09-05T09:30:00.000Z", "Europe/Istanbul"), "2026-09-05T12:30");
  assert.equal(isoToZonedLocalInput("2026-07-05T16:30:00.000Z", "America/New_York"), "2026-07-05T12:30");
  assert.throws(() => zonedLocalInputToIso("2026-03-08T02:30", "America/New_York"), /promotion_local_time_invalid/);
});

test("uses the first representable instant for civil dates whose local midnight is skipped", () => {
  assert.equal(zonedCivilDayStartToIso("2026-09-06", "America/Santiago"), "2026-09-06T04:00:00.000Z");
  assert.equal(zonedCivilDayStartToIso("2026-09-07", "America/Santiago"), "2026-09-07T03:00:00.000Z");
});

test("converts decimal form values to exact minor units without binary floating point drift", () => {
  assert.equal(decimalToHundredths("0.07"), 7);
  assert.equal(decimalToHundredths("1234.5"), 123450);
  assert.equal(decimalToHundredths("1.234"), undefined);
  assert.equal(decimalToHundredths("90071992547410"), undefined);
});

test("keeps an edited controlled value when the merchant moves between wizard steps", () => {
  const first = createPromotionDraft("first_paid_order_percentage");
  const named = updatePromotionDraft(first, { name: "İlk alışverişe %15" });
  const stepped = updatePromotionDraft(named, { step: 4 });

  assert.equal(stepped.name, "İlk alışverişe %15");
  assert.equal(stepped.step, 4);
  assert.equal(first.name, "İlk alışveriş indirimi");
});

test("creates a canonical dirty snapshot independent of selection order", () => {
  const first = updatePromotionDraft(createPromotionDraft("category_percentage"), {
    codeInput: "BAHAR15",
    selectedTargets: [
      { kind: "category", id: "00000000-0000-4000-8000-000000000021", label: "Bahar", status: "active" },
      { kind: "category", id: "00000000-0000-4000-8000-000000000020", label: "Yaz", status: "active" },
    ],
  });
  const second = updatePromotionDraft(createPromotionDraft("category_percentage"), {
    codeInput: "BAHAR15",
    selectedTargets: [...first.selectedTargets].reverse(),
  });

  assert.equal(promotionDraftSnapshot(first), promotionDraftSnapshot(second));
});

test("canonical dirty identity ignores ordering for every set-like rule field", () => {
  const first = updatePromotionDraft(createPromotionDraft("custom"), {
    triggerKind: "code", codeInput: "B", codes: ["B", "A"],
    audienceIds: ["00000000-0000-4000-8000-0000000000ab", "00000000-0000-4000-8000-0000000000aa"],
    combinationKind: "benefit_classes", combinationBenefitClasses: ["free_shipping", "percentage"],
    paymentMethodIds: ["00000000-0000-4000-8000-0000000000ad", "00000000-0000-4000-8000-0000000000ac"],
    shippingMethodIds: ["00000000-0000-4000-8000-0000000000af", "00000000-0000-4000-8000-0000000000ae"],
    salesChannels: ["storefront", "quick_order"],
  });
  const second = updatePromotionDraft(first, {
    codes: [...first.codes].reverse(), audienceIds: [...first.audienceIds].reverse(),
    combinationBenefitClasses: [...first.combinationBenefitClasses].reverse(), paymentMethodIds: [...first.paymentMethodIds].reverse(),
    shippingMethodIds: [...first.shippingMethodIds].reverse(), salesChannels: [...first.salesChannels].reverse(),
  });
  assert.equal(promotionDraftSnapshot(first), promotionDraftSnapshot(second));
});

test("dirty identity is total for invalid codes and ignores dormant controls that are not persisted", () => {
  const invalid = updatePromotionDraft(createPromotionDraft("influencer_code"), { codeInput: "bad code" });
  assert.doesNotThrow(() => promotionDraftSnapshot(invalid));
  const automatic = updatePromotionDraft(createPromotionDraft("custom"), { codeInput: "LATENT", codes: ["LATENT"], audienceIds: ["00000000-0000-4000-8000-0000000000aa"], combinationBenefitClasses: ["gift"], maximumMarginPercentageBps: 5_000 });
  const cleared = updatePromotionDraft(automatic, { codeInput: "", codes: [], audienceIds: [], combinationBenefitClasses: [], maximumMarginPercentageBps: 0 });
  assert.equal(promotionDraftSnapshot(automatic), promotionDraftSnapshot(cleared));
});

test("rejects coupon whitespace and retains the shared Turkish code normalization", () => {
  const spaced = updatePromotionDraft(createPromotionDraft("influencer_code"), { codeInput: " BAHAR15" });
  const turkish = updatePromotionDraft(createPromotionDraft("influencer_code"), { codeInput: "ışık_şenliği" });

  assert.deepEqual(validatePromotionDraft(spaced), ["Kupon kodunda yalnız büyük harf, rakam, tire ve alt çizgi kullanın."]);
  assert.deepEqual(promotionRuleDocument(turkish).trigger, { kind: "code", codes: ["ISIK_SENLIGI"] });
});

test("keeps the merchant's explicit automatic or code trigger choice", () => {
  const code = updatePromotionDraft(createPromotionDraft("custom"), { triggerKind: "code", codeInput: "ışık10" });
  assert.deepEqual(promotionRuleDocument(code).trigger, { kind: "code", codes: ["ISIK10"] });
  const automatic = updatePromotionDraft(code, { triggerKind: "automatic" });
  assert.deepEqual(promotionRuleDocument(automatic).trigger, { kind: "automatic" });
  assert.equal(automatic.codeInput, "ışık10", "switching back must not erase the merchant's draft code");
});

test("rejects duplicate normalized codes instead of silently dropping merchant input", () => {
  const duplicate = updatePromotionDraft(createPromotionDraft("influencer_code"), {
    codeInput: "ışık10",
    codes: ["ISIK10", "ışık10"],
  });
  assert.deepEqual(validatePromotionDraft(duplicate), ["Kupon kodları birbirinden farklı olmalı."]);
  assert.throws(() => promotionRuleDocument(duplicate));
});

test("editing the primary code in a multi-code detail preserves every other code", () => {
  const detail = promotionRuleDocument(updatePromotionDraft(createPromotionDraft("influencer_code"), { codeInput: "ZETA", codes: ["ZETA", "ALPHA"] }));
  const hydrated = promotionDraftFromDetail({ name: "Kodlar", ruleDocument: detail });
  const changed = updatePromotionDraft(hydrated, { codeInput: "BETA" });
  assert.deepEqual(promotionRuleDocument(changed).trigger, { kind: "code", codes: ["BETA", "ALPHA"] });
});

test("changing eligibility targets and exclusions preserves independent selected-product X/Y rewards", () => {
  const rewardProduct = "00000000-0000-4000-8000-0000000000a1";
  const eligibleProduct = "00000000-0000-4000-8000-0000000000a2";
  const excludedCategory = "00000000-0000-4000-8000-0000000000b2";
  const source = updatePromotionDraft(createPromotionDraft("custom"), {
    benefit: {
      kind: "buy_x_get_y",
      buyQuantity: 2,
      receiveQuantity: 1,
      discountPercentageBps: 10_000,
      reward: { strategy: "selected_products_cheapest", productIds: [rewardProduct] },
    },
    selectedTargets: [{ kind: "product", id: eligibleProduct, label: "Uygun", status: "active" }],
  });
  const current = promotionDraftFromDetail({ name: "Bağımsız X/Y", ruleDocument: promotionRuleDocument(source) });
  const exclusionChanged = updatePromotionDraft(current, {
    selectedTargets: [],
    excludedTargets: [{ kind: "category", id: excludedCategory, label: "Hariç", status: "active" }],
  });
  const next = synchronizePromotionBenefitTargets(current, exclusionChanged);
  assert.deepEqual(next.benefit, current.benefit);
  assert.deepEqual(next.rewardTargets.map((item) => item.id), [rewardProduct]);
  const serialized = promotionRuleDocument(next);
  assert.deepEqual(serialized.targets.include, []);
  assert.deepEqual(serialized.benefit.kind === "buy_x_get_y" && serialized.benefit.reward.strategy === "selected_products_cheapest" ? serialized.benefit.reward.productIds : [], [rewardProduct]);
});

test("editing a primary code to an existing secondary code stays dirty and is rejected as a duplicate", () => {
  const original = updatePromotionDraft(createPromotionDraft("custom"), { triggerKind: "code", codeInput: "ALPHA", primaryCodeBaseline: "ALPHA", codes: ["ALPHA", "BETA"] });
  const duplicate = updatePromotionDraft(original, { codeInput: "BETA" });
  assert.notEqual(promotionDraftSnapshot(duplicate), promotionDraftSnapshot(original));
  assert.match(validatePromotionDraft(duplicate).join(" "), /birbirinden farklı/);
  assert.throws(() => promotionRuleDocument(duplicate));
});

test("dirty identity ignores displayed target labels and statuses but keeps byte-stable target identity", () => {
  const id = "00000000-0000-4000-8000-0000000000aa";
  const active = updatePromotionDraft(createPromotionDraft("custom"), { selectedTargets: [{ kind: "product", id, label: "İlk ad", status: "active" }] });
  const relabelled = updatePromotionDraft(createPromotionDraft("custom"), { selectedTargets: [{ kind: "product", id, label: "Yeni etiket", status: "unavailable" }] });
  assert.equal(promotionDraftSnapshot(active), promotionDraftSnapshot(relabelled));
});

test("blocks incomplete template-specific gifts, bundles, categories, and VIP audience references", () => {
  const gift = createPromotionDraft("gift");
  const bundle = createPromotionDraft("bundle_price");
  const category = createPromotionDraft("category_percentage");
  const vip = createPromotionDraft("vip");
  for (const draft of [gift, bundle, category, vip]) assert.equal(publishEligibility(draft, { conflictsReady: true, conflictsBlocking: false, marginReady: true }).canPublish, false);
});

test("never serializes the draft-only gift placeholder as a real product reference", () => {
  const gift = createPromotionDraft("gift");
  assert.match(validatePromotionDraft(gift).join(" "), /gerçek bir varyant/);
  assert.throws(() => promotionRuleDocument(gift), /promotion_gift_reference_required/);
});

test("fails publication closed for strict-parser and cross-field invalid values", () => {
  const values: PromotionDraft[] = [
    updatePromotionDraft(createPromotionDraft("custom"), { benefit: { kind: "percentage", percentageBps: 0 } }),
    updatePromotionDraft(createPromotionDraft("custom"), { minimumBasketMinor: -1 }),
    updatePromotionDraft(createPromotionDraft("custom"), { audience: "customer_tags", audienceIds: [] }),
    updatePromotionDraft(createPromotionDraft("custom"), { combinationKind: "benefit_classes", combinationBenefitClasses: [] }),
    updatePromotionDraft(createPromotionDraft("quantity_tiers"), { tiers: [{ minimumQuantity: 1.5, percentageBps: 1_000 }] }),
    updatePromotionDraft(createPromotionDraft("custom"), { name: ` ${"x".repeat(201)}` }),
  ];
  for (const value of values) assert.equal(publishEligibility(value, { conflictsReady: true, conflictsBlocking: false, marginReady: true }).canPublish, false);
});

test("hydrates and reserializes every valid benefit family without losing fields", () => {
  const A = "00000000-0000-4000-8000-0000000000a1", B = "00000000-0000-4000-8000-0000000000b2";
  const target = (id: string) => ({ kind: "variant" as const, id, label: id, status: "active" as const });
  const drafts = [
    updatePromotionDraft(createPromotionDraft("custom"), { benefit: { kind: "percentage", percentageBps: 2_500 } }),
    updatePromotionDraft(createPromotionDraft("custom"), { benefit: { kind: "fixed_amount", amountMinor: 12_345, currency: "TRY" } }),
    updatePromotionDraft(createPromotionDraft("custom"), { benefit: { kind: "free_shipping" } }),
    updatePromotionDraft(createPromotionDraft("custom"), { benefit: { kind: "buy_x_get_y", buyQuantity: 3, receiveQuantity: 2, discountPercentageBps: 5_000, reward: { strategy: "same_product_cheapest" } } }),
    updatePromotionDraft(createPromotionDraft("custom"), { benefit: { kind: "quantity_tiers", tiers: [{ minimumQuantity: 2, percentageBps: 1_000 }] }, tiers: [{ minimumQuantity: 2, percentageBps: 1_000 }, { minimumQuantity: 4, percentageBps: 2_000 }] }),
    updatePromotionDraft(createPromotionDraft("custom"), { benefit: { kind: "bundle_price", items: [{ variantId: A, quantity: 1 }, { variantId: B, quantity: 2 }], bundlePriceMinor: 99_900, currency: "TRY" }, selectedTargets: [target(A), target(B)] }),
    updatePromotionDraft(createPromotionDraft("custom"), { benefit: { kind: "gift", giftVariantId: A, quantity: 2, autoAdd: false } }),
  ];
  for (const draft of drafts) { const rule = promotionRuleDocument(draft); assert.deepEqual(promotionRuleDocument(promotionDraftFromDetail({ name: "Tur", ruleDocument: rule })), rule); }
});

test("serializes the complete rule surface through the shared strict parser", () => {
  const id = "00000000-0000-4000-8000-0000000000aa";
  const draft = updatePromotionDraft(createPromotionDraft("custom"), {
    selectedTargets: [{ kind: "product", id, label: "Ürün", status: "active" }],
    excludedTargets: [{ kind: "category", id: "00000000-0000-4000-8000-0000000000ab", label: "Hariç", status: "active" }],
    combinationKind: "benefit_classes", combinationBenefitClasses: ["free_shipping"], marginPolicy: "maximum_percentage", maximumMarginPercentageBps: 2_500,
    paymentMethodIds: ["00000000-0000-4000-8000-0000000000ac"], shippingMethodIds: ["00000000-0000-4000-8000-0000000000ad"], salesChannels: ["storefront"],
  });
  const rule = promotionRuleDocument(draft);
  assert.deepEqual(rule.combinationPolicy, { kind: "benefit_classes", benefitClasses: ["free_shipping"] });
  assert.deepEqual(rule.marginPolicy, { kind: "maximum_percentage", maximumPercentageBps: 2_500 });
  assert.deepEqual(rule.conditions.paymentMethodIds, ["00000000-0000-4000-8000-0000000000ac"]);
});

test("rejects fractional wizard steps and bounded numeric fields instead of silently clamping them", () => {
  assert.throws(() => updatePromotionDraft(createPromotionDraft("custom"), { step: 1.5 }), /promotion_draft_invalid/);
  assert.throws(() => updatePromotionDraft(createPromotionDraft("custom"), { priority: 1_001 }), /promotion_draft_invalid/);
});

test("does not mark wizard navigation or collapsed settings as unsaved rule changes", () => {
  const draft = createPromotionDraft("custom");
  assert.equal(promotionDraftSnapshot(draft), promotionDraftSnapshot(updatePromotionDraft(draft, { step: 4, advancedOpen: true })));
});

test("hydrates a persisted detail into a lossless editable rule", () => {
  const detail = {
    id: "00000000-0000-4000-8000-0000000000aa", version: 3, name: "VIP", status: "paused",
    ruleDocument: promotionRuleDocument(updatePromotionDraft(createPromotionDraft("custom"), { triggerKind: "code", codeInput: "VIP15", codes: ["VIP15", "VIP20"], audience: "customer_tags", audienceIds: ["00000000-0000-4000-8000-0000000000ab"] })),
    createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z",
  } as const;
  const hydrated = promotionDraftFromDetail(detail);
  assert.equal(hydrated.name, "VIP");
  assert.deepEqual(promotionRuleDocument(hydrated), detail.ruleDocument);
});

test("reports code, date, tier, and cross-field validation in merchant language", () => {
  const invalid = updatePromotionDraft(createPromotionDraft("quantity_tiers"), {
    triggerKind: "code",
    codeInput: "bahar kodu",
    startsAt: "2026-09-10T10:00:00.000Z",
    endsAt: "2026-09-09T10:00:00.000Z",
    tiers: [{ minimumQuantity: 4, percentageBps: 1_000 }, { minimumQuantity: 4, percentageBps: 2_000 }],
    totalUsage: 0,
    perCustomerUsage: 1,
  });

  assert.deepEqual(validatePromotionDraft(invalid), [
    "Kupon kodunda yalnız büyük harf, rakam, tire ve alt çizgi kullanın.",
    "Bitiş zamanı başlangıçtan sonra olmalı.",
    "Kademe adetleri artan ve birbirinden farklı olmalı.",
    "Toplam kullanım sınırı müşteri başı sınırdan küçük olamaz.",
  ]);
});

test("preserves unavailable resolved selections but never adds them as targets", () => {
  const draft = createPromotionDraft("custom");
  const unavailable = { kind: "product" as const, id: PRODUCT_ID, label: "Arşivlenmiş ürün", status: "unavailable" as const };

  assert.equal(selectPromotionTarget(draft, unavailable).selectedTargets.length, 0);
  const resolved = updatePromotionDraft(draft, { selectedTargets: [unavailable] });
  assert.deepEqual(resolved.selectedTargets, [unavailable]);
});

test("creates a plain-language live story and blocks publishing until checks are ready", () => {
  const draft = updatePromotionDraft(createPromotionDraft("free_shipping"), { name: "Hafta sonu kargo" });

  assert.equal(promotionSummary(draft), "Hafta sonu kargo: herkes için ücretsiz kargo.");
  assert.deepEqual(publishEligibility(draft, { conflictsReady: false, conflictsBlocking: false, marginReady: false }), {
    canPublish: false,
    reason: "Yayınlamadan önce kontrol sonuçlarını bekleyin.",
  });
  assert.deepEqual(publishEligibility(draft, { conflictsReady: true, conflictsBlocking: true, marginReady: true }), {
    canPublish: false,
    reason: "Çakışan bir kampanya varken yayınlayamazsınız.",
  });
});
