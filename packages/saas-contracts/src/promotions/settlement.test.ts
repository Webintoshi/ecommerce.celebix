import assert from "node:assert/strict";
import test from "node:test";

import { parsePromotionOrderSnapshot } from "./index.ts";

const PROMOTION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LINE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VARIANT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOW = "2026-09-05T10:00:00.000Z";

function snapshot() {
  return {
    promotionId: PROMOTION,
    promotionVersion: 1,
    promotionName: "Captured promotion",
    couponCode: "SAVE20",
    benefit: { kind: "buy_x_get_y", buyQuantity: 2, receiveQuantity: 1, discountPercentageBps: 10_000, reward: { strategy: "specific_variant", variantId: VARIANT } },
    targets: { mode: "all", include: [], exclude: [] },
    discountLines: [{
      lineId: LINE,
      position: 0,
      discountMinor: 100,
      capturedRanges: [
        { startOrdinal: 0, quantity: 2, grossUnitMinor: 100, discountUnitMinor: 0, kind: "sale" },
        { startOrdinal: 2, quantity: 1, grossUnitMinor: 100, discountUnitMinor: 100, kind: "buy_x_get_y" },
      ],
    }],
    shippingDiscountMinor: 0,
    giftLines: [],
    discountTotalMinor: 100,
    currency: "TRY",
    evaluatedAt: NOW,
  };
}

function boundarySnapshot(rangeCount: number) {
  const discountLines = Array.from({ length: 20 }, (_, position) => {
    let discountMinor = 0;
    const capturedRanges = Array.from({ length: rangeCount }, (_, startOrdinal) => {
      const discountUnitMinor = startOrdinal % 2 + 1;
      discountMinor += discountUnitMinor;
      return { startOrdinal, quantity: 1, grossUnitMinor: 8_000_000_000, discountUnitMinor, kind: "sale" as const };
    });
    return {
      lineId: `bbbbbbbb-bbbb-4bbb-8bbb-${String(position + 1).padStart(12, "0")}`,
      position,
      discountMinor,
      capturedRanges,
    };
  });
  return {
    ...snapshot(),
    promotionName: "Captured test",
    benefit: { kind: "percentage" as const, percentageBps: 1_000 },
    discountLines,
    discountTotalMinor: discountLines.reduce((total, line) => total + line.discountMinor, 0),
  };
}

test("order promotion snapshot is an exact deeply immutable twelve-key financial record", () => {
  const parsed = parsePromotionOrderSnapshot(snapshot());
  assert.deepEqual(Object.keys(parsed), ["promotionId", "promotionVersion", "promotionName", "couponCode", "benefit", "targets", "discountLines", "shippingDiscountMinor", "giftLines", "discountTotalMinor", "currency", "evaluatedAt"]);
  assert.equal(Object.isFrozen(parsed.discountLines[0]?.capturedRanges[0]), true);
  assert.throws(() => parsePromotionOrderSnapshot({ ...snapshot(), clientAmount: 1 }));
  assert.throws(() => parsePromotionOrderSnapshot({ ...snapshot(), discountTotalMinor: 99 }));
  assert.throws(() => parsePromotionOrderSnapshot({ ...snapshot(), couponCode: "=FORMULA" }));
  assert.throws(() => parsePromotionOrderSnapshot({ ...snapshot(), evaluatedAt: "2026-09-05T10:00:00.000001Z" }));
});

