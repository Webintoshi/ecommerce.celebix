import assert from "node:assert/strict";
import test from "node:test";
import { createReviewCollectionPublicRoute, type ReviewRouteDependencies } from "./route.ts";
import type { ReviewCollectionRepository } from "@celebix/saas-data";
const TOKEN = Buffer.alloc(32, 9).toString("base64url"), OP = "10000000-0000-4000-8000-000000000001";
const review = { reviewerName: "Ada A.", rating: 5, body: "Ürün oldukça güzel." };
function request(action: string, body: unknown, headers: HeadersInit = {}): Request { return new Request(`https://mira.example.test/api/reviews/${action}`, { method: "POST", headers: { origin: "https://mira.example.test", "content-type": "application/json", "idempotency-key": OP, ...headers }, body: JSON.stringify(body) }); }
function deps(repository: Partial<ReviewCollectionRepository>): ReviewRouteDependencies { return { selectAuthority: () => ({ kind: "trusted", hostname: "mira.example.test" }), resolveRepository: async () => repository as ReviewCollectionRepository, now: () => new Date("2026-10-03T12:00:00Z") }; }
test("submission binds its tenant to trusted host and returns only pending moderation", async () => {
  const received: unknown[] = [];
  const handle = createReviewCollectionPublicRoute(deps({ async submit(value) { received.push(value); return { status: "pending" }; } }), "submit");
  const response = await handle(request("submit", { token: TOKEN, review }));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { status: "pending" });
  assert.equal((received[0] as any).hostname, "mira.example.test"); assert.equal((received[0] as any).operationId, OP);
  assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});
test("client purchase claims, cross origin, tenant headers and unexpected root data never reach persistence", async () => {
  let called = 0; const handle = createReviewCollectionPublicRoute(deps({ async submit() { called++; return { status: "pending" }; } }), "submit");
  for (const [payload, headers] of [[{ token: TOKEN, review: { ...review, verifiedPurchase: true } }, {}], [{ token: TOKEN, review, storeId: OP }, {}], [{ token: TOKEN, review }, { origin: "https://other.example.test" }], [{ token: TOKEN, review }, { "x-store-id": OP }], [{ token: TOKEN, review }, { "sec-fetch-site": "cross-site" }]] as const) assert.equal((await handle(request("submit", payload, headers))).status, 400);
  assert.equal(called, 0);
});
test("unsubscribe requires an explicit post and a store-bound capability", async () => {
  const seen: unknown[] = []; const handle = createReviewCollectionPublicRoute(deps({ async unsubscribe(value) { seen.push(value); } }), "unsubscribe");
  const response = await handle(request("unsubscribe", { token: TOKEN })); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { status: "unsubscribed" }); assert.equal((seen[0] as any).hostname, "mira.example.test");
  assert.equal((await handle(new Request("https://mira.example.test/api/reviews/unsubscribe"))).status, 400);
});
test("untrusted host and malformed invitation cannot disclose a product or customer", async () => {
  let read = 0; const base = deps({ async invitation() { read++; return { kind: "available", storeName: "Mira", productTitle: "Gömlek" }; } });
  const denied = createReviewCollectionPublicRoute({ ...base, selectAuthority: () => ({ kind: "invalid_proxy_authority" }) }, "invitation");
  assert.equal((await denied(request("invitation", { token: TOKEN }))).status, 503);
  assert.equal((await createReviewCollectionPublicRoute(base, "invitation")(request("invitation", { token: "bad-token" }))).status, 400); assert.equal(read, 0);
});
