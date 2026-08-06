import assert from "node:assert/strict";
import test from "node:test";

import {
  createServerPanelAccessRuntimeResolver,
  type ServerPanelAccessRuntime,
} from "./resolver.ts";

const KEY = Buffer.alloc(32, 0x41).toString("base64url");
const DATABASE_URL = [
  "postgresql://runtime:",
  "test-placeholder",
  "@postgres.internal/celebix_saas_staging_auth?sslmode=require",
].join("");

function validEnvironment() {
  return {
    CELEBIX_SAAS_AUTH_MODE: "approved_staging",
    CELEBIX_DEPLOYMENT_TIER: "staging",
    CELEBIX_STAGING_ACTIVATION_ID: "staging_auth0101",
    CELEBIX_OWNER_ORIGIN: "https://staging-owner.celebix.site",
    CELEBIX_PANEL_ORIGIN: "https://staging-panel.celebix.site",
    CELEBIX_PLATFORM_DOMAIN_SUFFIX: "staging.celebix.site",
    CELEBIX_SAAS_DATABASE_URL: DATABASE_URL,
    CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_staging_auth",
    CELEBIX_BROWSER_INTERNAL_KEY_ID: "browser.v1",
    CELEBIX_BROWSER_INTERNAL_KEY_B64URL: KEY,
    CELEBIX_CALLBACK_INTERNAL_KEY_ID: "callback.v1",
    CELEBIX_CALLBACK_INTERNAL_KEY_B64URL: KEY,
    CELEBIX_HANDOFF_KEY_ID: "handoff.v1",
    CELEBIX_HANDOFF_KEY_B64URL: KEY,
    CELEBIX_SESSION_KEY_ID: "session.v1",
    CELEBIX_SESSION_KEY_B64URL: KEY,
    CELEBIX_LOGTO_END_SESSION_ENDPOINT: "https://auth.celebix.co/oidc/session/end",
    CELEBIX_LOGTO_CLIENT_ID: "celebix-panel",
  };
}

function runtime(mode: ServerPanelAccessRuntime["readiness"]["mode"]): ServerPanelAccessRuntime {
  return Object.freeze({
    readiness: Object.freeze({ mode }),
    panelOrigin: mode === "approved_staging" ? "https://staging-panel.celebix.site" : null,
    async resolveCredential() { return Object.freeze({ kind: "unauthenticated" as const }); },
    async rotateCredential() { return Object.freeze({ kind: "unavailable" as const }); },
    async revokeCredential() { return Object.freeze({ kind: "unavailable" as const }); },
  });
}

test("default, absent, production, and mixed authority configurations remain disabled", async () => {
  for (const source of [
    {},
    { CELEBIX_SAAS_AUTH_MODE: "disabled", CELEBIX_DEPLOYMENT_TIER: "staging" },
    { ...validEnvironment(), CELEBIX_DEPLOYMENT_TIER: "production" },
    { ...validEnvironment(), CELEBIX_PANEL_ORIGIN: "https://panel.celebix.site" },
  ]) {
    let initialized = 0;
    const resolver = createServerPanelAccessRuntimeResolver({
      source,
      disabled: () => runtime("disabled"),
      unavailable: () => runtime("unavailable"),
      async initialize() { initialized += 1; return runtime("approved_staging"); },
      diagnostic() {},
    });
    assert.equal((await resolver.resolve()).readiness.mode, "disabled");
    assert.equal(initialized, 0);
  }
});

test("one exact approved-staging snapshot activates once and is immutable from later environment changes", async () => {
  const source = validEnvironment();
  let initialized = 0;
  let captured: unknown;
  const resolver = createServerPanelAccessRuntimeResolver({
    source,
    disabled: () => runtime("disabled"),
    unavailable: () => runtime("unavailable"),
    async initialize(config) {
      initialized += 1;
      captured = config;
      return runtime("approved_staging");
    },
    diagnostic() {},
  });
  const first = await resolver.resolve();
  source.CELEBIX_PANEL_ORIGIN = "https://attacker.example";
  const second = await resolver.resolve();
  assert.equal(first, second);
  assert.equal(first.readiness.mode, "approved_staging");
  assert.equal(initialized, 1);
  assert.equal((captured as { authority: { panelOrigin: string } }).authority.panelOrigin, "https://staging-panel.celebix.site");
});

test("malformed exact staging activation remains disabled without a fallback", async () => {
  const diagnostics: string[] = [];
  const resolver = createServerPanelAccessRuntimeResolver({
    source: { ...validEnvironment(), CELEBIX_SESSION_KEY_B64URL: "not-a-key" },
    disabled: () => runtime("disabled"),
    unavailable: () => runtime("unavailable"),
    async initialize() { throw new Error("must not initialize malformed configuration"); },
    diagnostic(code) { diagnostics.push(code); },
  });
  assert.equal((await resolver.resolve()).readiness.mode, "disabled");
  assert.deepEqual(diagnostics, ["server_panel_access_initialization_failed"]);
});

test("a database/runtime initialization failure is memoized as controlled unavailable", async () => {
  let initialized = 0;
  const diagnostics: string[] = [];
  const resolver = createServerPanelAccessRuntimeResolver({
    source: validEnvironment(),
    disabled: () => runtime("disabled"),
    unavailable: () => runtime("unavailable"),
    async initialize() { initialized += 1; throw new Error("database credentials must be redacted"); },
    diagnostic(code) { diagnostics.push(code); },
  });
  assert.equal((await resolver.resolve()).readiness.mode, "unavailable");
  assert.equal((await resolver.resolve()).readiness.mode, "unavailable");
  assert.equal(initialized, 1);
  assert.deepEqual(diagnostics, ["server_panel_access_initialization_failed"]);
  assert.equal(JSON.stringify(diagnostics).includes("database credentials"), false);
});

test("a known initialization failure emits its safe diagnostic without exposing arbitrary errors", async () => {
  const diagnostics: string[] = [];
  const resolver = createServerPanelAccessRuntimeResolver({
    source: validEnvironment(),
    disabled: () => runtime("disabled"),
    unavailable: () => runtime("unavailable"),
    async initialize() { throw new Error("server_panel_access_database_contract_preflight_failed"); },
    diagnostic(code) { diagnostics.push(code); },
  });

  assert.equal((await resolver.resolve()).readiness.mode, "unavailable");
  assert.deepEqual(diagnostics, ["server_panel_access_database_contract_preflight_failed"]);
});

test("a contract field diagnostic is preserved without admitting arbitrary error messages", async () => {
  const diagnostics: string[] = [];
  const resolver = createServerPanelAccessRuntimeResolver({
    source: validEnvironment(),
    disabled: () => runtime("disabled"),
    unavailable: () => runtime("unavailable"),
    async initialize() { throw new Error("server_panel_access_database_contract_preflight_failed:shipping_repository"); },
    diagnostic(code) { diagnostics.push(code); },
  });

  assert.equal((await resolver.resolve()).readiness.mode, "unavailable");
  assert.deepEqual(diagnostics, ["server_panel_access_database_contract_preflight_failed:shipping_repository"]);
});
