import type { CreateStarterTenantResult, SaaSContractError } from "@celebix/saas-contracts";
import type {
  CanonicalTenantFingerprint,
  PostgresTenantOperationRecoveryResult,
} from "@celebix/saas-data";

import type {
  OwnerServiceUnavailableError,
  OwnerTenantCoreAdapter,
} from "./saas-tenant-core/adapter.ts";
import {
  IdentityPersistenceError,
  RegistrationPersistenceError,
} from "./saas-persistence/postgres-identity-common.ts";
import type {
  PersistentRegistrationWorkflow,
  RecordVerifiedIdentityInput,
  RecordVerifiedIdentityOutcome,
  RegistrationTransitionInput,
  VerifiedRegistrationAuthority,
} from "./saas-persistence/postgres-registration-attempt-store.ts";

export interface PersistentRegistrationCompletionStore {
  recordVerifiedIdentity(input: RecordVerifiedIdentityInput): Promise<RecordVerifiedIdentityOutcome>;
  loadVerified(attemptId: string): Promise<VerifiedRegistrationAuthority>;
  markTenantCreated(input: RegistrationTransitionInput): Promise<PersistentRegistrationWorkflow>;
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
  | { kind: "commit_unknown" }
  | { kind: "rejected"; error: SafeCompletionError };

export type ReconcileTenantResult =
  | { kind: "tenant_recovered"; result: CreateStarterTenantResult }
  | { kind: "pending" | "absent" | "failed" }
  | { kind: "rejected"; error: SafeCompletionError };

export interface PersistentRegistrationCompletionService {
  recordVerifiedIdentity(input: { attemptId: string; expectedVersion: number; identity: unknown }): Promise<RecordIdentityResult>;
  resumeTenantCreation(attemptId: string): Promise<ResumeTenantResult>;
  reconcileUnknownCommit(attemptId: string): Promise<ReconcileTenantResult>;
}

function attemptId(value: string): string {
  if (typeof value !== "string" || !/^attempt_[A-Za-z0-9_-]{16,128}$/.test(value)) {
    throw new IdentityPersistenceError();
  }
  return value;
}

function safeError(error: unknown): SafeCompletionError {
  if (error instanceof RegistrationPersistenceError) {
    const allowed: Record<string, string> = {
      registration_attempt_missing: "registration_attempt_missing",
      registration_workflow_conflict: "registration_workflow_conflict",
      registration_workflow_invalid_transition: "registration_workflow_invalid_transition",
      registration_identity_not_consumed: "registration_identity_not_consumed",
      registration_verified_identity_missing: "durable_authority_invalid",
      registration_verified_identity_conflict: "registration_verified_identity_conflict",
    };
    return { code: allowed[error.code] ?? "durable_authority_invalid", retryable: false };
  }
  return { code: "durable_authority_invalid", retryable: false };
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
  if (
    !dependencies.workflowStore ||
    typeof dependencies.workflowStore.recordVerifiedIdentity !== "function" ||
    typeof dependencies.workflowStore.loadVerified !== "function" ||
    typeof dependencies.workflowStore.markTenantCreated !== "function" ||
    !dependencies.tenantCore ||
    typeof dependencies.tenantCore.createStarterTenant !== "function" ||
    !dependencies.recovery ||
    typeof dependencies.recovery.recover !== "function" ||
    typeof dependencies.clock !== "function" ||
    typeof dependencies.audit !== "function"
  ) {
    throw new IdentityPersistenceError();
  }
  return dependencies;
}

function tenantError(error: SaaSContractError | OwnerServiceUnavailableError): ResumeTenantResult {
  if (error.code === "service_unavailable") {
    return { kind: "rejected", error: { code: "tenant_transaction_failed", retryable: true } };
  }
  if (error.code === "tenant_transaction_failed" && error.retryable === false) {
    return { kind: "commit_unknown" };
  }
  return {
    kind: "rejected",
    error: { code: error.code, retryable: error.retryable },
  };
}

class DefaultPersistentRegistrationCompletionService implements PersistentRegistrationCompletionService {
  private readonly dependencies: PersistentRegistrationCompletionDependencies;

  constructor(dependencies: PersistentRegistrationCompletionDependencies) {
    this.dependencies = validateDependencies(dependencies);
  }

  async recordVerifiedIdentity(input: {
    attemptId: string;
    expectedVersion: number;
    identity: unknown;
  }): Promise<RecordIdentityResult> {
    try {
      const now = this.dependencies.clock();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new IdentityPersistenceError();
      const result = await this.dependencies.workflowStore.recordVerifiedIdentity({
        attemptId: attemptId(input.attemptId),
        expectedVersion: input.expectedVersion,
        identity: input.identity,
        now,
      });
      auditSafely(this.dependencies, { operation: "record_verified_identity", outcome: "completed" });
      return {
        kind: result.kind === "recorded" ? "identity_recorded" : "identity_already_recorded",
        status: "identity_verified",
        version: result.authority.version,
      };
    } catch (error) {
      auditSafely(this.dependencies, { operation: "record_verified_identity", outcome: "rejected" });
      return { kind: "rejected", error: safeError(error) };
    }
  }

