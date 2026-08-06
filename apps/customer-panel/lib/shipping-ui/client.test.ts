import assert from "node:assert/strict";
import test from "node:test";

import { createShippingFulfillmentApi, createShippingSettingsApi } from "./client.ts";

const OPERATION = "72000000-0000-4000-8000-000000000003";
const BRAND = "72000000-0000-4000-8000-000000000005";
const ADDRESS = "72000000-0000-4000-8000-000000000006";
const ORDER = "72000000-0000-4000-8000-000000000007";
const OPTION = "72000000-0000-4000-8000-000000000009";
const SHIPMENT = "72000000-0000-4000-8000-000000000010";
const QUOTE_CREDENTIAL = "quote_0123456789abcdef0123456789abcdef";
const CONNECTION = { providerCode: "basit_kargo", displayName: "Basit Kargo", status: "active", credentialVersion: 1, selectedBrandLabel: "Güzide", selectedAddressLabel: "Merkez", codDeliveredMarksPaid: false, verifiedAt: "2026-08-06T12:00:00.000Z", version: 3 };
const RESOURCES = [
  { id: BRAND, kind: "brand", label: "Güzide", active: true, verifiedAt: "2026-08-06T12:00:00.000Z" },
  { id: ADDRESS, kind: "address", label: "Merkez", active: true, verifiedAt: "2026-08-06T12:00:00.000Z" },
];

test("browser save submits only token and operation identity", async () => {
  const requests: Request[] = [];
  const api = createShippingSettingsApi(async (input, init) => {
    requests.push(new Request(new URL(String(input), "https://panel.test"), init));
    return Response.json({ connection: CONNECTION, resources: RESOURCES });
  }, () => OPERATION);
  await api.saveConnection("bk_live_secret_123456789");
  assert.equal(requests[0]?.url.endsWith("/api/settings/shipping/connection"), true);
  assert.deepEqual(await requests[0]!.json(), { token: "bk_live_secret_123456789", operationId: OPERATION });
  assert.equal(requests[0]?.credentials, "same-origin");
});

test("client parses safe workspace and sends bounded resource choices", async () => {
  const bodies: unknown[] = [];
  const api = createShippingSettingsApi(async (_input, init) => {
    if (init?.body) bodies.push(JSON.parse(String(init.body)));
    return Response.json({ connection: CONNECTION, resources: RESOURCES });
  }, () => OPERATION);
  const current = await api.current();
  assert.equal(current.connection?.status, "active");
  await api.selectResources({ brandResourceId: BRAND, addressResourceId: ADDRESS, codDeliveredMarksPaid: true });
  await api.revoke();
  assert.deepEqual(bodies, [
    { operationId: OPERATION, brandResourceId: BRAND, addressResourceId: ADDRESS, codDeliveredMarksPaid: true },
    { operationId: OPERATION },
  ]);
});

test("client rejects unsafe response projections", async () => {
  const api = createShippingSettingsApi(async () => Response.json({ connection: { ...CONNECTION, token: "secret" }, resources: [] }), () => OPERATION);
  await assert.rejects(() => api.current(), /shipping_settings_unavailable/u);
});

test("fulfillment client sends only package facts and selected quote authority", async () => {
  const requests: Request[] = [];
  const quote = {
    credential: QUOTE_CREDENTIAL, status: "quoted", expiresAt: "2026-08-06T12:15:00.000Z", currency: "TRY",
    packages: [{ heightCm: 10, widthCm: 20, depthCm: 30, weightKg: 2 }],
    options: [{ id: OPTION, handlerCode: "YURTICI", handlerName: "Yurtiçi Kargo", desiKg: 2, priceCents: 12990, currency: "TRY" }],
  };
  const shipment = {
    id: SHIPMENT, providerCode: "basit_kargo", direction: "outgoing", status: "ready", carrier: "Yurtiçi Kargo", barcode: "BK-123", trackingNumber: "TRK-123",
    priceCents: 12990, codAmountCents: 0, currency: "TRY", items: [{ orderItemId: BRAND, productName: "Kolye", quantity: 1 }],
    events: [], label: { available: false }, version: 2, createdAt: "2026-08-06T12:00:00.000Z", updatedAt: "2026-08-06T12:00:00.000Z",
  };
  const api = createShippingFulfillmentApi(async (input, init) => {
    const selected = new Request(new URL(String(input), "https://panel.test"), init);
    requests.push(selected);
    return Response.json(requests.length === 1 ? { quote } : { shipment }, { status: requests.length === 1 ? 200 : 201 });
  }, () => OPERATION);
  await api.quote(ORDER, 3, quote.packages);
  await api.createShipment(ORDER, 3, QUOTE_CREDENTIAL, OPTION);
  await api.currentShipmentForOrder(ORDER);
  assert.deepEqual(await requests[0]!.json(), { operationId: OPERATION, expectedOrderVersion: 3, packages: quote.packages });
  const shipmentBody = await requests[1]!.json();
  assert.deepEqual(shipmentBody, { operationId: OPERATION, expectedOrderVersion: 3, quoteCredential: QUOTE_CREDENTIAL, optionId: OPTION });
  assert.equal(JSON.stringify(shipmentBody).includes("handlerCode"), false);
  assert.equal(requests[2]?.method, "GET");
  assert.equal(requests[2]?.url.endsWith(`/api/orders/${ORDER}/shipping/shipments`), true);
});

test("fulfillment client rejects forged paths and private response fields", async () => {
  const api = createShippingFulfillmentApi(async () => Response.json({ quote: { credential: QUOTE_CREDENTIAL, token: "secret" } }), () => OPERATION);
  await assert.rejects(() => api.quote("not-an-order", 3, [{ heightCm: 10, widthCm: 20, depthCm: 30, weightKg: 2 }]), /Bilgileri kontrol edin/u);
  await assert.rejects(() => api.quote(ORDER, 3, [{ heightCm: 10, widthCm: 20, depthCm: 30, weightKg: 2 }]), /Kargo hizmetine/u);
});
