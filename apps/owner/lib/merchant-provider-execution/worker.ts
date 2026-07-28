import {
  openMerchantProviderCredential,
  type MerchantProviderValidationClaim,
  type MerchantProviderVerificationClaim,
  type MerchantProviderWorkflowClaim,
} from "@celebix/saas-data";

import type {
  MerchantProviderAdapter,
  MerchantProviderVerificationAdapter,
  MerchantProviderWorker,
  MerchantProviderWorkerOptions,
  MerchantProviderWorkerResult,
  ProviderExecutionOutcome,
} from "./types.ts";

const WORKER = /^[A-Za-z0-9._-]{1,128}$/;
const OUTCOME_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const OPTION_KEYS = Object.freeze([
  "mode", "repository", "registry", "verificationRegistry", "keyring", "workerId", "now",
  "leaseDurationMs", "audit",
]);

function invalid(): never {
  throw new TypeError("merchant_provider_worker_invalid");
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  if (
    Reflect.ownKeys(descriptors).length !== keys.length ||
    Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !keys.includes(key))
  ) invalid();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    result[key] = descriptor.value;
  }
  return result;
}

function result(kind: MerchantProviderWorkerResult["kind"]): MerchantProviderWorkerResult {
  return Object.freeze({ kind });
}

function outcomeCode(value: unknown): string {
  if (typeof value !== "string" || !OUTCOME_CODE.test(value)) invalid();
  return value;
}

function parseValidationResult(value: unknown): Readonly<{ kind: "validated" }> | Readonly<{ kind: "rejected"; outcomeCode: string }> {
  if (typeof value !== "object" || value === null) invalid();
  const kindDescriptor = Object.getOwnPropertyDescriptor(value, "kind");
  if (!kindDescriptor || !("value" in kindDescriptor)) invalid();
  if (kindDescriptor.value === "validated") {
    exact(value, ["kind"]);
    return Object.freeze({ kind: "validated" });
  }
  const parsed = exact(value, ["kind", "outcomeCode"]);
  if (parsed.kind !== "rejected") invalid();
  return Object.freeze({ kind: "rejected", outcomeCode: outcomeCode(parsed.outcomeCode) });
}

function parseExecutionResult(value: unknown): ProviderExecutionOutcome {
  if (typeof value !== "object" || value === null) invalid();
  const kindDescriptor = Object.getOwnPropertyDescriptor(value, "kind");
  if (!kindDescriptor || !("value" in kindDescriptor) || typeof kindDescriptor.value !== "string") invalid();
  if (kindDescriptor.value === "succeeded") {
    const parsed = exact(value, ["kind", "safeProviderReference", "outcomeCode"]);
    if (
      parsed.outcomeCode !== "accepted" || typeof parsed.safeProviderReference !== "string" ||
      parsed.safeProviderReference.length < 1 || parsed.safeProviderReference.length > 256 ||
      parsed.safeProviderReference !== parsed.safeProviderReference.trim() || CONTROL.test(parsed.safeProviderReference)
    ) invalid();
    return Object.freeze({ kind: "succeeded", safeProviderReference: parsed.safeProviderReference, outcomeCode: "accepted" });
  }
  const parsed = exact(value, ["kind", "outcomeCode"]);
  if (parsed.kind === "provider_outcome_unknown") {
    if (parsed.outcomeCode !== "transport_outcome_unknown") invalid();
    return Object.freeze({ kind: "provider_outcome_unknown", outcomeCode: "transport_outcome_unknown" });
  }
  if (parsed.kind !== "retryable_failed" && parsed.kind !== "permanently_failed") invalid();
  return Object.freeze({ kind: parsed.kind, outcomeCode: outcomeCode(parsed.outcomeCode) });
}

function exactExecutionAuthority(
  claim: MerchantProviderValidationClaim,
  adapter: MerchantProviderAdapter,
): boolean {
  return claim.providerCode === adapter.providerCode && claim.capability === adapter.capability
    && claim.executionAuthority.environment === adapter.executionAuthority.environment
    && claim.executionAuthority.adapterVersion === adapter.executionAuthority.adapterVersion
    && claim.executionAuthority.evidenceDigest === adapter.executionAuthority.evidenceDigest;
}

function exactVerificationIdentity(
  claim: MerchantProviderVerificationClaim,
  adapter: MerchantProviderVerificationAdapter,
): boolean {
  if (
    claim.providerCode !== adapter.providerCode || claim.capability !== adapter.capability ||
    claim.validationIdentity.environment !== adapter.validationIdentity.environment ||
    claim.validationIdentity.adapterVersion !== adapter.validationIdentity.adapterVersion
  ) return false;
  const environment = Object.getOwnPropertyDescriptor(claim.publicConfig, "environment");
  return environment?.enumerable === true && "value" in environment
    && environment.value === claim.validationIdentity.environment;
}

