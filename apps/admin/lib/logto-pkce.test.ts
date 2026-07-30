import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createLogtoPkce,
  createLogtoTokenExchangeBody,
  sanitizeLogtoTokenError,
} from "./logto-pkce.ts";

test("Logto PKCE values are URL-safe and the challenge matches the verifier", () => {
  const pkce = createLogtoPkce();
  const expectedChallenge = createHash("sha256")
    .update(pkce.codeVerifier, "utf8")
    .digest("base64url");

  assert.match(pkce.codeVerifier, /^[A-Za-z0-9_-]{64}$/);
  assert.equal(pkce.codeChallenge, expectedChallenge);
});

test("Logto token exchange body carries the confidential client and PKCE binding", () => {
  const body = createLogtoTokenExchangeBody({
    clientId: "admin-app",
    code: "authorization-code",
    codeVerifier: "verifier",
    redirectUri: "https://admin.example.com/callback",
  });

  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("client_id"), "admin-app");
  assert.equal(body.get("code"), "authorization-code");
  assert.equal(body.get("code_verifier"), "verifier");
  assert.equal(body.get("redirect_uri"), "https://admin.example.com/callback");
});

test("Logto token errors keep only safe OAuth identifiers", () => {
  assert.deepEqual(
    sanitizeLogtoTokenError({
      error: "invalid_grant",
      code: "oidc.invalid_grant",
      error_description: "authorization code abc-secret was rejected",
      access_token: "secret-token",
    }),
    {
      error: "invalid_grant",
      code: "oidc.invalid_grant",
    },
  );

  assert.deepEqual(
    sanitizeLogtoTokenError({
      error: "invalid grant with spaces",
      code: "<unsafe>",
    }),
    {},
  );
  assert.deepEqual(sanitizeLogtoTokenError("not-json"), {});
});
