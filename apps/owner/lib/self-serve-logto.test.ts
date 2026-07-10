import assert from "node:assert/strict";
import test from "node:test";
import type * as SelfServeLogtoModule from "./self-serve-logto";

const { buildSelfServeLogtoStartUrl } = (await import(
  new URL("./self-serve-logto.ts", import.meta.url).href
)) as typeof SelfServeLogtoModule;

test("legacy Logto start helper remains disabled even when old provider env is present", () => {
  const previous = process.env.SELF_SERVE_LOGTO_CLIENT_ID;
  process.env.SELF_SERVE_LOGTO_CLIENT_ID = "must-not-be-read";
  try {
    const request = new Request("https://ecommerce.celebix.co/api/self-serve/auth/start");
    const result = buildSelfServeLogtoStartUrl(request, "/kayit");

    assert.equal(result.configured, false);
    assert.equal(result.url.origin, "https://ecommerce.celebix.co");
    assert.equal(result.url.pathname, "/kayit");
    assert.equal(result.url.searchParams.get("auth"), "disabled");
    assert.equal(result.url.searchParams.has("state"), false);
    assert.equal(result.url.searchParams.has("code_verifier"), false);
    assert.equal(result.url.toString().includes("must-not-be-read"), false);
  } finally {
    if (previous === undefined) delete process.env.SELF_SERVE_LOGTO_CLIENT_ID;
    else process.env.SELF_SERVE_LOGTO_CLIENT_ID = previous;
  }
});

test("legacy external and onboarding return targets cannot leave kayit", () => {
  const request = new Request("https://ecommerce.celebix.co/api/self-serve/auth/start");
  for (const returnTo of ["/onboarding", "https://attacker.example/steal", "//attacker.example/steal"]) {
    const result = buildSelfServeLogtoStartUrl(request, returnTo);
    assert.equal(result.url.pathname, "/kayit");
    assert.equal(result.url.searchParams.get("returnTo"), "/kayit");
    assert.equal(result.url.toString().includes("attacker.example"), false);
  }
});
