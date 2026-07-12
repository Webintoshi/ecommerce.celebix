import {
  IdentityCryptoError,
  type AuthenticatedPayloadCipher,
  type OpaqueStateDigester,
} from "./identity-crypto.ts";

export interface IdentityQueryResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  rows: Row[];
  rowCount: number | null;
}

export interface IdentityPostgresClient {
  query(text: string, values?: readonly unknown[]): Promise<IdentityQueryResult>;
  release(destroy?: boolean | Error): void;
  on?(event: "error", listener: (error: Error) => void): this;
  removeListener?(event: "error", listener: (error: Error) => void): this;
}

export interface IdentityPostgresPool {
  connect(): Promise<IdentityPostgresClient>;
}

export interface IdentitySessionLease {
  release(): Promise<void>;
}

export interface IdentityTimeouts {
  poolCheckoutMs: number;
  statementMs: number;
  lockMs: number;
  idleTransactionMs: number;
}

export interface IdentityAuditEvent {
  operation: "registration" | "oidc" | "cleanup";
  classification: "completed" | "rejected" | "persistence_failure" | "commit_unknown";
  status?: string;
  result: "success" | "failure";
}

export interface IdentityStoreDependencies {
  pool: IdentityPostgresPool;
  stateDigester: OpaqueStateDigester;
  payloadCipher: AuthenticatedPayloadCipher;
  timeouts: IdentityTimeouts;
  clock: () => Date;
  audit: (event: IdentityAuditEvent) => void | Promise<void>;
  identityRole: "celebix_saas_identity";
}

export class IdentityPersistenceError extends Error {
  constructor(message = "identity_persistence_failed") {
    super(message);
    this.name = "IdentityPersistenceError";
  }
}

export class RegistrationCompletionCorruptionError extends IdentityPersistenceError {
  constructor() {
    super("registration_completion_corrupt");
    this.name = "RegistrationCompletionCorruptionError";
  }
}

export class IdentityPoolTimeoutError extends IdentityPersistenceError {
  constructor() {
    super("identity_pool_checkout_timeout");
    this.name = "IdentityPoolTimeoutError";
  }
}

export class RegistrationPersistenceError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "RegistrationPersistenceError";
    this.code = code;
  }
}

function bounded(value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new IdentityPersistenceError();
  return value;
}

export function validateDependencies(input: IdentityStoreDependencies): IdentityStoreDependencies {
  if (input.identityRole !== "celebix_saas_identity") throw new IdentityPersistenceError();
  if (!input.pool || typeof input.pool.connect !== "function" || typeof input.clock !== "function" || typeof input.audit !== "function") {
    throw new IdentityPersistenceError();
  }
  bounded(input.timeouts.poolCheckoutMs, 60_000);
  bounded(input.timeouts.statementMs, 60_000);
  bounded(input.timeouts.lockMs, 60_000);
  bounded(input.timeouts.idleTransactionMs, 60_000);
  return input;
}

async function acquire(input: IdentityStoreDependencies): Promise<IdentityPostgresClient> {
  const pending = Promise.resolve().then(() => input.pool.connect());
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new IdentityPoolTimeoutError());
    }, input.timeouts.poolCheckoutMs);
  });
  try {
    return await Promise.race([pending, deadline]);
  } catch (error) {
    if (timedOut) {
      void pending.then((client) => client.release(true)).catch(() => undefined);
      throw new IdentityPoolTimeoutError();
    }
    if (error instanceof IdentityPersistenceError) throw error;
    throw new IdentityPersistenceError();
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function isSafeError(error: unknown): boolean {
  return error instanceof IdentityCryptoError ||
    error instanceof RegistrationCompletionCorruptionError ||
    error instanceof RegistrationPersistenceError ||
    (error instanceof Error && error.name === "OidcFlowError");
}

function auditSafely(input: IdentityStoreDependencies, event: IdentityAuditEvent): void {
  try {
    const pending = input.audit(event);
    if (pending) void pending.catch(() => undefined);
  } catch {
    // Audit is deliberately isolated from the authoritative persistence result.
  }
}

export async function withIdentityTransaction<T>(
  input: IdentityStoreDependencies,
  category: IdentityAuditEvent["operation"],
  work: (client: IdentityPostgresClient) => Promise<T>,
): Promise<T> {
  const client = await acquire(input);
  let began = false;
  let terminal = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    began = true;
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [`${input.timeouts.statementMs}ms`]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [`${input.timeouts.lockMs}ms`]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [`${input.timeouts.idleTransactionMs}ms`]);
    await client.query("SET LOCAL ROLE celebix_saas_identity");
    const result = await work(client);
    try {
      await client.query("COMMIT");
    } catch {
      terminal = true;
      try { client.release(true); } catch { /* already uncertain */ }
      auditSafely(input, { operation: category, classification: "commit_unknown", result: "failure" });
      throw new IdentityPersistenceError("identity_commit_outcome_unknown");
    }
    terminal = true;
    try {
      client.release();
    } catch {
      try { client.release(true); } catch { /* destruction is best effort */ }
      auditSafely(input, { operation: category, classification: "persistence_failure", result: "failure" });
      throw new IdentityPersistenceError();
    }
    auditSafely(input, { operation: category, classification: "completed", result: "success" });
    return result;
  } catch (error) {
    if (!terminal) {
      if (began) {
        try {
          await client.query("ROLLBACK");
          terminal = true;
          client.release();
        } catch {
          terminal = true;
          try { client.release(true); } catch { /* destruction is best effort */ }
        }
      } else {
        terminal = true;
        try { client.release(true); } catch { /* destruction is best effort */ }
      }
    }
    if (!(terminal && error instanceof IdentityPersistenceError && error.message === "identity_commit_outcome_unknown")) {
      auditSafely(input, {
        operation: category,
        classification: isSafeError(error) ? "rejected" : "persistence_failure",
        result: "failure",
      });
    }
    if (isSafeError(error) || error instanceof IdentityPersistenceError) throw error;
    throw new IdentityPersistenceError();
  }
}

