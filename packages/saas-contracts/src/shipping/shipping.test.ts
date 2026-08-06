import assert from "node:assert/strict";
import test from "node:test";

import * as contracts from "../index.ts";

const UUID_A = "91000000-0000-4000-8000-000000000001";
const UUID_B = "91000000-0000-4000-8000-000000000002";
const NOW = "2026-08-06T12:00:00.000Z";
const LATER = "2026-08-06T12:10:00.000Z";

type UnknownFunction = (...args: readonly unknown[]) => unknown;

function exportedFunction(name: string): UnknownFunction {
  const selected = (contracts as unknown as Record<string, unknown>)[name];
  assert.equal(typeof selected, "function", `${name} must be exported`);
  return selected as UnknownFunction;
}

test("shipping status and provider registries are finite and frozen", () => {
  assert.deepEqual(contracts.SHIPPING_PROVIDER_CODES, ["basit_kargo"]);
  assert.deepEqual(contracts.SHIPMENT_STATUSES, [
    "draft", "creating", "ready", "shipped", "out_for_delivery", "delivered", "delayed",
    "returning", "returned", "lost", "cancelled", "provider_outcome_unknown", "attention_required",
  ]);
  assert.equal(Object.isFrozen(contracts.SHIPPING_PROVIDER_CODES), true);
  assert.equal(Object.isFrozen(contracts.SHIPMENT_STATUSES), true);
});

const connection = Object.freeze({
  providerCode: "basit_kargo",
  displayName: "Basit Kargo",
  status: "active",
  credentialVersion: 2,
  selectedBrandLabel: "Güzide Kuyumcu",
  selectedAddressLabel: "Merkez Depo",
  codDeliveredMarksPaid: false,
  verifiedAt: NOW,
  version: 4,
});

const quote = Object.freeze({
  credential: "quote_0123456789abcdef0123456789abcdef",
  status: "quoted",
  expiresAt: LATER,
  currency: "TRY",
  packages: [Object.freeze({ heightCm: 10, widthCm: 15, depthCm: 5, weightKg: 1.25 })],
  options: [Object.freeze({
    id: UUID_A,
    handlerCode: "ARAS",
    handlerName: "Aras Kargo",
    desiKg: 2,
    priceCents: 2_554,
    codFeeCents: 1_000,
    currency: "TRY",
  })],
});

const shipment = Object.freeze({
  id: UUID_A,
  providerCode: "basit_kargo",
  direction: "outgoing",
  status: "shipped",
  carrier: "Aras Kargo",
  barcode: "1234567890",
  trackingNumber: "TRK1234567890",
  trackingUrl: "https://tracking.example.test/TRK1234567890",
  priceCents: 2_554,
  codAmountCents: 0,
  currency: "TRY",
  items: [Object.freeze({ orderItemId: UUID_B, productName: "Altın Yüzük", quantity: 1 })],
  events: [Object.freeze({ id: UUID_B, status: "shipped", occurredAt: NOW })],
  label: Object.freeze({ available: true, version: 1 }),
  version: 3,
  createdAt: NOW,
  updatedAt: NOW,
});

test("shipping connection parser returns a deeply frozen safe projection", () => {
  const parse = exportedFunction("parseShippingConnection");
  const parsed = parse(connection) as typeof connection;
  assert.deepEqual(parsed, connection);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.hasOwn(parsed, "storeId"), false);
  assert.equal(Object.hasOwn(parsed, "token"), false);
});

test("shipping connection parser rejects hidden authority and malformed lifecycle", () => {
  const parse = exportedFunction("parseShippingConnection");
  for (const invalid of [
    { ...connection, token: "secret" },
    { ...connection, storeId: UUID_A },
    { ...connection, status: "connected" },
    { ...connection, credentialVersion: 0 },
    { ...connection, verifiedAt: "2026-08-06" },
    { ...connection, selectedBrandLabel: " Brand" },
  ]) assert.throws(() => parse(invalid), /shipping_contract_invalid/u);
});

