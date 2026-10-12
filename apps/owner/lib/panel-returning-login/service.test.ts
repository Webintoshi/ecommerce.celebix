import assert from "node:assert/strict";
import test from "node:test";

import {
  type OidcAuthorizationRequest,
  type OidcAuthorizationTransaction,
  type OidcProviderCallbackInput,
  type OidcVerifiedIdentity,
} from "../self-serve-oidc.ts";
import { createPanelReturningLoginService } from "./service.ts";

const NOW = new Date("2026-07-30T12:00:00.000Z");
const PB = `pb1.${Buffer.alloc(32, 4).toString("base64url")}`;
const PROOF = Object.freeze({ keyId: "browser-active", digest: "a".repeat(64) });
const HOSTNAME = "admin.guzidekuyumcu.com.tr";
const STORE_ID = "30000000-0000-4000-8000-000000000001";
const PENDING_COOKIE = `apc1.${Buffer.from(JSON.stringify({ schemaVersion: 1, pendingId: "40000000-0000-4000-8000-000000000001" })).toString('base64url')}`;

class Store {
  private rows = new Map<string, OidcAuthorizationTransaction>();
  private consumed = new Set<string>();
  async save(transaction: OidcAuthorizationTransaction) { this.rows.set(transaction.state, structuredClone(transaction)); }
  async consume(state: string, now: Date) {
    if (this.consumed.has(state)) throw Object.assign(new Error("replayed"), { code: "oidc_state_replayed" });
    const transaction = this.rows.get(state);
    if (!transaction || Date.parse(transaction.expiresAt) <= now.getTime()) throw new Error("missing");
    this.rows.delete(state); this.consumed.add(state);
    return structuredClone(transaction);
  }
  async discard(state: string) { this.rows.delete(state); }
  async inspectPanelLoginBinding(state: string, candidates: readonly typeof PROOF[], now: Date) {
    const transaction = this.rows.get(state);
    if (!transaction || Date.parse(transaction.expiresAt) <= now.getTime()) return "denied" as const;
    if (!transaction.panelLoginBinding) return "not_panel_login" as const;
    const matched = candidates.find((candidate) => candidate.keyId === transaction.panelLoginBinding?.keyId && candidate.digest === transaction.panelLoginBinding.digest);
    return matched ? Object.freeze({ kind: "approved" as const, binding: matched }) : "denied" as const;
  }
}

function fixture(adminLoginSecurity?: Parameters<typeof createPanelReturningLoginService>[0]["adminLoginSecurity"]) {
  const store = new Store();
  let providerCalls = 0;
  let issuerCalls = 0;
  let nonce = "";
  const provider = {
    buildAuthorizationUrl(input: OidcAuthorizationRequest) {
      nonce = input.nonce;
      const url = new URL("https://identity.example.test/authorize");
      for (const [key, value] of [
        ["response_type", "code"], ["response_mode", "query"], ["state", input.state], ["nonce", input.nonce],
        ["code_challenge", input.codeChallenge], ["code_challenge_method", input.codeChallengeMethod], ["redirect_uri", input.redirectUri],
      ]) url.searchParams.set(key, value);
      if (input.prompt) url.searchParams.set("prompt", input.prompt);
      if (input.passwordProof) {
        url.searchParams.set("resource", "urn:celebix:admin-signin-proof");
        url.searchParams.set("scope", "openid profile email signin:proof");
        url.searchParams.set("max_age", "0");
      url.searchParams.set("prompt", "login consent");
      }
      return url;
    },
    async verifyCallback(_input: OidcProviderCallbackInput): Promise<OidcVerifiedIdentity> {
      providerCalls += 1;
      return { issuer: "https://identity.example.test/oidc", subject: "merchant", audience: ["panel"], nonce, email: "merchant@example.test", emailVerified: true };
    },
  };
  const service = createPanelReturningLoginService({
    provider,
    transactionStore: store,
    browserBindingCodec: {
      digestBrowserBindingCredential: () => PROOF,
      digestBrowserBindingCredentialCandidates: (credential: string) => Object.freeze([
        credential === PB ? PROOF : Object.freeze({ keyId: "browser-active", digest: "b".repeat(64) }),
      ]),
    },
    sessionIssuer: { async issue(identity, destinationHostname) {
      issuerCalls += 1;
      assert.deepEqual(identity, { issuer: "https://identity.example.test/oidc", subject: "merchant" });
      assert.equal(destinationHostname, HOSTNAME);
      return { kind: "session_issued" as const, credential: `v1.session.${Buffer.alloc(32, 5).toString("base64url")}`, activeStoreId: STORE_ID, issuedAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 28_800_000).toISOString() };
    } },
    callbackAuthority: "https://panel.celebix.site/auth/callback",
    expectedIssuer: "https://identity.example.test/oidc",
    expectedAudience: "panel",
    expectedAuthorizationOrigin: "https://identity.example.test",
    clock: () => new Date(NOW),
    ...(adminLoginSecurity ? { adminLoginSecurity } : {}),
  });
  return { service, providerCalls: () => providerCalls, issuerCalls: () => issuerCalls };
}

