import assert from "node:assert/strict";
import test from "node:test";

import {
  BASIT_KARGO_CREATE_FIXTURE,
  BasitKargoAdapter,
  createBasitKargoFixtureTransport,
  mapBasitKargoStatus,
} from "../../index.ts";
import { parseBasitKargoShipment } from "./validation.ts";

const TOKEN = "bk_test_token_1234";
const credential = Object.freeze({ token: TOKEN });

function documentedShipment() {
  return {
    id: "888-6AR-OUP", barcode: "1234567890", type: "OUTGOING", status: "READY_TO_SHIP",
    shipmentInfo: { handler: { name: "Sürat Kargo", code: "SURAT" }, handlerShipmentCode: null },
    priceInfo: { paymentMethod: "ADVANCE", shipmentFee: 89.90, extraFee: null, returnFee: null, extraServicesFee: 0, totalCost: 89.90 },
    orderTotal: 349.90, orderPaymentType: "COLLECT_ON_DELIVERY", orderPaymentStatus: null,
    codInfo: { collectOnDelivery: true, type: "CASH", amount: 349.90, collectionStatus: "COLLECTION_PENDING", collectionStatusText: "Tahsilat Bekleniyor", releaseDate: null },
  };
}

test("Basit Kargo maps every documented status", () => {
  assert.deepEqual(([
    "NEW", "READY_TO_SHIP", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED",
    "NEEDS_SUPPORT", "DELAYED", "RETURNING", "RETURNED", "LOST",
  ] as const).map(mapBasitKargoStatus), [
    "ready", "ready", "shipped", "out_for_delivery", "delivered",
    "attention_required", "delayed", "returning", "returned", "lost",
  ]);
  assert.throws(() => mapBasitKargoStatus("PAID" as never), /basit_kargo_response_invalid/u);
});

test("credential parser accepts only one exact canonical token", () => {
  const adapter = new BasitKargoAdapter({ transport: createBasitKargoFixtureTransport([]) });
  const parsed = adapter.parseCredential({ token: TOKEN });
  assert.deepEqual(parsed, { token: TOKEN });
  assert.equal(Object.isFrozen(parsed), true);
  for (const invalid of [
    { token: "short" },
    { token: TOKEN, account: "hidden" },
    { token: `${TOKEN} ` },
    { token: `bad\ntoken_${"x".repeat(16)}` },
  ]) assert.throws(() => adapter.parseCredential(invalid), /basit_kargo_credential_invalid/u);
});

test("lists exact handlers brands and sender addresses without leaking private address fields", async () => {
  const transport = createBasitKargoFixtureTransport([
    { kind: "json", status: 200, body: [{ name: "Aras Kargo", code: "ARAS", logo: "https://cdn.example/aras.png" }] },
    { kind: "json", status: 200, body: [{ id: "brand-1", name: "Güzide Kuyumcu", status: "APPROVED", logo: null, website: null, instagram: null, createdAt: "2026-08-01T10:00:00" }] },
    { kind: "json", status: 200, body: [{ id: "address-1", name: "Merkez Depo", phone: "5551234567", city: "İstanbul", town: "Kadıköy", address: "Koşuyolu", type: "SHIPPING", createdTime: "2026-08-01T10:00:00" }] },
  ]);
  const adapter = new BasitKargoAdapter({ transport });

  assert.deepEqual(await adapter.listHandlers({ credential, signal: AbortSignal.timeout(1_000) }), {
    kind: "succeeded",
    handlers: [{ handlerCode: "ARAS", handlerName: "Aras Kargo", active: true }],
  });
  assert.deepEqual(await adapter.listBrands({ credential, signal: AbortSignal.timeout(1_000) }), {
    kind: "succeeded",
    resources: [{ providerResourceId: "brand-1", label: "Güzide Kuyumcu", active: true }],
  });
  const addresses = await adapter.listSenderAddresses({ credential, signal: AbortSignal.timeout(1_000) });
  assert.deepEqual(addresses, {
    kind: "succeeded",
    resources: [{ providerResourceId: "address-1", label: "Merkez Depo", active: true }],
  });
  assert.doesNotMatch(JSON.stringify(addresses), /5551234567|Koşuyolu/u);
  assert.deepEqual(transport.calls.map((call) => call.path), ["/handlers", "/firm/brand", "/firm/address"]);
});

