import assert from "node:assert/strict";
import test from "node:test";

import { allocatePromotionDiscount, refundablePromotionAmount } from "./allocation.ts";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("allocation is proportional and places integer remainders by position then UUID", () => {
  const result = allocatePromotionDiscount({
    currency: "TRY", discountMinor: 5,
    lines: [
      { lineId: B, position: 1, currency: "TRY", eligibleMinor: 10, paidNetMinor: 10, kind: "sale" },
      { lineId: A, position: 0, currency: "TRY", eligibleMinor: 10, paidNetMinor: 10, kind: "sale" },
    ],
  });
  assert.deepEqual(result.lineAllocations, [{ lineId: A, discountMinor: 3 }, { lineId: B, discountMinor: 2 }]);
  assert.equal(result.unallocatedMinor, 0);
});

test("allocation caps discounts and gives gift and free X/Y units zero paid allocation", () => {
  const result = allocatePromotionDiscount({
    currency: "TRY", discountMinor: 999,
    lines: [
      { lineId: A, position: 0, currency: "TRY", eligibleMinor: 100, paidNetMinor: 100, kind: "sale" },
      { lineId: B, position: 1, currency: "TRY", eligibleMinor: 50, paidNetMinor: 0, kind: "gift" },
    ], orderMaximumMinor: 80,
  });
  assert.deepEqual(result.lineAllocations, [{ lineId: A, discountMinor: 80 }, { lineId: B, discountMinor: 0 }]);
  assert.equal(result.appliedDiscountMinor, 80);
});

test("allocation rejects multi-currency and unsafe inputs", () => {
  assert.throws(() => allocatePromotionDiscount({ currency: "TRY", discountMinor: 1, lines: [{ lineId: A, position: 0, currency: "USD", eligibleMinor: 1, paidNetMinor: 1, kind: "sale" }] }));
  assert.throws(() => allocatePromotionDiscount({ currency: "TRY", discountMinor: Number.MAX_SAFE_INTEGER + 1, lines: [] }));
});

test("allocation stays exact when safe integer operands have an unsafe intermediate product", () => {
  const result = allocatePromotionDiscount({
    currency: "TRY", discountMinor: 7_999_665_684,
    lines: [
      { lineId: A, position: 0, currency: "TRY", eligibleMinor: 7_997_562_982, paidNetMinor: 7_997_562_982, kind: "sale" },
      { lineId: B, position: 1, currency: "TRY", eligibleMinor: 7_996_948_459, paidNetMinor: 7_996_948_459, kind: "sale" },
      { lineId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", position: 2, currency: "TRY", eligibleMinor: 7_991_339_210, paidNetMinor: 7_991_339_210, kind: "sale" },
    ],
  });
  assert.deepEqual(result.lineAllocations, [{ lineId: A, discountMinor: 2_667_315_455 }, { lineId: B, discountMinor: 2_667_110_502 }, { lineId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", discountMinor: 2_665_239_727 }]);
});

test("refunds cannot exceed paid net line amount or captured allocation", () => {
  assert.equal(refundablePromotionAmount({ paidNetMinor: 800, allocatedDiscountMinor: 200, alreadyRefundedMinor: 50, requestedRefundMinor: 200 }), 150);
  assert.throws(() => refundablePromotionAmount({ paidNetMinor: 800, allocatedDiscountMinor: 200, alreadyRefundedMinor: 201, requestedRefundMinor: 1 }));
  assert.throws(() => refundablePromotionAmount({ paidNetMinor: 0, allocatedDiscountMinor: 1, alreadyRefundedMinor: 0, requestedRefundMinor: 1 }));
});
