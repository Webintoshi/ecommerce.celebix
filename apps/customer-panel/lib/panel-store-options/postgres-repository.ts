import "server-only";

import { parseCanonicalAdminHostname } from "@celebix/saas-data";

import { assertPanelSessionPersistenceApproval } from "../panel-session-persistence/activation.ts";
import {
  PanelSessionCredentialError,
  createPanelSessionCredentialCodec,
} from "../panel-session-persistence/credential-codec.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAXIMUM_TIMEOUT_MS = 60_000;
const MAXIMUM_CLOCK_SKEW_MS = 30_000;

type QueryResult = { rows: Record<string, unknown>[]; rowCount: number | null };
type Client = { query(text: string, values?: readonly unknown[]): Promise<QueryResult>; release(destroy?: boolean | Error): void };
type Pool = { connect(): Promise<Client> };

export type PanelStoreOption = Readonly<{
  storeId: string;
  storeSlug: string;
  displayName: string;
  canonicalAdminOrigin: string;
}>;

export type PanelStoreOptionsResult = Readonly<
  | { kind: "resolved"; activeStoreId: string; stores: readonly PanelStoreOption[] }
  | { kind: "unauthenticated" | "durable_authority_invalid" | "unavailable" }
>;

export interface PostgresPanelStoreOptionRepository {
  listForCredential(input: Readonly<{ credential: string; now: Date }>): Promise<PanelStoreOptionsResult>;
}

type Dependencies = Readonly<{
  pool: Pool;
  keys: ReadonlyMap<string, Uint8Array>;
  activeKeyId: string;
  clock(): Date;
  timeouts: Readonly<{ poolCheckoutMs: number; statementMs: number; lockMs: number; idleTransactionMs: number }>;
}>;

function failure(kind: "unauthenticated" | "durable_authority_invalid" | "unavailable"): PanelStoreOptionsResult {
  return Object.freeze({ kind });
}

function safeTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAXIMUM_TIMEOUT_MS) throw new Error("panel_store_option_repository_invalid");
  return value;
}

function validate(dependencies: Dependencies): Dependencies {
  if (!dependencies || !dependencies.pool || typeof dependencies.pool.connect !== "function" || typeof dependencies.clock !== "function") {
    throw new Error("panel_store_option_repository_invalid");
  }
  for (const value of Object.values(dependencies.timeouts)) safeTimeout(value);
  return dependencies;
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some((key) => !(key in row))) throw new Error("invalid");
  return row;
}

function text(value: unknown, maximum: number): string {
  if (
    typeof value !== "string" || value.length < 1 || value.length > maximum || value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) throw new Error("invalid");
  return value;
}

function adminOrigin(value: unknown): string {
  const candidate = text(value, 2_048);
  let url: URL;
  try { url = new URL(candidate); } catch { throw new Error("invalid"); }
  if (
    url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" ||
    url.search || url.hash || url.origin !== candidate
  ) throw new Error("invalid");
  try { parseCanonicalAdminHostname(url.hostname, "production"); }
  catch {
    try { parseCanonicalAdminHostname(url.hostname, "staging"); }
    catch { throw new Error("invalid"); }
  }
  return candidate;
}

function project(value: unknown): PanelStoreOptionsResult {
  const authority = exact(value, ["activeStoreId", "stores"]);
  if (typeof authority.activeStoreId !== "string" || !UUID.test(authority.activeStoreId)) throw new Error("invalid");
  if (!Array.isArray(authority.stores) || authority.stores.length < 1 || authority.stores.length > 100) throw new Error("invalid");
  const seenIds = new Set<string>();
  const seenOrigins = new Set<string>();
  const stores = authority.stores.map((candidate) => {
    const row = exact(candidate, ["storeId", "storeSlug", "displayName", "canonicalAdminOrigin"]);
    if (typeof row.storeId !== "string" || !UUID.test(row.storeId) || seenIds.has(row.storeId)) throw new Error("invalid");
    const storeSlug = text(row.storeSlug, 63);
    if (!SLUG.test(storeSlug)) throw new Error("invalid");
    const canonicalAdminOrigin = adminOrigin(row.canonicalAdminOrigin);
    if (seenOrigins.has(canonicalAdminOrigin)) throw new Error("invalid");
    seenIds.add(row.storeId);
    seenOrigins.add(canonicalAdminOrigin);
    return Object.freeze({
      storeId: row.storeId,
      storeSlug,
      displayName: text(row.displayName, 200),
      canonicalAdminOrigin,
    });
  });
  if (!seenIds.has(authority.activeStoreId)) throw new Error("invalid");
  return Object.freeze({ kind: "resolved" as const, activeStoreId: authority.activeStoreId, stores: Object.freeze(stores) });
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

export function createPostgresPanelStoreOptionRepository(
  approval: unknown,
  rawDependencies: Dependencies,
): PostgresPanelStoreOptionRepository {
  assertPanelSessionPersistenceApproval(approval);
  const dependencies = validate(rawDependencies);
  const codec = createPanelSessionCredentialCodec({
    keys: dependencies.keys,
    activeKeyId: dependencies.activeKeyId,
    randomBytes() { throw new Error("issuance_not_available"); },
  });

  return Object.freeze({
    async listForCredential(input: Readonly<{ credential: string; now: Date }>): Promise<PanelStoreOptionsResult> {
      let proof: Readonly<{ tokenKeyId: string; tokenDigest: string }>;
      let now: Date;
      try {
        proof = codec.digestCredential(input.credential);
        if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) throw new Error("invalid");
        const trusted = dependencies.clock();
        if (!(trusted instanceof Date) || !Number.isFinite(trusted.getTime()) || Math.abs(trusted.getTime() - input.now.getTime()) > MAXIMUM_CLOCK_SKEW_MS) {
          throw new Error("invalid");
        }
        now = new Date(input.now);
      } catch (error) {
        return failure(error instanceof PanelSessionCredentialError ? "unauthenticated" : "durable_authority_invalid");
      }

      let client: Client;
      try { client = await acquire(dependencies); } catch { return failure("unavailable"); }
      let began = false;
      try {
        await client.query("BEGIN READ ONLY");
        began = true;
        await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [`${dependencies.timeouts.statementMs}ms`]);
        await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [`${dependencies.timeouts.lockMs}ms`]);
        await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [`${dependencies.timeouts.idleTransactionMs}ms`]);
        await client.query("SET LOCAL ROLE celebix_saas_identity");
        const result = await client.query(
          "SELECT outcome, authority FROM saas.list_panel_session_store_options($1,$2,$3)",
          [proof.tokenKeyId, proof.tokenDigest, now],
        );
        if (result.rowCount !== 1 || result.rows.length !== 1) throw new Error("invalid");
        const row = exact(result.rows[0], ["outcome", "authority"]);
        await client.query("COMMIT");
        began = false;
        client.release();
        if (row.outcome === "resolved") {
          try { return project(row.authority); } catch { return failure("durable_authority_invalid"); }
        }
        if (row.outcome === "unauthenticated") return failure("unauthenticated");
        if (row.outcome === "durable_authority_invalid") return failure("durable_authority_invalid");
        return failure("durable_authority_invalid");
      } catch {
        if (began) try { await client.query("ROLLBACK"); } catch { /* destroy below */ }
        try { client.release(true); } catch { /* best effort */ }
        return failure("unavailable");
      }
    },
  });
}
