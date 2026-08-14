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
const PAYTR_TEST_AUTHORITY = Object.freeze({
  environment: "test" as const,
  adapterVersion: 1,
  evidenceDigest: `sha256:${"a".repeat(64)}`,
});
const PAYTR_LIVE_AUTHORITY = Object.freeze({
  environment: "live" as const,
  adapterVersion: 1,
  evidenceDigest: `sha256:${"b".repeat(64)}`,
});
const PAYTR_AUTHORITIES = Object.freeze({
  test: PAYTR_TEST_AUTHORITY,
  live: PAYTR_LIVE_AUTHORITY,
});

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
  assert.equal(resolveStorefrontHostedPaymentActivationMode({
    CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE: "approved_live",
  }), "approved_live");
  assert.equal(resolveStorefrontHostedPaymentActivationMode({
    CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE: "approved_test_and_live",
  }), "approved_test_and_live");
  for (const value of ["enabled", "approved_test_validation", " approved_test_sandbox", "approved_test_sandbox ", "approved_live "]) {
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

test("default compiled authority map keeps PayTR test and live bindings distinct", () => {
  const candidate = storefrontPaymentDefaults as typeof storefrontPaymentDefaults & {
    createDefaultStorefrontHostedPaymentCompiledAuthorities?: (
      approved?: unknown,
      generated?: unknown,
      paytr?: unknown,
    ) => Readonly<{
      paytr_iframe: Readonly<{
        test: Readonly<typeof PAYTR_TEST_AUTHORITY> | null;
        live: Readonly<typeof PAYTR_LIVE_AUTHORITY> | null;
      }>;
      iyzico_iframe: Readonly<typeof IYZICO_AUTHORITY> | null;
    }>;
  };
  assert.equal(typeof candidate.createDefaultStorefrontHostedPaymentCompiledAuthorities, "function");
  const createAuthorities = candidate.createDefaultStorefrontHostedPaymentCompiledAuthorities!;
  assert.deepEqual(createAuthorities(), {
    paytr_iframe: { test: null, live: null },
    iyzico_iframe: null,
  });
  const selected = createAuthorities(IYZICO_AUTHORITY, IYZICO_CANDIDATE);
  assert.deepEqual(selected, {
    paytr_iframe: { test: null, live: null },
    iyzico_iframe: IYZICO_AUTHORITY,
  });
  const paytr = createAuthorities(undefined, undefined, PAYTR_AUTHORITIES);
  assert.deepEqual(paytr, { paytr_iframe: PAYTR_AUTHORITIES, iyzico_iframe: null });
  assert.notStrictEqual(paytr.paytr_iframe, PAYTR_AUTHORITIES);
  assert.equal(Object.isFrozen(paytr.paytr_iframe), true);
  assert.equal(Object.isFrozen(paytr.paytr_iframe.test), true);
  assert.equal(Object.isFrozen(paytr.paytr_iframe.live), true);
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
    paytr_iframe: Object.freeze({ test: null, live: null }),
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
      paytr_iframe: Object.freeze({ test: null, live: null }),
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
  const candidates = [
    Object.freeze({ paytr_iframe: PAYTR_AUTHORITIES }),
    Object.freeze({ paytr_iframe: PAYTR_TEST_AUTHORITY, iyzico_iframe: null }),
    Object.freeze({ paytr_iframe: { ...PAYTR_AUTHORITIES, unexpected: null }, iyzico_iframe: null }),
    Object.freeze({ paytr_iframe: { test: PAYTR_LIVE_AUTHORITY, live: PAYTR_TEST_AUTHORITY }, iyzico_iframe: null }),
    Object.freeze({ paytr_iframe: PAYTR_AUTHORITIES, iyzico_iframe: Object.freeze({ ...PAYTR_TEST_AUTHORITY, adapterVersion: 2 }) }),
    Object.defineProperty({ paytr_iframe: PAYTR_AUTHORITIES }, "iyzico_iframe", {
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

test("compiled authority selector clones and freezes exact PayTR environment evidence before later mutation", () => {
  const testAuthority = {
    environment: "test" as const,
    adapterVersion: 1,
    evidenceDigest: `sha256:${"a".repeat(64)}`,
  };
  const liveAuthority = {
    environment: "live" as const,
    adapterVersion: 1,
    evidenceDigest: `sha256:${"c".repeat(64)}`,
  };
  const selector = createStorefrontHostedPaymentCompiledAuthoritySelector({
    paytr_iframe: { test: testAuthority, live: liveAuthority },
    iyzico_iframe: null,
  });
  assert.ok(selector);
  testAuthority.evidenceDigest = `sha256:${"b".repeat(64)}`;
  liveAuthority.evidenceDigest = `sha256:${"d".repeat(64)}`;
  const selected = selector("paytr_iframe", "test");
  assert.deepEqual(selected, {
    providerCode: "paytr_iframe",
    environment: "test",
    adapterVersion: 1,
    evidenceDigest: `sha256:${"a".repeat(64)}`,
  });
  assert.equal(Object.isFrozen(selected), true);
  assert.deepEqual(selector("paytr_iframe", "live"), {
    providerCode: "paytr_iframe",
    environment: "live",
    adapterVersion: 1,
    evidenceDigest: `sha256:${"c".repeat(64)}`,
  });
  assert.equal(selector("iyzico_iframe", "test"), null);
  assert.equal(selector("paytr", "test"), null);
  assert.equal((selector as (providerCode: string, environment: string) => unknown)("paytr_iframe", "preview"), null);
});

test("storefront PayTR runtime activates only environments allowed by the exact gate", () => {
  const dependencies = Object.freeze({
    attempts: Object.freeze({}),
    keyring: Object.freeze({}),
    transport: Object.freeze({ request: Object.freeze(async () => { throw new Error("unexpected"); }) }),
    selectAuthority: Object.freeze(() => Object.freeze({ kind: "untrusted" })),
    matchesCompiledAuthority: Object.freeze(async () => false),
    now: Object.freeze(() => new Date("2026-08-13T00:00:00.000Z")),
    randomBytes: Object.freeze((size: number) => new Uint8Array(size)),
  });
  const compiledAuthorities = Object.freeze({ paytr_iframe: PAYTR_AUTHORITIES, iyzico_iframe: null });
  const testOnly = Object.freeze({
    paytr_iframe: Object.freeze({ test: PAYTR_TEST_AUTHORITY, live: null }),
    iyzico_iframe: null,
  });
  const liveOnly = Object.freeze({
    paytr_iframe: Object.freeze({ test: null, live: PAYTR_LIVE_AUTHORITY }),
    iyzico_iframe: null,
  });
  assert.equal(createDefaultHostedPaymentRuntime({
    source: { CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE: "approved_live" },
    compiledAuthorities: testOnly,
    dependencies,
  } as never), null);
  assert.equal(createDefaultHostedPaymentRuntime({
    source: { CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE: "approved_test_sandbox" },
    compiledAuthorities: liveOnly,
    dependencies,
  } as never), null);
  assert.ok(createDefaultHostedPaymentRuntime({
    source: { CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE: "approved_test_sandbox" },
    compiledAuthorities,
    dependencies,
  } as never));
  assert.ok(createDefaultHostedPaymentRuntime({
    source: { CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE: "approved_live" },
    compiledAuthorities: liveOnly,
    dependencies,
  } as never));
  assert.ok(createDefaultHostedPaymentRuntime({
    source: { CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE: "approved_test_and_live" },
    compiledAuthorities,
    dependencies,
  } as never));
});

test("default PayTR runtime carries the selected compiled authority into initialize", async () => {
  const attemptId = "10000000-0000-4000-8000-000000000001";
  const storeId = "20000000-0000-4000-8000-000000000001";
  const methodId = "30000000-0000-4000-8000-000000000001";
  let authorityChecks = 0;
  let initializedCode = "";
  const unavailable = async () => { throw new Error("unexpected_repository_call"); };
  const attempts = Object.freeze({
    begin: async () => Object.freeze({
      outcome: "created" as const,
      attemptId,
      storeId,
      paymentMethodId: methodId,
      profileId: "40000000-0000-4000-8000-000000000001",
      providerCode: "paytr_iframe",
      environment: "test" as const,
      executionAdapterVersion: 1,
      executionEvidenceDigest: PAYTR_TEST_AUTHORITY.evidenceDigest,
      credentialVersion: 1,
      amountMinor: 10_000,
      currency: "TRY",
      methodConfig: Object.freeze({
        environment: "test" as const,
        locale: "tr" as const,
        threeDSecure: "provider_managed" as const,
        installmentMode: "all" as const,
        maxInstallment: 0 as const,
      }),
      publicConfig: Object.freeze({ environment: "test", merchantId: "merchant_fixture" }),
      sealedCredentials: Object.freeze({
        algorithm: "A256GCM" as const,
        ciphertext: "AQ",
        iv: "AAAAAAAAAAAAAAAA",
        keyId: "provider.current",
        tag: "AAAAAAAAAAAAAAAAAAAAAA",
        version: 1 as const,
      }),
    }),
    markInitialized: async (input: Readonly<{ safeCode: string; status: string; providerReference: string | null }>) => {
      initializedCode = input.safeCode;
      return Object.freeze({
        attemptId,
        status: input.status,
        version: 2,
        providerReference: input.providerReference,
        safeCode: input.safeCode,
        replayed: false,
      });
    },
    markUnknown: unavailable,
    getCallbackAuthority: unavailable,
    getReconciliationAuthority: unavailable,
    settleCallback: unavailable,
    applyHostedCallback: unavailable,
    claimReconciliation: unavailable,
    finalizeReconciliation: unavailable,
  });
  const runtime = createDefaultHostedPaymentRuntime({
    source: { CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE: "approved_test_sandbox" },
    compiledAuthorities: Object.freeze({
      paytr_iframe: Object.freeze({ test: PAYTR_TEST_AUTHORITY, live: null }),
      iyzico_iframe: null,
    }),
    dependencies: Object.freeze({
      attempts,
      keyring: Object.freeze({
        activeKeyId: "provider.current",
        keys: Object.freeze([Object.freeze({
          keyId: "provider.current",
          key: new Uint8Array(32).fill(17),
        })]),
      }),
      transport: Object.freeze({ request: unavailable }),
      selectAuthority: () => Object.freeze({ kind: "trusted", hostname: "shop.example.test" }),
      matchesCompiledAuthority: async () => { authorityChecks += 1; return true; },
      now: () => new Date("2026-08-14T00:00:00.000Z"),
      randomBytes: (size: number) => new Uint8Array(size).fill(7),
    }),
  } as never);
  assert.ok(runtime);
  await runtime.initialize(Object.freeze({
    headers: new Headers(),
    storeId,
    operationId: attemptId,
    paymentMethodId: methodId,
    orderReference: "sf:test:1",
    amountMinor: 10_000,
    currency: "TRY",
    customer: Object.freeze({
      name: "Celebix Test",
      email: "smoke@example.test",
      phone: "+905551112233",
      ipAddress: "8.8.8.8",
      address: "Test address",
    }),
    basket: Object.freeze([Object.freeze({
      reference: "sku-1",
      name: "Test product",
      quantity: 1,
      unitAmountMinor: 10_000,
    })]),
  }));
  assert.equal(authorityChecks, 1);
  assert.notEqual(initializedCode, "execution_authority_mismatch");
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
  assert.match(source, /queryAsWorkflowRole\(pool,\s*`SELECT saas[.]storefront_hosted_payment_execution_authority_matches\(/u);
  assert.doesNotMatch(source, /pool[.]query\(\{[\s\S]*merchant_provider_execution_authority_matches/u);
  assert.match(
    source,
    /finally\s*\{[\s\S]*!runtimeOwnsKeyring[\s\S]*key[.]fill\(0\)/,
  );
  assert.doesNotMatch(source, /CELEBIX_PAYTR_EXECUTION_EVIDENCE_DIGEST/);
});
