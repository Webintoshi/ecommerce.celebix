import assert from "node:assert/strict";
import test from "node:test";
import { createAdminVatanSmsWhatsAppDelivery } from "./delivery.ts";

const reportId = "20000000-0000-4000-8000-000000000001";
const message = { phone: "05321234567", code: "123456", storeName: "Alpler", idempotencyKey: "10000000-0000-4000-8000-000000000001" };
const options = { apiKey: "local_fixture_key_123456", regId: "123", timeoutMs: 1000 };
const accepted = { code: 200, status: "OK", reports: [{ reportId, phone: "905321234567" }] };

test("admin delivery sends exactly one normalized target with admin branding and returns matching acceptance", async () => {
  let calls = 0;
  const send = createAdminVatanSmsWhatsAppDelivery({ ...options, fetch: async request => {
    calls++; assert.equal(request.url, "https://api.toplusms.app/bulk/wp/nton"); assert.equal(request.method, "POST"); assert.equal(request.redirect, "error");
    const payload = await request.json() as { messages: { reg_id: string; target: string; message: string }[] };
    assert.equal(payload.messages.length, 1); assert.equal(payload.messages[0]!.target, "905321234567"); assert.equal(payload.messages[0]!.reg_id, "123");
    assert.match(payload.messages[0]!.message, /Alpler.*yönetici.*123456/u);
    assert.equal(request.headers.get("X-Api-Key"), options.apiKey);
    return Response.json(accepted);
  } });
  assert.deepEqual(await send(message), { reportId, recipient: "905321234567" }); assert.equal(calls, 1);
});

test("ambiguous provider bodies never count as acceptance or retry", async () => {
  for (const body of [
    { ...accepted, reports: [] }, { ...accepted, reports: [...accepted.reports, ...accepted.reports] },
    { ...accepted, reports: [{ reportId, phone: "905321234568" }] },
    { ...accepted, reports: [{ reportId: "invalid", phone: "905321234567" }] },
    { ...accepted, code: "200" }, { ...accepted, status: "FAIL" }, { ...accepted, reports: [null] },
  ]) {
    let calls = 0;
    const send = createAdminVatanSmsWhatsAppDelivery({ ...options, fetch: async () => { calls++; return Response.json(body); } });
    await assert.rejects(send(message), /^Error: admin_whatsapp_delivery_unavailable$/u); assert.equal(calls, 1);
  }
});

test("redirect, malformed JSON, oversized and failed provider responses fail safely", async () => {
  for (const response of [new Response(null, { status: 302, headers: { location: "https://other.example" } }), new Response("{"), new Response("x".repeat(32769)), new Response("failure-secret", { status: 503 })]) {
    const send = createAdminVatanSmsWhatsAppDelivery({ ...options, fetch: async () => response });
    await assert.rejects(send(message), /^Error: admin_whatsapp_delivery_unavailable$/u);
  }
});

test("deadline bounds stalled fetch and stalled response body even when fixture ignores abort", async () => {
  for (const fetch of [async () => await new Promise<Response>(() => {}), async () => new Response(new ReadableStream({ start() {} }))]) {
    const send = createAdminVatanSmsWhatsAppDelivery({ ...options, timeoutMs: 20, fetch });
    const started = Date.now(); await assert.rejects(send(message), /^Error: admin_whatsapp_delivery_unavailable$/u);
    assert.ok(Date.now() - started < 1000);
  }
});

test("invalid input cannot dispatch and failure details do not reveal secrets", async () => {
  let calls = 0;
  const send = createAdminVatanSmsWhatsAppDelivery({ ...options, fetch: async () => { calls++; throw new Error("provider-secret"); } });
  for (const change of [{ phone: "bad-phone" }, { code: "12345" }, { storeName: "Alpler\nCode" }, { idempotencyKey: "not-uuid" }]) await assert.rejects(send({ ...message, ...change }), /^Error: admin_whatsapp_delivery_unavailable$/u);
  assert.equal(calls, 0);
  await assert.rejects(send(message), /^Error: admin_whatsapp_delivery_unavailable$/u); assert.equal(calls, 1);
  assert.throws(() => createAdminVatanSmsWhatsAppDelivery({ ...options, timeoutMs: 12001, fetch: async () => Response.json(accepted) }), /^Error: admin_whatsapp_delivery_unavailable$/u);
});