test("returning login starts one browser-bound OIDC authorization and completes it into a session", async () => {
  const f = fixture();
  const started = await f.service.start(PB, HOSTNAME);
  assert.equal(started.kind, "panel_login_ready");
  if (started.kind !== "panel_login_ready") return;
  assert.deepEqual(new URL(started.providerAuthorizationUrl).searchParams.getAll("prompt"), ["login"]);
  const state = new URL(started.providerAuthorizationUrl).searchParams.get("state");
  assert.ok(state);
  const completed = await f.service.tryComplete({ state, code: "valid" }, PB);
  assert.equal(completed.kind, "session_ready");
  if (completed.kind === "session_ready") {
    assert.equal(completed.activeStoreId, STORE_ID);
    assert.equal(completed.destinationOrigin, `https://${HOSTNAME}`);
  }
  assert.equal(f.providerCalls(), 1);
  assert.equal(f.issuerCalls(), 1);
});

test("mandatory WhatsApp login returns only a pending credential before any panel session", async () => {
  const calls: unknown[] = [];
  const f = fixture({
    requirePasswordProof: true,
    async begin(input: unknown) {
      calls.push(input);
      return Object.freeze({ kind: "whatsapp_required", pendingCredential: `apl1.admin.${Buffer.alloc(32, 7).toString("base64url")}`, pendingCookie: PENDING_COOKIE, pendingId: "40000000-0000-4000-8000-000000000001", expiresAt: new Date(NOW.getTime() + 600_000).toISOString(), destinationOrigin: `https://${HOSTNAME}` });
    },
  });
  const started = await f.service.start(PB, HOSTNAME);
  assert.equal(started.kind, "panel_login_ready");
  if (started.kind !== "panel_login_ready") return;
  const state = new URL(started.providerAuthorizationUrl).searchParams.get("state")!;
  const completed = await f.service.tryComplete({ state, code: "valid" }, PB);
  assert.equal(completed.kind, "whatsapp_required");
  assert.equal(f.issuerCalls(), 0, "first factor alone must not create a full panel session");
  assert.equal(calls.length, 1);
});

test("wrong browser binding and registration states never reach provider or session issuer", async () => {
  const f = fixture();
  const started = await f.service.start(PB, HOSTNAME);
  assert.equal(started.kind, "panel_login_ready");
  if (started.kind !== "panel_login_ready") return;
  const state = new URL(started.providerAuthorizationUrl).searchParams.get("state")!;
  assert.deepEqual(await f.service.tryComplete({ state, code: "valid" }, `pb1.${Buffer.alloc(32, 6).toString("base64url")}`), {
    kind: "fresh_login_required", code: "callback_not_granted",
  });
  assert.equal(f.providerCalls(), 0);
  assert.equal(f.issuerCalls(), 0);
});

test("trusted security start context reaches the gate through saved state without callback override", async () => {
  const calls: unknown[] = [];
  const f = fixture({ requirePasswordProof: true, async begin(input) { calls.push(input); return { kind: "fresh_login_required", code: "callback_not_granted" }; } });
  const context = { purpose: "change_phone" as const, expectedPrincipalId: "60000000-0000-4000-8000-000000000001" };
  const started = await f.service.start(PB, HOSTNAME, context);
  assert.equal(started.kind, "panel_login_ready");
  if (started.kind !== "panel_login_ready") return;
  const state = new URL(started.providerAuthorizationUrl).searchParams.get("state")!;
  assert.equal(started.providerAuthorizationUrl.includes(context.expectedPrincipalId), false);
  context.expectedPrincipalId = "60000000-0000-4000-8000-000000000002";
  await f.service.tryComplete({ state, code: "valid", adminLoginSecurityContext: { purpose: "manage", expectedPrincipalId: context.expectedPrincipalId } } as import('../self-serve-oidc.ts').OidcCallbackInput, PB);
  assert.deepEqual((calls[0] as Record<string, unknown>).adminLoginSecurityContext, { purpose: "change_phone", expectedPrincipalId: "60000000-0000-4000-8000-000000000001" });
  assert.equal(f.issuerCalls(), 0);
});

