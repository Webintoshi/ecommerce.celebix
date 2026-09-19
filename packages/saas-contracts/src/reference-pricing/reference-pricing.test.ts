import assert from "node:assert/strict";
import test from "node:test";

import {
  parseReferenceDefinition,
  parseVariantPricingPolicy,
} from "./index.ts";

const USD_REFERENCE = "11111111-1111-4111-8111-111111111111";
const EUR_REFERENCE = "22222222-2222-4222-8222-222222222222";
const GOLD_REFERENCE = "33333333-3333-4333-8333-333333333333";

function usdReference() {
  return { id: USD_REFERENCE, kind: "usd", label: "USD satış", rateTry: "40.00000000" };
}

function goldReference() {
  return {
    id: GOLD_REFERENCE,
    kind: "gold_gram",
    label: "22 ayar gram satış",
    rateTry: "5000.00000000",
    referencePurity: "0.916667",
  };
}

function usdPolicy() {
  return { method: "usd", referenceId: USD_REFERENCE, sourceAmount: "125.00000000" };
}

function goldPolicy() {
  return {
    method: "gold_gram",
    referenceId: GOLD_REFERENCE,
    metalGrams: "2.500000",
    purityMode: "direct",
    laborMode: "per_item_try",
    laborAmount: "750.00",
    upliftPercent: "0",
    allowFullDiscount: false,
  };
}

test("manual reference definitions preserve canonical exact decimal strings", () => {
  const usd = parseReferenceDefinition(usdReference());
  const eur = parseReferenceDefinition({ id: EUR_REFERENCE, kind: "eur", label: "EUR satış", rateTry: "45" });
  const gold = parseReferenceDefinition(goldReference());
  assert.deepEqual(usd, usdReference());
  assert.equal(eur.rateTry, "45");
  assert.equal(gold.referencePurity, "0.916667");
  assert.equal(Object.isFrozen(usd), true);
  assert.equal(Object.isFrozen(gold), true);
});

test("reference definitions reject unknown fields and invalid tariff semantics", () => {
  assert.throws(() => parseReferenceDefinition({ ...usdReference(), storeId: GOLD_REFERENCE }));
  assert.throws(() => parseReferenceDefinition({ ...usdReference(), referencePurity: "1" }));
  assert.throws(() => parseReferenceDefinition({ ...goldReference(), kind: "try" }));
  assert.throws(() => parseReferenceDefinition({ ...goldReference(), label: " 22 ayar gram satış" }));
  assert.throws(() => parseReferenceDefinition({ ...goldReference(), referencePurity: "0" }));
  assert.throws(() => parseReferenceDefinition({ ...goldReference(), referencePurity: "1.000001" }));
});

test("reference rates are positive bounded plain decimal strings with eight fractional digits at most", () => {
  for (const rateTry of ["", "0", "0.00000000", "-1", "+1", "1e3", "NaN", "Infinity", "1,25", " 1", "1.", ".5", "1.000000001", "9007199254740992", 40]) {
    assert.throws(() => parseReferenceDefinition({ ...usdReference(), rateTry }), String(rateTry));
  }
  assert.equal(parseReferenceDefinition({ ...usdReference(), rateTry: "0.00000001" }).rateTry, "0.00000001");
});

test("fixed TRY is an explicit method switch with a bounded integer-cent amount", () => {
  const fixed = parseVariantPricingPolicy({ method: "fixed_try", fixedPriceCents: 12500 });
  assert.deepEqual(fixed, { method: "fixed_try", fixedPriceCents: 12500 });
  assert.equal(Object.isFrozen(fixed), true);
  assert.throws(() => parseVariantPricingPolicy({ method: "fixed_try", priceCents: 12500 }));
  assert.throws(() => parseVariantPricingPolicy({ method: "fixed_try", fixedPriceCents: 12500, referenceId: USD_REFERENCE }));
  for (const fixedPriceCents of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "12500"]) {
    assert.throws(() => parseVariantPricingPolicy({ method: "fixed_try", fixedPriceCents }));
  }
});

test("USD and EUR policies keep source amounts and reference identity, not precomputed TRY", () => {
  const usd = parseVariantPricingPolicy(usdPolicy());
  const eur = parseVariantPricingPolicy({ method: "eur", referenceId: EUR_REFERENCE, sourceAmount: "100" });
  assert.deepEqual(usd, usdPolicy());
  assert.equal(eur.sourceAmount, "100");
  assert.equal(Object.isFrozen(usd), true);
  assert.throws(() => parseVariantPricingPolicy({ ...usdPolicy(), fixedPriceCents: 500000 }));
  assert.throws(() => parseVariantPricingPolicy({ ...usdPolicy(), metalGrams: "2.5" }));
  assert.throws(() => parseVariantPricingPolicy({ ...usdPolicy(), referenceId: "not-a-uuid" }));
});

test("FX uplift applies to the reference component and accepts one fixed TRY labor amount", () => {
  const usd = parseVariantPricingPolicy({
    ...usdPolicy(),
    upliftPercent: "5.00000000",
    laborMode: "per_item_try",
    laborAmount: "750.00",
  });
  const eur = parseVariantPricingPolicy({
    method: "eur",
    referenceId: EUR_REFERENCE,
    sourceAmount: "100",
    upliftPercent: "0",
    laborMode: "none",
  });
  assert.equal(usd.upliftPercent, "5.00000000");
  assert.equal(usd.laborAmount, "750.00");
  assert.equal(eur.laborMode, "none");
  assert.equal(Object.hasOwn(eur, "laborAmount"), false);
  assert.throws(() => parseVariantPricingPolicy({ ...usdPolicy(), laborMode: "per_gram_try", laborAmount: "100" }));
  assert.throws(() => parseVariantPricingPolicy({ ...usdPolicy(), laborMode: "per_item_try", laborAmount: "-1" }));
  assert.throws(() => parseVariantPricingPolicy({ ...usdPolicy(), laborMode: "none", laborAmount: "750" }));
  assert.throws(() => parseVariantPricingPolicy({ ...usdPolicy(), upliftPercent: "1e2" }));
});

