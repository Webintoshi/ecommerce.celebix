import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  REQUIRED_NATIVE_TOOLS,
  assertSafeEnvironment,
} from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SQL = path.join(ROOT, "apps", "owner", "scripts", "sql", "saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const TOKEN = randomBytes(6).toString("hex");
const DATABASE = `order_management_${TOKEN}`;
const RESTORE_DATABASE = `${DATABASE}_restore`;
const ROLLBACK_DATABASE = `${DATABASE}_rollback`;
const TOTAL = 18;
const completed = [];
const NOW = "2026-07-21T10:00:00.000Z";
const PLAN = "00000000-0000-4000-8000-000000000001";
const STORE_A = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const ORDER_A = "40000000-0000-4000-8000-000000000001";
const EVENT_A = "50000000-0000-4000-8000-000000000001";
const OPERATION_A = "60000000-0000-4000-8000-000000000001";
const AUTHORITY_SIGNATURE = "saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text)";
const TABLES = ["orders", "order_items", "order_events", "order_notes", "order_operations"];
const migrations = [
  "202607110001_roles.up.sql",
  "202607110002_foundation.up.sql",
  "202607110003_free_starter.seed.sql",
  "202607110003_plan_versions.freeze.sql",
  "202607110004_grants.sql",
  "202607110005_catalog_assertions.sql",
  "202607110007_identity_roles.up.sql",
  "202607110008_identity_persistence.up.sql",
  "202607110009_identity_grants.sql",
  "202607110010_identity_catalog_assertions.sql",
  "202607120012_verified_identity_snapshot.up.sql",
  "202607120013_verified_identity_grants.sql",
  "202607120014_verified_identity_catalog_assertions.sql",
  "202607140015_panel_sessions.up.sql",
  "202607140016_panel_session_handoffs.up.sql",
  "202607140017_panel_browser_bindings.up.sql",
  "202607160018_product_catalog.up.sql",
  "202607160018_product_catalog_assertions.sql",
  "202607160019_product_catalog_api.up.sql",
  "202607160019_product_catalog_api_assertions.sql",
  "202607160020_pilot_storefront_media_domains.up.sql",
  "202607160020_pilot_storefront_media_domains_assertions.sql",
  "202607200021_catalog_dashboard_summary.up.sql",
  "202607200021_catalog_dashboard_summary_assertions.sql",
  "202607210022_order_management.up.sql",
  "202607210022_order_management_assertions.sql",
];

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue through isolated native and PATH candidates.
    }
  }
  return null;
}

function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    encoding: options.binary ? null : "utf8",
    input: options.input,
    env: { PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`disposable command failed: ${path.basename(program)}\n${String(result.stderr ?? "").trim()}`);
  }
  return result;
}

function startPostgres() {
  assertSafeEnvironment();
  const executables = Object.fromEntries(REQUIRED_NATIVE_TOOLS.map((name) => [name, executable(name)]));
  if (Object.values(executables).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "celebix-order-management-"));
  const socketDirectory = path.join("/tmp", `com-${TOKEN}`);
  const dataDirectory = path.join(temporaryDirectory, "data");
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  mkdirSync(socketDirectory, { mode: 0o700 });
  command(executables.initdb, ["-D", dataDirectory, "--auth=trust", "--username=postgres", "--no-locale"]);
  command(executables.pg_ctl, [
    "-D", dataDirectory,
    "-o", `-k ${socketDirectory} -p ${port} -h ''`,
    "-l", path.join(temporaryDirectory, "postgres.log"),
    "start",
  ]);
  return { executables, temporaryDirectory, socketDirectory, dataDirectory, port, started: true };
}

function stopPostgres(backend) {
  if (!backend) return;
  if (backend.started) {
    command(backend.executables.pg_ctl, ["-D", backend.dataDirectory, "-m", "fast", "stop"], { allowFailure: true });
    backend.started = false;
  }
  rmSync(backend.socketDirectory, { recursive: true, force: true });
  rmSync(backend.temporaryDirectory, { recursive: true, force: true });
}

