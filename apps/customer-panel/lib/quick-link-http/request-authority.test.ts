import assert from "node:assert/strict";
import test from "node:test";

import { createQuickLinkRequestAuthorityValidator } from "./request-authority.ts";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const LINK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("approves only the exact eight quick-link route expectations", () => {
  const validator = createQuickLinkRequestAuthorityValidator({ panelOrigin: ORIGIN });
  const expectations = [
    ["GET", "/api/orders/quick-links", "allowed"],
    ["POST", "/api/orders/quick-links", "forbidden"],
    ["GET", `/api/orders/quick-links/${LINK_ID}`, "forbidden"],
    ["POST", `/api/orders/quick-links/${LINK_ID}/cancel`, "forbidden"],
    ["POST", `/api/orders/quick-links/${LINK_ID}/duplicate`, "forbidden"],
    ["POST", `/api/orders/quick-links/${LINK_ID}/url`, "forbidden"],
    ["POST", "/api/orders/quick-links/provider/activate", "forbidden"],
    ["POST", "/api/orders/quick-links/provider/revoke", "forbidden"],
  ] as const;
  for (const [method, pathname, query] of expectations) {
    const request = new Request(`http://customer-panel:3400${pathname}`, {
      method,
      headers: method === "POST" ? { origin: ORIGIN } : undefined,
    });
    assert.equal(validator.validate(request, { method, pathname, query }), "approved");
  }
});

test("POST requires one exact configured Origin", () => {
  const validator = createQuickLinkRequestAuthorityValidator({ panelOrigin: ORIGIN });
  const expectation = { method: "POST" as const, pathname: "/api/orders/quick-links", query: "forbidden" as const };
  for (const origin of [undefined, "https://evil.example", `${ORIGIN}/`, `${ORIGIN}, https://evil.example`]) {
    const headers = origin === undefined ? undefined : { origin };
    assert.equal(
      validator.validate(new Request("http://internal/api/orders/quick-links", { method: "POST", headers }), expectation),
      "origin_denied",
    );
  }
});

test("forged forwarded headers never rescue a wrong Origin or path", () => {
  const validator = createQuickLinkRequestAuthorityValidator({ panelOrigin: ORIGIN });
  const headers = {
    origin: "https://evil.example",
    "x-forwarded-host": new URL(ORIGIN).host,
    "x-forwarded-proto": "https",
    forwarded: `host=${new URL(ORIGIN).host};proto=https`,
  };
  assert.equal(validator.validate(
    new Request("http://internal/api/orders/quick-links/evil", { method: "POST", headers }),
    { method: "POST", pathname: "/api/orders/quick-links", query: "forbidden" },
  ), "origin_denied");
});

test("validates the internal URL pathname without trusting request or forwarded hosts", () => {
  const validator = createQuickLinkRequestAuthorityValidator({ panelOrigin: ORIGIN });
  const expectation = { method: "GET" as const, pathname: "/api/orders/quick-links", query: "allowed" as const };
  assert.equal(validator.validate(new Request("http://customer-panel:3400/api/orders/quick-links?pageSize=20"), expectation), "approved");
  for (const url of [
    "https://evil.example/api/orders/quick-links-evil",
    "https://evil.example/api/orders//quick-links",
    "https://evil.example/api/orders/quick-links/%2e%2e",
    "https://evil.example/api/orders/quick-links#fragment",
  ]) assert.equal(validator.validate(new Request(url), expectation), "request_invalid");
});

test("rejects wrong methods forbidden query GET bodies and transfer encoding", () => {
  const validator = createQuickLinkRequestAuthorityValidator({ panelOrigin: ORIGIN });
  const expectation = { method: "GET" as const, pathname: `/api/orders/quick-links/${LINK_ID}`, query: "forbidden" as const };
  assert.equal(validator.validate(new Request(`http://internal/api/orders/quick-links/${LINK_ID}`, { method: "POST", headers: { origin: ORIGIN } }), expectation), "method_not_allowed");
  assert.equal(validator.validate(new Request(`http://internal/api/orders/quick-links/${LINK_ID}?x=1`), expectation), "request_invalid");
  assert.equal(validator.validate(new Request(`http://internal/api/orders/quick-links/${LINK_ID}`, { headers: { "content-length": "1" } }), expectation), "request_invalid");
  assert.equal(validator.validate(new Request(`http://internal/api/orders/quick-links/${LINK_ID}`, { headers: { "transfer-encoding": "chunked" } }), expectation), "request_invalid");
});