test("captured unit ranges are compact, ordered and reconcile to their line", () => {
  const base = snapshot();
  const range = base.discountLines[0].capturedRanges[1];
  assert.throws(() => parsePromotionOrderSnapshot({ ...base, discountLines: [{ ...base.discountLines[0], capturedRanges: [{ ...range, startOrdinal: 0, discountUnitMinor: 101 }] }] }));
  assert.throws(() => parsePromotionOrderSnapshot({ ...base, discountLines: [{ ...base.discountLines[0], capturedRanges: [base.discountLines[0].capturedRanges[0], { ...range, startOrdinal: 1 }] }] }));
  assert.throws(() => parsePromotionOrderSnapshot({ ...base, discountLines: [{ ...base.discountLines[0], capturedRanges: [{ ...range }] }] }));
  assert.throws(() => parsePromotionOrderSnapshot({ ...base, discountLines: [{ ...base.discountLines[0], capturedRanges: [{ ...range, startOrdinal: 0, discountUnitMinor: 99 }] }] }));
  const million = parsePromotionOrderSnapshot({ ...base, discountLines: [{ ...base.discountLines[0], discountMinor: 1_000_000, capturedRanges: [{ ...range, startOrdinal: 0, quantity: 1_000_000, grossUnitMinor: 1, discountUnitMinor: 1 }] }], discountTotalMinor: 1_000_000 });
  assert.equal(million.discountLines[0]?.capturedRanges.length, 1);
  const adjacent = parsePromotionOrderSnapshot({ ...base, discountLines: [{ ...base.discountLines[0], capturedRanges: [{ ...range, startOrdinal: 0, quantity: 1, grossUnitMinor: 100, discountUnitMinor: 25 }, { ...range, startOrdinal: 1, quantity: 1, grossUnitMinor: 100, discountUnitMinor: 75 }] }] });
  assert.equal(adjacent.discountLines[0]?.capturedRanges.length, 2);
  assert.throws(() => parsePromotionOrderSnapshot({ ...base, discountLines: [{ ...base.discountLines[0], capturedRanges: [{ ...range, startOrdinal: 0, quantity: 1, grossUnitMinor: 100, discountUnitMinor: 50 }, { ...range, startOrdinal: 1, quantity: 1, grossUnitMinor: 100, discountUnitMinor: 50 }] }] }));
  assert.throws(() => parsePromotionOrderSnapshot({ ...base, discountLines: [{ ...base.discountLines[0], capturedRanges: [{ ...range, startOrdinal: 0, quantity: 2, grossUnitMinor: 100, discountUnitMinor: 50 }, { ...range, startOrdinal: 1, quantity: 1, grossUnitMinor: 100, discountUnitMinor: 0 }] }] }));
  assert.throws(() => parsePromotionOrderSnapshot({ ...base, discountLines: [base.discountLines[0], { ...base.discountLines[0], lineId: VARIANT }] }));
});

test("gift snapshots preserve zero-paid auto-add and exact manual captured units", () => {
  const base = snapshot();
  const auto = parsePromotionOrderSnapshot({ ...base, couponCode: null, benefit: { kind: "gift", giftVariantId: VARIANT, quantity: 2, autoAdd: true }, discountLines: [], giftLines: [{ variantId: VARIANT, quantity: 2, paidMinor: 0, autoAdd: true }], discountTotalMinor: 0 });
  assert.equal(auto.giftLines[0]?.autoAdd, true);
  assert.throws(() => parsePromotionOrderSnapshot({ ...auto, giftLines: [{ ...auto.giftLines[0], lineId: LINE }] }));
  const manual = parsePromotionOrderSnapshot({ ...base, couponCode: null, benefit: { kind: "gift", giftVariantId: VARIANT, quantity: 1, autoAdd: false }, discountLines: [{ ...base.discountLines[0], capturedRanges: [{ startOrdinal: 0, quantity: 1, grossUnitMinor: 100, discountUnitMinor: 100, kind: "gift" }] }], giftLines: [{ variantId: VARIANT, quantity: 1, paidMinor: 0, autoAdd: false, lineId: LINE }] });
  assert.equal(manual.giftLines[0]?.autoAdd, false);
});

test("snapshot currency, applied value and serialized size stay persistable", () => {
  const base = snapshot();
  assert.throws(() => parsePromotionOrderSnapshot({ ...base, benefit: { kind: "fixed_amount", amountMinor: 100, currency: "USD" } }));
  assert.throws(() => parsePromotionOrderSnapshot({ ...base, discountLines: [], discountTotalMinor: 0 }));
  const ranges = Array.from({ length: 2_000 }, (_, startOrdinal) => ({ startOrdinal, quantity: 1, grossUnitMinor: 100, discountUnitMinor: startOrdinal % 2, kind: startOrdinal % 2 === 0 ? "sale" as const : "buy_x_get_y" as const }));
  const oversized = { ...base, discountLines: [
    { lineId: LINE, position: 0, discountMinor: 1_000, capturedRanges: ranges },
    { lineId: VARIANT, position: 1, discountMinor: 1_000, capturedRanges: ranges },
  ], discountTotalMinor: 2_000 };
  assert.throws(() => parsePromotionOrderSnapshot(oversized));
  const nearBoundary = boundarySnapshot(60);
  assert.equal(new TextEncoder().encode(JSON.stringify(nearBoundary)).byteLength, 118_606);
  assert.equal(parsePromotionOrderSnapshot(nearBoundary).discountLines.length, 20);
  const postgresTextOversized = boundarySnapshot(61);
  assert.equal(new TextEncoder().encode(JSON.stringify(postgresTextOversized)).byteLength, 120_546);
  assert.throws(() => parsePromotionOrderSnapshot(postgresTextOversized));
  assert.equal(parsePromotionOrderSnapshot({ ...base, promotionName: 'Çifte "İndirim" \\ VIP 😀' }).promotionName, 'Çifte "İndirim" \\ VIP 😀');
  assert.throws(() => parsePromotionOrderSnapshot({ ...base, promotionName: "unpaired \ud800 surrogate" }));
});