  async resumeTenantCreation(rawAttemptId: string): Promise<ResumeTenantResult> {
    let authority: VerifiedRegistrationAuthority;
    try {
      authority = await this.dependencies.workflowStore.loadVerified(attemptId(rawAttemptId));
      if (authority.status !== "identity_verified") {
        throw new RegistrationPersistenceError("registration_workflow_invalid_transition");
      }
    } catch (error) {
      auditSafely(this.dependencies, { operation: "resume_tenant_creation", outcome: "rejected" });
      return { kind: "rejected", error: safeError(error) };
    }

    let outcome;
    try {
      outcome = await this.dependencies.tenantCore.createStarterTenant(authority.tenantInput);
    } catch {
      auditSafely(this.dependencies, { operation: "resume_tenant_creation", outcome: "rejected" });
      return { kind: "rejected", error: { code: "tenant_transaction_failed", retryable: true } };
    }
    if (!outcome.ok) {
      const mapped = tenantError(outcome.error);
      auditSafely(this.dependencies, {
        operation: "resume_tenant_creation",
        outcome: mapped.kind === "commit_unknown" ? "commit_unknown" : "rejected",
      });
      return mapped;
    }

    try {
      await this.dependencies.workflowStore.markTenantCreated({
        attemptId: authority.attempt.id,
        expectedStatus: "identity_verified",
        expectedVersion: authority.version,
        now: this.dependencies.clock(),
      });
    } catch (error) {
      auditSafely(this.dependencies, { operation: "resume_tenant_creation", outcome: "rejected" });
      return { kind: "rejected", error: safeError(error) };
    }
    auditSafely(this.dependencies, { operation: "resume_tenant_creation", outcome: "completed" });
    return {
      kind: outcome.value.replayed ? "tenant_replayed" : "tenant_created",
      result: structuredClone(outcome.value),
    };
  }

  async reconcileUnknownCommit(rawAttemptId: string): Promise<ReconcileTenantResult> {
    let authority: VerifiedRegistrationAuthority;
    try {
      authority = await this.dependencies.workflowStore.loadVerified(attemptId(rawAttemptId));
      if (authority.status !== "identity_verified") {
        throw new RegistrationPersistenceError("registration_workflow_invalid_transition");
      }
    } catch (error) {
      auditSafely(this.dependencies, { operation: "reconcile_unknown_commit", outcome: "rejected" });
      return { kind: "rejected", error: safeError(error) };
    }

    let recovery: PostgresTenantOperationRecoveryResult;
    try {
      recovery = await this.dependencies.recovery.recover(
        authority.attempt.idempotencyKey,
        authority.canonicalFingerprint as CanonicalTenantFingerprint,
      );
    } catch {
      auditSafely(this.dependencies, { operation: "reconcile_unknown_commit", outcome: "rejected" });
      return { kind: "rejected", error: { code: "tenant_transaction_failed", retryable: true } };
    }

    if (recovery.kind === "processing") {
      auditSafely(this.dependencies, { operation: "reconcile_unknown_commit", outcome: "pending" });
      return { kind: "pending" };
    }
    if (recovery.kind === "absent") {
      auditSafely(this.dependencies, { operation: "reconcile_unknown_commit", outcome: "absent" });
      return { kind: "absent" };
    }
    if (recovery.kind === "failed") {
      auditSafely(this.dependencies, { operation: "reconcile_unknown_commit", outcome: "failed" });
      return { kind: "failed" };
    }
    if (recovery.kind === "committed_mismatch" || recovery.kind === "corrupt") {
      auditSafely(this.dependencies, { operation: "reconcile_unknown_commit", outcome: "rejected" });
      return { kind: "rejected", error: { code: "durable_authority_invalid", retryable: false } };
    }

    try {
      await this.dependencies.workflowStore.markTenantCreated({
        attemptId: authority.attempt.id,
        expectedStatus: "identity_verified",
        expectedVersion: authority.version,
        now: this.dependencies.clock(),
      });
    } catch (error) {
      auditSafely(this.dependencies, { operation: "reconcile_unknown_commit", outcome: "rejected" });
      return { kind: "rejected", error: safeError(error) };
    }
    auditSafely(this.dependencies, { operation: "reconcile_unknown_commit", outcome: "completed" });
    return { kind: "tenant_recovered", result: structuredClone(recovery.result) };
  }
}

export function createPersistentRegistrationCompletionService(
  dependencies: PersistentRegistrationCompletionDependencies,
): PersistentRegistrationCompletionService {
  return new DefaultPersistentRegistrationCompletionService(dependencies);
}
