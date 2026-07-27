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
  ["store_owner", "carts.manage", true],
  ["admin", "carts.manage", true],
  ["editor", "carts.manage", false],
  ["editor", "carts.read", true],
  ["analyst", "carts.read", true],
  ["store_owner", "customers.archive", true],
  ["admin", "customers.manage", true],
  ["editor", "customers.manage", true],
  ["editor", "customers.archive", false],
  ["analyst", "customers.read", true],
  ["analyst", "customers.manage", false],
  ["store_owner", "catalog_admin.import", true],
  ["admin", "catalog_admin.moderate", true],
  ["editor", "catalog_admin.manage", true],
  ["editor", "catalog_admin.archive", false],
  ["analyst", "catalog_admin.read", true],
  ["editor", "content.manage", true],
  ["editor", "configuration.manage", false],
  ["analyst", "marketing.read", true],
  ["admin", "integrations.manage", true],
  ["store_owner", "inventory.manage", true],
  ["admin", "pricing.manage", true],
  ["editor", "inventory.read", true],
  ["editor", "inventory.manage", true],
  ["editor", "purchasing.read", true],
  ["editor", "purchasing.manage", true],
  ["editor", "pricing.read", true],
  ["editor", "pricing.manage", false],
  ["analyst", "inventory.read", true],
  ["analyst", "purchasing.read", true],
  ["analyst", "pricing.read", true],
  ["analyst", "purchasing.manage", false],
] as const;

test("enforces the exact merchant order action matrix", () => {
  for (const [role, action, allowed] of cases) {
    assert.equal(isMerchantActionAllowed(role, action), allowed);
  }
});

test("denies unknown merchant actions", () => {
  assert.equal(
    isMerchantActionAllowed("store_owner", "orders.delete" as never),
    false,
  );
});

test("exports the exact immutable merchant action list", () => {
  assert.deepEqual(MERCHANT_ACTIONS, [
    "analytics.read",
    "orders.read",
    "orders.manage",
    "orders.fulfill",
    "orders.payment",
    "orders.note",
    "quick_links.read",
    "quick_links.manage",
    "carts.read",
    "carts.manage",
    "customers.read",
    "customers.manage",
    "customers.archive",
    "catalog_admin.read",
    "catalog_admin.manage",
    "catalog_admin.archive",
    "catalog_admin.import",
    "catalog_admin.moderate",
    "promotions.read",
    "promotions.manage",
    "promotions.archive",
    "content.read",
    "content.manage",
    "content.archive",
    "marketing.read",
    "marketing.manage",
    "configuration.read",
    "configuration.manage",
    "configuration.archive",
    "integrations.read",
    "integrations.manage",
    "inventory.read",
    "inventory.manage",
    "purchasing.read",
    "purchasing.manage",
    "pricing.read",
    "pricing.manage",
  ]);
  assert.equal(Object.isFrozen(MERCHANT_ACTIONS), true);
});

test("cannot mutate the frozen merchant action root value", () => {
  assert.throws(() => {
    (MERCHANT_ACTIONS as unknown as string[]).push("orders.delete");
  }, TypeError);
});

test("analytics is readable by every merchant role and never mutable", () => {
  for (const role of ["store_owner", "admin", "editor", "analyst"] as const) {
    assert.equal(isMerchantActionAllowed(role, "analytics.read" as never), true);
  }
  assert.equal(MERCHANT_ACTIONS.some((action) => action.startsWith("analytics.") && action !== "analytics.read"), false);
});
