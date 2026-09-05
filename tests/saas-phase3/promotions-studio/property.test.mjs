import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { allocatePromotionDiscount, cappedPaidLineRefundMinor } from "../../../packages/saas-data/src/promotions/allocation.ts";

function generator(seed) {
  let state = seed >>> 0;
  return (maximum) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % maximum;
  };
}

function uuid(index) {
  return `70000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

test("bounded allocation combinations preserve money caps and deterministic input-order invariants", () => {
  for (let seed = 1; seed <= 256; seed += 1) {
    const next = generator(seed);
    const lines = Array.from({ length: 1 + next(20) }, (_, index) => {
      const kind = next(7) === 0 ? "gift" : next(9) === 0 ? "buy_x_get_y_free" : "sale";
      const eligibleMinor = kind === "sale" ? next(20_001) : 0;
      return { lineId: uuid(index + 1), position: next(100), currency: "TRY", eligibleMinor, paidNetMinor: eligibleMinor, kind };
    });
    const discountMinor = next(100_001), orderMaximumMinor = next(100_001);
    const input = { currency: "TRY", discountMinor, orderMaximumMinor, lines };
    const forward = allocatePromotionDiscount(input);
    const reverse = allocatePromotionDiscount({ ...input, lines: [...lines].reverse() });
    assert.deepEqual(reverse, forward, `seed ${seed} must be independent from input order`);
    const eligibleTotal = lines.reduce((total, line) => total + line.eligibleMinor, 0);
    const allocated = forward.lineAllocations.reduce((total, line) => total + line.discountMinor, 0);
    assert.equal(allocated, forward.appliedDiscountMinor, `seed ${seed} must reconcile`);
    assert.ok(forward.appliedDiscountMinor >= 0 && forward.appliedDiscountMinor <= eligibleTotal, `seed ${seed} must cap eligible value`);
    assert.ok(forward.appliedDiscountMinor <= discountMinor && forward.appliedDiscountMinor <= orderMaximumMinor, `seed ${seed} must cap request and order`);
    for (const allocation of forward.lineAllocations) {
      const source = lines.find((line) => line.lineId === allocation.lineId);
      assert.ok(source && allocation.discountMinor >= 0 && allocation.discountMinor <= source.eligibleMinor, `seed ${seed} line cap`);
    }
  }
});

test("bounded refund combinations never return more cash than the captured paid remainder", () => {
  for (let seed = 257; seed <= 512; seed += 1) {
    const next = generator(seed);
    const capturedPaidNetMinor = next(100_001);
    const alreadyRefundedMinor = next(capturedPaidNetMinor + 1);
    const requestedCashRefundMinor = next(200_001);
    const result = cappedPaidLineRefundMinor({ lineKind: "sale", capturedPaidNetMinor, alreadyRefundedMinor, requestedCashRefundMinor });
    assert.ok(result >= 0 && result <= requestedCashRefundMinor, `seed ${seed} request cap`);
    assert.ok(result <= capturedPaidNetMinor - alreadyRefundedMinor, `seed ${seed} captured cap`);
  }
});

test("the registered PostgreSQL rehearsal owns lifecycle tenant simulation and client-authority invariants", async () => {
  const source = await readFile(new URL("./postgres-harness.mjs", import.meta.url), "utf8");
  for (const proof of [
    "draft rules never apply",
    "schedule starts inclusively and ends exclusively",
    "cross-tenant promotion identity remains indistinguishable from not found",
    "limits include committed and unexpired reserved use and budget",
    "selected simulation preserves schedule and reference safety and mutates no durable relation",
    "V2 quote is read-only and freezes exact discount and aggregate gift-stock authority",
  ]) assert.match(source, new RegExp(proof.replaceAll(" ", "\\s+"), "iu"), proof);
});
