import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type {
  HostedPaymentAdapter,
  HostedPaymentInitialization,
  HostedPaymentStatus,
  PaymentAdapterPacket,
  VerifiedProviderCallback,
} from "@celebix/payment-adapters";
import type {
  ApplyHostedPaymentCallbackResult,
  BeginPaymentAttemptResult,
  MerchantProviderCredentialKeyring,
  PaymentAttemptAuthority,
  PaymentAttemptMutationResult,
  PaymentAttemptReconciliationClaim,
  PaymentAttemptRepository,
} from "@celebix/saas-data";
import { PaymentAttemptRepositoryError } from "@celebix/saas-data";

import {
  createHostedPaymentCallbackRoute,
  createHostedPaymentRuntime,
  type HostedPaymentRuntime,
  type HostedPaymentRuntimeDependencies,
} from "./runtime.ts";

const HOSTNAME = "pilot.saas-staging.celebix.site";
const STORE_ID = "11111111-1111-4111-8111-111111111111";
const METHOD_ID = "22222222-2222-4222-8222-222222222222";
const PROFILE_ID = "33333333-3333-4333-8333-333333333333";
const ATTEMPT_ID = "44444444-4444-4444-8444-444444444444";
const LEASE_ID = "55555555-5555-4555-8555-555555555555";
const DIGEST = "4bb06f8e4e3a7715d201d573d0aa423762e55dabd61a2c02278fa56cc6d294e0";
const PROVIDER = "fixture_provider";
const ENDPOINT = "https://payments.example.test/hosted";
const NOW = new Date("2026-07-27T12:00:00.000Z");
const COMPILED_AUTHORITY = Object.freeze({
  providerCode: PROVIDER,
  environment: "test" as const,
  adapterVersion: 1,
  evidenceDigest: `sha256:${"a".repeat(64)}`,
});
const SEALED = Object.freeze({
  algorithm: "A256GCM" as const,
  ciphertext: "YQ",
  iv: "AAAAAAAAAAAAAAAA",
  keyId: "provider.current",
  tag: "AAAAAAAAAAAAAAAAAAAAAA",
  version: 1 as const,
});
const KEYRING: MerchantProviderCredentialKeyring = Object.freeze({
  activeKeyId: "provider.current",
  keys: Object.freeze([
    Object.freeze({ keyId: "provider.current", key: new Uint8Array(32).fill(0x11) }),
  ]),
});

const PACKET: PaymentAdapterPacket = Object.freeze({
  providerCode: PROVIDER,
  familyCode: "fixture",
  modeCode: "hosted",
  adapterVersion: 1,
  implementation: "hosted",
  callbackResponse: "provider_ack",
  readiness: Object.freeze({ test: "verification", live: "planned" }),
  endpoints: Object.freeze({
    test: Object.freeze([ENDPOINT]),
    live: Object.freeze([ENDPOINT]),
  }),
  presentation: Object.freeze({
    test: Object.freeze({ kind: "exact_url" as const, url: ENDPOINT }),
    live: Object.freeze({ kind: "exact_url" as const, url: ENDPOINT }),
  }),
  publicFields: Object.freeze([
    Object.freeze({ key: "merchantId", label: "Merchant", minimum: 1, maximum: 128 }),
  ]),
  credentialFields: Object.freeze([
    Object.freeze({
      key: "merchantKey", label: "Merchant key", minimum: 1, maximum: 256, secret: true as const,
    }),
  ]),
  capabilities: Object.freeze({
    initialize: true,
    callback: true,
    query: true,
    threeDSecure: true,
    installments: false,
    preAuth: false,
    capture: false,
    cancel: false,
    refund: false,
    partialRefund: false,
    tokenization: false,
  }),
  documentation: Object.freeze([]),
});

function callbackPacket(
  callbackResponse: "provider_ack" | "customer_return",
): PaymentAdapterPacket {
  return Object.freeze({ ...PACKET, callbackResponse });
}

function beginResult(
  overrides: Partial<BeginPaymentAttemptResult> = {},
): BeginPaymentAttemptResult {
  return Object.freeze({
    outcome: "created",
    attemptId: ATTEMPT_ID,
    storeId: STORE_ID,
    paymentMethodId: METHOD_ID,
    profileId: PROFILE_ID,
    providerCode: PROVIDER,
    environment: "test",
    executionAdapterVersion: COMPILED_AUTHORITY.adapterVersion,
    executionEvidenceDigest: COMPILED_AUTHORITY.evidenceDigest,
    credentialVersion: 3,
    amountMinor: 12_345,
    currency: "TRY",
    publicConfig: Object.freeze({ environment: "test", merchantId: "merchant_fixture" }),
    sealedCredentials: SEALED,
    ...overrides,
  });
}

function authority(overrides: Partial<PaymentAttemptAuthority> = {}): PaymentAttemptAuthority {
  return Object.freeze({
    attemptId: ATTEMPT_ID,
    storeId: STORE_ID,
    paymentMethodId: METHOD_ID,
    profileId: PROFILE_ID,
    providerCode: PROVIDER,
    environment: "test",
    executionAdapterVersion: COMPILED_AUTHORITY.adapterVersion,
    executionEvidenceDigest: COMPILED_AUTHORITY.evidenceDigest,
    credentialVersion: 3,
    orderReference: "ORDER-100",
    amountMinor: 12_345,
    currency: "TRY",
    status: "submitted",
    version: 2,
    providerReference: null,
    publicConfig: Object.freeze({ environment: "test", merchantId: "merchant_fixture" }),
    sealedCredentials: SEALED,
    ...overrides,
  });
}

function mutation(
  overrides: Partial<PaymentAttemptMutationResult> = {},
): PaymentAttemptMutationResult {
  return Object.freeze({
    attemptId: ATTEMPT_ID,
    status: "awaiting_customer",
    version: 2,
    providerReference: "provider_reference_private",
    safeCode: "iframe_ready",
    replayed: false,
    ...overrides,
  });
}

function hostedMutation(
  overrides: Partial<ApplyHostedPaymentCallbackResult> = {},
): ApplyHostedPaymentCallbackResult {
  return Object.freeze({
    ...mutation(),
    disposition: "applied",
    ...overrides,
  });
}

type Calls = {
  begin: Parameters<PaymentAttemptRepository["begin"]>[0][];
  initialized: Parameters<PaymentAttemptRepository["markInitialized"]>[0][];
  unknown: Parameters<PaymentAttemptRepository["markUnknown"]>[0][];
  callbackAuthority: Parameters<PaymentAttemptRepository["getCallbackAuthority"]>[0][];
  reconciliationAuthority: Parameters<PaymentAttemptRepository["getReconciliationAuthority"]>[0][];
  settled: Parameters<PaymentAttemptRepository["settleCallback"]>[0][];
  hostedCallbacks: Parameters<PaymentAttemptRepository["applyHostedCallback"]>[0][];
  claims: Parameters<PaymentAttemptRepository["claimReconciliation"]>[0][];
  finalized: Parameters<PaymentAttemptRepository["finalizeReconciliation"]>[0][];
  initializedAdapter: Parameters<HostedPaymentAdapter<object>["initialize"]>[0][];
  callbacks: Parameters<HostedPaymentAdapter<object>["verifyCallback"]>[0][];
  queries: Parameters<HostedPaymentAdapter<object>["query"]>[0][];
  opens: unknown[];
  authorityChecks: Parameters<HostedPaymentRuntimeDependencies["matchesCompiledAuthority"]>[0][];
};

function deferred<T>(): Readonly<{
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((selectedResolve, selectedReject) => {
    resolve = selectedResolve;
    reject = selectedReject;
  });
  return Object.freeze({ promise, resolve, reject });
}

