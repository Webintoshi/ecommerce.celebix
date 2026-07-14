import type { OpaqueStateDigester } from "../saas-persistence/identity-crypto.ts";

import { assertPanelSessionHandoffApproval } from "./activation.ts";
import {
  PanelSessionHandoffCredentialError,
  createPanelSessionHandoffCredentialCodec,
} from "./credential-codec.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;
const ATTEMPT_ID = /^attempt_[A-Za-z0-9_-]{16,128}$/;
const MAXIMUM_HANDOFF_MS = 10 * 60_000;
const MAXIMUM_SESSION_MS = 8 * 60 * 60_000;
const MAXIMUM_TIMEOUT_MS = 60_000;

interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number | null;
}

interface PostgresClient {
  query(text: string, values?: readonly unknown[]): Promise<QueryResult>;
  release(destroy?: boolean | Error): void;
}

interface PostgresPool {
  connect(): Promise<PostgresClient>;
}

interface IssuerDependencies {
  pool: PostgresPool;
  stateDigester: OpaqueStateDigester;
  handoffKeys: ReadonlyMap<string, Uint8Array>;
  activeHandoffKeyId: string;
  sessionTokenKeyId: string;
  clock(): Date;
  randomUuid(): string;
  timeouts: {
    poolCheckoutMs: number;
    statementMs: number;
    lockMs: number;
    idleTransactionMs: number;
  };
  audit(event: PanelSessionHandoffIssuerAuditEvent): void | Promise<void>;
}

export type PanelSessionHandoffIssuerKind =
  | "handoff_created"
  | "handoff_replayed"
  | "expired"
  | "membership_denied"
  | "operation_mismatch"
  | "commit_unknown"
  | "unavailable"
  | "durable_authority_invalid";

export interface PanelSessionHandoffIssuerAuditEvent {
  operation: "create" | "recover";
  result: PanelSessionHandoffIssuerKind;
}

export type PanelSessionHandoffIssuerResult =
  | { kind: "handoff_created" | "handoff_replayed"; credential: string; expiresAt: string }
  | { kind: "commit_unknown"; credential: string }
  | { kind: "expired" | "membership_denied" | "operation_mismatch" | "unavailable" | "durable_authority_invalid" };

export interface PostgresPanelSessionHandoffIssuer {
  issueHandoff(input: { rawState: string }): Promise<PanelSessionHandoffIssuerResult>;
  recoverHandoff(input: { rawState: string }): Promise<PanelSessionHandoffIssuerResult>;
}

interface HandoffAuthority {
  handoffId: string;
  attemptId: string;
  tenantOperationId: string;
  principalId: string;
  activeStoreId: string;
  sessionOperationId: string;
  sessionId: string;
  familyId: string;
  tokenKeyId: string;
  tokenDigest: string;
  sessionTokenKeyId: string;
  issuedAt: string;
  expiresAt: string;
  sessionExpiresAt: string;
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid");
  const row = value as Record<string, unknown>;
  if (keys.some((key) => !(key in row)) || Object.keys(row).some((key) => !keys.includes(key))) throw new Error("invalid");
  return row;
}

function string(value: unknown, maximum = 2048): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value.trim() !== value) throw new Error("invalid");
  return value;
}

function uuid(value: unknown): string {
  const parsed = string(value, 36);
  if (!UUID.test(parsed)) throw new Error("invalid");
  return parsed;
}

function keyId(value: unknown): string {
  const parsed = string(value, 64);
  if (!KEY_ID.test(parsed) || parsed.startsWith(".") || parsed.endsWith(".") || parsed.includes("..")) throw new Error("invalid");
  return parsed;
}

function timestamp(value: unknown): string {
  const parsed = value instanceof Date ? value.toISOString() : string(value, 32);
  const milliseconds = Date.parse(parsed);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== parsed) throw new Error("invalid");
  return parsed;
}

