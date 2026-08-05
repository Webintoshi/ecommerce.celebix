import assert from "node:assert/strict";
import test from "node:test";

import type { StoreMembership } from "@celebix/saas-contracts";
import type { PanelSession } from "./session";

type StoreSwitchModule = typeof import("./store-switch");
const switches = await import(new URL("./store-switch.ts", import.meta.url).href).catch(
  () => ({} as Partial<StoreSwitchModule>),
);

const session: PanelSession = {
  id: "session_opaque_1234567890abcdefghijklmnop",
  principal: { id: "principal_1", issuer: "https://identity.example.test", subject: "subject_1" },
  activeStoreId: "store_1",
  createdAt: "2026-07-11T10:00:00.000Z",
  rotatedAt: "2026-07-11T10:00:00.000Z",
  expiresAt: "2026-07-11T18:00:00.000Z",
};

function membership(storeId: string, status: StoreMembership["status"] = "active"): StoreMembership {
  return {
    schemaVersion: 1,
    id: `membership_${storeId}`,
    principalId: "principal_1",
    storeId,
    role: "store_owner",
    status,
    createdAt: session.createdAt,
    updatedAt: session.createdAt,
  };
}

test("future store switch treats browser store ID as a hint and returns the shared rotated cookie", async () => {
  assert.equal(typeof switches.createPanelStoreSwitchHandler, "function");
  if (!switches.createPanelStoreSwitchHandler) return;
  const persisted = new Map([[session.id, structuredClone(session)]]);
  const handler = switches.createPanelStoreSwitchHandler({
    resolveSession: async () => session,
    getMemberships: async () => [membership("store_1"), membership("store_2"), membership("store_3", "revoked")],
    sessionStore: {
      async create(value: PanelSession) { persisted.set(value.id, structuredClone(value)); },
      async read(id: string) { return structuredClone(persisted.get(id) ?? null); },
      async rotate(previous: string, value: PanelSession) { persisted.delete(previous); persisted.set(value.id, structuredClone(value)); },
      async destroy(id: string) { persisted.delete(id); },
    },
    cookiePolicy: { kind: "production" },
    now: () => new Date("2026-07-11T10:01:00.000Z"),
  });

  const denied = await handler(new Request("https://panel.celebix.site/api/session/active-store", {
    method: "POST",
    headers: { origin: "https://panel.celebix.site", "content-type": "application/json" },
    body: JSON.stringify({ storeId: "store_3", membershipId: "browser-forged" }),
  }));
  assert.equal(denied.status, 403);

  const response = await handler(new Request("https://panel.celebix.site/api/session/active-store", {
    method: "POST",
    headers: { origin: "https://panel.celebix.site", "content-type": "application/json" },
    body: JSON.stringify({ storeId: "store_2" }),
  }));
  assert.equal(response.status, 204);
  assert.match(response.headers.get("set-cookie") ?? "", /^__Host-celebix_panel=/);
  assert.match(response.headers.get("set-cookie") ?? "", /Secure/);
  assert.equal(persisted.has(session.id), false);
  assert.equal([...persisted.values()][0]?.activeStoreId, "store_2");
});
