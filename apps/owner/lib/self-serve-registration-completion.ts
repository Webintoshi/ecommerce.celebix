import type { CreateStarterTenantResult, SaaSContractError } from "@celebix/saas-contracts";
import {
  normalizeExactHttpsOrigin,
  type CanonicalTenantFingerprint,
  type PostgresTenantOperationRecoveryResult,
} from "@celebix/saas-data";

import type {
  OwnerServiceUnavailableError,
  OwnerTenantCoreAdapter,
} from "./saas-tenant-core/adapter.ts";
import {
  IdentityPersistenceError,
  RegistrationCompletionCorruptionError,
  RegistrationPersistenceError,
} from "./saas-persistence/postgres-identity-common.ts";
import { validateTenantCompletionResult } from "./saas-persistence/tenant-completion-result.ts";
import type {
  ClaimTenantCompletionInput,
  CompletionClaimOutcome,
  CompletionTransitionInput,
  FinalizeTenantCompletionInput,
  RecordVerifiedIdentityInput,
  RecordVerifiedIdentityOutcome,
  VerifiedRegistrationAuthority,
} from "./saas-persistence/postgres-registration-attempt-store.ts";

export interface PersistentRegistrationCompletionStore {
  recordVerifiedIdentity(input: RecordVerifiedIdentityInput): Promise<RecordVerifiedIdentityOutcome>;
  loadVerified(attemptId: string): Promise<VerifiedRegistrationAuthority>;
  claimTenantCompletion(input: ClaimTenantCompletionInput): Promise<CompletionClaimOutcome>;
  isTenantCompletionActive(attemptId: string): Promise<boolean>;
  markTenantCompletionCommitUnknown(input: CompletionTransitionInput): Promise<VerifiedRegistrationAuthority>;
  releaseTenantCompletion(input: CompletionTransitionInput): Promise<VerifiedRegistrationAuthority>;
  finalizeTenantCompletion(input: FinalizeTenantCompletionInput): Promise<VerifiedRegistrationAuthority>;
  recoverAbsentTenantCompletion(input: CompletionTransitionInput): Promise<VerifiedRegistrationAuthority>;
}

export interface TenantOperationRecoveryPort {
  recover(
    idempotencyKey: string,
    fingerprint: CanonicalTenantFingerprint,
  ): Promise<PostgresTenantOperationRecoveryResult>;
}

export interface RegistrationCompletionAuditEvent {
  operation: "record_verified_identity" | "resume_tenant_creation" | "reconcile_unknown_commit";
  outcome: "completed" | "rejected" | "pending" | "absent" | "failed" | "commit_unknown";
}

export interface PersistentRegistrationCompletionDependencies {
  workflowStore: PersistentRegistrationCompletionStore;
  tenantCore: OwnerTenantCoreAdapter;
  recovery: TenantOperationRecoveryPort;
  panelOrigin: string;
  platformDomainSuffix: string;
  clock(): Date;
  audit(event: RegistrationCompletionAuditEvent): void | Promise<void>;
}

export interface SafeCompletionError {
  code: string;
  retryable: boolean;
}

export type RecordIdentityResult =
  | { kind: "identity_recorded" | "identity_already_recorded"; status: "identity_verified"; version: number }
  | { kind: "rejected"; error: SafeCompletionError };

export type ResumeTenantResult =
  | { kind: "tenant_created" | "tenant_replayed" | "tenant_already_created"; result: CreateStarterTenantResult }
  | { kind: "in_progress" | "commit_unknown" | "reconciliation_required" | "completion_state_unknown" }
  | { kind: "rejected"; error: SafeCompletionError };

export type ReconcileTenantResult =
  | { kind: "tenant_recovered"; result: CreateStarterTenantResult }
  | { kind: "pending" | "failed" | "reconciliation_required" }
  | { kind: "recovery_absent"; state: "ready" }
  | { kind: "rejected"; error: SafeCompletionError };

export interface PersistentRegistrationCompletionService {
  recordVerifiedIdentity(input: { attemptId: string; expectedVersion: number; identity: unknown }): Promise<RecordIdentityResult>;
  resumeTenantCreation(attemptId: string): Promise<ResumeTenantResult>;
  reconcileUnknownCommit(attemptId: string): Promise<ReconcileTenantResult>;
}

const HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function attemptId(value: string): string {
  if (typeof value !== "string" || !/^attempt_[A-Za-z0-9_-]{16,128}$/.test(value)) {
    throw new IdentityPersistenceError();
  }
  return value;
}

function now(dependencies: PersistentRegistrationCompletionDependencies): Date {
  const value = dependencies.clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new IdentityPersistenceError();
  return value;
}

