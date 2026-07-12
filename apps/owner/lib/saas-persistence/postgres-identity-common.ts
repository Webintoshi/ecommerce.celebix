import type { QueryResult } from "pg";

import type { AuthenticatedPayloadCipher, OpaqueStateDigester } from "./identity-crypto.ts";

export interface IdentityPostgresClient {
  query(text: string, values?: readonly unknown[]): Promise<QueryResult<Record<string, unknown>>>;
  release(destroy?: boolean | Error): void;
}

export interface IdentityPostgresPool {
  connect(): Promise<IdentityPostgresClient>;
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
  return error instanceof RegistrationPersistenceError ||
    (error instanceof Error && error.name === "OidcFlowError");
}

async function auditSafely(input: IdentityStoreDependencies, event: IdentityAuditEvent) {
  try { await input.audit(event); } catch { /* Audit failures never reveal or replace persistence outcomes. */ }
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
      await auditSafely(input, { operation: category, classification: "commit_unknown", result: "failure" });
      throw new IdentityPersistenceError("identity_commit_outcome_unknown");
    }
    terminal = true;
    try {
      client.release();
    } catch {
      try { client.release(true); } catch { /* destruction is best effort */ }
      await auditSafely(input, { operation: category, classification: "persistence_failure", result: "failure" });
      throw new IdentityPersistenceError();
    }
    await auditSafely(input, { operation: category, classification: "completed", result: "success" });
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
      await auditSafely(input, {
        operation: category,
        classification: isSafeError(error) ? "rejected" : "persistence_failure",
        result: "failure",
      });
    }
    if (isSafeError(error) || error instanceof IdentityPersistenceError) throw error;
    throw new IdentityPersistenceError();
  }
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
