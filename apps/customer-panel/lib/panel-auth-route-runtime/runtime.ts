import { randomBytes, randomUUID } from "node:crypto";

import pg from "pg";

import { createCustomerPanelAuthCompositionApproval } from "../panel-auth-composition/activation.ts";
import { createDisabledCustomerPanelAuthComposition } from "../panel-auth-composition/composition.ts";
import type { CustomerPanelStagingAuthConfig } from "../panel-auth-authority/config.ts";
import { createCustomerPanelAuthRouteMountApproval } from "../panel-auth-route-mount/activation.ts";
import {
  createApprovedStagingCustomerPanelAuthRouteSet,
  type CustomerPanelAuthRouteSet,
} from "../panel-auth-route-mount/route-set.ts";
import { createPanelSessionHandoffApproval } from "../panel-session-handoff/activation.ts";
import { createPostgresPanelSessionHandoffRedeemer } from "../panel-session-handoff/postgres-handoff-redeemer.ts";
import { createPanelSessionPersistenceApproval } from "../panel-session-persistence/activation.ts";
import { createPostgresCrossHostSessionHandoffRepository } from "../cross-host-session-handoff/postgres-repository.ts";

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
      to_regclass('saas.panel_browser_bindings') IS NOT NULL AS browser_bindings,
      to_regclass('saas.panel_session_handoffs') IS NOT NULL AS handoffs,
      to_regclass('saas.panel_sessions') IS NOT NULL AS sessions,
      to_regclass('saas.admin_domains') IS NOT NULL
        AND to_regclass('saas.cross_host_panel_handoffs') IS NOT NULL
        AND to_regprocedure('saas.issue_cross_host_panel_handoff(text,text,uuid,uuid,text,text,uuid,text,timestamp with time zone,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.recover_cross_host_panel_handoff(uuid,text,text,text,timestamp with time zone)') IS NOT NULL
        AND to_regprocedure('saas.redeem_cross_host_panel_handoff(text,text,text,uuid,uuid,uuid,text,text,timestamp with time zone,timestamp with time zone)') IS NOT NULL AS cross_host_auth,
      (SELECT count(DISTINCT proname) FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace
       WHERE n.nspname='saas' AND proname IN (
         'bind_panel_browser_credential','recover_panel_session_handoff',
         'redeem_panel_session_handoff','recover_panel_session_handoff_redemption','resolve_panel_session'
       )) = 5 AS required_functions
    FROM pg_roles AS role WHERE role.rolname = current_user`);
    const row = result.rows[0];
    if (!row || Math.floor(Number(row.version_num) / 10_000) !== 16 || row.database_name !== databaseName ||
        row.is_superuser !== false || row.identity_member !== true ||
        ["browser_bindings", "handoffs", "sessions", "cross_host_auth", "required_functions"].some((key) => row[key] !== true)) {
      throw new Error("customer_panel_staging_database_preflight_failed");
    }
  } finally { client.release(); }
}

export async function initializeCustomerPanelStagingAuthRouteSet(
  config: CustomerPanelStagingAuthConfig,
): Promise<CustomerPanelAuthRouteSet> {
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

  const clock = () => new Date();
  const bytes = (size: number) => new Uint8Array(randomBytes(size));
  const redeemer = createPostgresPanelSessionHandoffRedeemer(
    createPanelSessionHandoffApproval("approved_staging"),
    {
      pool,
      handoffKeys: new Map([[config.keys.handoffKeyId, config.keys.handoff]]),
      sessionKeys: new Map([[config.keys.sessionKeyId, config.keys.session]]),
      clock,
      timeouts: TIMEOUTS,
      audit: () => undefined,
    },
  );
  const crossHostHandoff = createPostgresCrossHostSessionHandoffRepository(
    createPanelSessionPersistenceApproval("approved_staging"),
    {
      pool,
      handoffKeys: new Map([[config.keys.handoffKeyId, new Uint8Array(config.keys.handoff)]]),
      activeHandoffKeyId: config.keys.handoffKeyId,
      sessionKeys: new Map([[config.keys.sessionKeyId, new Uint8Array(config.keys.session)]]),
      activeSessionKeyId: config.keys.sessionKeyId,
      clock,
      randomBytes: bytes,
      timeouts: TIMEOUTS,
      audit: () => undefined,
    },
  );
  const composition = createDisabledCustomerPanelAuthComposition({
    activationApproval: createCustomerPanelAuthCompositionApproval("approved_staging"),
    authorityProfile: config.authority,
    ownerInternalOrigin: config.authority.ownerOrigin,
    randomBytes: bytes,
    clock,
    fetch: globalThis.fetch,
    browserBinding: {
      activeKeyId: config.keys.browserInternalKeyId,
      activeSecret: config.keys.browserInternal,
      maximumBodyBytes: 16_384,
      deadlineMs: 5_000,
      maximumResponseBytes: 16_384,
      transportAudit: () => undefined,
      handlerAudit: () => undefined,
    },
    sessionCompletion: {
      activeKeyId: config.keys.callbackInternalKeyId,
      activeSecret: config.keys.callbackInternal,
      maximumQueryBytes: 8_192,
      deadlineMs: 5_000,
      maximumResponseBytes: 4_096,
      transportAudit: () => undefined,
      handlerAudit: () => undefined,
    },
    handoffRedeemer: redeemer,
    crossHostHandoff: {
      repository: crossHostHandoff,
      randomUuid: () => randomUUID(),
    },
  });
  return createApprovedStagingCustomerPanelAuthRouteSet({
    approval: createCustomerPanelAuthRouteMountApproval("approved_staging"),
    environment: "approved_staging",
    composition,
  });
}
