import {
  PanelSessionCredentialError,
  createPanelSessionCredentialCodec,
} from "../panel-session-persistence/credential-codec.ts";

import { assertPanelSessionHandoffApproval } from "./activation.ts";
import {
  PanelSessionHandoffCredentialError,
  createPanelSessionHandoffCredentialVerifier,
} from "./credential-codec.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;
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

interface RedeemerDependencies {
  pool: PostgresPool;
  handoffKeys: ReadonlyMap<string, Uint8Array>;
  sessionKeys: ReadonlyMap<string, Uint8Array>;
  clock(): Date;
  timeouts: {
    poolCheckoutMs: number;
    statementMs: number;
    lockMs: number;
    idleTransactionMs: number;
  };
  audit(event: PanelSessionHandoffRedeemerAuditEvent): void | Promise<void>;
}

export type PanelSessionHandoffRedeemerKind =
  | "session_issued"
  | "session_replayed"
  | "expired"
  | "unauthenticated"
  | "membership_denied"
  | "operation_mismatch"
  | "commit_unknown"
  | "unavailable"
  | "durable_authority_invalid";

export interface PanelSessionHandoffRedeemerAuditEvent {
  operation: "redeem" | "recover";
  result: PanelSessionHandoffRedeemerKind;
}

export interface PersistedHandoffPanelSession {
  sessionId: string;
  familyId: string;
  principalId: string;
  activeStoreId: string;
  version: number;
  issuedAt: string;
  rotatedAt: string;
  expiresAt: string;
}

export type PanelSessionHandoffRedemptionResult =
  | { kind: "session_issued" | "session_replayed"; credential: string; session: PersistedHandoffPanelSession }
  | { kind: "commit_unknown"; credential: string }
  | { kind: "expired" | "unauthenticated" | "membership_denied" | "operation_mismatch" | "unavailable" | "durable_authority_invalid" };

export interface PostgresPanelSessionHandoffRedeemer {
  redeemHandoff(input: { credential: string }): Promise<PanelSessionHandoffRedemptionResult>;
  recoverRedemption(input: { credential: string }): Promise<PanelSessionHandoffRedemptionResult>;
}

function exact(value: unknown, required: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid");
  const row = value as Record<string, unknown>;
  if (required.some((key) => !(key in row)) || Object.keys(row).some((key) => !required.includes(key))) throw new Error("invalid");
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

function integer(value: unknown): number {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || (parsed as number) < 1) throw new Error("invalid");
  return parsed as number;
}

function timestamp(value: unknown): string {
  const parsed = value instanceof Date ? value.toISOString() : string(value, 32);
  const milliseconds = Date.parse(parsed);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== parsed) throw new Error("invalid");
  return parsed;
}

function sessionAuthority(value: unknown): PersistedHandoffPanelSession {
  const outer = exact(value, ["session"]);
  const row = exact(outer.session, [
    "sessionId", "familyId", "principalId", "activeStoreId", "version",
    "issuedAt", "rotatedAt", "expiresAt",
  ]);
  const issuedAt = timestamp(row.issuedAt);
  const rotatedAt = timestamp(row.rotatedAt);
  const expiresAt = timestamp(row.expiresAt);
  const issued = Date.parse(issuedAt);
  const rotated = Date.parse(rotatedAt);
  const expires = Date.parse(expiresAt);
  if (issued > rotated || rotated >= expires || expires > issued + MAXIMUM_SESSION_MS) throw new Error("invalid");
  return Object.freeze({
    sessionId: uuid(row.sessionId),
    familyId: uuid(row.familyId),
    principalId: uuid(row.principalId),
    activeStoreId: uuid(row.activeStoreId),
    version: integer(row.version),
    issuedAt,
    rotatedAt,
    expiresAt,
  });
}

type DatabaseOutcome =
  | "handoff_replayed"
  | "session_issued"
  | "session_replayed"
  | "expired"
  | "unauthenticated"
  | "membership_denied"
  | "operation_mismatch"
  | "durable_authority_invalid";

