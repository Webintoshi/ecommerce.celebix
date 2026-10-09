import assert from "node:assert/strict";
import test from "node:test";
import * as contracts from "./index.ts";

const id = "10000000-0000-4000-8000-000000000001";
const linked = "10000000-0000-4000-8000-000000000002";
const impact = { id, version: 2, name: "Yaz indirimi", codeCount: 3, preservedRedemptionCount: 1, pendingReservationCount: 0, linkedTools: [], canDelete: true };

test("deletion impact rejects an available decision hiding pending collections or enabled linked tools", () => {
  assert.equal(typeof contracts.parsePromotionDeletionImpact, "function");
  const parse = contracts.parsePromotionDeletionImpact;
  assert.deepEqual(parse(impact), impact);
  assert.throws(() => parse({ ...impact, pendingReservationCount: 1 }));
  assert.throws(() => parse({ ...impact, linkedTools: [{ id: linked, kind: "popup", name: "Yaz", enabled: true }] }));
  assert.equal(parse({ ...impact, canDelete: false, pendingReservationCount: 1 }).canDelete, false);
  assert.throws(() => parse({ ...impact, storeId: id }));
});

test("permanent deletion receipt is narrow and requires explicit replay metadata", () => {
  assert.equal(typeof contracts.parsePromotionDeletionEnvelope, "function");
  const value = { id, deletedAt: "2026-10-09T18:00:00.000Z", replayed: false };
  assert.deepEqual(contracts.parsePromotionDeletionEnvelope(value), value);
  assert.throws(() => contracts.parsePromotionDeletionEnvelope({ ...value, promotion: {} }));
  assert.throws(() => contracts.parsePromotionDeletionEnvelope({ ...value, deletedAt: "2026-99-09T18:00:00.000Z" }));
});

test("pending collection or linked tool deletion refusal remains a public safe error", () => {
  assert.deepEqual(contracts.safePromotionError("deletion_blocked"), { code: "deletion_blocked" });
});