function openProfileCredential(options: MerchantProviderWorkerOptions, claim: MerchantProviderValidationClaim): Uint8Array {
  return openMerchantProviderCredential({
    envelope: claim.sealedCredentials,
    profileId: claim.profileId,
    storeId: claim.storeId,
    providerCode: claim.providerCode,
    capability: claim.capability,
    credentialVersion: claim.credentialVersion,
    keyring: options.keyring,
  });
}

function openVerificationCredential(
  options: MerchantProviderWorkerOptions,
  claim: MerchantProviderVerificationClaim,
): Uint8Array {
  return openMerchantProviderCredential({
    envelope: claim.sealedCredentials,
    profileId: claim.profileId,
    storeId: claim.storeId,
    providerCode: claim.providerCode,
    capability: claim.capability,
    credentialVersion: claim.credentialVersion,
    keyring: options.keyring,
  });
}

function openJobCredential(options: MerchantProviderWorkerOptions, claim: MerchantProviderWorkflowClaim): Uint8Array {
  return openMerchantProviderCredential({
    envelope: claim.sealedCredentials,
    profileId: claim.profileId,
    storeId: claim.storeId,
    providerCode: claim.providerCode,
    capability: claim.capability,
    credentialVersion: claim.credentialVersion,
    keyring: options.keyring,
  });
}

async function audit(
  options: MerchantProviderWorkerOptions,
  operation: "validate" | "execute",
  classification: MerchantProviderWorkerResult["kind"],
  adapter: Readonly<{ providerCode: string; capability: MerchantProviderValidationClaim["capability"] }>,
): Promise<void> {
  try { await options.audit(Object.freeze({ operation, classification, providerCode: adapter.providerCode, capability: adapter.capability })); }
  catch {}
}

async function validateProfile(
  options: MerchantProviderWorkerOptions,
  claim: MerchantProviderValidationClaim,
  adapter: MerchantProviderAdapter | null,
  now: Date,
): Promise<MerchantProviderWorkerResult> {
  let classification: "profile_validated" | "profile_rejected" = "profile_rejected";
  let code = "adapter_not_registered";
  let credential: Uint8Array | undefined;
  if (adapter !== null) {
    try {
      credential = openProfileCredential(options, claim);
      const selected = parseValidationResult(await adapter.validateCredential(Object.freeze({
        credential,
        publicConfig: claim.publicConfig,
      })));
      if (selected.kind === "validated") {
        classification = "profile_validated";
        code = "validated";
      } else {
        code = selected.outcomeCode;
      }
    } catch {
      code = "credential_validation_failed";
    } finally {
      credential?.fill(0);
    }
  }
  await options.repository.markProfileValidation({
    profileId: claim.profileId,
    providerCode: claim.providerCode,
    capability: claim.capability,
    executionAuthority: claim.executionAuthority,
    credentialVersion: claim.credentialVersion,
    profileVersion: claim.profileVersion,
    leaseId: claim.leaseId,
    leaseOwner: claim.leaseOwner,
    now,
    outcome: classification === "profile_validated" ? "validated" : "rejected",
    outcomeCode: code,
  });
  await audit(options, "validate", classification, claim);
  return result(classification);
}

async function verifyProfile(
  options: MerchantProviderWorkerOptions,
  claim: MerchantProviderVerificationClaim,
  adapter: MerchantProviderVerificationAdapter,
  now: Date,
): Promise<MerchantProviderWorkerResult> {
  let classification: "profile_validated" | "profile_rejected" = "profile_rejected";
  let code = "credential_validation_failed";
  let credential: Uint8Array | undefined;
  try {
    credential = openVerificationCredential(options, claim);
    const selected = parseValidationResult(await adapter.validateCredential(Object.freeze({
      credential,
      publicConfig: claim.publicConfig,
    })));
    if (selected.kind === "validated") {
      classification = "profile_validated";
      code = "validated";
    } else {
      code = selected.outcomeCode;
    }
  } catch {
    code = "credential_validation_failed";
  } finally {
    credential?.fill(0);
  }
  await options.repository.markProfileVerification({
    profileId: claim.profileId,
    providerCode: claim.providerCode,
    capability: claim.capability,
    validationIdentity: claim.validationIdentity,
    credentialVersion: claim.credentialVersion,
    profileVersion: claim.profileVersion,
    leaseId: claim.leaseId,
    leaseOwner: claim.leaseOwner,
    now,
    outcome: classification === "profile_validated" ? "validated" : "rejected",
    outcomeCode: code,
  });
  await audit(options, "validate", classification, claim);
  return result(classification);
}

