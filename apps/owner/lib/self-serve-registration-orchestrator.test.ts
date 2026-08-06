import assert from "node:assert/strict";
import test from "node:test";
import { rootCertificates } from "node:tls";

import type {
  RegistrationAttempt,
  RegistrationAttemptStore,
  RegistrationOidcPort,
} from "./self-serve-registration-orchestrator";
import type { SelfServeRegistrationInput } from "./self-serve-registration";

type OrchestratorModule = typeof import("./self-serve-registration-orchestrator");
const orchestration = await import(
  new URL("./self-serve-registration-orchestrator.ts", import.meta.url).href
).catch(() => ({} as Partial<OrchestratorModule>));

const registration: SelfServeRegistrationInput = {
  firstName: "Ada",
  lastName: "Lovelace",
  storeName: "Çiçek Pazarı",
  storeSlug: "cicek-pazari",
  phone: "+905551112233",
  email: "ada@example.test",
  password: "IdentityProviderOnly!",
  marketingConsent: false,
  privacyConsent: true,
};

const stagingKey = (byte: number) => Buffer.alloc(32, byte).toString("base64url");
const stagingDatabaseCredential = ["staging_runtime", "password"].join(":");

function approvedStagingEnvironment(): Record<string, string | undefined> {
  return {
    CELEBIX_SAAS_AUTH_MODE: "approved_staging",
    CELEBIX_DEPLOYMENT_TIER: "staging",
    CELEBIX_STAGING_ACTIVATION_ID: "staging_20260716_c3a",
    CELEBIX_OWNER_ORIGIN: "https://owner.c3a-staging.example.test",
    CELEBIX_PANEL_ORIGIN: "https://panel.c3a-staging.example.test",
    CELEBIX_PLATFORM_DOMAIN_SUFFIX: "shops.c3a-staging.example.test",
    CELEBIX_SAAS_DATABASE_URL:
      `postgresql://${stagingDatabaseCredential}@db.c3a-staging.example.test:5432/celebix_saas_staging_c3a?sslmode=verify-full`,
    CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_staging_c3a",
    CELEBIX_STAGING_DB_CA_B64: Buffer.from(rootCertificates[0], "utf8").toString("base64"),
    CELEBIX_LOGTO_ISSUER: "https://identity.c3a-staging.example.test/oidc",
    CELEBIX_LOGTO_DISCOVERY_URL:
      "https://identity.c3a-staging.example.test/oidc/.well-known/openid-configuration",
    CELEBIX_LOGTO_CLIENT_ID: "celebix-c3a-staging-owner",
    CELEBIX_LOGTO_CLIENT_SECRET: "staging-client-secret",
    CELEBIX_LOGTO_TOKEN_AUTH_METHOD: "client_secret_basic",
    CELEBIX_LOGTO_ID_TOKEN_ALGS: "ES384",
    CELEBIX_IDENTITY_HMAC_KEY_B64URL: stagingKey(1),
    CELEBIX_IDENTITY_ENCRYPTION_KEY_ID: "identity.c3a.staging.v1",
    CELEBIX_IDENTITY_ENCRYPTION_KEY_B64URL: stagingKey(2),
    CELEBIX_BROWSER_BOOTSTRAP_KEY_ID: "browser.bootstrap.c3a.staging.v1",
    CELEBIX_BROWSER_BOOTSTRAP_KEY_B64URL: stagingKey(3),
    CELEBIX_BROWSER_BINDING_KEY_ID: "browser.binding.c3a.staging.v1",
    CELEBIX_BROWSER_BINDING_KEY_B64URL: stagingKey(4),
    CELEBIX_BROWSER_INTERNAL_KEY_ID: "browser.internal.c3a.staging.v1",
    CELEBIX_BROWSER_INTERNAL_KEY_B64URL: stagingKey(5),
    CELEBIX_CALLBACK_INTERNAL_KEY_ID: "callback.internal.c3a.staging.v1",
    CELEBIX_CALLBACK_INTERNAL_KEY_B64URL: stagingKey(6),
    CELEBIX_HANDOFF_KEY_ID: "handoff.c3a.staging.v1",
    CELEBIX_HANDOFF_KEY_B64URL: stagingKey(7),
    CELEBIX_SESSION_KEY_ID: "session.c3a.staging.v1",
    CELEBIX_SESSION_KEY_B64URL: stagingKey(8),
  };
}

class RecordingAttemptStore implements RegistrationAttemptStore {
  saved: RegistrationAttempt | null = null;
  async save(attempt: RegistrationAttempt) { this.saved = structuredClone(attempt); }
  async consume(state: string) {
    if (!this.saved || this.saved.state !== state) throw new Error("missing attempt");
    return structuredClone(this.saved);
  }
}

function oidcPort(overrides: Partial<RegistrationOidcPort> = {}): RegistrationOidcPort {
  return {
    async begin() {
      return {
        state: "opaque_state_123",
        authorizationUrl: "https://identity.example.test/authorize?state=opaque_state_123&code_challenge=challenge",
        expiresAt: "2026-07-11T10:10:00.000Z",
      };
    },
    async cancel() {},
    ...overrides,
  };
}

test("Owner exports only registration start; panel owns completion and session establishment", () => {
  assert.equal(typeof orchestration.beginSelfServeRegistration, "function");
  assert.equal("completeSelfServeRegistration" in orchestration, false);
  assert.equal("PanelSession" in orchestration, false);
});

test("registration UI enables only for the exact strict approved-staging configuration", () => {
  assert.equal(
    orchestration.resolveSelfServeRegistrationUiEnabled?.(approvedStagingEnvironment()),
    true,
  );
});

