import "server-only";

import { randomBytes } from "node:crypto";

import { PostgresAbandonedCartRepository } from "@celebix/saas-data";
import pg from "pg";

import type { CustomerPanelStagingAuthConfig } from "../panel-auth-authority/config.ts";
import { createPanelSessionPersistenceApproval } from "../panel-session-persistence/activation.ts";
import { createPostgresPanelSessionRepository } from "../panel-session-persistence/postgres-panel-session-repository.ts";
import { createApprovedStagingServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import { registerServerAbandonedCartRepository, resolveServerAbandonedCartRuntime, type ServerAbandonedCartRuntime } from "./runtime.ts";

const { Pool } = pg;
const TIMEOUTS = Object.freeze({
  poolCheckoutMs: 2_000,
  statementMs: 5_000,
  lockMs: 5_000,
  idleTransactionMs: 5_000,
});

async function preflight(pool: pg.Pool, databaseName: string): Promise<void> {
  const client = await pool.connect();
  let transactionActive = false;
  let destroyClient = false;
  try {
    const result = await client.query(`SELECT
      current_setting('server_version_num')::integer AS version_num,
      current_database() AS database_name,
      (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser,
      pg_has_role(current_user, 'celebix_saas_identity', 'MEMBER') AS identity_member,
      pg_has_role(current_user, 'celebix_saas_app', 'MEMBER') AS app_member,
      to_regclass('saas.panel_sessions') IS NOT NULL AS sessions,
      to_regprocedure('saas.resolve_panel_session(text,text,timestamptz)') IS NOT NULL
        AND has_function_privilege('celebix_saas_identity', 'saas.resolve_panel_session(text,text,timestamptz)', 'EXECUTE') AS session_resolver,
      to_regprocedure('saas.rotate_panel_session(text,text,uuid,uuid,text,text,uuid,timestamptz)') IS NOT NULL
        AND has_function_privilege('celebix_saas_identity', 'saas.rotate_panel_session(text,text,uuid,uuid,text,text,uuid,timestamptz)', 'EXECUTE') AS session_rotator,
      to_regprocedure('saas.revoke_principal_panel_sessions(text,text,text,timestamptz)') IS NOT NULL
        AND has_function_privilege('celebix_saas_identity', 'saas.revoke_principal_panel_sessions(text,text,text,timestamptz)', 'EXECUTE') AS principal_session_revoker,
      to_regprocedure('saas.recover_panel_session_operation(uuid,text,text,text,uuid,uuid,text,text,uuid)') IS NOT NULL
        AND has_function_privilege('celebix_saas_identity', 'saas.recover_panel_session_operation(uuid,text,text,text,uuid,uuid,text,text,uuid)', 'EXECUTE') AS session_recovery,
      to_regprocedure('saas.abandoned_carts_summary(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)') IS NOT NULL
        AND to_regprocedure('saas.abandoned_carts_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NOT NULL
        AND to_regprocedure('saas.abandoned_carts_mark_recovered(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        AND to_regprocedure('saas.abandoned_carts_archive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        AND to_regprocedure('saas.abandoned_carts_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)') IS NOT NULL
        AND to_regprocedure('saas.public_cart_mutate_without_customer_identity_v103(text,timestamp with time zone,jsonb,uuid,text,text,timestamp with time zone,uuid,text,text,bigint,uuid,uuid,integer)') IS NOT NULL
        AND to_regprocedure('saas.abandoned_carts_projection(uuid,uuid)') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.pg_attribute AS attribute
          WHERE attribute.attrelid = to_regclass('saas.abandoned_carts')
            AND attribute.attname = 'customer_id'
            AND NOT attribute.attisdropped
        )
        AND pg_catalog.strpos(COALESCE((
          SELECT procedure.prosrc
          FROM pg_catalog.pg_proc AS procedure
          WHERE procedure.oid = to_regprocedure('saas.abandoned_carts_projection(uuid,uuid)')
        ), ''), '''firstProductName''') > 0
        AND pg_catalog.strpos(COALESCE((
          SELECT procedure.prosrc
          FROM pg_catalog.pg_proc AS procedure
          WHERE procedure.oid = to_regprocedure('saas.abandoned_carts_projection(uuid,uuid)')
        ), ''), '''customerId''') > 0
        AND has_function_privilege('celebix_saas_app', 'saas.abandoned_carts_summary(uuid,uuid,uuid,uuid,text,bigint,timestamptz)', 'EXECUTE')
        AND has_function_privilege('celebix_saas_app', 'saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid)', 'EXECUTE')
        AND has_function_privilege('celebix_saas_app', 'saas.abandoned_carts_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)', 'EXECUTE')
        AND has_function_privilege('celebix_saas_app', 'saas.abandoned_carts_mark_recovered(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint)', 'EXECUTE')
        AND has_function_privilege('celebix_saas_app', 'saas.abandoned_carts_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint)', 'EXECUTE')
        AND has_function_privilege('celebix_saas_app', 'saas.abandoned_carts_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)', 'EXECUTE') AS abandoned_cart_repository`);
    const row = result.rows[0];
    if (
      result.rowCount !== 1 || !row ||
      Math.floor(Number(row.version_num) / 10_000) !== 16 ||
      row.database_name !== databaseName || row.is_superuser !== false ||
      row.identity_member !== true || row.app_member !== true || row.sessions !== true || row.session_resolver !== true ||
      row.session_rotator !== true || row.principal_session_revoker !== true ||
      row.session_recovery !== true || row.abandoned_cart_repository !== true
    ) {
      const failed = Object.entries(row ?? {})
        .filter(([field, value]) => !["version_num", "database_name", "is_superuser"].includes(field) && value !== true)
        .map(([field]) => field)
        .sort();
      throw new Error(`server_abandoned_cart_database_contract_preflight_failed:${failed.join(",") || "base"}`);
    }

    await client.query("BEGIN READ ONLY");
    transactionActive = true;
    await client.query("SET LOCAL ROLE celebix_saas_app");
    try {
      await client.query("COMMIT");
      transactionActive = false;
    } catch {
      transactionActive = false;
      destroyClient = true;
      throw new Error("server_abandoned_cart_database_commit_preflight_failed");
    }
  } catch (error) {
    if (transactionActive) {
      try { await client.query("ROLLBACK"); }
      catch { destroyClient = true; }
    }
    throw error;
  } finally {
    client.release(destroyClient || undefined);
  }
}

export async function initializeApprovedStagingServerAbandonedCartRuntime(
  config: CustomerPanelStagingAuthConfig,
): Promise<ServerAbandonedCartRuntime> {
  const pool = new Pool({
    connectionString: config.database.url,
    max: 5,
    connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs,
    idleTimeoutMillis: 10_000,
    statement_timeout: TIMEOUTS.statementMs,
    lock_timeout: TIMEOUTS.lockMs,
    idle_in_transaction_session_timeout: TIMEOUTS.idleTransactionMs,
    application_name: `celebix-panel-abandoned-carts-${config.activationId}`,
  });
  pool.on("error", () => undefined);
  try {
    await preflight(pool, config.database.name);
    const sessionRepository = createPostgresPanelSessionRepository(
      createPanelSessionPersistenceApproval("approved_staging"),
      {
        pool,
        keys: new Map([[config.keys.sessionKeyId, new Uint8Array(config.keys.session)]]),
        activeKeyId: config.keys.sessionKeyId,
        clock: () => new Date(),
        randomBytes: (size) => new Uint8Array(randomBytes(size)),
        timeouts: TIMEOUTS,
        cleanupLimit: 25,
        audit: () => undefined,
      },
    );
    const access = createApprovedStagingServerPanelAccessRuntime(sessionRepository, config.authority.panelOrigin);
    const abandonedCarts = new PostgresAbandonedCartRepository({
      pool,
      role: "celebix_saas_app",
      timeouts: TIMEOUTS,
      audit: () => undefined,
    });
    registerServerAbandonedCartRepository(access, abandonedCarts);
    const runtime = resolveServerAbandonedCartRuntime(access);
    if (runtime === null) throw new Error("server_abandoned_cart_runtime_invalid");
    return runtime;
  } catch (error) {
    try { await pool.end(); }
    catch { /* Failed initialization must not retain a pool. */ }
    throw error;
  }
}
