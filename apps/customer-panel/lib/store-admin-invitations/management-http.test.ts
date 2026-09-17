import assert from "node:assert/strict";
import test from "node:test";
import { createInvitationManagementHttp } from "./management-http.ts";
const id = "10000000-0000-4000-8000-000000000001", hostname = "store.admin.example.test", credential = `v1.test.${Buffer.alloc(32, 1).toString("base64url")}`;
const intent = { sourceRecordId: id, expectedRecordVersion: 1, operationId: id };
function request(patch: Record<string, string> = {}, value: unknown = intent, action = "send") { return new Request(`https://${hostname}/api/store-admin-invitations${action === "list" ? "" : `/${action}`}`, { method: action === "list" ? "GET" : "POST", headers: { host: hostname, origin: `https://${hostname}`, "content-type": "application/json", "x-invitation-csrf": "1", cookie: `__Host-celebix_panel=${credential}`, ...patch }, ...(action === "list" ? {} : { body: JSON.stringify(value) }) }); }
function fixture(role = "store_owner", accessKind = "authenticated") {
  const calls: unknown[] = [];
  return { calls, handler: createInvitationManagementHttp({ now: () => new Date("2026-09-17T12:00:00.000Z"), requestId: () => id, async resolveRuntime() { return { access: { panelOrigin: "https://panel.example.test", async resolveCredential(input: unknown) { calls.push(["resolve", input]); return { kind: accessKind, tenantContext: { membership: { role } } }; } }, async manage(input: unknown) { calls.push(["manage", input]); return { schemaVersion: 4, kind: "invitation_management_rejected", code: "version_conflict", retryable: false }; } } as never; } }) };
}
test("management forwards only cookie session and actual hostname after local owner authorization", async () => {
  const f = fixture(); assert.equal((await f.handler(request(), "send")).status, 409);
  assert.deepEqual(f.calls[1], ["manage", { schemaVersion: 7, operation: "invitation_management", sessionCredential: credential, requestHostname: hostname, action: "send", intent }]);
});
test("management rejects forged authority, admin, invalid host-session, Origin, CSRF and duplicate cookies", async () => {
  for (const [role, accessKind, patch, value, expected] of [
    ["admin", "authenticated", {}, intent, 403], ["store_owner", "unauthorized", {}, intent, 403],
    ["store_owner", "authenticated", { origin: "https://foreign.example.test" }, intent, 403],
    ["store_owner", "authenticated", { "x-invitation-csrf": "" }, intent, 403],
    ["store_owner", "authenticated", { "x-store-id": id }, intent, 400],
    ["store_owner", "authenticated", {}, { ...intent, email: "other@example.test" }, 400],
    ["store_owner", "authenticated", { host: "panel.example.test" }, intent, 403],
    ["store_owner", "authenticated", { cookie: `__Host-celebix_panel=${credential}; __Host-celebix_panel=${credential}` }, intent, 401],
  ] as const) { const f = fixture(role, accessKind); assert.equal((await f.handler(request(patch, value), "send")).status, expected); assert.equal(f.calls.some((c: any) => c[0] === "manage"), false); }
});
