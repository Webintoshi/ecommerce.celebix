import assert from "node:assert/strict";
import test from "node:test";
import { createInvitationManagementClient } from "./management-client.ts";
const id = "10000000-0000-4000-8000-000000000001";
test("client retries exactly the caller operation and version after ambiguous transport, never saves another source", async () => {
  const calls: { path: string; body: unknown }[] = [];
  const client = createInvitationManagementClient(async (path, init) => { calls.push({ path: String(path), body: JSON.parse(String(init?.body)) }); if (calls.length === 1) throw Error("timeout"); return Response.json({ schemaVersion: 4, kind: "invitation_management_rejected", code: "version_conflict", retryable: false }, { status: 409 }); });
  const intent = { sourceRecordId: id, expectedRecordVersion: 3, operationId: id };
  await assert.rejects(() => client.mutate("send", intent), /sonucu belirsiz/);
  const result = await client.mutate("send", intent); assert.equal(result.kind, "invitation_management_rejected");
  assert.deepEqual(calls, [{ path: "/api/store-admin-invitations/send", body: intent }, { path: "/api/store-admin-invitations/send", body: intent }]);
});
test("client rejects malformed safe projection instead of claiming success", async () => {
  const client = createInvitationManagementClient(async () => Response.json({ schemaVersion: 4, kind: "invitation_listed", items: [], hasMore: false, secret: "leak" }));
  await assert.rejects(() => client.list());
});
