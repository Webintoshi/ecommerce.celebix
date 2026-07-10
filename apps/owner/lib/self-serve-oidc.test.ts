import assert from "node:assert/strict";
import test from "node:test";

import type {
  OidcAuthorizationRequest,
  OidcCallbackInput,
  OidcProviderCallbackInput,
  OidcProviderPort,
  OidcVerifiedIdentity,
} from "./self-serve-oidc";

type OidcModule = typeof import("./self-serve-oidc");

const oidc = await import(new URL("./self-serve-oidc.ts", import.meta.url).href).catch(
  () => ({} as Partial<OidcModule>),
);

const NOW = new Date("2026-07-10T12:00:00.000Z");
const EXPECTED_ISSUER = "https://identity.example.test/oidc";
const EXPECTED_AUDIENCE = "customer-panel";
const REDIRECT_URI = "https://ecommerce.celebix.co/api/self-serve/auth/callback";

class FakeProvider implements OidcProviderPort {
  readonly identities = new Map<string, OidcVerifiedIdentity>();
  lastAuthorizationRequest: OidcAuthorizationRequest | null = null;
  lastCallbackInput: OidcProviderCallbackInput | null = null;

  buildAuthorizationUrl(input: OidcAuthorizationRequest) {
    this.lastAuthorizationRequest = input;
    const url = new URL("https://identity.example.test/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", input.state);
    url.searchParams.set("nonce", input.nonce);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", input.codeChallengeMethod);
    url.searchParams.set("redirect_uri", input.redirectUri);
    return url;
  }

  async verifyCallback(input: OidcProviderCallbackInput) {
    this.lastCallbackInput = input;
    const identity = this.identities.get(input.code);
    if (!identity) {
      throw new Error("provider callback rejected");
    }
    return identity;
  }
}

function verifiedIdentity(overrides: Partial<OidcVerifiedIdentity> = {}): OidcVerifiedIdentity {
  return {
    issuer: EXPECTED_ISSUER,
    subject: "subject_123",
    audience: [EXPECTED_AUDIENCE],
    nonce: overrides.nonce ?? "set-per-test",
    email: "owner@example.test",
    emailVerified: true,
    ...overrides,
  };
}

async function begin(provider: FakeProvider, now = NOW, returnTo = "/kayit") {
  assert.equal(typeof oidc.beginOidcAuthorization, "function");
  assert.equal(typeof oidc.InMemoryOidcTransactionStore, "function");
  const store = new oidc.InMemoryOidcTransactionStore();
  const result = await oidc.beginOidcAuthorization({
    provider,
    transactionStore: store,
    redirectUri: REDIRECT_URI,
    returnTo,
    expectedIssuer: EXPECTED_ISSUER,
    expectedAudience: EXPECTED_AUDIENCE,
    now: () => now,
  });
  return { result, store };
}

test("exports the provider-neutral OIDC BFF surface", () => {
  assert.equal(typeof oidc.beginOidcAuthorization, "function");
  assert.equal(typeof oidc.completeOidcCallback, "function");
  assert.equal(typeof oidc.InMemoryOidcTransactionStore, "function");
});

