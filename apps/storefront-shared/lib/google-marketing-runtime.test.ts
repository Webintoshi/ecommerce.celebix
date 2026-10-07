import assert from "node:assert/strict";
import test from "node:test";
import { createStandardHostedCheckoutCredential, serializeStandardHostedCheckoutCookie } from "./checkout/standard-hosted-cookie.ts";
const module = await import("./google-marketing-runtime.ts").catch(() => null);
const storeId = "11111111-1111-4111-8111-111111111111", orderId = "22222222-2222-4222-8222-222222222222";
const keyring = { activeKeyId: "current_01", keys: [{ keyId: "current_01", key: new Uint8Array(32).fill(7) }] };
const credential = createStandardHostedCheckoutCredential(keyring, orderId);
const now = new Date("2026-10-08T12:00:00Z");
function fixture(result: Record<string, unknown>) {
  assert.equal(typeof module?.createPublicGoogleMarketingRuntime, "function", "public Google runtime must exist");
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const runtime = module!.createPublicGoogleMarketingRuntime({ keyring, now: () => now, async query(text, values) { calls.push({ text, values }); return { rows: [result], rowCount: 1 }; } });
  return { calls, runtime };
}
test("public projection is store-bound and never exposes private fields", async () => {
  const projection = { gtmContainerId: "GTM-ABC123", ads: null, verificationToken: "safeToken" };
  const f = fixture({ result_payload: projection }); assert.deepEqual(await f.runtime.projection(storeId), projection);
  assert.deepEqual(f.calls[0], { text: "SELECT saas.public_google_marketing_projection($1::uuid) AS result_payload", values: [storeId] });
  const secret = fixture({ result_payload: { ...projection, accessToken: "private" } }); assert.equal(await secret.runtime.projection(storeId), null);
});
test("missing, malformed and duplicated hosted cookies do not reach purchase authority", async () => {
  const f = fixture({ outcome: "found", result_payload: { transactionId: orderId, valueCents: 1250, currency: "TRY" } });
  for (const cookieHeader of [null, "__Host-celebix_hosted_checkout=invalid", `__Host-celebix_hosted_checkout=${credential.value}; __Host-celebix_hosted_checkout=${credential.value}`]) assert.equal(await f.runtime.purchase({ hostname: "shop.example.com", cookieHeader }), null);
  assert.equal(f.calls.length, 0);
});
test("purchase passes owned host and hashed credential to confirmed WEB authority", async () => {
  const purchase = { transactionId: orderId, valueCents: 1250, currency: "TRY" }, f = fixture({ outcome: "found", result_payload: purchase });
  assert.deepEqual(await f.runtime.purchase({ hostname: "shop.example.com", cookieHeader: serializeStandardHostedCheckoutCookie(credential.value) }), purchase);
  assert.deepEqual(f.calls[0]?.values, ["shop.example.com", now, JSON.stringify([{ keyId: "current_01", digest: credential.digest }])]);
  assert.doesNotMatch(JSON.stringify(f.calls), new RegExp(credential.value.replaceAll(".", "\\.")));
});
test("pending or malformed authority cannot invent a Google purchase", async () => {
  for (const result of [{ outcome: "not_found", result_payload: null }, { outcome: "found", result_payload: { status: "captured" } }, { outcome: "found", result_payload: { transactionId: orderId, valueCents: 1250, currency: "TRY", email: "private@example.com" } }]) {
    const f = fixture(result); assert.equal(await f.runtime.purchase({ hostname: "shop.example.com", cookieHeader: serializeStandardHostedCheckoutCookie(credential.value) }), null);
  }
});
test("purchase HTTP rejects caller tenant selection and cross-origin reads without private errors", async () => {
  assert.equal(typeof module?.createGoogleMarketingPurchaseRoute, "function");
  let reads = 0;
  const route = module!.createGoogleMarketingPurchaseRoute({ selectAuthority: () => ({ kind: "trusted", hostname: "shop.example.com" } as never), resolveRuntime: async () => ({ purchase: async () => { reads++; return null; } }) });
  for (const request of [new Request("https://internal/api/marketing/google/purchase?storeId=" + storeId), new Request("https://internal/api/marketing/google/purchase", { headers: { origin: "https://other.example.com" } }), new Request("https://internal/api/marketing/google/purchase", { headers: { "sec-fetch-site": "cross-site" } })]) { const result = await route(request); assert.ok(result.status >= 400); }
  assert.equal(reads, 0);
  const result = await route(new Request("https://internal/api/marketing/google/purchase")); assert.equal(result.status, 200); assert.deepEqual(await result.json(), { purchase: null }); assert.match(result.headers.get("cache-control") ?? "", /no-store/);
});
