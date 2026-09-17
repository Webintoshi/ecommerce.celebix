import assert from "node:assert/strict";
import test from "node:test";
import { createHash, createHmac } from "node:crypto";
import { createFreshLoginRequiredResult } from "../panel-session-handoff/internal-response.ts";
import { createPanelSessionCompletionApproval } from "../../../customer-panel/lib/panel-session-completion/activation.ts";
import { createPanelSessionCompletionHandler } from "../../../customer-panel/lib/panel-session-completion/completion.ts";
import { createAuthenticatedPanelSessionCompletionTransport, panelSessionHandoffResponseSignaturePreimage } from "../../../customer-panel/lib/panel-session-completion/transport.ts";
import { InMemoryOidcTransactionStore, type OidcAuthorizationTransaction, type OidcProviderPort } from "../self-serve-oidc.ts";
import type { InvitationGrantPreview, InvitationIdentityRepository } from "./repository.ts";

const api = await import("./auth-service.ts").catch(() => ({} as typeof import("./auth-service.ts")));
const now = new Date("2026-09-17T12:00:00.000Z"), expiry = "2026-09-17T12:05:00.000Z";
const id = "10000000-0000-4000-8000-000000000001", storeId = "10000000-0000-4000-8000-000000000002", operationId = "10000000-0000-4000-8000-000000000003";
const token = Buffer.alloc(32, 7).toString("base64url");
const binding = { keyId: "browser1", digest: "b".repeat(64) };
function fixture() {
  let clockTime = new Date(now), providerAdvanceMs = 0, previewAdvanceMs = 0;
  const transactions = new Map<string, OidcAuthorizationTransaction>(), consumed = new Set<string>();
  const memory = new InMemoryOidcTransactionStore();
  const transactionStore = {
    async save(tx: OidcAuthorizationTransaction) { transactions.set(tx.state, tx); await memory.save(tx); },
    async consume(state: string, date: Date) { const tx = await memory.consume(state, date); consumed.add(state); return tx; },
    discard: (state: string) => memory.discard(state),
    async inspectInvitationBinding(state: string, candidates: readonly typeof binding[], date: Date) {
      const context = transactions.get(state)?.invitationContext;
      if (!context) return state.startsWith("pinvite_") ? "denied" as const : "not_invitation" as const;
      return !consumed.has(state) && Date.parse(transactions.get(state)!.expiresAt) > date.getTime() && candidates.some(p => p.digest === binding.digest) ? { kind: "approved" as const, context, browserBindingExpiresAt: transactions.get(state)!.expiresAt } : "denied" as const;
    },
    async recoverInvitationContext(state: string, candidates: readonly typeof binding[], date: Date) { return consumed.has(state) && Date.parse(transactions.get(state)!.expiresAt) > date.getTime() && candidates.some(p => p.digest === binding.digest) ? { context: transactions.get(state)!.invitationContext!, browserBindingExpiresAt: transactions.get(state)!.expiresAt } : null; },
  };
  let grant: InvitationGrantPreview | undefined, grantDigest: string | undefined, accepted = false;
  let exchanges = 0, sessions = 0, accepts = 0, grantCalls = 0;
  let denyGrant = false, unknownGrant = false, unknownAccept = false, recoverAccept = true, sessionFails = false, previewFails = false;
  let identityChanges: Record<string, unknown> = {};
  const provider: OidcProviderPort = {
    buildAuthorizationUrl(input) { const url = new URL("https://identity.example.test/authorize"); for (const [key, value] of Object.entries({ state: input.state, nonce: input.nonce, code_challenge: input.codeChallenge, code_challenge_method: input.codeChallengeMethod, redirect_uri: input.redirectUri, response_type: "code", response_mode: "query", prompt: input.prompt! })) url.searchParams.set(key, value); return url; },
    async verifyCallback(input) { exchanges++; clockTime = new Date(clockTime.getTime() + providerAdvanceMs); return { issuer: input.expectedIssuer, subject: "recipient", audience: [input.expectedAudience], nonce: input.expectedNonce, email: "Recipient@Example.test", emailVerified: true, ...identityChanges }; },
  };
  const acceptedValue = { invitationId: id, storeId, principalId: id, membershipId: id, role: "admin" as const, adminHostname: "admin.example.test" };
  const repository: Pick<InvitationIdentityRepository, "resolve" | "grant" | "grantPreview" | "accept" | "recoverAcceptance"> = {
    async resolve() { return { kind: "resolved", value: { invitationId: id, generation: 1, storeId, email: "recipient@example.test", displayName: "Recipient", role: "admin", expiresAt: "2026-09-18T12:00:00.000Z" } }; },
    async grant(input) { grantCalls++; if (denyGrant) return { kind: "invitation_unavailable" }; grantDigest = input.grantDigest;
      grant = { grantId: input.grantId, invitationId: input.invitationId, generation: input.generation, storeId, storeName: "Test Store", email: input.email, displayName: "Recipient", role: "admin", expiresAt: input.expiresAt.toISOString(), issuer: input.issuer, subject: input.subject, accepted: false };
      return unknownGrant ? { kind: "commit_unknown" } : { kind: "granted", value: grant }; },
    async grantPreview(proof) { clockTime = new Date(clockTime.getTime() + previewAdvanceMs); return previewFails ? { kind: "unavailable" } : grant && proof.grantDigest === grantDigest && proof.browserDigest === binding.digest ? { kind: "grant_available", value: { ...grant, accepted } } : { kind: "invitation_unavailable" }; },
    async accept(proof) { accepts++; assert.equal(proof.operationId, operationId); assert.equal(proof.browserDigest, binding.digest); accepted = true; return unknownAccept ? { kind: "commit_unknown" } : { kind: "accepted", value: acceptedValue }; },
    async recoverAcceptance(proof) { assert.equal(proof.operationId, operationId); return accepted && recoverAccept ? { kind: "operation_replayed", value: acceptedValue } : { kind: "operation_not_found" }; },
  };
  const service = api.createStoreAdminInvitationAuthService({ provider, transactionStore, repository,
    browserBindingCodec: { digestBrowserBindingCredential: (c: string) => { if (c !== "browser") throw Error("invalid"); return binding; }, digestBrowserBindingCredentialCandidates: (c: string) => { if (!c) throw Error("invalid"); return [{ ...binding, digest: c === "browser" ? binding.digest : "c".repeat(64) }]; } },
    sessionIssuer: { async issue(identity, hostname) { sessions++; assert.equal(accepted, true, "no session before commit"); assert.deepEqual(identity, { issuer: "https://identity.example.test", subject: "recipient" }); assert.equal(hostname, "admin.example.test"); return sessionFails ? { kind: "membership_denied" as const } : { kind: "session_issued" as const, credential: "session", activeStoreId: storeId, issuedAt: now.toISOString(), expiresAt: expiry }; } },
    callbackAuthority: "https://panel.example.test/auth/callback", panelOrigin: "https://panel.example.test", acceptanceOrigin: "https://panel.example.test", expectedIssuer: "https://identity.example.test", expectedAudience: "panel", expectedAuthorizationOrigin: "https://identity.example.test", clock: () => new Date(clockTime),
  });
  return { service, transactions, get counts() { return { exchanges, sessions, accepts, grantCalls }; }, revoke() { grant = undefined; },
    advance(ms: number) { clockTime = new Date(clockTime.getTime() + ms); }, providerDelay(ms: number) { providerAdvanceMs = ms; }, previewDelay(ms: number) { previewAdvanceMs = ms; },
    change(options: { denyGrant?: boolean; unknownGrant?: boolean; unknownAccept?: boolean; recoverAccept?: boolean; sessionFails?: boolean; previewFails?: boolean; identity?: Record<string, unknown> }) { denyGrant = options.denyGrant ?? denyGrant; unknownGrant = options.unknownGrant ?? unknownGrant; unknownAccept = options.unknownAccept ?? unknownAccept; recoverAccept = options.recoverAccept ?? recoverAccept; sessionFails = options.sessionFails ?? sessionFails; previewFails = options.previewFails ?? previewFails; identityChanges = options.identity ?? identityChanges; },
  };
}
async function start(f: ReturnType<typeof fixture>) { const result = await f.service.start(token, "browser"); assert.equal(result.kind, "invitation_login_ready"); if (result.kind !== "invitation_login_ready") throw Error(); const state = new URL(result.providerAuthorizationUrl).searchParams.get("state")!; return { state, code: "verified-code" }; }