test("accepts an account that has not created a brand or sender address yet", async () => {
  const transport = createBasitKargoFixtureTransport([
    { kind: "json", status: 200, body: [] },
    { kind: "json", status: 200, body: [] },
  ]);
  const adapter = new BasitKargoAdapter({ transport });
  const input = { credential, signal: AbortSignal.timeout(1_000) };
  assert.deepEqual(await adapter.listBrands(input), { kind: "succeeded", resources: [] });
  assert.deepEqual(await adapter.listSenderAddresses(input), { kind: "succeeded", resources: [] });
});

test("quotes packages with provider literal prices converted once to TRY minor units", async () => {
  const transport = createBasitKargoFixtureTransport([{
    kind: "json",
    status: 200,
    body: [{ desiKg: 2, handlerCode: "ARAS", price: 25.54, codFee: 10 }],
  }]);
  const adapter = new BasitKargoAdapter({ transport });
  const result = await adapter.quotePackages({
    credential,
    packages: [{ heightCm: 10, widthCm: 15, depthCm: 5, weightKg: 1.25 }],
    codAmountCents: 10_000,
    signal: AbortSignal.timeout(1_000),
  });
  assert.deepEqual(result, {
    kind: "succeeded",
    options: [{ handlerCode: "ARAS", handlerName: "Aras Kargo", desiKg: 2, priceCents: 2_554, codFeeCents: 1_000, currency: "TRY" }],
  });
  assert.deepEqual(transport.calls[0], {
    method: "POST",
    path: "/handlers/fee/packages",
    body: [{ height: 10, width: 15, depth: 5, weight: 1.25 }],
  });
});

test("accepts documented package quote capabilities without exposing provider extensions", async () => {
  const transport = createBasitKargoFixtureTransport([{
    kind: "json", status: 200, body: [
      { desiKg: 1, handlerCode: "SURAT", price: 87.93, inCityPrice: 74.10, minDesiKg: null, maxDesiKg: null, cashOnDelivery: false, creditCardOnDelivery: false, codFee: null },
      { desiKg: 2, handlerCode: "ARAS", price: 103, inCityPrice: null, minDesiKg: 0, maxDesiKg: 100, cashOnDelivery: true, creditCardOnDelivery: true, codFee: 12.50 },
    ],
  }]);
  const result = await new BasitKargoAdapter({ transport }).quotePackages({ credential, packages: BASIT_KARGO_CREATE_FIXTURE.packages, codAmountCents: 0, signal: AbortSignal.timeout(1_000) });
  assert.deepEqual(result, { kind: "succeeded", options: [
    { handlerCode: "SURAT", handlerName: "Sürat Kargo", desiKg: 1, priceCents: 8793, currency: "TRY" },
    { handlerCode: "ARAS", handlerName: "Aras Kargo", desiKg: 2, priceCents: 10300, codFeeCents: 1250, currency: "TRY" },
  ] });
});

test("rejects malformed package quote extensions and unreviewed response fields", async () => {
  for (const extension of [
    { inCityPrice: -1 }, { inCityPrice: "74.10" }, { inCityPrice: 1.001 },
    { minDesiKg: -1 }, { maxDesiKg: 10001 }, { minDesiKg: 5, maxDesiKg: 4 },
    { cashOnDelivery: "false" }, { creditCardOnDelivery: null }, { privateToken: "hidden" },
  ]) {
    const transport = createBasitKargoFixtureTransport([{ kind: "json", status: 200, body: [{ desiKg: 1, handlerCode: "SURAT", price: 87.93, ...extension }] }]);
    const result = await new BasitKargoAdapter({ transport }).quotePackages({ credential, packages: BASIT_KARGO_CREATE_FIXTURE.packages, codAmountCents: 0, signal: AbortSignal.timeout(1_000) });
    assert.deepEqual(result, { kind: "temporary_failure", safeCode: "provider_response_invalid" });
  }
});