function authority(value: unknown): HandoffAuthority {
  const keys = [
    "handoffId", "attemptId", "tenantOperationId", "principalId", "activeStoreId",
    "sessionOperationId", "sessionId", "familyId", "tokenKeyId", "tokenDigest",
    "sessionTokenKeyId", "issuedAt", "expiresAt", "sessionExpiresAt",
  ] as const;
  const row = exact(value, keys);
  const issuedAt = timestamp(row.issuedAt);
  const expiresAt = timestamp(row.expiresAt);
  const sessionExpiresAt = timestamp(row.sessionExpiresAt);
  const issued = Date.parse(issuedAt);
  const expires = Date.parse(expiresAt);
  const sessionExpires = Date.parse(sessionExpiresAt);
  const attemptId = string(row.attemptId, 136);
  const tokenDigest = string(row.tokenDigest, 64);
  if (
    !ATTEMPT_ID.test(attemptId)
    || !DIGEST.test(tokenDigest)
    || expires <= issued
    || expires > issued + MAXIMUM_HANDOFF_MS
    || sessionExpires <= issued
    || sessionExpires > issued + MAXIMUM_SESSION_MS
  ) throw new Error("invalid");
  return Object.freeze({
    handoffId: uuid(row.handoffId),
    attemptId,
    tenantOperationId: uuid(row.tenantOperationId),
    principalId: uuid(row.principalId),
    activeStoreId: uuid(row.activeStoreId),
    sessionOperationId: uuid(row.sessionOperationId),
    sessionId: uuid(row.sessionId),
    familyId: uuid(row.familyId),
    tokenKeyId: keyId(row.tokenKeyId),
    tokenDigest,
    sessionTokenKeyId: keyId(row.sessionTokenKeyId),
    issuedAt,
    expiresAt,
    sessionExpiresAt,
  });
}

function outcome(value: unknown): PanelSessionHandoffIssuerKind {
  const parsed = string(value, 64) as PanelSessionHandoffIssuerKind;
  if (![
    "handoff_created", "handoff_replayed", "expired", "membership_denied",
    "operation_mismatch", "durable_authority_invalid",
  ].includes(parsed)) throw new Error("invalid");
  return parsed;
}

function oneRow(result: QueryResult): { outcome: PanelSessionHandoffIssuerKind; authority: unknown } {
  if (result.rows.length !== 1 || result.rowCount !== 1) throw new Error("invalid");
  const row = exact(result.rows[0], ["outcome", "authority"]);
  return { outcome: outcome(row.outcome), authority: row.authority };
}

function bounded(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAXIMUM_TIMEOUT_MS) throw new Error("invalid");
  return value;
}

function validate(input: IssuerDependencies): IssuerDependencies {
  if (
    !input
    || !input.pool
    || typeof input.pool.connect !== "function"
    || !input.stateDigester
    || typeof input.stateDigester.digest !== "function"
    || typeof input.clock !== "function"
    || typeof input.randomUuid !== "function"
    || typeof input.audit !== "function"
  ) throw new Error("panel_session_handoff_issuer_invalid");
  keyId(input.sessionTokenKeyId);
  bounded(input.timeouts.poolCheckoutMs);
  bounded(input.timeouts.statementMs);
  bounded(input.timeouts.lockMs);
  bounded(input.timeouts.idleTransactionMs);
  return input;
}

function now(input: IssuerDependencies): Date {
  const value = input.clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("invalid");
  return new Date(value);
}

async function acquire(input: IssuerDependencies): Promise<PostgresClient> {
  const pending = Promise.resolve().then(() => input.pool.connect());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { timedOut = true; reject(new Error("timeout")); }, input.timeouts.poolCheckoutMs);
  });
  try {
    return await Promise.race([pending, deadline]);
  } catch {
    if (timedOut) void pending.then((client) => client.release(true)).catch(() => undefined);
    throw new Error("unavailable");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type TransactionResult<T> = { status: "ok"; value: T } | { status: "commit_unknown" | "unavailable" };

async function transaction<T>(
  input: IssuerDependencies,
  mode: "read" | "write",
  work: (client: PostgresClient) => Promise<T>,
): Promise<TransactionResult<T>> {
  let client: PostgresClient;
  try { client = await acquire(input); } catch { return { status: "unavailable" }; }
  let began = false;
  let commitForwarded = false;
  try {
    await client.query(mode === "read" ? "BEGIN READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED");
    began = true;
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [`${input.timeouts.statementMs}ms`]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [`${input.timeouts.lockMs}ms`]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [`${input.timeouts.idleTransactionMs}ms`]);
    await client.query("SET LOCAL ROLE celebix_saas_identity");
    const value = await work(client);
    commitForwarded = true;
    await client.query("COMMIT");
    try { client.release(); } catch { try { client.release(true); } catch { /* best effort */ } }
    return { status: "ok", value };
  } catch {
    if (commitForwarded) {
      try { client.release(true); } catch { /* best effort */ }
      return { status: mode === "write" ? "commit_unknown" : "unavailable" };
    }
    if (began) {
      try { await client.query("ROLLBACK"); } catch { /* destroy below */ }
    }
    try { client.release(true); } catch { /* best effort */ }
    return { status: "unavailable" };
  }
}

