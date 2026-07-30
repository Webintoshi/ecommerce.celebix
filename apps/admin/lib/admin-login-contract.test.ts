import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminSignInPath,
  getAdminLoginErrorPresentation,
  parseAdminLoginErrorCode,
  type AdminLoginErrorCode,
} from "./admin-login-contract.ts";

const SUPPORTED_CODES: AdminLoginErrorCode[] = [
  "provider_disabled",
  "invalid_callback",
  "token_exchange_failed",
  "identity_lookup_failed",
  "membership_unavailable",
  "not_assigned",
  "session_write_failed",
];

test("supported callback codes produce safe Turkish recovery presentations", () => {
  for (const code of SUPPORTED_CODES) {
    assert.equal(parseAdminLoginErrorCode(code), code);

    const presentation = getAdminLoginErrorPresentation(code);
    assert.ok(presentation.title.trim().length > 0);
    assert.ok(presentation.message.trim().length > 0);
    assert.match(presentation.title, /[A-Za-zÇĞİÖŞÜçğıöşü]/);
    assert.ok(["retry", "switch_account"].includes(presentation.action));
  }
});

test("unknown callback values never become UI error codes", () => {
  assert.equal(parseAdminLoginErrorCode("database password leaked"), null);
  assert.equal(parseAdminLoginErrorCode("login_failed"), null);
  assert.equal(parseAdminLoginErrorCode(null), null);
});

test("an unassigned identity is offered a safe account switch", () => {
  const presentation = getAdminLoginErrorPresentation("not_assigned");

  assert.equal(presentation.action, "switch_account");
  assert.match(presentation.title, /yetki|erişim/i);
});

test("a temporary membership outage is offered a retry", () => {
  const presentation = getAdminLoginErrorPresentation("membership_unavailable");

  assert.equal(presentation.action, "retry");
  assert.match(presentation.message, /tekrar/i);
});

test("sign-in paths keep safe internal destinations and reject external redirects", () => {
  assert.equal(
    buildAdminSignInPath("/admin/siparisler?durum=yeni"),
    "/api/auth/sign-in?next=%2Fadmin%2Fsiparisler%3Fdurum%3Dyeni",
  );
  assert.equal(
    buildAdminSignInPath("https://attacker.example/steal"),
    "/api/auth/sign-in?next=%2Fadmin",
  );
  assert.equal(
    buildAdminSignInPath("//attacker.example/steal"),
    "/api/auth/sign-in?next=%2Fadmin",
  );
});

test("forced account selection preserves the sanitized destination", () => {
  const path = buildAdminSignInPath("/admin/urunler", {
    forceAccountSelection: true,
  });
  const parsed = new URL(path, "https://admin.example.com");

  assert.equal(parsed.pathname, "/api/auth/sign-in");
  assert.equal(parsed.searchParams.get("next"), "/admin/urunler");
  assert.equal(parsed.searchParams.get("force_account"), "1");
});
