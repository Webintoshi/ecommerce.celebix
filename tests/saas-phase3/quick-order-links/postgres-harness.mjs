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
const DATABASE = `quick_order_links_${TOKEN}`;
const ROLLBACK_DATABASE = `${DATABASE}_rollback`;
const TOTAL = 18;
const completed = [];

const PLAN = "00000000-0000-4000-8000-000000000001";
const STORE_A = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const PRINCIPAL_A = "20000000-0000-4000-8000-000000000001";
const PRINCIPAL_B = "20000000-0000-4000-8000-000000000002";
const MEMBERSHIP_A = "30000000-0000-4000-8000-000000000001";
const MEMBERSHIP_B = "30000000-0000-4000-8000-000000000002";
const PRODUCT_A = "40000000-0000-4000-8000-000000000001";
const PRODUCT_A2 = "40000000-0000-4000-8000-000000000002";
const PRODUCT_B = "40000000-0000-4000-8000-000000000003";
const VARIANT_A = "41000000-0000-4000-8000-000000000001";
const VARIANT_A2 = "41000000-0000-4000-8000-000000000002";
const VARIANT_B = "41000000-0000-4000-8000-000000000003";
const VARIANT_A_SIBLING = "41000000-0000-4000-8000-000000000004";
const VARIANT_A_GENERIC = "41000000-0000-4000-8000-000000000005";
const PROVIDER_A = "50000000-0000-4000-8000-000000000001";
const PROVIDER_B = "50000000-0000-4000-8000-000000000002";
const LINK_A = "60000000-0000-4000-8000-000000000001";
const LINK_B = "60000000-0000-4000-8000-000000000002";
const ORDER_A = "70000000-0000-4000-8000-000000000001";
const ITEM_A = "80000000-0000-4000-8000-000000000001";
const OPERATION_A = "90000000-0000-4000-8000-000000000001";
const TABLES = ["checkout_provider_configs", "quick_order_links", "quick_order_link_items", "quick_order_link_operations"];
const FUNCTIONS = [
  "saas.quick_link_address_is_valid(jsonb)",
  "saas.quick_link_base64url_is_canonical(text)",
  "saas.quick_link_timestamp_is_canonical(text)",
  "saas.quick_link_sealed_envelope_is_valid(jsonb,text)",
  "saas.quick_link_canonical_image_url(uuid,uuid,uuid)",
  "saas.quick_link_operation_result_is_valid(jsonb,uuid)",
  "saas.guard_quick_link_provider_authority()",
  "saas.guard_quick_link_operation_mutation()",
  "saas.quick_link_merchant_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)",
];
const VALID_ADDRESS = `'{"recipientName":"Ada Lovelace","phone":"+905551110000","line1":"Test 1","city":"Istanbul","country":"TR"}'::jsonb`;
const VALID_ENVELOPE = `'{"algorithm":"A256GCM","ciphertext":"cXVpY2stbGluay10b2tlbi1jaXBoZXJ0ZXh0","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}'::jsonb`;
const VALID_RESULT = `'{"id":"${LINK_A}","status":"active","version":1,"expiresAt":"2026-07-22T10:00:00.000Z","updatedAt":"2026-07-21T10:00:00.000Z"}'::jsonb`;

const priorMigrations = [
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
      // Continue through the isolated PostgreSQL 16 installation and PATH.
    }
  }
  return null;
}

function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    encoding: "utf8",
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

function startPostgres(options = {}) {
  assertSafeEnvironment();
  const executables = Object.fromEntries(REQUIRED_NATIVE_TOOLS.map((name) => [name, executable(name)]));
  if (Object.values(executables).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const runCommand = options.runCommand ?? command;
  const makeDirectory = options.makeDirectory ?? mkdirSync;
  const runToken = options.token ?? TOKEN;
  let backend;
  let ready = false;
  try {
    const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "celebix-quick-order-links-"));
    const socketDirectory = path.join("/tmp", `c3b2-${runToken}`);
    const dataDirectory = path.join(temporaryDirectory, "data");
    const port = 20_000 + Math.floor(Math.random() * 20_000);
    backend = {
      executables,
      temporaryDirectory,
      socketDirectory,
      dataDirectory,
      port,
      temporaryDirectoryOwned: true,
      socketDirectoryOwned: false,
      started: false,
      startAttempted: false,
    };
    options.onAllocate?.(backend);
    makeDirectory(socketDirectory, { mode: 0o700 });
    backend.socketDirectoryOwned = true;
    runCommand(executables.initdb, ["-D", dataDirectory, "--auth=trust", "--username=postgres", "--no-locale"]);
    backend.startAttempted = true;
    runCommand(executables.pg_ctl, [
      "-D", dataDirectory,
      "-o", `-k ${socketDirectory} -p ${port} -h ''`,
      "-l", path.join(temporaryDirectory, "postgres.log"),
      "start",
    ]);
    backend.started = true;
    backend.startAttempted = false;
    ready = true;
    return backend;
  } finally {
    if (!ready) stopPostgres(backend);
  }
}

