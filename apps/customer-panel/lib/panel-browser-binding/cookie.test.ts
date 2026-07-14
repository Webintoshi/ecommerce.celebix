import assert from "node:assert/strict";
import test from "node:test";

import {
  PANEL_BROWSER_BINDING_DELETION_COOKIE,
  parsePanelBrowserBindingCookie,
  serializePanelBrowserBindingCookie,
} from "./cookie.ts";

const NOW = new Date("2026-07-14T12:00:00.000Z");
const CREDENTIAL = `pb1.${Buffer.alloc(32, 0x31).toString("base64url")}`;

test("serializes the exact host-only secure pre-auth cookie with a 900-second maximum", () => {
  assert.equal(
    serializePanelBrowserBindingCookie({
      credential: CREDENTIAL,
      expiresAt: new Date(NOW.getTime() + 900_999).toISOString(),
      now: NOW,
    }),
    `__Host-celebix_panel_pre_auth=${CREDENTIAL}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900`,
  );
  assert.equal(
    PANEL_BROWSER_BINDING_DELETION_COOKIE,
    "__Host-celebix_panel_pre_auth=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
  );
});

test("parses only one exact pre-auth cookie and rejects every alternate cookie authority", () => {
  assert.equal(parsePanelBrowserBindingCookie(`__Host-celebix_panel_pre_auth=${CREDENTIAL}`), CREDENTIAL);
  for (const value of [
    "",
    `__Host-celebix_panel_pre_auth=${CREDENTIAL}; other=1`,
    `other=1; __Host-celebix_panel_pre_auth=${CREDENTIAL}`,
    `__Host-celebix_panel=${CREDENTIAL}`,
    `__Host-celebix_panel_pre_auth=${CREDENTIAL}; __Host-celebix_panel_pre_auth=${CREDENTIAL}`,
    `__Host-celebix_panel_pre_auth=\"${CREDENTIAL}\"`,
    `__Host-celebix_panel_pre_auth=%70b1.${CREDENTIAL.slice(4)}`,
    `__Host-celebix_panel_pre_auth=${CREDENTIAL} `,
  ]) assert.throws(() => parsePanelBrowserBindingCookie(value), /panel_browser_binding_cookie_invalid/);
});

test("rejects expired, subsecond, excessive, insecure, Domain, alternate-path, and SameSite authority", () => {
  const base = { credential: CREDENTIAL, expiresAt: new Date(NOW.getTime() + 900_000).toISOString(), now: NOW };
  for (const input of [
    { ...base, expiresAt: NOW.toISOString() },
    { ...base, expiresAt: new Date(NOW.getTime() + 999).toISOString() },
    { ...base, expiresAt: new Date(NOW.getTime() + 901_000).toISOString() },
    { ...base, secure: false },
    { ...base, domain: "panel.celebix.site" },
    { ...base, path: "/auth" },
    { ...base, sameSite: "none" },
  ]) assert.throws(() => serializePanelBrowserBindingCookie(input as never), /panel_browser_binding_cookie_invalid/);
});
