import assert from "node:assert/strict";
import test from "node:test";

import {
  BASIT_KARGO_CREATE_FIXTURE,
  BasitKargoAdapter,
  createBasitKargoFixtureTransport,
  mapBasitKargoStatus,
} from "../../index.ts";

const TOKEN = "bk_test_token_1234";
const credential = Object.freeze({ token: TOKEN });

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
