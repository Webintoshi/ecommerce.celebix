import type { OpaqueStateDigester } from "../saas-persistence/identity-crypto.ts";

import { assertPanelSessionHandoffApproval } from "./activation.ts";
import {
  createPanelSessionHandoffCredentialCodec,
  type DerivedPanelSessionHandoffCredential,
} from "./credential-codec.ts";
import {
  isActiveInitialVerifiedCallbackGrantForState,
  isInitialVerifiedCallbackGrantBoundary,
  type InitialVerifiedCallbackGrant,
  type InitialVerifiedCallbackGrantBoundary,
} from "./initial-callback-grant.ts";

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
  randomBytes(size: number): Uint8Array;
  randomUuid(): string;
  timeouts: {
    poolCheckoutMs: number;
    statementMs: number;
    lockMs: number;
    idleTransactionMs: number;
  };
  audit(event: PanelSessionHandoffIssuerAuditEvent): void | Promise<void>;
  initialCallbackGrantBoundary: InitialVerifiedCallbackGrantBoundary;
}

interface IssuerSnapshot {
  pool: PostgresPool;
  stateDigester: OpaqueStateDigester;
  activeHandoffKeyId: string;
  sessionTokenKeyId: string;
  clock: () => Date;
  randomUuid: () => string;
  timeouts: Readonly<IssuerDependencies["timeouts"]>;
  audit: IssuerDependencies["audit"];
  initialCallbackGrantBoundary: InitialVerifiedCallbackGrantBoundary;
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
  | { kind: "handoff_created" | "handoff_replayed"; credential: string; expiresAt: string; activeStoreId: string }
  | { kind: "commit_unknown"; credential: string }
  | { kind: "expired" | "membership_denied" | "operation_mismatch" | "unavailable" | "durable_authority_invalid" };

export interface PostgresPanelSessionHandoffIssuer {
  issueHandoff(input: { rawState: string; initialCallbackGrant: InitialVerifiedCallbackGrant }): Promise<PanelSessionHandoffIssuerResult>;
  recoverHandoff(input: {
    rawState: string;
    candidateCredential: string;
    initialCallbackGrant: InitialVerifiedCallbackGrant;
  }): Promise<PanelSessionHandoffIssuerResult>;
}

const issuerAuthorities = new WeakMap<object, InitialVerifiedCallbackGrantBoundary>();

export function isPostgresPanelSessionHandoffIssuerForBoundary(
  issuer: unknown,
  boundary: InitialVerifiedCallbackGrantBoundary,
): issuer is PostgresPanelSessionHandoffIssuer {
  return Boolean(
    issuer && typeof issuer === "object" && isInitialVerifiedCallbackGrantBoundary(boundary)
    && issuerAuthorities.get(issuer) === boundary,
  );
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

function rawState(value: unknown): string {
  const parsed = string(value, 1024);
  if (parsed.length < 16) throw new Error("invalid");
  return parsed;
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
  if (!ATTEMPT_ID.test(attemptId) || !DIGEST.test(tokenDigest)
    || expires <= issued || expires > issued + MAXIMUM_HANDOFF_MS
    || sessionExpires <= issued || sessionExpires > issued + MAXIMUM_SESSION_MS) throw new Error("invalid");
  return Object.freeze({
    handoffId: uuid(row.handoffId), attemptId, tenantOperationId: uuid(row.tenantOperationId),
    principalId: uuid(row.principalId), activeStoreId: uuid(row.activeStoreId),
    sessionOperationId: uuid(row.sessionOperationId), sessionId: uuid(row.sessionId), familyId: uuid(row.familyId),
    tokenKeyId: keyId(row.tokenKeyId), tokenDigest, sessionTokenKeyId: keyId(row.sessionTokenKeyId),
    issuedAt, expiresAt, sessionExpiresAt,
  });
}

function outcome(value: unknown): PanelSessionHandoffIssuerKind {
  const parsed = string(value, 64) as PanelSessionHandoffIssuerKind;
  if (!["handoff_created", "handoff_replayed", "expired", "membership_denied", "operation_mismatch", "durable_authority_invalid"].includes(parsed)) {
    throw new Error("invalid");
  }
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

function snapshot(input: IssuerDependencies): { dependencies: IssuerSnapshot; codec: ReturnType<typeof createPanelSessionHandoffCredentialCodec> } {
  if (!input || !input.pool || typeof input.pool.connect !== "function"
    || !input.stateDigester || typeof input.stateDigester.digest !== "function"
    || typeof input.clock !== "function" || typeof input.randomBytes !== "function"
    || typeof input.randomUuid !== "function" || typeof input.audit !== "function"
    || !isInitialVerifiedCallbackGrantBoundary(input.initialCallbackGrantBoundary)) {
    throw new Error("panel_session_handoff_issuer_invalid");
  }
  const activeHandoffKeyId = keyId(input.activeHandoffKeyId);
  const sessionTokenKeyId = keyId(input.sessionTokenKeyId);
  const randomBytes = input.randomBytes;
  const codec = createPanelSessionHandoffCredentialCodec({ keys: input.handoffKeys, activeKeyId: activeHandoffKeyId, randomBytes });
  return {
    dependencies: Object.freeze({
      pool: input.pool,
      stateDigester: input.stateDigester,
      activeHandoffKeyId,
      sessionTokenKeyId,
      clock: input.clock,
      randomUuid: input.randomUuid,
      timeouts: Object.freeze({
        poolCheckoutMs: bounded(input.timeouts.poolCheckoutMs),
        statementMs: bounded(input.timeouts.statementMs),
        lockMs: bounded(input.timeouts.lockMs),
        idleTransactionMs: bounded(input.timeouts.idleTransactionMs),
      }),
      audit: input.audit,
      initialCallbackGrantBoundary: input.initialCallbackGrantBoundary,
    }),
    codec,
  };
}

function now(input: IssuerSnapshot): Date {
  const value = input.clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("invalid");
  return new Date(value);
}

async function acquire(input: IssuerSnapshot): Promise<PostgresClient> {
  const pending = Promise.resolve().then(() => input.pool.connect());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { timedOut = true; reject(new Error("timeout")); }, input.timeouts.poolCheckoutMs);
  });
  try { return await Promise.race([pending, deadline]); }
  catch {
    if (timedOut) void pending.then((client) => client.release(true)).catch(() => undefined);
    throw new Error("unavailable");
  } finally { if (timer) clearTimeout(timer); }
}

