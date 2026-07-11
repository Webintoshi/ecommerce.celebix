import type { CreateStarterTenantResult } from "@celebix/saas-contracts";

import type { CanonicalTenantFingerprint } from "../types.ts";
import { normalizeExactHttpsOrigin } from "../panel-origin.ts";
import { SaaSDataCorruptionError, SaaSDataPersistenceError, mapPostgresError } from "./errors.ts";
import { parseTenantOperationRow, postgresParserInternals as parse } from "./parsers.ts";
import { acquirePostgresClient, type PostgresPoolLike, type PostgresTimeoutOptions } from "./pool.ts";

export type PostgresTenantOperationRecoveryResult =
  | { kind: "committed_match"; result: CreateStarterTenantResult }
  | { kind: "committed_mismatch" }
  | { kind: "absent" }
  | { kind: "processing" }
  | { kind: "failed" }
  | { kind: "corrupt" };

export interface PostgresTenantOperationRecoveryOptions {
  pool: PostgresPoolLike;
  timeouts: PostgresTimeoutOptions;
  bootstrapRole: "celebix_saas_bootstrap";
  panelOrigin: string;
}

function timeout(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw new SaaSDataPersistenceError();
  return `${value}ms`;
}

export class PostgresTenantOperationRecovery {
  private readonly options: PostgresTenantOperationRecoveryOptions;
  private readonly panelOrigin: string;
  constructor(options: PostgresTenantOperationRecoveryOptions) {
    if (options.bootstrapRole !== "celebix_saas_bootstrap") throw new SaaSDataPersistenceError();
    this.options = options;
    try { this.panelOrigin = normalizeExactHttpsOrigin(options.panelOrigin); }
    catch { throw new SaaSDataPersistenceError(); }
  }

  async recover(idempotencyKey: string, fingerprint: CanonicalTenantFingerprint): Promise<PostgresTenantOperationRecoveryResult> {
    const client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs);
    let began = false;
    let commitAttempted = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY"); began = true;
      await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
      await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
      await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
      await client.query("SET LOCAL ROLE celebix_saas_bootstrap");
      const query = await client.query(
        `SELECT id, idempotency_key, payload_fingerprint, status, result_payload, created_at, updated_at
         FROM saas.tenant_operations WHERE idempotency_key = $1`, [idempotencyKey],
      );
      let classification: PostgresTenantOperationRecoveryResult;
      if (query.rows.length === 0) classification = { kind: "absent" };
      else if (query.rows.length !== 1) classification = { kind: "corrupt" };
      else classification = classify(query.rows[0], idempotencyKey, fingerprint, this.panelOrigin);
      commitAttempted = true;
      await client.query("COMMIT");
      client.release();
      return classification;
    } catch (error) {
      if (commitAttempted) {
        client.release(true);
      } else if (began) {
        try { await client.query("ROLLBACK"); client.release(); }
        catch { client.release(true); }
      } else client.release(true);
      throw mapPostgresError(error);
    }
  }
}

function classify(rowValue: unknown, idempotencyKey: string, fingerprint: CanonicalTenantFingerprint, panelOrigin: string): PostgresTenantOperationRecoveryResult {
  try {
    const raw = parse.exact(rowValue, ["id", "idempotency_key", "payload_fingerprint", "status", "result_payload", "created_at", "updated_at"]);
    const status = typeof raw.status === "string" ? raw.status : "";
    if (raw.idempotency_key !== idempotencyKey || !["processing", "failed", "committed"].includes(status)) throw new SaaSDataCorruptionError();
    if (status === "committed" && raw.payload_fingerprint !== fingerprint) return { kind: "committed_mismatch" };
    const operation = parseTenantOperationRow(raw, panelOrigin);
    if (operation.status === "processing") return { kind: "processing" };
    if (operation.status === "failed") return { kind: "failed" };
    if (!operation.result) return { kind: "corrupt" };
    return { kind: "committed_match", result: { ...structuredClone(operation.result), replayed: true } };
  } catch (error) {
    if (error instanceof SaaSDataCorruptionError) return { kind: "corrupt" };
    return { kind: "corrupt" };
  }
}
