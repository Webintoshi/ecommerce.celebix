import type { TenantContext } from "@celebix/saas-contracts";
import { merchantAuthority } from "../orders/validation.ts";
import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import { PublicStorefrontRepositoryError } from "./errors.ts";
import type { NewsletterRepository, NewsletterSubscriber, NewsletterSubscriptionResult, PostgresNewsletterRepositoryOptions } from "./types.ts";

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONSENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function failure(code: "invalid_input" | "unavailable"): PublicStorefrontRepositoryError { return new PublicStorefrontRepositoryError(code); }
function timeout(value: number): string { if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw failure("unavailable"); return `${value}ms`; }
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) throw failure("invalid_input");
  return value as Record<string, unknown>;
}
function date(value: unknown): Date { if (!(value instanceof Date) || Object.getPrototypeOf(value) !== Date.prototype || !Number.isFinite(value.getTime())) throw failure("invalid_input"); return new Date(value); }
function hostname(value: unknown): string { if (typeof value !== "string" || value.length < 3 || value.length > 253 || value !== value.trim() || !HOSTNAME.test(value)) throw failure("invalid_input"); return value; }
function email(value: unknown): string { if (typeof value !== "string" || value.length < 3 || value.length > 254 || value !== value.trim() || CONTROL.test(value) || !EMAIL.test(value)) throw failure("invalid_input"); return value; }
function consentVersion(value: unknown): string { if (typeof value !== "string" || value.length < 1 || value.length > 64 || value !== value.trim() || !CONSENT.test(value)) throw failure("invalid_input"); return value; }
function integer(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 200) throw failure("invalid_input"); return value as number; }
function selected(rows: unknown[]): { outcome: string; payload: unknown } {
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || typeof rows[0] !== "object" || Array.isArray(rows[0]) || Object.keys(rows[0] as object).sort().join(",") !== "outcome,result_payload") throw failure("unavailable");
  const row = rows[0] as Record<string, unknown>;
  if (typeof row.outcome !== "string") throw failure("unavailable");
  return { outcome: row.outcome, payload: row.result_payload };
}
function timestamp(value: unknown): string { if (typeof value !== "string") throw failure("unavailable"); const parsed = new Date(value); if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw failure("unavailable"); return value; }
function subscriber(value: unknown): NewsletterSubscriber {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "consentVersion,consentedAt,email,status") throw failure("unavailable");
  const row = value as Record<string, unknown>;
  const status = row.status;
  if (status !== "subscribed" && status !== "unsubscribed") throw failure("unavailable");
  return Object.freeze({ email: email(row.email), status, consentVersion: consentVersion(row.consentVersion), consentedAt: timestamp(row.consentedAt) });
}

export class PostgresNewsletterRepository implements NewsletterRepository {
  private readonly options: PostgresNewsletterRepositoryOptions;
  constructor(options: PostgresNewsletterRepositoryOptions) {
    if (!options || Object.getPrototypeOf(options) !== Object.prototype || options.publicRole !== "celebix_saas_host_resolver" || options.merchantRole !== "celebix_saas_app") throw failure("unavailable");
    timeout(options.timeouts.poolCheckoutMs); timeout(options.timeouts.statementMs); timeout(options.timeouts.lockMs); timeout(options.timeouts.idleTransactionMs);
    this.options = options;
  }
  private async configure(client: PostgresClientLike, role: "celebix_saas_host_resolver" | "celebix_saas_app"): Promise<void> {
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await client.query(`SET LOCAL ROLE ${role}`);
  }
  private async execute(text: string, values: unknown[], role: "celebix_saas_host_resolver" | "celebix_saas_app", readOnly: boolean) {
    let client: PostgresClientLike;
    try { client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); } catch { throw failure("unavailable"); }
    let began = false;
    try {
      await client.query(readOnly ? "BEGIN READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      await this.configure(client, role);
      const result = selected((await client.query(text, values)).rows);
      await client.query("COMMIT"); client.release(); return result;
    } catch (caught) {
      if (began) { try { await client.query("ROLLBACK"); client.release(); } catch { client.release(true); } } else client.release(true);
      if (caught instanceof PublicStorefrontRepositoryError) throw caught;
      throw failure("unavailable");
    }
  }
  async subscribe(input: Parameters<NewsletterRepository["subscribe"]>[0]): Promise<NewsletterSubscriptionResult> {
    const parsed = exact(input, ["hostname", "now", "email", "consentVersion"]);
    const values = [hostname(parsed.hostname), date(parsed.now), email(parsed.email), consentVersion(parsed.consentVersion)];
    const result = await this.execute("SELECT outcome,result_payload FROM saas.public_newsletter_subscribe($1::text,$2::timestamptz,$3::text,$4::text)", values, this.options.publicRole, false);
    if (result.outcome !== "subscribed" || !result.payload || typeof result.payload !== "object" || Array.isArray(result.payload) || Object.keys(result.payload).join(",") !== "outcome" || (result.payload as { outcome?: unknown }).outcome !== "subscribed") throw failure("unavailable");
    return Object.freeze({ outcome: "subscribed" });
  }
  async list(input: Parameters<NewsletterRepository["list"]>[0]): Promise<readonly NewsletterSubscriber[]> {
    const parsed = exact(input, ["tenantContext", "now", "limit"]);
    let authority;
    try { authority = merchantAuthority(parsed.tenantContext as TenantContext, date(parsed.now), "content"); } catch { throw failure("invalid_input"); }
    const result = await this.execute("SELECT outcome,result_payload FROM saas.merchant_newsletter_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::integer)", [authority.storeId, authority.principalId, authority.membershipId, authority.planId, authority.planCode, authority.planVersion, authority.now, integer(parsed.limit)], this.options.merchantRole, true);
    if (result.outcome !== "listed" || !result.payload || typeof result.payload !== "object" || Array.isArray(result.payload) || Object.keys(result.payload).join(",") !== "items" || !Array.isArray((result.payload as { items?: unknown }).items)) throw failure("unavailable");
    return Object.freeze((result.payload as { items: unknown[] }).items.map(subscriber));
  }
}
