import { SaaSDataUniqueConflict } from "../errors.ts";
import type { UniqueConflictKind } from "../types.ts";

export type SaaSDataTransactionStateCode =
  | "transaction_already_committed"
  | "transaction_already_rolled_back"
  | "transaction_commit_unknown"
  | "transaction_broken";

export class SaaSDataPersistenceError extends Error {
  constructor(message = "saas_data_persistence_failed") {
    super(message);
    this.name = "SaaSDataPersistenceError";
  }
}

export class SaaSDataPoolTimeoutError extends SaaSDataPersistenceError {
  constructor() { super("saas_data_pool_timeout"); this.name = "SaaSDataPoolTimeoutError"; }
}
export class SaaSDataStatementTimeoutError extends SaaSDataPersistenceError {
  constructor() { super("saas_data_statement_timeout"); this.name = "SaaSDataStatementTimeoutError"; }
}
export class SaaSDataLockTimeoutError extends SaaSDataPersistenceError {
  constructor() { super("saas_data_lock_timeout"); this.name = "SaaSDataLockTimeoutError"; }
}
export class SaaSDataUnknownCommitError extends SaaSDataPersistenceError {
  constructor() { super("saas_data_commit_unknown"); this.name = "SaaSDataUnknownCommitError"; }
}
export class SaaSDataCorruptionError extends SaaSDataPersistenceError {
  constructor() { super("saas_data_corruption"); this.name = "SaaSDataCorruptionError"; }
}
export class SaaSDataTransactionStateError extends SaaSDataPersistenceError {
  readonly code: SaaSDataTransactionStateCode;
  constructor(code: SaaSDataTransactionStateCode) {
    super(code);
    this.name = "SaaSDataTransactionStateError";
    this.code = code;
  }
}

const CONSTRAINTS: Readonly<Record<string, UniqueConflictKind>> = {
  principals_issuer_subject_key: "principal_identity",
  stores_slug_key: "store_slug",
  domains_hostname_key: "domain_hostname",
  memberships_principal_store_key: "membership",
  subscriptions_one_active_per_store_idx: "subscription",
  store_settings_store_key_key: "setting",
  tenant_operations_idempotency_key_key: "operation_idempotency",
};

function field(value: unknown, key: string): string | undefined {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>)[key] === "string"
    ? (value as Record<string, string>)[key]
    : undefined;
}

export function mapPostgresError(error: unknown): Error {
  const constraint = field(error, "constraint");
  if (constraint && CONSTRAINTS[constraint]) return new SaaSDataUniqueConflict(CONSTRAINTS[constraint]);
  const code = field(error, "code");
  if (code === "57014") return new SaaSDataStatementTimeoutError();
  if (code === "55P03" || code === "40P01") return new SaaSDataLockTimeoutError();
  return new SaaSDataPersistenceError();
}