test("ordinary callback flags cannot create a security management context", async () => {
  const calls: unknown[] = [];
  const f = fixture({ requirePasswordProof: true, async begin(input) { calls.push(input); return { kind: "not_required" }; } });
  const started = await f.service.start(PB, HOSTNAME);
  assert.equal(started.kind, "panel_login_ready");
  if (started.kind !== "panel_login_ready") return;
  const state = new URL(started.providerAuthorizationUrl).searchParams.get("state")!;
  const completed = await f.service.tryComplete({ state, code: "valid", adminLoginSecurityContext: { purpose: "manage", expectedPrincipalId: "60000000-0000-4000-8000-000000000001" } } as import('../self-serve-oidc.ts').OidcCallbackInput, PB);
  assert.equal(completed.kind, "session_ready");
  assert.equal(Object.hasOwn(calls[0] as object, 'adminLoginSecurityContext'), false);
  assert.equal(f.issuerCalls(), 1);
});

test("security start fails closed without an active password-proof gate", async () => {
  const context = { purpose: "manage" as const, expectedPrincipalId: "60000000-0000-4000-8000-000000000001" };
  for (const f of [fixture(), fixture({ requirePasswordProof: false, async begin() { return { kind: "not_required" }; } })]) {
    assert.equal((await f.service.start(PB, HOSTNAME, context)).kind, "panel_login_unavailable");
    assert.equal(f.issuerCalls(), 0);
  }
});

test("management context cannot fall through to session issuance when the gate returns not_required", async () => {
  const f = fixture({ requirePasswordProof: true, async begin() { return { kind: "not_required" }; } });
  const started = await f.service.start(PB, HOSTNAME, { purpose: "manage", expectedPrincipalId: "60000000-0000-4000-8000-000000000001" });
  assert.equal(started.kind, "panel_login_ready");
  if (started.kind !== "panel_login_ready") return;
  const state = new URL(started.providerAuthorizationUrl).searchParams.get("state")!;
  assert.equal((await f.service.tryComplete({ state, code: "valid" }, PB)).kind, "fresh_login_required");
  assert.equal(f.issuerCalls(), 0);
});

test("WhatsApp gate requires a bounded private pending cookie before completion", async () => {
  for (const pendingCookie of [undefined, '', 'not-apc1', `apc1.${'a'.repeat(2048)}`, 'apc1.invalid/payload']) {
    const f = fixture({ requirePasswordProof: true, async begin() { return { kind: "whatsapp_required", pendingCredential: `apl1.admin.${Buffer.alloc(32, 7).toString("base64url")}`, pendingCookie, pendingId: "40000000-0000-4000-8000-000000000001", expiresAt: new Date(NOW.getTime() + 600_000).toISOString(), destinationOrigin: `https://${HOSTNAME}` } as import('./service.ts').AdminLoginWhatsAppRequired; } });
    const started = await f.service.start(PB, HOSTNAME);
    assert.equal(started.kind, "panel_login_ready");
    if (started.kind !== "panel_login_ready") return;
    const state = new URL(started.providerAuthorizationUrl).searchParams.get("state")!;
    assert.equal((await f.service.tryComplete({ state, code: "valid" }, PB)).kind, "fresh_login_required");
    assert.equal(f.issuerCalls(), 0);
  }
});

test('missing fresh password proof returns same-destination password login without a session',async()=>{
 const f=fixture({requirePasswordProof:true,async begin(){return {kind:'password_login_required',destinationOrigin:`https://${HOSTNAME}`};}});
 const started=await f.service.start(PB,HOSTNAME);assert.equal(started.kind,'panel_login_ready');if(started.kind!=='panel_login_ready')return;
 const state=new URL(started.providerAuthorizationUrl).searchParams.get('state')!;
 assert.deepEqual(await f.service.tryComplete({state,code:'valid'},PB),{kind:'password_login_required',destinationOrigin:`https://${HOSTNAME}`});assert.equal(f.issuerCalls(),0);
});
test('password login redirect cannot change the browser-bound tenant destination',async()=>{
 const f=fixture({requirePasswordProof:true,async begin(){return {kind:'password_login_required',destinationOrigin:'https://admin.attacker.example'};}});
 const started=await f.service.start(PB,HOSTNAME);assert.equal(started.kind,'panel_login_ready');if(started.kind!=='panel_login_ready')return;
 const state=new URL(started.providerAuthorizationUrl).searchParams.get('state')!;
 assert.equal((await f.service.tryComplete({state,code:'valid'},PB)).kind,'fresh_login_required');assert.equal(f.issuerCalls(),0);
});
