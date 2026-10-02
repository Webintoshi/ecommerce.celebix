import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import { StorefrontContentRepositoryError, STOREFRONT_CONTENT_ERROR_CODES, type StorefrontContentErrorCode } from "../storefront-content/errors.ts";
import { exactStorefrontContentInput, storefrontContentDate, storefrontContentHostname, storefrontContentUuid } from "../storefront-content/validation.ts";
import { assertCatalogSearchServer, boundedInteger, record, searchFailure } from "./common.ts";
import { parseCatalogSearchJobs } from "./validation.ts";
import type { CatalogSearchAckOutcome, CatalogSearchJobRepository, CatalogSearchScopeRepository, PostgresCatalogSearchJobRepositoryOptions, PostgresPublicCatalogSearchScopeRepositoryOptions } from "./types.ts";

type Options = PostgresCatalogSearchJobRepositoryOptions | PostgresPublicCatalogSearchScopeRepositoryOptions;
const errorCodes = new Set<string>(STOREFRONT_CONTENT_ERROR_CODES);
function release(client: PostgresClientLike, destroy = false): void { try { client.release(destroy || undefined); } catch {} }

abstract class CatalogSearchPostgresBase {
  protected readonly options: Options;
  constructor(options: Options, role: Options["role"]) {
    assertCatalogSearchServer();
    const parsed = exactStorefrontContentInput(options, ["pool", "role", "timeouts"], [], "unavailable");
    if (parsed.role !== role || typeof (parsed.pool as { connect?: unknown })?.connect !== "function") searchFailure();
    const timeouts = exactStorefrontContentInput(parsed.timeouts, ["poolCheckoutMs", "statementMs", "lockMs", "idleTransactionMs"], [], "unavailable");
    for (const value of Object.values(timeouts)) boundedInteger(value, 1, 60_000);
    this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
  }
  protected async execute<T>(query: string, values: unknown[], parse: (outcome: string, payload: unknown) => T): Promise<T> {
    let client: PostgresClientLike;
    try { client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); } catch { searchFailure(); }
    let began = false, terminal = false;
    try {
      await client.query(this.options.role === "celebix_saas_host_resolver" ? "BEGIN READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED");
      began = true;
      await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [`${this.options.timeouts.statementMs}ms`]);
      await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [`${this.options.timeouts.lockMs}ms`]);
      await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [`${this.options.timeouts.idleTransactionMs}ms`]);
      await client.query(`SET LOCAL ROLE ${this.options.role}`);
      const result = await client.query(query, values);
      if (result.rowCount !== 1 || result.rows.length !== 1) searchFailure();
      const envelope = exactStorefrontContentInput(result.rows[0], ["outcome", "result_payload"], [], "unavailable");
      if (typeof envelope.outcome !== "string") searchFailure();
      if (errorCodes.has(envelope.outcome)) throw new StorefrontContentRepositoryError(envelope.outcome as StorefrontContentErrorCode);
      const parsed = parse(envelope.outcome, envelope.result_payload);
      try { await client.query("COMMIT"); terminal = true; release(client); }
      catch { terminal = true; release(client, true); searchFailure(); }
      return parsed;
    } catch (error) {
      if (!terminal) {
        if (began) { try { await client.query("ROLLBACK"); release(client); } catch { release(client, true); } }
        else release(client, true);
      }
      if (error instanceof StorefrontContentRepositoryError) throw error;
      searchFailure();
    }
  }
}

export class PostgresPublicCatalogSearchScopeRepository extends CatalogSearchPostgresBase implements CatalogSearchScopeRepository {
  constructor(options: PostgresPublicCatalogSearchScopeRepositoryOptions) { super(options, "celebix_saas_host_resolver"); }
  async resolve(input: Parameters<CatalogSearchScopeRepository["resolve"]>[0]) {
    const parsed = exactStorefrontContentInput(input, ["hostname", "now"]);
    return this.execute("SELECT outcome,result_payload FROM saas.public_catalog_search_scope($1::text,$2::timestamptz)", [storefrontContentHostname(parsed.hostname), storefrontContentDate(parsed.now)], (outcome, value) => {
      if (outcome !== "found") searchFailure();
      const scope = exactStorefrontContentInput(value, ["storeId", "pending"], [], "unavailable");
      if (typeof scope.pending !== "boolean") searchFailure();
      return Object.freeze({ storeId: storefrontContentUuid(scope.storeId, "unavailable"), pending: scope.pending });
    });
  }
}

export class PostgresCatalogSearchJobRepository extends CatalogSearchPostgresBase implements CatalogSearchJobRepository {
  constructor(options: PostgresCatalogSearchJobRepositoryOptions) { super(options, "celebix_saas_workflow"); }
  async requeueAll(input: Readonly<{ now: Date }>): Promise<Readonly<{ queued: number }>> {
    const parsed = exactStorefrontContentInput(input, ["now"]);
    return this.execute("SELECT outcome,result_payload FROM saas.catalog_search_requeue_all($1::timestamptz)", [storefrontContentDate(parsed.now)], (outcome, payload) => {
      if (outcome !== "requeued") searchFailure();
      const result = exactStorefrontContentInput(payload, ["queued"], [], "unavailable");
      return Object.freeze({ queued: boundedInteger(result.queued, 0, Number.MAX_SAFE_INTEGER) });
    });
  }
  async claim(input: Parameters<CatalogSearchJobRepository["claim"]>[0]) {
    const parsed = exactStorefrontContentInput(input, ["now", "limit", "leaseId"]);
    const limit = boundedInteger(parsed.limit, 1, 100);
    return this.execute("SELECT outcome,result_payload FROM saas.catalog_search_claim($1::timestamptz,$2::integer,$3::uuid)", [storefrontContentDate(parsed.now), limit, storefrontContentUuid(parsed.leaseId)], (outcome, value) => {
      if (outcome !== "claimed") searchFailure();
      return parseCatalogSearchJobs(value, limit);
    });
  }
  async acknowledge(input: Parameters<CatalogSearchJobRepository["acknowledge"]>[0]): Promise<CatalogSearchAckOutcome> {
    const parsed = exactStorefrontContentInput(input, ["leaseId", "storeId", "productId", "generation", "now", "error"]);
    if (parsed.error !== null && (typeof parsed.error !== "string" || parsed.error.length < 1 || parsed.error.length > 1000 || /[\r\n\u0000]/.test(parsed.error))) searchFailure("invalid_input");
    return this.execute("SELECT outcome,result_payload FROM saas.catalog_search_ack($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::timestamptz,$6::text)", [storefrontContentUuid(parsed.leaseId), storefrontContentUuid(parsed.storeId), storefrontContentUuid(parsed.productId), boundedInteger(parsed.generation, 1, Number.MAX_SAFE_INTEGER), storefrontContentDate(parsed.now), parsed.error], (outcome, payload) => {
      if (Object.keys(record(payload)).length !== 0 || (outcome !== "acknowledged" && outcome !== "retry" && outcome !== "stale")) searchFailure();
      return outcome;
    });
  }
}
