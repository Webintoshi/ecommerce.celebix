import assert from "node:assert/strict";
import test from "node:test";

import {
  sealMerchantProviderCredential,
  type MerchantProviderCredentialKeyring,
  type MerchantProviderVerificationWorkflowRepository,
  type MerchantProviderWorkflowClaim,
  type MerchantProviderWorkflowRepository,
} from "@celebix/saas-data";

import {
  createMerchantProviderAdapterRegistry,
} from "./registry.ts";
import { createMerchantProviderWorker } from "./worker.ts";
import type {
  MerchantProviderAdapter,
  MerchantProviderVerificationAdapter,
} from "./types.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const PROFILE = "40000000-0000-4000-8000-000000000005";
const JOB = "71000000-0000-4000-8000-000000000001";
const RECORD = "70000000-0000-4000-8000-000000000001";
const LEASE = "73000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-25T12:00:00.000Z");
const AUTHORITY = Object.freeze({ environment: "test" as const, adapterVersion: 1, evidenceDigest: `sha256:${"a".repeat(64)}` });
const KEY = new Uint8Array(32).fill(17);
const KEYRING: MerchantProviderCredentialKeyring = Object.freeze({
  activeKeyId: "provider.current",
  keys: Object.freeze([Object.freeze({ keyId: "provider.current", key: KEY })]),
});

function emptyVerificationRegistry() {
  return Object.freeze({
    size: 0,
    get: Object.freeze(() => null),
    list: Object.freeze(() => Object.freeze([])),
  });
}

function envelope() {
  return sealMerchantProviderCredential({
    plaintext: new TextEncoder().encode("fixture-secret"),
    profileId: PROFILE,
    storeId: STORE,
    providerCode: "fixture_provider",
    capability: "marketplace_sync",
    credentialVersion: 2,
    keyring: KEYRING,
  });
}

function validationClaim(executionAuthority = AUTHORITY) {
  return Object.freeze({
    profileId: PROFILE,
    storeId: STORE,
    providerCode: "fixture_provider",
    capability: "marketplace_sync" as const,
    executionAuthority,
    publicConfig: Object.freeze({ accountReference: "merchant-42" }),
    sealedCredentials: envelope(),
    credentialVersion: 2,
    profileVersion: 3,
    leaseId: LEASE,
    leaseOwner: "worker.fixture",
    leaseExpiresAt: new Date(NOW.getTime() + 300_000).toISOString(),
  });
}

function workflowClaim(): MerchantProviderWorkflowClaim {
  return Object.freeze({
    jobId: JOB,
    recordId: RECORD,
    storeId: STORE,
    profileId: PROFILE,
    providerCode: "fixture_provider",
    capability: "marketplace_sync",
    publicConfig: Object.freeze({ accountReference: "merchant-42" }),
    sealedCredentials: envelope(),
    credentialVersion: 2,
    jobVersion: 3,
    leaseId: LEASE,
    leaseOwner: "worker.fixture",
    leaseExpiresAt: new Date(NOW.getTime() + 300_000).toISOString(),
    attempt: 1,
  });
}

type ProbeOptions = Readonly<{
  mode?: "validation_only" | "validation_and_execution";
  validation?: "validated" | "rejected";
  execution?: "succeeded" | "provider_outcome_unknown";
  profileClaim?: boolean;
  jobClaim?: boolean;
  mismatchedValidationAuthority?: boolean;
}>;

