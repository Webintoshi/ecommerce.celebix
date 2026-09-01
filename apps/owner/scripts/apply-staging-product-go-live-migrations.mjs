import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIRECTORY = path.join(SCRIPT_DIRECTORY, "sql", "saas");

const RESTORE_PRODUCT = "saas.catalog_restore_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint)";
const LIST_V2 = "saas.catalog_list_products_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,integer,timestamp with time zone,uuid)";
const LIST_V3 = "saas.catalog_list_products_v3(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,text,text,uuid,uuid,uuid,text,integer,timestamp with time zone,text,uuid)";
const BULK_MUTATE = "saas.catalog_bulk_mutate_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,text,jsonb)";
const REMOVE_PRODUCT = "saas.catalog_remove_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint)";
const MEDIA_RESTORE = "saas.media_restore_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint)";

const MIGRATIONS = Object.freeze([
  Object.freeze({
    code: "114",
    up: "202608250114_catalog_product_lifecycle_authorization.up.sql",
    assertions: "202608250114_catalog_product_lifecycle_authorization_assertions.sql",
    probe: `SELECT
      EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=pg_catalog.to_regclass('saas.product_variants') AND attname='archived_by_product' AND NOT attisdropped)
        OR pg_catalog.to_regprocedure('${RESTORE_PRODUCT}') IS NOT NULL AS has_objects,
      EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=pg_catalog.to_regclass('saas.product_variants') AND attname='archived_by_product' AND NOT attisdropped)
        AND pg_catalog.to_regprocedure('${RESTORE_PRODUCT}') IS NOT NULL
        AND pg_catalog.has_function_privilege('celebix_saas_app',pg_catalog.to_regprocedure('${RESTORE_PRODUCT}'),'EXECUTE') AS ready`,
  }),
  Object.freeze({
    code: "115",
    up: "202608260115_catalog_product_list_projection.up.sql",
    assertions: "202608260115_catalog_product_list_projection_assertions.sql",
    probe: `SELECT
      pg_catalog.to_regprocedure('${LIST_V2}') IS NOT NULL AS has_objects,
      pg_catalog.to_regprocedure('${LIST_V2}') IS NOT NULL
        AND pg_catalog.has_function_privilege('celebix_saas_app',pg_catalog.to_regprocedure('${LIST_V2}'),'EXECUTE') AS ready`,
  }),
  Object.freeze({
    code: "116",
    up: "202608260116_catalog_product_global_query.up.sql",
    assertions: "202608260116_catalog_product_global_query_assertions.sql",
    probe: `SELECT
      pg_catalog.to_regprocedure('${LIST_V3}') IS NOT NULL
        OR pg_catalog.to_regprocedure('saas.catalog_product_search_key(text)') IS NOT NULL
        OR pg_catalog.to_regprocedure('saas.catalog_product_title_sort_key(text)') IS NOT NULL AS has_objects,
      pg_catalog.to_regprocedure('${LIST_V3}') IS NOT NULL
        AND pg_catalog.to_regprocedure('saas.catalog_product_search_key(text)') IS NOT NULL
        AND pg_catalog.to_regprocedure('saas.catalog_product_title_sort_key(text)') IS NOT NULL
        AND pg_catalog.has_function_privilege('celebix_saas_app',pg_catalog.to_regprocedure('${LIST_V3}'),'EXECUTE') AS ready`,
  }),
  Object.freeze({
    code: "117",
    up: "202608300117_catalog_product_bulk_safe_removal.up.sql",
    assertions: "202608300117_catalog_product_bulk_safe_removal_assertions.sql",
    probe: `SELECT
      pg_catalog.to_regprocedure('${BULK_MUTATE}') IS NOT NULL
        OR pg_catalog.to_regprocedure('saas.catalog_product_removal_eligibility(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid)') IS NOT NULL
        OR pg_catalog.to_regprocedure('${REMOVE_PRODUCT}') IS NOT NULL AS has_objects,
      pg_catalog.to_regprocedure('${BULK_MUTATE}') IS NOT NULL
        AND pg_catalog.to_regprocedure('saas.catalog_product_removal_eligibility(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid)') IS NOT NULL
        AND pg_catalog.to_regprocedure('${REMOVE_PRODUCT}') IS NOT NULL
        AND pg_catalog.has_function_privilege('celebix_saas_app',pg_catalog.to_regprocedure('${BULK_MUTATE}'),'EXECUTE') AS ready`,
  }),
  Object.freeze({
    code: "118",
    up: "202608300118_catalog_media_retention_restore.up.sql",
    assertions: "202608300118_catalog_media_retention_restore_assertions.sql",
    probe: `SELECT
      pg_catalog.to_regclass('saas.product_media_cleanup_operations') IS NOT NULL
        OR pg_catalog.to_regprocedure('${MEDIA_RESTORE}') IS NOT NULL
        OR pg_catalog.to_regprocedure('saas.media_list_product_lifecycle(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,boolean)') IS NOT NULL AS has_objects,
      pg_catalog.to_regclass('saas.product_media_cleanup_operations') IS NOT NULL
        AND pg_catalog.to_regprocedure('${MEDIA_RESTORE}') IS NOT NULL
        AND pg_catalog.to_regprocedure('saas.media_list_product_lifecycle(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,boolean)') IS NOT NULL
        AND pg_catalog.has_function_privilege('celebix_saas_app',pg_catalog.to_regprocedure('${MEDIA_RESTORE}'),'EXECUTE') AS ready`,
  }),
  Object.freeze({
    code: "119",
    up: "202609010119_catalog_media_reorder_lifecycle_guard.up.sql",
    assertions: "202609010119_catalog_media_reorder_lifecycle_guard_assertions.sql",
    probe: `SELECT
      pg_catalog.strpos(pg_catalog.regexp_replace(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('saas.guard_product_media_authority()')),'[[:space:]]+','','g'),'OLD.status=''pending''ANDNEW.status=''active''ANDNEW.cleanup_state=''active''ANDNEW.archived_atISNULLANDNEW.retention_expires_atISNULLANDNEW.object_deleted_atISNULL')>0 AS has_objects,
      pg_catalog.strpos(pg_catalog.regexp_replace(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('saas.guard_product_media_authority()')),'[[:space:]]+','','g'),'OLD.status=''pending''ANDNEW.status=''active''ANDNEW.cleanup_state=''active''ANDNEW.archived_atISNULLANDNEW.retention_expires_atISNULLANDNEW.object_deleted_atISNULL')>0
        AND NOT EXISTS(
          SELECT 1 FROM pg_catalog.pg_proc AS procedure
          CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))) AS privilege
          WHERE procedure.oid=pg_catalog.to_regprocedure('saas.guard_product_media_authority()')
            AND privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
        ) AS ready`,
  }),
]);

