import assert from "node:assert/strict";
import test from "node:test";

import { createStorefrontMagicTicket, parseStorefrontIdentityKeyring, sealAccountChallenge, serializeAccountMagicTicket } from "./credential.ts";
import { createResendStorefrontIdentityEmailDelivery } from "./email-delivery.ts";

const keyring = parseStorefrontIdentityKeyring("seal_01", JSON.stringify([{ keyId: "seal_01", key: Buffer.alloc(32, 7).toString("base64url") }]));
const sealed = sealAccountChallenge({ challengeId: "10000000-0000-4000-8000-000000000001", email: "ada@example.test", expiresAt: "2026-08-04T09:10:00.000Z" }, keyring, (size) => new Uint8Array(size).fill(5));
const ticket = serializeAccountMagicTicket(sealed, createStorefrontMagicTicket((size) => new Uint8Array(size).fill(6)));
const message = Object.freeze({ email: "ada@example.test", ticket, code: "042319", storeName: "Güzide & Kuyumcu", storeOrigin: "https://identity-a.saas-staging.celebix.site", returnTo: "/account/orders", idempotencyKey: "70000000-0000-4000-8000-000000000083" });

test("platform delivery sends one bounded store-branded verification message", async () => {
  let captured: Request | undefined;
  const deliver = createResendStorefrontIdentityEmailDelivery({
    apiKey: "re_test_authority_0000000000000001",
    from: "accounts@celebix.test",
    fetch: async (request) => { captured = request; return new Response('{"id":"email_01"}', { status: 200, headers: { "content-type": "application/json" } }); },
    timeoutMs: 5_000,
  });
  await deliver(message);
  assert.equal(captured?.url, "https://api.resend.com/emails");
  assert.equal(captured?.method, "POST");
  assert.equal(captured?.headers.get("authorization"), "Bearer re_test_authority_0000000000000001");
  assert.equal(captured?.headers.get("idempotency-key"), "account-login/70000000-0000-4000-8000-000000000083");
  const body = JSON.parse(await captured!.text());
  assert.equal(body.to, "ada@example.test");
  assert.match(body.subject, /Güzide & Kuyumcu/u);
  assert.equal(body.from, "Güzide & Kuyumcu <accounts@celebix.test>");
  assert.match(body.text, /042319/u);
  assert.match(body.text, /https:\/\/identity-a[.]saas-staging[.]celebix[.]site\/account\/verify[?]/u);
  assert.match(body.text, /returnTo=%2Faccount%2Forders/u);
  assert.match(body.html, /Güzide &amp; Kuyumcu/u);
  assert.match(body.html, /Giriş yap/u);
});

test("provider errors and oversized responses collapse to one private failure", async () => {
  for (const response of [new Response("secret-provider-detail", { status: 500 }), new Response("x".repeat(40_000), { status: 200 })]) {
    const deliver = createResendStorefrontIdentityEmailDelivery({ apiKey: "re_test_authority_0000000000000001", from: "accounts@celebix.test", fetch: async () => response, timeoutMs: 5_000 });
    await assert.rejects(deliver({ ...message, storeName: "Güzide" }), (error: unknown) => error instanceof Error && error.message === "account_email_unavailable");
  }
});

test("delivery rejects cross-origin links malformed idempotency and header injection", async () => {
  const deliver = createResendStorefrontIdentityEmailDelivery({ apiKey: "re_test_authority_0000000000000001", from: "accounts@celebix.test", fetch: async () => new Response('{"id":"email_01"}'), timeoutMs: 5_000 });
  for (const selected of [
    { ...message, storeOrigin: "http://identity-a.saas-staging.celebix.site" },
    { ...message, returnTo: "//attacker.example" },
    { ...message, idempotencyKey: "not-a-uuid" },
    { ...message, storeName: "Güzide\nBcc: attacker@example.test" },
  ]) await assert.rejects(deliver(selected), /account_email_unavailable/u);
});
