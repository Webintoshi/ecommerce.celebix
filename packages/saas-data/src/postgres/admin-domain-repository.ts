import type { PublicAdminBrand } from "@celebix/saas-contracts";

import { createCanonicalAdminOrigin } from "../panel-origin.ts";

const HOSTNAME = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ACCENT = /^#[0-9a-fA-F]{6}$/;
const MAXIMUM_TIMEOUT_MS = 60_000;
const MAXIMUM_CLOCK_SKEW_MS = 30_000;

type QueryResult = Readonly<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
type Client = Readonly<{
  query(text: string, values?: readonly unknown[]): Promise<QueryResult>;
  release(destroy?: boolean | Error): void;
}>;
type Pool = Readonly<{ connect(): Promise<Client> }>;

export type PublicAdminBrandResolution = Readonly<
  | { kind: "resolved"; brand: PublicAdminBrand }
  | { kind: "admin_host_unknown" | "durable_authority_invalid" | "unavailable" }
>;

export type AdminDomainAuditEvent = Readonly<{
  operation: "resolve_public_brand";
  result: PublicAdminBrandResolution["kind"];
}>;

export type PostgresAdminDomainRepositoryOptions = Readonly<{
  pool: Pool;
  clock(): Date;
  timeouts: Readonly<{
    poolCheckoutMs: number;
    statementMs: number;
    lockMs: number;
    idleTransactionMs: number;
  }>;
  audit(event: AdminDomainAuditEvent): void | Promise<void>;
}>;

function safeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAXIMUM_TIMEOUT_MS) throw new Error("admin_domain_repository_invalid");
  return value;
}

function validate(options: PostgresAdminDomainRepositoryOptions): PostgresAdminDomainRepositoryOptions {
  if (!options || !options.pool || typeof options.pool.connect !== "function" || typeof options.clock !== "function" || typeof options.audit !== "function") {
    throw new Error("admin_domain_repository_invalid");
  }
  safeInteger(options.timeouts.poolCheckoutMs);
  safeInteger(options.timeouts.statementMs);
  safeInteger(options.timeouts.lockMs);
  safeInteger(options.timeouts.idleTransactionMs);
  return options;
}

function hostname(value: unknown): string {
  if (
    typeof value !== "string" || value.length < 3 || value.length > 253 || value !== value.trim()
    || value !== value.toLowerCase() || !HOSTNAME.test(value)
  ) throw new Error("invalid");
  return value;
}

function now(value: unknown, clock: () => Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("invalid");
  const trusted = clock();
  if (!(trusted instanceof Date) || !Number.isFinite(trusted.getTime()) || Math.abs(value.getTime() - trusted.getTime()) > MAXIMUM_CLOCK_SKEW_MS) {
    throw new Error("invalid");
  }
  return new Date(value);
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some((key) => !(key in record))) throw new Error("invalid");
  return record;
}

function nonblank(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value !== value.trim()) throw new Error("invalid");
  return value;
}

function optionalAssetUrl(value: unknown): string | null {
  if (value === null) return null;
  const exactValue = nonblank(value, 2048);
  let parsed: URL;
  try { parsed = new URL(exactValue); } catch { throw new Error("invalid"); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash || parsed.toString() !== exactValue) throw new Error("invalid");
  return exactValue;
}

function brand(value: unknown): PublicAdminBrand {
  const record = exact(value, ["storeSlug", "displayName", "logoUrl", "accentColor", "canonicalAdminOrigin"]);
  const storeSlug = nonblank(record.storeSlug, 63);
  if (storeSlug.length < 3 || !SLUG.test(storeSlug)) throw new Error("invalid");
  const canonicalAdminOrigin = nonblank(record.canonicalAdminOrigin, 2048);
  if (
    canonicalAdminOrigin !== createCanonicalAdminOrigin(storeSlug, "production")
    && canonicalAdminOrigin !== createCanonicalAdminOrigin(storeSlug, "staging")
  ) throw new Error("invalid");
  const accentColor = record.accentColor === null
    ? null
    : nonblank(record.accentColor, 7);
  if (accentColor !== null && !ACCENT.test(accentColor)) throw new Error("invalid");
  return Object.freeze({
    storeSlug,
    displayName: nonblank(record.displayName, 160),
    logoUrl: optionalAssetUrl(record.logoUrl),
    accentColor,
    canonicalAdminOrigin,
  });
}

async function acquire(options: PostgresAdminDomainRepositoryOptions): Promise<Client> {
  const pending = Promise.resolve().then(() => options.pool.connect());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { timedOut = true; reject(new Error("timeout")); }, options.timeouts.poolCheckoutMs);
  });
  try { return await Promise.race([pending, deadline]); }
  catch {
    if (timedOut) void pending.then((client) => client.release(true)).catch(() => undefined);
    throw new Error("unavailable");
  } finally { if (timer) clearTimeout(timer); }
}

function audit(options: PostgresAdminDomainRepositoryOptions, result: PublicAdminBrandResolution): PublicAdminBrandResolution {
  try {
    const pending = options.audit(Object.freeze({ operation: "resolve_public_brand" as const, result: result.kind }));
    if (pending) void pending.catch(() => undefined);
  } catch { /* audit is not hostname authority */ }
  return Object.freeze(result);
}

export class PostgresAdminDomainRepository {
  readonly #options: PostgresAdminDomainRepositoryOptions;

  constructor(options: PostgresAdminDomainRepositoryOptions) {
    this.#options = validate(options);
  }

  async resolvePublicBrand(input: Readonly<{ hostname: string; now: Date }>): Promise<PublicAdminBrandResolution> {
    let requestedHostname: string;
    let requestedAt: Date;
    try {
      requestedHostname = hostname(input?.hostname);
      requestedAt = now(input?.now, this.#options.clock);
    } catch { return audit(this.#options, { kind: "durable_authority_invalid" }); }

    let client: Client;
    try { client = await acquire(this.#options); }
    catch { return audit(this.#options, { kind: "unavailable" }); }
    let began = false;
    let commitForwarded = false;
    try {
      await client.query("BEGIN READ ONLY");
      began = true;
      await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [`${this.#options.timeouts.statementMs}ms`]);
      await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [`${this.#options.timeouts.lockMs}ms`]);
      await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [`${this.#options.timeouts.idleTransactionMs}ms`]);
      await client.query("SET LOCAL ROLE celebix_saas_host_resolver");
      const queried = await client.query(
        "SELECT outcome, authority FROM saas.resolve_public_admin_brand($1,$2)",
        [requestedHostname, requestedAt],
      );
      if (queried.rows.length !== 1 || queried.rowCount !== 1) throw new Error("invalid");
      const row = exact(queried.rows[0], ["outcome", "authority"]);
      let result: PublicAdminBrandResolution;
      if (row.outcome === "admin_host_unknown" && row.authority === null) result = { kind: "admin_host_unknown" };
      else if (row.outcome === "resolved") result = { kind: "resolved", brand: brand(row.authority) };
      else throw new Error("invalid");
      commitForwarded = true;
      await client.query("COMMIT");
      client.release();
      return audit(this.#options, result);
    } catch {
      if (commitForwarded) {
        try { client.release(true); } catch { /* best effort */ }
      } else {
        if (began) try { await client.query("ROLLBACK"); } catch { /* destroy below */ }
        try { client.release(true); } catch { /* best effort */ }
      }
      return audit(this.#options, { kind: "unavailable" });
    }
  }
}
