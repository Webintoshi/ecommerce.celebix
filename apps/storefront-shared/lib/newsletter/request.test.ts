import assert from "node:assert/strict";
import test from "node:test";

import { parseNewsletterSubscribeRequest } from "./request.ts";

const ORIGIN = "https://shop.example.test";
function request(body: unknown, overrides: Readonly<{ url?: string; method?: string; headers?: HeadersInit }> = {}) {
  return new Request(overrides.url ?? "http://storefront.internal:3450/api/newsletter/subscriptions", {
    method: overrides.method ?? "POST",
    headers: overrides.headers ?? { origin: ORIGIN, "content-type": "application/json" },
    body: overrides.method === "GET" ? undefined : JSON.stringify(body),
  });
}

test("newsletter request accepts only exact consented JSON under public Origin", async () => {
  assert.deepEqual(await parseNewsletterSubscribeRequest(request({ email: "Ada@Example.TEST", consent: true }), ORIGIN), {
    email: "ada@example.test",
    consent: true,
  });
});

test("newsletter request rejects body authority, wrong origin, private headers, and non-exact routes", async () => {
  const denied = [
    request({ email: "ada@example.test", consent: true, storeId: "10000000-0000-4000-8000-000000000001" }),
    request({ email: "ada@example.test", consent: true }, { headers: { origin: "https://evil.example", "content-type": "application/json" } }),
    request({ email: "ada@example.test", consent: true }, { headers: { origin: ORIGIN, "content-type": "application/json", authorization: "Bearer private" } }),
    request({ email: "ada@example.test", consent: true }, { headers: { origin: ORIGIN, "content-type": "application/json", cookie: "session=private" } }),
    request({ email: "ada@example.test", consent: true }, { headers: { origin: ORIGIN, "content-type": "application/json", "x-celebix-store-id": "forged" } }),
    request({ email: "ada@example.test", consent: true }, { url: "http://storefront.internal:3450/api/newsletter/subscriptions?store=forged" }),
    request({ email: "ada@example.test", consent: true }, { url: "http://storefront.internal:3450/api/newsletter/subscriptions/child" }),
    request({ email: "ada@example.test", consent: true }, { method: "GET" }),
  ];
  for (const candidate of denied) await assert.rejects(() => parseNewsletterSubscribeRequest(candidate, ORIGIN), /storefront_newsletter_request_invalid/u);
});

test("newsletter request rejects malformed media types and oversized bodies", async () => {
  await assert.rejects(
    () => parseNewsletterSubscribeRequest(request({ email: "ada@example.test", consent: true }, { headers: { origin: ORIGIN, "content-type": "text/plain" } }), ORIGIN),
    /storefront_newsletter_request_invalid/u,
  );
  await assert.rejects(
    () => parseNewsletterSubscribeRequest(request({ email: `${"a".repeat(2050)}@example.test`, consent: true }), ORIGIN),
    /storefront_newsletter_request_invalid/u,
  );
});
