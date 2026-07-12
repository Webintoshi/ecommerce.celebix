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
  | { kind: "tenant_created" | "tenant_replayed"; result: CreateStarterTenantResult }
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
    if (claim.kind === "commit_unknown" || claim.kind === "completed") return { kind: "reconciliation_required" };

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
    try {
      await this.dependencies.workflowStore.finalizeTenantCompletion({ ...transitionInput(authority, "creating", now(this.dependencies)), result: structuredClone(outcome.value) });
    } catch (error) {
      return finalizationFailure(error);
    }
    auditSafely(this.dependencies, { operation: "resume_tenant_creation", outcome: "completed" });
    return { kind: outcome.value.replayed ? "tenant_replayed" : "tenant_created", result: structuredClone(outcome.value) };
    } finally {
      try { await claim.lease.release(); } catch { /* client destruction releases the session fence */ }
    }
  }

  async reconcileUnknownCommit(rawAttemptId: string): Promise<ReconcileTenantResult> {
    let authority: VerifiedRegistrationAuthority;
    try {
      authority = await this.dependencies.workflowStore.loadVerified(attemptId(rawAttemptId));
      if (authority.status !== "identity_verified" || !["creating", "commit_unknown"].includes(authority.completion.state)) {
        throw new RegistrationCompletionCorruptionError();
      }
    } catch (error) {
      return { kind: "rejected", error: safeError(error) };
    }
    const recoveryState = authority.completion.state as "creating" | "commit_unknown";
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
    try {
      await this.dependencies.workflowStore.finalizeTenantCompletion({ ...transitionInput(authority, recoveryState, now(this.dependencies)), result: structuredClone(recovery.result) });
    } catch (error) {
      return finalizationFailure(error);
    }
    return { kind: "tenant_recovered", result: structuredClone(recovery.result) };
  }
}

export function createPersistentRegistrationCompletionService(dependencies: PersistentRegistrationCompletionDependencies): PersistentRegistrationCompletionService {
  return new DefaultPersistentRegistrationCompletionService(dependencies);
}
