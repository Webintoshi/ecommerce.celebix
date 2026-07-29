import assert from "node:assert/strict";
import test from "node:test";

import { createAbandonedCartRequestAuthorityValidator } from "./request-authority.ts";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("approves only exact proxy-safe abandoned-cart paths and configured mutation Origin", () => {
  const validator = createAbandonedCartRequestAuthorityValidator({ panelOrigin: ORIGIN });
  assert.equal(validator.validate(new Request("http://internal:3400/api/orders/abandoned-carts?status=abandoned"), { method: "GET", pathname: "/api/orders/abandoned-carts", query: "allowed" }), "approved");
  assert.equal(validator.validate(new Request(`https://internal/api/orders/abandoned-carts/${ID}/archive`, { method: "POST", headers: { origin: ORIGIN } }), { method: "POST", pathname: `/api/orders/abandoned-carts/${ID}/archive`, query: "forbidden" }), "approved");
  for (const request of [
    new Request(`http://internal/api/orders/abandoned-carts/${ID}/archive`, { method: "POST" }),
    new Request(`http://internal/api/orders/abandoned-carts/${ID}/archive?storeId=evil`, { method: "POST", headers: { origin: ORIGIN } }),
    new Request(`http://internal/api/orders/abandoned-carts/${ID}/archive/`, { method: "POST", headers: { origin: ORIGIN } }),
  ]) assert.notEqual(validator.validate(request, { method: "POST", pathname: `/api/orders/abandoned-carts/${ID}/archive`, query: "forbidden" }), "approved");
});

test("rejects invalid public origins and method/path expectation ambiguity", () => {
  for (const panelOrigin of ["http://panel.example", "https://panel.example/child", "https://panel.example:3400", " https://panel.example"]) {
    assert.throws(() => createAbandonedCartRequestAuthorityValidator({ panelOrigin }), /abandoned_cart_request_authority_invalid/);
  }
});