export function resolveProductGoLiveMigrationConfiguration(source = process.env, now = new Date()) {
  const activationId = source.CELEBIX_STAGING_ACTIVATION_ID?.trim() ?? "";
  if (
    source.CELEBIX_DEPLOYMENT_TIER !== "staging"
    || source.CELEBIX_SAAS_AUTH_MODE !== "approved_staging"
    || source.CELEBIX_STAGING_MIGRATION_MODE !== "approved_staging"
    || !/^staging_[a-z0-9_]{3,80}$/u.test(activationId)
  ) throw new Error("product_go_live_staging_migration_not_approved");

  const databaseUrl = source.CELEBIX_TOSHI_MIGRATION_DATABASE_URL?.trim();
  const databaseName = source.CELEBIX_SAAS_DATABASE_NAME?.trim();
  if (!databaseUrl || !databaseName) throw new Error("product_go_live_staging_database_missing");

  const backupId = source.CELEBIX_STAGING_BACKUP_ID?.trim() ?? "";
  const backupDigest = source.CELEBIX_STAGING_BACKUP_SHA256?.trim() ?? "";
  const backupVerifiedAt = new Date(source.CELEBIX_STAGING_BACKUP_VERIFIED_AT?.trim() ?? "");
  const backupAge = now.getTime() - backupVerifiedAt.getTime();
  if (
    source.CELEBIX_STAGING_BACKUP_RESTORE_STATUS !== "restore_verified"
    || source.CELEBIX_STAGING_BACKUP_DATABASE_NAME !== databaseName
    || source.CELEBIX_STAGING_BACKUP_ACTIVATION_ID !== activationId
    || !/^staging_backup_[a-z0-9_-]{3,100}$/u.test(backupId)
    || !/^[a-f0-9]{64}$/u.test(backupDigest)
    || !Number.isFinite(backupAge)
    || backupAge < -300_000
    || backupAge > 7 * 24 * 60 * 60 * 1_000
  ) throw new Error("product_go_live_staging_backup_unverified");

  let parsed;
  try { parsed = new URL(databaseUrl); } catch { throw new Error("product_go_live_staging_database_invalid"); }
  const urlDatabaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (
    !new Set(["postgres:", "postgresql:"]).has(parsed.protocol)
    || !parsed.hostname
    || databaseName !== urlDatabaseName
    || !databaseName.includes("staging")
  ) throw new Error("product_go_live_staging_database_invalid");
  return Object.freeze({ databaseUrl, databaseName });
}