function auditSafely(input: IssuerDependencies, event: PanelSessionHandoffIssuerAuditEvent): void {
  try {
    const pending = input.audit(Object.freeze({ ...event }));
    if (pending) void Promise.resolve(pending).catch(() => undefined);
  } catch {
    // Observability is never durable handoff authority.
  }
}

export function createPostgresPanelSessionHandoffIssuer(
  approval: unknown,
  rawDependencies: IssuerDependencies,
): PostgresPanelSessionHandoffIssuer {
  assertPanelSessionHandoffApproval(approval);
  const dependencies = validate(rawDependencies);
  const codec = createPanelSessionHandoffCredentialCodec({
    keys: dependencies.handoffKeys,
    activeKeyId: dependencies.activeHandoffKeyId,
  });

  const finish = (operation: PanelSessionHandoffIssuerAuditEvent["operation"], result: PanelSessionHandoffIssuerResult) => {
    auditSafely(dependencies, { operation, result: result.kind });
    return Object.freeze({ ...result }) as PanelSessionHandoffIssuerResult;
  };

  function stateDigest(rawState: string): string {
    codec.deriveCredential(rawState);
    const value = dependencies.stateDigester.digest(rawState);
    if (typeof value !== "string" || !DIGEST.test(value)) throw new Error("invalid");
    return value;
  }

  function project(
    operation: PanelSessionHandoffIssuerAuditEvent["operation"],
    kind: PanelSessionHandoffIssuerKind,
    rawState: string,
    value: unknown,
  ): PanelSessionHandoffIssuerResult {
    if (kind !== "handoff_created" && kind !== "handoff_replayed") {
      return finish(operation, { kind: kind as "expired" | "membership_denied" | "operation_mismatch" | "durable_authority_invalid" });
    }
    try {
      const persisted = authority(value);
      if (kind === "handoff_created" && (
        persisted.tokenKeyId !== dependencies.activeHandoffKeyId
        || persisted.sessionTokenKeyId !== dependencies.sessionTokenKeyId
      )) throw new Error("invalid");
      const derived = codec.deriveCredential(rawState, persisted.tokenKeyId);
      if (derived.tokenDigest !== persisted.tokenDigest) throw new Error("invalid");
      return finish(operation, { kind, credential: derived.credential, expiresAt: persisted.expiresAt });
    } catch {
      return finish(operation, { kind: "durable_authority_invalid" });
    }
  }

  return Object.freeze({
    async issueHandoff({ rawState }: { rawState: string }): Promise<PanelSessionHandoffIssuerResult> {
      let digest: string;
      let candidate;
      let handoffId: string;
      let sessionOperationId: string;
      let sessionId: string;
      let familyId: string;
      let issuedAt: Date;
      try {
        digest = stateDigest(rawState);
        candidate = codec.deriveCredential(rawState);
        handoffId = uuid(dependencies.randomUuid());
        sessionOperationId = uuid(dependencies.randomUuid());
        sessionId = uuid(dependencies.randomUuid());
        familyId = uuid(dependencies.randomUuid());
        issuedAt = now(dependencies);
      } catch {
        return finish("create", { kind: "durable_authority_invalid" });
      }
      const expiresAt = new Date(issuedAt.getTime() + MAXIMUM_HANDOFF_MS);
      const sessionExpiresAt = new Date(issuedAt.getTime() + MAXIMUM_SESSION_MS);
      const executed = await transaction(dependencies, "write", async (client) => oneRow(await client.query(
        "SELECT outcome, authority FROM saas.create_panel_session_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          digest, candidate.tokenKeyId, candidate.tokenDigest, dependencies.sessionTokenKeyId,
          handoffId, sessionOperationId, sessionId, familyId, issuedAt, expiresAt, sessionExpiresAt,
        ],
      )));
      if (executed.status === "commit_unknown") return finish("create", { kind: "commit_unknown", credential: candidate.credential });
      if (executed.status !== "ok") return finish("create", { kind: "unavailable" });
      return project("create", executed.value.outcome, rawState, executed.value.authority);
    },

    async recoverHandoff({ rawState }: { rawState: string }): Promise<PanelSessionHandoffIssuerResult> {
      let digest: string;
      let recoveredAt: Date;
      try { digest = stateDigest(rawState); recoveredAt = now(dependencies); }
      catch { return finish("recover", { kind: "durable_authority_invalid" }); }
      const executed = await transaction(dependencies, "read", async (client) => oneRow(await client.query(
        "SELECT outcome, authority FROM saas.recover_panel_session_handoff($1,$2)",
        [digest, recoveredAt],
      )));
      if (executed.status !== "ok") return finish("recover", { kind: "unavailable" });
      return project("recover", executed.value.outcome, rawState, executed.value.authority);
    },
  });
}