export const IDENTITY_COMPLETION_LEASE_SEED = 2_607_120_012;

export async function withIdentityTransactionLease<T>(
  input: IdentityStoreDependencies,
  category: IdentityAuditEvent["operation"],
  work: (client: IdentityPostgresClient) => Promise<{ result: T; leaseKey?: string }>,
): Promise<{ result: T; lease?: IdentitySessionLease }> {
  const client = await acquire(input);
  let connectionFailed = false;
  const handleConnectionError = () => { connectionFailed = true; };
  client.on?.("error", handleConnectionError);
  const removeConnectionListener = () => client.removeListener?.("error", handleConnectionError);
  let began = false;
  let terminal = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    began = true;
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [`${input.timeouts.statementMs}ms`]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [`${input.timeouts.lockMs}ms`]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [`${input.timeouts.idleTransactionMs}ms`]);
    await client.query("SET LOCAL ROLE celebix_saas_identity");
    const outcome = await work(client);
    try {
      await client.query("COMMIT");
    } catch {
      terminal = true;
      removeConnectionListener();
      try { client.release(true); } catch { /* already uncertain */ }
      auditSafely(input, { operation: category, classification: "commit_unknown", result: "failure" });
      throw new IdentityPersistenceError("identity_commit_outcome_unknown");
    }
    terminal = true;
    if (!outcome.leaseKey) {
      try {
        removeConnectionListener();
        client.release();
      } catch {
        try { client.release(true); } catch { /* destruction is best effort */ }
        throw new IdentityPersistenceError();
      }
      auditSafely(input, { operation: category, classification: "completed", result: "success" });
      return { result: outcome.result };
    }
    let released = false;
    const leaseKey = outcome.leaseKey;
    const lease: IdentitySessionLease = {
      release: async () => {
        if (released) return;
        released = true;
        try {
          if (connectionFailed) throw new IdentityPersistenceError();
          const unlocked = await client.query(
            "SELECT pg_catalog.pg_advisory_unlock(pg_catalog.hashtextextended($1, $2)) AS unlocked",
            [leaseKey, IDENTITY_COMPLETION_LEASE_SEED],
          );
          if (unlocked.rows[0]?.unlocked !== true) throw new IdentityPersistenceError();
          removeConnectionListener();
          client.release();
        } catch {
          removeConnectionListener();
          try { client.release(true); } catch { /* session destruction releases the lock */ }
          throw new IdentityPersistenceError();
        }
      },
    };
    auditSafely(input, { operation: category, classification: "completed", result: "success" });
    return { result: outcome.result, lease };
  } catch (error) {
    if (!terminal) {
      if (began) {
        try {
          await client.query("ROLLBACK");
          terminal = true;
          removeConnectionListener();
          client.release();
        } catch {
          terminal = true;
          removeConnectionListener();
          try { client.release(true); } catch { /* destruction is best effort */ }
        }
      } else {
        terminal = true;
        removeConnectionListener();
        try { client.release(true); } catch { /* destruction is best effort */ }
      }
    }
    if (!(terminal && error instanceof IdentityPersistenceError && error.message === "identity_commit_outcome_unknown")) {
      auditSafely(input, { operation: category, classification: isSafeError(error) ? "rejected" : "persistence_failure", result: "failure" });
    }
    if (isSafeError(error) || error instanceof IdentityPersistenceError) throw error;
    throw new IdentityPersistenceError();
  }
}

export async function isIdentityCompletionLeaseActive(
  input: IdentityStoreDependencies,
  attemptId: string,
): Promise<boolean> {
  return withIdentityTransaction(input, "registration", async (client) => {
    const probe = await client.query(
      "SELECT pg_catalog.pg_try_advisory_lock(pg_catalog.hashtextextended($1, $2)) AS acquired",
      [attemptId, IDENTITY_COMPLETION_LEASE_SEED],
    );
    if (probe.rows[0]?.acquired === false) return true;
    if (probe.rows[0]?.acquired !== true) throw new IdentityPersistenceError();
    const unlocked = await client.query(
      "SELECT pg_catalog.pg_advisory_unlock(pg_catalog.hashtextextended($1, $2)) AS unlocked",
      [attemptId, IDENTITY_COMPLETION_LEASE_SEED],
    );
    if (unlocked.rows[0]?.unlocked !== true) throw new IdentityPersistenceError();
    return false;
  });
}

export function canonicalTimestamp(value: unknown): string {
  if (typeof value !== "string") throw new IdentityPersistenceError();
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) throw new IdentityPersistenceError();
  return value;
}

export function exactObject(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new IdentityPersistenceError();
  const record = value as Record<string, unknown>;
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !(key in record)) || Object.keys(record).some((key) => !allowed.has(key))) {
    throw new IdentityPersistenceError();
  }
  return record;
}

export function requiredString(value: unknown, maximum = 512): string {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > maximum) throw new IdentityPersistenceError();
  return value;
}

export function byteValue(value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array) || value.length === 0) throw new IdentityPersistenceError();
  return value;
}

export function batchSize(value: number): number {
  return bounded(value, 100);
}