function probe(options: ProbeOptions = {}) {
  const calls = { profileClaim: 0, jobClaim: 0, validate: 0, execute: 0, mark: 0, finalize: 0 };
  const retained: Uint8Array[] = [];
  const audits: unknown[] = [];
  const repository = {
    async claimProfileValidation() {
      calls.profileClaim += 1;
      return options.profileClaim === false
        ? Object.freeze({ kind: "empty" as const })
        : Object.freeze({ kind: "claimed" as const, profile: validationClaim(
          options.mismatchedValidationAuthority
            ? Object.freeze({ ...AUTHORITY, evidenceDigest: `sha256:${"b".repeat(64)}` })
            : AUTHORITY,
        ) });
    },
    async markProfileValidation(input: { outcome: string }) {
      calls.mark += 1;
      return {
        id: PROFILE, providerCode: "fixture_provider", capability: "marketplace_sync" as const,
        publicConfig: {}, maskedAccountReference: "••••nt-42",
        status: input.outcome === "validated" ? "active" as const : "rotation_required" as const,
        credentialVersion: 2, version: 4, lastValidatedAt: NOW.toISOString(),
        createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
      };
    },
    async claimProfileVerification() { throw new Error("unexpected_verification_claim"); },
    async markProfileVerification() { throw new Error("unexpected_verification_mark"); },
    async claim() {
      calls.jobClaim += 1;
      return options.jobClaim === false
        ? Object.freeze({ kind: "empty" as const })
        : Object.freeze({ kind: "claimed" as const, job: workflowClaim() });
    },
    async heartbeat() { throw new Error("unexpected_heartbeat"); },
    async finalize(input: { outcome: string; safeProviderReference: string | null; outcomeCode: string }) {
      calls.finalize += 1;
      return {
        id: JOB, recordId: RECORD, recordKind: "marketplace_connection" as const,
        action: "synchronization" as const, status: input.outcome as "succeeded",
        profileId: PROFILE, providerCode: "fixture_provider", credentialVersion: 2,
        attempt: 1, safeProviderReference: input.safeProviderReference, outcomeCode: input.outcomeCode,
        version: 4, requestedAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
      };
    },
    async reconcile() { throw new Error("unexpected_reconcile"); },
    async recover() { throw new Error("unexpected_recover"); },
  } satisfies MerchantProviderWorkflowRepository & MerchantProviderVerificationWorkflowRepository;
  const adapter = Object.freeze({
    providerCode: "fixture_provider",
    capability: "marketplace_sync" as const,
    executionAuthority: AUTHORITY,
    async validateCredential(input: Parameters<MerchantProviderAdapter["validateCredential"]>[0]) {
      calls.validate += 1;
      retained.push(input.credential);
      return options.validation === "rejected"
        ? Object.freeze({ kind: "rejected" as const, outcomeCode: "credential_rejected" })
        : Object.freeze({ kind: "validated" as const });
    },
    async execute(input) {
      calls.execute += 1;
      retained.push(input.credential);
      return options.execution === "succeeded"
        ? Object.freeze({ kind: "succeeded" as const, safeProviderReference: "provider-safe", outcomeCode: "accepted" as const })
        : Object.freeze({ kind: "provider_outcome_unknown" as const, outcomeCode: "transport_outcome_unknown" as const });
    },
    async reconcile() { throw new Error("unexpected_adapter_reconcile"); },
  } satisfies MerchantProviderAdapter);
  const worker = createMerchantProviderWorker({
    mode: options.mode ?? "validation_and_execution",
    repository,
    registry: createMerchantProviderAdapterRegistry(Object.freeze([adapter])),
    verificationRegistry: emptyVerificationRegistry(),
    keyring: KEYRING,
    workerId: "worker.fixture",
    now: () => new Date(NOW),
    leaseDurationMs: 300_000,
    audit(event) { audits.push(event); },
  });
  return { worker, calls, retained, audits };
}

type VerificationResult = Awaited<ReturnType<MerchantProviderVerificationAdapter["validateCredential"]>>;

