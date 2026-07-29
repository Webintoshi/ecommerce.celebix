import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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
const TOTAL = 40;
const completed = [];
const NOW = "2026-07-21T10:00:00.000Z";
const PLAN = "00000000-0000-4000-8000-000000000001";
const STORE_A = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const ORDER_A = "40000000-0000-4000-8000-000000000001";
const ORDER_B = "40000000-0000-4000-8000-000000000002";
const ORDER_C = "40000000-0000-4000-8000-000000000003";
const ORDER_D = "40000000-0000-4000-8000-000000000004";
const ORDER_OTHER = "40000000-0000-4000-8000-000000000005";
const PRODUCT_A = "41000000-0000-4000-8000-000000000001";
const PRODUCT_B = "41000000-0000-4000-8000-000000000002";
const VARIANT_A = "42000000-0000-4000-8000-000000000001";
const VARIANT_B = "42000000-0000-4000-8000-000000000002";
const EVENT_A = "50000000-0000-4000-8000-000000000001";
const OPERATION_A = "60000000-0000-4000-8000-000000000001";
const AUTHORITY_SIGNATURE = "saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text)";
const API_SIGNATURES = [
  "saas.orders_get_dashboard_summary(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)",
  "saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)",
  "saas.orders_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)",
  "saas.orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)",
  "saas.orders_transition_payment(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)",
  "saas.orders_update_shipping(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb,jsonb)",
  "saas.orders_add_note(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,text)",
  "saas.orders_archive_note(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid)",
  "saas.orders_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)",
];
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
  "202607210023_order_management_api.up.sql",
  "202607210023_order_management_api_assertions.sql",
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

function commandAsync(program, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd: ROOT,
      env: { PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => {
      if (!options.allowFailure && status !== 0) {
        reject(new Error(`disposable command failed: ${path.basename(program)}\n${stderr.trim()}`));
        return;
      }
      resolve({ status, stdout, stderr });
    });
    child.stdin.end(options.input);
  });
}

function startPostgres(options = {}) {
  assertSafeEnvironment();
  const executables = Object.fromEntries(REQUIRED_NATIVE_TOOLS.map((name) => [name, executable(name)]));
  if (Object.values(executables).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const runCommand = options.runCommand ?? command;
  const runToken = options.token ?? TOKEN;
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "celebix-order-management-"));
  const socketDirectory = path.join("/tmp", `com-${runToken}`);
  const dataDirectory = path.join(temporaryDirectory, "data");
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  mkdirSync(socketDirectory, { mode: 0o700 });
  const backend = { executables, temporaryDirectory, socketDirectory, dataDirectory, port, started: false };
  options.onAllocate?.(backend);
  try {
    runCommand(executables.initdb, ["-D", dataDirectory, "--auth=trust", "--username=postgres", "--no-locale"]);
    backend.started = true;
    runCommand(executables.pg_ctl, [
      "-D", dataDirectory,
      "-o", `-k ${socketDirectory} -p ${port} -h ''`,
      "-l", path.join(temporaryDirectory, "postgres.log"),
      "start",
    ]);
    return backend;
  } catch (error) {
    stopPostgres(backend);
    throw error;
  }
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
  plan = PLAN,
  planCode = "free_starter",
  planVersion = 1,
  feature = "orders",
  action = "orders.read",
  now = NOW,
} = {}, database = DATABASE) {
  return `SELECT COALESCE(saas.merchant_action_authority_error('${store}'::uuid,'${principal}'::uuid,'${membership}'::uuid,'${plan}'::uuid,'${planCode}',${planVersion},'${now}'::timestamptz,'${feature}','${action}'),'<null>');`;
}

function authority(backend, options = {}, database = DATABASE) {
  return psql(backend, authoritySql(options, database), database);
}

function authorityArguments({
  store = STORE_A,
  principal = "20000000-0000-4000-8000-000000000001",
  membership = "30000000-0000-4000-8000-000000000001",
  plan = PLAN,
  planCode = "free_starter",
  planVersion = 1,
  now = NOW,
} = {}) {
  return `'${store}'::uuid,'${principal}'::uuid,'${membership}'::uuid,'${plan}'::uuid,'${planCode}',${planVersion},'${now}'::timestamptz`;
}

function apiSql(functionName, extraArguments = "", authorityOptions = {}) {
  const separator = extraArguments.length > 0 ? "," : "";
  return `SET ROLE celebix_saas_app; SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)::text FROM saas.${functionName}(${authorityArguments(authorityOptions)}${separator}${extraArguments});`;
}

function api(backend, functionName, extraArguments = "", authorityOptions = {}, database = DATABASE) {
  return JSON.parse(psql(backend, apiSql(functionName, extraArguments, authorityOptions), database));
}

function orderListArguments({
  status = "NULL",
  search = "NULL",
  sort = "newest",
  pageSize = 100,
  cursor,
} = {}) {
  const position = cursor === undefined
    ? "NULL,NULL,NULL"
    : `${cursor.totalCents},'${cursor.createdAt}'::timestamptz,'${cursor.id}'::uuid`;
  return `${status},${search},'${sort}',${pageSize},${position}`;
}