function stopPostgres(backend) {
  if (!backend) return;
  if (backend.started || backend.startAttempted) {
    command(backend.executables.pg_ctl, ["-D", backend.dataDirectory, "-m", "fast", "stop"], { allowFailure: true });
    backend.started = false;
    backend.startAttempted = false;
  }
  if (backend.socketDirectoryOwned) {
    rmSync(backend.socketDirectory, { recursive: true, force: true });
    backend.socketDirectoryOwned = false;
  }
  if (backend.temporaryDirectoryOwned) {
    rmSync(backend.temporaryDirectory, { recursive: true, force: true });
    backend.temporaryDirectoryOwned = false;
  }
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

function denied(backend, source, database = DATABASE) {
  const result = psqlResult(backend, source, database, { allowFailure: true });
  assert.notEqual(result.status, 0, "statement unexpectedly succeeded");
  return result;
}

function databaseInventory(backend, database = DATABASE) {
  return psql(backend, `
    WITH inventory(kind, identity, definition) AS (
      SELECT 'schema', namespace.nspname,
        owner_role.rolname||':'||COALESCE(namespace.nspacl::text,'<null>')
      FROM pg_namespace AS namespace
      JOIN pg_roles AS owner_role ON owner_role.oid=namespace.nspowner
      WHERE namespace.nspname='saas'
      UNION ALL
      SELECT 'relation', namespace.nspname||'.'||relation.relname,
        relation.relkind::text||':'||owner_role.rolname||':'||relation.relrowsecurity::text||':'||relation.relforcerowsecurity::text||':'||COALESCE(relation.relacl::text,'<null>')
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      JOIN pg_roles AS owner_role ON owner_role.oid=relation.relowner
      WHERE namespace.nspname='saas' AND relation.relkind IN ('r','p','S','v','m')
      UNION ALL
      SELECT 'column', namespace.nspname||'.'||relation.relname||'.'||attribute.attname,
        pg_catalog.format_type(attribute.atttypid,attribute.atttypmod)||':'||attribute.attnotnull::text||':'||
        COALESCE(pg_catalog.pg_get_expr(default_record.adbin,default_record.adrelid),'<null>')||':'||
        CASE WHEN attribute.attcollation=0 THEN '<null>' ELSE attribute.attcollation::regcollation::text END||':'||
        COALESCE(attribute.attacl::text,'<null>')
      FROM pg_catalog.pg_attribute AS attribute
      JOIN pg_catalog.pg_class AS relation ON relation.oid=attribute.attrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      LEFT JOIN pg_catalog.pg_attrdef AS default_record
        ON default_record.adrelid=attribute.attrelid AND default_record.adnum=attribute.attnum
      WHERE namespace.nspname='saas'
        AND relation.relkind IN ('r','p','v','m')
        AND attribute.attnum>0
        AND NOT attribute.attisdropped
      UNION ALL
      SELECT 'function', procedure.oid::regprocedure::text,
        owner_role.rolname||':'||procedure.provolatile::text||':'||procedure.prosecdef::text||':'||COALESCE(procedure.proconfig::text,'<null>')||':'||COALESCE(procedure.proacl::text,'<null>')||E'\n'||pg_get_functiondef(procedure.oid)
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
      JOIN pg_roles AS owner_role ON owner_role.oid=procedure.proowner
      WHERE namespace.nspname='saas'
      UNION ALL
      SELECT 'constraint', relation.relname||'.'||constraint_record.conname,
        constraint_record.contype::text||':'||pg_get_constraintdef(constraint_record.oid)
      FROM pg_constraint AS constraint_record
      JOIN pg_class AS relation ON relation.oid=constraint_record.conrelid
      JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='saas'
      UNION ALL
      SELECT 'index', namespace.nspname||'.'||index_relation.relname,
        owner_role.rolname||':'||pg_get_indexdef(index_relation.oid)
      FROM pg_class AS index_relation
      JOIN pg_namespace AS namespace ON namespace.oid=index_relation.relnamespace
      JOIN pg_roles AS owner_role ON owner_role.oid=index_relation.relowner
      WHERE namespace.nspname='saas' AND index_relation.relkind='i'
      UNION ALL
      SELECT 'trigger', namespace.nspname||'.'||relation.relname||'.'||
        CASE WHEN trigger_record.tgisinternal
          THEN COALESCE(constraint_record.conname,'<internal>')||':'||trigger_record.tgfoid::regprocedure::text||':'||trigger_record.tgtype::text
          ELSE trigger_record.tgname
        END,
        trigger_record.tgenabled::text||':'||trigger_record.tgisinternal::text||':'||
        trigger_record.tgtype::text||':'||trigger_record.tgfoid::regprocedure::text||':'||
        trigger_record.tgdeferrable::text||':'||trigger_record.tginitdeferred::text||':'||
        trigger_record.tgattr::text||':'||pg_catalog.encode(trigger_record.tgargs,'escape')||':'||
        COALESCE(pg_catalog.pg_get_expr(trigger_record.tgqual,trigger_record.tgrelid),'<null>')||':'||
        COALESCE(trigger_record.tgoldtable,'<null>')||':'||COALESCE(trigger_record.tgnewtable,'<null>')
      FROM pg_catalog.pg_trigger AS trigger_record
      JOIN pg_catalog.pg_class AS relation ON relation.oid=trigger_record.tgrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      LEFT JOIN pg_catalog.pg_constraint AS constraint_record ON constraint_record.oid=trigger_record.tgconstraint
      WHERE namespace.nspname='saas'
      UNION ALL
      SELECT 'policy', relation.relname||'.'||policy.polname,
        policy.polcmd::text||':'||policy.polpermissive::text||':'||policy.polroles::text||':'||COALESCE(pg_get_expr(policy.polqual,policy.polrelid),'<null>')||':'||COALESCE(pg_get_expr(policy.polwithcheck,policy.polrelid),'<null>')
      FROM pg_policy AS policy
      JOIN pg_class AS relation ON relation.oid=policy.polrelid
      JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='saas'
    )
    SELECT string_agg(kind||':'||identity||':'||definition,E'\n' ORDER BY kind,identity,definition)
    FROM inventory;
  `, database);
}

async function scenario(name, run) {
  await run();
  completed.push(name);
  process.stdout.write(`PASS ${completed.length}/${TOTAL} ${name}\n`);
}

function linkValues({
  id,
  store = STORE_A,
  membership = MEMBERSHIP_A,
  provider = PROVIDER_A,
  digest,
  status = "active",
  currency = "TRY",
  subtotal = 10000,
  shipping = 500,
  discount = 500,
  total = 10000,
  expires = "2026-07-22 10:00:00+00",
  opened = "NULL",
  paid = "NULL",
  cancelled = "NULL",
  order = "NULL",
  created = "2026-07-21 10:00:00+00",
  updated = "2026-07-21 10:00:00+00",
} = {}) {
  return `('${id}'::uuid,'${store}'::uuid,'${membership}'::uuid,'${provider}'::uuid,'${status}',repeat('${digest ?? "a"}',64),'key-1',${VALID_ENVELOPE},'Ada Lovelace','ada@example.test','+905551110000',${VALID_ADDRESS},${VALID_ADDRESS},NULL,'VIP','${currency}',${subtotal},${shipping},${discount},${total},'${expires}'::timestamptz,${opened},${paid},${cancelled},${order},1,'${created}'::timestamptz,'${updated}'::timestamptz)`;
}

function insertLinkSql(options) {
  return `INSERT INTO saas.quick_order_links(id,store_id,creating_membership_id,provider_config_id,status,token_digest,token_key_id,sealed_token,customer_name,customer_email,customer_phone,shipping_address,billing_address,customer_note,internal_label,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,expires_at,opened_at,paid_at,cancelled_at,order_id,version,created_at,updated_at) VALUES ${linkValues(options)};`;
}

function seed(backend, database = DATABASE) {
  psql(backend, `
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
      ('${PRINCIPAL_A}','https://identity.example.test/oidc','quick-owner-a','owner-a@example.test',true,'2026-01-01','2026-01-01'),
      ('${PRINCIPAL_B}','https://identity.example.test/oidc','quick-owner-b','owner-b@example.test',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
      ('${STORE_A}','Quick Store A','quick-store-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
      ('${STORE_B}','Quick Store B','quick-store-b','active','tr','TRY','default','2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
      ('${MEMBERSHIP_A}','${PRINCIPAL_A}','${STORE_A}','store_owner','active','2026-01-01','2026-01-01'),
      ('${MEMBERSHIP_B}','${PRINCIPAL_B}','${STORE_B}','store_owner','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at) VALUES
      ('31000000-0000-4000-8000-000000000001','${STORE_A}','${PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01'),
      ('31000000-0000-4000-8000-000000000002','${STORE_B}','${PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01');
    INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES
      ('${PRODUCT_A}','${STORE_A}','quick-product-a','Quick Product A','active','TRY',1,'2026-01-01','2026-01-01'),
      ('${PRODUCT_A2}','${STORE_A}','quick-product-a2','Quick Product A2','active','TRY',1,'2026-01-01','2026-01-01'),
      ('${PRODUCT_B}','${STORE_B}','quick-product-b','Quick Product B','active','TRY',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES
      ('${VARIANT_A}','${PRODUCT_A}','${STORE_A}','Default A',10000,false,0,'active','{}',1,'2026-01-01','2026-01-01'),
      ('${VARIANT_A2}','${PRODUCT_A2}','${STORE_A}','Default A2',12000,false,0,'active','{}',1,'2026-01-01','2026-01-01'),
      ('${VARIANT_B}','${PRODUCT_B}','${STORE_B}','Default B',10000,false,0,'active','{}',1,'2026-01-01','2026-01-01'),
      ('${VARIANT_A_SIBLING}','${PRODUCT_A}','${STORE_A}','Sibling A',11000,false,0,'active','{}',1,'2026-01-01','2026-01-01'),
      ('${VARIANT_A_GENERIC}','${PRODUCT_A}','${STORE_A}','Generic-only A',11500,false,0,'active','{}',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.product_media(id,store_id,product_id,variant_id,object_key,public_url,media_type,byte_size,sort_order,status,created_at,updated_at) VALUES
      ('43000000-0000-4000-8000-000000000001','${STORE_A}','${PRODUCT_A}','${VARIANT_A}','stores/${STORE_A}/products/${PRODUCT_A}/43000000-0000-4000-8000-000000000001.webp','https://cdn.example.test/stores/${STORE_A}/products/${PRODUCT_A}/43000000-0000-4000-8000-000000000001.webp','image/webp',100,5,'active','2026-01-01','2026-01-01'),
      ('43000000-0000-4000-8000-000000000002','${STORE_A}','${PRODUCT_A}',NULL,'stores/${STORE_A}/products/${PRODUCT_A}/43000000-0000-4000-8000-000000000002.webp','https://cdn.example.test/stores/${STORE_A}/products/${PRODUCT_A}/43000000-0000-4000-8000-000000000002.webp','image/webp',100,1,'active','2026-01-01','2026-01-01'),
      ('43000000-0000-4000-8000-000000000003','${STORE_A}','${PRODUCT_A}','${VARIANT_A_SIBLING}','stores/${STORE_A}/products/${PRODUCT_A}/43000000-0000-4000-8000-000000000003.webp','https://cdn.example.test/stores/${STORE_A}/products/${PRODUCT_A}/43000000-0000-4000-8000-000000000003.webp','image/webp',100,0,'active','2026-01-01','2026-01-01'),
      ('43000000-0000-4000-8000-000000000004','${STORE_A}','${PRODUCT_A}','${VARIANT_A_GENERIC}','stores/${STORE_A}/products/${PRODUCT_A}/43000000-0000-4000-8000-000000000004.webp','https://cdn.example.test/stores/${STORE_A}/products/${PRODUCT_A}/43000000-0000-4000-8000-000000000004.webp','image/webp',100,2,'pending','2026-01-01','2026-01-01');
    INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at)
    VALUES ('${ORDER_A}','${STORE_A}','QL-ORDER-1','quick_link','Ada Lovelace','ada@example.test','TRY',10000,0,0,10000,'confirmed','completed','{}',1,'2026-07-21','2026-07-21');
    INSERT INTO saas.checkout_provider_configs(id,store_id,provider_key,status,public_origin,configuration_key_id,sealed_configuration,version,created_at,updated_at) VALUES
      ('${PROVIDER_A}','${STORE_A}','paytr','active','https://www.paytr.com','key-1',${VALID_ENVELOPE},1,'2026-01-01','2026-01-01'),
      ('${PROVIDER_B}','${STORE_B}','paytr','active','https://www.paytr.com','key-1',${VALID_ENVELOPE},1,'2026-01-01','2026-01-01');
    ${insertLinkSql({ id: LINK_A, digest: "a" })}
    ${insertLinkSql({ id: LINK_B, store: STORE_B, membership: MEMBERSHIP_B, provider: PROVIDER_B, digest: "b" })}
    INSERT INTO saas.quick_order_link_items(id,store_id,quick_order_link_id,product_id,variant_id,position,product_name,variant_name,sku,image_url,unit_price_cents,quantity,line_total_cents,created_at)
    VALUES ('${ITEM_A}','${STORE_A}','${LINK_A}','${PRODUCT_A}','${VARIANT_A}',0,'Quick Product A','Default A','SKU-A',NULL,10000,1,10000,'2026-07-21');
    INSERT INTO saas.quick_order_link_operations(operation_id,store_id,quick_order_link_id,operation_kind,payload_fingerprint,result_payload,committed_at)
    VALUES ('${OPERATION_A}','${STORE_A}','${LINK_A}','create',repeat('c',64),'{"id":"${LINK_A}","status":"active","version":1,"expiresAt":"2026-07-22T10:00:00.000Z","updatedAt":"2026-07-21T10:00:00.000Z"}','2026-07-21');
  `, database);
}

async function main() {
  let backend;
  let cleanupPaths;
  let pre024Inventory;
  let post024Inventory;
  try {
    backend = startPostgres();
    createDatabase(backend, DATABASE);
    for (const migration of priorMigrations) apply(backend, migration);
    pre024Inventory = databaseInventory(backend);

    await scenario("apply migration 024 and run exact assertions", async () => {
      apply(backend, "202607220024_quick_order_links.up.sql");
      apply(backend, "202607220024_quick_order_links_assertions.sql");
      assert.match(psql(backend, "SHOW server_version;"), /^16\./);
      assert.equal(psql(backend, `SELECT COALESCE(saas.quick_link_merchant_authority_error('${STORE_A}','${PRINCIPAL_A}','${MEMBERSHIP_A}','${PLAN}','free_starter',1,'2026-07-21','quick_links.read'),'<null>');`), "store_inactive");
      assert.equal(psql(backend, `SELECT saas.quick_link_merchant_authority_error(NULL,NULL,NULL,NULL,NULL,NULL,NULL,'unknown');`), "durable_authority_invalid");
      post024Inventory = databaseInventory(backend);
    });

    await scenario("manifest bytes exactly bind the three 024 SQL artifacts", async () => {
      const artifacts = [
        ["202607220024_quick_order_links_up", "up", "202607220024_quick_order_links.up.sql", "Add store-scoped checkout configuration and quick-order link persistence with forced RLS."],
        ["202607220024_quick_order_links_down", "down", "202607220024_quick_order_links.down.sql", "Remove only migration 024 quick-order link objects during disposable rollback rehearsal."],
        ["202607220024_quick_order_links_assertions", "verify", "202607220024_quick_order_links_assertions.sql", "Fail on quick-link catalog, constraint, tenant-FK, ACL, RLS, immutability, secret-envelope or authority drift."],
      ].map(([id, direction, file, purpose]) => ({
        id,
        direction,
        file,
        sha256: createHash("sha256").update(readFileSync(path.join(SQL, file))).digest("hex"),
        purpose,
      }));
      const expected = {
        bundleId: "phase3b2-202607220024-quick-order-links",
        postgresqlMajor: 16,
        migrationClassification: "additive",
        environmentAuthorization: "LOCAL_DISPOSABLE_ONLY_STAGING_REQUIRES_SEPARATE_AUTHORIZATION",
        rollbackLimitations: "Migration 024 rollback destroys checkout provider configuration and quick-order link data and is for disposable rehearsal only.",
        artifacts,
      };
      assert.equal(readFileSync(path.join(SQL, "phase3b2-quick-order-links-manifest.json"), "utf8"), `${JSON.stringify(expected, null, 2)}\n`);
    });

    await scenario("all four tables have the exact owner and forced RLS", async () => {
      assert.equal(psql(backend, `SELECT string_agg(relation.relname,',' ORDER BY relation.relname) FROM pg_class AS relation JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace JOIN pg_roles AS owner_role ON owner_role.oid=relation.relowner WHERE namespace.nspname='saas' AND relation.relname=ANY(ARRAY['${TABLES.join("','")}']) AND relation.relkind='r' AND relation.relrowsecurity AND relation.relforcerowsecurity AND owner_role.rolname='celebix_saas_owner';`), [...TABLES].sort().join(","));
    });

    await scenario("exact columns checks uniques indexes and product-media source are pinned", async () => {
      const columns = (table) => psql(backend, `SELECT string_agg(column_name||':'||data_type||':'||is_nullable||':'||COALESCE(column_default,''),',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='saas' AND table_name='${table}';`);
      assert.equal(columns("checkout_provider_configs"), "id:uuid:NO:,store_id:uuid:NO:,provider_key:text:NO:,status:text:NO:,public_origin:text:NO:,configuration_key_id:text:NO:,sealed_configuration:jsonb:NO:,version:bigint:NO:1,created_at:timestamp with time zone:NO:,updated_at:timestamp with time zone:NO:");
      assert.equal(columns("quick_order_link_items"), "id:uuid:NO:,store_id:uuid:NO:,quick_order_link_id:uuid:NO:,product_id:uuid:NO:,variant_id:uuid:NO:,position:integer:NO:,product_name:text:NO:,variant_name:text:YES:,sku:text:YES:,image_url:text:YES:,unit_price_cents:bigint:NO:,quantity:integer:NO:,line_total_cents:bigint:NO:,created_at:timestamp with time zone:NO:");
      assert.equal(columns("quick_order_link_operations"), "operation_id:uuid:NO:,store_id:uuid:NO:,quick_order_link_id:uuid:NO:,operation_kind:text:NO:,payload_fingerprint:character:NO:,result_payload:jsonb:NO:,committed_at:timestamp with time zone:NO:");
      assert.equal(psql(backend, "SELECT count(*) FROM information_schema.columns WHERE table_schema='saas' AND table_name='quick_order_links';"), "28");
      assert.equal(psql(backend, "SELECT count(*) FROM pg_constraint WHERE conrelid=ANY(ARRAY['saas.checkout_provider_configs'::regclass,'saas.quick_order_links'::regclass,'saas.quick_order_link_items'::regclass,'saas.quick_order_link_operations'::regclass]) AND contype IN ('p','u','c');"), "53");
      const uuidChecks = psql(backend, "SELECT string_agg(relation.relname||'.'||constraint_record.conname||':'||pg_get_constraintdef(constraint_record.oid),E'\\n' ORDER BY relation.relname) FROM pg_constraint AS constraint_record JOIN pg_class AS relation ON relation.oid=constraint_record.conrelid WHERE constraint_record.conname=ANY(ARRAY['checkout_provider_configs_id_check','quick_order_links_id_check','quick_order_link_items_id_check','quick_order_link_operations_operation_id_check']);");
      for (const expected of [
        "checkout_provider_configs.checkout_provider_configs_id_check",
        "quick_order_links.quick_order_links_id_check",
        "quick_order_link_items.quick_order_link_items_id_check",
        "quick_order_link_operations.quick_order_link_operations_operation_id_check",
        "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
      ]) assert.ok(uuidChecks.includes(expected), `missing public UUID authority: ${expected}`);
      assert.equal(psql(backend, "SELECT count(*) FROM pg_indexes WHERE schemaname='saas' AND indexname=ANY(ARRAY['checkout_provider_configs_store_status_idx','quick_order_links_store_status_expiry_idx','quick_order_links_token_digest_idx','quick_order_link_items_link_position_idx','quick_order_link_operations_store_committed_idx']);"), "5");
      assert.equal(psql(backend, "SELECT to_regprocedure('saas.quick_link_canonical_image_url(uuid,uuid,uuid)')::text;"), "saas.quick_link_canonical_image_url(uuid,uuid,uuid)");
      const imageSource = psql(backend, "SELECT pg_get_functiondef('saas.quick_link_canonical_image_url(uuid,uuid,uuid)'::regprocedure);");
      for (const source of ["FROM saas.product_media AS media", "FROM saas.product_variants AS selected_variant", "selected_variant.store_id = p_store_id", "selected_variant.product_id = p_product_id", "selected_variant.id = p_variant_id", "media.store_id = p_store_id", "media.product_id = p_product_id", "media.status = 'active'", "media.variant_id = p_variant_id", "media.variant_id IS NULL", "ORDER BY (media.variant_id = p_variant_id) DESC NULLS LAST", "media.sort_order", "media.id", "LIMIT 1"]) assert.ok(imageSource.includes(source), `missing executable product-media source: ${source}`);
    });

    await scenario("every parent and child reference carries store authority", async () => {
      const definitions = psql(backend, `SELECT string_agg(conrelid::regclass::text||':'||pg_get_constraintdef(oid),E'\n' ORDER BY conrelid::regclass::text,conname) FROM pg_constraint WHERE conrelid=ANY(ARRAY['saas.checkout_provider_configs'::regclass,'saas.quick_order_links'::regclass,'saas.quick_order_link_items'::regclass,'saas.quick_order_link_operations'::regclass]) AND contype='f';`);
      for (const expected of [
        "FOREIGN KEY (store_id) REFERENCES saas.stores(id)",
        "FOREIGN KEY (store_id, currency) REFERENCES saas.stores(id, currency)",
        "FOREIGN KEY (store_id, creating_membership_id) REFERENCES saas.memberships(store_id, id)",
        "FOREIGN KEY (store_id, provider_config_id) REFERENCES saas.checkout_provider_configs(store_id, id)",
        "FOREIGN KEY (store_id, order_id) REFERENCES saas.orders(store_id, id)",
        "FOREIGN KEY (store_id, quick_order_link_id) REFERENCES saas.quick_order_links(store_id, id)",
        "FOREIGN KEY (store_id, product_id, variant_id) REFERENCES saas.product_variants(store_id, product_id, id)",
      ]) assert.ok(definitions.includes(expected), `missing composite authority: ${expected}`);
      assert.equal(psql(backend, "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='saas.product_variants'::regclass AND conname='product_variants_store_product_id_key';"), "UNIQUE (store_id, product_id, id)");
    });

    await scenario("PUBLIC ACLs are empty for every 024 relation and function", async () => {
      assert.equal(psql(backend, `SELECT count(*) FROM pg_class AS relation, LATERAL aclexplode(COALESCE(relation.relacl,acldefault('r',relation.relowner))) AS privilege WHERE relation.oid=ANY(ARRAY[${TABLES.map((table) => `'saas.${table}'::regclass`).join(",")}]) AND privilege.grantee=0;`), "0");
      assert.equal(psql(backend, `SELECT count(*) FROM unnest(ARRAY[${FUNCTIONS.map((signature) => `'${signature}'::regprocedure`).join(",")}]) AS function_oid(value), LATERAL aclexplode(COALESCE((SELECT proacl FROM pg_proc WHERE oid=function_oid.value),acldefault('f',(SELECT proowner FROM pg_proc WHERE oid=function_oid.value)))) AS privilege WHERE privilege.grantee=0;`), "0");
      assert.equal(psql(backend, `SELECT count(*) FROM unnest(ARRAY[${FUNCTIONS.map((signature) => `'${signature}'::regprocedure`).join(",")}]) AS function_oid(value) WHERE has_function_privilege('celebix_saas_app',function_oid.value,'EXECUTE');`), "0");
      assert.equal(psql(backend, "SELECT owner_role.rolname||':'||procedure.provolatile::text||':'||procedure.prosecdef::text||':'||procedure.proconfig::text FROM pg_proc AS procedure JOIN pg_roles AS owner_role ON owner_role.oid=procedure.proowner WHERE procedure.oid='saas.quick_link_canonical_image_url(uuid,uuid,uuid)'::regprocedure;"), "celebix_saas_owner:s:true:{\"search_path=pg_catalog, saas\"}");
    });

    await scenario("application direct table DML remains denied", async () => {
      for (const table of TABLES) {
        denied(backend, `SET ROLE celebix_saas_app; SELECT * FROM saas.${table};`);
        denied(backend, `SET ROLE celebix_saas_app; DELETE FROM saas.${table};`);
      }
    });

    seed(backend);

    await scenario("token digests are unique lowercase SHA-256 values only", async () => {
      denied(backend, insertLinkSql({ id: "60000000-0000-4000-8000-000000000010", digest: "A" }));
      denied(backend, insertLinkSql({ id: "60000000-0000-4000-8000-000000000011", digest: "a" }));
      denied(backend, insertLinkSql({ id: "60000000-0000-4000-8000-000000000012", digest: "-" }));
      assert.equal(psql(backend, "SELECT length(token_digest)||':'||(token_digest~'^[a-f0-9]{64}$') FROM saas.quick_order_links WHERE id='60000000-0000-4000-8000-000000000001';"), "64:true");
      assert.equal(psql(backend, `SELECT count(*) FROM (VALUES ('${PROVIDER_A}'::uuid),('${LINK_A}'::uuid),('${ITEM_A}'::uuid),('${OPERATION_A}'::uuid)) AS public_id(value) WHERE value::text~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';`), "4");
      denied(backend, `INSERT INTO saas.checkout_provider_configs(id,store_id,provider_key,status,public_origin,configuration_key_id,sealed_configuration,version,created_at,updated_at) VALUES ('50000000-0000-0000-8000-000000000099','${STORE_A}','paytr','active','https://www.paytr.com','key-1',${VALID_ENVELOPE},1,'2026-01-01','2026-01-01');`);
      denied(backend, insertLinkSql({ id: "60000000-0000-4000-0000-000000000099", digest: "7" }));
      denied(backend, `INSERT INTO saas.quick_order_link_items(id,store_id,quick_order_link_id,product_id,variant_id,position,product_name,unit_price_cents,quantity,line_total_cents,created_at) VALUES ('80000000-0000-9000-8000-000000000099','${STORE_A}','${LINK_A}','${PRODUCT_A}','${VARIANT_A}',9,'Invalid UUID',100,1,100,'2026-07-21');`);
      denied(backend, `INSERT INTO saas.quick_order_link_operations(operation_id,store_id,quick_order_link_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES ('90000000-0000-4000-f000-000000000099','${STORE_A}','${LINK_A}','create',repeat('7',64),${VALID_RESULT},'2026-07-21');`);
    });

    await scenario("sealed envelopes are exact bounded objects and never enter safe results", async () => {
      for (const canonical of ["AQ", "AQEBAQEBAQEBAQEB", "AgICAgICAgICAgICAgICAg", "cXVpY2stbGluay10b2tlbi1jaXBoZXJ0ZXh0"]) {
        assert.equal(psql(backend, `SELECT saas.quick_link_base64url_is_canonical('${canonical}');`), "t", canonical);
      }
      for (const noncanonical of ["A", "AR", "AgICAgICAgICAgICAgICAh", "A*", "AQ==", "AQ\n"]) {
        assert.equal(psql(backend, `SELECT saas.quick_link_base64url_is_canonical('${noncanonical}');`), "f", noncanonical);
      }
      assert.equal(psql(backend, `SELECT saas.quick_link_sealed_envelope_is_valid(${VALID_ENVELOPE},'key-1');`), "t");
      for (const invalid of [
        `'{"algorithm":"A256GCM","ciphertext":"cXVpY2s","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","version":1}'::jsonb`,
        `'{"algorithm":"A256GCM","ciphertext":"cXVpY2s","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1,"extra":"x"}'::jsonb`,
        `'{"algorithm":"A256GCM","ciphertext":1,"iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}'::jsonb`,
        `'{"algorithm":"A128GCM","ciphertext":"cXVpY2s","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}'::jsonb`,
        `'{"algorithm":"A256GCM","ciphertext":"cXVpY2s","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":2}'::jsonb`,
        `'{"algorithm":"A256GCM","ciphertext":"cXVpY2s","iv":"AQEBAQEBAQEBAQEB","keyId":"other","tag":"AgICAgICAgICAgICAgICAg","version":1}'::jsonb`,
        `'{"algorithm":"A256GCM","ciphertext":"A","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}'::jsonb`,
        `'{"algorithm":"A256GCM","ciphertext":"cXVpY2s","iv":"AQEBAQEBAQEBAQE","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}'::jsonb`,
        `'{"algorithm":"A256GCM","ciphertext":"cXVpY2s","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICA","version":1}'::jsonb`,
        `'{"algorithm":"A256GCM","ciphertext":"cXVpY2s","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAh","version":1}'::jsonb`,
        `pg_catalog.jsonb_build_object('algorithm','A256GCM','ciphertext',pg_catalog.repeat('A',8193),'iv','AQEBAQEBAQEBAQEB','keyId','key-1','tag','AgICAgICAgICAgICAgICAg','version',1)`,
        `pg_catalog.jsonb_build_object('algorithm','A256GCM','ciphertext',pg_catalog.repeat('A',8192),'iv','AQEBAQEBAQEBAQEB','keyId',pg_catalog.repeat('k',4096),'tag','AgICAgICAgICAgICAgICAg','version',1)`,
      ]) assert.equal(psql(backend, `SELECT saas.quick_link_sealed_envelope_is_valid(${invalid},'key-1');`), "f");

      const fullAddress = `'{"recipientName":"Ada Lovelace","phone":"+905551110000","line1":"Test 1","line2":"Kat 2","district":"Kadikoy","city":"Istanbul","postalCode":"34710","country":"TR"}'::jsonb`;
      assert.equal(psql(backend, `SELECT saas.quick_link_address_is_valid(${VALID_ADDRESS}) AND saas.quick_link_address_is_valid(${fullAddress});`), "t");
      for (const invalidAddress of [
        `'{"recipientName":"Ada","line1":"Test","city":"Istanbul","country":"TR"}'::jsonb`,
        `'{"recipientName":"Ada","phone":"+90555","line1":"Test","city":"Istanbul","country":"TR","extra":"x"}'::jsonb`,
        `'{"recipientName":"Ada","phone":123,"line1":"Test","city":"Istanbul","country":"TR"}'::jsonb`,
        `'{"recipientName":" Ada","phone":"+90555","line1":"Test","city":"Istanbul","country":"TR"}'::jsonb`,
        `'{"recipientName":"Ada\\nLovelace","phone":"+90555","line1":"Test","city":"Istanbul","country":"TR"}'::jsonb`,
        `'{"recipientName":"Ada","phone":"+90555","line1":"Test","city":"Istanbul","country":"tr"}'::jsonb`,
        `pg_catalog.jsonb_build_object('recipientName',pg_catalog.repeat('x',201),'phone','+90555','line1','Test','city','Istanbul','country','TR')`,
        `'[]'::jsonb`,
      ]) assert.equal(psql(backend, `SELECT saas.quick_link_address_is_valid(${invalidAddress});`), "f");

      const insertOperation = (id, kind, payload) => `INSERT INTO saas.quick_order_link_operations(operation_id,store_id,quick_order_link_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES ('${id}','${STORE_A}','${LINK_A}','${kind}',repeat('d',64),${payload},'2026-07-21');`;
      psql(backend, insertOperation("90000000-0000-4000-8000-000000000011", "cancel", VALID_RESULT));
      psql(backend, insertOperation("90000000-0000-4000-8000-000000000012", "duplicate", `'{"id":"${LINK_A}","status":"active","version":1,"expiresAt":"2026-07-22T10:00:00.123456Z","updatedAt":"2026-07-21T10:00:00.654321Z"}'::jsonb`));
      const invalidResults = [
        `'{"id":"${LINK_A}","status":"active","version":1,"expiresAt":"2026-07-22T10:00:00.000Z"}'::jsonb`,
        `'{"id":"${LINK_A}","status":"active","version":1,"expiresAt":"2026-07-22T10:00:00.000Z","updatedAt":"2026-07-21T10:00:00.000Z","extra":true}'::jsonb`,
        `'{"id":"${LINK_A}","status":"active","version":1,"expiresAt":"2026-07-22T10:00:00.000Z","updatedAt":"2026-07-21T10:00:00.000Z","metadata":{"token":"secret"}}'::jsonb`,
        `'{"id":"${LINK_A}","status":"active","version":1,"expiresAt":"2026-07-22T10:00:00.000Z","updatedAt":"2026-07-21T10:00:00.000Z","credential":"secret"}'::jsonb`,
        `'{"id":"${LINK_A}","status":"active","version":1,"expiresAt":"2026-07-22T10:00:00.000Z","updatedAt":"2026-07-21T10:00:00.000Z","secretMaterial":{"ciphertext":"secret"}}'::jsonb`,
        `'{"id":"not-a-uuid","status":"active","version":1,"expiresAt":"2026-07-22T10:00:00.000Z","updatedAt":"2026-07-21T10:00:00.000Z"}'::jsonb`,
        `'{"id":"${LINK_A}","status":"draft","version":1,"expiresAt":"2026-07-22T10:00:00.000Z","updatedAt":"2026-07-21T10:00:00.000Z"}'::jsonb`,
        `'{"id":"${LINK_A}","status":"active","version":"1","expiresAt":"2026-07-22T10:00:00.000Z","updatedAt":"2026-07-21T10:00:00.000Z"}'::jsonb`,
        `'{"id":"${LINK_A}","status":"active","version":0,"expiresAt":"2026-07-22T10:00:00.000Z","updatedAt":"2026-07-21T10:00:00.000Z"}'::jsonb`,
        `'{"id":"${LINK_A}","status":"active","version":1.5,"expiresAt":"2026-07-22T10:00:00.000Z","updatedAt":"2026-07-21T10:00:00.000Z"}'::jsonb`,
        `'{"id":"${LINK_A}","status":"active","version":1,"expiresAt":"2026-07-22T10:00:00Z","updatedAt":"2026-07-21T10:00:00.000Z"}'::jsonb`,
        `'{"id":"${LINK_A}","status":"active","version":1,"expiresAt":"2026-02-30T10:00:00.000Z","updatedAt":"2026-07-21T10:00:00.000Z"}'::jsonb`,
      ];
      for (let index = 0; index < invalidResults.length; index += 1) {
        const id = `90000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`;
        denied(backend, insertOperation(id, "create", invalidResults[index]));
      }
      const projected = psql(backend, `SELECT result_payload::text FROM saas.quick_order_link_operations WHERE operation_id='${OPERATION_A}';`);
      assert.deepEqual(JSON.parse(projected), { id: LINK_A, status: "active", version: 1, expiresAt: "2026-07-22T10:00:00.000Z", updatedAt: "2026-07-21T10:00:00.000Z" });
    });

    await scenario("quick-link operation rows are immutable", async () => {
      assert.match(denied(backend, `UPDATE saas.quick_order_link_operations SET result_payload='{}' WHERE operation_id='${OPERATION_A}';`).stderr, /QUICK_LINK_OPERATION_IMMUTABLE/);
      assert.match(denied(backend, `DELETE FROM saas.quick_order_link_operations WHERE operation_id='${OPERATION_A}';`).stderr, /QUICK_LINK_OPERATION_IMMUTABLE/);
    });

    await scenario("cross-store and wrong-product catalog references are rejected", async () => {
      denied(backend, `INSERT INTO saas.quick_order_link_items(id,store_id,quick_order_link_id,product_id,variant_id,position,product_name,unit_price_cents,quantity,line_total_cents,created_at) VALUES ('80000000-0000-4000-8000-000000000010','${STORE_A}','${LINK_A}','${PRODUCT_B}','${VARIANT_B}',1,'Foreign',100,1,100,'2026-07-21');`);
      denied(backend, `INSERT INTO saas.quick_order_link_items(id,store_id,quick_order_link_id,product_id,variant_id,position,product_name,unit_price_cents,quantity,line_total_cents,created_at) VALUES ('80000000-0000-4000-8000-000000000011','${STORE_A}','${LINK_A}','${PRODUCT_A2}','${VARIANT_A}',1,'Mismatch',100,1,100,'2026-07-21');`);
      assert.equal(psql(backend, `SELECT saas.quick_link_canonical_image_url('${STORE_A}','${PRODUCT_A}','${VARIANT_A}');`), `https://cdn.example.test/stores/${STORE_A}/products/${PRODUCT_A}/43000000-0000-4000-8000-000000000001.webp`);
      assert.equal(psql(backend, `SELECT saas.quick_link_canonical_image_url('${STORE_A}','${PRODUCT_A}','${VARIANT_A_GENERIC}');`), `https://cdn.example.test/stores/${STORE_A}/products/${PRODUCT_A}/43000000-0000-4000-8000-000000000002.webp`);
      assert.equal(psql(backend, `SELECT COALESCE(saas.quick_link_canonical_image_url('${STORE_A}','${PRODUCT_A}','${VARIANT_A2}'),'<null>');`), "<null>");
      assert.equal(psql(backend, `SELECT COALESCE(saas.quick_link_canonical_image_url('${STORE_A}','${PRODUCT_A}','41000000-0000-4000-8000-000000000099'),'<null>');`), "<null>");
      assert.equal(psql(backend, `SELECT COALESCE(saas.quick_link_canonical_image_url('${STORE_A}','${PRODUCT_A2}','${VARIANT_A2}'),'<null>');`), "<null>");
      assert.equal(psql(backend, `SELECT COALESCE(saas.quick_link_canonical_image_url('${STORE_B}','${PRODUCT_A}','${VARIANT_A}'),'<null>');`), "<null>");
    });

    await scenario("link currency must equal its store currency", async () => {
      denied(backend, `UPDATE saas.quick_order_links SET currency='USD' WHERE id='${LINK_A}';`);
      assert.equal(psql(backend, `SELECT link.currency||':'||store.currency FROM saas.quick_order_links AS link JOIN saas.stores AS store ON store.id=link.store_id WHERE link.id='${LINK_A}';`), "TRY:TRY");
    });

    await scenario("provider config must belong to the same active store", async () => {
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; ${insertLinkSql({ id: "60000000-0000-4000-8000-000000000025", digest: "9" })} DELETE FROM saas.quick_order_links WHERE id='60000000-0000-4000-8000-000000000025'; COMMIT;`);
      denied(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; ${insertLinkSql({ id: "60000000-0000-4000-8000-000000000020", provider: PROVIDER_B, digest: "d" })} COMMIT;`);
      psql(backend, `UPDATE saas.checkout_provider_configs SET status='disabled',updated_at='2026-07-21' WHERE id='${PROVIDER_A}';`);
      denied(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; ${insertLinkSql({ id: "60000000-0000-4000-8000-000000000021", digest: "e" })} COMMIT;`);
      psql(backend, `UPDATE saas.checkout_provider_configs SET status='active',updated_at='2026-07-21' WHERE id='${PROVIDER_A}'; UPDATE saas.stores SET status='suspended',updated_at='2026-07-21' WHERE id='${STORE_A}';`);
      denied(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; ${insertLinkSql({ id: "60000000-0000-4000-8000-000000000022", digest: "f" })} COMMIT;`);
      psql(backend, `UPDATE saas.stores SET status='active',updated_at='2026-07-21' WHERE id='${STORE_A}';`);

      const authority = (action) => psql(backend, `SELECT COALESCE(saas.quick_link_merchant_authority_error('${STORE_A}','${PRINCIPAL_A}','${MEMBERSHIP_A}','${PLAN}','free_starter',1,'2026-07-21','${action}'),'<null>');`);
      assert.equal(authority("quick_links.read"), "<null>");
      assert.equal(authority("quick_links.manage"), "<null>");
      assert.equal(authority("orders.read"), "durable_authority_invalid");
      psql(backend, "ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable;");
      try {
        psql(backend, `UPDATE saas.plan_features SET enabled=false WHERE plan_id='${PLAN}' AND feature_key='orders';`);
        assert.equal(authority("quick_links.read"), "feature_not_enabled");
        psql(backend, `UPDATE saas.plan_features SET enabled=true WHERE plan_id='${PLAN}' AND feature_key='orders'; UPDATE saas.plan_features SET enabled=false WHERE plan_id='${PLAN}' AND feature_key='checkout';`);
        assert.equal(authority("quick_links.read"), "feature_not_enabled");
      } finally {
        psql(backend, `UPDATE saas.plan_features SET enabled=true WHERE plan_id='${PLAN}' AND feature_key IN ('orders','checkout'); ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable;`);
      }
    });

    await scenario("invalid status expiry and lifecycle timestamps are rejected", async () => {
      denied(backend, insertLinkSql({ id: "60000000-0000-4000-8000-000000000030", status: "draft", digest: "1" }));
      denied(backend, insertLinkSql({ id: "60000000-0000-4000-8000-000000000031", expires: "2026-07-21 18:00:00+00", digest: "2" }));
      denied(backend, insertLinkSql({ id: "60000000-0000-4000-8000-000000000032", status: "paid", digest: "3", opened: "'2026-07-21 11:00:00+00'", paid: "'2026-07-21 10:30:00+00'", order: `'${ORDER_A}'::uuid`, updated: "2026-07-21 11:00:00+00" }));
      denied(backend, insertLinkSql({ id: "60000000-0000-4000-8000-000000000033", status: "cancelled", digest: "4", cancelled: "'2026-07-21 12:00:00+00'", updated: "2026-07-21 11:00:00+00" }));
    });

    await scenario("persisted total and line arithmetic is bounded and exact", async () => {
      denied(backend, `UPDATE saas.quick_order_links SET total_cents=9999 WHERE id='${LINK_A}';`);
      denied(backend, `UPDATE saas.quick_order_links SET subtotal_cents=7999200000000001,shipping_cents=0,discount_cents=0,total_cents=7999200000000001 WHERE id='${LINK_A}';`);
      denied(backend, `INSERT INTO saas.quick_order_link_items(id,store_id,quick_order_link_id,product_id,variant_id,position,product_name,unit_price_cents,quantity,line_total_cents,created_at) VALUES ('80000000-0000-4000-8000-000000000020','${STORE_A}','${LINK_A}','${PRODUCT_A}','${VARIANT_A}',1,'Overflow',8000000001,9999,79992000009999,'2026-07-21');`);
      psql(backend, `UPDATE saas.quick_order_links SET subtotal_cents=7999200000000000,shipping_cents=500000000000000,discount_cents=500000000000000,total_cents=7999200000000000 WHERE id='${LINK_A}';`);
      psql(backend, `INSERT INTO saas.quick_order_link_items(id,store_id,quick_order_link_id,product_id,variant_id,position,product_name,unit_price_cents,quantity,line_total_cents,created_at) VALUES ('80000000-0000-4000-8000-000000000021','${STORE_A}','${LINK_A}','${PRODUCT_A}','${VARIANT_A}',1,'Maximum',8000000000,9999,79992000000000,'2026-07-21');`);
      assert.equal(psql(backend, `SELECT subtotal_cents||':'||shipping_cents||':'||discount_cents||':'||total_cents FROM saas.quick_order_links WHERE id='${LINK_A}';`), "7999200000000000:500000000000000:500000000000000:7999200000000000");
      assert.equal(psql(backend, "SELECT unit_price_cents||':'||quantity||':'||line_total_cents FROM saas.quick_order_link_items WHERE id='80000000-0000-4000-8000-000000000021';"), "8000000000:9999:79992000000000");
      const hugeLink = denied(backend, `UPDATE saas.quick_order_links SET subtotal_cents=9223372036854775807,shipping_cents=9223372036854775807,discount_cents=0,total_cents=9223372036854775807 WHERE id='${LINK_A}';`);
      assert.doesNotMatch(hugeLink.stderr, /bigint out of range|value out of range/i);
      assert.match(hugeLink.stderr, /quick_order_links_(subtotal_cents|total_cents)_check/);
      const hugeItem = denied(backend, `INSERT INTO saas.quick_order_link_items(id,store_id,quick_order_link_id,product_id,variant_id,position,product_name,unit_price_cents,quantity,line_total_cents,created_at) VALUES ('80000000-0000-4000-8000-000000000022','${STORE_A}','${LINK_A}','${PRODUCT_A}','${VARIANT_A}',2,'Huge',9223372036854775807,9999,9223372036854775807,'2026-07-21');`);
      assert.doesNotMatch(hugeItem.stderr, /bigint out of range|value out of range/i);
      assert.match(hugeItem.stderr, /quick_order_link_items_(unit_price|line_total)_check/);
    });

    await scenario("forced RLS denies cross-store visibility even after a temporary grant", async () => {
      psql(backend, `GRANT SELECT ON ${TABLES.map((table) => `saas.${table}`).join(",")} TO celebix_saas_app;`);
      for (const table of TABLES) assert.equal(psql(backend, `SET ROLE celebix_saas_app; SELECT count(*) FROM saas.${table};`), "0");
      psql(backend, `REVOKE SELECT ON ${TABLES.map((table) => `saas.${table}`).join(",")} FROM celebix_saas_app;`);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.quick_order_links WHERE store_id='${STORE_A}';`), "1");
      assert.equal(psql(backend, `SELECT count(*) FROM saas.quick_order_links WHERE store_id='${STORE_B}';`), "1");
    });

    createDatabase(backend, ROLLBACK_DATABASE, DATABASE);
    await scenario("down removes only 024 objects and reapply restores them", async () => {
      for (const requiredKind of ["column:", "trigger:", "relation:"]) assert.ok(pre024Inventory.includes(requiredKind), `pre-024 inventory omitted ${requiredKind}`);
      assert.ok(pre024Inventory.includes(":<null>"), "pre-024 inventory omitted column ACL/default sentinels");
      apply(backend, "202607220024_quick_order_links.down.sql", ROLLBACK_DATABASE);
      assert.equal(psql(backend, `SELECT count(*) FROM pg_class AS relation JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='saas' AND relation.relname=ANY(ARRAY['${TABLES.join("','")}']);`, ROLLBACK_DATABASE), "0");
      assert.equal(psql(backend, `SELECT count(*) FROM unnest(ARRAY[${FUNCTIONS.map((signature) => `'${signature}'`).join(",")}]) AS signature(value) WHERE to_regprocedure(signature.value) IS NOT NULL;`, ROLLBACK_DATABASE), "0");
      assert.equal(psql(backend, "SELECT count(*) FROM pg_constraint WHERE conrelid='saas.product_variants'::regclass AND conname='product_variants_store_product_id_key';", ROLLBACK_DATABASE), "0");
      assert.equal(psql(backend, "SELECT to_regclass('saas.orders')::text||':'||to_regprocedure('saas.orders_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)')::text;", ROLLBACK_DATABASE), "saas.orders:saas.orders_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)");
      assert.equal(databaseInventory(backend, ROLLBACK_DATABASE), pre024Inventory, "down changed a pre-024 table/function/constraint/index/policy/ACL object");
      apply(backend, "202607220024_quick_order_links.up.sql", ROLLBACK_DATABASE);
      apply(backend, "202607220024_quick_order_links_assertions.sql", ROLLBACK_DATABASE);
      assert.equal(psql(backend, `SELECT count(*) FROM pg_class AS relation JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='saas' AND relation.relname=ANY(ARRAY['${TABLES.join("','")}']);`, ROLLBACK_DATABASE), "4");
      assert.equal(psql(backend, "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='saas.product_variants'::regclass AND conname='product_variants_store_product_id_key';", ROLLBACK_DATABASE), "UNIQUE (store_id, product_id, id)");
      assert.equal(databaseInventory(backend, ROLLBACK_DATABASE), post024Inventory, "reapply did not restore the exact 024 object inventory");
    });

    assert.equal(completed.length, TOTAL - 1);
    cleanupPaths = { temporaryDirectory: backend.temporaryDirectory, socketDirectory: backend.socketDirectory };
    stopPostgres(backend);
    backend = undefined;
    await scenario("cluster socket and partial-start allocations are always cleaned", async () => {
      assert.equal(existsSync(cleanupPaths.temporaryDirectory), false);
      assert.equal(existsSync(cleanupPaths.socketDirectory), false);
      let socketBackend;
      assert.throws(() => startPostgres({
        token: `${TOKEN}socket`,
        onAllocate(candidate) { socketBackend = candidate; },
        makeDirectory() { throw new Error("injected socket mkdir failure"); },
      }), /injected socket mkdir failure/);
      assert.equal(existsSync(socketBackend.temporaryDirectory), false);
      assert.equal(existsSync(socketBackend.socketDirectory), false);
      const preexistingToken = `${TOKEN}preexisting`;
      const preexistingSocket = path.join("/tmp", `c3b2-${preexistingToken}`);
      const sentinel = path.join(preexistingSocket, "sentinel");
      mkdirSync(sentinel, { recursive: true, mode: 0o700 });
      try {
        let preexistingBackend;
        assert.throws(() => startPostgres({
          token: preexistingToken,
          onAllocate(candidate) { preexistingBackend = candidate; },
        }), (error) => error?.code === "EEXIST");
        assert.equal(existsSync(preexistingBackend.temporaryDirectory), false);
        assert.equal(existsSync(preexistingSocket), true);
        assert.equal(existsSync(sentinel), true);
      } finally {
        rmSync(preexistingSocket, { recursive: true, force: true });
      }
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
    process.stdout.write(`PASS ${TOTAL}/${TOTAL} quick-order links PostgreSQL 16 harness complete; cleanup confirmed\n`);
  } finally {
    stopPostgres(backend);
  }
}

await main();
