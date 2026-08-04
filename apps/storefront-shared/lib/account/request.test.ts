import assert from "node:assert/strict";
import test from "node:test";

import { readAccountJsonRequest, safeAccountReturnTo } from "./request.ts";

const ORIGIN = "https://guzide-kuyumcu-4.saas-staging.celebix.site";

function exactEmail(value: unknown): Readonly<{ email: string }> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== 1 || !Object.hasOwn(value, "email") || typeof (value as { email?: unknown }).email !== "string") {
    throw new TypeError("shape_invalid");
  }
  return Object.freeze({ email: (value as { email: string }).email });
}

function request(body: unknown, headers: HeadersInit = {}, path = "/api/account/auth/start") {
  return new Request(`http://storefront.internal:3450${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers },
    body: JSON.stringify(body),
  });
}

test("account request accepts one exact same-origin bounded JSON body", async () => {
  assert.deepEqual(await readAccountJsonRequest(request({ email: "ada@example.com" }), ORIGIN, exactEmail), { email: "ada@example.com" });
});

test("account request rejects cross-site private ambiguous and oversized requests", async () => {
  const candidates = [
    request({ email: "ada@example.com" }, { origin: "https://evil.example" }),
    request({ email: "ada@example.com" }, { authorization: "Bearer browser" }),
    request({ email: "ada@example.com" }, { "transfer-encoding": "chunked" }),
    request({ email: "ada@example.com" }, { "sec-fetch-site": "cross-site" }),
    request({ email: "ada@example.com" }, { "content-type": "application/json; charset=utf-8" }),
    request({ email: "a".repeat(8_193) }),
    request({ email: "ada@example.com", storeId: "browser-authority" }),
  ];
  for (const candidate of candidates) await assert.rejects(readAccountJsonRequest(candidate, ORIGIN, exactEmail), /storefront_account_request_invalid/u);
});

test("account return paths are normalized and restricted to shopper flows", () => {
  for (const value of ["/account", "/account/orders/CX-100", "/checkout", "/cart", "/products/altin-yuzuk", "/favorites"]) assert.equal(safeAccountReturnTo(value), value);
  for (const value of [undefined, "", "//evil.example", "https://evil.example/account", "/admin", "/api/account", "/products/../admin", "/account#x", "/checkout?total=1", "/account\\evil"]) assert.equal(safeAccountReturnTo(value), "/account");
});
