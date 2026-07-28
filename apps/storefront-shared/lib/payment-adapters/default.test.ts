import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  IYZICO_IFRAME_PACKET,
  PAYTR_IFRAME_PACKET,
} from "@celebix/payment-adapters";

import {
  createDefaultHostedPaymentAdapterRegistry,
  createDefaultHostedPaymentRuntime,
  createStorefrontHostedPaymentCompiledAuthoritySelector,
  resolveStorefrontHostedPaymentActivationMode,
} from "./default.ts";

test("default storefront registry contains only the immutable PayTR and iyzico packets with their own adapters", () => {
  const transport = Object.freeze({
    request: Object.freeze(async () => {
      throw new Error("provider_transport_must_not_run_during_composition");
    }),
  });
  const registry = createDefaultHostedPaymentAdapterRegistry(transport);

  assert.equal(Object.isFrozen(registry), true);
  assert.equal(registry.size, 2);
  assert.strictEqual(registry.packet("paytr_iframe"), PAYTR_IFRAME_PACKET);
  assert.strictEqual(registry.packet("iyzico_iframe"), IYZICO_IFRAME_PACKET);
  assert.strictEqual(registry.adapter("paytr_iframe")?.packet, PAYTR_IFRAME_PACKET);
  assert.strictEqual(registry.adapter("iyzico_iframe")?.packet, IYZICO_IFRAME_PACKET);
  assert.notStrictEqual(registry.adapter("paytr_iframe"), registry.adapter("iyzico_iframe"));
  assert.equal(registry.packet("iyzico"), null);
  assert.equal(registry.adapter("paytr"), null);
});

test("storefront PayTR activation mode is exact and disabled by default", () => {
  assert.equal(resolveStorefrontHostedPaymentActivationMode({}), "disabled");
  assert.equal(
    resolveStorefrontHostedPaymentActivationMode({
      CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE: "approved_test_sandbox",
    }),
    "approved_test_sandbox",
  );
  for (const value of ["enabled", "approved_test_validation", " approved_test_sandbox", "approved_test_sandbox "]) {
    assert.equal(
      resolveStorefrontHostedPaymentActivationMode({
        CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE: value,
      }),
      "disabled",
    );
  }
});

test("storefront composition stays inert with verification readiness or null provider-keyed authorities", () => {
  let dependencyReads = 0;
  const dependencies = Object.defineProperties({}, {
    attempts: { enumerable: true, get() { dependencyReads += 1; throw new Error("attempts_must_not_be_read"); } },
    keyring: { enumerable: true, get() { dependencyReads += 1; throw new Error("keyring_must_not_be_read"); } },
    transport: { enumerable: true, get() { dependencyReads += 1; throw new Error("transport_must_not_be_read"); } },
    selectAuthority: { enumerable: true, get() { dependencyReads += 1; throw new Error("authority_must_not_be_read"); } },
    now: { enumerable: true, get() { dependencyReads += 1; throw new Error("clock_must_not_be_read"); } },
    randomBytes: { enumerable: true, get() { dependencyReads += 1; throw new Error("random_must_not_be_read"); } },
  });

  assert.equal(createDefaultHostedPaymentRuntime({
    source: { CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE: "approved_test_sandbox" },
    compiledAuthorities: Object.freeze({
      paytr_iframe: null,
      iyzico_iframe: null,
    }),
    dependencies,
  } as never), null);
  assert.equal(dependencyReads, 0);
});

test("storefront composition rejects non-exact authority maps before dependency access", () => {
  let dependencyReads = 0;
  const dependencies = new Proxy({}, {
    get() { dependencyReads += 1; throw new Error("dependencies_must_not_be_read"); },
  });
  const authority = Object.freeze({
    environment: "test" as const,
    adapterVersion: 1,
    evidenceDigest: `sha256:${"a".repeat(64)}`,
  });
  const candidates = [
    Object.freeze({ paytr_iframe: authority }),
    Object.freeze({ paytr_iframe: authority, iyzico_iframe: null, iyzico: authority }),
    Object.freeze({ paytr_iframe: authority, iyzico_iframe: Object.freeze({ ...authority, adapterVersion: 2 }) }),
    Object.defineProperty({ paytr_iframe: authority }, "iyzico_iframe", {
      enumerable: true,
      get() { throw new Error("authority_getter_must_not_run"); },
    }),
  ];
  for (const compiledAuthorities of candidates) {
    assert.equal(createDefaultHostedPaymentRuntime({
      source: { CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE: "approved_test_sandbox" },
      compiledAuthorities,
      dependencies,
    } as never), null);
  }
  assert.equal(dependencyReads, 0);
});

test("compiled authority selector clones and freezes provider-keyed evidence before later mutation", () => {
  const authority = {
    environment: "test" as const,
    adapterVersion: 1,
    evidenceDigest: `sha256:${"a".repeat(64)}`,
  };
  const selector = createStorefrontHostedPaymentCompiledAuthoritySelector({
    paytr_iframe: authority,
    iyzico_iframe: null,
  });
  assert.ok(selector);
  authority.evidenceDigest = `sha256:${"b".repeat(64)}`;
  const selected = selector("paytr_iframe");
  assert.deepEqual(selected, {
    providerCode: "paytr_iframe",
    environment: "test",
    adapterVersion: 1,
    evidenceDigest: `sha256:${"a".repeat(64)}`,
  });
  assert.equal(Object.isFrozen(selected), true);
  assert.equal(selector("iyzico_iframe"), null);
  assert.equal(selector("paytr"), null);
});

test("default storefront call site stages the real repository keyring and transport behind the dormant gate", async () => {
  const source = await readFile(new URL("../default-runtime.ts", import.meta.url), "utf8");
  assert.match(source, /PostgresPaymentAttemptRepository/);
  assert.match(source, /parseMerchantProviderCredentialKeyring/);
  assert.match(source, /createBoundedProviderTransport/);
  assert.match(source, /createDefaultHostedPaymentRuntime/);
  assert.match(source, /resolveStorefrontHostedPaymentActivationMode/);
  assert.match(source, /compiledHostedPaymentAuthorities/);
  assert.match(source, /payment_provider_keyed_lifecycle_preflight/);
  assert.match(
    source,
    /finally\s*\{[\s\S]*!runtimeOwnsKeyring[\s\S]*key[.]fill\(0\)/,
  );
  assert.doesNotMatch(source, /CELEBIX_PAYTR_EXECUTION_EVIDENCE_DIGEST/);
});