test("first signed callback_unavailable retains original proof and recovers committed grant without another provider exchange", async () => {
  const f = fixture(), callback = await start(f), original = f.transactions.get(callback.state)!;
  const credential = `pb1.${Buffer.alloc(32, 6).toString("base64url")}`, secret = new Uint8Array(32).fill(53);
  let currentTime = new Date(Date.parse(original.expiresAt) - 90000);
  f.advance(+currentTime - +now);
  f.change({ unknownGrant: true, previewFails: true });
  const transport = createAuthenticatedPanelSessionCompletionTransport({
    activationApproval: createPanelSessionCompletionApproval("disposable_test"), ownerInternalOrigin: "https://owner-internal.example.test", panelCallbackAuthority: "https://panel.example.test/auth/callback",
    activeKeyId: "active", activeSecret: secret, clock: () => currentTime, deadlineMs: 500, maximumResponseBytes: 4096, audit() {},
    async fetch(request) {
      const requestBody = await request.clone().text(), input = JSON.parse(requestBody);
      assert.equal(input.browserBindingCredential, credential);
      const url = new URL(input.callbackUrl);
      const result = await f.service.tryComplete({ state: url.searchParams.get("state")!, code: url.searchParams.get("code")! }, "browser");
      const mapped = result.kind === "invitation_confirmation_ready" ? { status: 200, body: { schemaVersion: 2, ...result } }
        : createFreshLoginRequiredResult(result.kind === "invitation_rejected" && result.retryable ? "callback_unavailable" : "callback_not_granted");
      const body = JSON.stringify(mapped.body), timestamp = request.headers.get("x-celebix-callback-timestamp")!;
      const signature = createHmac("sha256", secret).update(panelSessionHandoffResponseSignaturePreimage({ requestTimestamp: timestamp, requestBodyDigest: createHash("sha256").update(requestBody).digest("hex"), status: mapped.status, responseBodyDigest: createHash("sha256").update(body).digest("hex") })).digest("base64url");
      const response = new Response(body, { status: mapped.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-celebix-session-response-key-id": "active", "x-celebix-session-response-timestamp": timestamp, "x-celebix-session-response-signature": signature } });
      Object.defineProperty(response, "url", { value: request.url }); return response;
    },
  });
  const handler = createPanelSessionCompletionHandler({ activationApproval: createPanelSessionCompletionApproval("disposable_test"), publicCallbackAuthority: "https://panel.example.test/auth/callback", panelHomeAuthority: "https://panel.example.test/", maximumQueryBytes: 2048, transport, clock: () => currentTime, audit() {}, redeemer: { async redeemHandoff() { throw Error("no session before acceptance"); }, async recoverRedemption() { throw Error("no session before acceptance"); } } });
  let cookie = `__Host-celebix_panel_pre_auth=${credential}`;
  const request = () => new Request(`https://panel.example.test/auth/callback?state=${callback.state}&code=${callback.code}`, { headers: { cookie } });
  const first = await handler(request());
  if (first.headers.getSetCookie().some(value => value.startsWith("__Host-celebix_panel_pre_auth=;"))) cookie = "";
  assert.equal(first.status, 503); assert.deepEqual(first.headers.getSetCookie(), []);
  assert.deepEqual(f.counts, { exchanges: 1, sessions: 0, accepts: 0, grantCalls: 1 });
  f.change({ previewFails: false }); f.advance(30000); currentTime = new Date(+currentTime + 30000);
  const recovered = await handler(request()), remaining = 60;
  assert.equal(recovered.status, 303);
  assert.equal(recovered.headers.get("location"), "/invitations/confirm");
  assert.ok(recovered.headers.getSetCookie().includes(`__Host-celebix_invitation_grant=${original.invitationContext!.grantCredential}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${remaining}`));
  assert.ok(recovered.headers.getSetCookie().every(value => !value.includes("panel_pre_auth")));
  f.advance(30000); currentTime = new Date(+currentTime + 30000);
  assert.ok((await handler(request())).headers.getSetCookie().some(value => value.endsWith(`Max-Age=${remaining - 30}`)));
  assert.deepEqual(f.counts, { exchanges: 1, sessions: 0, accepts: 0, grantCalls: 1 });
  f.advance(Date.parse(original.expiresAt) - +currentTime + 1); currentTime = new Date(Date.parse(original.expiresAt) + 1);
  assert.equal((await handler(request())).status, 409);
  assert.equal(f.counts.exchanges, 1);
});

test("invitation callback grants only; confirmation projects identity away; explicit acceptance issues normal session", async () => {
  assert.equal(typeof api.createStoreAdminInvitationAuthService, "function");
  const f = fixture(), callback = await start(f);
  assert.equal(JSON.stringify([...f.transactions.values()]).includes(token), false);
  const result = await f.service.tryComplete(callback, "browser"); assert.equal(result.kind, "invitation_confirmation_ready");
  if (result.kind !== "invitation_confirmation_ready") throw Error();
  assert.deepEqual(f.counts, { exchanges: 1, sessions: 0, accepts: 0, grantCalls: 1 });
  assert.deepEqual(await f.service.preview(result.grantCredential, "browser"), { kind: "invitation_confirmation", storeName: "Test Store", email: "recipient@example.test", role: "admin", expiresAt: expiry });
  assert.equal((await f.service.accept(result.grantCredential, "browser", operationId)).kind, "invitation_session_ready");
});
test("lost callback response recovers only same-browser durable grant without exchange or renewed expiry", async () => {
  const f = fixture(); f.change({ unknownGrant: true }); const callback = await start(f);
  const result = await f.service.tryComplete(callback, "browser"); assert.equal(result.kind, "invitation_confirmation_ready");
  assert.deepEqual(await f.service.tryComplete(callback, "browser"), result);
  assert.equal((await f.service.tryComplete(callback, "other")).kind, "invitation_rejected");
  assert.equal(f.counts.exchanges, 1); assert.equal(f.counts.grantCalls, 1);
  f.revoke(); assert.equal((await f.service.tryComplete(callback, "browser")).kind, "invitation_rejected");
});
test("consumed callback without grant never invents verification; provider errors and unknown invitation never become registration", async () => {
  const f = fixture(); f.change({ denyGrant: true }); const callback = await start(f);
  assert.equal((await f.service.tryComplete(callback, "browser")).kind, "invitation_rejected");
  assert.equal((await f.service.tryComplete(callback, "browser")).kind, "invitation_rejected");
  assert.equal(f.counts.exchanges, 1); assert.equal(f.counts.grantCalls, 1);
  const next = await start(f); assert.equal((await f.service.tryRejectProvider(next.state, undefined, "browser")).kind, "invitation_rejected");
  assert.equal((await f.service.tryComplete(next, "browser")).kind, "invitation_rejected");
  assert.equal((await f.service.tryRejectProvider("pinvite_missing-state", undefined, "browser")).kind, "invitation_rejected");
  assert.equal((await f.service.tryComplete({ state: "registration-state", code: "code" }, "browser")).kind, "not_invitation");
});
test("issuer audience nonce verification and normalized recipient equality all precede grant", async () => {
  for (const identity of [{ issuer: "https://evil.example" }, { audience: ["other"] }, { nonce: "wrong" }, { emailVerified: false }, { email: "another@example.test" }]) {
    const f = fixture(); f.change({ identity }); const result = await f.service.tryComplete(await start(f), "browser");
    assert.equal(result.kind, "invitation_rejected"); assert.equal(f.counts.grantCalls, 0); assert.equal(f.counts.sessions, 0);
  }
});
test("unknown acceptance must recover commit before session; committed acceptance with session failure stays accepted", async () => {
  const f = fixture(); const result = await f.service.tryComplete(await start(f), "browser"); if (result.kind !== "invitation_confirmation_ready") throw Error();
  f.change({ unknownAccept: true, recoverAccept: false });
  assert.equal((await f.service.accept(result.grantCredential, "browser", operationId)).kind, "invitation_rejected"); assert.equal(f.counts.sessions, 0);
  f.change({ recoverAccept: true, sessionFails: true });
  assert.equal((await f.service.accept(result.grantCredential, "browser", operationId)).kind, "invitation_accepted_access_retry");
  f.change({ sessionFails: false });
  assert.equal((await f.service.accept(result.grantCredential, "browser", operationId)).kind, "invitation_session_ready"); assert.equal(f.counts.accepts, 1);
});
test("grant credential digest purpose is separate and canonical; wrong or revoked grants cannot accept", async () => {
  assert.equal(typeof api.digestInvitationGrantCredential, "function");
  const credential = `ig1.${Buffer.alloc(32, 1).toString("base64url")}`;
  assert.equal(api.digestInvitationGrantCredential(credential), createHash("sha256").update(`celebix-store-admin-invitation-grant:v1\n${credential}`).digest("hex"));
  for (const value of [token, `${credential}=`, credential.slice(0, -1) + "B"]) assert.throws(() => api.digestInvitationGrantCredential(value));
  const f = fixture(); assert.equal((await f.service.accept(credential, "browser", operationId)).kind, "invitation_rejected"); assert.equal(f.counts.accepts, 0);
});

test("wrong browser callbacks cannot consume valid intent; revoked grant never reaches explicit acceptance", async () => {
  const f = fixture(), callback = await start(f);
  assert.equal((await f.service.tryComplete(callback, "wrong-browser")).kind, "invitation_rejected");
  assert.equal((await f.service.tryRejectProvider(callback.state, undefined, "wrong-browser")).kind, "invitation_rejected");
  assert.equal(f.counts.exchanges, 0);
  const result = await f.service.tryComplete(callback, "browser"); assert.equal(result.kind, "invitation_confirmation_ready");
  if (result.kind !== "invitation_confirmation_ready") throw Error();
  assert.equal((await f.service.preview(result.grantCredential, "wrong-browser")).kind, "invitation_rejected");
  f.revoke(); assert.equal((await f.service.accept(result.grantCredential, "browser", operationId)).kind, "invitation_rejected");
  assert.equal(f.counts.accepts, 0); assert.equal(f.counts.sessions, 0);
});

test("malformed grants and missing browser proofs are terminal, not commit-uncertainty retries", async () => {
  const f = fixture(), callback = await start(f);
  for (const result of [await f.service.preview("invalid-grant", "browser"), await f.service.accept("invalid-grant", "browser", operationId), await f.service.tryComplete(callback, ""), await f.service.recoverInvitationCompletion(callback.state, "")]) {
    assert.equal(result.kind, "invitation_rejected"); if (result.kind !== "invitation_rejected") throw Error(); assert.equal(result.retryable, false);
  }
  assert.deepEqual(f.counts, { exchanges: 0, sessions: 0, accepts: 0, grantCalls: 0 });
});

test("durable grant lookup outage preserves a retryable verified continuation", async () => {
  const f = fixture(), callback = await start(f);
  const confirmed = await f.service.tryComplete(callback, "browser"); assert.equal(confirmed.kind, "invitation_confirmation_ready");
  f.change({ previewFails: true });
  const uncertain = await f.service.tryComplete(callback, "browser");
  assert.deepEqual(uncertain, { kind: "invitation_rejected", code: "callback_unavailable", retryable: true });
  f.change({ previewFails: false }); assert.deepEqual(await f.service.tryComplete(callback, "browser"), confirmed);
  assert.equal(f.counts.exchanges, 1); assert.equal(f.counts.grantCalls, 1);
});

test("slow login caps confirmation and durable grant to original preauth deadline", async () => {
  const f = fixture(), callback = await start(f);
  f.advance(9 * 60_000);
  const result = await f.service.tryComplete(callback, "browser");
  assert.equal(result.kind, "invitation_confirmation_ready"); if (result.kind !== "invitation_confirmation_ready") throw Error();
  assert.equal(result.grantExpiresAt, "2026-09-17T12:10:00.000Z");
  const preview = await f.service.preview(result.grantCredential, "browser");
  assert.equal(preview.kind, "invitation_confirmation"); if (preview.kind !== "invitation_confirmation") throw Error();
  assert.equal(preview.expiresAt, "2026-09-17T12:10:00.000Z");
});

test("lost callback near original deadline recovers unchanged grant expiry and never past it", async () => {
  const f = fixture(), callback = await start(f); f.change({ unknownGrant: true }); f.advance(9 * 60_000);
  const result = await f.service.tryComplete(callback, "browser");
  assert.equal(result.kind, "invitation_confirmation_ready"); if (result.kind !== "invitation_confirmation_ready") throw Error();
  assert.equal(result.grantExpiresAt, "2026-09-17T12:10:00.000Z");
  f.advance(59_999); assert.deepEqual(await f.service.tryComplete(callback, "browser"), result);
  f.advance(1); assert.equal((await f.service.tryComplete(callback, "browser")).kind, "invitation_rejected");
  assert.deepEqual(f.counts, { exchanges: 1, sessions: 0, accepts: 0, grantCalls: 1 });
});

test("provider completion crossing original preauth deadline cannot create a grant", async () => {
  const f = fixture(), callback = await start(f); f.advance(9 * 60_000); f.providerDelay(60_000);
  assert.equal((await f.service.tryComplete(callback, "browser")).kind, "invitation_rejected");
  assert.deepEqual(f.counts, { exchanges: 1, sessions: 0, accepts: 0, grantCalls: 0 });
});

test("durable lookup crossing original deadline cannot return a recovered continuation", async () => {
  const f = fixture(), callback = await start(f); f.advance(9 * 60_000);
  assert.equal((await f.service.tryComplete(callback, "browser")).kind, "invitation_confirmation_ready");
  f.advance(59_000); f.previewDelay(1_000);
  assert.equal((await f.service.recoverInvitationCompletion(callback.state, "browser")).kind, "invitation_rejected");
  assert.deepEqual(f.counts, { exchanges: 1, sessions: 0, accepts: 0, grantCalls: 1 });
});
