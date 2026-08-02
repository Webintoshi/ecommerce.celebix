import assert from "node:assert/strict";
import test from "node:test";

import { parseNewsletterSubscribeInput } from "./newsletter.ts";

test("newsletter contract accepts only an exact, consented public email input", () => {
  assert.deepEqual(parseNewsletterSubscribeInput({ email: "ada@example.test", consent: true }), {
    email: "ada@example.test",
    consent: true,
  });
  for (const input of [
    { email: "ada@example.test", consent: false },
    { email: "ada@example.test", consent: true, storeId: "10000000-0000-4000-8000-000000000001" },
    { email: " ada@example.test", consent: true },
    { email: "ada@example.test", consent: true, tenantId: "attacker" },
    Object.create({ email: "ada@example.test", consent: true }),
  ]) assert.throws(() => parseNewsletterSubscribeInput(input), /newsletter_subscribe_input_invalid/u);
});

test("newsletter contract normalizes only the email case and preserves fixed consent", () => {
  assert.deepEqual(parseNewsletterSubscribeInput({ email: "Ada@Example.TEST", consent: true }), {
    email: "ada@example.test",
    consent: true,
  });
});