function fixture(options: Readonly<{
  initialization?: HostedPaymentInitialization | Error;
  initializeAdapter?: (
    input: Parameters<HostedPaymentAdapter<object>["initialize"]>[0],
  ) => Promise<HostedPaymentInitialization>;
  callback?: VerifiedProviderCallback | Error;
  callbackAdapter?: (
    input: Parameters<HostedPaymentAdapter<object>["verifyCallback"]>[0],
  ) => Promise<VerifiedProviderCallback>;
  query?: HostedPaymentStatus | Error;
  queryAdapter?: (
    input: Parameters<HostedPaymentAdapter<object>["query"]>[0],
  ) => Promise<HostedPaymentStatus>;
  begin?: BeginPaymentAttemptResult;
  callbackAuthority?: PaymentAttemptAuthority | Error;
  reconciliationAuthority?: PaymentAttemptAuthority | Error;
  settlement?: ApplyHostedPaymentCallbackResult | Error;
  unknownMutation?: PaymentAttemptMutationResult | Error;
  adapterPresent?: boolean;
  trusted?: boolean;
  freezeCredential?: boolean;
  claim?: Partial<PaymentAttemptReconciliationClaim> | Error;
  now?: () => Date;
  providerTimeoutMs?: number;
  packet?: PaymentAdapterPacket;
  compiledAuthority?: Readonly<{
    providerCode: string;
    environment: "test" | "live";
    adapterVersion: number;
    evidenceDigest: string;
  }> | null;
  authorityMatches?: boolean | Error;
}> = {}) {
  const calls: Calls = {
    begin: [], initialized: [], unknown: [], callbackAuthority: [], reconciliationAuthority: [], settled: [],
    hostedCallbacks: [],
    claims: [], finalized: [], initializedAdapter: [], callbacks: [], queries: [], opens: [],
    authorityChecks: [],
  };
  let opened: Uint8Array | undefined;
  const attempts: PaymentAttemptRepository = {
    async begin(input) { calls.begin.push(input); return options.begin ?? beginResult(); },
    async markInitialized(input) { calls.initialized.push(input); return mutation({
      status: input.status, providerReference: input.providerReference, safeCode: input.safeCode,
    }); },
    async markUnknown(input) {
      calls.unknown.push(input);
      if (options.unknownMutation instanceof Error) throw options.unknownMutation;
      return options.unknownMutation ?? mutation({
        status: "provider_outcome_unknown", providerReference: input.providerReference,
        safeCode: input.safeCode, version: input.expectedVersion + 1,
      });
    },
    async getCallbackAuthority(input) {
      calls.callbackAuthority.push(input);
      if (options.callbackAuthority instanceof Error) throw options.callbackAuthority;
      return options.callbackAuthority ?? authority();
    },
    async getReconciliationAuthority(input) {
      calls.reconciliationAuthority.push(input);
      if (options.reconciliationAuthority instanceof Error) throw options.reconciliationAuthority;
      return options.reconciliationAuthority ?? authority({ status: "provider_outcome_unknown" });
    },
    async settleCallback(input) {
      calls.settled.push(input);
      if (options.settlement instanceof Error) throw options.settlement;
      const selectedAuthority = options.callbackAuthority instanceof Error
        ? authority()
        : options.callbackAuthority ?? authority();
      if (
        selectedAuthority.status === "awaiting_customer"
        && (input.status === "captured" || input.status === "failed")
      ) throw new PaymentAttemptRepositoryError("invalid_transition");
      return options.settlement ?? mutation({
        status: input.status, providerReference: input.providerReference, safeCode: input.safeCode,
        replayed: false, version: input.expectedVersion + 1,
      });
    },
    async applyHostedCallback(input) {
      calls.hostedCallbacks.push(input);
      if (options.settlement instanceof Error) throw options.settlement;
      if (options.settlement !== undefined) return options.settlement;
      const selectedAuthority = options.callbackAuthority instanceof Error
        ? authority()
        : options.callbackAuthority ?? authority();
      if (["provider_outcome_unknown", "reconciliation_required"].includes(selectedAuthority.status)) {
        return hostedMutation({
          status: selectedAuthority.status,
          version: selectedAuthority.version,
          providerReference: selectedAuthority.providerReference,
          safeCode: "provider_outcome_unknown",
          disposition: "processing",
        });
      }
      const versionIncrement = input.status !== "provider_outcome_unknown"
        && selectedAuthority.status === "awaiting_customer" ? 2 : 1;
      return hostedMutation({
        status: input.status,
        providerReference: input.providerReference,
        safeCode: input.safeCode,
        version: input.expectedVersion + versionIncrement,
      });
    },
    async claimReconciliation(input) {
      calls.claims.push(input);
      if (options.claim instanceof Error) throw options.claim;
      return Object.freeze({
        ...authority({ status: "reconciliation_required", version: input.expectedVersion + 1 }),
        outcome: "claimed",
        leaseId: input.leaseId,
        leaseOwner: input.workerId,
        leaseExpiresAt: input.leaseExpiresAt.toISOString(),
        ...(options.claim ?? {}),
      }) as PaymentAttemptReconciliationClaim;
    },
    async finalizeReconciliation(input) { calls.finalized.push(input); return mutation({
      status: input.status, providerReference: input.providerReference, safeCode: input.safeCode,
    }); },
  };
  const parseCredential = Object.freeze((value: unknown) => {
    assert.deepEqual(value, {
      merchantId: "merchant_fixture",
      merchantKey: "credential_secret",
    });
    return options.freezeCredential
      ? Object.freeze({ ...(value as Record<string, unknown>) })
      : value as object;
  });
  const initialize = Object.freeze(async (input: Parameters<HostedPaymentAdapter<object>["initialize"]>[0]) => {
    calls.initializedAdapter.push(input);
    if (options.initializeAdapter !== undefined) return options.initializeAdapter(input);
    if (options.initialization instanceof Error) throw options.initialization;
    return options.initialization ?? Object.freeze({
      kind: "iframe" as const,
      url: ENDPOINT,
      token: "browser_token_fixture",
      providerReference: "provider_reference_private",
    });
  });
  const verifyCallback = Object.freeze(async (input: Parameters<HostedPaymentAdapter<object>["verifyCallback"]>[0]) => {
    calls.callbacks.push(input);
    if (options.callbackAdapter !== undefined) return options.callbackAdapter(input);
    if (options.callback instanceof Error) throw options.callback;
    return options.callback ?? Object.freeze({
      eventKey: "provider_event_1",
      status: "succeeded" as const,
      providerReference: "provider_reference_private",
      paidAmountMinor: 12_345,
      currency: "TRY",
      safeCode: "payment_captured",
    });
  });
  const query = Object.freeze(async (input: Parameters<HostedPaymentAdapter<object>["query"]>[0]) => {
    calls.queries.push(input);
    if (options.queryAdapter !== undefined) return options.queryAdapter(input);
    if (options.query instanceof Error) throw options.query;
    return options.query ?? Object.freeze({
      kind: "succeeded" as const,
      providerReference: "provider_reference_private",
      paidAmountMinor: 12_345,
      currency: "TRY",
    });
  });
  const packet = options.packet ?? PACKET;
  const adapter: HostedPaymentAdapter<object> = Object.freeze({
    packet,
    parseCredential,
    maskAccount: Object.freeze(() => "merchant…ture"),
    initialize,
    verifyCallback,
    query,
  });
  const runtime = createHostedPaymentRuntime({
    attempts,
    adapters: Object.freeze({
      size: options.adapterPresent === false ? 0 : 1,
      packet: (providerCode: string) => providerCode === PROVIDER && options.adapterPresent !== false ? packet : null,
      adapter: (providerCode: string) => providerCode === PROVIDER && options.adapterPresent !== false ? adapter : null,
    }),
    keyring: KEYRING,
    openCredential(input) {
      calls.opens.push(input);
      opened = new TextEncoder().encode("{\"merchantKey\":\"credential_secret\"}");
      return opened;
    },
    selectAuthority: () => options.trusted === false
      ? Object.freeze({ kind: "invalid_proxy_authority" })
      : Object.freeze({ kind: "trusted", hostname: HOSTNAME }),
    now: options.now ?? (() => new Date(NOW)),
    randomBytes: (size) => new Uint8Array(size).fill(7),
    selectCompiledAuthority: (providerCode) => providerCode === PROVIDER
      ? options.compiledAuthority === undefined
        ? COMPILED_AUTHORITY
        : options.compiledAuthority
      : null,
    async matchesCompiledAuthority(input) {
      calls.authorityChecks.push(input);
      if (options.authorityMatches instanceof Error) throw options.authorityMatches;
      return options.authorityMatches ?? true;
    },
    providerTimeoutMs: options.providerTimeoutMs,
  });
  return { runtime, calls, get opened() { return opened; } };
}

function initializeInput() {
  return {
    headers: new Headers(),
    storeId: STORE_ID,
    operationId: ATTEMPT_ID,
    paymentMethodId: METHOD_ID,
    orderReference: "ORDER-100",
    amountMinor: 12_345,
    currency: "TRY",
    customer: Object.freeze({
      name: "Fixture Customer",
      email: "fixture@example.test",
      phone: "+905551112233",
      ipAddress: "203.0.113.7",
      address: "Fixture address",
    }),
    basket: Object.freeze([
      Object.freeze({
        reference: "SKU-1",
        name: "Fixture item",
        quantity: 1,
        unitAmountMinor: 12_345,
      }),
    ]),
  };
}

