import assert from "node:assert/strict";
import test from "node:test";
import * as contracts from "./index.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER = "22222222-2222-4222-8222-222222222222";
const address = { recipientName: "Historic recipient", line1: "Original address", city: "İstanbul", country: "TR" };
const old = { id: ID, orderNumber: "POS-000001", source: "in_store", customerName: "Historic name", customerEmail: "historic@example.test", currency: "TRY", totalCents: 1000, status: "pending", paymentStatus: "completed", itemCount: 0, createdAt: "2026-10-07T08:00:00.000Z", updatedAt: "2026-10-07T08:00:00.000Z", version: 1 };
const metadata = { customerId: CUSTOMER, currentCustomer: { id: CUSTOMER, name: "Corrected name", email: null, phone: null, archived: true }, salesChannel: "social", socialPlatform: "instagram", socialReference: "DM 42", fulfillmentMethod: "shipping" };

test("orders reader 2 preserves current cleared contact and historic delivery with strict v1 compatibility", () => {
  assert.equal(typeof contracts.parseOrderListItemV2, "function");
  const value = { ...old, ...metadata };
  const parsed = contracts.parseOrderListItemV2(value);
  assert.deepEqual(parsed, value);
  assert.equal(parsed.currentCustomer!.email, null);
  assert.equal(parsed.currentCustomer!.archived, true);
  assert.ok(Object.isFrozen(parsed.currentCustomer));
  assert.deepEqual(contracts.parseOrderListItem(old), old);
  assert.throws(() => contracts.parseOrderListItem(value));
  const detail = { ...value, subtotalCents: 1000, shippingCents: 0, discountCents: 0, shippingAddress: address, billingAddress: address, items: [], events: [], notes: [] };
  assert.deepEqual(contracts.parseOrderDetailV2(detail), detail);
});

test("orders reader 2 rejects mismatched profiles and social metadata while guests retain snapshots", () => {
  assert.equal(typeof contracts.parseOrderListItemV2, "function");
  assert.throws(() => contracts.parseOrderListItemV2({ ...old, ...metadata, customerId: null }));
  assert.throws(() => contracts.parseOrderListItemV2({ ...old, ...metadata, salesChannel: "manual" }));
  const guest = { ...old, ...metadata, customerId: null, currentCustomer: null, salesChannel: "manual", socialPlatform: null, socialReference: null, fulfillmentMethod: "pickup" };
  assert.deepEqual(contracts.parseOrderListItemV2(guest), guest);
});

test('order reader social reference preserves the manual-sale 500-character boundary',()=>{
 for(const size of [301,500])assert.equal(contracts.parseOrderListItemV2({...old,...metadata,socialReference:'x'.repeat(size)}).socialReference?.length,size);
 assert.throws(()=>contracts.parseOrderListItemV2({...old,...metadata,socialReference:'x'.repeat(501)}));
});