async function apiAsync(backend, functionName, extraArguments = "", authorityOptions = {}, database = DATABASE) {
  const result = await commandAsync(backend.executables.psql, [
    "-h", backend.socketDirectory, "-p", String(backend.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], { input: apiSql(functionName, extraArguments, authorityOptions) });
  return JSON.parse(result.stdout.trim());
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
      ('20000000-0000-4000-8000-000000000004','https://identity.example.test/oidc','orders-analyst','analyst@example.test',true,'2026-01-01','2026-01-01'),
      ('20000000-0000-4000-8000-000000000005','https://identity.example.test/oidc','orders-other-store','other@example.test',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
      ('${STORE_A}','Orders Store A','orders-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
      ('${STORE_B}','Orders Store B','orders-b','active','tr','TRY','default','2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
      ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','${STORE_A}','store_owner','active','2026-01-01','2026-01-01'),
      ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','${STORE_A}','admin','active','2026-01-01','2026-01-01'),
      ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','${STORE_A}','editor','active','2026-01-01','2026-01-01'),
      ('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004','${STORE_A}','analyst','active','2026-01-01','2026-01-01'),
      ('30000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000005','${STORE_B}','store_owner','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at) VALUES
      ('70000000-0000-4000-8000-000000000001','${STORE_A}','${PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01'),
      ('70000000-0000-4000-8000-000000000002','${STORE_B}','${PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01');
    INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES
      ('${PRODUCT_A}','${STORE_A}','order-product-a','Order Product A','active','TRY',1,'2026-01-01','2026-01-01'),
      ('${PRODUCT_B}','${STORE_B}','order-product-b','Order Product B','active','TRY',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES
      ('${VARIANT_A}','${PRODUCT_A}','${STORE_A}','Default',10000,false,0,'active','{}',1,'2026-01-01','2026-01-01'),
      ('${VARIANT_B}','${PRODUCT_B}','${STORE_B}','Default',10000,false,0,'active','{}',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at)
    VALUES ('${ORDER_A}','${STORE_A}','ORD-0001','storefront','Ada Lovelace','ada@example.test','TRY',10000,500,500,10000,'pending','pending','{"recipientName":"Ada Lovelace","line1":"Test 1","city":"Istanbul","country":"TR"}',1,'2026-07-21','2026-07-21');
    INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,from_value,to_value,message,payload,created_at)
    VALUES ('${EVENT_A}','${STORE_A}','${ORDER_A}','30000000-0000-4000-8000-000000000001','order_created',NULL,'pending','Order created','{}','2026-07-21');
    INSERT INTO saas.order_operations(operation_id,store_id,order_id,operation_kind,payload_fingerprint,result_payload,committed_at)
    VALUES ('${OPERATION_A}','${STORE_A}','${ORDER_A}','transition_status',repeat('a',64),'{"outcome":"committed","version":1}','2026-07-21');
    COMMIT;
  `, database);
}

function seedApi(backend, database = DATABASE) {
  psql(backend, `
    BEGIN;
    SET LOCAL ROLE celebix_saas_owner;
    DELETE FROM saas.orders WHERE order_number='constraint-fixture' AND store_id='${STORE_A}';
    UPDATE saas.orders SET shipping_address=shipping_address||'{"storeId":"${STORE_A}","principal_id":"20000000-0000-4000-8000-000000000001"}'::jsonb,created_at='2026-07-21 09:00:00.000800+00',updated_at='2026-07-21 09:00:00.000800+00' WHERE id='${ORDER_A}';
    INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at) VALUES
      ('${ORDER_B}','${STORE_A}','ORD-0002','quick_link','Alan Turing','alan@example.test','+905551110002','TRY',10000,0,0,10000,'confirmed','completed','{"recipientName":"Alan Turing","line1":"Test 2","district":"Kadikoy","city":"Istanbul","postalCode":"34710","country":"TR"}',1,'2026-07-21 09:00:00.000800+00','2026-07-21 09:00:00.000800+00'),
      ('${ORDER_C}','${STORE_A}','VIP-0003','marketplace','Grace Hopper','grace@example.test',NULL,'TRY',30000,0,0,30000,'delivered','completed','{"recipientName":"Grace Hopper","line1":"Test 3","city":"Ankara","country":"TR"}',1,'2026-07-21 09:00:00.000700+00','2026-07-21 09:00:00.000700+00'),
      ('${ORDER_D}','${STORE_A}','ORD-0004','manual_import','Margaret Hamilton','margaret@example.test',NULL,'TRY',40000,0,0,40000,'cancelled','failed','{"recipientName":"Margaret Hamilton","line1":"Test 4","city":"Izmir","country":"TR"}',1,'2026-07-19 09:00:00+00','2026-07-19 09:00:00+00'),
      ('${ORDER_OTHER}','${STORE_B}','OTHER-0001','storefront','Other Customer','other-customer@example.test',NULL,'TRY',90000,0,0,90000,'delivered','completed','{"recipientName":"Other Customer","line1":"Other 1","city":"Bursa","country":"TR"}',1,'2026-07-22 09:00:00+00','2026-07-22 09:00:00+00');
    INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at) VALUES
      ('43000000-0000-4000-8000-000000000001','${STORE_A}','${ORDER_A}','${PRODUCT_A}','${VARIANT_A}',0,'Atlas Mug','Default','ATLAS-A',10000,1,0,10000,'2026-07-21'),
      ('43000000-0000-4000-8000-000000000002','${STORE_A}','${ORDER_B}','${PRODUCT_A}','${VARIANT_A}',0,'Atlas Mug','Default','ATLAS-A',10000,1,0,10000,'2026-07-21 09:00:00+00'),
      ('43000000-0000-4000-8000-000000000003','${STORE_A}','${ORDER_C}','${PRODUCT_A}','${VARIANT_A}',0,'Atlas Mug','Default','ATLAS-A',10000,3,0,30000,'2026-07-21 09:00:00+00');
    INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,from_value,to_value,message,payload,created_at) VALUES
      ('50000000-0000-4000-8000-000000000002','${STORE_A}','${ORDER_B}','30000000-0000-4000-8000-000000000001','order_created',NULL,'confirmed','Order imported','{}','2026-07-21 09:00:00+00'),
      ('50000000-0000-4000-8000-000000000003','${STORE_A}','${ORDER_C}','30000000-0000-4000-8000-000000000001','order_created',NULL,'delivered','Order delivered','{}','2026-07-21 09:00:00+00');
    INSERT INTO saas.order_notes(id,store_id,order_id,author_membership_id,body,created_at,updated_at)
    SELECT pg_catalog.md5('mature-order-note:'||ordinal::text)::uuid,'${STORE_A}','${ORDER_C}','30000000-0000-4000-8000-000000000001',pg_catalog.repeat('x',2000),'2026-07-21 09:00:00+00'::timestamptz+ordinal*interval '1 microsecond','2026-07-21 09:00:00+00'::timestamptz+ordinal*interval '1 microsecond'
    FROM pg_catalog.generate_series(1,20) AS ordinal;
    INSERT INTO saas.order_operations(operation_id,store_id,order_id,operation_kind,payload_fingerprint,result_payload,committed_at)
    VALUES ('61000000-0000-4000-8000-000000000019','${STORE_B}','${ORDER_OTHER}','transition_payment',repeat('3',64),'{"id":"${ORDER_OTHER}","status":"delivered","paymentStatus":"completed","version":1,"updatedAt":"2026-07-22T09:00:00.000Z"}','2026-07-22 09:00:00+00');
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
      assert.deepEqual(manifest.artifacts.slice(0, 3).map((artifact) => artifact.file), [
        "202607210022_order_management.up.sql",
        "202607210022_order_management.down.sql",
        "202607210022_order_management_assertions.sql",
      ]);
      assert.deepEqual(manifest.artifacts.slice(3).map((artifact) => artifact.file), [
        "202607210023_order_management_api.up.sql",
        "202607210023_order_management_api.down.sql",
        "202607210023_order_management_api_assertions.sql",
      ]);
      for (const artifact of manifest.artifacts) {
        assert.equal(artifact.sha256, createHash("sha256").update(readFileSync(path.join(SQL, artifact.file))).digest("hex"));
      }
    });

    await scenario("all order tables are owner-owned with forced RLS", async () => {
      assert.equal(psql(backend, `SELECT count(*) FROM pg_class AS relation JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace JOIN pg_roles AS owner ON owner.oid=relation.relowner WHERE namespace.nspname='saas' AND relation.relname=ANY(ARRAY['${TABLES.join("','")}']) AND relation.relkind='r' AND owner.rolname='celebix_saas_owner' AND relation.relrowsecurity AND relation.relforcerowsecurity;`), "5");
    });

    seed(backend);

    await scenario("orders and items expose exact columns constraints and uniqueness", async () => {
      assert.equal(psql(backend, `SELECT string_agg(column_name||':'||data_type||':'||is_nullable||':'||COALESCE(column_default,''),',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='saas' AND table_name='orders';`), "id:uuid:NO:,store_id:uuid:NO:,order_number:text:NO:,source:text:NO:,customer_name:text:NO:,customer_email:text:NO:,customer_phone:text:YES:,currency:text:NO:,subtotal_cents:bigint:NO:,shipping_cents:bigint:NO:,discount_cents:bigint:NO:,total_cents:bigint:NO:,status:text:NO:,payment_status:text:NO:,shipping_address:jsonb:NO:,tracking:jsonb:YES:,version:bigint:NO:1,created_at:timestamp with time zone:NO:,updated_at:timestamp with time zone:NO:");
      assert.equal(psql(backend, `SELECT string_agg(column_name||':'||data_type||':'||is_nullable,',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='saas' AND table_name='order_items';`), "id:uuid:NO,store_id:uuid:NO,order_id:uuid:NO,product_id:uuid:YES,variant_id:uuid:YES,position:integer:NO,product_name:text:NO,variant_name:text:YES,sku:text:YES,unit_price_cents:bigint:NO,quantity:integer:NO,discount_cents:bigint:NO,line_total_cents:bigint:NO,created_at:timestamp with time zone:NO");
      assert.equal(psql(backend, `SELECT string_agg(conname,',' ORDER BY conname) FROM pg_constraint WHERE conrelid='saas.orders'::regclass AND contype='c';`), "orders_currency_check,orders_discount_cents_check,orders_payment_status_check,orders_shipping_cents_check,orders_source_check,orders_status_check,orders_subtotal_cents_check,orders_total_cents_check,orders_version_check");
      assert.equal(psql(backend, `SELECT string_agg(conname,',' ORDER BY conname) FROM pg_constraint WHERE conrelid='saas.order_items'::regclass AND contype='c';`), "order_items_discount_cents_check,order_items_line_total_cents_check,order_items_position_check,order_items_quantity_check,order_items_unit_price_cents_check");
      assert.equal(psql(backend, `SELECT string_agg(conname,',' ORDER BY conname) FROM pg_constraint WHERE conrelid='saas.orders'::regclass AND contype='u';`), "orders_store_id_id_key,orders_store_id_order_number_key");
      assert.equal(psql(backend, `SELECT string_agg(conname,',' ORDER BY conname) FROM pg_constraint WHERE conrelid='saas.order_items'::regclass AND contype='u';`), "order_items_store_id_order_id_position_key");
      assert.equal(psql(backend, `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='saas.stores'::regclass AND conname='stores_id_currency_key';`), "UNIQUE (id, currency)");
      assert.equal(psql(backend, `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='saas.orders'::regclass AND conname='orders_store_currency_fk';`), "FOREIGN KEY (store_id, currency) REFERENCES saas.stores(id, currency)");
      assert.equal(psql(backend, "SELECT indexdef FROM pg_indexes WHERE schemaname='saas' AND indexname='orders_store_total_list_idx';"), "CREATE INDEX orders_store_total_list_idx ON saas.orders USING btree (store_id, total_cents DESC, created_at DESC, id DESC)");
      assert.equal(psql(backend, "SELECT indexdef FROM pg_indexes WHERE schemaname='saas' AND indexname='orders_store_status_total_list_idx';"), "CREATE INDEX orders_store_status_total_list_idx ON saas.orders USING btree (store_id, status, total_cents DESC, created_at DESC, id DESC)");
      const invalidOrders = [
        ["bad_source", "'invalid'", "'TRY'", "1", "0", "0", "1", "'pending'", "'pending'", "1"],
        ["bad_currency", "'storefront'", "'try'", "1", "0", "0", "1", "'pending'", "'pending'", "1"],
        ["bad_subtotal", "'storefront'", "'TRY'", "-1", "0", "0", "-1", "'pending'", "'pending'", "1"],
        ["bad_shipping", "'storefront'", "'TRY'", "0", "-1", "0", "-1", "'pending'", "'pending'", "1"],
        ["bad_discount", "'storefront'", "'TRY'", "0", "0", "-1", "1", "'pending'", "'pending'", "1"],
        ["bad_total", "'storefront'", "'TRY'", "1", "0", "0", "2", "'pending'", "'pending'", "1"],
        ["negative_total", "'storefront'", "'TRY'", "0", "0", "1", "-1", "'pending'", "'pending'", "1"],
        ["bad_status", "'storefront'", "'TRY'", "1", "0", "0", "1", "'unknown'", "'pending'", "1"],
        ["bad_payment", "'storefront'", "'TRY'", "1", "0", "0", "1", "'pending'", "'unknown'", "1"],
        ["bad_version", "'storefront'", "'TRY'", "1", "0", "0", "1", "'pending'", "'pending'", "0"],
      ];
      for (const [index, [label, source, currency, subtotal, shipping, discount, total, status, payment, version]] of invalidOrders.entries()) {
        const id = `81000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
        denied(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at) VALUES ('${id}','${STORE_A}','${label}',${source},'Test','test@example.test',${currency},${subtotal},${shipping},${discount},${total},${status},${payment},'{}',${version},'${NOW}','${NOW}'); COMMIT;`);
      }
      const constraintOrder = "82000000-0000-4000-8000-000000000001";
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at) VALUES ('${constraintOrder}','${STORE_A}','constraint-fixture','storefront','Test','test@example.test','TRY',1,0,0,1,'pending','pending','{}',1,'${NOW}','${NOW}'); COMMIT;`);
      denied(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at) VALUES ('82000000-0000-4000-8000-000000000002','${STORE_A}','currency-mismatch','storefront','Test','test@example.test','USD',1,0,0,1,'pending','pending','{}',1,'${NOW}','${NOW}'); COMMIT;`);
      denied(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.orders SET currency='USD' WHERE id='${constraintOrder}'; COMMIT;`);
      assert.equal(psql(backend, `SELECT currency FROM saas.orders WHERE id='${constraintOrder}';`), "TRY");
      const invalidItems = [
        ["-1", "1", "1", "0", "1"],
        ["100", "1", "1", "0", "1"],
        ["0", "-1", "1", "0", "-1"],
        ["0", "1", "0", "0", "0"],
        ["0", "1", "10000", "0", "10000"],
        ["0", "1", "1", "-1", "2"],
        ["0", "1", "1", "0", "2"],
        ["0", "0", "1", "1", "-1"],
      ];
      for (const [index, [position, unitPrice, quantity, discount, lineTotal]] of invalidItems.entries()) {
        const id = `83000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
        denied(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; INSERT INTO saas.order_items(id,store_id,order_id,position,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at) VALUES ('${id}','${STORE_A}','${constraintOrder}',${position},'Invalid item',${unitPrice},${quantity},${discount},${lineTotal},'${NOW}'); COMMIT;`);
      }
      const tamperedAssertions = `BEGIN; SET LOCAL ROLE celebix_saas_owner; ALTER TABLE saas.orders DROP CONSTRAINT orders_currency_check;\n${readFileSync(path.join(SQL, "202607210022_order_management_assertions.sql"), "utf8")}`;
      const constraintDrift = psqlResult(backend, tamperedAssertions, DATABASE, { allowFailure: true });
      assert.notEqual(constraintDrift.status, 0, "assertions accepted constraint drift");
      assert.match(constraintDrift.stderr, /PHASE3B1_ORDER_ASSERTION_FAILED: exact check\/unique constraint drift/);
    });

    await scenario("child rows enforce every composite store authority edge", async () => {
      for (const statement of [
        `INSERT INTO saas.order_items(id,store_id,order_id,position,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at) VALUES ('80000000-0000-4000-8000-000000000001','${STORE_B}','${ORDER_A}',0,'Cross',1,1,0,1,'${NOW}')`,
        `INSERT INTO saas.order_items(id,store_id,order_id,product_id,position,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at) VALUES ('80000000-0000-4000-8000-000000000002','${STORE_A}','${ORDER_A}','${PRODUCT_B}',0,'Cross product',1,1,0,1,'${NOW}')`,
        `INSERT INTO saas.order_items(id,store_id,order_id,variant_id,position,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at) VALUES ('80000000-0000-4000-8000-000000000003','${STORE_A}','${ORDER_A}','${VARIANT_B}',0,'Cross variant',1,1,0,1,'${NOW}')`,
        `INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,message,payload,created_at) VALUES ('80000000-0000-4000-8000-000000000004','${STORE_A}','${ORDER_A}','30000000-0000-4000-8000-000000000005','order_created','Cross actor','{}','${NOW}')`,
        `INSERT INTO saas.order_notes(id,store_id,order_id,author_membership_id,body,created_at,updated_at) VALUES ('80000000-0000-4000-8000-000000000005','${STORE_A}','${ORDER_A}','30000000-0000-4000-8000-000000000005','Cross author','${NOW}','${NOW}')`,
        `INSERT INTO saas.order_events(id,store_id,order_id,event_type,message,payload,created_at) VALUES ('80000000-0000-4000-8000-000000000006','${STORE_B}','${ORDER_A}','order_created','Cross order','{}','${NOW}')`,
        `INSERT INTO saas.order_operations(operation_id,store_id,order_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES ('80000000-0000-4000-8000-000000000007','${STORE_B}','${ORDER_A}','transition_status',repeat('b',64),'{}','${NOW}')`,
        `INSERT INTO saas.order_notes(id,store_id,order_id,author_membership_id,body,created_at,updated_at) VALUES ('80000000-0000-4000-8000-000000000008','${STORE_B}','${ORDER_A}','30000000-0000-4000-8000-000000000005','Cross note order','${NOW}','${NOW}')`,
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
      const upSql = readFileSync(path.join(SQL, "202607210022_order_management.up.sql"), "utf8");
      const functionStart = upSql.indexOf("CREATE FUNCTION saas.merchant_action_authority_error(");
      const functionEnd = upSql.indexOf("\n$function$;", functionStart) + "\n$function$;".length;
      const broadenedFunction = upSql.slice(functionStart, functionEnd)
        .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")
        .replace("  IF NOT (\n    membership_role", "  IF membership_role = 'analyst' AND p_required_action = 'orders.payment' THEN\n    RETURN NULL;\n  END IF;\n\n  IF NOT (\n    membership_role");
      assert.notEqual(broadenedFunction, upSql.slice(functionStart, functionEnd), "authority broadening fixture was not created");
      const tamperedAssertions = `BEGIN; SET LOCAL ROLE celebix_saas_owner;\n${broadenedFunction}\n${readFileSync(path.join(SQL, "202607210022_order_management_assertions.sql"), "utf8")}`;
      const authorityDrift = psqlResult(backend, tamperedAssertions, DATABASE, { allowFailure: true });
      assert.notEqual(authorityDrift.status, 0, "assertions accepted broadened role/action authority");
      assert.match(authorityDrift.stderr, /PHASE3B1_ORDER_ASSERTION_FAILED: exact authority body drift/);
    });

    await scenario("inactive membership is denied", async () => {
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.memberships SET status='revoked',updated_at='${NOW}' WHERE id='30000000-0000-4000-8000-000000000001'; COMMIT;`);
      assert.equal(authority(backend), "membership_denied");
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.memberships SET status='active',updated_at='${NOW}' WHERE id='30000000-0000-4000-8000-000000000001'; COMMIT;`);
    });

    await scenario("inactive and wrong store authority are denied", async () => {
      assert.equal(authority(backend, { store: STORE_B }), "membership_denied");
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.stores SET status='suspended',updated_at='${NOW}' WHERE id='${STORE_A}'; COMMIT;`);
      assert.equal(authority(backend), "store_inactive");
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.stores SET status='active',updated_at='${NOW}' WHERE id='${STORE_A}'; COMMIT;`);
    });

    await scenario("ordered enabled feature lookup allows only enabled plan features", async () => {
      assert.equal(psql(backend, `SELECT string_agg(feature_key,',' ORDER BY feature_ordinal) FROM saas.plan_features WHERE plan_id='${PLAN}' AND enabled;`), "catalog,orders,customers,content,media,analytics,checkout");
      assert.equal(authority(backend, { feature: "orders" }), "<null>");
      assert.equal(authority(backend, { feature: "custom_domains" }), "feature_not_enabled");
      assert.equal(authority(backend, { feature: "not_registered" }), "feature_not_enabled");
    });

    await scenario("plan subscription and tuple drift are durably denied", async () => {
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.subscriptions SET status='inactive',updated_at='${NOW}' WHERE store_id='${STORE_A}'; COMMIT;`);
      assert.equal(authority(backend), "durable_authority_invalid");
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.subscriptions SET status='active',updated_at='${NOW}' WHERE store_id='${STORE_A}'; COMMIT;`);
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.subscriptions SET valid_from='2026-07-22',updated_at='${NOW}' WHERE store_id='${STORE_A}'; COMMIT;`);
      assert.equal(authority(backend), "durable_authority_invalid");
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.subscriptions SET valid_from='2026-01-01',updated_at='${NOW}' WHERE store_id='${STORE_A}'; COMMIT;`);
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.subscriptions SET valid_until='2026-07-20',updated_at='${NOW}' WHERE store_id='${STORE_A}'; COMMIT;`);
      assert.equal(authority(backend), "durable_authority_invalid");
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.subscriptions SET valid_until=NULL,updated_at='${NOW}' WHERE store_id='${STORE_A}'; COMMIT;`);
      psql(backend, `ALTER TABLE saas.plans DISABLE TRIGGER plan_versions_immutable; UPDATE saas.plans SET status='inactive' WHERE id='${PLAN}';`);
      assert.equal(authority(backend), "durable_authority_invalid");
      psql(backend, `UPDATE saas.plans SET status='expired' WHERE id='${PLAN}';`);
      assert.equal(authority(backend), "durable_authority_invalid");
      psql(backend, `UPDATE saas.plans SET status='active',valid_from='2026-07-22' WHERE id='${PLAN}';`);
      assert.equal(authority(backend), "durable_authority_invalid");
      psql(backend, `UPDATE saas.plans SET valid_from='2026-01-01',valid_until='${NOW}' WHERE id='${PLAN}';`);
      assert.equal(authority(backend), "durable_authority_invalid");
      psql(backend, `UPDATE saas.plans SET valid_until=NULL WHERE id='${PLAN}'; ALTER TABLE saas.plans ENABLE TRIGGER plan_versions_immutable;`);
      assert.equal(authority(backend, { plan: "00000000-0000-4000-8000-000000000099" }), "durable_authority_invalid");
      assert.equal(authority(backend, { planCode: "wrong_plan" }), "durable_authority_invalid");
      assert.equal(authority(backend, { planVersion: 2 }), "durable_authority_invalid");
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

    seedApi(backend);

    await scenario("app-callable API exposes a happy-path deterministic order list", async () => {
      for (const signature of API_SIGNATURES) {
        assert.equal(psql(backend, `SELECT to_regprocedure('${signature}')::text;`), signature);
        assert.equal(psql(backend, `SELECT has_function_privilege('celebix_saas_app','${signature}','EXECUTE');`), "t");
        assert.equal(psql(backend, `SELECT has_function_privilege('public','${signature}','EXECUTE');`), "f");
      }
      const result = api(backend, "orders_list", orderListArguments());
      assert.equal(result.outcome, "listed");
      assert.deepEqual(result.result.items.map((order) => order.id), [ORDER_B, ORDER_A, ORDER_C, ORDER_D]);
      assert.equal(Object.hasOwn(result.result, "nextCursor"), false);
    });

    await scenario("app-callable API exposes a happy-path order detail", async () => {
      psql(backend, `
        BEGIN;
        SET LOCAL ROLE celebix_saas_owner;
        INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,message,payload,created_at)
        SELECT pg_catalog.md5('bounded-order-event:'||ordinal::text)::uuid,'${STORE_A}','${ORDER_A}','30000000-0000-4000-8000-000000000001','order_created','Bounded event '||ordinal::text,'{}','2026-07-22 09:00:00+00'::timestamptz+ordinal*interval '1 microsecond'
        FROM pg_catalog.generate_series(1,201) AS ordinal;
        INSERT INTO saas.order_notes(id,store_id,order_id,author_membership_id,body,created_at,updated_at)
        SELECT pg_catalog.md5('bounded-order-note:'||ordinal::text)::uuid,'${STORE_A}','${ORDER_A}','30000000-0000-4000-8000-000000000001','Bounded note '||ordinal::text,'2026-07-22 10:00:00+00'::timestamptz+ordinal*interval '1 microsecond','2026-07-22 10:00:00+00'::timestamptz+ordinal*interval '1 microsecond'
        FROM pg_catalog.generate_series(1,100) AS ordinal;
        COMMIT;
      `);
      const beforeLatestNote = api(backend, "orders_get", `'${ORDER_A}'::uuid`);
      assert.equal(beforeLatestNote.result.notes.length, 100);
      assert.equal(beforeLatestNote.result.notes.at(-1).body, "Bounded note 100");
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; INSERT INTO saas.order_notes(id,store_id,order_id,author_membership_id,body,created_at,updated_at) VALUES (pg_catalog.md5('bounded-order-note:101')::uuid,'${STORE_A}','${ORDER_A}','30000000-0000-4000-8000-000000000001','Bounded note 101','2026-07-22 10:00:00.000101+00','2026-07-22 10:00:00.000101+00'); COMMIT;`);
      const result = api(backend, "orders_get", `'${ORDER_A}'::uuid`);
      assert.equal(result.outcome, "found");
      assert.equal(result.result.id, ORDER_A);
      assert.equal(result.result.orderNumber, "ORD-0001");
      assert.equal(result.result.itemCount, 1);
      assert.equal(result.result.items[0].id, "43000000-0000-4000-8000-000000000001");
      assert.equal(result.result.events.length, 200);
      assert.equal(result.result.events[0].message, "Bounded event 2");
      assert.equal(result.result.events.at(-1).message, "Bounded event 201");
      assert.equal(result.result.events.some((event) => event.id === EVENT_A), false);
      assert.equal(result.result.notes.length, 100);
      assert.equal(result.result.notes[0].body, "Bounded note 2");
      assert.equal(result.result.notes.at(-1).body, "Bounded note 101");
    });

    await scenario("all global sorts paginate deterministically across ties without gaps or duplicates", async () => {
      const expected = {
        newest: [ORDER_B, ORDER_A, ORDER_C, ORDER_D],
        oldest: [ORDER_D, ORDER_C, ORDER_A, ORDER_B],
        highest: [ORDER_D, ORDER_C, ORDER_B, ORDER_A],
        lowest: [ORDER_A, ORDER_B, ORDER_C, ORDER_D],
      };
      for (const sort of ["newest", "oldest", "highest", "lowest"]) {
        const ids = [];
        let cursor;
        do {
          const page = api(backend, "orders_list", orderListArguments({ sort, pageSize: 1, cursor }));
          assert.equal(page.outcome, "listed");
          ids.push(...page.result.items.map((order) => order.id));
          cursor = page.result.nextCursor;
          if (cursor !== undefined) {
            assert.deepEqual(Object.keys(cursor).sort(), ["createdAt", "id", "totalCents"]);
            assert.equal(page.result.items.at(-1).createdAt, cursor.createdAt, "list DTO preserves cursor microsecond precision");
            assert.match(page.result.items.at(-1).updatedAt, /[.]\d{6}Z$/, "list DTO preserves canonical microsecond update precision");
          }
        } while (cursor !== undefined);
        assert.deepEqual(ids, expected[sort]);
        assert.equal(new Set(ids).size, ids.length);
      }
      for (const size of [0, 101]) assert.equal(api(backend, "orders_list", orderListArguments({ pageSize: size })).outcome, "invalid_input");
      assert.equal(api(backend, "orders_list", orderListArguments({ sort: "unknown" })).outcome, "invalid_input");
      assert.equal(api(backend, "orders_list", "NULL,NULL,'newest',1,10000,NULL,NULL").outcome, "invalid_input");
    });

    await scenario("list applies exact status and literal case-insensitive search filters", async () => {
      const status = api(backend, "orders_list", orderListArguments({ status: "'delivered'" }));
      assert.deepEqual(status.result.items.map((order) => order.id), [ORDER_C]);
      const search = api(backend, "orders_list", orderListArguments({ search: "'gRaCe@ExAmPlE.TeSt'" }));
      assert.deepEqual(search.result.items.map((order) => order.id), [ORDER_C]);
      assert.equal(api(backend, "orders_list", orderListArguments({ status: "'unknown'" })).outcome, "invalid_input");
      assert.deepEqual(api(backend, "orders_list", orderListArguments({ search: "'%'" })).result.items, []);
    });

    await scenario("summary is store-scoped and counts only completed delivered revenue", async () => {
      const result = api(backend, "orders_get_dashboard_summary");
      assert.equal(result.outcome, "summarized");
      assert.deepEqual(result.result, {
        totalOrders: 4,
        pendingOrders: 1,
        fulfilledOrders: 1,
        revenueCents: 30000,
        currency: "TRY",
        asOf: NOW,
      });
      assert.equal(psql(backend, `SELECT count(DISTINCT order_row.currency)::text||':'||min(order_row.currency)||':'||store.currency FROM saas.orders AS order_row JOIN saas.stores AS store ON store.id=order_row.store_id WHERE order_row.store_id='${STORE_A}' GROUP BY store.currency;`), "1:TRY:TRY");
    });

    await scenario("cross-store order detail is a stable not-found", async () => {
      const result = api(backend, "orders_get", `'${ORDER_OTHER}'::uuid`);
      assert.deepEqual(result, { outcome: "order_not_found", result: null });
      const missingOrder = "40000000-0000-4000-8000-000000000099";
      const foreignOperation = api(backend, "orders_transition_status", `'61000000-0000-4000-8000-000000000019'::uuid,repeat('3',64),'${missingOrder}'::uuid,1,'confirmed'`);
      const absentOperation = api(backend, "orders_transition_status", `'61000000-0000-4000-8000-000000000020'::uuid,repeat('4',64),'${missingOrder}'::uuid,1,'confirmed'`);
      assert.deepEqual(foreignOperation, { outcome: "order_not_found", result: null });
      assert.deepEqual(absentOperation, foreignOperation);
    });

    await scenario("analyst authority can read list detail and summary", async () => {
      const analyst = { principal: "20000000-0000-4000-8000-000000000004", membership: "30000000-0000-4000-8000-000000000004" };
      assert.equal(api(backend, "orders_list", orderListArguments({ pageSize: 10 }), analyst).outcome, "listed");
      assert.equal(api(backend, "orders_get", `'${ORDER_A}'::uuid`, analyst).outcome, "found");
      assert.equal(api(backend, "orders_get_dashboard_summary", "", analyst).outcome, "summarized");
    });

    await scenario("analyst payment mutation is denied without side effects", async () => {
      const analyst = { principal: "20000000-0000-4000-8000-000000000004", membership: "30000000-0000-4000-8000-000000000004" };
      const result = api(backend, "orders_transition_payment", `'61000000-0000-4000-8000-000000000001'::uuid,repeat('1',64),'${ORDER_A}'::uuid,1,'processing'`, analyst);
      assert.deepEqual(result, { outcome: "membership_denied", result: null });
      assert.equal(psql(backend, `SELECT payment_status||':'||version FROM saas.orders WHERE id='${ORDER_A}';`), "pending:1");
    });

    await scenario("editor payment mutation is denied without side effects", async () => {
      const editor = { principal: "20000000-0000-4000-8000-000000000003", membership: "30000000-0000-4000-8000-000000000003" };
      const result = api(backend, "orders_transition_payment", `'61000000-0000-4000-8000-000000000002'::uuid,repeat('2',64),'${ORDER_A}'::uuid,1,'processing'`, editor);
      assert.deepEqual(result, { outcome: "membership_denied", result: null });
      assert.equal(psql(backend, `SELECT count(*) FROM saas.order_operations WHERE operation_id='61000000-0000-4000-8000-000000000002';`), "0");
    });

    await scenario("editor fulfillment performs one versioned status transition", async () => {
      const editor = { principal: "20000000-0000-4000-8000-000000000003", membership: "30000000-0000-4000-8000-000000000003" };
      const result = api(backend, "orders_transition_status", `'61000000-0000-4000-8000-000000000003'::uuid,repeat('3',64),'${ORDER_B}'::uuid,1,'preparing'`, editor);
      assert.equal(result.outcome, "committed");
      assert.equal(result.result.status, "preparing");
      assert.equal(result.result.version, 2);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.order_events WHERE order_id='${ORDER_B}' AND event_type='status_transition';`), "1");
      const cancellation = api(backend, "orders_transition_status", `'61000000-0000-4000-8000-000000000015'::uuid,repeat('f',64),'${ORDER_B}'::uuid,2,'cancelled'`, editor);
      assert.deepEqual(cancellation, { outcome: "membership_denied", result: null });
      assert.equal(psql(backend, `SELECT status||':'||version FROM saas.orders WHERE id='${ORDER_B}';`), "preparing:2");
    });

    await scenario("status state machine denies terminal transitions", async () => {
      const result = api(backend, "orders_transition_status", `'61000000-0000-4000-8000-000000000004'::uuid,repeat('4',64),'${ORDER_D}'::uuid,1,'delivered'`);
      assert.deepEqual(result, { outcome: "invalid_transition", result: null });
      assert.equal(psql(backend, `SELECT status||':'||version FROM saas.orders WHERE id='${ORDER_D}';`), "cancelled:1");
    });

    await scenario("payment state machine denies skipped transitions", async () => {
      const result = api(backend, "orders_transition_payment", `'61000000-0000-4000-8000-000000000005'::uuid,repeat('5',64),'${ORDER_A}'::uuid,1,'completed'`);
      assert.deepEqual(result, { outcome: "invalid_transition", result: null });
      assert.equal(psql(backend, `SELECT payment_status||':'||version FROM saas.orders WHERE id='${ORDER_A}';`), "pending:1");
    });

    await scenario("stale versions are denied before mutation", async () => {
      const result = api(backend, "orders_transition_status", `'61000000-0000-4000-8000-000000000006'::uuid,repeat('6',64),'${ORDER_B}'::uuid,1,'shipped'`);
      assert.deepEqual(result, { outcome: "version_conflict", result: null });
      const foreignOperation = api(backend, "orders_transition_status", `'61000000-0000-4000-8000-000000000019'::uuid,repeat('3',64),'${ORDER_B}'::uuid,1,'shipped'`);
      const absentOperation = api(backend, "orders_transition_status", `'61000000-0000-4000-8000-000000000020'::uuid,repeat('4',64),'${ORDER_B}'::uuid,1,'shipped'`);
      assert.deepEqual(foreignOperation, { outcome: "version_conflict", result: null });
      assert.deepEqual(absentOperation, foreignOperation);
      assert.equal(psql(backend, `SELECT status||':'||version FROM saas.orders WHERE id='${ORDER_B}';`), "preparing:2");
    });

    await scenario("same operation and fingerprint replays the immutable result", async () => {
      const args = `'61000000-0000-4000-8000-000000000007'::uuid,repeat('7',64),'${ORDER_A}'::uuid,1,'confirmed'`;
      const committed = api(backend, "orders_transition_status", args);
      const replayed = api(backend, "orders_transition_status", args);
      assert.equal(committed.outcome, "committed");
      assert.equal(replayed.outcome, "operation_replayed");
      assert.deepEqual(replayed.result, committed.result);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.order_events WHERE order_id='${ORDER_A}' AND event_type='status_transition';`), "1");
    });

    await scenario("operation fingerprint mismatch fails closed", async () => {
      const result = api(backend, "orders_transition_status", `'61000000-0000-4000-8000-000000000007'::uuid,repeat('8',64),'${ORDER_A}'::uuid,1,'confirmed'`);
      assert.deepEqual(result, { outcome: "operation_mismatch", result: null });
      assert.equal(psql(backend, `SELECT payload_fingerprint FROM saas.order_operations WHERE operation_id='61000000-0000-4000-8000-000000000007';`), "7".repeat(64));
      const editor = { principal: "20000000-0000-4000-8000-000000000003", membership: "30000000-0000-4000-8000-000000000003" };
      const foreignInvalid = api(backend, "orders_transition_status", `'61000000-0000-4000-8000-000000000019'::uuid,repeat('3',64),'${ORDER_A}'::uuid,2,'confirmed'`, editor);
      const absentInvalid = api(backend, "orders_transition_status", `'61000000-0000-4000-8000-000000000020'::uuid,repeat('4',64),'${ORDER_A}'::uuid,2,'confirmed'`, editor);
      assert.deepEqual(foreignInvalid, { outcome: "invalid_transition", result: null });
      assert.deepEqual(absentInvalid, foreignInvalid);
      const eventsBeforeConflict = psql(backend, `SELECT count(*) FROM saas.order_events WHERE order_id='${ORDER_A}';`);
      const foreignValidConflict = api(backend, "orders_transition_status", `'61000000-0000-4000-8000-000000000019'::uuid,repeat('3',64),'${ORDER_A}'::uuid,2,'cancelled'`);
      assert.deepEqual(foreignValidConflict, { outcome: "operation_mismatch", result: null });
      assert.equal(psql(backend, `SELECT status||':'||version FROM saas.orders WHERE id='${ORDER_A}';`), "confirmed:2");
      assert.equal(psql(backend, `SELECT count(*) FROM saas.order_events WHERE order_id='${ORDER_A}';`), eventsBeforeConflict);
      const cancelled = api(backend, "orders_transition_status", `'61000000-0000-4000-8000-000000000017'::uuid,repeat('1',64),'${ORDER_A}'::uuid,2,'cancelled'`);
      assert.equal(cancelled.outcome, "committed");
      const forgedReplay = api(backend, "orders_transition_status", `'61000000-0000-4000-8000-000000000017'::uuid,repeat('1',64),'${ORDER_A}'::uuid,2,'confirmed'`, editor);
      assert.deepEqual(forgedReplay, { outcome: "membership_denied", result: null });
    });

    await scenario("concurrent same-version transitions have exactly one winner", async () => {
      const calls = [
        apiAsync(backend, "orders_transition_status", `'61000000-0000-4000-8000-000000000008'::uuid,repeat('8',64),'${ORDER_B}'::uuid,2,'shipped'`),
        apiAsync(backend, "orders_transition_status", `'61000000-0000-4000-8000-000000000009'::uuid,repeat('9',64),'${ORDER_B}'::uuid,2,'shipped'`),
      ];
      const results = await Promise.all(calls);
      assert.deepEqual(results.map((result) => result.outcome).sort(), ["committed", "version_conflict"]);
      assert.equal(psql(backend, `SELECT status||':'||version FROM saas.orders WHERE id='${ORDER_B}';`), "shipped:3");
      assert.equal(psql(backend, `SELECT count(*) FROM saas.order_events WHERE order_id='${ORDER_B}' AND event_type='status_transition' AND to_value='shipped';`), "1");
    });

    await scenario("shipping update validates and returns the new safe projection", async () => {
      const result = api(backend, "orders_update_shipping", `'61000000-0000-4000-8000-000000000010'::uuid,repeat('a',64),'${ORDER_B}'::uuid,3,'{"recipientName":"Alan Turing","line1":"New 2","city":"Istanbul","country":"TR"}'::jsonb,'{"carrier":"HemenKargo","trackingNumber":"TRACK-2","trackingUrl":"https://tracking.example.test/TRACK-2","shippedAt":"2026-07-21T10:00:00.000Z"}'::jsonb`);
      assert.equal(result.outcome, "committed");
      assert.deepEqual(Object.keys(result.result).sort(), ["id", "paymentStatus", "status", "updatedAt", "version"]);
      assert.equal(result.result.version, 4);
      const detail = api(backend, "orders_get", `'${ORDER_B}'::uuid`);
      assert.equal(detail.result.shippingAddress.line1, "New 2");
      assert.equal(detail.result.tracking.trackingNumber, "TRACK-2");
    });

    await scenario("notes add and archive atomically update detail and audit", async () => {
      const noteId = "62000000-0000-4000-8000-000000000001";
      const added = api(backend, "orders_add_note", `'61000000-0000-4000-8000-000000000011'::uuid,repeat('b',64),'${noteId}'::uuid,'${ORDER_B}'::uuid,'Pack with care'`);
      assert.equal(added.outcome, "committed");
      assert.equal(added.result.version, 5);
      assert.equal(api(backend, "orders_get", `'${ORDER_B}'::uuid`).result.notes[0].id, noteId);
      const archived = api(backend, "orders_archive_note", `'61000000-0000-4000-8000-000000000012'::uuid,repeat('c',64),'${ORDER_B}'::uuid,'${noteId}'::uuid`);
      assert.equal(archived.outcome, "committed");
      assert.equal(archived.result.version, 6);
      assert.deepEqual(api(backend, "orders_get", `'${ORDER_B}'::uuid`).result.notes, []);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.order_events WHERE order_id='${ORDER_B}' AND event_type IN ('note_added','note_archived');`), "2");
    });

    await scenario("invalid address or tracking JSON is rejected without a version change", async () => {
      const badAddress = api(backend, "orders_update_shipping", `'61000000-0000-4000-8000-000000000013'::uuid,repeat('d',64),'${ORDER_B}'::uuid,6,'{"recipientName":"Alan","line1":"Test","city":"Istanbul","country":"tr"}'::jsonb,NULL`);
      assert.equal(badAddress.outcome, "invalid_input");
      const badTracking = api(backend, "orders_update_shipping", `'61000000-0000-4000-8000-000000000014'::uuid,repeat('e',64),'${ORDER_B}'::uuid,6,'{"recipientName":"Alan","line1":"Test","city":"Istanbul","country":"TR"}'::jsonb,'{"carrier":"Kargo","trackingNumber":"X","private":"leak"}'::jsonb`);
      assert.equal(badTracking.outcome, "invalid_input");
      const impossibleShippedAt = api(backend, "orders_update_shipping", `'61000000-0000-4000-8000-000000000018'::uuid,repeat('2',64),'${ORDER_B}'::uuid,6,'{"recipientName":"Alan","line1":"Test","city":"Istanbul","country":"TR"}'::jsonb,'{"carrier":"Kargo","trackingNumber":"X","shippedAt":"2026-02-30T10:00:00.000Z"}'::jsonb`);
      assert.equal(impossibleShippedAt.outcome, "invalid_input");
      assert.equal(psql(backend, `SELECT version FROM saas.orders WHERE id='${ORDER_B}';`), "6");
    });

    await scenario("operation recovery is read-only replay or stable mismatch", async () => {
      const before = psql(backend, `SELECT version||':'||(SELECT count(*) FROM saas.order_events WHERE order_id='${ORDER_B}') FROM saas.orders WHERE id='${ORDER_B}';`);
      const recovered = JSON.parse(psql(backend, `BEGIN TRANSACTION READ ONLY; ${apiSql("orders_recover_operation", `'61000000-0000-4000-8000-000000000010'::uuid,repeat('a',64)`)} COMMIT;`));
      assert.equal(recovered.outcome, "operation_replayed");
      assert.equal(recovered.result.version, 4);
      assert.deepEqual(api(backend, "orders_recover_operation", `'61000000-0000-4000-8000-000000000010'::uuid,repeat('f',64)`), { outcome: "operation_mismatch", result: null });
      assert.deepEqual(api(backend, "orders_recover_operation", `'61000000-0000-4000-8000-000000000099'::uuid,repeat('f',64)`), { outcome: "unavailable", result: null });
      assert.equal(psql(backend, `SELECT version||':'||(SELECT count(*) FROM saas.order_events WHERE order_id='${ORDER_B}') FROM saas.orders WHERE id='${ORDER_B}';`), before);
    });

    await scenario("committed API result payloads remain immutable", async () => {
      const mature = api(backend, "orders_transition_status", `'61000000-0000-4000-8000-000000000016'::uuid,repeat('0',64),'${ORDER_C}'::uuid,1,'refunded'`);
      assert.equal(mature.outcome, "committed");
      assert.equal(mature.result.version, 2);
      assert.equal(psql(backend, `SELECT pg_column_size(result_payload)<=32768 FROM saas.order_operations WHERE operation_id='61000000-0000-4000-8000-000000000016';`), "t");
      denied(backend, "BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.order_operations SET result_payload='{}' WHERE operation_id='61000000-0000-4000-8000-000000000010'; COMMIT;");
      const recovered = api(backend, "orders_recover_operation", `'61000000-0000-4000-8000-000000000010'::uuid,repeat('a',64)`);
      assert.equal(recovered.result.version, 4);
    });

    await scenario("API JSON never exposes raw private authority", async () => {
      const payloads = [
        api(backend, "orders_get_dashboard_summary"),
        api(backend, "orders_list", orderListArguments()),
        api(backend, "orders_get", `'${ORDER_A}'::uuid`),
        api(backend, "orders_get", `'${ORDER_B}'::uuid`),
        api(backend, "orders_recover_operation", `'61000000-0000-4000-8000-000000000010'::uuid,repeat('a',64)`),
      ];
      const serialized = JSON.stringify(payloads);
      for (const forbidden of ["storeId", "store_id", "principalId", "principal_id", "membershipId", "membership_id", STORE_A, "20000000-0000-4000-8000-000000000001", "30000000-0000-4000-8000-000000000001"]) {
        assert.equal(serialized.includes(forbidden), false, `private authority leaked: ${forbidden}`);
      }
    });

    createDatabase(backend, ROLLBACK_DATABASE, DATABASE);
    apply(backend, "202607210023_order_management_api.down.sql", ROLLBACK_DATABASE);
    assert.equal(psql(backend, `SELECT count(*) FROM pg_class AS relation JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='saas' AND relation.relname=ANY(ARRAY['${TABLES.join("','")}']);`, ROLLBACK_DATABASE), "5");
    assert.equal(psql(backend, `SELECT to_regprocedure('${AUTHORITY_SIGNATURE}')::text;`, ROLLBACK_DATABASE), AUTHORITY_SIGNATURE);
    assert.equal(psql(backend, `SELECT count(*) FROM unnest(ARRAY[${API_SIGNATURES.map((signature) => `'${signature}'`).join(",")}]) AS signature(value) WHERE to_regprocedure(signature.value) IS NOT NULL;`, ROLLBACK_DATABASE), "0");
    apply(backend, "202607210022_order_management.down.sql", ROLLBACK_DATABASE);
    await scenario("disposable rollback removes only 022 objects", async () => {
      assert.equal(psql(backend, `SELECT count(*) FROM pg_class AS relation JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='saas' AND relation.relname=ANY(ARRAY['${TABLES.join("','")}']);`, ROLLBACK_DATABASE), "0");
      assert.equal(psql(backend, `SELECT to_regprocedure('${AUTHORITY_SIGNATURE}') IS NULL;`, ROLLBACK_DATABASE), "t");
      assert.equal(psql(backend, "SELECT to_regclass('saas.products')::text||':'||to_regprocedure('saas.catalog_get_dashboard_summary(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone)')::text;", ROLLBACK_DATABASE), "saas.products:saas.catalog_get_dashboard_summary(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone)");
      assert.equal(psql(backend, `SELECT count(*) FROM pg_constraint WHERE conrelid='saas.stores'::regclass AND conname='stores_id_currency_key';`, ROLLBACK_DATABASE), "0");
    });

    apply(backend, "202607210022_order_management.up.sql", ROLLBACK_DATABASE);
    apply(backend, "202607210022_order_management_assertions.sql", ROLLBACK_DATABASE);
    apply(backend, "202607210023_order_management_api.up.sql", ROLLBACK_DATABASE);
    apply(backend, "202607210023_order_management_api_assertions.sql", ROLLBACK_DATABASE);
    await scenario("reapply restores exact 022 authority", async () => {
      assert.equal(authority(backend, {}, ROLLBACK_DATABASE), "<null>");
      assert.equal(psql(backend, `SELECT count(*) FROM pg_class AS relation JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='saas' AND relation.relname=ANY(ARRAY['${TABLES.join("','")}']);`, ROLLBACK_DATABASE), "5");
      assert.equal(psql(backend, `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='saas.orders'::regclass AND conname='orders_store_currency_fk';`, ROLLBACK_DATABASE), "FOREIGN KEY (store_id, currency) REFERENCES saas.stores(id, currency)");
    });

    const dump = path.join(backend.temporaryDirectory, "order-management.dump");
    command(backend.executables.pg_dump, ["-h", backend.socketDirectory, "-p", String(backend.port), "-U", "postgres", "-Fc", "-f", dump, DATABASE]);
    createDatabase(backend, RESTORE_DATABASE);
    command(backend.executables.pg_restore, ["-h", backend.socketDirectory, "-p", String(backend.port), "-U", "postgres", "-d", RESTORE_DATABASE, dump]);
    await scenario("backup restore preserves schema data authority and assertions", async () => {
      apply(backend, "202607210022_order_management_assertions.sql", RESTORE_DATABASE);
      apply(backend, "202607210023_order_management_api_assertions.sql", RESTORE_DATABASE);
      assert.equal(authority(backend, {}, RESTORE_DATABASE), "<null>");
      assert.equal(psql(backend, `SELECT count(*) FROM saas.orders WHERE id='${ORDER_A}';`, RESTORE_DATABASE), "1");
      assert.equal(api(backend, "orders_get", `'${ORDER_A}'::uuid`, {}, RESTORE_DATABASE).outcome, "found");
      denied(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.orders SET currency='USD' WHERE id='${ORDER_A}'; COMMIT;`, RESTORE_DATABASE);
      assert.equal(psql(backend, `SELECT order_row.currency||':'||store.currency FROM saas.orders AS order_row JOIN saas.stores AS store ON store.id=order_row.store_id WHERE order_row.id='${ORDER_A}';`, RESTORE_DATABASE), "TRY:TRY");
      denied(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; DELETE FROM saas.order_events WHERE id='${EVENT_A}'; COMMIT;`, RESTORE_DATABASE);
    });

    assert.equal(completed.length, TOTAL - 1);
    cleanupPaths = { temporaryDirectory: backend.temporaryDirectory, socketDirectory: backend.socketDirectory };
    stopPostgres(backend);
    backend = undefined;
    await scenario("disposable PostgreSQL cluster and socket are cleaned up", async () => {
      assert.equal(existsSync(cleanupPaths.temporaryDirectory), false);
      assert.equal(existsSync(cleanupPaths.socketDirectory), false);
      for (const [failureName, failureCall] of [["initdb", 1], ["pg_ctl", 2]]) {
        let partialBackend;
        let calls = 0;
        assert.throws(() => startPostgres({
          token: `${TOKEN}${failureCall}`,
          onAllocate(candidate) { partialBackend = candidate; },
          runCommand() {
            calls += 1;
            if (calls === failureCall) throw new Error(`injected ${failureName} failure`);
          },
        }), new RegExp(`injected ${failureName} failure`));
        assert.equal(existsSync(partialBackend.temporaryDirectory), false);
        assert.equal(existsSync(partialBackend.socketDirectory), false);
      }
    });
    assert.equal(completed.length, TOTAL);
    process.stdout.write(`PASS ${TOTAL}/${TOTAL} order management PostgreSQL 16 harness complete; cleanup confirmed\n`);
  } finally {
    stopPostgres(backend);
  }
}

await main();
