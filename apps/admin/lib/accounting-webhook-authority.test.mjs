import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifyAccountingWebhook } from "./accounting-webhook-authority.ts";

test("a current signature admits a configured accounting notification", () => {
  const now = 1_750_000_000_000;
  const timestamp = String(now / 1000);
  const body = Buffer.from(JSON.stringify({ status: "sent" }));
  const secret = "dummy-accounting-signature-test-key";
  const signature = createHmac("sha256", secret).update(timestamp).update(".").update(body).digest("hex");
  assert.equal(verifyAccountingWebhook({ body, timestamp, signature }, secret, now), true);
  assert.equal(verifyAccountingWebhook({ body, timestamp, signature }, secret, now + 301_000), false);
  assert.equal(verifyAccountingWebhook({ body, timestamp, signature }, undefined, now), false);
});
