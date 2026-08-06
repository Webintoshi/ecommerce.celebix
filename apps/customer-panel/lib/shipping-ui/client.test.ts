import assert from "node:assert/strict";
import test from "node:test";

import { createShippingSettingsApi } from "./client.ts";

const OPERATION = "72000000-0000-4000-8000-000000000003";
const BRAND = "72000000-0000-4000-8000-000000000005";
const ADDRESS = "72000000-0000-4000-8000-000000000006";
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
