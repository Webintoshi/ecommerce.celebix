import { createHmac } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAXIMUM_TIMEOUT_MS = 60_000;
const SESSION_LIFETIME_MS = 8 * 60 * 60_000;

interface QueryResult { rows: Record<string, unknown>[]; rowCount: number | null }
interface Client { query(text: string, values?: readonly unknown[]): Promise<QueryResult>; release(destroy?: boolean | Error): void }
interface Pool { connect(): Promise<Client> }

type SafeKind = "membership_denied" | "durable_authority_invalid" | "operation_mismatch" | "unavailable";
export type ReturningPanelSessionIssuerResult = Readonly<
  | { kind: "session_issued"; credential: string; activeStoreId: string; issuedAt: string; expiresAt: string }
  | { kind: SafeKind }
>;

function invalid(): never { throw new Error("returning_panel_session_issuer_invalid"); }

function keyId(value: unknown): string {
  if (typeof value !== "string" || !KEY_ID.test(value) || value.startsWith(".") || value.endsWith(".") || value.includes("..")) invalid();
  return value;
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return value;
}

function bounded(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > MAXIMUM_TIMEOUT_MS) invalid();
  return Number(value);
}

function exactIdentity(value: unknown): { issuer: string; subject: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).join(",") !== "issuer,subject" || typeof row.issuer !== "string" || typeof row.subject !== "string") invalid();
  if (!row.subject || row.subject.length > 512 || row.subject.trim() !== row.subject || /[\u0000-\u001f\u007f]/.test(row.subject)) invalid();
  let issuer: URL;
  try { issuer = new URL(row.issuer); } catch { return invalid(); }
  if (issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.search || issuer.hash || issuer.toString().replace(/\/$/, "") !== row.issuer) invalid();
  return { issuer: row.issuer, subject: row.subject };
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || value.length > 32 || value.trim() !== value) invalid();
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) invalid();
  return value;
}

function resultRow(result: QueryResult): { outcome: string; authority: unknown } {
  if (result.rowCount !== 1 || result.rows.length !== 1) invalid();
  const row = result.rows[0]!;
  if (Object.keys(row).length !== 2 || !("outcome" in row) || !("authority" in row) || typeof row.outcome !== "string") invalid();
  return { outcome: row.outcome, authority: row.authority };
}

function projected(kind: string, authority: unknown, credential: string): ReturningPanelSessionIssuerResult {
  if (kind === "issued" || kind === "operation_replayed") {
    if (!authority || typeof authority !== "object" || Array.isArray(authority)) return Object.freeze({ kind: "durable_authority_invalid" });
    const session = (authority as Record<string, unknown>).session;
    if (!session || typeof session !== "object" || Array.isArray(session)) return Object.freeze({ kind: "durable_authority_invalid" });
    const issuedAt = timestamp((session as Record<string, unknown>).issuedAt);
    const expiresAt = timestamp((session as Record<string, unknown>).expiresAt);
    const activeStoreId = uuid((session as Record<string, unknown>).activeStoreId);
    return Object.freeze({ kind: "session_issued", credential, activeStoreId, issuedAt, expiresAt });
  }
  if (["membership_denied", "durable_authority_invalid", "operation_mismatch", "unavailable"].includes(kind)) {
    return Object.freeze({ kind: kind as SafeKind });
  }
  return Object.freeze({ kind: "durable_authority_invalid" });
}

