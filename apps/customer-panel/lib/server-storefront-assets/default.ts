import "server-only";
import process from "node:process";
import { PostgresStorefrontAssetRepository } from "@celebix/saas-data";
import pg from "pg";
import { CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS, parseCustomerPanelStagingAuthConfig, resolveCustomerPanelStagingAuthMode } from "../panel-auth-authority/config.ts";
import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { parseStagingProductMediaConfig } from "../server-media/config.ts";
import { createR2ProductMediaStorage } from "../server-media/r2-storage.ts";
import { createServerStorefrontAssetRuntime, type ServerStorefrontAssetRuntime } from "./runtime.ts";

const { Pool } = pg;
const TIMEOUTS = Object.freeze({ poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 5_000, idleTransactionMs: 5_000 });
let initialization: Promise<ServerStorefrontAssetRuntime | null> | undefined;

async function initialize(): Promise<ServerStorefrontAssetRuntime | null> {
  if (resolveCustomerPanelStagingAuthMode(process.env) !== "approved_staging") return null;
  const access = await resolveDefaultServerPanelAccessRuntime(); if (access.readiness.mode !== "approved_staging") return null;
  const auth = parseCustomerPanelStagingAuthConfig(Object.fromEntries(CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS.map((name) => [name, process.env[name]])));
  const mediaConfig = parseStagingProductMediaConfig(process.env);
  const pool = new Pool({ connectionString: auth.database.url, max: 5, connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs, idleTimeoutMillis: 10_000, statement_timeout: TIMEOUTS.statementMs, lock_timeout: TIMEOUTS.lockMs, idle_in_transaction_session_timeout: TIMEOUTS.idleTransactionMs, application_name: `celebix-panel-storefront-assets-${auth.activationId}` });
  pool.on("error", () => undefined);
  try {
    const result = await pool.query(`SELECT current_setting('server_version_num')::integer AS version_num,current_database() AS database_name,role.rolsuper AS is_superuser,pg_has_role(current_user,'celebix_saas_app','MEMBER') AS app_member,to_regclass('saas.storefront_assets') IS NOT NULL AND to_regprocedure('saas.storefront_asset_create(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,text,text,text,text,text,integer,integer,bigint)') IS NOT NULL AS migration_066 FROM pg_roles AS role WHERE role.rolname=current_user`);
    const row = result.rows[0]; if (result.rowCount !== 1 || !row || Math.floor(Number(row.version_num) / 10_000) !== 16 || row.database_name !== auth.database.name || row.is_superuser !== false || row.app_member !== true || row.migration_066 !== true) throw new Error("server_storefront_asset_database_preflight_failed");
    return createServerStorefrontAssetRuntime({ access, assets: new PostgresStorefrontAssetRepository({ pool, role: "celebix_saas_app", timeouts: TIMEOUTS, audit: () => undefined }), storage: createR2ProductMediaStorage(mediaConfig) });
  } catch (error) { await pool.end().catch(() => undefined); throw error; }
}

export async function resolveDefaultServerStorefrontAssetRuntime(): Promise<ServerStorefrontAssetRuntime | null> {
  initialization ??= initialize().catch(() => null);
  return initialization;
}
