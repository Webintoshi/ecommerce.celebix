import assert from "node:assert/strict";
import test from "node:test";
import { accountCredentialDigestCandidates, createAccountSessionCredential, parseStorefrontIdentityKeyring, serializeAccountCookie } from "../account/credential.ts";

const HOST = "shop.example.test", ID = "10000000-0000-4000-8000-000000000001", OP = "20000000-0000-4000-8000-000000000002";
const now = () => new Date("2026-10-24T12:00:00Z");
const review = { reviewerName: "Ada A.", rating: 5, body: "Üründen memnun kaldım." };
const keyring = parseStorefrontIdentityKeyring("current_01", JSON.stringify([{ keyId: "current_01", key: Buffer.alloc(32, 7).toString("base64url") }]));
async function factory(name: "route" | "runtime", key: string): Promise<any> {
  const module = await import(`./product-page-${name}.ts`).catch(() => ({}));
  assert.equal(typeof module[key], "function", `product-page ${name} must be implemented`);
  return module[key];
}
function request(method: "GET" | "POST", value?: unknown, headers: HeadersInit = {}) {
  return new Request(`https://${HOST}/api/products/${ID}/reviews`, { method, headers: { ...(method === "POST" ? { origin: `https://${HOST}`, "content-type": "application/json", "idempotency-key": OP } : {}), ...headers }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
}
function dependencies(runtime: unknown) { return { selectAuthority: () => ({ kind: "trusted", hostname: HOST }), resolveRuntime: async () => runtime }; }

test("product-page runtime derives native credentials from the actual account cookie", async () => {
  const create = await factory("runtime", "createProductPageReviewRuntime"), seen: any[] = [];
  const credential = createAccountSessionCredential(keyring, size => new Uint8Array(size).fill(9));
  const runtime = create({ keyring, now, repository: { async availability(input: unknown) { seen.push(input); return { enabled: true, state: "available" }; }, async submit(input: unknown) { seen.push(input); return { status: "pending" }; } } });
  const cookieHeader = serializeAccountCookie(credential.value).split(";")[0];
  await runtime.availability({ hostname: HOST, productId: ID, cookieHeader });
  await runtime.submit({ hostname: HOST, productId: ID, cookieHeader, operationId: OP, review });
  assert.deepEqual(seen[0].candidates, accountCredentialDigestCandidates(credential.value, keyring));
  assert.equal(seen[1].hostname, HOST); assert.equal(seen[1].operationId, OP);
  assert.equal(JSON.stringify(seen).includes(credential.value), false);
  await assert.rejects(runtime.submit({ hostname: HOST, productId: ID, cookieHeader: null, operationId: OP, review }));
  assert.equal(seen.length, 2);
});
test("availability accepts guests and returns a private no-store response", async () => {
  const create = await factory("route", "createProductPageReviewRoutes"), seen: any[] = [];
  const response = await create(dependencies({ async availability(input: unknown) { seen.push(input); return { enabled: true, state: "guest" }; } })).GET(request("GET"));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { enabled: true, state: "guest" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(seen[0], { hostname: HOST, productId: ID, cookieHeader: null });
});
test("submission uses trusted host, cookie and one explicit operation; never client identity", async () => {
  const create = await factory("route", "createProductPageReviewRoutes"), seen: any[] = [];
  const routes = create(dependencies({ async submit(input: unknown) { seen.push(input); return { status: "pending" }; } }));
  const response = await routes.POST(request("POST", { review }, { cookie: "existing-session" }));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { status: "pending" });
  assert.deepEqual(seen[0], { hostname: HOST, productId: ID, cookieHeader: "existing-session", operationId: OP, review });
});
test("cross origin, client tenant/purchase claims and invalid input never reach persistence", async () => {
  const create = await factory("route", "createProductPageReviewRoutes"); let calls = 0;
  const routes = create(dependencies({ async submit() { calls++; return { status: "pending" }; } }));
  const invalid = [request("POST", { review }, { origin: "https://other.example.test" }), request("POST", { review }, { "sec-fetch-site": "cross-site" }), request("POST", { review }, { "x-store-id": ID }), request("POST", { review, customerId: ID }), request("POST", { review: { ...review, verifiedPurchase: true } }), request("POST", { review: { ...review, rating: 6 } }), request("POST", { review }, { "idempotency-key": "invalid" }), request("POST", { review: { ...review, body: "a".repeat(9000) } })];
  for (const input of invalid) assert.equal((await routes.POST(input)).status, 400);
  assert.equal(calls, 0);
});
test("unknown result and untrusted host fail closed without exposing internal data", async () => {
  const create = await factory("route", "createProductPageReviewRoutes"); let calls = 0;
  const deps = dependencies({ async availability() { calls++; return { enabled: true, state: "available", customerId: ID }; }, async submit() { return { status: "approved" }; } });
  assert.equal((await create(deps).GET(request("GET"))).status, 503);
  assert.equal((await create(deps).POST(request("POST", { review }))).status, 503);
  const denied = create({ ...deps, selectAuthority: () => ({ kind: "invalid_proxy_authority" }) });
  assert.equal((await denied.GET(request("GET"))).status, 503); assert.equal(calls, 1);
});
