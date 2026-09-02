import { resolveCname } from "node:dns/promises";

import { createCloudflareCustomHostnameProvider, createStoreDomainReconciler, type StoreDomainReconcilerResult } from "@celebix/saas-domain-core";
import { PostgresAdminDomainWorkflowRepository, PostgresStoreDomainWorkflowRepository, type PostgresPoolLike } from "@celebix/saas-data";
import pg from "pg";

import type { StoreDomainWorkerConfig } from "./config.ts";

const { Pool } = pg;
const TIMEOUTS = Object.freeze({ poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 2_000, idleTransactionMs: 5_000 });
type PoolResource = PostgresPoolLike & Readonly<{ end(): Promise<void> }>;

export type StoreDomainProductionDependencies = Readonly<{
  createPool(connectionString: string, applicationName: string): PoolResource;
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  resolveCname(hostname: string): Promise<readonly string[]>;
  now(): Date;
}>;
export type StoreDomainProductionRuntime = Readonly<{ runOnce(): Promise<StoreDomainReconcilerResult>; close(): Promise<void> }>;

const defaults: StoreDomainProductionDependencies = Object.freeze({
  createPool(connectionString: string, applicationName: string): PoolResource {
    const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs, idleTimeoutMillis: 10_000, application_name: applicationName });
    pool.on("error", () => undefined);
    return pool;
  },
  fetch: (input, init) => globalThis.fetch(input, init),
  resolveCname,
  now: () => new Date(),
});

async function preflight(pool: PostgresPoolLike, databaseName: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL ROLE celebix_saas_workflow");
    const result = await client.query(`SELECT
      current_setting('server_version_num')::integer AS version_num,
      current_database() AS database_name,
      current_user AS current_role,
      role.rolsuper AS session_is_superuser,
      pg_has_role(session_user, 'celebix_saas_workflow', 'MEMBER') AS workflow_member,
      to_regprocedure('saas.store_domain_work_claim(text,timestamp with time zone,timestamp with time zone,integer,uuid)') IS NOT NULL
        AND to_regprocedure('saas.store_domain_work_complete(uuid,uuid,text,timestamp with time zone,text,text,text,text,text,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.store_domain_work_fail(uuid,uuid,text,timestamp with time zone,text,timestamp with time zone,boolean)') IS NOT NULL AS domain_lifecycle
      ,to_regprocedure('saas.admin_domain_work_claim(text,timestamp with time zone,timestamp with time zone,integer,uuid)') IS NOT NULL
        AND to_regprocedure('saas.admin_domain_work_complete(uuid,uuid,text,timestamp with time zone,text,text,text,text,text,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.admin_domain_work_fail(uuid,uuid,text,timestamp with time zone,text,timestamp with time zone,boolean)') IS NOT NULL AS admin_domain_lifecycle
    FROM pg_catalog.pg_roles AS role WHERE role.rolname=session_user`);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (result.rowCount !== 1 || !row || Math.floor(Number(row.version_num) / 10_000) !== 16 || row.database_name !== databaseName
        || row.current_role !== "celebix_saas_workflow" || row.session_is_superuser !== false || row.workflow_member !== true
        || row.domain_lifecycle !== true || row.admin_domain_lifecycle !== true) {
      throw new Error("store_domain_production_preflight_failed");
    }
    await client.query("COMMIT");
  } catch (caught) {
    try { await client.query("ROLLBACK"); } catch {}
    throw caught;
  } finally { client.release(); }
}

export async function initializeStoreDomainProductionRuntime(
  config: StoreDomainWorkerConfig,
  dependencies: StoreDomainProductionDependencies = defaults,
): Promise<StoreDomainProductionRuntime> {
  const pool = dependencies.createPool(config.database.url, `celebix-domains-${config.workerId}`);
  try {
    await preflight(pool, config.database.name);
    const workflow = new PostgresStoreDomainWorkflowRepository({ pool, role: "celebix_saas_workflow", timeouts: TIMEOUTS });
    const adminWorkflow = new PostgresAdminDomainWorkflowRepository({ pool, role: "celebix_saas_workflow", timeouts: TIMEOUTS });
    const provider = createCloudflareCustomHostnameProvider(config.cloudflare, dependencies.fetch);
    const reconciler = createStoreDomainReconciler({ workflow, provider, resolveCname: dependencies.resolveCname, fetch: dependencies.fetch, workerId: config.workerId, cnameTarget: config.hostnamePolicy.cnameTarget, now: dependencies.now });
    const adminReconciler = createStoreDomainReconciler({ workflow: adminWorkflow, provider, resolveCname: dependencies.resolveCname, fetch: dependencies.fetch, workerId: `${config.workerId}.admin`, cnameTarget: config.hostnamePolicy.cnameTarget, now: dependencies.now });
    return Object.freeze({
      async runOnce() {
        const [storeResult, adminResult] = await Promise.all([reconciler.runOnce(), adminReconciler.runOnce()]);
        if (storeResult === "updated" || adminResult === "updated") return "updated";
        if (storeResult === "retry_scheduled" || adminResult === "retry_scheduled") return "retry_scheduled";
        if (storeResult === "failed" || adminResult === "failed") return "failed";
        return "empty";
      },
      close: () => pool.end(),
    });
  } catch (caught) {
    await pool.end().catch(() => undefined);
    throw caught;
  }
}
