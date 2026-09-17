import assert from "node:assert/strict";
import test from "node:test";
import { createOwnerPanelBrowserBindingInternalGateway, createPanelBrowserBindingInternalGatewayApproval } from "./internal-gateway.ts";
import { createAuthenticatedPanelBrowserBindingTransport } from "../../../customer-panel/lib/panel-browser-binding-bootstrap/transport.ts";
import { createPanelBrowserBindingBootstrapApproval } from "../../../customer-panel/lib/panel-browser-binding-bootstrap/activation.ts";
const now = new Date("2026-09-17T12:00:00.000Z"), id = "10000000-0000-4000-8000-000000000001";
const request = { schemaVersion: 7, operation: "invitation_management", sessionCredential: `v1.test.${Buffer.alloc(32, 1).toString("base64url")}`, requestHostname: "store.admin.example.test", action: "list" } as const;
const item = { id, sourceRecordId: id, email: `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.example.test`, displayName: "İ".repeat(160), role: "admin", status: "pending", deliveryStatus: "provider_accepted", expiresAt: "2026-09-24T12:00:00.000Z", createdAt: now.toISOString(), updatedAt: now.toISOString(), version: 1, generation: 1 } as const;
function fixture(oversize = false, tamper = false) {
  const calls: unknown[] = [];
  const gateway = createOwnerPanelBrowserBindingInternalGateway({ activationApproval: createPanelBrowserBindingInternalGatewayApproval("disposable_test"), ownerInternalOrigin: "https://owner.example.test", keys: new Map([["test", Buffer.alloc(32, 4)]]), clock: () => now, maximumBodyBytes: 16384, repository: { async bindBrowserCredential() { throw Error("forbidden"); } }, invitationManagement: { async manage(input: unknown) { calls.push(input); return { schemaVersion: 4, kind: "invitation_listed", items: Array.from({ length: 200 }, () => item), hasMore: true }; } }, audit() {} } as never);
  const transport = createAuthenticatedPanelBrowserBindingTransport({ activationApproval: createPanelBrowserBindingBootstrapApproval("disposable_test"), ownerInternalOrigin: "https://owner.example.test", activeKeyId: "test", activeSecret: Buffer.alloc(32, 4), clock: () => now, deadlineMs: 500, maximumResponseBytes: 16384, audit() {}, async fetch(req) { const forwarded = tamper ? new Request(req.url, { method: req.method, headers: req.headers, body: (await req.text()).replace("store.admin.example.test", "other.admin.example.test") }) : req; let response = await gateway(forwarded); if (oversize) response = new Response(" ".repeat(262145), { headers: response.headers, status: response.status }); Object.defineProperty(response, "url", { value: req.url }); return response; } });
  return { transport, calls };
}
test("management roundtrip preserves the complete 200-view list and hasMore beyond auth response bounds", async () => {
  const f = fixture();
  const result = await f.transport.manageInvitation(request);
  assert.equal(result.kind, "invitation_listed");
  if (result.kind !== "invitation_listed") throw Error("unexpected");
  assert.equal(result.items.length, 200); assert.equal(result.hasMore, true);
  assert.deepEqual(result.items[199], item); assert.deepEqual(f.calls, [request]);
});
test("schema7 host tampering cannot reuse the authenticated management request signature", async () => {
  const f = fixture(false, true); await assert.rejects(() => f.transport.manageInvitation(request)); assert.equal(f.calls.length, 0);
});
test("management oversized response and auth/schema crossover fail closed", async () => {
  await assert.rejects(() => fixture(true).transport.manageInvitation(request));
  const f = fixture();
  for (const patch of [{ schemaVersion: 6 }, { operation: "invitation_accept" }, { storeId: id }, { requestHostname: "https://store.admin.example.test" }, { action: "send" }]) await assert.rejects(() => f.transport.manageInvitation({ ...request, ...patch } as never));
  assert.equal(f.calls.length, 0);
});
