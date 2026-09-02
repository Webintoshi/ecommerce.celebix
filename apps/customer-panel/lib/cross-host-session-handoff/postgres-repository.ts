import { assertPanelSessionPersistenceApproval } from "../panel-session-persistence/activation.ts";
import {
  PanelSessionCredentialError,
  createPanelSessionCredentialCodec,
} from "../panel-session-persistence/credential-codec.ts";
import type { PersistedPanelSession } from "../panel-session-persistence/postgres-panel-session-repository.ts";
import { normalizeAdminRequestHostname, parseExactAdminHttpsOrigin } from "@celebix/saas-data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAXIMUM_TIMEOUT_MS = 60_000;
const MAXIMUM_CLOCK_SKEW_MS = 30_000;
const HANDOFF_MS = 2 * 60_000;
const SESSION_MS = 8 * 60 * 60_000;

type QueryResult = { rows: Record<string, unknown>[]; rowCount: number | null };
type Client = { query(text: string, values?: readonly unknown[]): Promise<QueryResult>; release(destroy?: boolean | Error): void };
type Pool = { connect(): Promise<Client> };

export type CrossHostHandoffSafeKind =
  | "handoff_issued" | "redeemed" | "operation_replayed" | "handoff_replayed" | "expired"
  | "unauthenticated" | "membership_denied" | "operation_mismatch" | "commit_unknown"
  | "unavailable" | "durable_authority_invalid";

export type CrossHostHandoffAuditEvent = Readonly<{
  operation: "issue" | "recover_issue" | "redeem" | "recover_redemption";
  result: CrossHostHandoffSafeKind;
}>;

type Dependencies = Readonly<{
  pool: Pool;
  handoffKeys: ReadonlyMap<string, Uint8Array>;
  activeHandoffKeyId: string;
  sessionKeys: ReadonlyMap<string, Uint8Array>;
  activeSessionKeyId: string;
  clock(): Date;
  randomBytes(size: number): Uint8Array;
  timeouts: Readonly<{ poolCheckoutMs: number; statementMs: number; lockMs: number; idleTransactionMs: number }>;
  audit(event: CrossHostHandoffAuditEvent): void | Promise<void>;
}>;

type IssueResult = Readonly<
  | { kind: "handoff_issued" | "operation_replayed"; credential: string; destinationOrigin: string; expiresAt: string }
  | { kind: "commit_unknown"; credential: string }
  | { kind: Exclude<CrossHostHandoffSafeKind, "handoff_issued" | "redeemed" | "operation_replayed" | "commit_unknown"> }
>;

export type RedemptionRecovery = Readonly<{
  operationId: string;
  sessionId: string;
  familyId: string;
  issuedAt: string;
  expiresAt: string;
}>;

type RedemptionResult = Readonly<
  | { kind: "redeemed"; sessionCredential: string; session: PersistedPanelSession }
  | { kind: "commit_unknown"; sessionCredential: string; recovery: RedemptionRecovery }
  | { kind: Exclude<CrossHostHandoffSafeKind, "handoff_issued" | "redeemed" | "operation_replayed" | "commit_unknown"> }
>;

export interface PostgresCrossHostSessionHandoffRepository {
  issueHandoff(input: Readonly<{
    currentCredential: string;
    operationId: string;
    destinationStoreId: string;
    destinationHostname: string;
    now: Date;
  }>): Promise<IssueResult>;
  recoverIssuedHandoff(input: Readonly<{
    operationId: string;
    credential: string;
    destinationHostname: string;
    now: Date;
  }>): Promise<IssueResult>;
  redeemHandoff(input: Readonly<{
    credential: string;
    destinationHostname: string;
    now: Date;
  }>): Promise<RedemptionResult>;
  recoverRedemption(input: Readonly<{
    credential: string;
    destinationHostname: string;
    sessionCredential: string;
    recovery: RedemptionRecovery;
  }>): Promise<RedemptionResult>;
}

function safeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAXIMUM_TIMEOUT_MS) throw new Error("cross_host_handoff_repository_invalid");
  return value;
}

function validate(input: Dependencies): Dependencies {
  if (!input || !input.pool || typeof input.pool.connect !== "function" || typeof input.clock !== "function" || typeof input.randomBytes !== "function" || typeof input.audit !== "function") {
    throw new Error("cross_host_handoff_repository_invalid");
  }
  safeInteger(input.timeouts.poolCheckoutMs);
  safeInteger(input.timeouts.statementMs);
  safeInteger(input.timeouts.lockMs);
  safeInteger(input.timeouts.idleTransactionMs);
  return input;
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error("invalid");
  return value;
}

function canonicalHostname(value: unknown): string {
  try {
    const hostname = normalizeAdminRequestHostname(value);
    if (value !== hostname) throw new Error("invalid");
    parseExactAdminHttpsOrigin(`https://${hostname}`);
    return hostname;
  } catch { throw new Error("invalid"); }
}

function canonicalNow(value: unknown, clock: () => Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("invalid");
  const trusted = clock();
  if (!(trusted instanceof Date) || !Number.isFinite(trusted.getTime()) || Math.abs(value.getTime() - trusted.getTime()) > MAXIMUM_CLOCK_SKEW_MS) throw new Error("invalid");
  return new Date(value);
}

function timestamp(value: unknown): string {
  const normalized = value instanceof Date ? value.toISOString() : value;
  if (typeof normalized !== "string" || normalized.length > 32) throw new Error("invalid");
  const milliseconds = Date.parse(normalized);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== normalized) throw new Error("invalid");
  return normalized;
}

function exact(value: unknown, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
  const row = value as Record<string, unknown>;
  const allowed = new Set([...keys, ...optional]);
  if (keys.some((key) => !(key in row)) || Object.keys(row).some((key) => !allowed.has(key))) throw new Error("invalid");
  return row;
}

function handoffAuthority(value: unknown, destinationHostname: string, now: Date): Readonly<{ destinationOrigin: string; expiresAt: string }> {
  const row = exact(value, ["destinationOrigin", "expiresAt"]);
  const expiresAt = timestamp(row.expiresAt);
  if (row.destinationOrigin !== `https://${destinationHostname}` || Date.parse(expiresAt) <= now.getTime() || Date.parse(expiresAt) > now.getTime() + HANDOFF_MS) {
    throw new Error("invalid");
  }
  return Object.freeze({ destinationOrigin: row.destinationOrigin, expiresAt }) as Readonly<{ destinationOrigin: string; expiresAt: string }>;
}

function sessionAuthority(value: unknown): PersistedPanelSession {
  const root = exact(value, ["session"]);
  const row = exact(root.session, ["sessionId", "familyId", "principalId", "activeStoreId", "version", "issuedAt", "rotatedAt", "expiresAt"]);
  const issuedAt = timestamp(row.issuedAt);
  const rotatedAt = timestamp(row.rotatedAt);
  const expiresAt = timestamp(row.expiresAt);
  if (
    typeof row.version !== "number" || !Number.isSafeInteger(row.version) || row.version < 1
    || Date.parse(issuedAt) > Date.parse(rotatedAt) || Date.parse(rotatedAt) >= Date.parse(expiresAt)
    || Date.parse(expiresAt) > Date.parse(issuedAt) + SESSION_MS
  ) throw new Error("invalid");
  return Object.freeze({
    sessionId: uuid(row.sessionId),
    familyId: uuid(row.familyId),
    principalId: uuid(row.principalId),
    activeStoreId: uuid(row.activeStoreId),
    version: row.version,
    issuedAt,
    rotatedAt,
    expiresAt,
  });
}

