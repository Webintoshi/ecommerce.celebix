import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
async function implementation() { assert.ok(existsSync(new URL("./route.ts", import.meta.url)), "the public route must exist"); return import("./route.ts"); }
const empty = { cartVersion: null, heading: null, offers: [] };

test("placement is the sole query authority and duplicate unknown or tenant input is rejected before reads", async () => {
  const { createOrderBumpGet } = await implementation(); let reads = 0;
  const get = createOrderBumpGet({ selectAuthority: () => ({ kind: "trusted", hostname: "trusted.example" }), resolveRuntime: async () => ({ async offers() { reads++; return empty; } }) });
  for (const query of ["", "?placement=cart", "?placement=side_cart&placement=checkout", "?placement=side_cart&storeId=foreign", "?placement=side_cart&cart=foreign", "?placement=side_cart&subtotalCents=1"]) assert.equal((await get(new Request(`https://internal.invalid/api/order-bumps${query}`))).status, 400);
  for (const name of ["authorization", "x-store-id", "x-tenant-id", "x-celebix-customer-id"]) assert.equal((await get(new Request("https://internal.invalid/api/order-bumps?placement=side_cart", { headers: { [name]: "foreign" } }))).status, 400);
  assert.equal(reads, 0);
});

test("valid GET reads the trusted host and HttpOnly cookie with an uncached exact public projection", async () => {
  const { createOrderBumpGet } = await implementation(); const calls: unknown[] = [];
  const get = createOrderBumpGet({ selectAuthority: () => ({ kind: "trusted", hostname: "trusted.example" }), resolveRuntime: async () => ({ async offers(...args) { calls.push(args); return empty; } }) });
  const response = await get(new Request("https://internal.invalid/api/order-bumps?placement=checkout", { headers: { cookie: "cart=opaque" } }));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), empty); assert.deepEqual(calls, [["trusted.example", "cart=opaque", "checkout"]]); assert.equal(response.headers.get("cache-control"), "no-store");
});

test("untrusted authority repository outages and invalid public data expose no private information", async () => {
  const { createOrderBumpGet } = await implementation();
  for (const options of [{ selectAuthority: () => ({ kind: "unavailable" }), resolveRuntime: async () => null }, { selectAuthority: () => ({ kind: "trusted", hostname: "trusted.example" }), resolveRuntime: async () => ({ async offers() { throw new Error("secret password"); } }) }, { selectAuthority: () => ({ kind: "trusted", hostname: "trusted.example" }), resolveRuntime: async () => ({ async offers() { return { ...empty, secret: "private" }; } }) }]) {
    const response = await createOrderBumpGet(options as never)(new Request("https://internal.invalid/api/order-bumps?placement=side_cart")); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { code: "unavailable" });
  }
});