async function executeJob(
  options: MerchantProviderWorkerOptions,
  claim: MerchantProviderWorkflowClaim,
  adapter: MerchantProviderAdapter | null,
  now: Date,
): Promise<MerchantProviderWorkerResult> {
  let selected: ProviderExecutionOutcome = Object.freeze({ kind: "permanently_failed", outcomeCode: "adapter_not_registered" });
  let credential: Uint8Array | undefined;
  if (adapter !== null) {
    try {
      credential = openJobCredential(options, claim);
      selected = parseExecutionResult(await adapter.execute(Object.freeze({ credential, job: claim })));
    } catch {
      selected = Object.freeze({ kind: "provider_outcome_unknown", outcomeCode: "transport_outcome_unknown" });
    } finally {
      credential?.fill(0);
    }
  }
  await options.repository.finalize({
    jobId: claim.jobId,
    leaseOwner: claim.leaseOwner,
    leaseId: claim.leaseId,
    expectedVersion: claim.jobVersion,
    now,
    outcome: selected.kind,
    outcomeCode: selected.outcomeCode,
    safeProviderReference: selected.kind === "succeeded" ? selected.safeProviderReference : null,
  });
  await audit(options, "execute", selected.kind, claim);
  return result(selected.kind);
}

function selectOptions(value: MerchantProviderWorkerOptions): MerchantProviderWorkerOptions {
  const parsed = exact(value, OPTION_KEYS);
  const repository = parsed.repository as MerchantProviderWorkerOptions["repository"];
  const registry = parsed.registry as MerchantProviderWorkerOptions["registry"];
  const verificationRegistry = parsed.verificationRegistry as MerchantProviderWorkerOptions["verificationRegistry"];
  if (
    (parsed.mode !== "validation_only" && parsed.mode !== "validation_and_execution") ||
    !repository || typeof repository !== "object" ||
    !registry || typeof registry !== "object" || !Object.isFrozen(registry) ||
    !Number.isSafeInteger(registry.size) || registry.size < 0 || typeof registry.get !== "function" ||
    typeof registry.list !== "function" ||
    !verificationRegistry || typeof verificationRegistry !== "object" ||
    !Object.isFrozen(verificationRegistry) || !Number.isSafeInteger(verificationRegistry.size) ||
    verificationRegistry.size < 0 || typeof verificationRegistry.get !== "function" ||
    typeof verificationRegistry.list !== "function" ||
    typeof parsed.workerId !== "string" || !WORKER.test(parsed.workerId) ||
    typeof parsed.now !== "function" || typeof parsed.audit !== "function" ||
    !Number.isSafeInteger(parsed.leaseDurationMs) || (parsed.leaseDurationMs as number) < 1 ||
    (parsed.leaseDurationMs as number) > 15 * 60_000
  ) invalid();
  for (const method of [
    "claimProfileValidation", "markProfileValidation", "claimProfileVerification",
    "markProfileVerification", "claim", "heartbeat", "finalize", "reconcile", "recover",
  ] as const) {
    if (typeof repository[method] !== "function") invalid();
  }
  return Object.freeze({
    mode: parsed.mode as MerchantProviderWorkerOptions["mode"],
    repository,
    registry,
    verificationRegistry,
    keyring: parsed.keyring as MerchantProviderWorkerOptions["keyring"],
    workerId: parsed.workerId,
    now: parsed.now as () => Date,
    leaseDurationMs: parsed.leaseDurationMs as number,
    audit: parsed.audit as MerchantProviderWorkerOptions["audit"],
  });
}

export async function runMerchantProviderWorkerOnce(options: MerchantProviderWorkerOptions): Promise<MerchantProviderWorkerResult> {
  if (options.registry.size === 0 && options.verificationRegistry.size === 0) return result("disabled");
  const now = options.now();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) invalid();
  const selectedNow = new Date(now.getTime());
  const leaseExpiresAt = new Date(selectedNow.getTime() + options.leaseDurationMs);
  for (const adapter of options.verificationRegistry.list()) {
    const verification = await options.repository.claimProfileVerification({
      workerId: options.workerId,
      providerCode: adapter.providerCode,
      capability: adapter.capability,
      validationIdentity: adapter.validationIdentity,
      now: selectedNow,
      leaseExpiresAt,
    });
    if (verification.kind === "claimed") {
      if (!exactVerificationIdentity(verification.profile, adapter)) invalid();
      return verifyProfile(options, verification.profile, adapter, selectedNow);
    }
  }
  for (const adapter of options.registry.list()) {
    const validation = await options.repository.claimProfileValidation({
      workerId: options.workerId, providerCode: adapter.providerCode, capability: adapter.capability,
      executionAuthority: adapter.executionAuthority, now: selectedNow, leaseExpiresAt,
    });
    if (validation.kind === "claimed") {
      if (!exactExecutionAuthority(validation.profile, adapter)) invalid();
      return validateProfile(options, validation.profile, adapter, selectedNow);
    }
  }
  if (options.mode === "validation_only") return result("empty");
  const execution = await options.repository.claim({ workerId: options.workerId, now: selectedNow, leaseExpiresAt });
  if (execution.kind === "empty") return result("empty");
  const adapter = options.registry.get(execution.job.providerCode, execution.job.capability);
  return executeJob(options, execution.job, adapter, selectedNow);
}

export function createMerchantProviderWorker(options: MerchantProviderWorkerOptions): MerchantProviderWorker {
  const selected = selectOptions(options);
  return Object.freeze({ runOnce: () => runMerchantProviderWorkerOnce(selected) });
}
