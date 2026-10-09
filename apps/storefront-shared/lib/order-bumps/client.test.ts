import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
async function implementation() { assert.ok(existsSync(new URL("./client.ts", import.meta.url)), "the bounded public client must exist"); return import("./client.ts"); }
const empty = { cartVersion: null, heading: null, offers: [] };

test("recommendations use only a fixed same origin endpoint and exact public payload", async () => {
  const { createOrderBumpReader } = await implementation(); const calls: unknown[] = [];
  const read = createOrderBumpReader(async (path, init) => { calls.push({ path, init }); return Response.json(empty); });
  assert.deepEqual(await read("side_cart"), empty);
  const { path, init } = calls[0] as { path: string; init: RequestInit }; assert.equal(path, "/api/order-bumps?placement=side_cart"); assert.equal(init.credentials, "same-origin"); assert.equal(init.cache, "no-store"); assert.equal(init.method, "GET"); assert.equal(init.body, undefined);
});

test("outages malformed payloads oversized responses and an ignored abort cannot delay the cart", async () => {
  const { createOrderBumpReader } = await implementation();
  for (const fetcher of [async () => Response.json(empty, { status: 503 }), async () => Response.json({ ...empty, price: 1 }), async () => new Response("x".repeat(33000), { headers: { "content-type": "application/json" } }), async () => new Promise<Response>(() => {})]) await assert.rejects(createOrderBumpReader(fetcher, 10)("checkout"));
});
