import "server-only";

import process from "node:process";

import { PostgresStorefrontDesignRepository } from "@celebix/saas-data";
import pg from "pg";

import { CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS, parseCustomerPanelStagingAuthConfig, resolveCustomerPanelStagingAuthMode } from "../panel-auth-authority/config.ts";
import { parseStagingProductMediaConfig } from "../server-media/config.ts";
import { createR2ProductMediaStorage } from "../server-media/r2-storage.ts";
import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { createServerStorefrontDesignRuntime, type ServerStorefrontDesignRuntime } from "./runtime.ts";
import { createPostCommitInvalidatingRepository } from "../server-cache/invalidation.ts";

const { Pool } = pg;
const TIMEOUTS = Object.freeze({ poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 5_000, idleTransactionMs: 5_000 });
let initialization: Promise<ServerStorefrontDesignRuntime | null> | undefined;

async function initialize(): Promise<ServerStorefrontDesignRuntime | null> {
  if (resolveCustomerPanelStagingAuthMode(process.env) !== "approved_staging") return null;
  const access = await resolveDefaultServerPanelAccessRuntime();
  if (access.readiness.mode !== "approved_staging") return null;
  const auth = parseCustomerPanelStagingAuthConfig(Object.fromEntries(CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS.map((name) => [name, process.env[name]])));
  const media = parseStagingProductMediaConfig(process.env);
  const pool = new Pool({ connectionString: auth.database.url, max: 5, connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs, idleTimeoutMillis: 10_000, statement_timeout: TIMEOUTS.statementMs, lock_timeout: TIMEOUTS.lockMs, idle_in_transaction_session_timeout: TIMEOUTS.idleTransactionMs, application_name: `celebix-panel-storefront-design-${auth.activationId}` });
  pool.on("error", () => undefined);
  try {
    const result = await pool.query(`SELECT current_setting('server_version_num')::integer AS version_num,current_database() AS database_name,role.rolsuper AS is_superuser,pg_has_role(current_user,'celebix_saas_app','MEMBER') AS app_member,to_regclass('saas.storefront_designs') IS NOT NULL AND to_regclass('saas.storefront_design_media') IS NOT NULL AND to_regclass('saas.storefront_design_operations') IS NOT NULL AND to_regprocedure('saas.storefront_design_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NOT NULL AND to_regprocedure('saas.storefront_design_save_draft(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,bigint,jsonb)') IS NOT NULL AND to_regprocedure('saas.storefront_design_publish(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,bigint,bigint)') IS NOT NULL AND to_regprocedure('saas.storefront_design_media_reserve(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,integer,integer,bigint,text)') IS NOT NULL AS design_ready FROM pg_roles AS role WHERE role.rolname=current_user`);
    const row = result.rows[0];
    if (result.rowCount !== 1 || !row || Math.floor(Number(row.version_num) / 10_000) !== 16 || row.database_name !== auth.database.name || row.is_superuser !== false || row.app_member !== true || row.design_ready !== true) throw new Error("server_storefront_design_database_preflight_failed");
    const repository = new PostgresStorefrontDesignRepository({ pool, role: "celebix_saas_app", timeouts: TIMEOUTS, audit: () => undefined });
    return createServerStorefrontDesignRuntime({ access, repository: createPostCommitInvalidatingRepository(repository, { publish: ["settings"] }), storage: createR2ProductMediaStorage(media) });
  } catch (error) { await pool.end().catch(() => undefined); throw error; }
}

export async function resolveDefaultServerStorefrontDesignRuntime(): Promise<ServerStorefrontDesignRuntime | null> {
  initialization ??= initialize().catch(() => null);
  return initialization;
}