test("shipping resources expose labels without provider resource authority", () => {
  const parse = exportedFunction("parseShippingResource");
  const parsed = parse({ id: UUID_A, kind: "brand", label: "Güzide Kuyumcu", active: true, verifiedAt: NOW }) as Readonly<Record<string, unknown>>;
  assert.deepEqual(parsed, { id: UUID_A, kind: "brand", label: "Güzide Kuyumcu", active: true, verifiedAt: NOW });
  assert.equal(Object.isFrozen(parsed), true);
  assert.throws(() => parse({ ...parsed, providerResourceId: "provider-brand-1" }), /shipping_contract_invalid/u);
});

test("shipping quote parser preserves literal provider prices and freezes nested rows", () => {
  const parse = exportedFunction("parseShippingQuoteSession");
  const parsed = parse(quote) as typeof quote;
  assert.deepEqual(parsed, quote);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.packages), true);
  assert.equal(Object.isFrozen(parsed.packages[0]), true);
  assert.equal(Object.isFrozen(parsed.options[0]), true);
});

test("shipping quote parser rejects browser price authority and invalid packages", () => {
  const parse = exportedFunction("parseShippingQuoteSession");
  for (const invalid of [
    { ...quote, profileId: UUID_B },
    { ...quote, currency: "USD" },
    { ...quote, packages: [] },
    { ...quote, packages: [{ heightCm: 0, widthCm: 15, depthCm: 5, weightKg: 1 }] },
    { ...quote, options: [{ ...quote.options[0], priceCents: 25.54 }] },
    { ...quote, options: [{ ...quote.options[0], handlerCode: "aras" }] },
  ]) assert.throws(() => parse(invalid), /shipping_contract_invalid/u);
});

test("shipment parser returns verified tracking facts and no provider internals", () => {
  const parse = exportedFunction("parseShipment");
  const parsed = parse(shipment) as typeof shipment;
  assert.deepEqual(parsed, shipment);
  assert.equal(Object.isFrozen(parsed.items), true);
  assert.equal(Object.isFrozen(parsed.events[0]), true);
  assert.equal(Object.hasOwn(parsed, "providerShipmentId"), false);
  assert.equal(Object.hasOwn(parsed, "objectKey"), false);
});

test("shipment parser rejects secret, non-HTTPS, and inconsistent tracking shapes", () => {
  const parse = exportedFunction("parseShipment");
  for (const invalid of [
    { ...shipment, credentialVersion: 2 },
    { ...shipment, providerShipmentId: "888-6AR-OUP" },
    { ...shipment, trackingUrl: "http://tracking.example.test/1" },
    { ...shipment, trackingNumber: undefined },
    { ...shipment, items: [{ ...shipment.items[0], quantity: 0 }] },
    { ...shipment, label: { available: false, version: 1 } },
  ]) assert.throws(() => parse(invalid), /shipping_contract_invalid/u);
});

test("shipment mutation parser is replay-aware and finite", () => {
  const parse = exportedFunction("parseShipmentMutationResult");
  const value = { shipmentId: UUID_A, status: "ready", version: 2, updatedAt: NOW, replayed: false };
  assert.deepEqual(parse(value), value);
  assert.throws(() => parse({ ...value, replayed: "false" }), /shipping_contract_invalid/u);
  assert.throws(() => parse({ ...value, status: "paid" }), /shipping_contract_invalid/u);
});

test("shipping permissions let operations staff fulfill but keep analysts read-only", () => {
  const allowed = exportedFunction("isMerchantActionAllowed");
  assert.equal(allowed("store_owner", "shipping.manage"), true);
  assert.equal(allowed("admin", "shipping.manage"), true);
  assert.equal(allowed("editor", "shipping.manage"), true);
  assert.equal(allowed("analyst", "shipping.manage"), false);
  assert.equal(allowed("analyst", "shipping.read"), true);
});