function oneRow(result: QueryResult): { outcome: DatabaseOutcome; authority: unknown } {
  if (result.rows.length !== 1 || result.rowCount !== 1) throw new Error("invalid");
  const row = exact(result.rows[0], ["outcome", "authority"]);
  const outcome = string(row.outcome, 64) as DatabaseOutcome;
  if (![
    "handoff_replayed", "session_issued", "session_replayed", "expired", "unauthenticated",
    "membership_denied", "operation_mismatch", "durable_authority_invalid",
  ].includes(outcome)) throw new Error("invalid");
  return { outcome, authority: row.authority };
}

function bounded(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAXIMUM_TIMEOUT_MS) throw new Error("invalid");
  return value;
}

function validate(input: RedeemerDependencies): RedeemerDependencies {
  if (!input || !input.pool || typeof input.pool.connect !== "function" || typeof input.clock !== "function" || typeof input.audit !== "function") {
    throw new Error("panel_session_handoff_redeemer_invalid");
  }
  bounded(input.timeouts.poolCheckoutMs);
  bounded(input.timeouts.statementMs);
  bounded(input.timeouts.lockMs);
  bounded(input.timeouts.idleTransactionMs);
  return input;
}

function now(input: RedeemerDependencies): Date {
  const value = input.clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("invalid");
  return new Date(value);
}