test("registration UI fails closed for absent, partial, malformed, production, and mixed authority", () => {
  const exact = approvedStagingEnvironment();
  const partial = { ...exact };
  delete partial.CELEBIX_LOGTO_CLIENT_SECRET;

  for (const source of [
    {},
    { CELEBIX_SAAS_AUTH_MODE: "approved_staging", CELEBIX_DEPLOYMENT_TIER: "staging" },
    partial,
    { ...exact, CELEBIX_STAGING_ACTIVATION_ID: "invalid" },
    { ...exact, CELEBIX_DEPLOYMENT_TIER: "production" },
    { ...exact, CELEBIX_SAAS_AUTH_MODE: "production" },
    { ...exact, CELEBIX_OWNER_ORIGIN: "https://ecommerce.celebix.co" },
    { ...exact, CELEBIX_PANEL_ORIGIN: "https://panel.celebix.site" },
  ]) {
    assert.equal(orchestration.resolveSelfServeRegistrationUiEnabled?.(source), false);
  }
});

test("browser and proxy-controlled values cannot enable the registration UI", () => {
  assert.equal(orchestration.resolveSelfServeRegistrationUiEnabled?.({
    NODE_ENV: "production",
    HOST: "owner.c3a-staging.example.test",
    ORIGIN: "https://owner.c3a-staging.example.test",
    REFERER: "https://owner.c3a-staging.example.test/kayit",
    FORWARDED: "host=owner.c3a-staging.example.test;proto=https",
    X_FORWARDED_HOST: "owner.c3a-staging.example.test",
    QUERY: "CELEBIX_SAAS_AUTH_MODE=approved_staging",
    COOKIE: "CELEBIX_DEPLOYMENT_TIER=staging",
  }), false);
});

test("registration UI configuration read failures fail closed without exposing configuration", () => {
  const exact = approvedStagingEnvironment();
  const source = new Proxy(exact, {
    get(target, property, receiver) {
      if (property === "CELEBIX_LOGTO_CLIENT_SECRET") throw new Error("configuration unavailable");
      return Reflect.get(target, property, receiver);
    },
  });
  const result = orchestration.resolveSelfServeRegistrationUiEnabled?.(source);
  assert.equal(result, false);
  assert.equal(typeof result, "boolean");
  assert.equal(JSON.stringify(result).includes(exact.CELEBIX_LOGTO_CLIENT_SECRET ?? ""), false);
});

test("production-disabled begin never calls OIDC and returns an explicit disabled state", async () => {
  if (!orchestration.beginSelfServeRegistration) return;
  let called = false;
  const result = await orchestration.beginSelfServeRegistration({
    enabled: false,
    registration,
    oidc: oidcPort({ begin: async () => { called = true; throw new Error("must not run"); } }),
    attemptStore: new RecordingAttemptStore(),
  });
  assert.deepEqual(result, {
    ok: false,
    state: "disabled",
    code: "self_serve_saas_registration_disabled",
    status: 503,
  });
  assert.equal(called, false);
});

test("valid input stores one safe immutable attempt before awaiting identity", async () => {
  if (!orchestration.beginSelfServeRegistration) return;
  const attempts = new RecordingAttemptStore();
  const result = await orchestration.beginSelfServeRegistration({
    enabled: true,
    registration,
    oidc: oidcPort(),
    attemptStore: attempts,
    now: () => new Date("2026-07-11T10:00:00.000Z"),
  });
  assert.equal(result.ok, true);
  assert.equal(attempts.saved?.details.storeSlug, "cicek-pazari");
  assert.match(attempts.saved?.id ?? "", /^attempt_[A-Za-z0-9_-]{20,}$/);
  assert.match(attempts.saved?.idempotencyKey ?? "", /^ssik_[A-Za-z0-9_-]{20,}$/);
  assert.equal(attempts.saved?.idempotencyKey, attempts.saved?.idempotencyKey.trim());
  assert.equal((attempts.saved?.idempotencyKey.length ?? 129) <= 128, true);
  assert.equal(attempts.saved?.requestedAt, "2026-07-11T10:00:00.000Z");
  assert.equal(attempts.saved?.createdAt, attempts.saved?.requestedAt);
  assert.equal(attempts.saved?.status, "awaiting_identity");
  assert.equal(attempts.saved?.canonicalFingerprint, undefined);
  const persisted = JSON.stringify(attempts.saved);
  for (const prohibited of [registration.password, registration.email, registration.phone]) {
    assert.equal(persisted.includes(prohibited), false);
  }
});

test("attempt persistence failure cancels the OIDC state", async () => {
  if (!orchestration.beginSelfServeRegistration) return;
  let cancelled = "";
  const result = await orchestration.beginSelfServeRegistration({
    enabled: true,
    registration,
    oidc: oidcPort({ cancel: async (state) => { cancelled = state; } }),
    attemptStore: {
      async save() { throw new Error("attempt write failed"); },
      async consume() { throw new Error("must not consume"); },
    },
    now: () => new Date("2026-07-11T10:00:00.000Z"),
  });
  assert.equal(result.ok, false);
  assert.equal(cancelled, "opaque_state_123");
});

test("registration start never reads browser email or password authority", async () => {
  if (!orchestration.beginSelfServeRegistration) return;
  const browserInput = { ...registration };
  Object.defineProperties(browserInput, {
    email: { get() { throw new Error("browser email must not be read"); } },
    password: { get() { throw new Error("browser password must not be read"); } },
  });
  const result = await orchestration.beginSelfServeRegistration({
    enabled: true,
    registration: browserInput,
    oidc: oidcPort(),
    attemptStore: new RecordingAttemptStore(),
    now: () => new Date("2026-07-11T10:00:00.000Z"),
  });
  assert.equal(result.ok, true);
});