async function runMigrationQuery(client, sql, migrationCode, phase) {
  try {
    return await client.query(sql);
  } catch {
    throw new Error(`product_go_live_staging_${migrationCode}_${phase}_failed`);
  }
}

export async function runProductGoLiveMigrations({ client, databaseName, readSql, write }) {
  let lockAcquired = false;
  await client.connect();
  try {
    const preflight = await client.query(`SELECT
      current_database() = $1 AS database_matches,
      current_setting('server_version_num')::integer / 10000 = 16 AS postgres_matches,
      current_setting('celebix.deployment_tier', true) = 'isolated_staging' AS tier_matches,
      NOT pg_catalog.pg_is_in_recovery() AS writable_primary,
      current_setting('transaction_read_only') = 'off' AS writable_transaction,
      pg_catalog.pg_has_role(current_user, 'celebix_saas_owner', 'MEMBER') AS owner_member`, [databaseName]);
    const authority = preflight.rowCount === 1 ? preflight.rows[0] : null;
    if (
      authority?.database_matches !== true
      || authority.postgres_matches !== true
      || authority.tier_matches !== true
      || authority.writable_primary !== true
      || authority.writable_transaction !== true
      || authority.owner_member !== true
    ) throw new Error("product_go_live_staging_authority_invalid");

    const lock = await client.query("SELECT pg_catalog.pg_try_advisory_lock(pg_catalog.hashtext('celebix:staging:product-go-live:114-119')) AS acquired");
    lockAcquired = lock.rowCount === 1 && lock.rows[0]?.acquired === true;
    if (!lockAcquired) throw new Error("product_go_live_staging_migration_locked");

    const states = [];
    for (const migration of MIGRATIONS) {
      const probe = await runMigrationQuery(client, migration.probe, migration.code, "probe");
      const state = probe.rowCount === 1 ? probe.rows[0] : null;
      if (state?.has_objects === true && state.ready !== true) {
        throw new Error(`product_go_live_staging_${migration.code}_partial`);
      }
      states.push(Object.freeze({ migration, ready: state?.ready === true }));
    }

    let missingSeen = false;
    for (const state of states) {
      if (!state.ready) missingSeen = true;
      else if (missingSeen) throw new Error(`product_go_live_staging_${state.migration.code}_out_of_order`);
    }

    for (const state of states) {
      if (!state.ready) continue;
      await runMigrationQuery(client, readSql(state.migration.assertions), state.migration.code, "assertions");
    }

    for (const state of states) {
      const { migration } = state;
      if (state.ready) {
        write(`product_go_live_migration_${migration.code}=already_applied`);
        continue;
      }
      if (state?.ready !== true) {
        await runMigrationQuery(client, readSql(migration.up), migration.code, "apply");
      }
      await runMigrationQuery(client, readSql(migration.assertions), migration.code, "assertions");
      write(`product_go_live_migration_${migration.code}=applied`);
    }
  } finally {
    if (lockAcquired) {
      try { await client.query("SELECT pg_catalog.pg_advisory_unlock(pg_catalog.hashtext('celebix:staging:product-go-live:114-119'))"); } catch { /* Session close releases the lock. */ }
    }
    await client.end();
  }
}

async function main() {
  const config = resolveProductGoLiveMigrationConfiguration();
  const { default: pg } = await import("pg");
  const { Client } = pg;
  const client = new Client({
    connectionString: config.databaseUrl,
    application_name: "celebix-staging-product-go-live-migration",
    connectionTimeoutMillis: 10_000,
    statement_timeout: 180_000,
    lock_timeout: 10_000,
    idle_in_transaction_session_timeout: 30_000,
  });
  await runProductGoLiveMigrations({
    client,
    databaseName: config.databaseName,
    readSql: (name) => fs.readFileSync(path.join(SQL_DIRECTORY, name), "utf8"),
    write: (line) => process.stdout.write(`${line}\n`),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof Error && /^product_go_live_staging_[a-z0-9_]+$/u.test(error.message)
      ? error.message
      : "product_go_live_staging_migration_failed";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
