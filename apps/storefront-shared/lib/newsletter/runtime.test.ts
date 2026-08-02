import assert from "node:assert/strict";
import test from "node:test";

import type { TrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";
import { createNewsletterSubscribeRoute, processNewsletterSubscription } from "./runtime.ts";

const HOST = "shop.example.test";
const NOW = new Date("2026-08-02T12:00:00.000Z");
const trusted = (): TrustedStorefrontHostAuthority => ({ kind: "trusted", hostname: HOST });

test("newsletter runtime persists only trusted hostname, fixed consent version, and canonical email", async () => {
  const received: unknown[] = [];
  const result = await processNewsletterSubscription({
    repository: { subscribe: async (input: unknown) => { received.push(input); return { outcome: "subscribed" }; } } as never,
    now: () => NOW,
  }, HOST, { email: "ada@example.test", consent: true });
  assert.deepEqual(result, { outcome: "subscribed" });
  assert.deepEqual(received, [{ hostname: HOST, now: NOW, email: "ada@example.test", consentVersion: "starter-v1" }]);
});

test("newsletter route returns identical no-store success and never accepts body store authority", async () => {
  let calls = 0;
  const handler = createNewsletterSubscribeRoute({
    selectAuthority: trusted,
    resolveRepository: async () => ({ subscribe: async () => { calls += 1; return { outcome: "subscribed" as const }; }, list: async () => [] }),
    now: () => NOW,
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await handler(new Request("http://internal:3450/api/newsletter/subscriptions", { method: "POST", headers: { origin: `https://${HOST}`, "content-type": "application/json" }, body: JSON.stringify({ email: "ada@example.test", consent: true }) }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { outcome: "subscribed" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  const denied = await handler(new Request("http://internal:3450/api/newsletter/subscriptions", { method: "POST", headers: { origin: `https://${HOST}`, "content-type": "application/json" }, body: JSON.stringify({ email: "ada@example.test", consent: true, storeId: "forged" }) }));
  assert.equal(denied.status, 400);
  assert.equal(calls, 2);
});

test("newsletter route fails closed before persistence without trusted host and contains repository errors", async () => {
  let calls = 0;
  const unavailable = createNewsletterSubscribeRoute({
    selectAuthority: () => ({ kind: "invalid_proxy_authority" }),
    resolveRepository: async () => ({ subscribe: async () => { calls += 1; return { outcome: "subscribed" as const }; }, list: async () => [] }),
    now: () => NOW,
  });
  const request = new Request("http://internal:3450/api/newsletter/subscriptions", { method: "POST", headers: { origin: `https://${HOST}`, "content-type": "application/json" }, body: JSON.stringify({ email: "ada@example.test", consent: true }) });
  assert.equal((await unavailable(request)).status, 503);
  assert.equal(calls, 0);

  const broken = createNewsletterSubscribeRoute({ selectAuthority: trusted, resolveRepository: async () => ({ subscribe: async () => { throw new Error("database secret"); }, list: async () => [] }), now: () => NOW });
  const response = await broken(request);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "unavailable" });
});