function verificationProbe(validation: VerificationResult, sabotageCredentialFill = false) {
  const plaintext = new TextEncoder().encode(JSON.stringify({
    apiKey: "sandbox-api-key",
    secretKey: "sandbox-secret-key",
  }));
  const sealedCredentials = sealMerchantProviderCredential({
    plaintext,
    profileId: PROFILE,
    storeId: STORE,
    providerCode: "iyzico_iframe",
    capability: "payment_processing",
    credentialVersion: 1,
    keyring: KEYRING,
  });
  plaintext.fill(0);
  const retained: Uint8Array[] = [];
  const marks: Record<string, unknown>[] = [];
  const audits: unknown[] = [];
  const adapter: MerchantProviderVerificationAdapter = Object.freeze({
    providerCode: "iyzico_iframe",
    capability: "payment_processing",
    validationIdentity: Object.freeze({ environment: "test", adapterVersion: 1 }),
    async validateCredential(input: Parameters<MerchantProviderVerificationAdapter["validateCredential"]>[0]) {
      retained.push(input.credential);
      if (sabotageCredentialFill) {
        Object.defineProperty(input.credential, "fill", {
          configurable: true,
          value: () => input.credential,
          writable: true,
        });
      }
      return validation;
    },
  });
  const repository = {
    async claimProfileVerification() {
      return Object.freeze({ kind: "claimed" as const, profile: Object.freeze({
        profileId: PROFILE, storeId: STORE, providerCode: "iyzico_iframe",
        capability: "payment_processing" as const,
        publicConfig: Object.freeze({ environment: "test" }),
        validationIdentity: Object.freeze({ environment: "test" as const, adapterVersion: 1 }),
        sealedCredentials, credentialVersion: 1, profileVersion: 2, leaseId: LEASE,
        leaseOwner: "worker.fixture", leaseExpiresAt: new Date(NOW.getTime() + 300_000).toISOString(),
      }) });
    },
    async markProfileVerification(input: Record<string, unknown>) {
      marks.push(input);
      return {
        id: PROFILE, providerCode: "iyzico_iframe", capability: "payment_processing" as const,
        publicConfig: { environment: "test" }, maskedAccountReference: "iyzico test hesabı",
        status: input.outcome === "validated" ? "active" as const
          : input.outcome === "unavailable" ? "pending_validation" as const : "rotation_required" as const,
        credentialVersion: 1, version: 3, lastValidatedAt: null,
        createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
      };
    },
    async claimProfileValidation() { throw new Error("legacy_validation_forbidden"); },
    async markProfileValidation() { throw new Error("legacy_validation_forbidden"); },
    async claim() { throw new Error("generic_queue_forbidden"); },
    async heartbeat() { throw new Error("generic_queue_forbidden"); },
    async finalize() { throw new Error("generic_queue_forbidden"); },
    async reconcile() { throw new Error("generic_queue_forbidden"); },
    async recover() { throw new Error("generic_queue_forbidden"); },
  } as unknown as MerchantProviderWorkflowRepository & MerchantProviderVerificationWorkflowRepository;
  const worker = createMerchantProviderWorker({
    mode: "validation_only",
    repository,
    registry: createMerchantProviderAdapterRegistry(Object.freeze([])),
    verificationRegistry: Object.freeze({ size: 1, get: () => adapter, list: () => Object.freeze([adapter]) }),
    keyring: KEYRING,
    workerId: "worker.fixture",
    now: () => new Date(NOW),
    leaseDurationMs: 300_000,
    audit(event) { audits.push(event); },
  });
  return { worker, retained, marks, audits };
}

test("worker validates pending credential with an injected adapter and zeroes plaintext", async () => {
  const selected = probe({ validation: "validated" });
  assert.deepEqual(await selected.worker.runOnce(), { kind: "profile_validated" });
  assert.equal(selected.calls.validate, 1);
  assert.equal(selected.calls.mark, 1);
  assert.equal(selected.calls.jobClaim, 0);
  assert.equal(selected.retained.every((bytes) => bytes.every((byte) => byte === 0)), true);
  assert.deepEqual(selected.audits, [{ operation: "validate", classification: "profile_validated", providerCode: "fixture_provider", capability: "marketplace_sync" }]);
});

test("worker rejects a stale claimed authority before decrypting or contacting the adapter", async () => {
  const selected = probe({ mismatchedValidationAuthority: true });
  await assert.rejects(() => selected.worker.runOnce(), /merchant_provider_worker_invalid/);
  assert.equal(selected.calls.validate, 0);
  assert.equal(selected.calls.mark, 0);
  assert.equal(selected.retained.length, 0);
});

