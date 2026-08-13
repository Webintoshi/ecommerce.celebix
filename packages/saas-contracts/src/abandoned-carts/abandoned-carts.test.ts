import assert from "node:assert/strict";
import test from "node:test";

import { isMerchantActionAllowed } from "../authorization/actions.ts";
import {
  ABANDONED_CART_SORTS,
  ABANDONED_CART_STATUSES,
  parseAbandonedCartDetail,
  parseAbandonedCartListItem,
  parseAbandonedCartMutationResult,
  parseAbandonedCartSummary,
} from "./index.ts";

const CART_ID = "71000000-0000-4000-8000-000000000001";
const ITEM_ID = "72000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = "74000000-0000-4000-8000-000000000001";
const NOW = "2026-07-22T12:00:00.000Z";
const LATER = "2026-07-22T12:30:00.000Z";

const listItem = Object.freeze({
  id: CART_ID,
  status: "abandoned",
  customerId: CUSTOMER_ID,
  customerName: "Ada Lovelace",
  customerEmail: "ada@example.com",
  customerPhone: "+905551112233",
  currency: "TRY",
  subtotalCents: 12_500,
  discountCents: 500,
  totalCents: 12_000,
  itemCount: 1,
  firstProductName: "Keten Gömlek",
  checkoutStartedAt: NOW,
  lastActivityAt: NOW,
  abandonedAt: NOW,
  version: 1,
  createdAt: NOW,
  updatedAt: LATER,
});

const item = Object.freeze({
  id: ITEM_ID,
  position: 0,
  productName: "Keten Gömlek",
  variantName: "M",
  sku: "KETEN-M",
  imageUrl: "https://cdn.celebix.site/products/keten.webp",
  unitPriceCents: 12_500,
  quantity: 1,
  discountCents: 500,
  lineTotalCents: 12_000,
});

test("exports exact immutable abandoned-cart enums", () => {
  assert.deepEqual(ABANDONED_CART_STATUSES, ["active", "abandoned", "recovered", "archived"]);
  assert.deepEqual(ABANDONED_CART_SORTS, ["newest", "oldest", "highest", "lowest"]);
  assert.equal(Object.isFrozen(ABANDONED_CART_STATUSES), true);
  assert.equal(Object.isFrozen(ABANDONED_CART_SORTS), true);
});

test("parses and deeply freezes safe list detail summary and mutation projections", () => {
  const list = parseAbandonedCartListItem(listItem);
  const detail = parseAbandonedCartDetail({ ...listItem, items: [item] });
  const summary = parseAbandonedCartSummary({
    abandoned: 4,
    recovered: 2,
    lostValueCents: 30_000,
    recoveredValueCents: 15_000,
    currency: "TRY",
    asOf: LATER,
  });
  const mutation = parseAbandonedCartMutationResult({
    id: CART_ID,
    status: "recovered",
    version: 2,
    updatedAt: LATER,
    replayed: false,
  });

  for (const value of [list, detail, summary, mutation]) assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(detail.items), true);
  assert.equal(Object.isFrozen(detail.items[0]), true);
  assert.deepEqual(detail.items[0], item);
});

test("accepts anonymous carts without fabricated customer identity", () => {
  const { customerId: _id, customerName: _name, customerEmail: _email, customerPhone: _phone, ...anonymous } = listItem;
  const parsed = parseAbandonedCartListItem(anonymous);
  assert.equal(Object.hasOwn(parsed, "customerId"), false);
  assert.equal(Object.hasOwn(parsed, "customerName"), false);
  assert.equal(Object.hasOwn(parsed, "customerEmail"), false);
  assert.equal(Object.hasOwn(parsed, "customerPhone"), false);
});

test("rejects private authority extras malformed values and inconsistent lifecycle", () => {
  for (const invalid of [
    { ...listItem, storeId: "10000000-0000-4000-8000-000000000001" },
    { ...listItem, totalCents: 1 },
    { ...listItem, currency: "try" },
    { ...listItem, customerEmail: " ada@example.com" },
    { ...listItem, customerId: "not-a-customer" },
    { ...listItem, updatedAt: "not-a-time" },
    { ...listItem, status: "active" },
    { ...listItem, status: "recovered" },
    { ...listItem, status: "archived" },
    { ...listItem, version: 0 },
  ]) assert.throws(() => parseAbandonedCartListItem(invalid), /abandoned_cart_contract_invalid/);
});

test("preserves lifecycle evidence for recovered and archived carts", () => {
  const recovered = parseAbandonedCartListItem({ ...listItem, status: "recovered", recoveredAt: LATER });
  const archived = parseAbandonedCartListItem({
    ...listItem,
    status: "archived",
    recoveredAt: LATER,
    archivedAt: "2026-07-22T13:00:00.000Z",
  });
  assert.equal(recovered.abandonedAt, NOW);
  assert.equal(recovered.recoveredAt, LATER);
  assert.equal(archived.archivedAt, "2026-07-22T13:00:00.000Z");
});

test("rejects invalid item arithmetic ordering count and image authority", () => {
  for (const invalid of [
    { ...listItem, items: [{ ...item, lineTotalCents: 1 }] },
    { ...listItem, items: [{ ...item, position: 1 }] },
    { ...listItem, itemCount: 2, items: [item] },
    { ...listItem, items: [{ ...item, imageUrl: "http://cdn.celebix.site/x" }] },
    { ...listItem, items: [{ ...item, imageUrl: "https://user@cdn.celebix.site/x" }] },
  ]) assert.throws(() => parseAbandonedCartDetail(invalid), /abandoned_cart_contract_invalid/);
});

test("summary and mutation reject hostile or impossible projections", () => {
  assert.throws(() => parseAbandonedCartSummary({ abandoned: -1, recovered: 0, lostValueCents: 0, recoveredValueCents: 0, currency: "TRY", asOf: NOW }), /abandoned_cart_contract_invalid/);
  assert.throws(() => parseAbandonedCartSummary({ abandoned: 0, recovered: 0, lostValueCents: 0, recoveredValueCents: 0, currency: "TRY", asOf: NOW, tenantId: CART_ID }), /abandoned_cart_contract_invalid/);
  assert.throws(() => parseAbandonedCartMutationResult({ id: CART_ID, status: "active", version: 1, updatedAt: NOW, replayed: "false" }), /abandoned_cart_contract_invalid/);
});

test("role policy exposes cart read broadly and cart manage only to owner and admin", () => {
  for (const role of ["store_owner", "admin", "editor", "analyst"] as const) {
    assert.equal(isMerchantActionAllowed(role, "carts.read"), true);
  }
  assert.equal(isMerchantActionAllowed("store_owner", "carts.manage"), true);
  assert.equal(isMerchantActionAllowed("admin", "carts.manage"), true);
  assert.equal(isMerchantActionAllowed("editor", "carts.manage"), false);
  assert.equal(isMerchantActionAllowed("analyst", "carts.manage"), false);
});
