import assert from "node:assert/strict";
import test from "node:test";

import { applyLogtoAuthorizeOptions } from "./logto-authorize-options.ts";

test("authorization options use Logto's supported query parameter names", () => {
  const url = new URL("https://auth.celebix.co/oidc/auth?client_id=admin-app");

  const result = applyLogtoAuthorizeOptions(url, {
    prompt: "login",
    firstScreen: "identifier:sign-in",
    identifier: ["email", "phone"],
    loginHint: "yonetici@example.com",
    uiLocales: "tr",
  });

  assert.equal(result.searchParams.get("prompt"), "login");
  assert.equal(result.searchParams.get("first_screen"), "identifier:sign-in");
  assert.deepEqual(result.searchParams.getAll("identifier"), ["email phone"]);
  assert.equal(result.searchParams.get("login_hint"), "yonetici@example.com");
  assert.equal(result.searchParams.get("ui_locales"), "tr");
  assert.equal(result.searchParams.get("client_id"), "admin-app");
});

test("reset-password can be selected without adding unrelated options", () => {
  const url = new URL("https://auth.celebix.co/oidc/auth");

  const result = applyLogtoAuthorizeOptions(url, {
    firstScreen: "reset_password",
  });

  assert.equal(result.searchParams.toString(), "first_screen=reset_password");
});

test("absent and blank optional values do not mutate the authorization URL", () => {
  const url = new URL("https://auth.celebix.co/oidc/auth?scope=openid");

  const result = applyLogtoAuthorizeOptions(url, {
    identifier: [],
    loginHint: "  ",
    uiLocales: "",
  });

  assert.equal(result.toString(), "https://auth.celebix.co/oidc/auth?scope=openid");
});
