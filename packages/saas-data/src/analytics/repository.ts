import { parseAnalyticsDashboard, type AnalyticsDashboard } from "@celebix/saas-contracts";
import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import { ANALYTICS_ERROR_CODES, AnalyticsRepositoryError, type AnalyticsErrorCode } from "./errors.ts";
import type { AnalyticsAuthorityInput, AnalyticsRepository, PostgresAnalyticsRepositoryOptions } from "./types.ts";
import { analyticsAuthority, analyticsAuthorityValues, analyticsPeriod, exactAnalyticsInput } from "./validation.ts";

const CODES = new Set<string>(ANALYTICS_ERROR_CODES);
function unavailable(): AnalyticsRepositoryError { return new AnalyticsRepositoryError("unavailable"); }
function timeout(value: number): string { if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw unavailable(); return `${value}ms`; }
function release(client: PostgresClientLike, destroy = false) { try { client.release(destroy || undefined); } catch {} }
function exactRow(value: Readonly<{ rows: unknown[]; rowCount?: number | null }>) { if (value.rowCount !== 1 || value.rows.length !== 1) throw unavailable(); const row = value.rows[0]; if (typeof row !== "object" || row === null || Array.isArray(row) || Object.keys(row).sort().join(",") !== "outcome,result_payload") throw unavailable(); const parsed = row as Record<string, unknown>; if (typeof parsed.outcome !== "string" || parsed.outcome.length < 1 || parsed.outcome.length > 64) throw unavailable(); return Object.freeze({ outcome: parsed.outcome, resultPayload: parsed.result_payload }); }

export class PostgresAnalyticsRepository implements AnalyticsRepository {
  private readonly options: PostgresAnalyticsRepositoryOptions;
  constructor(options: PostgresAnalyticsRepositoryOptions) {
    try { if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).sort().join(",") !== "audit,pool,role,timeouts" || options.role !== "celebix_saas_app" || typeof options.audit !== "function" || !options.timeouts || Object.keys(options.timeouts).sort().join(",") !== "idleTransactionMs,lockMs,poolCheckoutMs,statementMs") throw unavailable(); for (const value of Object.values(options.timeouts)) timeout(value); this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) }); } catch (error) { if (error instanceof AnalyticsRepositoryError) throw error; throw unavailable(); }
  }
  private async configure(client: PostgresClientLike) { await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]); await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]); await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]); await client.query("SET LOCAL ROLE celebix_saas_app"); }
  private async rollback(client: PostgresClientLike) { try { await client.query("ROLLBACK"); release(client); } catch { release(client, true); } }
  async dashboard(input: AnalyticsAuthorityInput): Promise<Readonly<AnalyticsDashboard>> {
    let authority; let period: ReturnType<typeof analyticsPeriod>;
    try { const parsed = exactAnalyticsInput(input); authority = analyticsAuthority(parsed.tenantContext as never, parsed.now as Date); period = analyticsPeriod(parsed.period); } catch (error) { if (error instanceof AnalyticsRepositoryError) throw error; throw unavailable(); }
    let client: PostgresClientLike;
    try { client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); } catch { throw unavailable(); }
    let began = false; let terminal = false;
    try {
      await client.query("BEGIN READ ONLY"); began = true; await this.configure(client);
      const result = exactRow(await client.query("SELECT outcome,result_payload FROM saas.merchant_analytics_dashboard($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::text)", [...analyticsAuthorityValues(authority), period]));
      if (CODES.has(result.outcome) && result.outcome !== "unavailable") throw new AnalyticsRepositoryError(result.outcome as AnalyticsErrorCode);
      if (result.outcome !== "resolved") throw unavailable();
      let dashboard: Readonly<AnalyticsDashboard>;
      try { dashboard = parseAnalyticsDashboard(result.resultPayload); if (dashboard.period !== period) throw unavailable(); } catch (error) { if (error instanceof AnalyticsRepositoryError) throw error; throw unavailable(); }
      try { await client.query("COMMIT"); terminal = true; release(client); return dashboard; } catch { terminal = true; release(client, true); throw unavailable(); }
    } catch (error) { if (began && !terminal) await this.rollback(client); else if (!began && !terminal) release(client, true); if (error instanceof AnalyticsRepositoryError) throw error; throw unavailable(); }
  }
}
