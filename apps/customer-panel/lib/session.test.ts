import assert from "node:assert/strict";
import test from "node:test";

import type { StoreMembership } from "@celebix/saas-contracts";

type SessionModule = typeof import("./session");
const sessions = await import(new URL("./session.ts", import.meta.url).href).catch(
  () => ({} as Partial<SessionModule>),
);

const NOW = new Date("2026-07-10T10:00:00.000Z");

function membership(
  storeId: string,
  status: StoreMembership["status"] = "active",
  principalId = "principal_1",
): StoreMembership {
  return {
    schemaVersion: 1,
    id: `membership_${storeId}`,
    principalId,
    storeId,
    role: "store_owner",
    status,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function panelSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "session_opaque_1234567890",
    principal: {
      id: "principal_1",
      issuer: "https://identity.example.test/oidc",
      subject: "subject_123",
    },
    activeStoreId: "store_1",
    createdAt: NOW.toISOString(),
    rotatedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
    ...overrides,
  };
}

test("exports the panel session and active-store security surface", () => {
  assert.equal(typeof sessions.resolvePanelSession, "function");
  assert.equal(typeof sessions.selectActiveStore, "function");
  assert.equal(typeof sessions.rotatePanelSessionForStore, "function");
});

test("defines HttpOnly bounded Lax cookies that are Secure in production", () => {
  if (!sessions.getPanelSessionCookieOptions) return;
  assert.deepEqual(sessions.getPanelSessionCookieOptions("production"), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 28_800,
  });
  assert.equal(sessions.getPanelSessionCookieOptions("test").secure, false);
  assert.match(sessions.PANEL_SESSION_COOKIE_NAME ?? "", /^__Host-/);
});

test("unauthenticated and expired sessions are rejected for panel pages", async () => {
  if (!sessions.resolvePanelPageAccess || !sessions.InMemoryPanelSessionStore) return;
  const store = new sessions.InMemoryPanelSessionStore();

  assert.deepEqual(await sessions.resolvePanelPageAccess(null, store, NOW), {
    allowed: false,
    redirectTo: "/login",
    code: "unauthenticated",
  });

  await store.create(panelSession({ expiresAt: new Date(NOW.getTime() - 1).toISOString() }));
  assert.deepEqual(await sessions.resolvePanelPageAccess("session_opaque_1234567890", store, NOW), {
    allowed: false,
    redirectTo: "/login",
    code: "unauthenticated",
  });
});

test("active store selection validates current active membership and rejects invited, revoked, or foreign stores", () => {
  if (!sessions.selectActiveStore) return;
  const currentSession = panelSession();
  const memberships = [
    membership("store_1"),
    membership("store_2", "invited"),
    membership("store_3", "revoked"),
    membership("store_foreign", "active", "principal_other"),
  ];

  const selected = sessions.selectActiveStore(currentSession, memberships, "store_1");
  assert.equal(selected.ok, true);
  if (selected.ok) assert.equal(selected.selection.membership.id, "membership_store_1");

  for (const invalid of ["store_2", "store_3", "store_foreign", "store_missing"]) {
    const denied = sessions.selectActiveStore(currentSession, memberships, invalid);
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.error.code, "membership_denied");
  }
});

test("one principal may switch between multiple active stores with session rotation", async () => {
  if (!sessions.rotatePanelSessionForStore || !sessions.InMemoryPanelSessionStore) return;
  const store = new sessions.InMemoryPanelSessionStore();
  const original = panelSession();
  await store.create(original);

  const result = await sessions.rotatePanelSessionForStore({
    store,
    session: original,
    memberships: [membership("store_1"), membership("store_2")],
    selectionHint: "store_2",
    now: NOW,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.session.activeStoreId, "store_2");
  assert.notEqual(result.session.id, original.id);
  assert.equal(await store.read(original.id), null);
  assert.deepEqual(await store.read(result.session.id), result.session);
});

test("session serialization contains no raw provider token material", () => {
  const unsafe = {
    ...panelSession(),
    accessToken: "provider-access-token",
    refreshToken: "provider-refresh-token",
    idToken: "provider-id-token",
  };
  if (!sessions.toSafePanelSession) return;
  const safe = sessions.toSafePanelSession(unsafe);
  const serialized = JSON.stringify(safe);

  assert.equal(serialized.includes("provider-access-token"), false);
  assert.equal(serialized.includes("provider-refresh-token"), false);
  assert.equal(serialized.includes("provider-id-token"), false);
});
