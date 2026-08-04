import assert from "node:assert/strict";
import test from "node:test";

import { createResendStorefrontIdentityEmailDelivery } from "./email-delivery.ts";

test("platform delivery sends one bounded store-branded verification message", async () => {
  let captured: Request | undefined;
  const deliver = createResendStorefrontIdentityEmailDelivery({
    apiKey: "re_test_authority_0000000000000001",
    from: "accounts@celebix.test",
    fetch: async (request) => { captured = request; return new Response('{"id":"email_01"}', { status: 200, headers: { "content-type": "application/json" } }); },
    timeoutMs: 5_000,
  });
  await deliver({ email: "ada@example.test", code: "042319", storeName: "Güzide & Kuyumcu" });
  assert.equal(captured?.url, "https://api.resend.com/emails");
  assert.equal(captured?.method, "POST");
  assert.equal(captured?.headers.get("authorization"), "Bearer re_test_authority_0000000000000001");
  const body = JSON.parse(await captured!.text());
  assert.equal(body.to, "ada@example.test");
  assert.match(body.subject, /Güzide & Kuyumcu/u);
  assert.match(body.text, /042319/u);
  assert.match(body.html, /Güzide &amp; Kuyumcu/u);
});

test("provider errors and oversized responses collapse to one private failure", async () => {
  for (const response of [new Response("secret-provider-detail", { status: 500 }), new Response("x".repeat(40_000), { status: 200 })]) {
    const deliver = createResendStorefrontIdentityEmailDelivery({ apiKey: "re_test_authority_0000000000000001", from: "accounts@celebix.test", fetch: async () => response, timeoutMs: 5_000 });
    await assert.rejects(deliver({ email: "ada@example.test", code: "042319", storeName: "Güzide" }), (error: unknown) => error instanceof Error && error.message === "account_email_unavailable");
  }
});
