import { randomUUID } from "node:crypto";

import { createBoundedProviderTransport } from "@celebix/payment-adapters";
import {
  PostgresMerchantProviderWorkflowRepository,
  type PostgresMerchantProviderWorkflowRepositoryOptions,
  type PostgresPoolLike,
} from "@celebix/saas-data";
import pg from "pg";

import type { MerchantProviderProductionConfig } from "./production-config.ts";
import { createProductionMerchantProviderRegistries } from "./registry.ts";
import type { MerchantProviderWorkerOptions } from "./types.ts";
import { createMerchantProviderWorker } from "./worker.ts";

const { Pool } = pg;
const TIMEOUTS = Object.freeze({
  poolCheckoutMs: 2_000,
  statementMs: 5_000,
  lockMs: 2_000,
  idleTransactionMs: 5_000,
});

type PoolResource = PostgresPoolLike & Readonly<{ end(): Promise<void> }>;

export type MerchantProviderProductionDependencies = Readonly<{
  createPool(connectionString: string, applicationName: string): PoolResource;
  fetch(request: Request): Promise<Response>;
  uuid(): string;
  now(): Date;
  audit(code: string): void | Promise<void>;
}>;

export type MerchantProviderProductionRuntime = Readonly<{
  runOnce(): Promise<Readonly<{ kind: string }>>;
  close(): Promise<void>;
}>;

const defaults: MerchantProviderProductionDependencies = Object.freeze({
  createPool(connectionString: string, applicationName: string): PoolResource {
    const pool = new Pool({
      connectionString,
      max: 4,
      connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs,
      idleTimeoutMillis: 10_000,
      statement_timeout: TIMEOUTS.statementMs,
      lock_timeout: TIMEOUTS.lockMs,
      idle_in_transaction_session_timeout: TIMEOUTS.idleTransactionMs,
      application_name: applicationName,
    });
    pool.on("error", () => undefined);
    return pool;
  },
  fetch: (request) => globalThis.fetch(request),
  uuid: randomUUID,
  now: () => new Date(),
  audit: () => undefined,
});

export function createMerchantProviderRepositoryAudit(
  audit: MerchantProviderProductionDependencies["audit"],
): PostgresMerchantProviderWorkflowRepositoryOptions["audit"] {
  return (event) => audit(event.type);
}

async function preflight(pool: PostgresPoolLike, databaseName: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL ROLE celebix_saas_workflow");
    const result = await client.query(`SELECT
      current_setting('server_version_num')::integer AS version_num,
      current_database() AS database_name,
      current_user AS current_role,
      session_role.rolsuper AS session_is_superuser,
      pg_has_role(session_user, 'celebix_saas_workflow', 'MEMBER') AS workflow_member,
      to_regprocedure('saas.payment_provider_keyed_lifecycle_preflight()') IS NOT NULL
        AS provider_keyed_preflight_exists,
      saas.payment_provider_keyed_lifecycle_preflight() AS provider_keyed_lifecycle
    FROM pg_catalog.pg_roles AS session_role
    WHERE session_role.rolname = session_user
      AND to_regprocedure('saas.payment_provider_keyed_lifecycle_preflight()') IS NOT NULL`);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (
      result.rowCount !== 1 || !row || Math.floor(Number(row.version_num) / 10_000) !== 16 ||
      row.database_name !== databaseName || row.current_role !== "celebix_saas_workflow" ||
      row.session_is_superuser !== false || row.workflow_member !== true ||
      row.provider_keyed_preflight_exists !== true || row.provider_keyed_lifecycle !== true
    ) throw new Error("merchant_provider_production_preflight_failed");
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

export async function initializeMerchantProviderProductionRuntime(
  config: MerchantProviderProductionConfig,
  dependencies: MerchantProviderProductionDependencies = defaults,
): Promise<MerchantProviderProductionRuntime> {
  const pool = dependencies.createPool(config.database.url, `celebix-provider-${config.workerId}`);
  try {
    await preflight(pool, config.database.name);
    const transport = createBoundedProviderTransport({
      fetch: dependencies.fetch,
      timeoutMs: 5_000,
      maximumResponseBytes: 16_384,
    });
    const registries = createProductionMerchantProviderRegistries(Object.freeze({
      executionAuthorities: config.executionAuthorities,
      verificationIdentities: config.verificationIdentities,
      transport,
      paytrValidation: config.paytrValidation,
      validationReference: dependencies.uuid,
      validationRandomKey: () => dependencies.uuid().replaceAll("-", ""),
      validationTimeoutMs: 5_000,
    }));
    const repository = new PostgresMerchantProviderWorkflowRepository({
      pool,
      role: "celebix_saas_workflow",
      timeouts: TIMEOUTS,
      uuid: dependencies.uuid,
      audit: createMerchantProviderRepositoryAudit(dependencies.audit),
    });
    const worker = createMerchantProviderWorker(Object.freeze({
      mode: "validation_only",
      repository,
      registry: registries.execution,
      verificationRegistry: registries.verification,
      keyring: config.keyring,
      workerId: config.workerId,
      now: dependencies.now,
      leaseDurationMs: 60_000,
      audit: (event: Parameters<MerchantProviderWorkerOptions["audit"]>[0]) =>
        dependencies.audit(`merchant_provider_${event.operation}_${event.classification}`),
    }));
    return Object.freeze({ runOnce: worker.runOnce, close: () => pool.end() });
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
}
