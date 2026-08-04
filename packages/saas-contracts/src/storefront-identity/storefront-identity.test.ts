import assert from "node:assert/strict";
import test from "node:test";

import {
  STOREFRONT_ACCOUNT_STATUSES,
  STOREFRONT_ACCOUNT_SESSION_KINDS,
  parseStorefrontAccountMutationResult,
  parseStorefrontAccountOrder,
  parseStorefrontAccountSnapshot,
  parseStorefrontAuthStartResult,
  parseStorefrontAuthVerifyResult,
} from "./index.ts";

const NOW = "2026-08-04T08:00:00.000Z";

const profile = Object.freeze({
  email: "ada@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
  phone: "+905551112233",
});

const address = Object.freeze({
  id: "82000000-0000-4000-8000-000000000001",
  label: "Ev",
  recipientName: "Ada Lovelace",
  line1: "Örnek Sokak 1",
  city: "İstanbul",
  district: "Kadıköy",
  postalCode: "34710",
  country: "TR",
  isDefault: true,
  version: 1,
});

const order = Object.freeze({
  orderReference: "CX-20260804-1042",
  status: "delivered",
  paymentStatus: "completed",
  currency: "TRY",
  subtotalCents: 12_000,
  shippingCents: 0,
  totalCents: 12_000,
  createdAt: NOW,
  items: [Object.freeze({ name: "Altın Yüzük", quantity: 1, unitPriceCents: 12_000, lineTotalCents: 12_000 })],
});

test("storefront identity exports exact immutable finite status registries", () => {
  assert.deepEqual(STOREFRONT_ACCOUNT_STATUSES, ["pending_profile", "active", "suspended"]);
  assert.deepEqual(STOREFRONT_ACCOUNT_SESSION_KINDS, ["registration", "full"]);
  assert.equal(Object.isFrozen(STOREFRONT_ACCOUNT_STATUSES), true);
  assert.equal(Object.isFrozen(STOREFRONT_ACCOUNT_SESSION_KINDS), true);
});

test("auth start and verify results expose no private authority", () => {
  assert.deepEqual(parseStorefrontAuthStartResult({ outcome: "accepted", retryAfterSeconds: 60 }), { outcome: "accepted", retryAfterSeconds: 60 });
  assert.deepEqual(parseStorefrontAuthVerifyResult({ outcome: "authenticated", profileRequired: false }), { outcome: "authenticated", profileRequired: false });
  assert.deepEqual(parseStorefrontAuthVerifyResult({ outcome: "profile_required", profileRequired: true }), { outcome: "profile_required", profileRequired: true });
  for (const key of ["storeId", "tenantId", "accountId", "customerId", "credential", "codeDigest"]) {
    assert.throws(() => parseStorefrontAuthVerifyResult({ outcome: "authenticated", profileRequired: false, [key]: "x" }), /storefront_identity_contract_invalid/u);
  }
});

test("account snapshot is exact deeply frozen and uses public order references", () => {
  const snapshot = parseStorefrontAccountSnapshot({
    status: "active",
    version: 3,
    profile,
    addresses: [address],
    favorites: [{ productId: "73000000-0000-4000-8000-000000000001", createdAt: NOW }],
    devices: [{ id: "device_01HZZZZZZZZZZZZZZZZZZZZZZZ", label: "Safari · macOS", current: true, lastSeenAt: NOW, createdAt: NOW }],
  });
  assert.equal(snapshot.profile.email, "ada@example.com");
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.addresses[0]), true);
  assert.equal(Object.isFrozen(snapshot.devices), true);
  assert.deepEqual(parseStorefrontAccountOrder(order), order);
});

test("account projections reject malformed values and hidden database authority", () => {
  const base = { status: "active", version: 1, profile, addresses: [], favorites: [], devices: [] };
  for (const invalid of [
    { ...base, storeId: "81000000-0000-4000-8000-000000000001" },
    { ...base, profile: { ...profile, email: " Ada@example.com" } },
    { ...base, addresses: [{ ...address, country: "tr" }] },
    { ...base, devices: [{ id: "bad", label: "Safari", current: true, lastSeenAt: NOW, createdAt: NOW }] },
    { ...order, orderId: "71000000-0000-4000-8000-000000000001" },
    { ...order, totalCents: -1 },
    { ...order, items: [{ ...order.items[0], lineTotalCents: 1 }] },
  ]) assert.throws(() => Object.hasOwn(invalid, "orderReference") ? parseStorefrontAccountOrder(invalid) : parseStorefrontAccountSnapshot(invalid), /storefront_identity_contract_invalid/u);
});

test("account mutation results are finite replay-aware public outcomes", () => {
  assert.deepEqual(parseStorefrontAccountMutationResult({ outcome: "updated", version: 2, replayed: false }), { outcome: "updated", version: 2, replayed: false });
  assert.throws(() => parseStorefrontAccountMutationResult({ outcome: "updated", version: 0, replayed: false }), /storefront_identity_contract_invalid/u);
  assert.throws(() => parseStorefrontAccountMutationResult({ outcome: "deleted", version: 2, replayed: false }), /storefront_identity_contract_invalid/u);
});
