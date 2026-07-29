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
import * as storefrontPaymentDefaults from "./default.ts";

const IYZICO_CANDIDATE = Object.freeze({
  buildMetadataSchemaVersion: 1,
  evidenceSchemaVersion: 1,
  providerCode: "iyzico_iframe",
  capability: "payment_processing",
  environment: "test",
  adapterVersion: 1,
  gitSha: "1".repeat(40),
  sourceDigest: `sha256:${"2".repeat(64)}`,
  candidateExecutionDigest: "sha256:7ecaafb855013a97aa62097126f9ab30b791c805e0b84104a74d67dd19e972cd",
} as const);
const IYZICO_AUTHORITY = Object.freeze({
  environment: "test",
  adapterVersion: 1,
  evidenceDigest: IYZICO_CANDIDATE.candidateExecutionDigest,
} as const);

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

test("storefront activation flags are provider-keyed so PayTR cannot enable Iyzico", () => {
  const resolve = resolveStorefrontHostedPaymentActivationMode as (
    source: Readonly<Record<string, string | undefined>>,
    providerCode: "paytr_iframe" | "iyzico_iframe",
  ) => "disabled" | "approved_test_sandbox";
  assert.equal(resolve({
    CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE: "approved_test_sandbox",
  }, "iyzico_iframe"), "disabled");
  assert.equal(resolve({
    CELEBIX_IYZICO_IFRAME_STOREFRONT_MODE: "approved_test_sandbox",
  }, "iyzico_iframe"), "approved_test_sandbox");
  assert.equal(resolve({
    CELEBIX_IYZICO_IFRAME_STOREFRONT_MODE: "approved_test_sandbox",
  }, "paytr_iframe"), "disabled");
});

test("Iyzico compiled authority exists only for an exact self-consistent candidate and matching approval", () => {
  const candidate = storefrontPaymentDefaults as typeof storefrontPaymentDefaults & {
    resolveIyzicoCompiledExecutionAuthority?: (
      approved?: unknown,
      generated?: unknown,
    ) => Readonly<typeof IYZICO_AUTHORITY> | null;
  };
  assert.equal(typeof candidate.resolveIyzicoCompiledExecutionAuthority, "function");
  const resolve = candidate.resolveIyzicoCompiledExecutionAuthority!;
  assert.equal(resolve(), null);
  assert.equal(resolve(null, IYZICO_CANDIDATE), null);
  assert.equal(resolve(IYZICO_AUTHORITY, null), null);
  const selected = resolve(IYZICO_AUTHORITY, IYZICO_CANDIDATE);
  assert.deepEqual(selected, IYZICO_AUTHORITY);
  assert.notStrictEqual(selected, IYZICO_AUTHORITY);
  assert.equal(Object.isFrozen(selected), true);

  const hostileCandidates = [
    { ...IYZICO_CANDIDATE, providerCode: "paytr_iframe" },
    { ...IYZICO_CANDIDATE, environment: "live" },
    { ...IYZICO_CANDIDATE, adapterVersion: 2 },
    { ...IYZICO_CANDIDATE, candidateExecutionDigest: `sha256:${"3".repeat(64)}` },
    { ...IYZICO_CANDIDATE, unexpected: true },
    new Proxy({ ...IYZICO_CANDIDATE }, {}),
  ];
  for (const generated of hostileCandidates) {
    assert.equal(resolve(IYZICO_AUTHORITY, generated), null);
  }
  assert.equal(resolve({ ...IYZICO_AUTHORITY, evidenceDigest: `sha256:${"4".repeat(64)}` }, IYZICO_CANDIDATE), null);
  assert.equal(resolve({ ...IYZICO_AUTHORITY, unexpected: true }, IYZICO_CANDIDATE), null);
});

test("default compiled authority map stays null in source control and promotes only the exact future Iyzico binding", () => {
  const candidate = storefrontPaymentDefaults as typeof storefrontPaymentDefaults & {
    createDefaultStorefrontHostedPaymentCompiledAuthorities?: (
      approved?: unknown,
      generated?: unknown,
    ) => Readonly<{
      paytr_iframe: null;
      iyzico_iframe: Readonly<typeof IYZICO_AUTHORITY> | null;
    }>;
  };
  assert.equal(typeof candidate.createDefaultStorefrontHostedPaymentCompiledAuthorities, "function");
  const createAuthorities = candidate.createDefaultStorefrontHostedPaymentCompiledAuthorities!;
  assert.deepEqual(createAuthorities(), { paytr_iframe: null, iyzico_iframe: null });
  const selected = createAuthorities(IYZICO_AUTHORITY, IYZICO_CANDIDATE);
  assert.deepEqual(selected, { paytr_iframe: null, iyzico_iframe: IYZICO_AUTHORITY });
  assert.equal(Object.isFrozen(selected), true);
  assert.equal(Object.isFrozen(selected.iyzico_iframe), true);
});

test("storefront runtime requires the matching provider flag for a compiled Iyzico authority", () => {
  const dependencies = Object.freeze({
    attempts: Object.freeze({}),
    keyring: Object.freeze({}),
    transport: Object.freeze({
      request: Object.freeze(async () => {
        throw new Error("provider_transport_must_not_run_during_composition");
      }),
    }),
    selectAuthority: Object.freeze(() => Object.freeze({ kind: "untrusted" })),
    matchesCompiledAuthority: Object.freeze(async () => false),
    now: Object.freeze(() => new Date("2026-07-28T00:00:00.000Z")),
    randomBytes: Object.freeze((size: number) => new Uint8Array(size)),
  });
  const compiledAuthorities = Object.freeze({
    paytr_iframe: null,
    iyzico_iframe: IYZICO_AUTHORITY,
  });
  assert.equal(createDefaultHostedPaymentRuntime({
    source: { CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE: "approved_test_sandbox" },
    compiledAuthorities,
    dependencies,
  } as never), null);
  assert.ok(createDefaultHostedPaymentRuntime({
    source: { CELEBIX_IYZICO_IFRAME_STOREFRONT_MODE: "approved_test_sandbox" },
    compiledAuthorities,
    dependencies,
  } as never));
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
  assert.match(source, /CELEBIX_IYZICO_IFRAME_STOREFRONT_MODE/);
  assert.match(source, /payment_provider_keyed_lifecycle_preflight/);
  assert.match(
    source,
    /finally\s*\{[\s\S]*!runtimeOwnsKeyring[\s\S]*key[.]fill\(0\)/,
  );
  assert.doesNotMatch(source, /CELEBIX_PAYTR_EXECUTION_EVIDENCE_DIGEST/);
});
