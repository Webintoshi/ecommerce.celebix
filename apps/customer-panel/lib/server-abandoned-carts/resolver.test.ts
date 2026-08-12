import assert from "node:assert/strict";
import test from "node:test";

import type { AbandonedCartRepository } from "@celebix/saas-data";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import { createServerAbandonedCartRuntimeResolver } from "./resolver.ts";
import type { ServerAbandonedCartRuntime } from "./runtime.ts";

const KEY = Buffer.alloc(32, 0x41).toString("base64url");
const DATABASE_URL = "postgresql://runtime:test-placeholder@postgres.internal/celebix_saas_staging_auth?sslmode=require";

function approvedEnvironment() {
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

function runtime(): ServerAbandonedCartRuntime {
  const access = Object.freeze({
    readiness: Object.freeze({ mode: "approved_staging" as const }),
    panelOrigin: "https://staging-panel.celebix.site",
    async resolveCredential() { return Object.freeze({ kind: "unauthenticated" as const }); },
    async rotateCredential() { return Object.freeze({ kind: "unavailable" as const }); },
    async revokeCredential() { return Object.freeze({ kind: "unavailable" as const }); },
  }) as ServerPanelAccessRuntime & Readonly<{
    readiness: Readonly<{ mode: "approved_staging" }>;
    panelOrigin: string;
  }>;
  const unused = async () => { throw new Error("unused"); };
  const abandonedCarts: AbandonedCartRepository = Object.freeze({
    getSummary: unused,
    list: unused,
    get: unused,
    markRecovered: unused,
    archive: unused,
  });
  return Object.freeze({ access, abandonedCarts });
}

test("approved staging initializes the isolated abandoned-cart runtime once", async () => {
  const source = approvedEnvironment();
  const expected = runtime();
  let initialized = 0;
  const resolver = createServerAbandonedCartRuntimeResolver({
    source,
    async initialize(config) {
      initialized += 1;
      assert.equal(config.authority.panelOrigin, "https://staging-panel.celebix.site");
      return expected;
    },
    diagnostic() {},
  });

  assert.equal(await resolver.resolve(), expected);
  source.CELEBIX_PANEL_ORIGIN = "https://attacker.example";
  assert.equal(await resolver.resolve(), expected);
  assert.equal(initialized, 1);
});

test("disabled and malformed authority do not initialize abandoned-cart storage", async () => {
  for (const source of [
    {},
    { ...approvedEnvironment(), CELEBIX_DEPLOYMENT_TIER: "production" },
    { ...approvedEnvironment(), CELEBIX_SESSION_KEY_B64URL: "not-a-key" },
  ]) {
    let initialized = 0;
    const resolver = createServerAbandonedCartRuntimeResolver({
      source,
      async initialize() { initialized += 1; return runtime(); },
      diagnostic() {},
    });
    assert.equal(await resolver.resolve(), null);
    assert.equal(initialized, 0);
  }
});

test("initialization failure is memoized as unavailable without leaking the cause", async () => {
  const diagnostics: string[] = [];
  let initialized = 0;
  const resolver = createServerAbandonedCartRuntimeResolver({
    source: approvedEnvironment(),
    async initialize() {
      initialized += 1;
      throw new Error("postgresql://runtime:staging-secret@database");
    },
    diagnostic(code) { diagnostics.push(code); },
  });

  assert.equal(await resolver.resolve(), null);
  assert.equal(await resolver.resolve(), null);
  assert.equal(initialized, 1);
  assert.deepEqual(diagnostics, ["server_abandoned_cart_runtime_initialization_failed"]);
  assert.equal(JSON.stringify(diagnostics).includes("staging-secret"), false);
});
