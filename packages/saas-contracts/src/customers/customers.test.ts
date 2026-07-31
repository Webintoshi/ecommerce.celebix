import assert from "node:assert/strict";
import test from "node:test";

import { isMerchantActionAllowed } from "../authorization/actions.ts";
import {
  CUSTOMER_CONSENT_CHANNELS,
  CUSTOMER_STATUSES,
  parseCustomerDetail,
  parseCustomerListItem,
  parseCustomerMutationResult,
  parseCustomerSegment,
  parseCustomerSummary,
  parseCustomerTag,
  parseCustomerWorkspace,
} from "./index.ts";

const CUSTOMER = "81000000-0000-4000-8000-000000000001";
const ADDRESS = "82000000-0000-4000-8000-000000000001";
const NOTE = "83000000-0000-4000-8000-000000000001";
const TAG = "84000000-0000-4000-8000-000000000001";
const SEGMENT = "85000000-0000-4000-8000-000000000001";
const OTHER_CUSTOMER = "81000000-0000-4000-8000-000000000002";
const NEXT_CUSTOMER = "81000000-0000-4000-8000-000000000003";
const ORDER = "71000000-0000-4000-8000-000000000001";
const NOW = "2026-07-22T15:00:00.000Z";

const listItem = Object.freeze({
  id: CUSTOMER,
  status: "active",
  displayName: "Ada Lovelace",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.test",
  phone: "+905551112233",
  orderCount: 2,
  totalSpentCents: 25_000,
  currency: "TRY",
  tags: [Object.freeze({ id: TAG, name: "VIP", color: "#7c3aed" })],
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
});

test("customer contracts parse and deeply freeze truthful projections", () => {
  const detail = parseCustomerDetail({
    ...listItem,
    addresses: [{ id: ADDRESS, label: "Ev", recipientName: "Ada Lovelace", line1: "Test Sokak 1", city: "İstanbul", postalCode: "34000", country: "TR", isDefault: true, version: 1 }],
    consents: CUSTOMER_CONSENT_CHANNELS.map((channel) => ({ channel, status: channel === "email" ? "granted" : "denied", recordedAt: NOW })),
    notes: [{ id: NOTE, text: "Sadakat müşterisi", createdAt: NOW }],
    segments: [{ id: SEGMENT, name: "Tekrar alışveriş", kind: "manual" }],
  });
  assert.equal(Object.isFrozen(detail), true);
  assert.equal(Object.isFrozen(detail.addresses), true);
  assert.equal(Object.isFrozen(detail.consents[0]), true);
  assert.equal(detail.displayName, "Ada Lovelace");
});

test("customer contracts reject private authority, unknown keys and malformed values", () => {
  for (const invalid of [
    { ...listItem, storeId: CUSTOMER },
    { ...listItem, email: " ada@example.test" },
    { ...listItem, currency: "try" },
    { ...listItem, totalSpentCents: -1 },
    { ...listItem, tags: [{ id: TAG, name: "VIP", color: "red" }] },
    { ...listItem, updatedAt: "not-a-time" },
  ]) assert.throws(() => parseCustomerListItem(invalid), /customer_contract_invalid/);
});

test("customer summary, tag, segment and mutation projections stay exact", () => {
  assert.deepEqual(parseCustomerSummary({ active: 4, archived: 1, consentedEmail: 2, totalSpentCents: 75_000, currency: "TRY", asOf: NOW }), { active: 4, archived: 1, consentedEmail: 2, totalSpentCents: 75_000, currency: "TRY", asOf: NOW });
  assert.equal(parseCustomerTag({ id: TAG, name: "VIP", color: "#7c3aed", customerCount: 3, version: 1 }).customerCount, 3);
  assert.equal(parseCustomerSegment({ id: SEGMENT, name: "Tekrar alışveriş", kind: "manual", customerCount: 2, version: 1 }).kind, "manual");
  assert.equal(parseCustomerMutationResult({ id: CUSTOMER, version: 2, status: "active", updatedAt: NOW, replayed: false }).version, 2);
  assert.throws(() => parseCustomerSummary({ active: 1, archived: 0, consentedEmail: 0, totalSpentCents: 0, currency: "TRY", asOf: NOW, tenantId: CUSTOMER }), /customer_contract_invalid/);
});

test("customer action policy is least privilege", () => {
  for (const role of ["store_owner", "admin", "editor", "analyst"] as const) assert.equal(isMerchantActionAllowed(role, "customers.read"), true);
  for (const role of ["store_owner", "admin", "editor"] as const) assert.equal(isMerchantActionAllowed(role, "customers.manage"), true);
  assert.equal(isMerchantActionAllowed("analyst", "customers.manage"), false);
  assert.equal(isMerchantActionAllowed("editor", "customers.archive"), false);
  assert.equal(isMerchantActionAllowed("store_owner", "customers.archive"), true);
});

test("customer workspace parses exact navigation and linked order history", () => {
  const workspace = parseCustomerWorkspace({
    neighbors: {
      previous: { id: OTHER_CUSTOMER, displayName: "Grace Hopper" },
      next: { id: NEXT_CUSTOMER, displayName: "Margaret Hamilton" },
    },
    orders: [{
      id: ORDER,
      orderNumber: "CX-1042",
      status: "delivered",
      paymentStatus: "completed",
      totalCents: 32_502_60,
      currency: "TRY",
      createdAt: NOW,
    }],
  });

  assert.deepEqual(workspace.orders[0], {
    id: ORDER,
    orderNumber: "CX-1042",
    status: "delivered",
    paymentStatus: "completed",
    totalCents: 32_502_60,
    currency: "TRY",
    createdAt: NOW,
  });
  assert.equal(workspace.neighbors.previous?.displayName, "Grace Hopper");
  assert.equal(Object.isFrozen(workspace), true);
  assert.equal(Object.isFrozen(workspace.neighbors), true);
  assert.equal(Object.isFrozen(workspace.orders), true);
  assert.equal(Object.isFrozen(workspace.orders[0]), true);
  assert.deepEqual(parseCustomerWorkspace({ neighbors: {}, orders: [] }), { neighbors: {}, orders: [] });
});

test("customer workspace rejects ambiguous private and malformed history values", () => {
  const validOrder = {
    id: ORDER,
    orderNumber: "CX-1042",
    status: "delivered",
    paymentStatus: "completed",
    totalCents: 32_502_60,
    currency: "TRY",
    createdAt: NOW,
  };
  for (const invalid of [
    { neighbors: {}, orders: [], storeId: CUSTOMER },
    { neighbors: { previous: { id: OTHER_CUSTOMER, displayName: "Grace Hopper", email: "grace@example.test" } }, orders: [] },
    { neighbors: { previous: { id: OTHER_CUSTOMER, displayName: "Grace Hopper" }, next: { id: OTHER_CUSTOMER, displayName: "Grace Hopper" } }, orders: [] },
    { neighbors: {}, orders: [{ ...validOrder, status: "unknown" }] },
    { neighbors: {}, orders: [{ ...validOrder, paymentStatus: "paid" }] },
    { neighbors: {}, orders: [{ ...validOrder, totalCents: -1 }] },
    { neighbors: {}, orders: [{ ...validOrder, currency: "try" }] },
    { neighbors: {}, orders: [{ ...validOrder, createdAt: "2026-07-22" }] },
    { neighbors: {}, orders: Array.from({ length: 51 }, () => validOrder) },
  ]) assert.throws(() => parseCustomerWorkspace(invalid), /customer_contract_invalid/);
});
