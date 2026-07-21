import assert from "node:assert/strict";
import test from "node:test";

import type { QuickOrderLinkRepository, QuickOrderPrivateRepository } from "@celebix/saas-data";

import { registerServerQuickLinksRuntime, resolveServerQuickLinksRuntime } from "./runtime.ts";

const reject = async () => { throw new Error("unused"); };

function access() {
  return {
    readiness: Object.freeze({ mode: "approved_staging" as const }),
    panelOrigin: "https://panel.saas-staging.celebix.site",
    resolveCredential: reject,
    rotateCredential: reject,
    revokeCredential: reject,
  } as never;
}

function disabled() {
  return {
    readiness: Object.freeze({ mode: "disabled" as const }),
    panelOrigin: null,
    resolveCredential: reject,
    rotateCredential: reject,
    revokeCredential: reject,
  } as never;
}

function links(): QuickOrderLinkRepository {
  return { list: reject, get: reject, create: reject, cancel: reject, duplicate: reject };
}

function privateLinks(): QuickOrderPrivateRepository {
  return {
    getProviderReadiness: reject,
    configureProvider: reject,
    revokeProvider: reject,
    revealLinkCredential: reject,
    revealProviderConfiguration: reject,
  };
}

const keyring = Object.freeze({
  activeKeyId: "quick.current",
  keys: Object.freeze([{ keyId: "quick.current", key: new Uint8Array(32).fill(7) }]),
});
const paytrConfiguration = Object.freeze({
  version: 1 as const,
  merchantId: "merchant-id",
  merchantKey: "merchant-key",
  merchantSalt: "merchant-salt",
  callbackUrl: "https://shop.example/api/payments/paytr/callback",
  testMode: 1 as const,
});

test("registers a private facade only against an approved access runtime", () => {
  const authority = access();
  registerServerQuickLinksRuntime(authority, { links: links(), privateLinks: privateLinks(), keyring, paytrConfiguration });
  const runtime = resolveServerQuickLinksRuntime(authority);
  assert.ok(runtime);
  assert.equal(runtime.access, authority);
  assert.deepEqual(Object.keys(runtime.links).sort(), ["cancel", "create", "duplicate", "get", "list"]);
  assert.deepEqual(Object.keys(runtime.privateLinks).sort(), [
    "configureProvider", "getProviderReadiness", "revealLinkCredential", "revealProviderConfiguration", "revokeProvider",
  ]);
  assert.equal(runtime.keyring, keyring);
  assert.equal(runtime.paytrConfiguration, paytrConfiguration);
  assert.equal(Object.isFrozen(runtime), true);
});

test("disabled and unregistered access runtimes resolve to null", () => {
  assert.equal(resolveServerQuickLinksRuntime(disabled()), null);
  assert.equal(resolveServerQuickLinksRuntime(access()), null);
});

test("rejects registration for disabled access and duplicate registration", () => {
  const dependencies = { links: links(), privateLinks: privateLinks(), keyring, paytrConfiguration };
  assert.throws(() => registerServerQuickLinksRuntime(disabled(), dependencies));
  const authority = access();
  registerServerQuickLinksRuntime(authority, dependencies);
  assert.throws(() => registerServerQuickLinksRuntime(authority, dependencies));
});

test("rejects incomplete repositories and invalid private configuration", () => {
  const authority = access();
  assert.throws(() => registerServerQuickLinksRuntime(authority, {
    links: { ...links(), create: undefined }, privateLinks: privateLinks(), keyring, paytrConfiguration,
  } as never));
  assert.throws(() => registerServerQuickLinksRuntime(access(), {
    links: links(), privateLinks: privateLinks(), keyring: { activeKeyId: "missing", keys: [] }, paytrConfiguration,
  } as never));
});
