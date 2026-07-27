import assert from "node:assert/strict";
import test from "node:test";

import {
  sealMerchantProviderCredential,
  type MerchantProviderCredentialKeyring,
  type MerchantProviderWorkflowClaim,
  type MerchantProviderWorkflowRepository,
} from "@celebix/saas-data";

import {
  createMerchantProviderAdapterRegistry,
} from "./registry.ts";
import { createMerchantProviderWorker } from "./worker.ts";
import type { MerchantProviderAdapter } from "./types.ts";

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
  } satisfies MerchantProviderWorkflowRepository;
  const adapter = Object.freeze({
    providerCode: "fixture_provider",
    capability: "marketplace_sync" as const,
    executionAuthority: AUTHORITY,
    async validateCredential(input) {
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
    keyring: KEYRING,
    workerId: "worker.fixture",
    now: () => new Date(NOW),
    leaseDurationMs: 300_000,
    audit(event) { audits.push(event); },
  });
  return { worker, calls, retained, audits };
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

test("an explicitly empty registry never claims or contacts a provider", async () => {
  let claimCalls = 0;
  const repository = {
    async claimProfileValidation() { claimCalls += 1; throw new Error("repository_touched"); },
    async markProfileValidation() { throw new Error("repository_touched"); },
    async claim() { claimCalls += 1; throw new Error("repository_touched"); },
    async heartbeat() { throw new Error("repository_touched"); },
    async finalize() { throw new Error("repository_touched"); },
    async reconcile() { throw new Error("repository_touched"); },
    async recover() { throw new Error("repository_touched"); },
  } as unknown as MerchantProviderWorkflowRepository;
  const worker = createMerchantProviderWorker({
    mode: "validation_only",
    repository,
    registry: createMerchantProviderAdapterRegistry(Object.freeze([])),
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