test("worker maps possible side effect to unknown without second adapter call", async () => {
  const selected = probe({ profileClaim: false, execution: "provider_outcome_unknown" });
  assert.deepEqual(await selected.worker.runOnce(), { kind: "provider_outcome_unknown" });
  assert.equal(selected.calls.execute, 1);
  assert.equal(selected.calls.finalize, 1);
  assert.equal(selected.calls.jobClaim, 1);
  assert.equal(selected.retained[0]?.every((byte) => byte === 0), true);
});

test("validation-only worker returns empty without touching the legacy generic claim", async () => {
  const selected = probe({ mode: "validation_only", profileClaim: false, jobClaim: true });
  assert.deepEqual(await selected.worker.runOnce(), { kind: "empty" });
  assert.equal(selected.calls.profileClaim, 1);
  assert.equal(selected.calls.jobClaim, 0);
  assert.equal(selected.calls.execute, 0);
  assert.equal(selected.calls.finalize, 0);
  assert.equal(selected.retained.length, 0);
});

test("successful execution finalizes one exact safe provider reference", async () => {
  const selected = probe({ profileClaim: false, execution: "succeeded" });
  assert.deepEqual(await selected.worker.runOnce(), { kind: "succeeded" });
  assert.equal(selected.calls.execute, 1);
  assert.equal(selected.calls.finalize, 1);
  assert.deepEqual(selected.audits, [{ operation: "execute", classification: "succeeded", providerCode: "fixture_provider", capability: "marketplace_sync" }]);
});

test("verification lane claims and marks Iyzico identity without execution authority or generic queue access", async () => {
  const plaintext = new TextEncoder().encode(JSON.stringify({
    apiKey: "sandbox-api-key",
    secretKey: "sandbox-secret-key",
  }));
  const sealedCredentials = sealMerchantProviderCredential({
    plaintext,
    profileId: PROFILE,
    storeId: STORE,
    providerCode: "iyzico_iframe",
    capability: "payment_processing",
    credentialVersion: 1,
    keyring: KEYRING,
  });
  plaintext.fill(0);
  const calls: Array<{ kind: string; input?: Record<string, unknown> }> = [];
  const retained: Uint8Array[] = [];
  const adapter: MerchantProviderVerificationAdapter = Object.freeze({
    providerCode: "iyzico_iframe",
    capability: "payment_processing",
    validationIdentity: Object.freeze({ environment: "test", adapterVersion: 1 }),
    async validateCredential(input: Parameters<MerchantProviderVerificationAdapter["validateCredential"]>[0]) {
      calls.push({ kind: "validate" });
      retained.push(input.credential);
      return Object.freeze({ kind: "validated" as const });
    },
  });
  const verificationRegistry = Object.freeze({
    size: 1,
    get: Object.freeze(() => adapter),
    list: Object.freeze(() => Object.freeze([adapter])),
  });
  const repository = {
    async claimProfileVerification(input: Record<string, unknown>) {
      calls.push({ kind: "claimProfileVerification", input });
      return Object.freeze({
        kind: "claimed" as const,
        profile: Object.freeze({
          profileId: PROFILE,
          storeId: STORE,
          providerCode: "iyzico_iframe",
          capability: "payment_processing" as const,
          publicConfig: Object.freeze({ environment: "test" }),
          validationIdentity: Object.freeze({ environment: "test" as const, adapterVersion: 1 }),
          sealedCredentials,
          credentialVersion: 1,
          profileVersion: 2,
          leaseId: LEASE,
          leaseOwner: "worker.fixture",
          leaseExpiresAt: new Date(NOW.getTime() + 300_000).toISOString(),
        }),
      });
    },
    async markProfileVerification(input: Record<string, unknown>) {
      calls.push({ kind: "markProfileVerification", input });
      return {
        id: PROFILE, providerCode: "iyzico_iframe", capability: "payment_processing" as const,
        publicConfig: { environment: "test" }, maskedAccountReference: "iyzico test hesabı",
        status: "active" as const, credentialVersion: 1, version: 3,
        lastValidatedAt: NOW.toISOString(), createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
      };
    },
    async claimProfileValidation() { calls.push({ kind: "legacyValidationClaim" }); throw new Error("legacy_validation_forbidden"); },
    async markProfileValidation() { throw new Error("legacy_validation_forbidden"); },
    async claim() { calls.push({ kind: "genericClaim" }); throw new Error("generic_queue_forbidden"); },
    async heartbeat() { throw new Error("generic_queue_forbidden"); },
    async finalize() { throw new Error("generic_queue_forbidden"); },
    async reconcile() { throw new Error("generic_queue_forbidden"); },
    async recover() { throw new Error("generic_queue_forbidden"); },
  } as unknown as MerchantProviderWorkflowRepository & MerchantProviderVerificationWorkflowRepository;
  const worker = createMerchantProviderWorker({
    mode: "validation_only",
    repository,
    registry: createMerchantProviderAdapterRegistry(Object.freeze([])),
    verificationRegistry,
    keyring: KEYRING,
    workerId: "worker.fixture",
    now: () => new Date(NOW),
    leaseDurationMs: 300_000,
    audit() {},
  } as never);

  assert.deepEqual(await worker.runOnce(), { kind: "profile_validated" });
  assert.deepEqual(calls.map(({ kind }) => kind), [
    "claimProfileVerification", "validate", "markProfileVerification",
  ]);
  assert.deepEqual(calls[0]?.input?.validationIdentity, { environment: "test", adapterVersion: 1 });
  const marked = calls[2]?.input ?? {};
  assert.deepEqual(marked.validationIdentity, { environment: "test", adapterVersion: 1 });
  assert.equal(Object.hasOwn(marked, "executionAuthority"), false);
  assert.equal(JSON.stringify(marked).includes("evidenceDigest"), false);
  assert.equal(retained[0]?.every((byte) => byte === 0), true);
});

