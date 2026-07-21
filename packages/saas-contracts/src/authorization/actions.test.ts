import assert from "node:assert/strict";
import test from "node:test";

import { MERCHANT_ACTIONS, isMerchantActionAllowed } from "./actions.ts";

const cases = [
  ["store_owner", "orders.read", true],
  ["store_owner", "orders.manage", true],
  ["admin", "orders.manage", true],
  ["editor", "orders.read", true],
  ["editor", "orders.fulfill", true],
  ["editor", "orders.payment", false],
  ["analyst", "orders.read", true],
  ["analyst", "orders.note", false],
  ["store_owner", "quick_links.manage", true],
  ["admin", "quick_links.manage", true],
  ["editor", "quick_links.manage", false],
  ["editor", "quick_links.read", true],
  ["analyst", "quick_links.read", true],
] as const;

test("enforces the exact merchant order action matrix", () => {
  for (const [role, action, allowed] of cases) {
    assert.equal(isMerchantActionAllowed(role, action), allowed);
  }
});

test("denies unknown merchant actions", () => {
  assert.equal(isMerchantActionAllowed("store_owner", "orders.delete" as never), false);
});

test("exports the exact immutable merchant action list", () => {
  assert.deepEqual(MERCHANT_ACTIONS, [
    "orders.read",
    "orders.manage",
    "orders.fulfill",
    "orders.payment",
    "orders.note",
    "quick_links.read",
    "quick_links.manage",
  ]);
  assert.equal(Object.isFrozen(MERCHANT_ACTIONS), true);
});

test("cannot mutate the frozen merchant action root value", () => {
  assert.throws(() => {
    (MERCHANT_ACTIONS as unknown as string[]).push("orders.delete");
  }, TypeError);
});