export function createPostgresReturningPanelSessionIssuer(options: {
  pool: Pool;
  activeSessionKeyId: string;
  sessionKeys: ReadonlyMap<string, Uint8Array>;
  randomBytes(size: number): Uint8Array;
  randomUuid(): string;
  clock(): Date;
  timeouts: { poolCheckoutMs: number; statementMs: number; lockMs: number; idleTransactionMs: number };
  audit(event: Readonly<{ result: ReturningPanelSessionIssuerResult["kind"] }>): void | Promise<void>;
}) {
  if (!options?.pool || typeof options.pool.connect !== "function" || !(options.sessionKeys instanceof Map) || options.sessionKeys.size < 1 || options.sessionKeys.size > 16 ||
      typeof options.randomBytes !== "function" || typeof options.randomUuid !== "function" || typeof options.clock !== "function" || typeof options.audit !== "function") invalid();
  const activeKeyId = keyId(options.activeSessionKeyId);
  const keys = new Map<string, Uint8Array>();
  for (const [id, secret] of options.sessionKeys) {
    const canonical = keyId(id);
    if (!(secret instanceof Uint8Array) || secret.byteLength < 32 || secret.byteLength > 64) invalid();
    keys.set(canonical, new Uint8Array(secret));
  }
  const activeSecret = keys.get(activeKeyId);
  if (!activeSecret) invalid();
  const sessionSecret = new Uint8Array(activeSecret);
  const timeouts = Object.freeze({
    poolCheckoutMs: bounded(options.timeouts.poolCheckoutMs),
    statementMs: bounded(options.timeouts.statementMs),
    lockMs: bounded(options.timeouts.lockMs),
    idleTransactionMs: bounded(options.timeouts.idleTransactionMs),
  });

  async function checkout(): Promise<Client> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const pending = Promise.resolve().then(() => options.pool.connect());
    try {
      return await Promise.race([pending, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { timedOut = true; reject(new Error("timeout")); }, timeouts.poolCheckoutMs);
      })]);
    } catch {
      if (timedOut) void pending.then((client) => client.release(true)).catch(() => undefined);
      throw new Error("unavailable");
    } finally { if (timer) clearTimeout(timer); }
  }

  async function transaction(mode: "write" | "read", query: (client: Client) => Promise<{ outcome: string; authority: unknown }>) {
    let client: Client;
    try { client = await checkout(); } catch { return { status: "unavailable" as const }; }
    let began = false;
    let commitForwarded = false;
    try {
      await client.query(mode === "read" ? "BEGIN READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED");
      began = true;
      await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [`${timeouts.statementMs}ms`]);
      await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [`${timeouts.lockMs}ms`]);
      await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [`${timeouts.idleTransactionMs}ms`]);
      await client.query("SET LOCAL ROLE celebix_saas_identity");
      const value = await query(client);
      commitForwarded = true;
      await client.query("COMMIT");
      client.release();
      return { status: "ok" as const, value };
    } catch {
      if (commitForwarded) {
        try { client.release(true); } catch { /* best effort */ }
        return { status: mode === "write" ? "commit_unknown" as const : "unavailable" as const };
      }
      if (began) try { await client.query("ROLLBACK"); } catch { /* destroy below */ }
      try { client.release(true); } catch { /* best effort */ }
      return { status: "unavailable" as const };
    }
  }

  function candidate() {
    const bytes = options.randomBytes(32);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 32) invalid();
    const token = Buffer.from(new Uint8Array(bytes)).toString("base64url");
    if (!TOKEN.test(token)) invalid();
    const credential = `v1.${activeKeyId}.${token}`;
    const digest = createHmac("sha256", sessionSecret).update(`celebix-panel-session-v1\n${credential}`, "utf8").digest("hex");
    if (!DIGEST.test(digest)) invalid();
    return { credential, digest };
  }

  return Object.freeze({
    async issue(identityInput: { issuer: string; subject: string }, destinationHostnameInput: string): Promise<ReturningPanelSessionIssuerResult> {
      let identity: { issuer: string; subject: string };
      let credential: string;
      let digest: string;
      let ids: string[];
      let now: Date;
      let destinationHostname: string;
      try {
        identity = exactIdentity(identityInput);
        destinationHostname = destinationHostnameInput;
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.admin(?:\.saas-staging)?\.celebix\.site$/.test(destinationHostname)) invalid();
        ({ credential, digest } = candidate());
        ids = [uuid(options.randomUuid()), uuid(options.randomUuid()), uuid(options.randomUuid())];
        now = options.clock();
        if (!(now instanceof Date) || !Number.isFinite(now.getTime())) invalid();
      } catch { return Object.freeze({ kind: "durable_authority_invalid" }); }
      const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
      const values = [identity.issuer, identity.subject, destinationHostname, ids[0], ids[1], ids[2], activeKeyId, digest, now, expiresAt] as const;
      const written = await transaction("write", async (client) => resultRow(await client.query(
        "SELECT outcome, authority FROM saas.issue_returning_panel_session_for_admin_host($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", values,
      )));
      let result: ReturningPanelSessionIssuerResult;
      if (written.status === "commit_unknown") {
        const recovered = await transaction("read", async (client) => resultRow(await client.query(
          "SELECT outcome, authority FROM saas.recover_returning_panel_session_for_admin_host($1,$2,$3,$4,$5,$6)",
          [identity.issuer, identity.subject, destinationHostname, ids[2], activeKeyId, digest],
        )));
        result = recovered.status === "ok" ? projected(recovered.value.outcome, recovered.value.authority, credential) : Object.freeze({ kind: "unavailable" });
      } else {
        result = written.status === "ok" ? projected(written.value.outcome, written.value.authority, credential) : Object.freeze({ kind: "unavailable" });
      }
      try { void Promise.resolve(options.audit(Object.freeze({ result: result.kind }))).catch(() => undefined); } catch { /* observation only */ }
      return result;
    },
  });
}