test("creates a barcode from normalized server input and exact major-unit COD", async () => {
  const transport = createBasitKargoFixtureTransport([{
    kind: "json",
    status: 200,
    body: {
      id: "888-6AR-OUP", barcode: "1234567890", type: "OUTGOING", status: "NEW",
      validationFailed: false, createdTime: "2026-08-06T12:00:00",
    },
  }]);
  const adapter = new BasitKargoAdapter({ transport });
  const result = await adapter.createShipment(BASIT_KARGO_CREATE_FIXTURE);

  assert.equal(result.kind, "succeeded");
  if (result.kind === "succeeded") {
    assert.equal(result.shipment.providerReference, "888-6AR-OUP");
    assert.equal(result.shipment.status, "ready");
    assert.equal(result.shipment.barcode, "1234567890");
  }
  assert.equal(transport.calls.length, 1);
  assert.deepEqual(transport.calls[0], {
    method: "POST",
    path: "/v2/order/barcode",
    body: {
      handlerCode: "ARAS",
      type: "OUTGOING",
      content: {
        name: "Sipariş MAN-1001",
        code: "MAN-1001",
        items: [{ name: "Altın Yüzük", code: "line-1", quantity: "1" }],
        packages: [{ height: 10, width: 15, depth: 5, weight: 1.25 }],
      },
      client: { name: "Test Müşteri", phone: "5551234567", city: "İstanbul", town: "Kadıköy", address: "Koşuyolu" },
      collect: 100,
      collectOnDeliveryType: "CASH",
      addressId: "address-1",
      brandId: "brand-1",
    },
  });
});

test("accepts the documented nested barcode receipt without retaining order or COD details", async () => {
  const transport = createBasitKargoFixtureTransport([{ kind: "json", status: 200, body: documentedShipment() }]);
  const result = await new BasitKargoAdapter({ transport }).createShipment(BASIT_KARGO_CREATE_FIXTURE);
  assert.deepEqual(result, { kind: "succeeded", shipment: {
    providerReference: "888-6AR-OUP", direction: "outgoing", status: "ready", providerStatus: "READY_TO_SHIP",
    handlerCode: "SURAT", handlerName: "Sürat Kargo", barcode: "1234567890", priceCents: 8990, currency: "TRY",
  } });
  assert.equal(transport.calls.length, 1);
});

test("reads nested tracking and signed adjustments while retaining the shipment fee meaning", async () => {
  const body = documentedShipment();
  const transport = createBasitKargoFixtureTransport([{ kind: "json", status: 200, body: {
    ...body, status: "SHIPPED", validationFailed: false, createdTime: "2026-10-25T12:00:00",
    shipmentInfo: { ...body.shipmentInfo, handlerShipmentCode: "TRACK-123" },
    priceInfo: { ...body.priceInfo, shipmentFee: 85.90, extraFee: -4, returnFee: 5, extraServicesFee: 1.25, totalCost: 92.15 },
    codInfo: { ...body.codInfo, fee: 12.50, releaseDate: "2026-10-26" },
  } }]);
  const result = await new BasitKargoAdapter({ transport }).getShipment({ credential, providerReference: body.id, signal: AbortSignal.timeout(1_000) });
  assert.deepEqual(result, { kind: "succeeded", shipment: {
    providerReference: "888-6AR-OUP", direction: "outgoing", status: "shipped", providerStatus: "SHIPPED",
    handlerCode: "SURAT", handlerName: "Sürat Kargo", barcode: "1234567890", trackingNumber: "TRACK-123", priceCents: 8590, currency: "TRY",
  } });
});

test("accepts documented full order metadata and REST nulls without projecting any private details", async () => {
  const body = documentedShipment();
  const transport = createBasitKargoFixtureTransport([
    { kind: "json", status: 200, body: {
      ...body,
      content: { name: "Fixture parcel", packages: [{ height: 25, width: 10, depth: 20, weight: 1 }], totalDesiKg: 2 },
      sender: { name: "Fixture sender", phone: "5550000000" },
      recipient: { name: "Fixture recipient", city: "Yalova", town: "Merkez" },
      shipmentInfo: { ...body.shipmentInfo, lastState: "Gönderime Hazır" },
      traces: [{ status: "Gönderime Hazır", time: "2026-10-25T12:00:00", location: "YALOVA" }],
    } },
    { kind: "json", status: 200, body: {
      ...body, content: null, sender: null, recipient: null, traces: null,
      shipmentInfo: { ...body.shipmentInfo, lastState: null },
      priceInfo: { ...body.priceInfo, extraServicesFee: null },
    } },
  ]);
  const adapter = new BasitKargoAdapter({ transport });
  const created = await adapter.createShipment(BASIT_KARGO_CREATE_FIXTURE);
  const read = await adapter.getShipment({ credential, providerReference: body.id, signal: AbortSignal.timeout(1_000) });
  const expected = { kind: "succeeded", shipment: {
    providerReference: "888-6AR-OUP", direction: "outgoing", status: "ready", providerStatus: "READY_TO_SHIP",
    handlerCode: "SURAT", handlerName: "Sürat Kargo", barcode: "1234567890", priceCents: 8990, currency: "TRY",
  } };
  assert.deepEqual(created, expected);
  assert.deepEqual(read, expected);
  assert.equal(transport.calls.length, 2);
});