function createUuid(randomBytes: (size: number) => Uint8Array): string {
  const produced = randomBytes(16);
  if (!(produced instanceof Uint8Array) || produced.byteLength !== 16) throw new Error("invalid");
  const bytes = new Uint8Array(produced);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function acquire(dependencies: Dependencies): Promise<Client> {
  const pending = Promise.resolve().then(() => dependencies.pool.connect());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { timedOut = true; reject(new Error("timeout")); }, dependencies.timeouts.poolCheckoutMs);
  });
  try { return await Promise.race([pending, deadline]); }
  catch {
    if (timedOut) void pending.then((client) => client.release(true)).catch(() => undefined);
    throw new Error("unavailable");
  } finally { if (timer) clearTimeout(timer); }
}

type TransactionResult = Readonly<
  | { status: "ok"; row: Record<string, unknown> }
  | { status: "commit_unknown" | "unavailable" }
>;

async function transaction(dependencies: Dependencies, mode: "read" | "write", query: string, values: readonly unknown[]): Promise<TransactionResult> {
  let client: Client;
  try { client = await acquire(dependencies); } catch { return { status: "unavailable" }; }
  let began = false;
  let commitForwarded = false;
  try {
    await client.query(mode === "read" ? "BEGIN READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED");
    began = true;
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [`${dependencies.timeouts.statementMs}ms`]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [`${dependencies.timeouts.lockMs}ms`]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [`${dependencies.timeouts.idleTransactionMs}ms`]);
    await client.query("SET LOCAL ROLE celebix_saas_identity");
    const result = await client.query(query, values);
    if (result.rows.length !== 1 || result.rowCount !== 1) throw new Error("invalid");
    const row = exact(result.rows[0], ["outcome", "authority"]);
    commitForwarded = true;
    await client.query("COMMIT");
    client.release();
    return { status: "ok", row };
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

function safeOutcome(value: unknown): CrossHostHandoffSafeKind {
  if (typeof value !== "string" || ![
    "handoff_issued", "redeemed", "operation_replayed", "handoff_replayed", "expired",
    "unauthenticated", "membership_denied", "operation_mismatch", "unavailable", "durable_authority_invalid",
  ].includes(value)) throw new Error("invalid");
  return value as CrossHostHandoffSafeKind;
}

function safeFailure(kind: CrossHostHandoffSafeKind): { kind: CrossHostHandoffSafeKind } {
  return Object.freeze({ kind });
}

function audit<T extends { kind: CrossHostHandoffSafeKind }>(dependencies: Dependencies, operation: CrossHostHandoffAuditEvent["operation"], result: T): T {
  try {
    const pending = dependencies.audit(Object.freeze({ operation, result: result.kind }));
    if (pending) void pending.catch(() => undefined);
  } catch { /* audit is not handoff authority */ }
  return Object.freeze(result);
}

export function createPostgresCrossHostSessionHandoffRepository(
  approval: unknown,
  rawDependencies: Dependencies,
): PostgresCrossHostSessionHandoffRepository {
  assertPanelSessionPersistenceApproval(approval);
  const dependencies = validate(rawDependencies);
  const handoffCodec = createPanelSessionCredentialCodec({
    keys: dependencies.handoffKeys,
    activeKeyId: dependencies.activeHandoffKeyId,
    randomBytes: dependencies.randomBytes,
  });
  const sessionCodec = createPanelSessionCredentialCodec({
    keys: dependencies.sessionKeys,
    activeKeyId: dependencies.activeSessionKeyId,
    randomBytes: dependencies.randomBytes,
  });

  const repository: PostgresCrossHostSessionHandoffRepository = {
    async issueHandoff(input) {
      let sourceProof;
      let operationId: string;
      let destinationStoreId: string;
      let destinationHostname: string;
      let issuedAt: Date;
      try {
        sourceProof = sessionCodec.digestCredential(input.currentCredential);
        operationId = uuid(input.operationId);
        destinationStoreId = uuid(input.destinationStoreId);
        destinationHostname = canonicalHostname(input.destinationHostname);
        issuedAt = canonicalNow(input.now, dependencies.clock);
      } catch (error) {
        return audit(dependencies, "issue", safeFailure(error instanceof PanelSessionCredentialError ? "unauthenticated" : "durable_authority_invalid")) as IssueResult;
      }
      let handoff;
      let handoffId: string;
      try { handoff = handoffCodec.issueCredential(); handoffId = createUuid(dependencies.randomBytes); }
      catch { return audit(dependencies, "issue", safeFailure("unavailable")) as IssueResult; }
      const expiresAt = new Date(issuedAt.getTime() + HANDOFF_MS);
      const executed = await transaction(
        dependencies,
        "write",
        "SELECT outcome, authority FROM saas.issue_cross_host_panel_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [sourceProof.tokenKeyId, sourceProof.tokenDigest, handoffId, operationId, handoff.tokenKeyId, handoff.tokenDigest, destinationStoreId, destinationHostname, issuedAt, expiresAt],
      );
      if (executed.status === "commit_unknown") return audit(dependencies, "issue", { kind: "commit_unknown", credential: handoff.credential });
      if (executed.status !== "ok") return audit(dependencies, "issue", safeFailure("unavailable")) as IssueResult;
      let kind: CrossHostHandoffSafeKind;
      try { kind = safeOutcome(executed.row.outcome); } catch { return audit(dependencies, "issue", safeFailure("durable_authority_invalid")) as IssueResult; }
      if (kind === "handoff_issued" || kind === "operation_replayed") {
        try {
          const authority = handoffAuthority(executed.row.authority, destinationHostname, issuedAt);
          return audit(dependencies, "issue", { kind, credential: handoff.credential, ...authority });
        } catch { return audit(dependencies, "issue", safeFailure("durable_authority_invalid")) as IssueResult; }
      }
      return audit(dependencies, "issue", safeFailure(kind)) as IssueResult;
    },

    async recoverIssuedHandoff(input) {
      let operationId: string;
      let proof;
      let destinationHostname: string;
      let recoveredAt: Date;
      try {
        operationId = uuid(input.operationId);
        proof = handoffCodec.digestCredential(input.credential);
        destinationHostname = canonicalHostname(input.destinationHostname);
        recoveredAt = canonicalNow(input.now, dependencies.clock);
      } catch (error) {
        return audit(dependencies, "recover_issue", safeFailure(error instanceof PanelSessionCredentialError ? "unauthenticated" : "durable_authority_invalid")) as IssueResult;
      }
      const executed = await transaction(
        dependencies,
        "read",
        "SELECT outcome, authority FROM saas.recover_cross_host_panel_handoff($1,$2,$3,$4,$5)",
        [operationId, proof.tokenKeyId, proof.tokenDigest, destinationHostname, recoveredAt],
      );
      if (executed.status !== "ok") return audit(dependencies, "recover_issue", safeFailure("unavailable")) as IssueResult;
      try {
        const kind = safeOutcome(executed.row.outcome);
        if (kind !== "operation_replayed") return audit(dependencies, "recover_issue", safeFailure(kind)) as IssueResult;
        const authority = handoffAuthority(executed.row.authority, destinationHostname, recoveredAt);
        return audit(dependencies, "recover_issue", { kind, credential: input.credential, ...authority });
      } catch { return audit(dependencies, "recover_issue", safeFailure("durable_authority_invalid")) as IssueResult; }
    },

    async redeemHandoff(input) {
      let proof;
      let destinationHostname: string;
      let redeemedAt: Date;
      try {
        proof = handoffCodec.digestCredential(input.credential);
        destinationHostname = canonicalHostname(input.destinationHostname);
        redeemedAt = canonicalNow(input.now, dependencies.clock);
      } catch (error) {
        return audit(dependencies, "redeem", safeFailure(error instanceof PanelSessionCredentialError ? "unauthenticated" : "durable_authority_invalid")) as RedemptionResult;
      }
      let session;
      let recovery: RedemptionRecovery;
      try {
        session = sessionCodec.issueCredential();
        recovery = Object.freeze({
          operationId: createUuid(dependencies.randomBytes),
          sessionId: createUuid(dependencies.randomBytes),
          familyId: createUuid(dependencies.randomBytes),
          issuedAt: redeemedAt.toISOString(),
          expiresAt: new Date(redeemedAt.getTime() + SESSION_MS).toISOString(),
        });
      } catch { return audit(dependencies, "redeem", safeFailure("unavailable")) as RedemptionResult; }
      const executed = await redeemTransaction(dependencies, proof, destinationHostname, session, recovery);
      if (executed.status === "commit_unknown") return audit(dependencies, "redeem", { kind: "commit_unknown", sessionCredential: session.credential, recovery });
      if (executed.status !== "ok") return audit(dependencies, "redeem", safeFailure("unavailable")) as RedemptionResult;
      return projectRedemption(dependencies, "redeem", executed.row, session.credential);
    },

    async recoverRedemption(input) {
      let proof;
      let destinationHostname: string;
      let sessionProof;
      let recovery: RedemptionRecovery;
      try {
        proof = handoffCodec.digestCredential(input.credential);
        destinationHostname = canonicalHostname(input.destinationHostname);
        sessionProof = sessionCodec.digestCredential(input.sessionCredential);
        recovery = Object.freeze({
          operationId: uuid(input.recovery.operationId),
          sessionId: uuid(input.recovery.sessionId),
          familyId: uuid(input.recovery.familyId),
          issuedAt: timestamp(input.recovery.issuedAt),
          expiresAt: timestamp(input.recovery.expiresAt),
        });
        if (Date.parse(recovery.expiresAt) !== Date.parse(recovery.issuedAt) + SESSION_MS) throw new Error("invalid");
      } catch (error) {
        return audit(dependencies, "recover_redemption", safeFailure(error instanceof PanelSessionCredentialError ? "unauthenticated" : "durable_authority_invalid")) as RedemptionResult;
      }
      const executed = await redeemTransaction(dependencies, proof, destinationHostname, sessionProof, recovery);
      if (executed.status !== "ok") return audit(dependencies, "recover_redemption", safeFailure("unavailable")) as RedemptionResult;
      return projectRedemption(dependencies, "recover_redemption", executed.row, input.sessionCredential);
    },
  };
  return Object.freeze(repository);
}

async function redeemTransaction(
  dependencies: Dependencies,
  handoffProof: Readonly<{ tokenKeyId: string; tokenDigest: string }>,
  destinationHostname: string,
  sessionProof: Readonly<{ tokenKeyId: string; tokenDigest: string }>,
  recovery: RedemptionRecovery,
): Promise<TransactionResult> {
  return transaction(
    dependencies,
    "write",
    "SELECT outcome, authority FROM saas.redeem_cross_host_panel_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      handoffProof.tokenKeyId, handoffProof.tokenDigest, destinationHostname,
      recovery.operationId, recovery.sessionId, recovery.familyId,
      sessionProof.tokenKeyId, sessionProof.tokenDigest,
      new Date(recovery.issuedAt), new Date(recovery.expiresAt),
    ],
  );
}

function projectRedemption(
  dependencies: Dependencies,
  operation: "redeem" | "recover_redemption",
  row: Record<string, unknown>,
  sessionCredential: string,
): RedemptionResult {
  try {
    const kind = safeOutcome(row.outcome);
    if (kind !== "redeemed") return audit(dependencies, operation, safeFailure(kind)) as RedemptionResult;
    return audit(dependencies, operation, { kind, sessionCredential, session: sessionAuthority(row.authority) });
  } catch { return audit(dependencies, operation, safeFailure("durable_authority_invalid")) as RedemptionResult; }
}
