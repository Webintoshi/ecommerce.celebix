import assert from "node:assert/strict";
import test from "node:test";
import type { HostedPaymentPresentation } from "../payment-adapters/runtime.ts";
import { fixtureAkbankForm } from "./akbank-form-post.fixture.ts";

const policy = await import("./checkout-context-route.ts").catch(() => null);
const CONTEXT = "11111111-1111-4111-8111-111111111111";
const HOSTNAME = "pilot.saas-staging.celebix.site";
const COOKIE = `__Secure-celebix_hosted_checkout=h1.current_01.${"A".repeat(43)}`;

test("a scoped payment request forwards only its exact selector and browser credentials", async () => {
  assert.equal(typeof policy?.createCheckoutContextPaymentRoute, "function");
  const calls: unknown[] = [];
  const handler = policy!.createCheckoutContextPaymentRoute({
    selectAuthority: () => ({ kind: "trusted", hostname: HOSTNAME }),
    resolveRuntime: async () => ({
      presentation: async (input: unknown) => { calls.push(input); return { kind: "redirect", url: "https://bank.example/payment" }; },
      status: async () => { throw new Error("unused"); },
    }),
    nonce: () => "A".repeat(32),
  });
  const response = await handler(new Request(`http://0.0.0.0:3450/checkout/payment/${CONTEXT}`, { headers: { cookie: COOKIE } }), { params: Promise.resolve({ contextId: CONTEXT }) });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://bank.example/payment");
  assert.deepEqual(calls, [{ hostname: HOSTNAME, cookieHeader: COOKIE, contextId: CONTEXT }]);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});

test("malformed and mismatched context targets never resolve payment authority", async () => {
  assert.equal(typeof policy?.createCheckoutContextPaymentRoute, "function");
  let resolved = 0;
  const handler = policy!.createCheckoutContextPaymentRoute({ selectAuthority: () => ({ kind: "trusted", hostname: HOSTNAME }), resolveRuntime: async () => { resolved++; return null; }, nonce: () => "A".repeat(32) });
  for (const path of [`/checkout/payment/${CONTEXT}?x=1`, `/checkout/payment/${CONTEXT}/`, `/checkout/payment/${CONTEXT}/result`, "/checkout/payment/22222222-2222-4222-8222-222222222222", "/checkout/payment/bad"]) {
    const response = await handler(new Request(`https://${HOSTNAME}${path}`), { params: Promise.resolve({ contextId: CONTEXT }) });
    assert.equal(response.status, 404, path);
  }
  const untrusted = policy!.createCheckoutContextPaymentRoute({ selectAuthority: () => ({ kind: "untrusted" }), resolveRuntime: async () => { resolved++; return null; }, nonce: () => "A".repeat(32) });
  assert.equal((await untrusted(new Request(`https://${HOSTNAME}/checkout/payment/${CONTEXT}`), { params: Promise.resolve({ contextId: CONTEXT }) })).status, 404);
  assert.equal(resolved, 0);
});

test("scoped payment fallback checks only the same context and retains its result path", async () => {
  assert.equal(typeof policy?.createCheckoutContextPaymentRoute, "function");
  const calls: unknown[] = [];
  const handler = policy!.createCheckoutContextPaymentRoute({
    selectAuthority: () => ({ kind: "trusted", hostname: HOSTNAME }),
    resolveRuntime: async () => ({ presentation: async () => { throw new Error("not present"); }, status: async (input: unknown) => { calls.push(input); return { status: "processing" }; } }), nonce: () => "A".repeat(32),
  });
  const response = await handler(new Request(`https://${HOSTNAME}/checkout/payment/${CONTEXT}`, { headers: { cookie: COOKIE } }), { params: Promise.resolve({ contextId: CONTEXT }) });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `/checkout/payment/${CONTEXT}/result`);
  assert.deepEqual(calls, [{ hostname: HOSTNAME, cookieHeader: COOKIE, contextId: CONTEXT }]);
});

test("scoped iframe document preserves the provider frame policy and escapes attributes", async () => {
  assert.equal(typeof policy?.createCheckoutContextPaymentRoute, "function");
  let presentation: HostedPaymentPresentation = { kind: "iframe", url: "https://www.paytr.com/odeme/guvenli/test?x=%22", token: "test" };
  const handler = policy!.createCheckoutContextPaymentRoute({ selectAuthority: () => ({ kind: "trusted", hostname: HOSTNAME }), resolveRuntime: async () => ({ presentation: async () => presentation, status: async () => { throw new Error("unused"); } }), nonce: () => "A".repeat(32) });
  const request = () => new Request(`https://${HOSTNAME}/checkout/payment/${CONTEXT}`);
  const context = { params: Promise.resolve({ contextId: CONTEXT }) };
  const response = await handler(request(), context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("referrer-policy"), "origin");
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-src https:\/\/www[.]paytr[.]com https:;/);
  const document = await response.text();
  assert.match(document, /<iframe id="celebix-hosted-payment" title="Güvenli ödeme"/);
  assert.match(document, /<script nonce="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA">/);
  assert.match(response.headers.get("content-security-policy") ?? "", /script-src 'nonce-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';/);
  presentation = { kind: "iframe", url: "https://attacker.example/pay", token: "test" };
  assert.equal((await handler(request(), context)).status, 503);
});

test("scoped Akbank documents retain the exact bank form action and nonce without a frame bridge", async () => {
  const form = fixtureAkbankForm("live");
  const handler = policy!.createCheckoutContextPaymentRoute({ selectAuthority: () => ({ kind: "trusted", hostname: "shop.example.test" }), resolveRuntime: async () => ({ presentation: async () => form, status: async () => { throw new Error("unused"); } }), nonce: () => "A".repeat(32) });
  const response = await handler(new Request(`https://shop.example.test/checkout/payment/${CONTEXT}`), { params: Promise.resolve({ contextId: CONTEXT }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy") ?? "", /form-action https:\/\/virtualpospaymentgateway[.]akbank[.]com\/payhosting;/);
  assert.match(response.headers.get("content-security-policy") ?? "", /script-src 'nonce-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';/);
  const document = await response.text();
  assert.match(document, /method="post"/);
  assert.doesNotMatch(document, /checkout-result-check|postMessage|<iframe/);
});