function providerProjectionFixture(providerCode: "paytr_iframe" | "iyzico_iframe") {
  const beginCalls: Parameters<PaymentAttemptRepository["begin"]>[0][] = [];
  const initializedInputs: Parameters<HostedPaymentAdapter<object>["initialize"]>[0][] = [];
  const opens: unknown[] = [];
  const publicFields = providerCode === "paytr_iframe"
    ? Object.freeze([Object.freeze({ key: "merchantId", label: "Merchant", minimum: 1, maximum: 128 })])
    : Object.freeze([]);
  const credentialFields = providerCode === "paytr_iframe"
    ? Object.freeze([Object.freeze({ key: "merchantKey", label: "Key", minimum: 1, maximum: 256, secret: true as const })])
    : Object.freeze([
        Object.freeze({ key: "apiKey", label: "API Key", minimum: 1, maximum: 256, secret: true as const }),
        Object.freeze({ key: "secretKey", label: "Secret Key", minimum: 1, maximum: 256, secret: true as const }),
      ]);
  const packet = Object.freeze({ ...PACKET, providerCode, publicFields, credentialFields });
  const parseCredential = Object.freeze((value: unknown) => ({ ...(value as Record<string, unknown>) }));
  const initialize = Object.freeze(async (input: Parameters<HostedPaymentAdapter<object>["initialize"]>[0]) => {
    initializedInputs.push(input);
    return Object.freeze({ kind: "pending" as const, providerReference: null });
  });
  const adapter: HostedPaymentAdapter<object> = Object.freeze({
    packet,
    parseCredential,
    maskAccount: Object.freeze(() => "fixture"),
    initialize,
    verifyCallback: Object.freeze(async () => { throw new Error("unexpected_callback"); }),
    query: Object.freeze(async () => { throw new Error("unexpected_query"); }),
  });
  const publicConfig = providerCode === "paytr_iframe"
    ? Object.freeze({ environment: "test", merchantId: "merchant_fixture" })
    : Object.freeze({ environment: "test" });
  const credentialJson = providerCode === "paytr_iframe"
    ? "{\"merchantKey\":\"credential_secret\"}"
    : "{\"apiKey\":\"api_secret\",\"secretKey\":\"credential_secret\"}";
  const attempts: PaymentAttemptRepository = {
    async begin(input) {
      beginCalls.push(input);
      return beginResult({ providerCode, publicConfig });
    },
    async markInitialized(input) {
      return mutation({
        status: input.status,
        providerReference: input.providerReference,
        safeCode: input.safeCode,
      });
    },
    async markUnknown() { throw new Error("unexpected_unknown"); },
    async getCallbackAuthority() { throw new Error("unexpected_callback"); },
    async getReconciliationAuthority() { throw new Error("unexpected_query"); },
    async settleCallback() { throw new Error("unexpected_callback"); },
    async applyHostedCallback() { throw new Error("unexpected_callback"); },
    async claimReconciliation() { throw new Error("unexpected_query"); },
    async finalizeReconciliation() { throw new Error("unexpected_query"); },
  };
  return {
    beginCalls,
    initializedInputs,
    opens,
    runtime: createHostedPaymentRuntime({
      attempts,
      adapters: Object.freeze({
        size: 1,
        packet: (code: string) => code === providerCode ? packet : null,
        adapter: (code: string) => code === providerCode ? adapter : null,
      }),
      keyring: KEYRING,
      openCredential(input) {
        opens.push(input);
        return new TextEncoder().encode(credentialJson);
      },
      selectAuthority: () => Object.freeze({ kind: "trusted", hostname: HOSTNAME }),
      selectCompiledAuthority: (code) => code === providerCode
        ? Object.freeze({ ...COMPILED_AUTHORITY, providerCode })
        : null,
      matchesCompiledAuthority: Object.freeze(async () => true),
      now: () => new Date(NOW),
      randomBytes: (size) => new Uint8Array(size).fill(7),
    }),
  };
}

function providerInput(customerName = "Ada Byron Lovelace", basketName = "Gerçek ürün") {
  return {
    ...initializeInput(),
    customer: Object.freeze({
      name: customerName,
      email: customerName === "Ada Byron Lovelace" ? "ada@example.test" : "grace@example.test",
      phone: customerName === "Ada Byron Lovelace" ? "+905551112233" : "+905559998877",
      ipAddress: customerName === "Ada Byron Lovelace" ? "8.8.8.8" : "1.1.1.1",
      address: customerName === "Ada Byron Lovelace" ? "Örnek Mahallesi 1" : "Başka Mahalle 2",
      identityNumber: customerName === "Ada Byron Lovelace" ? "74300864791" : "98765432109",
      city: customerName === "Ada Byron Lovelace" ? "İstanbul" : "Ankara",
      country: "Türkiye",
      postalCode: customerName === "Ada Byron Lovelace" ? "34000" : "06000",
    }),
    basket: Object.freeze([Object.freeze({
      reference: "SKU-1",
      name: basketName,
      quantity: 1,
      unitAmountMinor: 12_345,
      itemType: "PHYSICAL" as const,
    })]),
  };
}

function assertNoRuntimeWork(calls: Calls): void {
  assert.deepEqual({
    begin: calls.begin.length,
    initialized: calls.initialized.length,
    unknown: calls.unknown.length,
    callbackAuthority: calls.callbackAuthority.length,
    reconciliationAuthority: calls.reconciliationAuthority.length,
    settled: calls.settled.length,
    hostedCallbacks: calls.hostedCallbacks.length,
    claims: calls.claims.length,
    finalized: calls.finalized.length,
    initializedAdapter: calls.initializedAdapter.length,
    callbacks: calls.callbacks.length,
    queries: calls.queries.length,
    opens: calls.opens.length,
    authorityChecks: calls.authorityChecks.length,
  }, {
    begin: 0,
    initialized: 0,
    unknown: 0,
    callbackAuthority: 0,
    reconciliationAuthority: 0,
    settled: 0,
    hostedCallbacks: 0,
    claims: 0,
    finalized: 0,
    initializedAdapter: 0,
    callbacks: 0,
    queries: 0,
    opens: 0,
    authorityChecks: 0,
  });
}

async function exerciseInvalidTimeout(value: unknown): Promise<void> {
  const selected = fixture({ providerTimeoutMs: value as number });
  assert.deepEqual(await selected.runtime.initialize(initializeInput()), { kind: "rejected" });
  assert.deepEqual(await selected.runtime.reconcile({
    attemptId: ATTEMPT_ID,
    operationId: "66666666-6666-4666-8666-666666666666",
    expectedVersion: 2,
    workerId: "worker.fixture",
    leaseId: LEASE_ID,
  }), { kind: "rejected" });
  assertNoRuntimeWork(selected.calls);
  assert.equal(selected.opened, undefined);
}

test("zero provider timeout fails closed before begin, claim, credential opening, or adapter scheduling", async () => {
  await exerciseInvalidTimeout(0);
});

test("invalid and hostile provider timeout values fail closed without detached work or unknown mutation", async () => {
  const hostile = new Proxy(Object.create(null) as object, {
    get() { throw new Error("timeout coercion must not run"); },
  });
  for (const value of [-1, 5_001, Number.NaN, Number.POSITIVE_INFINITY, 1.5, "5", null, Symbol("5"), hostile]) {
    await exerciseInvalidTimeout(value);
  }
});

test("positive injected timeout boundaries remain bounded and executable", async () => {
  for (const providerTimeoutMs of [1, 5_000]) {
    const selected = fixture({ providerTimeoutMs });
    assert.deepEqual(await selected.runtime.initialize(initializeInput()), {
      kind: "iframe",
      url: ENDPOINT,
      token: "browser_token_fixture",
    });
    assert.equal(selected.calls.begin.length, 1);
    assert.equal(selected.calls.initializedAdapter.length, 1);
  }
});

test("initializes through durable method/profile authority and projects only iframe browser data", async () => {
  const selected = fixture();
  const presentation = await selected.runtime.initialize(initializeInput());

  assert.deepEqual(presentation, {
    kind: "iframe",
    url: ENDPOINT,
    token: "browser_token_fixture",
  });
  assert.deepEqual(Object.keys(presentation), ["kind", "url", "token"]);
  assert.equal(JSON.stringify(presentation).includes("provider_reference_private"), false);
  assert.equal(JSON.stringify(presentation).includes("credential_secret"), false);
  assert.equal(selected.calls.begin.length, 1);
  assert.equal(selected.calls.begin[0]?.authority.storeId, STORE_ID);
  assert.equal(selected.calls.begin[0]?.callbackBindingDigest,
    createHash("sha256").update(Buffer.alloc(32, 7)).digest("hex"));
  assert.equal(JSON.stringify(selected.calls.begin[0]).includes(Buffer.alloc(32, 7).toString("base64url")), false);
  assert.equal(selected.calls.initializedAdapter.length, 1);
  assert.equal(selected.calls.initializedAdapter[0]?.callbackUrl,
    `https://${HOSTNAME}/api/payments/${PROVIDER}/callback/${Buffer.alloc(32, 7).toString("base64url")}`);
  assert.equal(selected.calls.initializedAdapter[0]?.successUrl,
    `https://${HOSTNAME}/odeme/hizli/sonuc?durum=basarili`);
  assert.equal(selected.calls.initializedAdapter[0]?.failureUrl,
    `https://${HOSTNAME}/odeme/hizli/sonuc?durum=basarisiz`);
  assert.equal(selected.calls.initializedAdapter[0]?.environment, "test");
  assert.equal(selected.calls.initialized.length, 1);
  assert.equal(selected.calls.unknown.length, 0);
  assert.equal(selected.opened?.every((byte) => byte === 0), true);
  assert.deepEqual(selected.calls.initializedAdapter[0]?.credential, {
    merchantId: "",
    merchantKey: "",
  });
  assert.deepEqual(selected.calls.opens[0], {
    envelope: SEALED,
    profileId: PROFILE_ID,
    storeId: STORE_ID,
    providerCode: PROVIDER,
    capability: "payment_processing",
    credentialVersion: 3,
    keyring: KEYRING,
  });
});

