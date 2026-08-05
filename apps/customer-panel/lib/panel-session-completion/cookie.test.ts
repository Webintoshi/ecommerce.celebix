import assert from "node:assert/strict";
import test from "node:test";

import { serializePersistentPanelSessionCookie } from "./cookie.ts";

const NOW = new Date("2026-07-14T12:00:00.000Z");
const CREDENTIAL = `v1.panel.active.${Buffer.alloc(32, 0x55).toString("base64url")}`;

test("serializes only the exact secure __Host persistent-session cookie with expiry-bounded Max-Age", () => {
  const cookie = serializePersistentPanelSessionCookie({
    credential: CREDENTIAL,
    issuedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 7_200_999).toISOString(),
    now: new Date(NOW),
  });
  assert.equal(cookie, `__Host-celebix_panel=${CREDENTIAL}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7200`);
  assert.doesNotMatch(cookie, /Domain|SameSite=None|%|"/);
});

test("rejects malformed, expired, subsecond, excessive, insecure, alternate, and caller-option cookie authority", () => {
  const base = {
    credential: CREDENTIAL,
    issuedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 28_800_000).toISOString(),
    now: new Date(NOW),
  };
  for (const input of [
    { ...base, credential: "v1.bad" },
    { ...base, credential: `v1.panel.active.${"a".repeat(43)}=` },
    { ...base, expiresAt: NOW.toISOString() },
    { ...base, expiresAt: new Date(NOW.getTime() + 999).toISOString() },
    { ...base, expiresAt: new Date(NOW.getTime() + 28_800_001).toISOString() },
    { ...base, cookieName: "celebix_panel_local" },
    { ...base, secure: false },
    { ...base, domain: "panel.celebix.site" },
    { ...base, path: "/other" },
    { ...base, sameSite: "none" },
  ]) assert.throws(() => serializePersistentPanelSessionCookie(input as never), /persistent_panel_session_cookie_invalid/);
});
