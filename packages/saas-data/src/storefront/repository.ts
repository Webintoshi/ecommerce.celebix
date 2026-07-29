import { parsePublicProduct, parsePublicProductMedia, parsePublicStorefront, type PublicProduct, type PublicProductMedia, type PublicStorefront } from "../../../saas-contracts/src/storefront/index.ts";
import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import { PublicStorefrontRepositoryError } from "./errors.ts";
import type { PostgresPublicStorefrontRepositoryOptions, PublicStorefrontRepository } from "./types.ts";

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function failure(code: "invalid_input" | "not_found" | "unavailable"): PublicStorefrontRepositoryError { return new PublicStorefrontRepositoryError(code); }
function timeout(value: number): string { if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw failure("unavailable"); return `${value}ms`; }
function date(value: unknown): Date { if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw failure("invalid_input"); return new Date(value); }
function exact<T extends object>(value: T, keys: readonly string[]): T { if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) throw failure("invalid_input"); return value; }
function hostname(value: unknown): string { if (typeof value !== "string" || value.length < 3 || value.length > 253 || value !== value.trim() || !HOSTNAME.test(value)) throw failure("invalid_input"); return value; }
function uuid(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) throw failure("invalid_input"); return value; }
function slug(value: unknown): string { if (typeof value !== "string" || value.length < 3 || value.length > 100 || !SLUG.test(value)) throw failure("invalid_input"); return value; }
function row(rows: unknown[]): { outcome: string; resultPayload: unknown } {
  if (rows.length !== 1 || typeof rows[0] !== "object" || rows[0] === null || Array.isArray(rows[0])) throw failure("unavailable");
  const parsed = rows[0] as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== "outcome,result_payload" || typeof parsed.outcome !== "string") throw failure("unavailable");
  return { outcome: parsed.outcome, resultPayload: parsed.result_payload };
}
function context(value: unknown): PublicStorefront {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).join(",") !== "storefront") throw failure("invalid_input");
  try { return parsePublicStorefront((value as { storefront: unknown }).storefront); } catch { throw failure("invalid_input"); }
}

export class PostgresPublicStorefrontRepository implements PublicStorefrontRepository {
  private readonly options: PostgresPublicStorefrontRepositoryOptions;
  constructor(options: PostgresPublicStorefrontRepositoryOptions) {
    if (!options || options.role !== "celebix_saas_host_resolver") throw failure("unavailable");
    timeout(options.timeouts.poolCheckoutMs); timeout(options.timeouts.statementMs); timeout(options.timeouts.lockMs); timeout(options.timeouts.idleTransactionMs);
    this.options = options;
  }
  private async configure(client: PostgresClientLike): Promise<void> {
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await client.query("SET LOCAL ROLE celebix_saas_host_resolver");
  }
  private async read(text: string, values: unknown[]): Promise<{ outcome: string; resultPayload: unknown }> {
    let client: PostgresClientLike;
    try { client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); } catch { throw failure("unavailable"); }
    let began = false;
    try {
      await client.query("BEGIN READ ONLY"); began = true; await this.configure(client);
      const result = row((await client.query(text, values)).rows);
      await client.query("COMMIT"); client.release(); return result;
    } catch (caught) {
      if (began) { try { await client.query("ROLLBACK"); client.release(); } catch { client.release(true); } } else client.release(true);
      if (caught instanceof PublicStorefrontRepositoryError) throw caught;
      throw failure("unavailable");
    }
  }
  private projection(result: { outcome: string; resultPayload: unknown }): unknown {
    if (result.outcome === "not_found") throw failure("not_found");
    if (result.outcome === "invalid_input") throw failure("invalid_input");
    if (result.outcome !== "found") throw failure("unavailable");
    return result.resultPayload;
  }
  async getPublicStorefront(input: { hostname: string; now: Date }): Promise<PublicStorefront> {
    const parsed = exact(input, ["hostname", "now"]);
    const result = await this.read("SELECT outcome, result_payload FROM saas.resolve_public_storefront($1::text,$2::timestamptz)", [hostname(parsed.hostname), date(parsed.now)]);
    try { return parsePublicStorefront(this.projection(result)); } catch (caught) { if (caught instanceof PublicStorefrontRepositoryError) throw caught; throw failure("unavailable"); }
  }
  async listPublicProducts(input: Parameters<PublicStorefrontRepository["listPublicProducts"]>[0]) {
    const parsed = exact(input, ["storefront", "now", "limit"]); const store = context({ storefront: parsed.storefront });
    if (!Number.isSafeInteger(parsed.limit) || parsed.limit < 1 || parsed.limit > 48) throw failure("invalid_input");
    const result = await this.read("SELECT outcome, result_payload FROM saas.public_list_products($1::uuid,$2::text,$3::timestamptz,$4::integer)", [store.id, store.hostname, date(parsed.now), parsed.limit]);
    const payload = this.projection(result);
    if (!Array.isArray(payload)) throw failure("unavailable");
    try { return Object.freeze({ items: Object.freeze(payload.map(parsePublicProduct)) }); } catch { throw failure("unavailable"); }
  }
  async getPublicProductBySlug(input: Parameters<PublicStorefrontRepository["getPublicProductBySlug"]>[0]): Promise<PublicProduct> {
    const parsed = exact(input, ["storefront", "now", "slug"]); const store = context({ storefront: parsed.storefront });
    const result = await this.read("SELECT outcome, result_payload FROM saas.public_get_product_by_slug($1::uuid,$2::text,$3::timestamptz,$4::text)", [store.id, store.hostname, date(parsed.now), slug(parsed.slug)]);
    try { return parsePublicProduct(this.projection(result)); } catch (caught) { if (caught instanceof PublicStorefrontRepositoryError) throw caught; throw failure("unavailable"); }
  }
  async listPublicProductMedia(input: Parameters<PublicStorefrontRepository["listPublicProductMedia"]>[0]): Promise<readonly PublicProductMedia[]> {
    const parsed = exact(input, ["storefront", "now", "productId"]); const store = context({ storefront: parsed.storefront });
    const result = await this.read("SELECT outcome, result_payload FROM saas.public_list_product_media($1::uuid,$2::text,$3::timestamptz,$4::uuid)", [store.id, store.hostname, date(parsed.now), uuid(parsed.productId)]);
    const payload = this.projection(result); if (!Array.isArray(payload)) throw failure("unavailable");
    try { return Object.freeze(payload.map(parsePublicProductMedia)); } catch { throw failure("unavailable"); }
  }
}