async function acquire(input: RedeemerDependencies): Promise<PostgresClient> {
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
  input: RedeemerDependencies,
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

function auditSafely(input: RedeemerDependencies, event: PanelSessionHandoffRedeemerAuditEvent): void {
  try {
    const pending = input.audit(Object.freeze({ ...event }));
    if (pending) void Promise.resolve(pending).catch(() => undefined);
  } catch {
    // Observability is never credential or session authority.
  }
}

export function createPostgresPanelSessionHandoffRedeemer(
  approval: unknown,
  rawDependencies: RedeemerDependencies,
): PostgresPanelSessionHandoffRedeemer {
  assertPanelSessionHandoffApproval(approval);
  const dependencies = validate(rawDependencies);
  const verifier = createPanelSessionHandoffCredentialVerifier({ keys: dependencies.handoffKeys });

  const finish = (operation: PanelSessionHandoffRedeemerAuditEvent["operation"], result: PanelSessionHandoffRedemptionResult) => {
    auditSafely(dependencies, { operation, result: result.kind });
    return Object.freeze({ ...result }) as PanelSessionHandoffRedemptionResult;
  };

  async function prepare(
    operation: PanelSessionHandoffRedeemerAuditEvent["operation"],
    credential: string,
  ): Promise<
    | { ready: true; handoffProof: { tokenKeyId: string; tokenDigest: string }; session: { credential: string; tokenKeyId: string; tokenDigest: string }; now: Date }
    | { ready: false; result: PanelSessionHandoffRedemptionResult }
  > {
    let handoffProof;
    let at: Date;
    try { handoffProof = verifier.digestCredential(credential); at = now(dependencies); }
    catch (error) {
      return { ready: false, result: finish(operation, { kind: error instanceof PanelSessionHandoffCredentialError ? "unauthenticated" : "durable_authority_invalid" }) };
    }
    const inspected = await transaction(dependencies, "read", async (client) => oneRow(await client.query(
      "SELECT outcome, authority FROM saas.recover_panel_session_handoff_redemption($1,$2,$3,$4,$5)",
      [handoffProof.tokenKeyId, handoffProof.tokenDigest, null, null, at],
    )));
    if (inspected.status !== "ok") return { ready: false, result: finish(operation, { kind: "unavailable" }) };
    if (inspected.value.outcome !== "handoff_replayed") {
      const kind = inspected.value.outcome;
      if (["expired", "unauthenticated", "membership_denied", "operation_mismatch", "durable_authority_invalid"].includes(kind)) {
        return { ready: false, result: finish(operation, { kind: kind as Exclude<PanelSessionHandoffRedeemerKind, "session_issued" | "session_replayed" | "commit_unknown" | "unavailable"> }) };
      }
      return { ready: false, result: finish(operation, { kind: "durable_authority_invalid" }) };
    }
    try {
      const projection = exact(inspected.value.authority, ["sessionTokenKeyId"]);
      const sessionTokenKeyId = keyId(projection.sessionTokenKeyId);
      const sessionCodec = createPanelSessionCredentialCodec({
        keys: dependencies.sessionKeys,
        activeKeyId: sessionTokenKeyId,
        randomBytes: () => { throw new PanelSessionCredentialError(); },
      });
      const session = sessionCodec.deriveCredentialFromHandoff(credential, sessionTokenKeyId);
      return { ready: true, handoffProof, session, now: at };
    } catch {
      return { ready: false, result: finish(operation, { kind: "unauthenticated" }) };
    }
  }

  return Object.freeze({
    async redeemHandoff({ credential }: { credential: string }): Promise<PanelSessionHandoffRedemptionResult> {
      const prepared = await prepare("redeem", credential);
      if (!prepared.ready) return prepared.result;
      const executed = await transaction(dependencies, "write", async (client) => oneRow(await client.query(
        "SELECT outcome, authority FROM saas.redeem_panel_session_handoff($1,$2,$3,$4,$5)",
        [
          prepared.handoffProof.tokenKeyId, prepared.handoffProof.tokenDigest,
          prepared.session.tokenKeyId, prepared.session.tokenDigest, prepared.now,
        ],
      )));
      if (executed.status === "commit_unknown") return finish("redeem", { kind: "commit_unknown", credential: prepared.session.credential });
      if (executed.status !== "ok") return finish("redeem", { kind: "unavailable" });
      if (executed.value.outcome !== "session_issued" && executed.value.outcome !== "session_replayed") {
        const kind = executed.value.outcome;
        if (["expired", "unauthenticated", "membership_denied", "operation_mismatch", "durable_authority_invalid"].includes(kind)) {
          return finish("redeem", { kind: kind as Exclude<PanelSessionHandoffRedeemerKind, "session_issued" | "session_replayed" | "commit_unknown" | "unavailable"> });
        }
        return finish("redeem", { kind: "durable_authority_invalid" });
      }
      try {
        return finish("redeem", {
          kind: executed.value.outcome,
          credential: prepared.session.credential,
          session: sessionAuthority(executed.value.authority),
        });
      } catch {
        return finish("redeem", { kind: "durable_authority_invalid" });
      }
    },

    async recoverRedemption({ credential }: { credential: string }): Promise<PanelSessionHandoffRedemptionResult> {
      const prepared = await prepare("recover", credential);
      if (!prepared.ready) return prepared.result;
      const executed = await transaction(dependencies, "read", async (client) => oneRow(await client.query(
        "SELECT outcome, authority FROM saas.recover_panel_session_handoff_redemption($1,$2,$3,$4,$5)",
        [
          prepared.handoffProof.tokenKeyId, prepared.handoffProof.tokenDigest,
          prepared.session.tokenKeyId, prepared.session.tokenDigest, prepared.now,
        ],
      )));
      if (executed.status !== "ok") return finish("recover", { kind: "unavailable" });
      if (executed.value.outcome !== "session_replayed") {
        const kind = executed.value.outcome;
        if (["expired", "unauthenticated", "membership_denied", "operation_mismatch", "durable_authority_invalid"].includes(kind)) {
          return finish("recover", { kind: kind as Exclude<PanelSessionHandoffRedeemerKind, "session_issued" | "session_replayed" | "commit_unknown" | "unavailable"> });
        }
        return finish("recover", { kind: "durable_authority_invalid" });
      }
      try {
        return finish("recover", {
          kind: "session_replayed",
          credential: prepared.session.credential,
          session: sessionAuthority(executed.value.authority),
        });
      } catch {
        return finish("recover", { kind: "durable_authority_invalid" });
      }
    },
  });
}
