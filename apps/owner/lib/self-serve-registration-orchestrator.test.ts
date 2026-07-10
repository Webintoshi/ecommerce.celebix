import assert from "node:assert/strict";
import test from "node:test";

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
  assert.equal(attempts.saved?.status, "awaiting_identity");
  assert.match(attempts.saved?.canonicalFingerprint ?? "", /cicek-pazari/);
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