test("creates opaque state, nonce and an S256 challenge without exposing the PKCE verifier", async () => {
  if (!oidc.beginOidcAuthorization || !oidc.InMemoryOidcTransactionStore) return;
  const provider = new FakeProvider();
  const { result } = await begin(provider);
  const url = new URL(result.authorizationUrl);

  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.match(url.searchParams.get("state") ?? "", /^[A-Za-z0-9_-]{40,}$/);
  assert.match(url.searchParams.get("nonce") ?? "", /^[A-Za-z0-9_-]{40,}$/);
  assert.match(url.searchParams.get("code_challenge") ?? "", /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(url.searchParams.has("code_verifier"), false);
  assert.equal(JSON.stringify(result).toLowerCase().includes("verifier"), false);
  assert.equal(result.authorizationUrl.includes("/kayit"), false);
});

test("completes a callback once and passes the verifier only through the provider port", async () => {
  if (!oidc.completeOidcCallback || !oidc.InMemoryOidcTransactionStore) return;
  const provider = new FakeProvider();
  const { result, store } = await begin(provider);
  const nonce = new URL(result.authorizationUrl).searchParams.get("nonce");
  assert.ok(nonce);
  provider.identities.set("valid-code", verifiedIdentity({ nonce }));

  const completed = await oidc.completeOidcCallback({
    provider,
    transactionStore: store,
    callback: { code: "valid-code", state: result.state },
    now: () => NOW,
  });

  assert.equal(completed.identity.subject, "subject_123");
  assert.equal(completed.returnTo, "/kayit");
  assert.match(provider.lastCallbackInput?.codeVerifier ?? "", /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(new URL(result.authorizationUrl).toString().includes(provider.lastCallbackInput?.codeVerifier ?? ""), false);

  await assert.rejects(
    () =>
      oidc.completeOidcCallback!({
        provider,
        transactionStore: store,
        callback: { code: "valid-code", state: result.state },
        now: () => NOW,
      }),
    (error: unknown) => (error as { code?: string }).code === "oidc_state_replayed",
  );
});

test("rejects expired state before calling the provider", async () => {
  if (!oidc.completeOidcCallback || !oidc.InMemoryOidcTransactionStore) return;
  const provider = new FakeProvider();
  const { result, store } = await begin(provider);

  await assert.rejects(
    () =>
      oidc.completeOidcCallback!({
        provider,
        transactionStore: store,
        callback: { code: "late-code", state: result.state },
        now: () => new Date(NOW.getTime() + 11 * 60_000),
      }),
    (error: unknown) => (error as { code?: string }).code === "oidc_state_expired",
  );
  assert.equal(provider.lastCallbackInput, null);
});

for (const [name, overrides, expectedCode] of [
  ["nonce", { nonce: "wrong-nonce" }, "oidc_nonce_mismatch"],
  ["issuer", { issuer: "https://attacker.example.test" }, "oidc_issuer_mismatch"],
  ["audience", { audience: ["wrong-audience"] }, "oidc_audience_mismatch"],
] as const) {
  test(`rejects a callback with the wrong ${name}`, async () => {
    if (!oidc.completeOidcCallback || !oidc.InMemoryOidcTransactionStore) return;
    const provider = new FakeProvider();
    const { result, store } = await begin(provider);
    const nonce = new URL(result.authorizationUrl).searchParams.get("nonce");
    assert.ok(nonce);
    provider.identities.set("mismatch-code", verifiedIdentity({ ...overrides, nonce: overrides.nonce ?? nonce }));

    await assert.rejects(
      () =>
        oidc.completeOidcCallback!({
          provider,
          transactionStore: store,
          callback: { code: "mismatch-code", state: result.state },
          now: () => NOW,
        }),
      (error: unknown) => (error as { code?: string }).code === expectedCode,
    );

    await assert.rejects(
      () =>
        oidc.completeOidcCallback!({
          provider,
          transactionStore: store,
          callback: { code: "mismatch-code", state: result.state },
          now: () => NOW,
        }),
      (error: unknown) => (error as { code?: string }).code === "oidc_state_replayed",
    );
  });
}

test("restricts redirect targets to approved internal registration paths", async () => {
  if (!oidc.beginOidcAuthorization || !oidc.InMemoryOidcTransactionStore) return;
  const provider = new FakeProvider();
  const { result, store } = await begin(provider, NOW, "https://attacker.example/steal");
  const nonce = new URL(result.authorizationUrl).searchParams.get("nonce");
  assert.ok(nonce);
  provider.identities.set("safe-return-code", verifiedIdentity({ nonce }));
  const completed = await oidc.completeOidcCallback!({
    provider,
    transactionStore: store,
    callback: { code: "safe-return-code", state: result.state },
    now: () => NOW,
  });

  assert.equal(completed.returnTo, "/kayit");
  assert.equal(result.returnTo, "/kayit");
  assert.equal(result.authorizationUrl.includes("attacker.example"), false);
});
