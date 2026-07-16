import assert from "node:assert/strict";
import test from "node:test";

import {
  createCustomerPanelCallbackRequestAuthorityValidator,
  validatePublicCustomerPanelCallbackAuthority,
} from "./callback-request-authority.ts";

const CALLBACK = "https://panel.celebix.site/auth/callback";
const RAW_QUERY = "code=provider%2Dcode&state=state_0123456789abcdefghijklmnop&iss=https%3A%2F%2Fidentity.example.test%2Foidc";

test("seals one immutable proxy-safe callback authority validator", () => {
  const validator = createCustomerPanelCallbackRequestAuthorityValidator({
    publicCallbackAuthority: CALLBACK,
    maximumQueryBytes: 2_048,
  });
  assert.equal(Object.isFrozen(validator), true);

  for (const internalUrl of [
    `${CALLBACK}?${RAW_QUERY}`,
    `http://customer-panel:3400/auth/callback?${RAW_QUERY}`,
    `https://customer-panel.internal:3443/auth/callback?${RAW_QUERY}`,
  ]) {
    const decision = validator.validate(new Request(internalUrl, {
      headers: {
        forwarded: "host=attacker.example;proto=https",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "https",
      },
    }));
    assert.deepEqual(decision, { kind: "approved", callbackUrl: `${CALLBACK}?${RAW_QUERY}` });
    assert.equal(Object.isFrozen(decision), true);
  }
});

test("rejects non-canonical public authorities", () => {
  assert.equal(validatePublicCustomerPanelCallbackAuthority(CALLBACK), CALLBACK);
  for (const authority of [
    "http://panel.celebix.site/auth/callback",
    "https://panel.celebix.site:443/auth/callback",
    "https://user:pass@panel.celebix.site/auth/callback",
    "https://panel.celebix.site/auth/callback/",
    "https://panel.celebix.site/auth/callback?query=1",
    "https://panel.celebix.site/auth/callback#fragment",
    ` ${CALLBACK}`,
  ]) {
    assert.throws(
      () => createCustomerPanelCallbackRequestAuthorityValidator({
        publicCallbackAuthority: authority,
        maximumQueryBytes: 2_048,
      }),
      /customer_panel_callback_request_authority_invalid/,
    );
  }
});

test("rejects wrong delivery shape without trusting forwarded headers", () => {
  const validator = createCustomerPanelCallbackRequestAuthorityValidator({
    publicCallbackAuthority: CALLBACK,
    maximumQueryBytes: 128,
  });
  const forwarded = {
    forwarded: "host=panel.celebix.site;proto=https",
    "x-forwarded-host": "panel.celebix.site",
    "x-forwarded-proto": "https",
  };
  const cases: Array<[unknown, string]> = [
    [new Request(`http://internal/auth/callback?${RAW_QUERY}`, { method: "POST", headers: forwarded }), "method_not_allowed"],
    [new Request(`http://internal/wrong?${RAW_QUERY}`, { headers: forwarded }), "request_invalid"],
    [new Request(`http://internal/auth/callback/child?${RAW_QUERY}`, { headers: forwarded }), "request_invalid"],
    [new Request("http://internal/auth/callback", { headers: forwarded }), "request_invalid"],
    [new Request(`http://internal/auth/callback?${RAW_QUERY}#fragment`, { headers: forwarded }), "request_invalid"],
    [{ method: "GET", url: `http://user:pass@internal/auth/callback?${RAW_QUERY}` }, "request_invalid"],
    [new Request(`http://internal/auth/callback?state=${"x".repeat(256)}`, { headers: forwarded }), "query_too_large"],
  ];
  for (const [request, kind] of cases) assert.equal(validator.validate(request).kind, kind);
});
