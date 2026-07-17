import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { PostgresCatalogRepository } from "@celebix/saas-data";
import pg from "pg";

import type { CustomerPanelStagingAuthConfig } from "../panel-auth-authority/config.ts";
import { createPanelSessionPersistenceApproval } from "../panel-session-persistence/activation.ts";
import { createPostgresPanelSessionRepository } from "../panel-session-persistence/postgres-panel-session-repository.ts";
import { registerServerCatalogRepository } from "../server-catalog/runtime.ts";
import {
  createApprovedStagingServerPanelAccessRuntime,
  type ServerPanelAccessRuntime,
} from "./runtime.ts";

const { Pool } = pg;
const TIMEOUTS = Object.freeze({
  poolCheckoutMs: 2_000,
  statementMs: 5_000,
  lockMs: 5_000,
  idleTransactionMs: 5_000,
});

async function preflight(pool: pg.Pool, databaseName: string): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT
      current_setting('server_version_num')::integer AS version_num,
      current_database() AS database_name,
      role.rolsuper AS is_superuser,
      pg_has_role(current_user, 'celebix_saas_identity', 'MEMBER') AS identity_member,
      pg_has_role(current_user, 'celebix_saas_app', 'MEMBER') AS catalog_member,
      to_regclass('saas.principals') IS NOT NULL
        AND to_regclass('saas.stores') IS NOT NULL
        AND to_regclass('saas.memberships') IS NOT NULL
        AND to_regclass('saas.plans') IS NOT NULL
        AND to_regclass('saas.plan_features') IS NOT NULL
        AND to_regclass('saas.plan_limits') IS NOT NULL
        AND to_regclass('saas.subscriptions') IS NOT NULL
        AND to_regclass('saas.registration_workflows') IS NOT NULL
        AND to_regclass('saas.oidc_transactions') IS NOT NULL
        AND to_regclass('saas.registration_verified_identities') IS NOT NULL
        AND to_regclass('saas.registration_tenant_completions') IS NOT NULL
        AND to_regclass('saas.panel_sessions') IS NOT NULL
        AND to_regclass('saas.panel_session_handoffs') IS NOT NULL
        AND to_regclass('saas.panel_browser_bindings') IS NOT NULL
        AND to_regclass('saas.products') IS NOT NULL
        AND to_regclass('saas.product_variants') IS NOT NULL
        AND to_regclass('saas.catalog_operations') IS NOT NULL AS migrations_001_019,
      to_regclass('saas.panel_sessions') IS NOT NULL AS sessions,
      EXISTS (
        SELECT 1 FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace
        WHERE n.nspname='saas' AND proname='resolve_panel_session'
      ) AS session_resolver,
      EXISTS (
        SELECT 1 FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace
        WHERE n.nspname='saas' AND proname='rotate_panel_session'
      ) AS session_rotator,
      EXISTS (
        SELECT 1 FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace
        WHERE n.nspname='saas' AND proname='revoke_panel_session'
      ) AS session_revoker,
      EXISTS (
        SELECT 1 FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace
        WHERE n.nspname='saas' AND proname='recover_panel_session_operation'
      ) AS session_recovery,
      to_regprocedure('saas.catalog_get_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid)') IS NOT NULL AS catalog_reader,
      to_regprocedure('saas.catalog_list_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,integer,timestamp with time zone,uuid)') IS NOT NULL AS catalog_lister,
      to_regprocedure('saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)') IS NOT NULL AS catalog_creator,
      to_regprocedure('saas.catalog_update_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,text,text,text)') IS NOT NULL AS catalog_updater,
      to_regprocedure('saas.catalog_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL AS catalog_archiver,
      to_regprocedure('saas.catalog_create_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)') IS NOT NULL AS variant_creator,
      to_regprocedure('saas.catalog_update_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)') IS NOT NULL AS variant_updater,
      to_regprocedure('saas.catalog_archive_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint)') IS NOT NULL AS variant_archiver,
      to_regprocedure('saas.catalog_recover_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text)') IS NOT NULL AS catalog_recovery,
      to_regprocedure('saas.catalog_get_product_details(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,boolean)') IS NOT NULL AS catalog_details
    FROM pg_roles AS role WHERE role.rolname = current_user`);
    const row = result.rows[0];
    if (
      result.rowCount !== 1 || !row ||
      Math.floor(Number(row.version_num) / 10_000) !== 16 ||
      row.database_name !== databaseName || row.is_superuser !== false ||
      row.identity_member !== true || row.catalog_member !== true || row.migrations_001_019 !== true ||
      row.sessions !== true || row.session_resolver !== true || row.session_rotator !== true ||
      row.session_revoker !== true || row.session_recovery !== true || row.catalog_reader !== true ||
      row.catalog_lister !== true || row.catalog_creator !== true || row.catalog_updater !== true ||
      row.catalog_archiver !== true || row.variant_creator !== true || row.variant_updater !== true ||
      row.variant_archiver !== true || row.catalog_recovery !== true || row.catalog_details !== true
    ) throw new Error("server_panel_access_database_preflight_failed");
  } finally { client.release(); }
}

export async function initializeApprovedStagingServerPanelAccessRuntime(
  config: CustomerPanelStagingAuthConfig,
): Promise<ServerPanelAccessRuntime> {
  const pool = new Pool({
    connectionString: config.database.url,
    max: 10,
    connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs,
    idleTimeoutMillis: 10_000,
    statement_timeout: TIMEOUTS.statementMs,
    lock_timeout: TIMEOUTS.lockMs,
    idle_in_transaction_session_timeout: TIMEOUTS.idleTransactionMs,
    application_name: `celebix-panel-${config.activationId}`,
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
        randomBytes: (size: number) => new Uint8Array(randomBytes(size)),
        timeouts: TIMEOUTS,
        cleanupLimit: 25,
        audit: () => undefined,
      },
    );
    const catalogRepository = new PostgresCatalogRepository({
      pool,
      role: "celebix_saas_app",
      timeouts: TIMEOUTS,
      generateId: () => randomUUID(),
      audit: () => undefined,
    });
    const access = createApprovedStagingServerPanelAccessRuntime(
      sessionRepository,
      config.authority.panelOrigin,
    );
    registerServerCatalogRepository(access, catalogRepository);
    return access;
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
}
