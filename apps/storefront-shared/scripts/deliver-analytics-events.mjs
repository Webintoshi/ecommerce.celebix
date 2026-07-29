import "server-only";

import pg from "pg";
import { PostgresAnalyticsOutboxRepository } from "@celebix/saas-data";
import { parseCheckoutRuntimeConfig } from "../lib/checkout/config.ts";
import { parseUmamiPublicCollectorConfig } from "../lib/analytics/config.ts";
import { deliverAnalyticsOutbox } from "../lib/analytics/delivery.ts";

const { Pool } = pg;
const TIMEOUTS = Object.freeze({ poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 2_000, idleTransactionMs: 5_000 });
const failed = Object.freeze({ outcome: "analytics_delivery_failed", claimed: 0, delivered: 0, retried: 0, terminal: 0 });

async function main() {
  if (process.argv.length !== 2 || "window" in globalThis) return failed;
  const database = parseCheckoutRuntimeConfig(process.env).database;
  const collector = await parseUmamiPublicCollectorConfig(process.env);
  if (collector === null) return failed;
  const pool = new Pool({ connectionString: database.url, max: 5, connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs, idleTimeoutMillis: 10_000, statement_timeout: TIMEOUTS.statementMs, lock_timeout: TIMEOUTS.lockMs, idle_in_transaction_session_timeout: TIMEOUTS.idleTransactionMs, application_name: "celebix-analytics-delivery-staging" });
  pool.on("error", () => undefined);
  try {
    const check = await pool.query("SELECT current_setting('server_version_num')::integer AS version_num,current_database() AS database_name,role.rolsuper AS is_superuser,pg_has_role(current_user,'celebix_saas_workflow','MEMBER') AS workflow_member,to_regprocedure('saas.analytics_outbox_claim(timestamp with time zone,integer,interval)') IS NOT NULL AND to_regprocedure('saas.analytics_outbox_mark_delivered(uuid,text,timestamp with time zone)') IS NOT NULL AND to_regprocedure('saas.analytics_outbox_mark_failed(uuid,text,timestamp with time zone,text,timestamp with time zone,boolean)') IS NOT NULL AS migration_039 FROM pg_roles AS role WHERE role.rolname=current_user");
    const row = check.rows[0];
    if (check.rowCount !== 1 || !row || Math.floor(Number(row.version_num) / 10_000) !== 16 || row.database_name !== database.name || row.is_superuser !== false || row.workflow_member !== true || row.migration_039 !== true) return failed;
    const repository = new PostgresAnalyticsOutboxRepository({ pool, role: "celebix_saas_workflow", timeouts: TIMEOUTS });
    const result = await deliverAnalyticsOutbox(repository, collector, { now: () => new Date(), fetch: globalThis.fetch, userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) CelebixEvents/1.0 Safari/537.36", timeoutMs: 5_000 });
    return Object.freeze({ outcome: "analytics_delivery_complete", ...result });
  } finally {
    await pool.end().catch(() => undefined);
  }
}

const result = await main().catch(() => failed);
const serialized = `${JSON.stringify(result)}\n`;
if (result.outcome === "analytics_delivery_failed") {
  process.stderr.write(serialized);
  process.exitCode = 1;
} else {
  process.stdout.write(serialized);
}
