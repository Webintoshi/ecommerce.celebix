import { parseWhatsAppOrderConfig, type WhatsAppOrderConfig } from "@celebix/saas-contracts";
import { acquirePostgresClient, type PostgresClientLike, type PostgresPoolLike, type PostgresTimeoutOptions } from "../postgres/pool.ts";
import { StorefrontContentRepositoryError } from "../storefront-content/errors.ts";
import { exactStorefrontContentInput, storefrontContentDate, storefrontContentHostname, storefrontContentUuid } from "../storefront-content/validation.ts";

export type PublicWhatsAppOrderProjection = Readonly<{ storeId: string; version: number; config: WhatsAppOrderConfig }>;
export interface PublicWhatsAppOrderRepository {
  getForHost(input: Readonly<{ hostname: string; now: Date }>): Promise<PublicWhatsAppOrderProjection | null>;
}
export type PostgresPublicWhatsAppOrderRepositoryOptions = Readonly<{ pool: PostgresPoolLike; role: "celebix_saas_host_resolver"; timeouts: PostgresTimeoutOptions }>;
function unavailable(): never { throw new StorefrontContentRepositoryError("unavailable"); }
function timeout(value: unknown): string { if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 60_000) unavailable(); return `${value}ms`; }
function release(client: PostgresClientLike, destroy = false): void { try { client.release(destroy || undefined); } catch {} }

/** Independent of the cached storefront shell: merchant edits take effect on the next request. */
export class PostgresPublicWhatsAppOrderRepository implements PublicWhatsAppOrderRepository {
  private readonly options: PostgresPublicWhatsAppOrderRepositoryOptions;
  constructor(options: PostgresPublicWhatsAppOrderRepositoryOptions) {
    const parsed = exactStorefrontContentInput(options, ["pool", "role", "timeouts"], [], "unavailable");
    if (parsed.role !== "celebix_saas_host_resolver" || typeof (parsed.pool as { connect?: unknown })?.connect !== "function") unavailable();
    const times = exactStorefrontContentInput(parsed.timeouts, ["poolCheckoutMs", "statementMs", "lockMs", "idleTransactionMs"], [], "unavailable");
    for (const value of Object.values(times)) timeout(value);
    this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
  }
  async getForHost(input: Readonly<{ hostname: string; now: Date }>): Promise<PublicWhatsAppOrderProjection | null> {
    const parsed = exactStorefrontContentInput(input, ["hostname", "now"]);
    const hostname = storefrontContentHostname(parsed.hostname), now = storefrontContentDate(parsed.now);
    let client: PostgresClientLike;
    try { client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); } catch { unavailable(); }
    let began = false, terminal = false;
    try {
      await client.query("BEGIN READ ONLY"); began = true;
      await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
      await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
      await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
      await client.query("SET LOCAL ROLE celebix_saas_host_resolver");
      const selected = await client.query("SELECT outcome,result_payload FROM saas.public_whatsapp_order_get($1::text,$2::timestamptz)", [hostname, now]);
      if (selected.rowCount !== 1 || selected.rows.length !== 1) unavailable();
      const envelope = exactStorefrontContentInput(selected.rows[0], ["outcome", "result_payload"], [], "unavailable");
      if (envelope.outcome === "not_found" || envelope.outcome === "invalid_input") throw new StorefrontContentRepositoryError(envelope.outcome);
      if (envelope.outcome !== "found") unavailable();
      let projection: PublicWhatsAppOrderProjection | null = null;
      if (envelope.result_payload !== null) {
        const payload = exactStorefrontContentInput(envelope.result_payload, ["storeId", "version", "config"], [], "unavailable");
        const storeId = storefrontContentUuid(payload.storeId, "unavailable");
        if (!Number.isSafeInteger(payload.version) || (payload.version as number) < 1) unavailable();
        let config: WhatsAppOrderConfig;
        try { config = parseWhatsAppOrderConfig(payload.config); } catch { unavailable(); }
        projection = Object.freeze({ storeId, version: payload.version as number, config });
      }
      try { await client.query("COMMIT"); terminal = true; release(client); } catch { terminal = true; release(client, true); unavailable(); }
      return projection;
    } catch (error) {
      if (!terminal) {
        if (began) { try { await client.query("ROLLBACK"); release(client); } catch { release(client, true); } }
        else release(client, true);
      }
      if (error instanceof StorefrontContentRepositoryError) throw error;
      unavailable();
    }
  }
}
