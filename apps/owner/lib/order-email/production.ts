import { randomUUID } from "node:crypto";

import { PostgresOrderEmailWorkflowRepository, type PostgresPoolLike } from "@celebix/saas-data";
import pg from "pg";

import type { OrderEmailConfig } from "./config.ts";
import { sendOrderEmail } from "./resend.ts";
import { createOrderEmailWorker, type OrderEmailWorker } from "./worker.ts";

const { Pool } = pg;
const TIMEOUTS = Object.freeze({ poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 2_000, idleTransactionMs: 5_000 });
type PoolResource = PostgresPoolLike & Readonly<{ end(): Promise<void> }>;

export type OrderEmailProductionDependencies = Readonly<{
  createPool(connectionString: string, applicationName: string): PoolResource;
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  uuid(): string;
  now(): Date;
}>;
export type OrderEmailProductionRuntime = Readonly<{ runOnce: OrderEmailWorker["runOnce"]; close(): Promise<void> }>;

const defaults: OrderEmailProductionDependencies = Object.freeze({
  createPool(connectionString: string, applicationName: string): PoolResource {
    const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs, idleTimeoutMillis: 10_000, application_name: applicationName });
    pool.on("error", () => undefined);
    return pool;
  },
  fetch: (input, init) => globalThis.fetch(input, init),
  uuid: randomUUID,
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
      to_regprocedure('saas.order_email_work_claim(text,timestamp with time zone,timestamp with time zone,integer,uuid)') IS NOT NULL
        AND to_regprocedure('saas.order_email_work_seal(uuid,uuid,text,timestamp with time zone,text,bytea,text,text,text,timestamp with time zone,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.order_email_work_accept(uuid,uuid,text,timestamp with time zone,text)') IS NOT NULL
        AND to_regprocedure('saas.order_email_work_fail(uuid,uuid,text,timestamp with time zone,text,boolean,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.order_email_provider_event_record(text,text,text,timestamp with time zone,timestamp with time zone,text)') IS NOT NULL
        AS order_email_lifecycle
    FROM pg_catalog.pg_roles AS role WHERE role.rolname=session_user`);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (result.rowCount !== 1 || !row || Math.floor(Number(row.version_num) / 10_000) !== 16 || row.database_name !== databaseName || row.current_role !== "celebix_saas_workflow" || row.session_is_superuser !== false || row.workflow_member !== true || row.order_email_lifecycle !== true) throw new Error("order_email_production_preflight_failed");
    await client.query("COMMIT");
  } catch (caught) {
    try { await client.query("ROLLBACK"); } catch {}
    throw caught;
  } finally { client.release(); }
}

export async function initializeOrderEmailProductionRuntime(
  config: OrderEmailConfig,
  dependencies: OrderEmailProductionDependencies = defaults,
): Promise<OrderEmailProductionRuntime> {
  const pool = dependencies.createPool(config.database.url, `celebix-order-email-${config.workerId}`);
  try {
    await preflight(pool, config.database.name);
    const repository = new PostgresOrderEmailWorkflowRepository({ pool, role: "celebix_saas_workflow", timeouts: TIMEOUTS, uuid: dependencies.uuid });
    const worker = createOrderEmailWorker({
      repository, keyring: config.keyring, deliveryMode: config.deliveryMode,
      ...(config.testRecipient ? { testRecipient: config.testRecipient } : {}),
      senderEmail: config.senderEmail, workerId: config.workerId, now: dependencies.now,
      leaseDurationMs: 90_000, claimLimit: 25, concurrency: 2,
      send: (request, idempotencyKey) => sendOrderEmail(request, { apiKey: config.resendApiKey, idempotencyKey, timeoutMs: 5_000, fetch: dependencies.fetch as typeof fetch }),
    });
    return Object.freeze({
      runOnce: worker.runOnce,
      async close() {
        await pool.end();
        for (const key of Object.values(config.keyring.keys)) key.fill(0);
      },
    });
  } catch (caught) {
    await pool.end().catch(() => undefined);
    throw caught;
  }
}