test("initialize rejects null malformed superseded and mismatched compiled provider authority before credential open", async () => {
  const rejectedAuthorities = [
    null,
    Object.freeze({ ...COMPILED_AUTHORITY, evidenceDigest: "sha256:stale" }),
    Object.freeze({ ...COMPILED_AUTHORITY, adapterVersion: 2 }),
    Object.freeze({ ...COMPILED_AUTHORITY, providerCode: "other_provider" }),
    Object.freeze({ ...COMPILED_AUTHORITY, environment: "live" as const }),
  ];
  for (const compiledAuthority of rejectedAuthorities) {
    const selected = fixture({ compiledAuthority });
    assert.deepEqual(await selected.runtime.initialize(initializeInput()), { kind: "rejected" });
    assert.equal(selected.calls.begin.length, 1);
    assert.equal(selected.calls.opens.length, 0);
    assert.equal(selected.calls.initializedAdapter.length, 0);
    assert.equal(selected.calls.initialized[0]?.safeCode, "execution_authority_mismatch");
  }
});

test("a durable authority mismatch blocks initialize callback and reconcile before credential or provider access", async () => {
  for (const authorityMatches of [false, new Error("authority_lookup_unavailable")]) {
    const initialized = fixture({ authorityMatches });
    assert.deepEqual(await initialized.runtime.initialize(initializeInput()), { kind: "rejected" });
    assert.equal(initialized.calls.authorityChecks.length, 1);
    assert.deepEqual(initialized.calls.authorityChecks[0], {
      providerCode: PROVIDER,
      capability: "payment_processing",
      environment: "test",
      adapterVersion: 1,
      evidenceDigest: COMPILED_AUTHORITY.evidenceDigest,
    });
    assert.equal(initialized.calls.opens.length, 0);
    assert.equal(initialized.calls.initializedAdapter.length, 0);
    assert.equal(initialized.calls.initialized[0]?.safeCode, "execution_authority_mismatch");

    const callback = fixture({ authorityMatches });
    assert.deepEqual(await callback.runtime.callback({
      request: callbackRequest(),
      providerCode: PROVIDER,
      binding: Buffer.alloc(32, 7).toString("base64url"),
    }), { kind: "rejected" });
    assert.equal(callback.calls.callbackAuthority.length, 1);
    assert.equal(callback.calls.authorityChecks.length, 1);
    assert.equal(callback.calls.opens.length, 0);
    assert.equal(callback.calls.callbacks.length, 0);

    const reconciliation = fixture({ authorityMatches });
    assert.deepEqual(await reconciliation.runtime.reconcile({
      attemptId: ATTEMPT_ID,
      operationId: "66666666-6666-4666-8666-666666666666",
      expectedVersion: 2,
      workerId: "worker.fixture",
      leaseId: LEASE_ID,
    }), { kind: "rejected" });
    assert.equal(reconciliation.calls.reconciliationAuthority.length, 1);
    assert.equal(reconciliation.calls.claims.length, 0);
    assert.equal(reconciliation.calls.authorityChecks.length, 1);
    assert.equal(reconciliation.calls.opens.length, 0);
    assert.equal(reconciliation.calls.queries.length, 0);
    assert.equal(reconciliation.calls.finalized.length, 0);
  }
});

test("attempt-bound superseded evidence blocks initialize callback and reconcile before credential or durable claim", async () => {
  const superseded = Object.freeze({
    executionAdapterVersion: 2,
    executionEvidenceDigest: `sha256:${"b".repeat(64)}`,
  });

  const initialized = fixture({ begin: beginResult(superseded) });
  assert.deepEqual(await initialized.runtime.initialize(initializeInput()), { kind: "rejected" });
  assert.equal(initialized.calls.authorityChecks.length, 0);
  assert.equal(initialized.calls.opens.length, 0);
  assert.equal(initialized.calls.initializedAdapter.length, 0);

  const callback = fixture({ callbackAuthority: authority(superseded) });
  assert.deepEqual(await callback.runtime.callback({
    request: callbackRequest(),
    providerCode: PROVIDER,
    binding: Buffer.alloc(32, 7).toString("base64url"),
  }), { kind: "rejected" });
  assert.equal(callback.calls.authorityChecks.length, 0);
  assert.equal(callback.calls.opens.length, 0);
  assert.equal(callback.calls.callbacks.length, 0);

  const reconciliation = fixture({
    reconciliationAuthority: authority({ status: "provider_outcome_unknown", ...superseded }),
  });
  assert.deepEqual(await reconciliation.runtime.reconcile({
    attemptId: ATTEMPT_ID,
    operationId: "66666666-6666-4666-8666-666666666666",
    expectedVersion: 2,
    workerId: "worker.fixture",
    leaseId: LEASE_ID,
  }), { kind: "rejected" });
  assert.equal(reconciliation.calls.reconciliationAuthority.length, 1);
  assert.equal(reconciliation.calls.authorityChecks.length, 0);
  assert.equal(reconciliation.calls.claims.length, 0);
  assert.equal(reconciliation.calls.opens.length, 0);
  assert.equal(reconciliation.calls.queries.length, 0);
});

test("reconciliation supersession between read and exact claim leaves no provider or finalize work", async () => {
  const selected = fixture({ claim: new Error("durable_authority_invalid") });
  assert.deepEqual(await selected.runtime.reconcile({
    attemptId: ATTEMPT_ID,
    operationId: "66666666-6666-4666-8666-666666666666",
    expectedVersion: 2,
    workerId: "worker.fixture",
    leaseId: LEASE_ID,
  }), { kind: "rejected" });
  assert.equal(selected.calls.reconciliationAuthority.length, 1);
  assert.equal(selected.calls.authorityChecks.length, 1);
  assert.equal(selected.calls.claims.length, 1);
  assert.equal(selected.calls.opens.length, 0);
  assert.equal(selected.calls.queries.length, 0);
  assert.equal(selected.calls.finalized.length, 0);
});

test("provider-specific projection keeps buyer PII in memory, sends iyzico its real fields, and preserves PayTR input", async () => {
  const paytrA = providerProjectionFixture("paytr_iframe");
  const paytrB = providerProjectionFixture("paytr_iframe");
  const iyzico = providerProjectionFixture("iyzico_iframe");

  assert.deepEqual(await paytrA.runtime.initialize(providerInput()), { kind: "processing" });
  assert.deepEqual(await paytrB.runtime.initialize(providerInput("Grace Brewster Hopper", "Başka ürün")), { kind: "processing" });
  assert.deepEqual(await iyzico.runtime.initialize(providerInput()), { kind: "processing" });

  assert.deepEqual(Object.keys(paytrA.initializedInputs[0]!.customer), [
    "name", "email", "phone", "ipAddress", "address",
  ]);
  assert.deepEqual(Object.keys(paytrA.initializedInputs[0]!.basket[0]!), [
    "reference", "name", "quantity", "unitAmountMinor",
  ]);
  assert.deepEqual(paytrA.initializedInputs[0]!.customer, {
    name: "Ada Byron Lovelace",
    email: "ada@example.test",
    phone: "+905551112233",
    ipAddress: "8.8.8.8",
    address: "Örnek Mahallesi 1",
  });
  assert.deepEqual(Object.keys(iyzico.initializedInputs[0]!.customer), [
    "name", "email", "phone", "ipAddress", "address", "identityNumber", "city", "country", "postalCode",
  ]);
  assert.deepEqual(Object.keys(iyzico.initializedInputs[0]!.basket[0]!), [
    "reference", "name", "quantity", "unitAmountMinor", "itemType",
  ]);
  assert.equal(iyzico.initializedInputs[0]!.customer.identityNumber, "74300864791");
  assert.equal(iyzico.initializedInputs[0]!.basket[0]!.itemType, "PHYSICAL");
  assert.equal(Object.isFrozen(iyzico.initializedInputs[0]!.customer), true);
  assert.equal(Object.isFrozen(iyzico.initializedInputs[0]!.basket), true);
  assert.equal(Object.isFrozen(iyzico.initializedInputs[0]!.basket[0]), true);
  assert.equal(paytrA.beginCalls[0]!.fingerprint, paytrB.beginCalls[0]!.fingerprint);
  assert.doesNotMatch(JSON.stringify(paytrA.beginCalls[0]), /Ada|Lovelace|example[.]test|Örnek Mahallesi|Gerçek ürün/);
  assert.equal(paytrA.opens.length, 1);
  assert.equal(iyzico.opens.length, 1);
});

test("iyzico projection rejects missing real buyer authority without opening credentials or inventing defaults", async () => {
  const complete = providerInput();
  const { identityNumber: _identityNumber, ...withoutIdentity } = complete.customer;
  const { city: _city, ...withoutCity } = complete.customer;
  const { country: _country, ...withoutCountry } = complete.customer;
  const { itemType: _itemType, ...withoutItemType } = complete.basket[0]!;
  const candidates = [
    { ...complete, customer: Object.freeze(withoutIdentity) },
    { ...complete, customer: Object.freeze(withoutCity) },
    { ...complete, customer: Object.freeze(withoutCountry) },
    { ...complete, basket: Object.freeze([Object.freeze(withoutItemType)]) },
  ];
  for (const candidate of candidates) {
    const selected = providerProjectionFixture("iyzico_iframe");
    assert.deepEqual(await selected.runtime.initialize(candidate), { kind: "rejected" });
    assert.equal(selected.beginCalls.length, 1);
    assert.equal(selected.opens.length, 0);
    assert.equal(selected.initializedInputs.length, 0);
  }
});