function safeError(error: unknown): SafeCompletionError {
  if (error instanceof RegistrationCompletionCorruptionError) {
    return { code: "durable_authority_invalid", retryable: false };
  }
  if (error instanceof RegistrationPersistenceError) {
    const allowed: Record<string, string> = {
      registration_attempt_missing: "registration_attempt_missing",
      registration_workflow_conflict: "registration_workflow_conflict",
      registration_workflow_invalid_transition: "registration_workflow_invalid_transition",
      registration_identity_not_consumed: "registration_identity_not_consumed",
      registration_verified_identity_missing: "durable_authority_invalid",
      registration_verified_identity_conflict: "registration_verified_identity_conflict",
      registration_completion_conflict: "registration_workflow_conflict",
    };
    return { code: allowed[error.code] ?? "durable_authority_invalid", retryable: false };
  }
  if (error instanceof IdentityPersistenceError) {
    return { code: "completion_persistence_failed", retryable: true };
  }
  return { code: "completion_persistence_failed", retryable: true };
}

function auditSafely(
  dependencies: PersistentRegistrationCompletionDependencies,
  event: RegistrationCompletionAuditEvent,
): void {
  try {
    const pending = dependencies.audit(event);
    if (pending && typeof (pending as PromiseLike<void>).then === "function") {
      void Promise.resolve(pending).catch(() => undefined);
    }
  } catch {
    // Audit is observability only and cannot replace durable workflow authority.
  }
}

function validateDependencies(
  dependencies: PersistentRegistrationCompletionDependencies,
): PersistentRegistrationCompletionDependencies {
  const store = dependencies.workflowStore;
  if (
    !store ||
    typeof store.recordVerifiedIdentity !== "function" ||
    typeof store.loadVerified !== "function" ||
    typeof store.claimTenantCompletion !== "function" ||
    typeof store.isTenantCompletionActive !== "function" ||
    typeof store.markTenantCompletionCommitUnknown !== "function" ||
    typeof store.releaseTenantCompletion !== "function" ||
    typeof store.finalizeTenantCompletion !== "function" ||
    typeof store.recoverAbsentTenantCompletion !== "function" ||
    !dependencies.tenantCore ||
    typeof dependencies.tenantCore.createStarterTenant !== "function" ||
    !dependencies.recovery ||
    typeof dependencies.recovery.recover !== "function" ||
    typeof dependencies.clock !== "function" ||
    typeof dependencies.audit !== "function"
  ) throw new IdentityPersistenceError();
  try {
    dependencies.panelOrigin = normalizeExactHttpsOrigin(dependencies.panelOrigin);
  } catch {
    throw new IdentityPersistenceError();
  }
  if (
    typeof dependencies.platformDomainSuffix !== "string" ||
    !HOST.test(dependencies.platformDomainSuffix) ||
    dependencies.platformDomainSuffix !== dependencies.platformDomainSuffix.toLowerCase()
  ) throw new IdentityPersistenceError();
  return dependencies;
}

function tenantError(error: SaaSContractError | OwnerServiceUnavailableError): ResumeTenantResult {
  if (error.code === "service_unavailable") {
    return { kind: "rejected", error: { code: "tenant_transaction_failed", retryable: true } };
  }
  return { kind: "rejected", error: { code: error.code, retryable: error.retryable } };
}

function transitionInput(authority: VerifiedRegistrationAuthority, state: "creating" | "commit_unknown", at: Date): CompletionTransitionInput {
  return {
    attemptId: authority.attempt.id,
    expectedState: state,
    expectedCompletionVersion: authority.completion.version,
    expectedWorkflowVersion: authority.version,
    now: at,
  };
}

type FinalizationFailureResult =
  | { kind: "reconciliation_required" }
  | { kind: "rejected"; error: { code: "durable_authority_invalid"; retryable: false } };

function finalizationFailure(error: unknown): FinalizationFailureResult {
  if (error instanceof RegistrationCompletionCorruptionError) {
    return { kind: "rejected", error: { code: "durable_authority_invalid", retryable: false } };
  }
  return { kind: "reconciliation_required" };
}

class DefaultPersistentRegistrationCompletionService implements PersistentRegistrationCompletionService {
  private readonly dependencies: PersistentRegistrationCompletionDependencies;

  constructor(dependencies: PersistentRegistrationCompletionDependencies) {
    this.dependencies = validateDependencies(dependencies);
  }

  async recordVerifiedIdentity(input: { attemptId: string; expectedVersion: number; identity: unknown }): Promise<RecordIdentityResult> {
    try {
      const result = await this.dependencies.workflowStore.recordVerifiedIdentity({
        attemptId: attemptId(input.attemptId), expectedVersion: input.expectedVersion, identity: input.identity, now: now(this.dependencies),
      });
      auditSafely(this.dependencies, { operation: "record_verified_identity", outcome: "completed" });
      return { kind: result.kind === "recorded" ? "identity_recorded" : "identity_already_recorded", status: "identity_verified", version: result.authority.version };
    } catch (error) {
      auditSafely(this.dependencies, { operation: "record_verified_identity", outcome: "rejected" });
      return { kind: "rejected", error: safeError(error) };
    }
  }