test("dynamic source amounts reject noncanonical, negative, and unsafe decimal values", () => {
  for (const sourceAmount of ["-1", "+1", "1e2", "NaN", "Infinity", "1,25", "1.000000001", "9007199254740992", 125]) {
    assert.throws(() => parseVariantPricingPolicy({ ...usdPolicy(), sourceAmount }), String(sourceAmount));
  }
  assert.equal(parseVariantPricingPolicy({ ...usdPolicy(), sourceAmount: "0" }).sourceAmount, "0");
});

test("direct gold pricing uses the selected tariff without implicit purity conversion", () => {
  const policy = parseVariantPricingPolicy(goldPolicy());
  assert.deepEqual(policy, goldPolicy());
  assert.equal(Object.isFrozen(policy), true);
  assert.throws(() => parseVariantPricingPolicy({ ...goldPolicy(), productPurity: "0.916667" }));
  assert.throws(() => parseVariantPricingPolicy({ ...goldPolicy(), sourceAmount: "2.5" }));
  assert.throws(() => parseVariantPricingPolicy({ ...goldPolicy(), fixedPriceCents: 1325000 }));
});

test("ratio gold pricing requires explicit product purity and excludes tariff purity from policy", () => {
  const ratio = parseVariantPricingPolicy({ ...goldPolicy(), purityMode: "ratio", productPurity: "0.750000" });
  assert.equal(ratio.productPurity, "0.750000");
  assert.throws(() => parseVariantPricingPolicy({ ...goldPolicy(), purityMode: "ratio" }));
  assert.throws(() => parseVariantPricingPolicy({ ...goldPolicy(), purityMode: "ratio", productPurity: "0" }));
  assert.throws(() => parseVariantPricingPolicy({ ...goldPolicy(), purityMode: "ratio", productPurity: "1.000001" }));
  assert.throws(() => parseVariantPricingPolicy({ ...goldPolicy(), referencePurity: "0.916667" }));
});

test("gold gram and labor parameters have one selected labor mode and bounded decimal precision", () => {
  assert.throws(() => parseVariantPricingPolicy({ ...goldPolicy(), metalGrams: "2.5000001" }));
  assert.throws(() => parseVariantPricingPolicy({ ...goldPolicy(), metalGrams: "-2" }));
  assert.throws(() => parseVariantPricingPolicy({ ...goldPolicy(), laborMode: "per_gram_try", laborAmount: "-1" }));
  assert.throws(() => parseVariantPricingPolicy({ ...goldPolicy(), laborMode: "per_gram_try", laborAmount: "1e3" }));
  assert.throws(() => parseVariantPricingPolicy({ ...goldPolicy(), laborMode: "both" }));
  assert.throws(() => parseVariantPricingPolicy({ ...goldPolicy(), laborMode: "none", laborAmount: "750" }));
  const { laborAmount: _omitted, ...withoutLaborAmount } = goldPolicy();
  const noLabor = parseVariantPricingPolicy({ ...withoutLaborAmount, laborMode: "none" });
  assert.equal(noLabor.laborMode, "none");
  assert.equal(Object.hasOwn(noLabor, "laborAmount"), false);
  assert.equal(parseVariantPricingPolicy({ ...goldPolicy(), laborMode: "per_gram_try", laborAmount: "125.50" }).laborMode, "per_gram_try");
});

test("gold full-discount permission defaults closed and uplift cannot be executable input", () => {
  const { allowFullDiscount: _omitted, ...withoutPermission } = goldPolicy();
  assert.equal(parseVariantPricingPolicy(withoutPermission).allowFullDiscount, false);
  assert.equal(parseVariantPricingPolicy({ ...goldPolicy(), allowFullDiscount: true }).allowFullDiscount, true);
  for (const upliftPercent of ["-1", "1e2", "NaN", "Infinity", "10/2", "1.000000001", 5]) {
    assert.throws(() => parseVariantPricingPolicy({ ...goldPolicy(), upliftPercent }), String(upliftPercent));
  }
  assert.throws(() => parseVariantPricingPolicy({ ...goldPolicy(), formula: "price * rate" }));
});

test("parsers reject accessors, symbols, and non-plain object prototypes without invoking getters", () => {
  let getterCalls = 0;
  const accessor = { ...usdReference() } as Record<string, unknown>;
  Object.defineProperty(accessor, "rateTry", { enumerable: true, get() { getterCalls += 1; return "40"; } });
  assert.throws(() => parseReferenceDefinition(accessor));
  assert.equal(getterCalls, 0);

  const symbolPolicy = { ...usdPolicy(), [Symbol("hidden")]: true };
  assert.throws(() => parseVariantPricingPolicy(symbolPolicy));
  assert.throws(() => parseReferenceDefinition(new (class { id = USD_REFERENCE; kind = "usd"; label = "USD"; rateTry = "40"; })()));
  assert.throws(() => parseVariantPricingPolicy(new (class { method = "fixed_try"; fixedPriceCents = 12500; })()));
});