test("fails closed before provider execution for untrusted host, missing adapter, and environment mismatch", async () => {
  const untrusted = fixture({ trusted: false });
  assert.deepEqual(await untrusted.runtime.initialize(initializeInput()), { kind: "rejected" });
  assert.equal(untrusted.calls.begin.length, 0);

  const missing = fixture({ adapterPresent: false });
  assert.deepEqual(await missing.runtime.initialize(initializeInput()), { kind: "rejected" });
  assert.equal(missing.calls.initializedAdapter.length, 0);
  assert.equal(missing.calls.initialized[0]?.safeCode, "adapter_not_registered");

  const mismatch = fixture({ begin: beginResult({
    publicConfig: Object.freeze({ environment: "live", merchantId: "merchant_fixture" }),
  }) });
  assert.deepEqual(await mismatch.runtime.initialize(initializeInput()), { kind: "rejected" });
  assert.equal(mismatch.calls.initializedAdapter.length, 0);
  assert.equal(mismatch.calls.initialized[0]?.safeCode, "environment_mismatch");
});

test("rejects sparse basket authority before creating a durable attempt", async () => {
  const selected = fixture();
  const input = initializeInput();
  const sparse = new Array(1) as typeof input.basket;
  assert.deepEqual(await selected.runtime.initialize({ ...input, basket: sparse }), { kind: "rejected" });
  assert.equal(selected.calls.begin.length, 0);
  assert.equal(selected.calls.initializedAdapter.length, 0);
});

test("rejects non-wipeable parsed credential configuration before provider execution", async () => {
  const selected = fixture({ freezeCredential: true });
  assert.deepEqual(await selected.runtime.initialize(initializeInput()), { kind: "rejected" });
  assert.equal(selected.calls.initializedAdapter.length, 0);
  assert.equal(selected.calls.initialized[0]?.safeCode, "credential_invalid");
  assert.equal(selected.opened?.every((byte) => byte === 0), true);
});

test("classifies timeout and malformed browser URLs as durable unknown without retry", async () => {
  const timeout = fixture({ initialization: new DOMException("provider detail", "TimeoutError") });
  assert.deepEqual(await timeout.runtime.initialize(initializeInput()), { kind: "processing" });
  assert.equal(timeout.calls.initializedAdapter.length, 1);
  assert.equal(timeout.calls.unknown.length, 1);
  assert.equal(timeout.calls.unknown[0]?.safeCode, "provider_outcome_unknown");
  assert.equal(timeout.calls.initialized.length, 0);

  const forged = fixture({ initialization: Object.freeze({
    kind: "redirect",
    url: "https://attacker.example/collect",
    providerReference: "provider_reference_private",
  }) });
  assert.deepEqual(await forged.runtime.initialize(initializeInput()), { kind: "processing" });
  assert.equal(forged.calls.unknown.length, 1);
  assert.equal(forged.calls.initialized.length, 0);
});

test("accepts only the provider-owned token presentation prefix paired to the exact token", async () => {
  const dynamicPacket: PaymentAdapterPacket = Object.freeze({
    ...PACKET,
    presentation: Object.freeze({
      test: Object.freeze({
        kind: "provider_token_url" as const,
        urlPrefix: "https://www.paytr.com/odeme/guvenli/",
        token: Object.freeze({
          alphabet: "base64url" as const,
          minimum: 32,
          maximum: 256,
        }),
      }),
      live: Object.freeze({
        kind: "provider_token_url" as const,
        urlPrefix: "https://www.paytr.com/odeme/guvenli/",
        token: Object.freeze({
          alphabet: "base64url" as const,
          minimum: 32,
          maximum: 256,
        }),
      }),
    }),
  });
  const token = "a".repeat(32);
  const valid = fixture({
    packet: dynamicPacket,
    initialization: Object.freeze({
      kind: "iframe",
      url: `https://www.paytr.com/odeme/guvenli/${token}`,
      token,
      providerReference: "4bb06f8e4e3a7715d201d573d0aa423762e55dabd61a2c02278fa56cc6d294e0",
    }),
  });
  assert.deepEqual(await valid.runtime.initialize(initializeInput()), {
    kind: "iframe",
    url: `https://www.paytr.com/odeme/guvenli/${token}`,
    token,
  });

  for (const [url, invalidToken] of [
    [`https://attacker.example/odeme/guvenli/${token}`, token],
    [`https://www.paytr.com/odeme/api/get-token/${token}`, token],
    [`https://www.paytr.com/odeme/guvenli/${token}?next=evil`, token],
    [`https://www.paytr.com/odeme/guvenli/${token}b`, token],
    [`https://www.paytr.com/odeme/guvenli/${"a".repeat(31)}`, "a".repeat(31)],
    [`https://www.paytr.com/odeme/guvenli/${"a".repeat(31)}+`, `${"a".repeat(31)}+`],
  ]) {
    const selected = fixture({
      packet: dynamicPacket,
      initialization: Object.freeze({
        kind: "iframe",
        url,
        token: invalidToken,
        providerReference: null,
      }),
    });
    assert.deepEqual(await selected.runtime.initialize(initializeInput()), {
      kind: "processing",
    });
    assert.equal(selected.calls.unknown.length, 1);
    assert.equal(selected.calls.initialized.length, 0);
  }
});

test("accepts only the exact provider-owned root query-token presentation", async () => {
  const token = "a".repeat(36);
  const queryPacket: PaymentAdapterPacket = Object.freeze({
    ...PACKET,
    callbackResponse: "customer_return",
    presentation: Object.freeze({
      test: Object.freeze({
        kind: "provider_query_token_url" as const,
        origin: "https://sandbox-cpp.iyzipay.com",
        pathname: "/" as const,
        tokenParameter: "token" as const,
        languageParameter: "lang" as const,
        language: "tr" as const,
        token: Object.freeze({
          alphabet: "base64url" as const,
          minimum: 36,
          maximum: 256,
        }),
      }),
      live: Object.freeze({
        kind: "provider_query_token_url" as const,
        origin: "https://cpp.iyzipay.com",
        pathname: "/" as const,
        tokenParameter: "token" as const,
        languageParameter: "lang" as const,
        language: "tr" as const,
        token: Object.freeze({
          alphabet: "base64url" as const,
          minimum: 36,
          maximum: 256,
        }),
      }),
    }),
  });
  for (const url of [
    `https://sandbox-cpp.iyzipay.com?token=${token}&lang=tr`,
    `https://sandbox-cpp.iyzipay.com/?token=${token}&lang=tr`,
  ]) {
    const selected = fixture({
      packet: queryPacket,
      initialization: Object.freeze({
        kind: "iframe",
        url,
        token,
        providerReference: token,
      }),
    });
    assert.deepEqual(await selected.runtime.initialize(initializeInput()), {
      kind: "iframe", url, token,
    });
    assert.equal(selected.calls.unknown.length, 0);
  }

  for (const url of [
    `https://sandbox-cpp.iyzipay.com/?lang=tr&token=${token}`,
    `https://sandbox-cpp.iyzipay.com/?token=${token}&lang=tr&next=evil`,
    `https://sandbox-cpp.iyzipay.com/path?token=${token}&lang=tr`,
    `https://attacker.example/?token=${token}&lang=tr`,
    `https://sandbox-cpp.iyzipay.com/?token=${token}b&lang=tr`,
  ]) {
    const selected = fixture({
      packet: queryPacket,
      initialization: Object.freeze({
        kind: "iframe", url, token, providerReference: token,
      }),
    });
    assert.deepEqual(await selected.runtime.initialize(initializeInput()), { kind: "processing" });
    assert.equal(selected.calls.unknown.length, 1);
    assert.equal(selected.calls.initialized.length, 0);
  }
});

test("persists an adapter-selected provider reference when initialization outcome is unknown", async () => {
  const providerReference = "4bb06f8e4e3a7715d201d573d0aa423762e55dabd61a2c02278fa56cc6d294e0";
  const selected = fixture({
    initialization: Object.freeze({
      kind: "unknown",
      code: "provider_outcome_unknown",
      providerReference,
    }),
  });
  assert.deepEqual(await selected.runtime.initialize(initializeInput()), {
    kind: "processing",
  });
  assert.equal(selected.calls.unknown.length, 1);
  assert.equal(selected.calls.unknown[0]?.providerReference, providerReference);
});

test("an already-begun operation never invents a replacement callback binding or calls the provider", async () => {
  const selected = fixture({ begin: beginResult({ outcome: "replayed" }) });
  assert.deepEqual(await selected.runtime.initialize(initializeInput()), { kind: "processing" });
  assert.equal(selected.calls.opens.length, 0);
  assert.equal(selected.calls.initializedAdapter.length, 0);
  assert.equal(selected.calls.initialized.length, 0);
  assert.equal(selected.calls.unknown.length, 0);
});

function callbackRequest(
  providerCode = PROVIDER,
  binding = Buffer.alloc(32, 7).toString("base64url"),
  headers: Readonly<Record<string, string>> = {},
): Request {
  const body = "event_id=provider_event_1&status=success";
  return new Request(`https://${HOSTNAME}/api/payments/${providerCode}/callback/${binding}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "content-length": String(Buffer.byteLength(body)),
      "x-provider-signature": "signature_fixture",
      ...headers,
    },
    body,
  });
}

function digestCallbackRequest(
  body = "event_id=provider_event_1&status=success",
): Request {
  return new Request(`https://${HOSTNAME}/api/payments/paytr/callback`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "content-length": String(Buffer.byteLength(body)),
    },
    body,
  });
}

