import assert from "node:assert/strict";
import test from "node:test";
import { createHash, createHmac } from "node:crypto";
import { PANEL_BROWSER_BOOTSTRAP_REQUEST_SIGNATURE_DOMAIN } from "../../../../packages/platform-config/src/saas.ts";
import { createOwnerPanelBrowserBindingInternalGateway, createPanelBrowserBindingInternalGatewayApproval } from "./internal-gateway.ts";
import { createAuthenticatedPanelBrowserBindingTransport } from "../../../customer-panel/lib/panel-browser-binding-bootstrap/transport.ts";
import { createPanelBrowserBindingBootstrapApproval } from "../../../customer-panel/lib/panel-browser-binding-bootstrap/activation.ts";

const now = new Date("2026-09-17T12:00:00.000Z");
const token = Buffer.alloc(32, 1).toString("base64url"), proof = `pb1.${token}`, grant = `ig1.${token}`;
const expires = "2026-09-17T12:04:00.000Z";
const provider = "https://identity.example.test/authorize?state=pinvite_0123456789abcdef&redirect_uri=https%3A%2F%2Fpanel.celebix.site%2Fauth%2Fcallback&response_type=code&response_mode=query";
const operationId = "11111111-1111-4111-8111-111111111111";
function fixture(change?: (response: Response) => Promise<Response>) {
  const calls: unknown[] = [];
  const gateway = createOwnerPanelBrowserBindingInternalGateway({
    activationApproval: createPanelBrowserBindingInternalGatewayApproval("disposable_test"),
    ownerInternalOrigin: "https://owner.example.test", keys: new Map([["test", Buffer.alloc(32, 4)]]), clock: () => now, maximumBodyBytes: 16384,
    repository: { async bindBrowserCredential() { throw new Error("registration forbidden"); } },
    invitations: {
      async start(t: string, p: string) { calls.push(["start", t, p]); return { kind: "invitation_login_ready" as const, providerAuthorizationUrl: provider, browserBindingExpiresAt: expires }; },
      async preview(g: string, p: string) { calls.push(["preview", g, p]); return { kind: "invitation_confirmation" as const, storeName: "Test Store", email: "recipient@example.test", role: "admin" as const, expiresAt: expires }; },
      async accept(g: string, p: string, op: string) { calls.push(["accept", g, p, op]); return { kind: "invitation_accepted_access_retry" as const, accepted: true as const, retryable: true as const }; },
    }, audit() {},
  });
  const transport = createAuthenticatedPanelBrowserBindingTransport({
    activationApproval: createPanelBrowserBindingBootstrapApproval("disposable_test"), ownerInternalOrigin: "https://owner.example.test", activeKeyId: "test", activeSecret: Buffer.alloc(32, 4), clock: () => now, deadlineMs: 500, maximumResponseBytes: 16384, audit() {},
    async fetch(request) { let response = await gateway(request); if (change) response = await change(response); Object.defineProperty(response, "url", { value: request.url }); return response; },
  });
  return { transport, calls, gateway };
}
test("signed invitation start/preview/accept isolate purpose and preserve committed-access retry", async () => {
  const f = fixture();
  assert.equal((await f.transport.startInvitation({ token, browserBindingCredential: proof })).kind, "invitation_login_ready");
  assert.deepEqual(await f.transport.previewInvitation({ grantCredential: grant, browserBindingCredential: proof }), { schemaVersion: 3, kind: "invitation_confirmation", storeName: "Test Store", email: "recipient@example.test", role: "admin", expiresAt: expires });
  assert.deepEqual(await f.transport.acceptInvitation({ grantCredential: grant, browserBindingCredential: proof, operationId }), { schemaVersion: 3, kind: "invitation_accepted_access_retry", accepted: true, retryable: true });
  assert.deepEqual(f.calls, [["start", token, proof], ["preview", grant, proof], ["accept", grant, proof, operationId]]);
});
test("Owner invitation envelope rejects signed extra authority, stale time, private headers and noncanonical bytes before dispatch", async () => {
  const f = fixture();
  const good = { schemaVersion: 4, operation: "invitation_start", browserBindingCredential: proof, token };
  const mutations: Array<{ body?: string; timestamp?: string; headers?: Record<string, string> }> = [
    { body: JSON.stringify({ ...good, role: "owner" }) }, { body: JSON.stringify({ ...good, storeId: operationId }) },
    { body: JSON.stringify({ ...good, email: "other@example.test" }) }, { body: JSON.stringify({ ...good, returnTo: "https://evil.example" }) },
    { body: JSON.stringify({ ...good, schemaVersion: 5 }) }, { body: " " + JSON.stringify(good) },
    { timestamp: String(+now - 61000) }, { timestamp: String(+now + 6000) }, { headers: { "x-celebix-issuer": "injected" } }, { headers: { authorization: "injected" } },
  ];
  for (const mutation of mutations) {
    const body = mutation.body ?? JSON.stringify(good), timestamp = mutation.timestamp ?? String(+now);
    const signature = createHmac("sha256", Buffer.alloc(32, 4)).update(`${PANEL_BROWSER_BOOTSTRAP_REQUEST_SIGNATURE_DOMAIN}\n${timestamp}\n${createHash("sha256").update(body).digest("hex")}`).digest("base64url");
    const response = await f.gateway(new Request("https://owner.example.test/api/internal/self-serve/browser-binding", { method: "POST", headers: { "content-type": "application/json; charset=utf-8", "x-celebix-browser-bootstrap-key-id": "test", "x-celebix-browser-bootstrap-timestamp": timestamp, "x-celebix-browser-bootstrap-signature": signature, ...mutation.headers }, body }));
    assert.ok(response.status === 400 || response.status === 401);
  }
  assert.deepEqual(f.calls, []);
});
test("invitation response tampering fails authentication", async () => {
  const f = fixture(async r => new Response((await r.text()).replace("invitation_login_ready", "invitation_session_ready"), { status: r.status, headers: r.headers }));
  await assert.rejects(() => f.transport.startInvitation({ token, browserBindingCredential: proof }));
});
test("browser authority extras and noncanonical credentials fail before sending", async () => {
  const f = fixture();
  await assert.rejects(() => f.transport.startInvitation({ token, browserBindingCredential: proof, role: "owner" } as never));
  await assert.rejects(() => f.transport.previewInvitation({ grantCredential: `${grant}=`, browserBindingCredential: proof }));
  assert.deepEqual(f.calls, []);
});