test("verification lane releases transient provider uncertainty for retry without rotating credentials", async () => {
  const selected = verificationProbe(Object.freeze({
    kind: "rejected" as const,
    outcomeCode: "validation_unavailable",
  }));

  assert.deepEqual(await selected.worker.runOnce(), { kind: "profile_unavailable" });
  assert.equal(selected.marks.length, 1);
  assert.equal(selected.marks[0]?.outcome, "unavailable");
  assert.equal(selected.marks[0]?.outcomeCode, "validation_unavailable");
  assert.deepEqual(selected.audits, [{
    operation: "validate",
    classification: "profile_unavailable",
    providerCode: "iyzico_iframe",
    capability: "payment_processing",
  }]);
  assert.equal(selected.retained[0]?.every((byte) => byte === 0), true);
});

test("verification worker wipes plaintext with the typed-array intrinsic after adapter sabotage", async () => {
  const selected = verificationProbe(Object.freeze({ kind: "validated" as const }), true);

  assert.deepEqual(await selected.worker.runOnce(), { kind: "profile_validated" });
  assert.equal(selected.retained[0]?.every((byte) => byte === 0), true);
});

test("verification lane rejects public environment mismatch before reading the encrypted envelope", async () => {
  let encryptedReads = 0;
  const sealedCredentials = Object.freeze(Object.defineProperty({
    keyId: "provider.current",
    algorithm: "aes-256-gcm",
    iv: "invalid",
    authTag: "invalid",
  }, "ciphertext", {
    enumerable: true,
    get() { encryptedReads += 1; return "invalid"; },
  }));
  let adapterCalls = 0;
  let marks = 0;
  const adapter: MerchantProviderVerificationAdapter = Object.freeze({
    providerCode: "iyzico_iframe",
    capability: "payment_processing",
    validationIdentity: Object.freeze({ environment: "test", adapterVersion: 1 }),
    async validateCredential() { adapterCalls += 1; return Object.freeze({ kind: "validated" as const }); },
  });
  const repository = {
    async claimProfileVerification() {
      return Object.freeze({ kind: "claimed" as const, profile: Object.freeze({
        profileId: PROFILE, storeId: STORE, providerCode: "iyzico_iframe",
        capability: "payment_processing" as const,
        publicConfig: Object.freeze({ environment: "live" }),
        validationIdentity: Object.freeze({ environment: "test" as const, adapterVersion: 1 }),
        sealedCredentials,
        credentialVersion: 1, profileVersion: 2, leaseId: LEASE,
        leaseOwner: "worker.fixture",
        leaseExpiresAt: new Date(NOW.getTime() + 300_000).toISOString(),
      }) });
    },
    async markProfileVerification() { marks += 1; throw new Error("must_not_mark"); },
    async claimProfileValidation() { throw new Error("legacy_validation_forbidden"); },
    async markProfileValidation() { throw new Error("legacy_validation_forbidden"); },
    async claim() { throw new Error("generic_queue_forbidden"); },
    async heartbeat() { throw new Error("generic_queue_forbidden"); },
    async finalize() { throw new Error("generic_queue_forbidden"); },
    async reconcile() { throw new Error("generic_queue_forbidden"); },
    async recover() { throw new Error("generic_queue_forbidden"); },
  } as unknown as MerchantProviderWorkflowRepository & MerchantProviderVerificationWorkflowRepository;
  const worker = createMerchantProviderWorker({
    mode: "validation_only",
    repository,
    registry: createMerchantProviderAdapterRegistry(Object.freeze([])),
    verificationRegistry: Object.freeze({ size: 1, get: () => adapter, list: () => Object.freeze([adapter]) }),
    keyring: KEYRING,
    workerId: "worker.fixture",
    now: () => new Date(NOW),
    leaseDurationMs: 300_000,
    audit() {},
  } as never);

  await assert.rejects(() => worker.runOnce(), /merchant_provider_worker_invalid/);
  assert.equal(encryptedReads, 0);
  assert.equal(adapterCalls, 0);
  assert.equal(marks, 0);
});

