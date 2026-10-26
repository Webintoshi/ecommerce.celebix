import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AKBANK_JSON_PACKET,
  IYZICO_IFRAME_PACKET,
  PAYTR_APPROVED_EXECUTION_AUTHORITIES,
  PAYTR_IFRAME_PACKET,
} from "@celebix/payment-adapters";
import { sealMerchantProviderCredential, type PaymentAttemptRepository, type ApplyHostedPaymentCallbackInput } from "@celebix/saas-data";
import { createHostedPaymentCallbackRoute } from "./runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";

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

test("default storefront registry contains the immutable hosted packets with their own adapters", () => {
  const transport = Object.freeze({
    request: Object.freeze(async () => {
      throw new Error("provider_transport_must_not_run_during_composition");
    }),
  });
  const registry = createDefaultHostedPaymentAdapterRegistry(transport);

  assert.equal(Object.isFrozen(registry), true);
  assert.equal(registry.size, 3);
  assert.strictEqual(registry.packet("paytr_iframe"), PAYTR_IFRAME_PACKET);
  assert.strictEqual(registry.packet("iyzico_iframe"), IYZICO_IFRAME_PACKET);
  assert.strictEqual(registry.adapter("paytr_iframe")?.packet, PAYTR_IFRAME_PACKET);
  assert.strictEqual(registry.adapter("iyzico_iframe")?.packet, IYZICO_IFRAME_PACKET);
  assert.notStrictEqual(registry.adapter("paytr_iframe"), registry.adapter("iyzico_iframe"));
  assert.strictEqual(registry.packet("akbank_json"), AKBANK_JSON_PACKET);
  assert.strictEqual(registry.adapter("akbank_json")?.packet, AKBANK_JSON_PACKET);
  assert.equal(registry.adapter("akbank"), null);
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
  assert.ok(PAYTR_APPROVED_EXECUTION_AUTHORITIES.test, "PayTR test execution authority must be generated");
  assert.ok(PAYTR_APPROVED_EXECUTION_AUTHORITIES.live, "PayTR live execution authority must be generated");
  const defaultAkbank = storefrontPaymentDefaults.createDefaultStorefrontHostedPaymentCompiledAuthorities().akbank_json;
  assert.deepEqual(createAuthorities(), {
    akbank_json: defaultAkbank,
    paytr_iframe: {
      test: PAYTR_APPROVED_EXECUTION_AUTHORITIES.test,
      live: PAYTR_APPROVED_EXECUTION_AUTHORITIES.live,
    },
    iyzico_iframe: null,
  });
  const selected = createAuthorities(IYZICO_AUTHORITY, IYZICO_CANDIDATE);
  assert.deepEqual(selected, {
    akbank_json: defaultAkbank,
    paytr_iframe: {
      test: PAYTR_APPROVED_EXECUTION_AUTHORITIES.test,
      live: PAYTR_APPROVED_EXECUTION_AUTHORITIES.live,
    },
    iyzico_iframe: IYZICO_AUTHORITY,
  });
  const paytr = createAuthorities(undefined, undefined, PAYTR_AUTHORITIES);
  assert.deepEqual(paytr, { paytr_iframe: PAYTR_AUTHORITIES, iyzico_iframe: null, akbank_json: defaultAkbank });
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


test("Akbank execution uses its exact flag and environment authority without enabling legacy bank or iyzico live", () => {
  const testAuthority = { environment: "test" as const, adapterVersion: AKBANK_JSON_PACKET.adapterVersion, evidenceDigest: `sha256:${"c".repeat(64)}` };
  const liveAuthority = { ...testAuthority, environment: "live" as const, evidenceDigest: `sha256:${"d".repeat(64)}` };
  const authorities = { paytr_iframe: { test: null, live: null }, iyzico_iframe: null,
    akbank_json: { test: testAuthority, live: liveAuthority } };
  const select = createStorefrontHostedPaymentCompiledAuthoritySelector(authorities);
  assert.ok(select);
  assert.deepEqual(select("akbank_json", "test"), { providerCode: "akbank_json", ...testAuthority });
  assert.deepEqual(select("akbank_json", "live"), { providerCode: "akbank_json", ...liveAuthority });
  assert.equal(select("akbank", "test"), null);
  for (const mode of ["approved_test_sandbox", "approved_live", "approved_test_and_live"] as const) {
    assert.equal(resolveStorefrontHostedPaymentActivationMode({ CELEBIX_AKBANK_JSON_STOREFRONT_MODE: mode }, "akbank_json"), mode);
    assert.equal(resolveStorefrontHostedPaymentActivationMode({ CELEBIX_AKBANK_JSON_STOREFRONT_MODE: mode }, "paytr_iframe"), "disabled");
    assert.equal(resolveStorefrontHostedPaymentActivationMode({ CELEBIX_AKBANK_JSON_STOREFRONT_MODE: mode }, "iyzico_iframe"), "disabled");
  }
  assert.equal(resolveStorefrontHostedPaymentActivationMode({ CELEBIX_IYZICO_IFRAME_STOREFRONT_MODE: "approved_live" }, "iyzico_iframe"), "disabled");
  assert.equal(resolveStorefrontHostedPaymentActivationMode({ CELEBIX_AKBANK_JSON_STOREFRONT_MODE: "enabled" }, "akbank_json"), "disabled");
  assert.equal(createStorefrontHostedPaymentCompiledAuthoritySelector({ ...authorities, akbank_json: { test: { ...testAuthority, adapterVersion: 999 }, live: null } }), null);
  assert.equal(createStorefrontHostedPaymentCompiledAuthoritySelector({ ...authorities, akbank_json: { test: null, live: { ...liveAuthority, environment: "test" } } } as never), null);
});

function defaultAkbankReturnFixture(standard: boolean) {
  const attemptId = "10000000-0000-4000-8000-000000000001";
  const storeId = "20000000-0000-4000-8000-000000000001";
  const profileId = "40000000-0000-4000-8000-000000000001";
  const hostname = "shop.example.test";
  const credential = { merchantSafeId: "1".repeat(32), terminalSafeId: "2".repeat(32), secretKey: "default-akbank-fixture-only" };
  const keyring = { activeKeyId: "provider.current", keys: [{ keyId: "provider.current", key: new Uint8Array(32).fill(17) }] };
  const sealedCredentials = sealMerchantProviderCredential({ plaintext: new TextEncoder().encode(JSON.stringify(credential)),
    profileId, storeId, providerCode: "akbank_json", capability: "payment_processing", credentialVersion: 1, keyring });
  const execution = { environment: "test" as const, adapterVersion: AKBANK_JSON_PACKET.adapterVersion, evidenceDigest: `sha256:${"c".repeat(64)}` };
  const now = new Date("2026-10-27T00:00:00.000Z");
  const captures: ApplyHostedPaymentCallbackInput[] = [];
  const contextLookups: unknown[] = [];
  const diagnostics: unknown[] = [];
  const queries: Record<string, unknown>[] = [];
  const unavailable = async () => { throw Error("unexpected_repository_or_sale_call"); };
  const attempts: PaymentAttemptRepository = {
    begin: unavailable, markInitialized: unavailable, markUnknown: unavailable, settleCallback: unavailable,
    getReconciliationAuthority: unavailable, claimReconciliation: unavailable, finalizeReconciliation: unavailable,
    getCallbackAuthority: async () => ({ attemptId, storeId, profileId, paymentMethodId: "30000000-0000-4000-8000-000000000001",
      providerCode: "akbank_json", environment: "test", executionAdapterVersion: execution.adapterVersion,
      executionEvidenceDigest: execution.evidenceDigest, credentialVersion: 1, orderReference: "ORDER-FIXTURE", amountMinor: 12_345,
      currency: "TRY", status: "awaiting_customer", version: 2, providerReference: attemptId, sealedCredentials,
      publicConfig: { environment: "test" }, methodConfig: { environment: "test", locale: "tr", threeDSecure: "provider_managed", installmentMode: "single_payment", maxInstallment: 0 } }),
    applyHostedCallback: async input => {
      captures.push(input);
      return { attemptId, status: input.status, version: 4, providerReference: input.providerReference, safeCode: input.safeCode, replayed: false, disposition: "applied" };
    },
  };
  const proxyToken = Buffer.alloc(32, 0x42).toString("base64url");
  const dependencies = {
    attempts, keyring,
    transport: { request: async (input: Parameters<import("@celebix/payment-adapters").ProviderTransport["request"]>[0]) => {
      assert.equal(captures.length, 0);
      assert.equal("auth-hash" in input.headers ? input.headers["auth-hash"] : undefined, createHmac("sha512", credential.secretKey).update(input.body).digest("base64"));
      const query = JSON.parse(Buffer.from(input.body).toString("utf8"));
      assert.equal(query.txnCode, "1010", "composition may only inquire, never initialize a sale");
      queries.push(query);
      const body = new TextEncoder().encode(JSON.stringify({ txnCode: "1010", responseCode: "VPS-0000", terminal: { merchantSafeId: credential.merchantSafeId, terminalSafeId: credential.terminalSafeId },
        txnDetailList: [{ txnCode: "1000", responseCode: "VPS-0000", hostResponseCode: "00", txnStatus: "N", orderId: attemptId, orgOrderId: attemptId, amount: "123.45", currencyCode: 949, installCount: 1 }] }));
      return { kind: "response" as const, status: 200, contentType: "application/json", body, headers: { "auth-hash": createHmac("sha512", credential.secretKey).update(body).digest("base64") } };
    } },
    selectAuthority: (headers: Headers) => selectTrustedStorefrontHostAuthority(headers, { CELEBIX_DEPLOYMENT_TIER: "staging", CELEBIX_STOREFRONT_PROXY_MODE: "approved_staging", CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL: proxyToken }),
    matchesCompiledAuthority: async () => true, now: () => new Date(now), randomBytes: (size: number) => new Uint8Array(size).fill(7),
    isStandardCheckoutContext: async (input: unknown) => { contextLookups.push(input); return standard; },
    auditCallback: (event: unknown) => { diagnostics.push(event); },
  };
  const runtime = createDefaultHostedPaymentRuntime({ source: { CELEBIX_AKBANK_JSON_STOREFRONT_MODE: "approved_test_sandbox" },
    compiledAuthorities: { paytr_iframe: { test: null, live: null }, iyzico_iframe: null, akbank_json: { test: execution, live: null } }, dependencies });
  assert.ok(runtime);
  const binding = Buffer.alloc(32, 7).toString("base64url");
  const route = createHostedPaymentCallbackRoute({ resolveRuntime: async () => runtime });
  const request = (forged = false, untrusted = false) => {
    const fields = { merchantSafeId: credential.merchantSafeId, terminalSafeId: credential.terminalSafeId, orderId: attemptId, amount: "123.45", txnCode: "1000", responseCode: "VPS-0000", currencyCode: "949" };
    const hash = createHmac("sha512", forged ? "forged-fixture-secret" : credential.secretKey).update(Object.values(fields).join("")).digest("base64");
    const body = new URLSearchParams({ ...fields, hashParams: Object.keys(fields).join("+"), hash }).toString();
    return new Request(`https://localhost:3450/api/payments/akbank_json/callback/${binding}`, { method: "POST", body,
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://virtualpospaymentgatewaypre.akbank.com", host: "localhost:3450",
        "x-celebix-storefront-proxy": untrusted ? "p1.invalid" : `p1.${proxyToken}`, "x-forwarded-host": hostname, "x-forwarded-proto": "https" } });
  };
  return { attemptId, storeId, now, route, request, binding, queries, captures, contextLookups, diagnostics };
}

test("production default Akbank factory preserves authenticated standard context when redirecting the customer", async (context) => {
  for (const standard of [true, false]) await context.test(standard ? "standard context" : "legacy quick order", async () => {
    const selected = defaultAkbankReturnFixture(standard);
    const response = await selected.route(selected.request(), { params: Promise.resolve({ providerCode: "akbank_json", binding: selected.binding }) });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), standard ? `/checkout/payment/${selected.attemptId}/result` : "/odeme/hizli/sonuc?durum=basarili");
    assert.deepEqual(selected.contextLookups, [{ attemptId: selected.attemptId, storeId: selected.storeId, now: selected.now }]);
    assert.equal(selected.queries.length, 1);
    assert.equal(selected.captures.length, 1);
    assert.equal(selected.captures[0]!.status, "captured");
  });
});

test("production default factory forwards safe diagnostics and never resolves a context before authenticating the callback", async () => {
  for (const untrusted of [false, true]) {
    const selected = defaultAkbankReturnFixture(true);
    const response = await selected.route(selected.request(true, untrusted), { params: Promise.resolve({ providerCode: "akbank_json", binding: selected.binding }) });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("location"), null);
    assert.equal(selected.contextLookups.length, 0);
    assert.equal(selected.captures.length, 0);
    assert.equal(selected.queries.length, 0);
    assert.deepEqual(selected.diagnostics, [{ providerCode: "akbank_json", stage: untrusted ? "request_authority" : "provider_verification" }]);
  }
});
