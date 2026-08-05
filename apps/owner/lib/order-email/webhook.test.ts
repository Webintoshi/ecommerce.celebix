import assert from "node:assert/strict";
import test from "node:test";

import type { OrderEmailWorkflowRepository } from "@celebix/saas-data";
import { Webhook } from "svix";

import { createOrderEmailWebhookHandler, verifyOrderEmailWebhook } from "./webhook.ts";

const SECRET = `whsec_${Buffer.alloc(32, 8).toString("base64")}`;
const EVENT_ID = "msg_order_email_1042";
const MESSAGE_ID = "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794";
const OCCURRED = "2026-08-05T12:00:00.000Z";
const RECEIVED = new Date("2026-08-05T12:00:01.000Z");

function signed(type = "email.delivered") {
  const body = JSON.stringify({ type, created_at: OCCURRED, data: { email_id: MESSAGE_ID, to: ["private@example.test"], subject: "Private order" } });
  const date = new Date();
  const webhook = new Webhook(SECRET);
  return { body, headers: { "svix-id": EVENT_ID, "svix-timestamp": String(Math.floor(date.getTime() / 1_000)), "svix-signature": webhook.sign(EVENT_ID, date, body) } };
}

test("real Svix signature verifies raw body and maps only the finite delivery event", () => {
  const event = signed("email.delivered");
  assert.deepEqual(verifyOrderEmailWebhook(event.body, event.headers, SECRET), {
    kind: "supported", providerEventId: EVENT_ID, providerMessageId: MESSAGE_ID,
    type: "delivered", occurredAt: OCCURRED,
  });
  assert.throws(() => verifyOrderEmailWebhook(`${event.body} `, event.headers, SECRET), /order_email_webhook_invalid/u);
  const ignored = signed("email.opened");
  assert.deepEqual(verifyOrderEmailWebhook(ignored.body, ignored.headers, SECRET), { kind: "ignored" });
});

class Repository {
  readonly events: any[] = [];
  constructor(readonly unavailable = false) {}
  async recordProviderEvent(input: unknown) { if (this.unavailable) throw new Error("database private detail"); this.events.push(input); return "recorded" as const; }
}

test("handler persists a verified supported event before returning no-store 200", async () => {
  const event = signed("email.bounced");
  const repository = new Repository();
  const handler = createOrderEmailWebhookHandler({ secret: SECRET, repository: repository as unknown as OrderEmailWorkflowRepository, now: () => RECEIVED });
  const response = await handler(new Request("https://auth.example.test/api/webhooks/resend/order-email", { method: "POST", headers: event.headers, body: event.body }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(repository.events, [{ providerEventId: EVENT_ID, providerMessageId: MESSAGE_ID, type: "bounced", occurredAt: new Date(OCCURRED), receivedAt: RECEIVED, safeReasonCode: "hard_bounce" }]);
});

test("handler returns 400 before persistence and 503 only after a valid event", async () => {
  const event = signed();
  const repository = new Repository(true);
  const handler = createOrderEmailWebhookHandler({ secret: SECRET, repository: repository as unknown as OrderEmailWorkflowRepository, now: () => RECEIVED });
  const invalid = await handler(new Request("https://auth.example.test/api/webhooks/resend/order-email", { method: "POST", headers: { ...event.headers, "svix-signature": "v1,invalid" }, body: event.body }));
  assert.equal(invalid.status, 400);
  const unavailable = await handler(new Request("https://auth.example.test/api/webhooks/resend/order-email", { method: "POST", headers: event.headers, body: event.body }));
  assert.equal(unavailable.status, 503);
  const oversized = await handler(new Request("https://auth.example.test/api/webhooks/resend/order-email", { method: "POST", headers: event.headers, body: "x".repeat(70_000) }));
  assert.equal(oversized.status, 400);
});
