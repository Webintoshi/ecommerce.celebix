import assert from "node:assert/strict";
import test from "node:test";
import { Webhook } from "svix";
import { createNativeMarketingWebhookHandler, verifyNativeMarketingWebhook } from "./webhook.ts";
const SECRET = `whsec_${Buffer.alloc(32, 8).toString("base64")}`, MESSAGE = "22222222-2222-4222-8222-222222222222", NOW = new Date("2026-10-18T10:00:00.000Z");
function signed(type = "email.delivered", native = true) {
  const body = JSON.stringify({ type, created_at: NOW.toISOString(), data: { email_id: MESSAGE, to: ["private@example.test"], subject: "private", ...(native ? { tags: { tenant_id: "11111111-1111-4111-8111-111111111111", delivery_id: MESSAGE } } : {}) } }), date = new Date(), id = "msg_marketing_test";
  return { body, headers: { "svix-id": id, "svix-timestamp": String(Math.floor(date.getTime()/1_000)), "svix-signature": new Webhook(SECRET).sign(id,date,body) } };
}
test("real Svix verifies exact raw body before mapping provider id and finite status", () => {
  const event = signed("email.bounced"), verified = verifyNativeMarketingWebhook(event.body,event.headers,SECRET);
  assert.deepEqual(verified,{kind:"supported",providerEventId:"msg_marketing_test",providerMessageId:MESSAGE,type:"bounced",occurredAt:NOW.toISOString(),safeReasonCode:"hard_bounce"});
  assert.throws(()=>verifyNativeMarketingWebhook(event.body+" ",event.headers,SECRET));
  assert.doesNotMatch(JSON.stringify(verified),/private@example|subject/u);
});
test("signed unrelated team mail is acknowledged without retrying an unmapped message forever", async () => {
  const event = signed("email.delivered", false);
  assert.deepEqual(verifyNativeMarketingWebhook(event.body, event.headers, SECRET), { kind: "ignored" });
});
test("webhook persists verified dedup identity and never accepts unsigned or oversized input", async () => {
  const writes: unknown[] = [], event = signed();
  const handler = createNativeMarketingWebhookHandler({ secret: SECRET, now: () => NOW, repository: { async recordProviderEvent(input) { writes.push(input); return writes.length === 1 ? "recorded" : "replayed"; } } });
  const request = () => new Request("https://owner.example.test/api/webhooks/resend/marketing-email",{method:"POST",...event});
  assert.equal((await handler(request())).status,200); assert.equal((await handler(request())).status,200);
  assert.deepEqual(writes[0],writes[1]);
  assert.equal((await handler(new Request("https://owner.example.test/api/webhooks/resend/marketing-email",{method:"POST",body:event.body}))).status,400);
  assert.equal((await handler(new Request("https://owner.example.test/api/webhooks/resend/marketing-email",{method:"POST",headers:event.headers,body:"x".repeat(70_000)}))).status,400);
  assert.equal(writes.length,2);
});
