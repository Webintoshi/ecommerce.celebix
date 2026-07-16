import "server-only";

import { randomBytes } from "node:crypto";

import pg from "pg";

import type { CustomerPanelStagingAuthConfig } from "../panel-auth-authority/config.ts";
import { createPanelSessionPersistenceApproval } from "../panel-session-persistence/activation.ts";
import { createPostgresPanelSessionRepository } from "../panel-session-persistence/postgres-panel-session-repository.ts";
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
      ) AS session_recovery
    FROM pg_roles AS role WHERE role.rolname = current_user`);
    const row = result.rows[0];
    if (
      result.rowCount !== 1 || !row ||
      Math.floor(Number(row.version_num) / 10_000) !== 16 ||
      row.database_name !== databaseName || row.is_superuser !== false ||
      row.identity_member !== true || row.sessions !== true || row.session_resolver !== true ||
      row.session_rotator !== true || row.session_revoker !== true || row.session_recovery !== true
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
  try { await preflight(pool, config.database.name); }
  catch (error) { await pool.end().catch(() => undefined); throw error; }

  const repository = createPostgresPanelSessionRepository(
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
  return createApprovedStagingServerPanelAccessRuntime(repository, config.authority.panelOrigin);
}
