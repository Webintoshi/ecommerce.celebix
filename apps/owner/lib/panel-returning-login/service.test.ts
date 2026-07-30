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

function fixture() {
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
    sessionIssuer: { async issue(identity) {
      issuerCalls += 1;
      assert.deepEqual(identity, { issuer: "https://identity.example.test/oidc", subject: "merchant" });
      return { kind: "session_issued" as const, credential: `v1.session.${Buffer.alloc(32, 5).toString("base64url")}`, issuedAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 28_800_000).toISOString() };
    } },
    callbackAuthority: "https://panel.celebix.site/auth/callback",
    expectedIssuer: "https://identity.example.test/oidc",
    expectedAudience: "panel",
    expectedAuthorizationOrigin: "https://identity.example.test",
    clock: () => new Date(NOW),
  });
  return { service, providerCalls: () => providerCalls, issuerCalls: () => issuerCalls };
}

test("returning login starts one browser-bound OIDC authorization and completes it into a session", async () => {
  const f = fixture();
  const started = await f.service.start(PB);
  assert.equal(started.kind, "panel_login_ready");
  if (started.kind !== "panel_login_ready") return;
  assert.deepEqual(new URL(started.providerAuthorizationUrl).searchParams.getAll("prompt"), ["login"]);
  const state = new URL(started.providerAuthorizationUrl).searchParams.get("state");
  assert.ok(state);
  const completed = await f.service.tryComplete({ state, code: "valid" }, PB);
  assert.equal(completed.kind, "session_ready");
  assert.equal(f.providerCalls(), 1);
  assert.equal(f.issuerCalls(), 1);
});

test("wrong browser binding and registration states never reach provider or session issuer", async () => {
  const f = fixture();
  const started = await f.service.start(PB);
  assert.equal(started.kind, "panel_login_ready");
  if (started.kind !== "panel_login_ready") return;
  const state = new URL(started.providerAuthorizationUrl).searchParams.get("state")!;
  assert.deepEqual(await f.service.tryComplete({ state, code: "valid" }, `pb1.${Buffer.alloc(32, 6).toString("base64url")}`), {
    kind: "fresh_login_required", code: "callback_not_granted",
  });
  assert.equal(f.providerCalls(), 0);
  assert.equal(f.issuerCalls(), 0);
});