  async resumeTenantCreation(rawAttemptId: string): Promise<ResumeTenantResult> {
    let claim: CompletionClaimOutcome;
    try {
      claim = await this.dependencies.workflowStore.claimTenantCompletion({ attemptId: attemptId(rawAttemptId), now: now(this.dependencies) });
    } catch (error) {
      auditSafely(this.dependencies, { operation: "resume_tenant_creation", outcome: "rejected" });
      return { kind: "rejected", error: safeError(error) };
    }
    if (claim.kind === "in_progress") return { kind: "in_progress" };
    if (claim.kind === "commit_unknown") return { kind: "reconciliation_required" };
    if (claim.kind === "recovery_required") return { kind: "reconciliation_required" };
    if (claim.kind === "completed") {
      const recovered = await this.recoverCompletedAuthority(claim.authority);
      if (!recovered.ok) return { kind: "rejected", error: recovered.error };
      return { kind: "tenant_already_created", result: recovered.result };
    }

    const authority = claim.authority;
    try {
    let outcome;
    try {
      outcome = await this.dependencies.tenantCore.createStarterTenant(authority.tenantInput);
    } catch {
      return { kind: "completion_state_unknown" };
    }
    if (!outcome.ok) {
      if (outcome.error.code === "tenant_transaction_failed" && outcome.error.retryable === false) {
        try {
          await this.dependencies.workflowStore.markTenantCompletionCommitUnknown(transitionInput(authority, "creating", now(this.dependencies)));
        } catch {
          return { kind: "completion_state_unknown" };
        }
        auditSafely(this.dependencies, { operation: "resume_tenant_creation", outcome: "commit_unknown" });
        return { kind: "commit_unknown" };
      }
      const mapped = tenantError(outcome.error);
      try { await this.dependencies.workflowStore.releaseTenantCompletion(transitionInput(authority, "creating", now(this.dependencies))); }
      catch { return { kind: "completion_state_unknown" }; }
      auditSafely(this.dependencies, { operation: "resume_tenant_creation", outcome: "rejected" });
      return mapped;
    }
    if (!validateTenantCompletionResult(outcome.value, authority.tenantInput, this.dependencies)) {
      auditSafely(this.dependencies, { operation: "resume_tenant_creation", outcome: "rejected" });
      return { kind: "rejected", error: { code: "durable_authority_invalid", retryable: false } };
    }
    claim.lease.release();
    const finalized = await this.finalizeAndRecover(authority, "creating", outcome.value);
    if (!finalized.ok) return finalized.failure;
    auditSafely(this.dependencies, { operation: "resume_tenant_creation", outcome: "completed" });
    return { kind: outcome.value.replayed ? "tenant_replayed" : "tenant_created", result: finalized.result };
    } finally {
      claim.lease.release();
    }
  }

  async reconcileUnknownCommit(rawAttemptId: string): Promise<ReconcileTenantResult> {
    let authority: VerifiedRegistrationAuthority;
    try {
      authority = await this.dependencies.workflowStore.loadVerified(attemptId(rawAttemptId));
      if (
        !(authority.status === "tenant_created" && authority.completion.state === "completed") &&
        !(authority.status === "identity_verified" && ["creating", "commit_unknown"].includes(authority.completion.state)) &&
        !(
          authority.status === "identity_verified" &&
          authority.completion.state === "ready" &&
          authority.completion.recoveryAbsentAt !== undefined
        )
      ) {
        throw new RegistrationCompletionCorruptionError();
      }
    } catch (error) {
      return { kind: "rejected", error: safeError(error) };
    }
    if (authority.status === "tenant_created" && authority.completion.state === "completed") {
      const recovered = await this.recoverCompletedAuthority(authority);
      if (!recovered.ok) return { kind: "rejected", error: recovered.error };
      return { kind: "tenant_recovered", result: recovered.result };
    }
    let recoveryState = authority.completion.state as "ready" | "creating" | "commit_unknown";
    if (recoveryState === "creating") {
      try {
        if (await this.dependencies.workflowStore.isTenantCompletionActive(authority.attempt.id)) return { kind: "pending" };
      } catch (error) {
        return { kind: "rejected", error: safeError(error) };
      }
    }
    let recovery: PostgresTenantOperationRecoveryResult;
    try {
      recovery = await this.dependencies.recovery.recover(authority.attempt.idempotencyKey, authority.canonicalFingerprint as CanonicalTenantFingerprint);
    } catch {
      return { kind: "rejected", error: { code: "tenant_transaction_failed", retryable: true } };
    }
    if (recovery.kind === "processing") return { kind: "pending" };
    if (recovery.kind === "failed") return { kind: "failed" };
    if (recovery.kind === "committed_mismatch" || recovery.kind === "corrupt") {
      return { kind: "rejected", error: { code: "durable_authority_invalid", retryable: false } };
    }
    if (recovery.kind === "absent") {
      if (recoveryState === "ready") return { kind: "recovery_absent", state: "ready" };
      try {
        await this.dependencies.workflowStore.recoverAbsentTenantCompletion(transitionInput(authority, recoveryState, now(this.dependencies)));
      } catch (error) {
        return { kind: "rejected", error: safeError(error) };
      }
      return { kind: "recovery_absent", state: "ready" };
    }
    if (!validateTenantCompletionResult(recovery.result, authority.tenantInput, this.dependencies)) {
      return { kind: "rejected", error: { code: "durable_authority_invalid", retryable: false } };
    }
    if (recoveryState === "ready") {
      try {
        authority = await this.dependencies.workflowStore.markTenantCompletionCommitUnknown({
          attemptId: authority.attempt.id,
          expectedState: "ready",
          expectedCompletionVersion: authority.completion.version,
          expectedWorkflowVersion: authority.version,
          now: now(this.dependencies),
        });
        recoveryState = "commit_unknown";
      } catch (error) {
        return finalizationFailure(error);
      }
    }
    const finalized = await this.finalizeAndRecover(authority, recoveryState, recovery.result, true);
    if (!finalized.ok) return finalized.failure;
    return { kind: "tenant_recovered", result: finalized.result };
  }

