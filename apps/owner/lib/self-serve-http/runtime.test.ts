import assert from "node:assert/strict";
import test from "node:test";

type RuntimeModule = typeof import("./runtime.ts");

const runtimeModule = await import(new URL("./runtime.ts", import.meta.url).href).catch(
  () => ({} as Partial<RuntimeModule>),
);

function dependencyOptions(activationApproval: unknown) {
  return {
    activationApproval,
    registrationAttemptStore: {
      async save() {},
      async consume() { throw new Error("not used"); },
    },
    oidcTransactionStore: {
      async save() {},
      async consume() { throw new Error("not used"); },
      async discard() {},
    },
    registrationCompletion: {
      async recordVerifiedIdentity() {
        return { kind: "identity_recorded", status: "identity_verified", version: 2 } as const;
      },
      async resumeTenantCreation() {
        return { kind: "in_progress" } as const;
      },
      async reconcileUnknownCommit() {
        return { kind: "pending" } as const;
      },
    },
    oidcProvider: {
      buildAuthorizationUrl() { throw new Error("not used"); },
      async verifyCallback() { throw new Error("not used"); },
    },
    requestGate: {
      async verify() { return "allowed" as const; },
    },
    clock: () => new Date("2026-07-13T12:00:00.000Z"),
    audit() {},
    bodyPolicy: { maximumBytes: 4_096, maximumCallbackQueryBytes: 2_048 },
    callbackAuthority: "https://panel.celebix.site/auth/callback",
    panelOrigin: "https://panel.celebix.site",
    platformDomainSuffix: "celebix.site",
    providerAuthority: {
      issuer: "https://identity.example.test/oidc",
      audience: "customer-panel",
      authorizationOrigin: "https://identity.example.test",
    },
  };
}

test("exports only explicit disabled and approved persistent HTTP runtime factories", () => {
  assert.equal(typeof runtimeModule.createDisabledSelfServeRuntime, "function");
  assert.equal(typeof runtimeModule.createSelfServeHttpActivationApproval, "function");
  assert.equal(typeof runtimeModule.createPersistentSelfServeRuntime, "function");
  assert.equal(typeof runtimeModule.assertPersistentSelfServeRuntime, "function");
});

test("default runtime is disabled and environment values cannot activate dependencies", () => {
  assert.ok(runtimeModule.createDisabledSelfServeRuntime);
  const prior = process.env.SELF_SERVE_SAAS_REGISTRATION_ENABLED;
  process.env.SELF_SERVE_SAAS_REGISTRATION_ENABLED = "true";
  try {
    const runtime = runtimeModule.createDisabledSelfServeRuntime();
    assert.deepEqual(runtime, { kind: "disabled" });
    assert.equal(Object.isFrozen(runtime), true);
  } finally {
    if (prior === undefined) delete process.env.SELF_SERVE_SAAS_REGISTRATION_ENABLED;
    else process.env.SELF_SERVE_SAAS_REGISTRATION_ENABLED = prior;
  }
});

test("activation approval is sealed, frozen, non-serializable authority with no production value", () => {
  assert.ok(runtimeModule.createSelfServeHttpActivationApproval);
  assert.ok(runtimeModule.createPersistentSelfServeRuntime);
  const approval = runtimeModule.createSelfServeHttpActivationApproval("disposable_test");
  assert.equal(Object.isFrozen(approval), true);
  assert.equal(Object.isSealed(approval), true);
  assert.deepEqual(Object.keys(approval).sort(), [
    "environment",
    "providerNetworking",
    "purpose",
    "registration",
    "sessions",
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(approval)), {
    purpose: "phase2b1b2a_self_serve_http_wiring",
    environment: "disposable_test",
    registration: "disabled_public_activation",
    sessions: "forbidden",
    providerNetworking: "injected_only",
  });

  const options = dependencyOptions(approval);
  assert.equal(runtimeModule.createPersistentSelfServeRuntime(options).kind, "persistent");
  assert.throws(
    () => runtimeModule.createPersistentSelfServeRuntime(dependencyOptions({ ...approval })),
    /self_serve_http_activation_not_approved/,
  );
  assert.throws(
    () => runtimeModule.createPersistentSelfServeRuntime(dependencyOptions(JSON.parse(JSON.stringify(approval)))),
    /self_serve_http_activation_not_approved/,
  );
  assert.throws(
    () => runtimeModule.createSelfServeHttpActivationApproval("production" as never),
    /self_serve_http_activation_not_approved/,
  );
});

test("persistent runtime exposes narrow operations without raw database, query, keys, or generic fetch", () => {
  assert.ok(runtimeModule.createSelfServeHttpActivationApproval);
  assert.ok(runtimeModule.createPersistentSelfServeRuntime);
  const runtime = runtimeModule.createPersistentSelfServeRuntime(
    dependencyOptions(runtimeModule.createSelfServeHttpActivationApproval("approved_staging")),
  );
  const keys = Reflect.ownKeys(runtime).map(String);
  for (const required of [
    "kind",
    "bodyPolicy",
    "callbackAuthority",
    "panelOrigin",
    "platformDomainSuffix",
    "verifyRequest",
    "beginRegistration",
    "completeCallback",
    "rejectProviderCallback",
    "audit",
  ]) assert.equal(keys.includes(required), true, `missing narrow runtime operation ${required}`);
  for (const prohibited of [
    "pool",
    "client",
    "query",
    "encryptionKey",
    "hmacKey",
    "providerSecret",
    "fetch",
    "registrationAttemptStore",
    "oidcTransactionStore",
    "registrationCompletion",
    "oidcProvider",
  ]) assert.equal(keys.includes(prohibited), false, `runtime exposed ${prohibited}`);
  assert.equal(Object.isFrozen(runtime), true);
  assert.doesNotThrow(() => runtimeModule.assertPersistentSelfServeRuntime(runtime));
  assert.throws(
    () => runtimeModule.assertPersistentSelfServeRuntime({ ...runtime } as never),
    /self_serve_http_activation_not_approved/,
  );
});

test("runtime rejects browser-sized authority expansion and invalid server authorities before dependency use", () => {
  assert.ok(runtimeModule.createSelfServeHttpActivationApproval);
  assert.ok(runtimeModule.createPersistentSelfServeRuntime);
  const approval = runtimeModule.createSelfServeHttpActivationApproval("disposable_test");
  for (const override of [
    { bodyPolicy: { maximumBytes: 0, maximumCallbackQueryBytes: 2_048 } },
    { bodyPolicy: { maximumBytes: 16_385, maximumCallbackQueryBytes: 2_048 } },
    { bodyPolicy: { maximumBytes: 4_096, maximumCallbackQueryBytes: 0 } },
    { callbackAuthority: "http://panel.celebix.site/auth/callback" },
    { callbackAuthority: "https://attacker.example/auth/callback" },
    { panelOrigin: "https://panel.celebix.site/path" },
    { platformDomainSuffix: "CELEBIX.SITE" },
    { providerAuthority: { issuer: "", audience: "customer-panel", authorizationOrigin: "https://identity.example.test" } },
  ]) {
    assert.throws(
      () => runtimeModule.createPersistentSelfServeRuntime({ ...dependencyOptions(approval), ...override } as never),
      /self_serve_http_runtime_invalid/,
    );
  }
});