test("an explicitly empty registry never claims or contacts a provider", async () => {
  let claimCalls = 0;
  const repository = {
    async claimProfileVerification() { claimCalls += 1; throw new Error("repository_touched"); },
    async markProfileVerification() { throw new Error("repository_touched"); },
    async claimProfileValidation() { claimCalls += 1; throw new Error("repository_touched"); },
    async markProfileValidation() { throw new Error("repository_touched"); },
    async claim() { claimCalls += 1; throw new Error("repository_touched"); },
    async heartbeat() { throw new Error("repository_touched"); },
    async finalize() { throw new Error("repository_touched"); },
    async reconcile() { throw new Error("repository_touched"); },
    async recover() { throw new Error("repository_touched"); },
  } as unknown as MerchantProviderWorkflowRepository & MerchantProviderVerificationWorkflowRepository;
  const worker = createMerchantProviderWorker({
    mode: "validation_only",
    repository,
    registry: createMerchantProviderAdapterRegistry(Object.freeze([])),
    verificationRegistry: emptyVerificationRegistry(),
    keyring: KEYRING,
    workerId: "worker.fixture",
    now: () => new Date(NOW),
    leaseDurationMs: 300_000,
    audit() {},
  });
  assert.deepEqual(await worker.runOnce(), { kind: "disabled" });
  assert.equal(claimCalls, 0);
});

test("registry rejects duplicates, mutable adapters, and mismatched lookup authority", () => {
  const mutable = {
    providerCode: "fixture_provider", capability: "marketplace_sync" as const,
    executionAuthority: AUTHORITY,
    async validateCredential() { return { kind: "validated" as const }; },
    async execute() { return { kind: "provider_outcome_unknown" as const, outcomeCode: "transport_outcome_unknown" as const }; },
    async reconcile() { return { kind: "provider_outcome_unknown" as const, outcomeCode: "transport_outcome_unknown" as const }; },
  };
  assert.throws(() => createMerchantProviderAdapterRegistry([mutable]), /provider_adapter_registry_invalid/);
  const frozen = Object.freeze(mutable);
  assert.throws(() => createMerchantProviderAdapterRegistry(Object.freeze([frozen, frozen])), /provider_adapter_registry_invalid/);
  const registry = createMerchantProviderAdapterRegistry(Object.freeze([frozen]));
  assert.equal(registry.get("fixture_provider", "marketplace_sync"), frozen);
  assert.equal(registry.get("fixture_provider", "indexing"), null);
  assert.equal(Object.isFrozen(registry), true);
});