type TransactionResult<T> = { status: "ok"; value: T } | { status: "commit_unknown" | "unavailable" };

async function transaction<T>(input: IssuerSnapshot, mode: "read" | "write", work: (client: PostgresClient) => Promise<T>): Promise<TransactionResult<T>> {
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
    if (began) try { await client.query("ROLLBACK"); } catch { /* destroy below */ }
    try { client.release(true); } catch { /* best effort */ }
    return { status: "unavailable" };
  }
}

function auditSafely(input: IssuerSnapshot, event: PanelSessionHandoffIssuerAuditEvent): void {
  try {
    const pending = input.audit(Object.freeze({ ...event }));
    if (pending) void Promise.resolve(pending).catch(() => undefined);
  } catch { /* observability is never handoff authority */ }
}

export function createPostgresPanelSessionHandoffIssuer(approval: unknown, rawDependencies: IssuerDependencies): PostgresPanelSessionHandoffIssuer {
  assertPanelSessionHandoffApproval(approval);
  const { dependencies, codec } = snapshot(rawDependencies);
  const finish = (operation: PanelSessionHandoffIssuerAuditEvent["operation"], result: PanelSessionHandoffIssuerResult) => {
    auditSafely(dependencies, { operation, result: result.kind });
    return Object.freeze({ ...result }) as PanelSessionHandoffIssuerResult;
  };

  function validGrant(grant: unknown, state: unknown): grant is InitialVerifiedCallbackGrant {
    return isActiveInitialVerifiedCallbackGrantForState(
      dependencies.initialCallbackGrantBoundary,
      grant,
      state,
    );
  }

  function stateDigest(state: string): string {
    const canonical = rawState(state);
    const value = dependencies.stateDigester.digest(canonical);
    if (typeof value !== "string" || !DIGEST.test(value)) throw new Error("invalid");
    return value;
  }

  function project(operation: "create" | "recover", kind: PanelSessionHandoffIssuerKind, candidate: DerivedPanelSessionHandoffCredential, value: unknown): PanelSessionHandoffIssuerResult {
    if (kind !== "handoff_created" && kind !== "handoff_replayed") {
      return finish(operation, { kind: kind as "expired" | "membership_denied" | "operation_mismatch" | "durable_authority_invalid" });
    }
    try {
      const persisted = authority(value);
      if (persisted.tokenKeyId !== candidate.tokenKeyId
        || persisted.tokenDigest !== candidate.tokenDigest
        || persisted.sessionTokenKeyId !== dependencies.sessionTokenKeyId) throw new Error("invalid");
      return finish(operation, {
        kind,
        credential: candidate.credential,
        expiresAt: persisted.expiresAt,
        activeStoreId: persisted.activeStoreId,
      });
    } catch { return finish(operation, { kind: "durable_authority_invalid" }); }
  }

  const issuer: PostgresPanelSessionHandoffIssuer = Object.freeze({
    async issueHandoff({ rawState: state, initialCallbackGrant }: { rawState: string; initialCallbackGrant: InitialVerifiedCallbackGrant }) {
      if (!validGrant(initialCallbackGrant, state)) return finish("create", { kind: "durable_authority_invalid" });
      let digest: string;
      let candidate: DerivedPanelSessionHandoffCredential;
      let identifiers: string[];
      let issuedAt: Date;
      try {
        digest = stateDigest(state);
        candidate = codec.generateCredential();
        identifiers = Array.from({ length: 4 }, () => uuid(dependencies.randomUuid()));
        issuedAt = now(dependencies);
      } catch { return finish("create", { kind: "durable_authority_invalid" }); }
      const expiresAt = new Date(issuedAt.getTime() + MAXIMUM_HANDOFF_MS);
      const sessionExpiresAt = new Date(issuedAt.getTime() + MAXIMUM_SESSION_MS);
      const executed = await transaction(dependencies, "write", async (client) => oneRow(await client.query(
        "SELECT outcome, authority FROM saas.create_panel_session_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [digest, candidate.tokenKeyId, candidate.tokenDigest, dependencies.sessionTokenKeyId, ...identifiers, issuedAt, expiresAt, sessionExpiresAt],
      )));
      if (executed.status === "commit_unknown") return finish("create", { kind: "commit_unknown", credential: candidate.credential });
      if (executed.status !== "ok") return finish("create", { kind: "unavailable" });
      return project("create", executed.value.outcome, candidate, executed.value.authority);
    },

    async recoverHandoff({ rawState: state, candidateCredential, initialCallbackGrant }: {
      rawState: string; candidateCredential: string; initialCallbackGrant: InitialVerifiedCallbackGrant;
    }) {
      if (!validGrant(initialCallbackGrant, state)) return finish("recover", { kind: "durable_authority_invalid" });
      let digest: string;
      let proof;
      let recoveredAt: Date;
      try {
        digest = stateDigest(state);
        proof = codec.digestCredential(candidateCredential);
        recoveredAt = now(dependencies);
      } catch {
        return finish("recover", { kind: "durable_authority_invalid" });
      }
      const candidate = Object.freeze({ credential: candidateCredential, ...proof });
      const executed = await transaction(dependencies, "read", async (client) => oneRow(await client.query(
        "SELECT outcome, authority FROM saas.recover_panel_session_handoff($1,$2,$3,$4,$5)",
        [digest, proof.tokenKeyId, proof.tokenDigest, dependencies.sessionTokenKeyId, recoveredAt],
      )));
      if (executed.status !== "ok") return finish("recover", { kind: "unavailable" });
      return project("recover", executed.value.outcome, candidate, executed.value.authority);
    },
  });
  issuerAuthorities.set(issuer, dependencies.initialCallbackGrantBoundary);
  return issuer;
}