function psqlResult(backend, source, database = DATABASE, options = {}) {
  return command(backend.executables.psql, [
    "-h", backend.socketDirectory, "-p", String(backend.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], { input: source, allowFailure: options.allowFailure });
}

function psql(backend, source, database = DATABASE, options = {}) {
  return psqlResult(backend, source, database, options).stdout.trim();
}

function apply(backend, file, database = DATABASE) {
  psql(backend, readFileSync(path.join(SQL, file), "utf8"), database);
}

function createDatabase(backend, database, template) {
  psql(backend, `CREATE DATABASE ${database}${template ? ` TEMPLATE ${template}` : ""};`, "postgres");
}

async function scenario(name, run) {
  await run();
  completed.push(name);
  process.stdout.write(`PASS ${completed.length}/${TOTAL} ${name}\n`);
}

function authoritySql({
  store = STORE_A,
  principal = "20000000-0000-4000-8000-000000000001",
  membership = "30000000-0000-4000-8000-000000000001",
  feature = "orders",
  action = "orders.read",
  now = NOW,
} = {}, database = DATABASE) {
  return `SELECT COALESCE(saas.merchant_action_authority_error('${store}'::uuid,'${principal}'::uuid,'${membership}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${now}'::timestamptz,'${feature}','${action}'),'<null>');`;
}

function authority(backend, options = {}, database = DATABASE) {
  return psql(backend, authoritySql(options, database), database);
}

function denied(backend, source, database = DATABASE) {
  const result = psqlResult(backend, source, database, { allowFailure: true });
  assert.notEqual(result.status, 0, "statement unexpectedly succeeded");
  return result;
}

function seed(backend, database = DATABASE) {
  psql(backend, `
    BEGIN;
    SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
      ('20000000-0000-4000-8000-000000000001','https://identity.example.test/oidc','orders-owner','owner@example.test',true,'2026-01-01','2026-01-01'),
      ('20000000-0000-4000-8000-000000000002','https://identity.example.test/oidc','orders-admin','admin@example.test',true,'2026-01-01','2026-01-01'),
      ('20000000-0000-4000-8000-000000000003','https://identity.example.test/oidc','orders-editor','editor@example.test',true,'2026-01-01','2026-01-01'),
      ('20000000-0000-4000-8000-000000000004','https://identity.example.test/oidc','orders-analyst','analyst@example.test',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
      ('${STORE_A}','Orders Store A','orders-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
      ('${STORE_B}','Orders Store B','orders-b','active','tr','TRY','default','2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
      ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','${STORE_A}','store_owner','active','2026-01-01','2026-01-01'),
      ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','${STORE_A}','admin','active','2026-01-01','2026-01-01'),
      ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','${STORE_A}','editor','active','2026-01-01','2026-01-01'),
      ('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004','${STORE_A}','analyst','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at) VALUES
      ('70000000-0000-4000-8000-000000000001','${STORE_A}','${PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01'),
      ('70000000-0000-4000-8000-000000000002','${STORE_B}','${PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01');
    INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at)
    VALUES ('${ORDER_A}','${STORE_A}','ORD-0001','storefront','Ada Lovelace','ada@example.test','TRY',10000,500,500,10000,'pending','pending','{"recipientName":"Ada Lovelace","line1":"Test 1","city":"Istanbul","country":"TR"}',1,'2026-07-21','2026-07-21');
    INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,from_value,to_value,message,payload,created_at)
    VALUES ('${EVENT_A}','${STORE_A}','${ORDER_A}','30000000-0000-4000-8000-000000000001','order_created',NULL,'pending','Order created','{}','2026-07-21');
    INSERT INTO saas.order_operations(operation_id,store_id,order_id,operation_kind,payload_fingerprint,result_payload,committed_at)
    VALUES ('${OPERATION_A}','${STORE_A}','${ORDER_A}','transition_status',repeat('a',64),'{"outcome":"committed","version":1}','2026-07-21');
    COMMIT;
  `, database);
}

async function main() {
  let backend = startPostgres();
  let cleanupPaths;
  try {
    createDatabase(backend, DATABASE);
    for (const migration of migrations) apply(backend, migration);

    await scenario("PostgreSQL 16 applies migrations 001-022 and assertions", async () => {
      assert.match(psql(backend, "SHOW server_version;"), /^16\./);
      assert.equal(psql(backend, `SELECT to_regprocedure('${AUTHORITY_SIGNATURE}')::text;`), AUTHORITY_SIGNATURE);
    });

    await scenario("manifest binds exact 022 artifact bytes", async () => {
      const manifest = JSON.parse(readFileSync(path.join(SQL, "phase3b1-order-management-manifest.json"), "utf8"));
      assert.equal(manifest.postgresqlMajor, 16);
      assert.deepEqual(manifest.artifacts.map((artifact) => artifact.file), [
        "202607210022_order_management.up.sql",
        "202607210022_order_management.down.sql",
        "202607210022_order_management_assertions.sql",
      ]);
      for (const artifact of manifest.artifacts) {
        assert.equal(artifact.sha256, createHash("sha256").update(readFileSync(path.join(SQL, artifact.file))).digest("hex"));
      }
    });

    await scenario("all order tables are owner-owned with forced RLS", async () => {
      assert.equal(psql(backend, `SELECT count(*) FROM pg_class AS relation JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace JOIN pg_roles AS owner ON owner.oid=relation.relowner WHERE namespace.nspname='saas' AND relation.relname=ANY(ARRAY['${TABLES.join("','")}']) AND relation.relkind='r' AND owner.rolname='celebix_saas_owner' AND relation.relrowsecurity AND relation.relforcerowsecurity;`), "5");
    });

    await scenario("orders and items expose exact columns and constraints", async () => {
      assert.equal(psql(backend, `SELECT string_agg(column_name||':'||data_type||':'||is_nullable||':'||COALESCE(column_default,''),',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='saas' AND table_name='orders';`), "id:uuid:NO:,store_id:uuid:NO:,order_number:text:NO:,source:text:NO:,customer_name:text:NO:,customer_email:text:NO:,customer_phone:text:YES:,currency:text:NO:,subtotal_cents:bigint:NO:,shipping_cents:bigint:NO:,discount_cents:bigint:NO:,total_cents:bigint:NO:,status:text:NO:,payment_status:text:NO:,shipping_address:jsonb:NO:,tracking:jsonb:YES:,version:bigint:NO:1,created_at:timestamp with time zone:NO:,updated_at:timestamp with time zone:NO:");
      assert.equal(psql(backend, `SELECT string_agg(column_name||':'||data_type||':'||is_nullable,',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='saas' AND table_name='order_items';`), "id:uuid:NO,store_id:uuid:NO,order_id:uuid:NO,product_id:uuid:YES,variant_id:uuid:YES,position:integer:NO,product_name:text:NO,variant_name:text:YES,sku:text:YES,unit_price_cents:bigint:NO,quantity:integer:NO,discount_cents:bigint:NO,line_total_cents:bigint:NO,created_at:timestamp with time zone:NO");
      const constraintDefinitions = psql(backend, `SELECT string_agg(pg_get_constraintdef(oid),' ') FROM pg_constraint WHERE conrelid IN ('saas.orders'::regclass,'saas.order_items'::regclass) AND contype='c';`);
      for (const fragment of ["source = ANY", "currency ~", "subtotal_cents >= 0", "total_cents =", "version > 0", "\"position\" >= 0", "\"position\" <= 99", "quantity >= 1", "quantity <= 9999", "line_total_cents ="]) {
        assert.equal(constraintDefinitions.includes(fragment), true, `missing normalized constraint fragment: ${fragment}`);
      }
    });

    seed(backend);

    await scenario("child rows enforce composite store authority", async () => {
      for (const statement of [
        `INSERT INTO saas.order_items(id,store_id,order_id,position,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at) VALUES ('80000000-0000-4000-8000-000000000001','${STORE_B}','${ORDER_A}',0,'Cross',1,1,0,1,'${NOW}')`,
        `INSERT INTO saas.order_events(id,store_id,order_id,event_type,message,payload,created_at) VALUES ('80000000-0000-4000-8000-000000000002','${STORE_B}','${ORDER_A}','order_created','Cross','{}','${NOW}')`,
        `INSERT INTO saas.order_notes(id,store_id,order_id,author_membership_id,body,created_at,updated_at) VALUES ('80000000-0000-4000-8000-000000000003','${STORE_B}','${ORDER_A}','30000000-0000-4000-8000-000000000001','Cross','${NOW}','${NOW}')`,
        `INSERT INTO saas.order_operations(operation_id,store_id,order_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES ('80000000-0000-4000-8000-000000000004','${STORE_B}','${ORDER_A}','transition_status',repeat('b',64),'{}','${NOW}')`,
      ]) denied(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; ${statement}; COMMIT;`);
    });

    await scenario("database role-action matrix matches the immutable contract", async () => {
      const roles = [
        ["20000000-0000-4000-8000-000000000001", "30000000-0000-4000-8000-000000000001", { "orders.read": true, "orders.manage": true, "orders.fulfill": true, "orders.payment": true, "orders.note": true }],
        ["20000000-0000-4000-8000-000000000002", "30000000-0000-4000-8000-000000000002", { "orders.read": true, "orders.manage": true, "orders.fulfill": true, "orders.payment": true, "orders.note": true }],
        ["20000000-0000-4000-8000-000000000003", "30000000-0000-4000-8000-000000000003", { "orders.read": true, "orders.manage": false, "orders.fulfill": true, "orders.payment": false, "orders.note": true }],
        ["20000000-0000-4000-8000-000000000004", "30000000-0000-4000-8000-000000000004", { "orders.read": true, "orders.manage": false, "orders.fulfill": false, "orders.payment": false, "orders.note": false }],
      ];
      for (const [principal, membership, actions] of roles) {
        for (const [action, allowed] of Object.entries(actions)) {
          assert.equal(authority(backend, { principal, membership, action }), allowed ? "<null>" : "membership_denied");
        }
      }
      assert.equal(authority(backend, { action: "orders.unknown" }), "durable_authority_invalid");
    });

    await scenario("inactive membership is denied", async () => {
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.memberships SET status='revoked',updated_at='${NOW}' WHERE id='30000000-0000-4000-8000-000000000001'; COMMIT;`);
      assert.equal(authority(backend), "membership_denied");
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.memberships SET status='active',updated_at='${NOW}' WHERE id='30000000-0000-4000-8000-000000000001'; COMMIT;`);
    });

    await scenario("wrong store authority is denied", async () => {
      assert.equal(authority(backend, { store: STORE_B }), "membership_denied");
    });

    await scenario("missing or disabled feature is denied", async () => {
      assert.equal(authority(backend, { feature: "custom_domains" }), "feature_not_enabled");
      assert.equal(authority(backend, { feature: "not_registered" }), "feature_not_enabled");
    });

    await scenario("expired subscription is denied", async () => {
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.subscriptions SET valid_until='2026-07-20',updated_at='${NOW}' WHERE store_id='${STORE_A}'; COMMIT;`);
      assert.equal(authority(backend), "durable_authority_invalid");
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.subscriptions SET valid_until=NULL,updated_at='${NOW}' WHERE store_id='${STORE_A}'; COMMIT;`);
    });

    await scenario("app role has no direct order table DML", async () => {
      for (const table of TABLES) {
        assert.equal(psql(backend, `SELECT has_table_privilege('celebix_saas_app','saas.${table}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');`), "f");
      }
      denied(backend, "BEGIN; SET LOCAL ROLE celebix_saas_app; SELECT count(*) FROM saas.orders; COMMIT;");
    });

    await scenario("PUBLIC ACL is empty on every 022 table and function", async () => {
      assert.equal(psql(backend, `SELECT count(*) FROM pg_class AS relation, LATERAL aclexplode(COALESCE(relation.relacl,acldefault('r',relation.relowner))) AS privilege WHERE relation.oid=ANY(ARRAY[${TABLES.map((table) => `'saas.${table}'::regclass`).join(",")}]) AND privilege.grantee=0;`), "0");
      assert.equal(psql(backend, `SELECT count(*) FROM pg_proc AS procedure JOIN pg_namespace AS namespace ON namespace.oid=procedure.pronamespace, LATERAL aclexplode(COALESCE(procedure.proacl,acldefault('f',procedure.proowner))) AS privilege WHERE namespace.nspname='saas' AND procedure.proname IN ('merchant_action_authority_error','guard_order_event_mutation','guard_order_operation_mutation') AND privilege.grantee=0;`), "0");
    });

    await scenario("event payloads are immutable", async () => {
      denied(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.order_events SET payload='{"changed":true}' WHERE id='${EVENT_A}'; COMMIT;`);
      denied(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; DELETE FROM saas.order_events WHERE id='${EVENT_A}'; COMMIT;`);
      assert.equal(psql(backend, `SELECT payload::text FROM saas.order_events WHERE id='${EVENT_A}';`), "{}");
    });

    await scenario("operation fingerprints and results are immutable", async () => {
      denied(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.order_operations SET payload_fingerprint=repeat('b',64) WHERE operation_id='${OPERATION_A}'; COMMIT;`);
      denied(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.order_operations SET result_payload='{}' WHERE operation_id='${OPERATION_A}'; COMMIT;`);
      denied(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; DELETE FROM saas.order_operations WHERE operation_id='${OPERATION_A}'; COMMIT;`);
      assert.equal(psql(backend, `SELECT payload_fingerprint||':'||(result_payload->>'outcome') FROM saas.order_operations WHERE operation_id='${OPERATION_A}';`), `${"a".repeat(64)}:committed`);
    });

    createDatabase(backend, ROLLBACK_DATABASE, DATABASE);
    apply(backend, "202607210022_order_management.down.sql", ROLLBACK_DATABASE);
    await scenario("disposable rollback removes only 022 objects", async () => {
      assert.equal(psql(backend, `SELECT count(*) FROM pg_class AS relation JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='saas' AND relation.relname=ANY(ARRAY['${TABLES.join("','")}']);`, ROLLBACK_DATABASE), "0");
      assert.equal(psql(backend, `SELECT to_regprocedure('${AUTHORITY_SIGNATURE}') IS NULL;`, ROLLBACK_DATABASE), "t");
      assert.equal(psql(backend, "SELECT to_regclass('saas.products')::text||':'||to_regprocedure('saas.catalog_get_dashboard_summary(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone)')::text;", ROLLBACK_DATABASE), "saas.products:saas.catalog_get_dashboard_summary(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone)");
    });

    apply(backend, "202607210022_order_management.up.sql", ROLLBACK_DATABASE);
    apply(backend, "202607210022_order_management_assertions.sql", ROLLBACK_DATABASE);
    await scenario("reapply restores exact 022 authority", async () => {
      assert.equal(authority(backend, {}, ROLLBACK_DATABASE), "<null>");
      assert.equal(psql(backend, `SELECT count(*) FROM pg_class AS relation JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='saas' AND relation.relname=ANY(ARRAY['${TABLES.join("','")}']);`, ROLLBACK_DATABASE), "5");
    });

    const dump = path.join(backend.temporaryDirectory, "order-management.dump");
    command(backend.executables.pg_dump, ["-h", backend.socketDirectory, "-p", String(backend.port), "-U", "postgres", "-Fc", "-f", dump, DATABASE]);
    createDatabase(backend, RESTORE_DATABASE);
    command(backend.executables.pg_restore, ["-h", backend.socketDirectory, "-p", String(backend.port), "-U", "postgres", "-d", RESTORE_DATABASE, dump]);
    await scenario("backup restore preserves schema data authority and assertions", async () => {
      apply(backend, "202607210022_order_management_assertions.sql", RESTORE_DATABASE);
      assert.equal(authority(backend, {}, RESTORE_DATABASE), "<null>");
      assert.equal(psql(backend, `SELECT count(*) FROM saas.orders WHERE id='${ORDER_A}';`, RESTORE_DATABASE), "1");
      denied(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; DELETE FROM saas.order_events WHERE id='${EVENT_A}'; COMMIT;`, RESTORE_DATABASE);
    });

    assert.equal(completed.length, TOTAL - 1);
    cleanupPaths = { temporaryDirectory: backend.temporaryDirectory, socketDirectory: backend.socketDirectory };
    stopPostgres(backend);
    backend = undefined;
    await scenario("disposable PostgreSQL cluster and socket are cleaned up", async () => {
      assert.equal(existsSync(cleanupPaths.temporaryDirectory), false);
      assert.equal(existsSync(cleanupPaths.socketDirectory), false);
    });
    assert.equal(completed.length, TOTAL);
    process.stdout.write(`PASS ${TOTAL}/${TOTAL} order management PostgreSQL 16 harness complete; cleanup confirmed\n`);
  } finally {
    stopPostgres(backend);
  }
}

await main();
