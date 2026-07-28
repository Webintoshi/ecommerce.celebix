import "server-only";

import { randomUUID } from "node:crypto";
import process from "node:process";
import { PostgresCatalogMigrationRepository } from "@celebix/saas-data";
import pg from "pg";

import { CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS, parseCustomerPanelStagingAuthConfig, resolveCustomerPanelStagingAuthMode } from "../panel-auth-authority/config.ts";
import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveDefaultServerMediaRuntime } from "../server-media/default.ts";
import { createProductMediaUploadService } from "../server-media/upload-service.ts";
import { createCatalogMigrationHttpHandlers, type CatalogMigrationHttpRuntime } from "./handler.ts";

const { Pool } = pg;
const TIMEOUTS = Object.freeze({ poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 5_000, idleTransactionMs: 5_000 });
let initialization: Promise<CatalogMigrationHttpRuntime | null> | undefined;

async function initialize(): Promise<CatalogMigrationHttpRuntime | null> {
  if (resolveCustomerPanelStagingAuthMode(process.env) !== "approved_staging") return null;
  const [access, media] = await Promise.all([resolveDefaultServerPanelAccessRuntime(), resolveDefaultServerMediaRuntime()]);
  if (access.readiness.mode !== "approved_staging" || !media || media.access.panelOrigin !== access.panelOrigin) return null;
  const config = parseCustomerPanelStagingAuthConfig(Object.fromEntries(CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS.map((name) => [name, process.env[name]])));
  const pool = new Pool({ connectionString: config.database.url, max: 3, connectionTimeoutMillis: TIMEOUTS.poolCheckoutMs, idleTimeoutMillis: 10_000, statement_timeout: TIMEOUTS.statementMs, lock_timeout: TIMEOUTS.lockMs, idle_in_transaction_session_timeout: TIMEOUTS.idleTransactionMs, application_name: `celebix-panel-catalog-migration-${config.activationId}` });
  pool.on("error", () => undefined);
  try {
    const result = await pool.query(`SELECT
      current_setting('server_version_num')::integer AS version_num,current_database() AS database_name,
      role.rolsuper AS is_superuser,pg_has_role(current_user,'celebix_saas_app','MEMBER') AS app_member,
      to_regclass('saas.catalog_product_migration_jobs') IS NOT NULL
        AND to_regprocedure('saas.catalog_migration_begin(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,text,integer,integer,jsonb,jsonb)') IS NOT NULL
        AND to_regprocedure('saas.catalog_migration_import_batch(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,text,jsonb)') IS NOT NULL
        AND to_regprocedure('saas.catalog_migration_authorize_media(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,integer,text)') IS NOT NULL
        AND to_regprocedure('saas.catalog_migration_record_media(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,text,integer,text,text,uuid,text)') IS NOT NULL AS migration_ready,
      to_regprocedure('saas.catalog_migration_get(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid)') IS NOT NULL
        AND to_regprocedure('saas.catalog_migration_recover_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text)') IS NOT NULL AS migration_complete
      FROM pg_roles AS role WHERE role.rolname=current_user`);
    const row = result.rows[0];
    if (result.rowCount !== 1 || !row || Math.floor(Number(row.version_num) / 10_000) !== 16 || row.database_name !== config.database.name || row.is_superuser !== false || row.app_member !== true || row.migration_ready !== true || row.migration_complete !== true) throw new Error("catalog_migration_database_preflight_failed");
    const migration = new PostgresCatalogMigrationRepository({ pool, role: "celebix_saas_app", timeouts: TIMEOUTS, uuid: randomUUID, audit: () => undefined });
    const upload = createProductMediaUploadService({ repository: media.media, storage: media.storage, now: () => new Date() });
    return Object.freeze({ access: access as CatalogMigrationHttpRuntime["access"], migration, upload });
  } catch (error) { await pool.end().catch(() => undefined); throw error; }
}

async function runtime(): Promise<CatalogMigrationHttpRuntime | null> {
  initialization ??= initialize().catch(() => null);
  return initialization;
}

const handlers = createCatalogMigrationHttpHandlers({ resolveRuntime: runtime, now: () => new Date(), requestId: randomUUID });
export const handleWooCommerceMigrationBegin = handlers.begin;
export const handleWooCommerceMigrationStatus = handlers.status;
export const handleWooCommerceMigrationBatch = handlers.batch;
export const handleWooCommerceMigrationMedia = handlers.media;