test("settles a fixed-path callback selected directly by its digest authority", async () => {
  const selected = fixture();
  const result = await selected.runtime.callbackByDigest({
    request: digestCallbackRequest(),
    providerCode: PROVIDER,
    callbackBindingDigest: DIGEST,
  });

  assert.deepEqual(result, { kind: "accepted" });
  assert.deepEqual(selected.calls.callbackAuthority[0], {
    providerCode: PROVIDER,
    callbackBindingDigest: DIGEST,
    now: NOW,
  });
  assert.equal(selected.calls.callbacks.length, 1);
  assert.equal(selected.calls.hostedCallbacks.length, 1);
});

test("digest callback exposes not-found only for authority absence and never after verification or commit uncertainty", async () => {
  const missing = fixture({
    callbackAuthority: new PaymentAttemptRepositoryError("not_found"),
  });
  assert.deepEqual(await missing.runtime.callbackByDigest({
    request: digestCallbackRequest(),
    providerCode: PROVIDER,
    callbackBindingDigest: DIGEST,
  }), { kind: "not_found" });

  const invalid = fixture({ callback: new Error("invalid signature") });
  assert.deepEqual(await invalid.runtime.callbackByDigest({
    request: digestCallbackRequest(),
    providerCode: PROVIDER,
    callbackBindingDigest: DIGEST,
  }), { kind: "rejected" });

  const uncertain = fixture({
    settlement: new PaymentAttemptRepositoryError("commit_unknown"),
  });
  assert.deepEqual(await uncertain.runtime.callbackByDigest({
    request: digestCallbackRequest(),
    providerCode: PROVIDER,
    callbackBindingDigest: DIGEST,
  }), { kind: "retry" });
});

test("forwards only explicit provider callback data headers and never private proxy authority", async () => {
  const selected = fixture();
  const binding = Buffer.alloc(32, 7).toString("base64url");
  const result = await selected.runtime.callback({
    request: callbackRequest(PROVIDER, binding, {
      host: "storefront.internal:3450",
      forwarded: "host=forged.example;proto=http",
      "x-celebix-storefront-proxy": `p1.${Buffer.alloc(32, 0x41).toString("base64url")}`,
      "x-forwarded-for": "203.0.113.7",
      "x-forwarded-host": HOSTNAME,
      "x-forwarded-proto": "https",
      "x-original-host": "forged.example",
    }),
    providerCode: PROVIDER,
    binding,
  });

  assert.deepEqual(result, { kind: "accepted" });
  assert.deepEqual(selected.calls.callbacks[0]?.headers, {
    "content-length": "40",
    "content-type": "application/x-www-form-urlencoded",
    "x-provider-signature": "signature_fixture",
  });
  assert.equal(JSON.stringify(selected.calls.callbacks[0]?.headers).includes("storefront-proxy"), false);
  assert.equal(JSON.stringify(selected.calls.callbacks[0]?.headers).includes("forged.example"), false);
});

test("rejects coalesced trusted-host authority before repository or provider execution", async () => {
  const coalescedAuthorities: Readonly<Record<string, string>>[] = [
    { "x-forwarded-host": `${HOSTNAME}, attacker.example` },
    { "x-forwarded-proto": "https, https" },
    { "x-celebix-storefront-proxy": "p1.first, p1.second" },
    { forwarded: "for=203.0.113.7, for=203.0.113.8" },
  ];
  for (const headers of coalescedAuthorities) {
    const selected = fixture();
    const binding = Buffer.alloc(32, 7).toString("base64url");
    assert.deepEqual(await selected.runtime.callback({
      request: callbackRequest(PROVIDER, binding, headers),
      providerCode: PROVIDER,
      binding,
    }), { kind: "rejected" });
    assert.equal(selected.calls.callbackAuthority.length, 0);
    assert.equal(selected.calls.callbacks.length, 0);
  }
});

test("settles only a verified callback selected through provider and binding digest authority", async () => {
  const selected = fixture();
  const binding = Buffer.alloc(32, 7).toString("base64url");
  const result = await selected.runtime.callback({
    request: callbackRequest(PROVIDER, binding),
    providerCode: PROVIDER,
    binding,
  });

  assert.deepEqual(result, { kind: "accepted" });
  assert.equal(selected.calls.callbackAuthority.length, 1);
  assert.deepEqual(selected.calls.callbackAuthority[0], {
    providerCode: PROVIDER,
    callbackBindingDigest: createHash("sha256").update(Buffer.alloc(32, 7)).digest("hex"),
    now: NOW,
  });
  assert.equal(selected.calls.callbacks.length, 1);
  assert.equal(selected.calls.callbacks[0]?.expected.attemptId, ATTEMPT_ID);
  assert.equal(selected.calls.callbacks[0]?.expected.orderReference, "ORDER-100");
  assert.equal(selected.calls.callbacks[0]?.expected.providerReference, null);
  assert.equal(selected.calls.callbacks[0]?.signal instanceof AbortSignal, true);
  assert.equal(selected.calls.hostedCallbacks.length, 1);
  assert.equal(selected.calls.hostedCallbacks[0]?.status, "captured");
  assert.equal(selected.calls.hostedCallbacks[0]?.amountMinor, 12_345);
  assert.equal(selected.calls.hostedCallbacks[0]?.currency, "TRY");
  assert.equal(selected.calls.hostedCallbacks[0]?.eventKeyDigest,
    createHash("sha256").update("provider_event_1", "utf8").digest("hex"));
  assert.equal(selected.calls.hostedCallbacks[0]?.callbackBindingDigest,
    createHash("sha256").update(Buffer.alloc(32, 7)).digest("hex"));
  assert.equal(selected.calls.callbacks[0]?.body.every((byte) => byte === 0), true);
  assert.equal(selected.opened?.every((byte) => byte === 0), true);
});

test("customer-return callbacks project only fixed success and failure outcomes after exact settlement", async () => {
  for (const [status, expectedOutcome, expectedSettlement] of [
    ["succeeded", "success", "captured"],
    ["failed", "failure", "failed"],
  ] as const) {
    const selected = fixture({
      packet: callbackPacket("customer_return"),
      callbackAuthority: authority({ providerReference: "provider_reference_private" }),
      callback: Object.freeze({
        eventKey: `provider_event_${status}`,
        status,
        providerReference: "provider_reference_private",
        paidAmountMinor: 12_345,
        currency: "TRY",
        safeCode: status === "succeeded" ? "payment_captured" : "payment_failed",
      }),
    });
    const result = await selected.runtime.callback({
      request: callbackRequest(),
      providerCode: PROVIDER,
      binding: Buffer.alloc(32, 7).toString("base64url"),
    });
    assert.deepEqual(result, { kind: "customer_return", outcome: expectedOutcome });
    assert.equal(selected.calls.hostedCallbacks.length, 1);
    assert.equal(selected.calls.hostedCallbacks[0]?.status, expectedSettlement);
    assert.equal(selected.calls.unknown.length, 0);
    assert.equal(selected.calls.callbacks[0]?.expected.providerReference, "provider_reference_private");
  }
});

test("hosted iframe callbacks settle directly from the initialized awaiting_customer authority", async () => {
  const selected = fixture({
    packet: callbackPacket("customer_return"),
    callbackAuthority: authority({
      status: "awaiting_customer",
      version: 2,
      providerReference: "provider_reference_private",
    }),
  });

  const result = await selected.runtime.callback({
    request: callbackRequest(),
    providerCode: PROVIDER,
    binding: Buffer.alloc(32, 7).toString("base64url"),
  });

  assert.deepEqual(result, { kind: "customer_return", outcome: "success" });
  assert.equal(selected.calls.settled.length, 0);
  assert.equal(selected.calls.hostedCallbacks.length, 1);
  assert.equal(selected.calls.hostedCallbacks[0]?.expectedVersion, 2);
});

test("a changed terminal callback after durable unknown remains processing for reconciliation", async () => {
  for (const [mode, expected] of [
    ["provider_ack", { kind: "retry" }],
    ["customer_return", { kind: "customer_return", outcome: "processing" }],
  ] as const) {
    const selected = fixture({
      packet: callbackPacket(mode),
      callbackAuthority: authority({
        status: "provider_outcome_unknown",
        version: 3,
        providerReference: "provider_reference_private",
      }),
    });

    const result = await selected.runtime.callback({
      request: callbackRequest(),
      providerCode: PROVIDER,
      binding: Buffer.alloc(32, 7).toString("base64url"),
    });

    assert.deepEqual(result, expected);
    assert.equal(selected.calls.hostedCallbacks.length, 1);
    assert.equal(selected.calls.hostedCallbacks[0]?.status, "captured");
    assert.equal(selected.calls.claims.length, 0);
  }
});