test("bounds known informational containers and rejects non-JSON objects without invoking them", () => {
  const body = documentedShipment();
  let accessed = false;
  const accessor = Object.defineProperty({}, "name", { enumerable: true, get() { accessed = true; return "hidden"; } });
  for (const extension of [
    { content: 42 }, { sender: [] }, { recipient: "wrong" }, { traces: {} },
    { content: { text: "x".repeat(4097) } },
    { content: Object.fromEntries(Array.from({ length: 17 }, (_, index) => [String(index), "x".repeat(4096)])) },
    { traces: Array.from({ length: 1001 }, () => null) },
    { content: Array.from({ length: 7 }).reduce(value => ({ nested: value }), {}) },
    { content: Object.fromEntries(Array.from({ length: 100 }, (_, index) => [String(index), Array.from({ length: 50 }, () => null)])) },
    { sender: accessor }, { recipient: new Proxy({}, {}) }, { content: { nested: Object.create(null) } },
    { content: { value: Infinity } }, { content: { value: () => null } },
    { shipmentInfo: { ...body.shipmentInfo, lastState: "x".repeat(201) } },
  ]) assert.throws(() => parseBasitKargoShipment({ ...body, ...extension }), /basit_kargo_response_invalid/u);
  assert.equal(accessed, false);
});

test("accepts a full-sized item list within the informational JSON byte budget", () => {
  const result = parseBasitKargoShipment({
    ...documentedShipment(),
    content: { items: Array.from({ length: 100 }, (_, index) => ({ name: "x".repeat(200), code: `SKU-${index}`, quantity: "1" })) },
  });
  assert.equal(result.providerReference, "888-6AR-OUP");
  assert.equal(Object.hasOwn(result, "content"), false);
});

test("legacy flat carrier and price fields remain compatible with matching nested fields", async () => {
  const body = documentedShipment();
  const transport = createBasitKargoFixtureTransport([{ kind: "json", status: 200, body: {
    id: body.id, barcode: body.barcode, type: body.type, status: body.status, validationFailed: false, createdTime: "2026-10-25T12:00:00",
    handler: body.shipmentInfo.handler, handlerShipmentCode: null, shipmentInfo: body.shipmentInfo,
    priceInfo: { shipmentFee: 89.90, totalCost: 89.90 },
  } }]);
  const result = await new BasitKargoAdapter({ transport }).createShipment(BASIT_KARGO_CREATE_FIXTURE);
  assert.equal(result.kind, "succeeded");
  if (result.kind === "succeeded") assert.equal(result.shipment.handlerCode, "SURAT");
});

test("malformed documented shipment fields remain unknown without repeating a charged create", async () => {
  const body = documentedShipment();
  for (const extension of [
    { privateToken: "hidden" }, { validationFailed: true }, { createdTime: "bad" },
    { shipmentInfo: { ...body.shipmentInfo, privateData: "hidden" } },
    { shipmentInfo: { ...body.shipmentInfo, handlerShipmentCode: "bad tracking" } },
    { handler: { name: "Aras Kargo", code: "ARAS" } }, { handlerShipmentCode: "CONTRADICTING-TRACK" },
    { priceInfo: { ...body.priceInfo, paymentMethod: "OTHER" } },
    { priceInfo: { ...body.priceInfo, extraFee: -0.001 } },
    { priceInfo: { ...body.priceInfo, returnFee: -1 } },
    { priceInfo: { ...body.priceInfo, extraServicesFee: "1" } },
    { priceInfo: { ...body.priceInfo, privateData: "hidden" } },
    { orderTotal: "349.90" }, { codInfo: { ...body.codInfo, amount: -1 } },
    { codInfo: { ...body.codInfo, collectOnDelivery: "true" } }, { codInfo: { ...body.codInfo, privateData: "hidden" } },
  ]) {
    const transport = createBasitKargoFixtureTransport([{ kind: "json", status: 200, body: { ...body, ...extension } }]);
    const result = await new BasitKargoAdapter({ transport }).createShipment(BASIT_KARGO_CREATE_FIXTURE);
    assert.deepEqual(result, { kind: "provider_outcome_unknown", providerReference: null });
    assert.equal(transport.calls.length, 1);
  }
});