  private async finalizeAndRecover(
    authority: VerifiedRegistrationAuthority,
    state: "creating" | "commit_unknown",
    candidate: CreateStarterTenantResult,
    candidateIsPersisted = false,
  ): Promise<
    | { ok: true; result: CreateStarterTenantResult }
    | { ok: false; failure: FinalizationFailureResult }
  > {
    let completed: VerifiedRegistrationAuthority;
    try {
      completed = await this.dependencies.workflowStore.finalizeTenantCompletion({
        ...transitionInput(authority, state, now(this.dependencies)),
        result: structuredClone(candidate),
      });
    } catch (error) {
      if (error instanceof RegistrationCompletionCorruptionError) {
        return { ok: false, failure: finalizationFailure(error) };
      }
      try {
        completed = await this.dependencies.workflowStore.loadVerified(authority.attempt.id);
      } catch {
        return { ok: false, failure: { kind: "reconciliation_required" } };
      }
      if (completed.status !== "tenant_created" || completed.completion.state !== "completed") {
        return { ok: false, failure: { kind: "reconciliation_required" } };
      }
    }
    if (candidateIsPersisted) {
      if (completed.completion.tenantOperationId !== candidate.operationId) {
        return {
          ok: false,
          failure: { kind: "rejected", error: { code: "durable_authority_invalid", retryable: false } },
        };
      }
      return { ok: true, result: structuredClone(candidate) };
    }
    const recovered = await this.recoverCompletedAuthority(completed);
    if (!recovered.ok) {
      return recovered.error.code === "durable_authority_invalid"
        ? { ok: false, failure: { kind: "rejected", error: { code: "durable_authority_invalid", retryable: false } } }
        : { ok: false, failure: { kind: "reconciliation_required" } };
    }
    return { ok: true, result: { ...recovered.result, replayed: candidate.replayed } };
  }

  private async recoverCompletedAuthority(authority: VerifiedRegistrationAuthority): Promise<
    | { ok: true; result: CreateStarterTenantResult }
    | { ok: false; error: SafeCompletionError }
  > {
    const operationId = authority.completion.tenantOperationId;
    if (authority.status !== "tenant_created" || authority.completion.state !== "completed" || !operationId) {
      return { ok: false, error: { code: "durable_authority_invalid", retryable: false } };
    }
    let recovery: PostgresTenantOperationRecoveryResult;
    try {
      recovery = await this.dependencies.recovery.recover(
        authority.attempt.idempotencyKey,
        authority.canonicalFingerprint as CanonicalTenantFingerprint,
      );
    } catch {
      return { ok: false, error: { code: "tenant_transaction_failed", retryable: true } };
    }
    if (
      recovery.kind !== "committed_match" ||
      recovery.result.operationId !== operationId ||
      !validateTenantCompletionResult(recovery.result, authority.tenantInput, this.dependencies)
    ) {
      return { ok: false, error: { code: "durable_authority_invalid", retryable: false } };
    }
    return { ok: true, result: structuredClone(recovery.result) };
  }
}

export function createPersistentRegistrationCompletionService(dependencies: PersistentRegistrationCompletionDependencies): PersistentRegistrationCompletionService {
  return new DefaultPersistentRegistrationCompletionService(dependencies);
}