test("fraud review becomes durable unknown and returns processing without capture or failure", async () => {
  const selected = fixture({
    packet: callbackPacket("customer_return"),
    callbackAuthority: authority({ providerReference: "provider_reference_private" }),
    callback: Object.freeze({
      eventKey: "iyzico:payment_fixture:0",
      status: "pending",
      providerReference: "provider_reference_private",
      paidAmountMinor: 12_345,
      currency: "TRY",
      safeCode: "fraud_review",
    }),
  });
  const result = await selected.runtime.callback({
    request: callbackRequest(),
    providerCode: PROVIDER,
    binding: Buffer.alloc(32, 7).toString("base64url"),
  });

  assert.deepEqual(result, { kind: "customer_return", outcome: "processing" });
  assert.equal(selected.calls.settled.length, 0);
  assert.equal(selected.calls.unknown.length, 0);
  assert.equal(selected.calls.hostedCallbacks.length, 1);
  assert.equal(selected.calls.hostedCallbacks[0]?.expectedVersion, 2);
  assert.equal(selected.calls.hostedCallbacks[0]?.providerReference, "provider_reference_private");
  assert.equal(selected.calls.hostedCallbacks[0]?.safeCode, "fraud_review");
  assert.equal(selected.calls.hostedCallbacks[0]?.status, "provider_outcome_unknown");
  assert.equal(selected.calls.hostedCallbacks[0]?.eventKeyDigest,
    createHash("sha256").update("iyzico:payment_fixture:0", "utf8").digest("hex"));
});

test("temporary callback result becomes durable unknown while preserving each callback presentation mode", async () => {
  for (const [mode, expected] of [
    ["provider_ack", { kind: "retry" }],
    ["customer_return", { kind: "customer_return", outcome: "processing" }],
  ] as const) {
    const selected = fixture({
      packet: callbackPacket(mode),
      callbackAuthority: authority({ providerReference: "provider_reference_private" }),
      callback: Object.freeze({
        eventKey: "iyzico:provider_reference_private:retry",
        status: "retry",
        providerReference: "provider_reference_private",
        paidAmountMinor: 0,
        currency: "TRY",
        safeCode: "provider_temporarily_unavailable",
      }),
    });
    const result = await selected.runtime.callback({
      request: callbackRequest(),
      providerCode: PROVIDER,
      binding: Buffer.alloc(32, 7).toString("base64url"),
    });
    assert.deepEqual(result, expected);
    assert.equal(selected.calls.settled.length, 0);
    assert.equal(selected.calls.unknown.length, 0);
    assert.equal(selected.calls.hostedCallbacks.length, 1);
    assert.equal(selected.calls.hostedCallbacks[0]?.safeCode, "provider_temporarily_unavailable");
  }
});

test("callback deadline aborts verification, persists unknown, and ignores a late success", async () => {
  const late = deferred<VerifiedProviderCallback>();
  const selected = fixture({
    packet: callbackPacket("customer_return"),
    callbackAuthority: authority({ providerReference: "provider_reference_private" }),
    callbackAdapter: () => late.promise,
    providerTimeoutMs: 5,
  });
  const result = await selected.runtime.callback({
    request: callbackRequest(),
    providerCode: PROVIDER,
    binding: Buffer.alloc(32, 7).toString("base64url"),
  });

  assert.deepEqual(result, { kind: "customer_return", outcome: "processing" });
  assert.equal(selected.calls.callbacks[0]?.signal?.aborted, true);
  assert.equal(selected.calls.settled.length, 0);
  assert.equal(selected.calls.unknown.length, 0);
  assert.equal(selected.calls.hostedCallbacks.length, 1);
  assert.equal(selected.calls.hostedCallbacks[0]?.safeCode, "provider_verification_timeout");
  assert.equal(selected.opened?.every((byte) => byte === 0), true);

  late.resolve(Object.freeze({
    eventKey: "late_success",
    status: "succeeded",
    providerReference: "provider_reference_private",
    paidAmountMinor: 12_345,
    currency: "TRY",
    safeCode: "payment_captured",
  }));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(selected.calls.settled.length, 0);
  assert.equal(selected.calls.hostedCallbacks.length, 1);
});

test("rejects wrong provider, unknown binding, signature failure, amount/currency/reference mismatch, and replay mismatch", async () => {
  const wrongProvider = fixture({ callbackAuthority: authority({ providerCode: "other_provider" }) });
  assert.deepEqual(await wrongProvider.runtime.callback({
    request: callbackRequest(),
    providerCode: PROVIDER,
    binding: Buffer.alloc(32, 7).toString("base64url"),
  }), { kind: "rejected" });
  assert.equal(wrongProvider.calls.callbacks.length, 0);

  const unknown = fixture({ callbackAuthority: new Error("callback_not_found raw detail") });
  assert.deepEqual(await unknown.runtime.callback({
    request: callbackRequest(),
    providerCode: PROVIDER,
    binding: Buffer.alloc(32, 7).toString("base64url"),
  }), { kind: "rejected" });

  const badSignature = fixture({ callback: new Error("signature bytes raw detail") });
  assert.deepEqual(await badSignature.runtime.callback({
    request: callbackRequest(),
    providerCode: PROVIDER,
    binding: Buffer.alloc(32, 7).toString("base64url"),
  }), { kind: "rejected" });
  assert.equal(badSignature.calls.hostedCallbacks.length, 0);

  for (const verified of [
    Object.freeze({
      eventKey: "provider_event_1", status: "succeeded" as const,
      providerReference: null, paidAmountMinor: 12_346, currency: "TRY",
      safeCode: "payment_captured",
    }),
    Object.freeze({
      eventKey: "provider_event_1", status: "succeeded" as const,
      providerReference: null, paidAmountMinor: 12_345, currency: "USD",
      safeCode: "payment_captured",
    }),
  ]) {
    const mismatch = fixture({ callback: verified });
    assert.deepEqual(await mismatch.runtime.callback({
      request: callbackRequest(),
      providerCode: PROVIDER,
      binding: Buffer.alloc(32, 7).toString("base64url"),
    }), { kind: "rejected" });
    assert.equal(mismatch.calls.hostedCallbacks.length, 0);
  }

  const referenceMismatch = fixture({
    callbackAuthority: authority({ providerReference: "expected_provider_reference" }),
    callback: Object.freeze({
      eventKey: "provider_event_1",
      status: "succeeded" as const,
      providerReference: "different_provider_reference",
      paidAmountMinor: 12_345,
      currency: "TRY",
      safeCode: "payment_captured",
    }),
  });
  assert.deepEqual(await referenceMismatch.runtime.callback({
    request: callbackRequest(),
    providerCode: PROVIDER,
    binding: Buffer.alloc(32, 7).toString("base64url"),
  }), { kind: "rejected" });
  assert.equal(referenceMismatch.calls.hostedCallbacks.length, 0);

  const replayMismatch = fixture({ settlement: hostedMutation({
    attemptId: "77777777-7777-4777-8777-777777777777",
    status: "captured",
    safeCode: "payment_captured",
    replayed: true,
  }) });
  assert.deepEqual(await replayMismatch.runtime.callback({
    request: callbackRequest(),
    providerCode: PROVIDER,
    binding: Buffer.alloc(32, 7).toString("base64url"),
  }), { kind: "rejected" });

  const exactReplay = fixture({ settlement: hostedMutation({
    status: "captured",
    safeCode: "payment_captured",
    replayed: true,
    disposition: "replayed",
  }) });
  assert.deepEqual(await exactReplay.runtime.callback({
    request: callbackRequest(),
    providerCode: PROVIDER,
    binding: Buffer.alloc(32, 7).toString("base64url"),
  }), { kind: "accepted" });
});

test("reconciliation queries once under the claimed immutable authority and finalizes exact outcomes", async () => {
  const selected = fixture();
  const result = await selected.runtime.reconcile({
    attemptId: ATTEMPT_ID,
    operationId: "66666666-6666-4666-8666-666666666666",
    expectedVersion: 2,
    workerId: "worker.fixture",
    leaseId: LEASE_ID,
  });

  assert.deepEqual(result, { kind: "captured" });
  assert.equal(selected.calls.claims.length, 1);
  assert.equal(selected.calls.queries.length, 1);
  assert.equal(selected.calls.finalized.length, 1);
  assert.equal(selected.calls.finalized[0]?.expectedVersion, 3);
  assert.equal(selected.calls.finalized[0]?.status, "captured");
  assert.equal(selected.calls.finalized[0]?.amountMinor, 12_345);
  assert.equal(selected.calls.finalized[0]?.currency, "TRY");
  assert.equal(selected.opened?.every((byte) => byte === 0), true);
});

