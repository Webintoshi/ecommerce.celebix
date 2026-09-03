import "server-only";
import process from "node:process";
import { PostgresProductMediaRepository } from "@celebix/saas-data";
import pg from "pg";
import { CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS, parseCustomerPanelStagingAuthConfig, resolveCustomerPanelStagingAuthMode } from "../panel-auth-authority/config.ts";
import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { parseStagingProductMediaConfig } from "./config.ts";
import { createR2ProductMediaStorage } from "./r2-storage.ts";
import { createServerMediaRuntime, type ServerMediaRuntime } from "./runtime.ts";
import { createPostCommitInvalidatingRepository } from "../server-cache/invalidation.ts";

const { Pool } = pg;
const TIMEOUTS = Object.freeze({ poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 5_000, idleTransactionMs: 5_000 });
let initialization: Promise<ServerMediaRuntime | null> | undefined;

async function initialize(): Promise<ServerMediaRuntime | null> {
  if (resolveCustomerPanelStagingAuthMode(process.env) !== "approved_staging") return null;
  const access = await resolveDefaultServerPanelAccessRuntime(); if (access.readiness.mode !== "approved_staging") return null;
  const auth = parseCustomerPanelStagingAuthConfig(Object.fromEntries(CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS.map((name) => [name, process.env[name]])));
  const mediaConfig = parseStagingProductMediaConfig(process.env);
  const pool = new Pool({ connectionString: auth.database.url, max: 5, connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs, idleTimeoutMillis: 10_000, statement_timeout: TIMEOUTS.statementMs, lock_timeout: TIMEOUTS.lockMs, idle_in_transaction_session_timeout: TIMEOUTS.idleTransactionMs, application_name: `celebix-panel-media-${auth.activationId}` });
  pool.on("error", () => undefined);
  try {
    const result = await pool.query(`SELECT current_setting('server_version_num')::integer AS version_num,current_database() AS database_name,role.rolsuper AS is_superuser,pg_has_role(current_user,'celebix_saas_app','MEMBER') AS app_member,to_regclass('saas.product_media') IS NOT NULL AND to_regclass('saas.store_domains') IS NOT NULL AND to_regclass('saas.store_media_operations') IS NOT NULL AND to_regprocedure('saas.media_reserve_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,uuid,text,text,text,text,integer,integer,bigint,text)') IS NOT NULL AS media_ready FROM pg_roles AS role WHERE role.rolname=current_user`);
    const row = result.rows[0]; if (result.rowCount !== 1 || !row || Math.floor(Number(row.version_num) / 10_000) !== 16 || row.database_name !== auth.database.name || row.is_superuser !== false || row.app_member !== true || row.media_ready !== true) throw new Error("server_media_database_preflight_failed");
    const media = new PostgresProductMediaRepository({ pool, role: "celebix_saas_app", mediaOrigin: mediaConfig.publicOrigin, timeouts: TIMEOUTS, audit: () => undefined });
    return createServerMediaRuntime({ access, media: createPostCommitInvalidatingRepository(media, {
      reserveProductMedia: ["catalog"], markProductMediaUploaded: ["catalog"], finalizeProductMedia: ["catalog"],
      recoverProductMediaOperation: ["catalog"], requireProductMediaCleanup: ["catalog"], markProductMediaDeleted: ["catalog"],
      updateAltText: ["catalog"], reorderMedia: ["catalog"], reserveArchiveMedia: ["catalog"], finalizeArchiveMedia: ["catalog"],
      recoverArchiveMedia: ["catalog"], restoreProductMedia: ["catalog"], recordArchivedProductMediaObjectDeleted: ["catalog"], markArchivedProductMediaObjectDeleted: ["catalog"],
    }), storage: createR2ProductMediaStorage(mediaConfig) });
  } catch (error) { await pool.end().catch(() => undefined); throw error; }
}

export async function resolveDefaultServerMediaRuntime(): Promise<ServerMediaRuntime | null> {
  initialization ??= initialize().catch(() => null);
  return initialization;
}
