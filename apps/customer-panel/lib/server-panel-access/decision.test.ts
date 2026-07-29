import assert from "node:assert/strict";
import test from "node:test";

import {
  ServerPanelAccessUnavailableError,
  decideServerPanelAccess,
} from "./decision.ts";

test("server access maps authentication, authorization, and availability without reaching guarded content", () => {
  assert.deepEqual(decideServerPanelAccess({ kind: "unauthenticated" }), { kind: "redirect", destination: "/login" });
  assert.deepEqual(decideServerPanelAccess({ kind: "unauthorized" }), { kind: "redirect", destination: "/unauthorized" });
  assert.throws(
    () => decideServerPanelAccess({ kind: "unavailable" }),
    (error) => error instanceof ServerPanelAccessUnavailableError && error.message === "panel_access_unavailable",
  );
});

test("only authenticated durable authority becomes a guarded-layout result", () => {
  const session = Object.freeze({
    id: "55555555-5555-4555-8555-555555555555",
    principal: Object.freeze({ id: "22222222-2222-4222-8222-222222222222", issuer: "https://issuer.test/oidc", subject: "subject" }),
    activeStoreId: "33333333-3333-4333-8333-333333333333",
    createdAt: "2026-07-16T09:00:00.000Z",
    rotatedAt: "2026-07-16T09:30:00.000Z",
    expiresAt: "2026-07-16T17:00:00.000Z",
  });
  const tenantContext = Object.freeze({ schemaVersion: 1 as const }) as never;
  const result = decideServerPanelAccess({ kind: "authenticated", session, tenantContext });
  assert.deepEqual(result, { kind: "render", session, tenantContext });
});