test("create timeout is unknown and is never retried by the adapter", async () => {
  const transport = createBasitKargoFixtureTransport([{ kind: "unknown" }]);
  const result = await new BasitKargoAdapter({ transport }).createShipment(BASIT_KARGO_CREATE_FIXTURE);
  assert.deepEqual(result, { kind: "provider_outcome_unknown", providerReference: null });
  assert.equal(transport.calls.length, 1);
});

test("create 5xx and malformed success remain unknown without a blind retry", async () => {
  const transport = createBasitKargoFixtureTransport([
    { kind: "json", status: 503, body: { message: "down" } },
    { kind: "json", status: 200, body: { id: "maybe-created" } },
  ]);
  const adapter = new BasitKargoAdapter({ transport });
  assert.deepEqual(await adapter.createShipment(BASIT_KARGO_CREATE_FIXTURE), {
    kind: "provider_outcome_unknown", providerReference: null,
  });
  assert.deepEqual(await adapter.createShipment(BASIT_KARGO_CREATE_FIXTURE), {
    kind: "provider_outcome_unknown", providerReference: null,
  });
  assert.equal(transport.calls.length, 2);
});

test("classifies credential rejection throttling read failures and unsafe successful JSON", async () => {
  const transport = createBasitKargoFixtureTransport([
    { kind: "json", status: 401, body: { message: "secret provider detail" } },
    { kind: "json", status: 422, body: { message: "recipient invalid" } },
    { kind: "json", status: 429, retryAfterSeconds: 34, body: { message: "wait" } },
    { kind: "json", status: 503, body: { message: "down" } },
    { kind: "json", status: 200, body: [{ name: "Aras", code: "ARAS", logo: null, privateToken: "x" }] },
  ]);
  const adapter = new BasitKargoAdapter({ transport });
  const input = { credential, signal: AbortSignal.timeout(1_000) };
  assert.deepEqual(await adapter.listHandlers(input), { kind: "credential_invalid", safeCode: "credential_rejected" });
  assert.deepEqual(await adapter.listHandlers(input), { kind: "rejected", safeCode: "provider_rejected" });
  assert.deepEqual(await adapter.listHandlers(input), { kind: "throttled", retryAfterSeconds: 34 });
  assert.deepEqual(await adapter.listHandlers(input), { kind: "temporary_failure", safeCode: "provider_unavailable" });
  assert.deepEqual(await adapter.listHandlers(input), { kind: "temporary_failure", safeCode: "provider_response_invalid" });
});

test("gets cancels returns and downloads labels on their documented endpoints", async () => {
  const order = {
    id: "888-6AR-OUP", barcode: "1234567890", type: "OUTGOING", status: "SHIPPED",
    validationFailed: false, createdTime: "2026-08-06T12:00:00",
  };
  const transport = createBasitKargoFixtureTransport([
    { kind: "json", status: 200, body: order },
    { kind: "json", status: 200, body: { ...order, status: "NEW", barcode: null } },
    { kind: "json", status: 200, body: { ...order, id: "999-RET-URN", type: "INCOMING", status: "NEW" } },
    { kind: "svg", status: 200, body: "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>" },
  ]);
  const adapter = new BasitKargoAdapter({ transport });
  const signal = AbortSignal.timeout(1_000);
  assert.equal((await adapter.getShipment({ credential, providerReference: "888-6AR-OUP", signal })).kind, "succeeded");
  assert.equal((await adapter.cancelShipment({ credential, providerReference: "888-6AR-OUP", barcode: "1234567890", signal })).kind, "succeeded");
  assert.equal((await adapter.createReturnShipment({ credential, providerReference: "888-6AR-OUP", barcode: "1234567890", signal })).kind, "succeeded");
  const label = await adapter.downloadLabel({ credential, providerReference: "888-6AR-OUP", signal });
  assert.equal(label.kind, "succeeded");
  assert.deepEqual(transport.calls.map((call) => `${call.method} ${call.path}`), [
    "GET /v2/order/888-6AR-OUP",
    "DELETE /order/barcode/1234567890",
    "GET /v2/order/return/barcode/1234567890",
    "GET /label/svg/888-6AR-OUP",
  ]);
});
