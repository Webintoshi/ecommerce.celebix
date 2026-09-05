import assert from "node:assert/strict";
import test from "node:test";

import { equalPromotionProjection, promotionFingerprint } from "./canonical.ts";
import { promotionRepositoryErrorCode } from "./errors.ts";

const STORE = "10000000-0000-4000-8000-000000000126";

test("promotion fingerprints match the PostgreSQL v2 golden vectors", () => {
  assert.equal(
    promotionFingerprint("create", STORE, { ruleDocument: {}, name: "Golden" }),
    "b2037d9eb0b7aa1b1de7486ba633a09018e7fcbabc929187345c049eb5fe7d4c",
  );
  assert.equal(
    promotionFingerprint("create", STORE, { name: 'Çifte "İndirim" \\ VIP', ruleDocument: {} }),
    "15d72b2906fa2a7e80ac66711d2e7677147a038a30ed5fd667cb2ef2145dbd89",
  );
  assert.equal(
    promotionFingerprint("update", STORE, { minimum: 0, maximum: 9_007_199_254_740_991, enabled: true, none: null }),
    "fdccfdaa3a4e9cb1aa27bdfd776a08df69e3cb25ceb39b34907e13489f53371b",
  );
  const forward = { referenceIds: ["a", "b"], tiers: [{ minimumQuantity: 2 }, { minimumQuantity: 1 }] };
  const reversedSet = { tiers: [{ minimumQuantity: 2 }, { minimumQuantity: 1 }], referenceIds: ["b", "a"] };
  const reversedOrder = { referenceIds: ["a", "b"], tiers: [{ minimumQuantity: 1 }, { minimumQuantity: 2 }] };
  assert.equal(
    promotionFingerprint("update", STORE, forward),
    "152fc76c86a4ecde9ab38543ebc35d0797aafb918a0e841ea44d2eb137d7c30d",
  );
  assert.equal(promotionFingerprint("update", STORE, forward), promotionFingerprint("update", STORE, reversedSet));
  assert.notEqual(promotionFingerprint("update", STORE, forward), promotionFingerprint("update", STORE, reversedOrder));
  assert.notEqual(
    promotionFingerprint("update", STORE, { codes: ["A", "A", "B"] }),
    promotionFingerprint("update", STORE, { codes: ["A", "B"] }),
  );
  const maximumDuplicateCodes = Array.from(
    { length: 10_000 },
    (_, index) => `C${String(index + 1).padStart(5, "0")}${"A".repeat(58)}`,
  );
  assert.equal(
    promotionFingerprint("duplicate", STORE, {
      sourcePromotionId: "90000000-0000-4000-8000-000000000139",
      expectedVersion: 1,
      name: "Maximum duplicate fingerprint",
      codes: maximumDuplicateCodes,
    }),
    "fc3666b889d56fb945ce66f982f8f3d7bc4097df402bb712a52283a0a5079129",
  );
});

test("fingerprints reject unsafe numbers and accessor-backed objects", () => {
  for (const value of [1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => promotionFingerprint("update", STORE, { value }),
      (error: unknown) => promotionRepositoryErrorCode(error) === "invalid_input",
    );
  }
  let reads = 0;
  const hostile = {} as Record<string, unknown>;
  Object.defineProperty(hostile, "value", { enumerable: true, get() { reads += 1; return 1; } });
  assert.throws(() => promotionFingerprint("update", STORE, hostile));
  assert.equal(reads, 0);
});

test("result equality preserves ordered SQL projections rather than fingerprint set semantics", () => {
  assert.equal(equalPromotionProjection({ items: [1, 2] }, { items: [1, 2] }), true);
  assert.equal(equalPromotionProjection({ items: [1, 2] }, { items: [2, 1] }), false);
});