test("local query rejection and invalid configuration leave reconciliation unfinalized", async () => {
  const refused = fixture({
    query: Object.freeze({
      kind: "rejected",
      code: "invalid_request",
    }) as unknown as HostedPaymentStatus,
  });
  assert.deepEqual(await refused.runtime.reconcile({
    attemptId: ATTEMPT_ID,
    operationId: "66666666-6666-4666-8666-666666666666",
    expectedVersion: 2,
    workerId: "worker.fixture",
    leaseId: LEASE_ID,
  }), { kind: "rejected" });
  assert.equal(refused.calls.queries.length, 1);
  assert.equal(refused.calls.finalized.length, 0);
  assert.equal(refused.opened?.every((byte) => byte === 0), true);

  const invalidCredential = fixture({ freezeCredential: true });
  assert.deepEqual(await invalidCredential.runtime.reconcile({
    attemptId: ATTEMPT_ID,
    operationId: "77777777-7777-4777-8777-777777777777",
    expectedVersion: 2,
    workerId: "worker.fixture",
    leaseId: LEASE_ID,
  }), { kind: "rejected" });
  assert.equal(invalidCredential.calls.queries.length, 0);
  assert.equal(invalidCredential.calls.finalized.length, 0);
  assert.equal(invalidCredential.opened?.every((byte) => byte === 0), true);

  const missingAdapter = fixture({ adapterPresent: false });
  assert.deepEqual(await missingAdapter.runtime.reconcile({
    attemptId: ATTEMPT_ID,
    operationId: "88888888-8888-4888-8888-888888888888",
    expectedVersion: 2,
    workerId: "worker.fixture",
    leaseId: LEASE_ID,
  }), { kind: "rejected" });
  assert.equal(missingAdapter.calls.opens.length, 0);
  assert.equal(missingAdapter.calls.queries.length, 0);
  assert.equal(missingAdapter.calls.finalized.length, 0);
});

test("provider query ambiguity still finalizes durable unknown without adopting a new reference", async () => {
  const selected = fixture({
    claim: { providerReference: null },
    query: Object.freeze({
      kind: "unknown" as const,
      providerReference: "untrusted_new_reference",
    }),
  });
  assert.deepEqual(await selected.runtime.reconcile({
    attemptId: ATTEMPT_ID,
    operationId: "99999999-9999-4999-8999-999999999999",
    expectedVersion: 2,
    workerId: "worker.fixture",
    leaseId: LEASE_ID,
  }), { kind: "processing" });
  assert.equal(selected.calls.queries.length, 1);
  assert.equal(selected.calls.finalized.length, 1);
  assert.equal(selected.calls.finalized[0]?.status, "provider_outcome_unknown");
  assert.equal(selected.calls.finalized[0]?.providerReference, null);
});

test("reconciliation keeps claim reference when provider reports 101 for an expected 100", async () => {
  const selected = fixture({
    claim: { amountMinor: 100, providerReference: null },
    query: Object.freeze({
      kind: "succeeded" as const,
      providerReference: "untrusted_reference_101",
      paidAmountMinor: 101,
      currency: "TRY",
    }),
  });
  const result = await selected.runtime.reconcile({
    attemptId: ATTEMPT_ID,
    operationId: "66666666-6666-4666-8666-666666666666",
    expectedVersion: 2,
    workerId: "worker.fixture",
    leaseId: LEASE_ID,
  });

  assert.deepEqual(result, { kind: "processing" });
  assert.equal(selected.calls.finalized.length, 1);
  assert.equal(selected.calls.finalized[0]?.status, "provider_outcome_unknown");
  assert.equal(selected.calls.finalized[0]?.providerReference, null);
  assert.equal(selected.calls.finalized[0]?.amountMinor, 100);
});

test("initialize enforces its deadline, aborts, wipes credentials, and ignores a late provider result", async () => {
  const late = deferred<HostedPaymentInitialization>();
  const selected = fixture({
    initializeAdapter: () => late.promise,
    providerTimeoutMs: 5,
  });
  const result = await selected.runtime.initialize(initializeInput());

  assert.deepEqual(result, { kind: "processing" });
  assert.equal(selected.calls.initializedAdapter[0]?.signal.aborted, true);
  assert.equal(selected.calls.unknown.length, 1);
  assert.equal(selected.calls.initialized.length, 0);
  assert.equal(selected.opened?.every((byte) => byte === 0), true);
  assert.deepEqual(selected.calls.initializedAdapter[0]?.credential, {
    merchantId: "",
    merchantKey: "",
  });

  late.resolve(Object.freeze({
    kind: "iframe",
    url: ENDPOINT,
    token: "late_browser_token",
    providerReference: "late_provider_reference",
  }));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(selected.calls.unknown.length, 1);
  assert.equal(selected.calls.initialized.length, 0);
});

test("query enforces its deadline, finalizes unknown, and contains a late rejection", async () => {
  const late = deferred<HostedPaymentStatus>();
  const selected = fixture({
    queryAdapter: () => late.promise,
    providerTimeoutMs: 5,
  });
  const result = await selected.runtime.reconcile({
    attemptId: ATTEMPT_ID,
    operationId: "66666666-6666-4666-8666-666666666666",
    expectedVersion: 2,
    workerId: "worker.fixture",
    leaseId: LEASE_ID,
  });

  assert.deepEqual(result, { kind: "processing" });
  assert.equal(selected.calls.queries[0]?.signal.aborted, true);
  assert.equal(selected.calls.finalized.length, 1);
  assert.equal(selected.calls.finalized[0]?.status, "provider_outcome_unknown");
  assert.equal(selected.opened?.every((byte) => byte === 0), true);

  late.reject(new Error("late provider rejection must remain contained"));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(selected.calls.finalized.length, 1);
});

test("reconciliation never finalizes with stale time authority after its lease expires during query", async () => {
  let current = new Date(NOW);
  const selected = fixture({
    now: () => new Date(current),
    queryAdapter: async () => {
      current = new Date(NOW.getTime() + 60_000);
      return Object.freeze({
        kind: "succeeded" as const,
        providerReference: "provider_reference_private",
        paidAmountMinor: 12_345,
        currency: "TRY",
      });
    },
  });
  const result = await selected.runtime.reconcile({
    attemptId: ATTEMPT_ID,
    operationId: "66666666-6666-4666-8666-666666666666",
    expectedVersion: 2,
    workerId: "worker.fixture",
    leaseId: LEASE_ID,
  });

  assert.deepEqual(result, { kind: "processing" });
  assert.equal(selected.calls.queries.length, 1);
  assert.equal(selected.calls.finalized.length, 0);
});

test("callback route maps only stable acknowledgements and fails closed without a runtime", async () => {
  const callbackInputs: unknown[] = [];
  const runtime: HostedPaymentRuntime = Object.freeze({
    initialize: async () => Object.freeze({ kind: "rejected" }),
    reconcile: async () => Object.freeze({ kind: "rejected" }),
    callbackByDigest: async () => Object.freeze({ kind: "rejected" }),
    callback: async (input) => {
      callbackInputs.push(input);
      return Object.freeze({ kind: "accepted" });
    },
  });
  const route = createHostedPaymentCallbackRoute({
    resolveRuntime: async () => runtime,
  });
  const binding = Buffer.alloc(32, 7).toString("base64url");
  const response = await route(callbackRequest(), {
    params: Promise.resolve({ providerCode: PROVIDER, binding }),
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "OK");
  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(callbackInputs, [{
    request: callbackInputs.length === 1
      ? (callbackInputs[0] as { request: Request }).request
      : null,
    providerCode: PROVIDER,
    binding,
  }]);

  const retryRoute = createHostedPaymentCallbackRoute({
    resolveRuntime: async () => Object.freeze({
      ...runtime,
      callback: async () => Object.freeze({ kind: "retry" as const }),
    }),
  });
  const retry = await retryRoute(callbackRequest(), {
    params: Promise.resolve({ providerCode: PROVIDER, binding }),
  });
  assert.equal(retry.status, 503);
  assert.equal(await retry.text(), "RETRY");

  const unavailable = createHostedPaymentCallbackRoute({
    resolveRuntime: async () => null,
  });
  const rejected = await unavailable(callbackRequest(), {
    params: Promise.resolve({ providerCode: PROVIDER, binding }),
  });
  assert.equal(rejected.status, 400);
  assert.equal(await rejected.text(), "INVALID");
});

test("customer callback route redirects only to fixed same-origin relative result paths", async () => {
  const binding = Buffer.alloc(32, 7).toString("base64url");
  for (const [outcome, location] of [
    ["success", "/odeme/hizli/sonuc?durum=basarili"],
    ["failure", "/odeme/hizli/sonuc?durum=basarisiz"],
    ["processing", "/odeme/hizli/sonuc?durum=isleniyor"],
  ] as const) {
    const runtime: HostedPaymentRuntime = Object.freeze({
      initialize: async () => Object.freeze({ kind: "rejected" }),
      reconcile: async () => Object.freeze({ kind: "rejected" }),
      callbackByDigest: async () => Object.freeze({ kind: "rejected" }),
      callback: async () => Object.freeze({ kind: "customer_return", outcome }),
    });
    const route = createHostedPaymentCallbackRoute({ resolveRuntime: async () => runtime });
    const maliciousBody = "return_url=https%3A%2F%2Fattacker.example%2Fcollect";
    const response = await route(new Request(
      `https://attacker.example/api/payments/${PROVIDER}/callback/${binding}?next=https://attacker.example`,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": String(Buffer.byteLength(maliciousBody)),
          host: "attacker.example",
          "x-forwarded-host": "attacker.example",
        },
        body: maliciousBody,
      },
    ), { params: Promise.resolve({ providerCode: PROVIDER, binding }) });

    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), location);
    assert.equal(response.headers.get("location")?.includes("attacker.example"), false);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(await response.text(), "");
  }
});
