import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SQL = path.join(ROOT, "apps", "owner", "scripts", "sql", "saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const TOKEN = randomBytes(6).toString("hex");
const DATABASE = `abandoned_cart_${TOKEN}`;
const RESTORE_DATABASE = `${DATABASE}_restore`;
const TOTAL = 28;
const completed = [];
const STORE_A = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const PRODUCT_A = "41000000-0000-4000-8000-000000000001";
const PRODUCT_B = "41000000-0000-4000-8000-000000000002";
const VARIANT_A = "42000000-0000-4000-8000-000000000001";
const VARIANT_B = "42000000-0000-4000-8000-000000000002";
const CART_A = "71000000-0000-4000-8000-000000000001";
const CART_B = "71000000-0000-4000-8000-000000000002";
const CART_C = "71000000-0000-4000-8000-000000000003";
const ITEM_A = "72000000-0000-4000-8000-000000000001";
const OPERATION_A = "73000000-0000-4000-8000-000000000001";
const OPERATION_B = "73000000-0000-4000-8000-000000000002";
const OPERATION_C = "73000000-0000-4000-8000-000000000003";
const PLAN = "00000000-0000-4000-8000-000000000001";
const PRINCIPAL_OWNER = "20000000-0000-4000-8000-000000000001";
const PRINCIPAL_EDITOR = "20000000-0000-4000-8000-000000000002";
const PRINCIPAL_ANALYST = "20000000-0000-4000-8000-000000000003";
const MEMBERSHIP_OWNER = "30000000-0000-4000-8000-000000000001";
const MEMBERSHIP_EDITOR = "30000000-0000-4000-8000-000000000002";
const MEMBERSHIP_ANALYST = "30000000-0000-4000-8000-000000000003";
const NOW = "2026-07-22T14:00:00.000Z";
const CAPTURE_ORDER = "40000000-0000-4000-8000-000000000001";
const CAPTURE_HOST = "cart-store-a.example.test";

const priorMigrations = [
  "202607110001_roles.up.sql", "202607110002_foundation.up.sql", "202607110003_free_starter.seed.sql",
  "202607110003_plan_versions.freeze.sql", "202607110004_grants.sql", "202607110005_catalog_assertions.sql",
  "202607110007_identity_roles.up.sql", "202607110008_identity_persistence.up.sql", "202607110009_identity_grants.sql",
  "202607110010_identity_catalog_assertions.sql", "202607120012_verified_identity_snapshot.up.sql",
  "202607120013_verified_identity_grants.sql", "202607120014_verified_identity_catalog_assertions.sql",
  "202607140015_panel_sessions.up.sql", "202607140016_panel_session_handoffs.up.sql",
  "202607140017_panel_browser_bindings.up.sql", "202607160018_product_catalog.up.sql",
  "202607160018_product_catalog_assertions.sql", "202607160019_product_catalog_api.up.sql",
  "202607160019_product_catalog_api_assertions.sql", "202607160020_pilot_storefront_media_domains.up.sql",
  "202607160020_pilot_storefront_media_domains_assertions.sql", "202607200021_catalog_dashboard_summary.up.sql",
  "202607200021_catalog_dashboard_summary_assertions.sql", "202607210022_order_management.up.sql",
  "202607210022_order_management_assertions.sql", "202607210023_order_management_api.up.sql",
  "202607210023_order_management_api_assertions.sql", "202607220024_quick_order_links.up.sql",
  "202607220024_quick_order_links_assertions.sql", "202607220025_quick_order_links_api.up.sql",
  "202607220025_quick_order_links_api_assertions.sql", "202607220026_quick_order_checkout_runtime.up.sql",
  "202607220026_quick_order_checkout_runtime_assertions.sql", "202607220027_quick_order_checkout_api.up.sql",
  "202607220027_quick_order_checkout_api_assertions.sql", "202607220028_quick_order_redemption_expiry_authority.up.sql",
  "202607220028_quick_order_redemption_expiry_authority_assertions.sql", "202607220029_quick_order_settlement_authority.up.sql",
  "202607220029_quick_order_settlement_authority_assertions.sql",
];

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* continue */ }
  }
  return null;
}

function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: ROOT, encoding: options.binary ? null : "utf8", input: options.input,
    env: { PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${String(result.stderr ?? "")}`);
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
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => {
      if (status !== 0) reject(new Error(`async psql failed\n${stderr}`));
      else resolve({ stdout, stderr });
    });
    child.stdin.end(options.input);
  });
}

function startPostgres() {
  assertSafeEnvironment();
  const executables = Object.fromEntries(REQUIRED_NATIVE_TOOLS.map((name) => [name, executable(name)]));
  if (Object.values(executables).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "celebix-abandoned-cart-"));
  const dataDirectory = path.join(temporaryDirectory, "data");
  const socketDirectory = path.join("/tmp", `c3b3-${TOKEN}`);
  const port = 20_000 + Math.floor(Math.random() * 15_000);
  mkdirSync(socketDirectory, { mode: 0o700 });
  const backend = { executables, temporaryDirectory, dataDirectory, socketDirectory, port, started: false };
  try {
    command(executables.initdb, ["-D", dataDirectory, "--auth=trust", "--username=postgres", "--no-locale"]);
    command(executables.pg_ctl, ["-D", dataDirectory, "-o", `-k ${socketDirectory} -p ${port} -h ''`, "-l", path.join(temporaryDirectory, "postgres.log"), "start"]);
    backend.started = true;
    return backend;
  } catch (error) {
    stopPostgres(backend);
    throw error;
  }
}

function stopPostgres(backend) {
  if (!backend) return;
  if (backend.started) command(backend.executables.pg_ctl, ["-D", backend.dataDirectory, "-m", "fast", "stop"], { allowFailure: true });
  rmSync(backend.socketDirectory, { recursive: true, force: true });
  rmSync(backend.temporaryDirectory, { recursive: true, force: true });
}

function psqlResult(backend, source, database = DATABASE, options = {}) {
  return command(backend.executables.psql, [
    "-h", backend.socketDirectory, "-p", String(backend.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], { input: source, allowFailure: options.allowFailure });
}

function psql(backend, source, database = DATABASE) {
  return psqlResult(backend, source, database).stdout.trim();
}

function apply(backend, file, database = DATABASE) {
  psql(backend, readFileSync(path.join(SQL, file), "utf8"), database);
}

function denied(backend, source, database = DATABASE) {
  const result = psqlResult(backend, source, database, { allowFailure: true });
  assert.notEqual(result.status, 0, "statement unexpectedly succeeded");
  return result;
}

function authorityArguments({ principal = PRINCIPAL_OWNER, membership = MEMBERSHIP_OWNER, store = STORE_A } = {}) {
  return `'${store}'::uuid,'${principal}'::uuid,'${membership}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${NOW}'::timestamptz`;
}

function apiSql(functionName, extraArguments = "", authority = {}) {
  return `SET ROLE celebix_saas_app; SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)::text FROM saas.${functionName}(${authorityArguments(authority)}${extraArguments ? `,${extraArguments}` : ""});`;
}

function api(backend, functionName, extraArguments = "", authority = {}, database = DATABASE) {
  return JSON.parse(psql(backend, apiSql(functionName, extraArguments, authority), database));
}

function workflowApi(backend, functionName, argumentsSql, database = DATABASE) {
  return JSON.parse(psql(backend, `SET ROLE celebix_saas_workflow; SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)::text FROM saas.${functionName}(${argumentsSql});`, database));
}

async function apiAsync(backend, functionName, extraArguments = "", authority = {}) {
  const result = await commandAsync(backend.executables.psql, [
    "-h", backend.socketDirectory, "-p", String(backend.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", DATABASE,
  ], { input: apiSql(functionName, extraArguments, authority) });
  return JSON.parse(result.stdout.trim());
}

async function scenario(name, run) {
  await run();
  completed.push(name);
  process.stdout.write(`PASS ${completed.length}/${TOTAL} ${name}\n`);
}

function seed(backend, database = DATABASE) {
  psql(backend, `
    BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
      ('${PRINCIPAL_OWNER}','https://identity.example.test/oidc','cart-owner','owner@example.test',true,'2026-01-01','2026-01-01'),
      ('${PRINCIPAL_EDITOR}','https://identity.example.test/oidc','cart-editor','editor@example.test',true,'2026-01-01','2026-01-01'),
      ('${PRINCIPAL_ANALYST}','https://identity.example.test/oidc','cart-analyst','analyst@example.test',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
      ('${STORE_A}','Cart Store A','cart-store-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
      ('${STORE_B}','Cart Store B','cart-store-b','active','tr','TRY','default','2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
      ('${MEMBERSHIP_OWNER}','${PRINCIPAL_OWNER}','${STORE_A}','store_owner','active','2026-01-01','2026-01-01'),
      ('${MEMBERSHIP_EDITOR}','${PRINCIPAL_EDITOR}','${STORE_A}','editor','active','2026-01-01','2026-01-01'),
      ('${MEMBERSHIP_ANALYST}','${PRINCIPAL_ANALYST}','${STORE_A}','analyst','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
    VALUES ('70000000-0000-4000-8000-000000000001','${STORE_A}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
    INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES
      ('80000000-0000-4000-8000-000000000001','${STORE_A}','${CAPTURE_HOST}','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1),
      ('80000000-0000-4000-8000-000000000002','${STORE_B}','cart-store-b.example.test','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
    INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES
      ('${PRODUCT_A}','${STORE_A}','cart-product-a','Cart Product A','active','TRY',1,'2026-01-01','2026-01-01'),
      ('${PRODUCT_B}','${STORE_B}','cart-product-b','Cart Product B','active','TRY',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES
      ('${VARIANT_A}','${PRODUCT_A}','${STORE_A}','Default',12500,false,0,'active','{}',1,'2026-01-01','2026-01-01'),
      ('${VARIANT_B}','${PRODUCT_B}','${STORE_B}','Default',12500,false,0,'active','{}',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at)
    VALUES ('${CAPTURE_ORDER}','${STORE_A}','CAPTURE-1','storefront','Ada Lovelace','ada@example.test','TRY',12500,0,0,12500,'confirmed','completed','{"recipientName":"Ada Lovelace","line1":"Test 1","city":"Istanbul","country":"TR"}',1,'2026-07-22','2026-07-22');
    INSERT INTO saas.abandoned_carts(id,store_id,public_cart_digest,status,customer_name,customer_email,currency,subtotal_cents,discount_cents,total_cents,checkout_started_at,last_activity_at,abandoned_at,version,created_at,updated_at)
    VALUES
      ('${CART_A}','${STORE_A}',repeat('a',64),'abandoned','Ada Lovelace','ada@example.test','TRY',12500,500,12000,'2026-07-22 11:00+00','2026-07-22 12:00+00','2026-07-22 12:00+00',1,'2026-07-22 11:00+00','2026-07-22 12:00+00'),
      ('${CART_C}','${STORE_A}',repeat('9',64),'abandoned','Grace Hopper','grace@example.test','TRY',20000,0,20000,'2026-07-22 10:00+00','2026-07-22 11:30+00','2026-07-22 11:30+00',1,'2026-07-22 10:00+00','2026-07-22 11:30+00');
    INSERT INTO saas.abandoned_cart_items(id,store_id,cart_id,product_id,variant_id,position,product_name,variant_name,sku,image_url,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
    VALUES ('${ITEM_A}','${STORE_A}','${CART_A}','${PRODUCT_A}','${VARIANT_A}',0,'Cart Product A','Default','CART-A','https://cdn.celebix.site/cart-a.webp',12500,1,500,12000,'2026-07-22 11:00+00');
    INSERT INTO saas.abandoned_cart_operations(operation_id,store_id,cart_id,operation_kind,payload_fingerprint,result_payload,committed_at)
    VALUES ('${OPERATION_A}','${STORE_A}','${CART_A}','mark_recovered',repeat('b',64),'{}','2026-07-22 12:00+00');
    COMMIT;
  `, database);
}

async function main() {
  let backend;
  try {
    backend = startPostgres();
    psql(backend, `CREATE DATABASE ${DATABASE};`, "postgres");
    for (const migration of priorMigrations) apply(backend, migration);
    apply(backend, "202607220030_abandoned_carts.up.sql");
    apply(backend, "202607220030_abandoned_carts_assertions.sql");
    apply(backend, "202607220031_abandoned_cart_api.up.sql");
    apply(backend, "202607220031_abandoned_cart_api_assertions.sql");
    apply(backend, "202607220032_abandoned_cart_capture.up.sql");
    apply(backend, "202607220032_abandoned_cart_capture_assertions.sql");

    await scenario("PostgreSQL 16 applies migrations 001-032", () => {
      assert.match(psql(backend, "SHOW server_version;"), /^16\./);
    });

    await scenario("phase3b3 manifest pins exact migration checksums", () => {
      const manifest = JSON.parse(readFileSync(path.join(SQL, "phase3b3-abandoned-cart-manifest.json"), "utf8"));
      assert.equal(manifest.postgresqlMajor, 16);
      assert.equal(manifest.artifacts.length, 9);
      for (const artifact of manifest.artifacts) {
        const digest = createHash("sha256").update(readFileSync(path.join(SQL, artifact.file))).digest("hex");
        assert.equal(digest, artifact.sha256);
      }
    });

    await scenario("030 owns forced-RLS store-scoped cart tables", () => {
      assert.equal(psql(backend, `SELECT c.relname||':'||r.rolname||':'||c.relrowsecurity||':'||c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='saas' AND c.relname IN ('abandoned_carts','abandoned_cart_items','abandoned_cart_operations') ORDER BY c.relname;`), [
        "abandoned_cart_items:celebix_saas_owner:true:true",
        "abandoned_cart_operations:celebix_saas_owner:true:true",
        "abandoned_carts:celebix_saas_owner:true:true",
      ].join("\n"));
    });

    await scenario("runtime roles have no cart table privileges", () => {
      assert.equal(psql(backend, `SELECT count(*) FROM (VALUES ('celebix_saas_app'),('celebix_saas_workflow'),('celebix_saas_host_resolver')) roles(role_name), (VALUES ('abandoned_carts'),('abandoned_cart_items'),('abandoned_cart_operations')) tables(table_name) WHERE has_table_privilege(role_name,'saas.'||table_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');`), "0");
    });

    await scenario("cart relationships are store-composite", () => {
      const definitions = psql(backend, `SELECT conname||':'||pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid IN ('saas.abandoned_carts'::regclass,'saas.abandoned_cart_items'::regclass,'saas.abandoned_cart_operations'::regclass) AND contype='f' ORDER BY conname;`);
      assert.match(definitions, /FOREIGN KEY \(store_id, cart_id\) REFERENCES saas\.abandoned_carts\(store_id, id\)/);
      assert.match(definitions, /FOREIGN KEY \(store_id, product_id\) REFERENCES saas\.products\(store_id, id\)/);
      assert.match(definitions, /FOREIGN KEY \(store_id, variant_id\) REFERENCES saas\.product_variants\(store_id, id\)/);
      assert.match(definitions, /FOREIGN KEY \(store_id, currency\) REFERENCES saas\.stores\(id, currency\)/);
    });

    seed(backend);

    await scenario("valid abandoned cart item and immutable operation persist", () => {
      assert.equal(psql(backend, `SELECT c.status||':'||count(i.id)||':'||c.total_cents FROM saas.abandoned_carts c JOIN saas.abandoned_cart_items i ON i.store_id=c.store_id AND i.cart_id=c.id WHERE c.id='${CART_A}' GROUP BY c.status,c.total_cents;`), "abandoned:1:12000");
    });

    await scenario("cross-store cart and catalog foreign keys fail closed", () => {
      denied(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.abandoned_cart_items(id,store_id,cart_id,product_id,variant_id,position,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at) VALUES ('72000000-0000-4000-8000-000000000002','${STORE_B}','${CART_A}','${PRODUCT_B}','${VARIANT_B}',1,'Wrong Store',1,1,0,1,now());`);
    });

    await scenario("money digest image and text constraints fail closed", () => {
      denied(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.abandoned_carts(id,store_id,public_cart_digest,status,currency,subtotal_cents,discount_cents,total_cents,checkout_started_at,last_activity_at,version,created_at,updated_at) VALUES ('${CART_B}','${STORE_A}','BAD','active','try',100,5,1,now(),now(),1,now(),now());`);
      denied(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.abandoned_cart_items(id,store_id,cart_id,position,product_name,image_url,unit_price_cents,quantity,discount_cents,line_total_cents,created_at) VALUES ('72000000-0000-4000-8000-000000000003','${STORE_A}','${CART_A}',1,'Bad Image','http://cdn.celebix.site/x',100,1,0,100,now());`);
    });

    await scenario("cart lifecycle and timestamp constraints fail closed", () => {
      denied(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.abandoned_carts(id,store_id,public_cart_digest,status,currency,subtotal_cents,discount_cents,total_cents,checkout_started_at,last_activity_at,version,created_at,updated_at) VALUES ('${CART_B}','${STORE_A}',repeat('c',64),'recovered','TRY',100,0,100,'2026-07-22','2026-07-22',1,'2026-07-22','2026-07-22');`);
    });

    await scenario("operation history is immutable", () => {
      assert.match(String(denied(backend, `SET ROLE celebix_saas_owner; UPDATE saas.abandoned_cart_operations SET result_payload='{"changed":true}' WHERE operation_id='${OPERATION_A}';`).stderr), /ABANDONED_CART_OPERATION_IMMUTABLE/);
      assert.match(String(denied(backend, `SET ROLE celebix_saas_owner; DELETE FROM saas.abandoned_cart_operations WHERE operation_id='${OPERATION_A}';`).stderr), /ABANDONED_CART_OPERATION_IMMUTABLE/);
    });

    await scenario("app direct DML remains denied", () => {
      denied(backend, "SET ROLE celebix_saas_app; SELECT * FROM saas.abandoned_carts;");
      denied(backend, "SET ROLE celebix_saas_app; INSERT INTO saas.abandoned_cart_operations(operation_id,store_id,cart_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES (gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'archive',repeat('a',64),'{}',now());");
    });

    await scenario("app role executes only six bounded cart API functions", () => {
      assert.equal(psql(backend, `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname IN ('abandoned_carts_summary','abandoned_carts_list','abandoned_carts_get','abandoned_carts_mark_recovered','abandoned_carts_archive','abandoned_carts_recover_operation') AND has_function_privilege('celebix_saas_app',p.oid,'EXECUTE');`), "6");
      assert.equal(psql(backend, `SELECT has_function_privilege('celebix_saas_app','saas.abandoned_carts_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)','EXECUTE');`), "f");
    });

    await scenario("summary list and detail project exact tenant-safe cart data", () => {
      const summary = api(backend, "abandoned_carts_summary");
      assert.equal(summary.outcome, "summarized");
      assert.deepEqual(summary.result, { abandoned: 2, recovered: 0, lostValueCents: 32000, recoveredValueCents: 0, currency: "TRY", asOf: NOW });
      const listed = api(backend, "abandoned_carts_list", "'abandoned',NULL,'highest',1,NULL,NULL,NULL");
      assert.equal(listed.outcome, "listed");
      assert.equal(listed.result.items.length, 1);
      assert.equal(listed.result.items[0].id, CART_C);
      assert.deepEqual(Object.keys(listed.result.nextCursor).sort(), ["id", "lastActivityAt", "totalCents"]);
      const cursor = listed.result.nextCursor;
      const secondPage = api(backend, "abandoned_carts_list", `'abandoned',NULL,'highest',1,${cursor.totalCents},'${cursor.lastActivityAt}'::timestamptz,'${cursor.id}'::uuid`);
      assert.equal(secondPage.result.items[0].id, CART_A);
      assert.equal(Object.hasOwn(listed.result.items[0], "storeId"), false);
      const found = api(backend, "abandoned_carts_get", `'${CART_A}'::uuid`);
      assert.equal(found.outcome, "found");
      assert.equal(found.result.items.length, 1);
      assert.equal(found.result.items[0].imageUrl, "https://cdn.celebix.site/cart-a.webp");
    });

    await scenario("editor and analyst read while cart management remains bounded", () => {
      assert.equal(api(backend, "abandoned_carts_summary", "", { principal: PRINCIPAL_EDITOR, membership: MEMBERSHIP_EDITOR }).outcome, "summarized");
      assert.equal(api(backend, "abandoned_carts_summary", "", { principal: PRINCIPAL_ANALYST, membership: MEMBERSHIP_ANALYST }).outcome, "summarized");
      assert.equal(api(backend, "abandoned_carts_mark_recovered", `'${OPERATION_B}'::uuid,repeat('c',64),'${CART_A}'::uuid,1`, { principal: PRINCIPAL_EDITOR, membership: MEMBERSHIP_EDITOR }).outcome, "membership_denied");
      assert.equal(api(backend, "abandoned_carts_archive", `'${OPERATION_B}'::uuid,repeat('c',64),'${CART_A}'::uuid,1`, { principal: PRINCIPAL_ANALYST, membership: MEMBERSHIP_ANALYST }).outcome, "membership_denied");
    });

    await scenario("mark recovered commits once and exact retry replays immutable result", () => {
      const first = api(backend, "abandoned_carts_mark_recovered", `'${OPERATION_B}'::uuid,repeat('c',64),'${CART_A}'::uuid,1`);
      assert.equal(first.outcome, "committed");
      assert.deepEqual(first.result, { id: CART_A, status: "recovered", version: 2, updatedAt: NOW });
      const replay = api(backend, "abandoned_carts_mark_recovered", `'${OPERATION_B}'::uuid,repeat('c',64),'${CART_A}'::uuid,1`);
      assert.deepEqual(replay, { outcome: "operation_replayed", result: first.result });
      assert.equal(api(backend, "abandoned_carts_mark_recovered", `'${OPERATION_B}'::uuid,repeat('d',64),'${CART_A}'::uuid,1`).outcome, "operation_mismatch");
    });

    await scenario("version transition and cross-store attempts fail closed", () => {
      assert.equal(api(backend, "abandoned_carts_archive", `'${OPERATION_C}'::uuid,repeat('e',64),'${CART_A}'::uuid,1`).outcome, "version_conflict");
      assert.equal(api(backend, "abandoned_carts_get", `'${CART_A}'::uuid`, { store: STORE_B }).outcome, "membership_denied");
      assert.equal(api(backend, "abandoned_carts_get", `'${CART_B}'::uuid`).outcome, "cart_not_found");
    });

    await scenario("concurrent same operation yields one commit and one replay", async () => {
      psql(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.abandoned_carts(id,store_id,public_cart_digest,status,currency,subtotal_cents,discount_cents,total_cents,checkout_started_at,last_activity_at,abandoned_at,version,created_at,updated_at) VALUES ('${CART_B}','${STORE_A}',repeat('f',64),'abandoned','TRY',100,0,100,'2026-07-22 12:00+00','2026-07-22 12:30+00','2026-07-22 12:30+00',1,'2026-07-22 12:00+00','2026-07-22 12:30+00');`);
      const operation = "73000000-0000-4000-8000-000000000004";
      const results = await Promise.all([
        apiAsync(backend, "abandoned_carts_archive", `'${operation}'::uuid,repeat('1',64),'${CART_B}'::uuid,1`),
        apiAsync(backend, "abandoned_carts_archive", `'${operation}'::uuid,repeat('1',64),'${CART_B}'::uuid,1`),
      ]);
      assert.deepEqual(results.map(({ outcome }) => outcome).sort(), ["committed", "operation_replayed"]);
      assert.equal(psql(backend, `SELECT count(*) FROM saas.abandoned_cart_operations WHERE operation_id='${operation}';`), "1");
    });

    await scenario("operation recovery is read-only exact-store exact-fingerprint authority", () => {
      const recovered = api(backend, "abandoned_carts_recover_operation", `'${OPERATION_B}'::uuid,repeat('c',64)`);
      assert.equal(recovered.outcome, "operation_replayed");
      assert.equal(api(backend, "abandoned_carts_recover_operation", `'${OPERATION_B}'::uuid,repeat('0',64)`).outcome, "operation_mismatch");
    });

    await scenario("workflow capture derives exact catalog snapshots and money from trusted host", () => {
      const digest = "2".repeat(64);
      const cart = "71000000-0000-4000-8000-000000000010";
      const result = workflowApi(backend, "abandoned_carts_capture", `'${CAPTURE_HOST}','${cart}'::uuid,'${digest}','2026-07-22T15:00:00.000Z'::timestamptz,'{"name":"Ada Lovelace","email":"ada@example.test"}'::jsonb,'[{"productId":"${PRODUCT_A}","variantId":"${VARIANT_A}","quantity":2}]'::jsonb`);
      assert.equal(result.outcome, "captured");
      assert.deepEqual(result.result, { id: cart, status: "active", currency: "TRY", totalCents: 25000, itemCount: 1, version: 1, updatedAt: "2026-07-22T15:00:00.000Z" });
      assert.equal(psql(backend, `SELECT unit_price_cents||':'||quantity||':'||line_total_cents FROM saas.abandoned_cart_items WHERE cart_id='${cart}';`), "12500:2:25000");
      assert.equal(psql(backend, `SELECT count(*) FROM saas.abandoned_carts WHERE public_cart_digest='${digest}' AND store_id='${STORE_A}';`), "1");
    });

    await scenario("wrong host foreign catalog and browser-shaped values fail closed", () => {
      const base = `'71000000-0000-4000-8000-000000000011'::uuid,repeat('3',64),'2026-07-22T15:00:00.000Z'::timestamptz,'{}'::jsonb`;
      assert.equal(workflowApi(backend, "abandoned_carts_capture", `'missing.example.test',${base},'[{"productId":"${PRODUCT_A}","variantId":"${VARIANT_A}","quantity":1}]'::jsonb`).outcome, "not_found");
      assert.equal(workflowApi(backend, "abandoned_carts_capture", `'${CAPTURE_HOST}',${base},'[{"productId":"${PRODUCT_B}","variantId":"${VARIANT_B}","quantity":1}]'::jsonb`).outcome, "catalog_item_unavailable");
      assert.equal(workflowApi(backend, "abandoned_carts_capture", `'${CAPTURE_HOST}',${base},'[{"productId":"${PRODUCT_A}","variantId":"${VARIANT_A}","quantity":1,"unitPriceCents":1}]'::jsonb`).outcome, "catalog_item_unavailable");
    });

    await scenario("stale workflow transitions only old active carts with durable timestamps", () => {
      const result = workflowApi(backend, "abandoned_carts_mark_stale", `'2026-07-22T16:00:00.000Z'::timestamptz,'2026-07-22T15:30:00.000Z'::timestamptz`);
      assert.equal(result.outcome, "committed");
      assert.ok(result.result.affected >= 1);
      assert.equal(psql(backend, `SELECT status FROM saas.abandoned_carts WHERE public_cart_digest=${"'"}${"2".repeat(64)}${"'"};`), "abandoned");
    });

    await scenario("checkout conversion binds the cart to an exact same-store persisted order", () => {
      const digest = "2".repeat(64);
      const result = workflowApi(backend, "abandoned_carts_convert", `'${CAPTURE_HOST}','${digest}','${CAPTURE_ORDER}'::uuid,'2026-07-22T16:05:00.000Z'::timestamptz`);
      assert.equal(result.outcome, "committed");
      assert.equal(result.result.status, "recovered");
      assert.equal(psql(backend, `SELECT recovered_order_id::text FROM saas.abandoned_carts WHERE public_cart_digest='${digest}';`), CAPTURE_ORDER);
      assert.equal(workflowApi(backend, "abandoned_carts_convert", `'cart-store-b.example.test','${digest}','${CAPTURE_ORDER}'::uuid,'2026-07-22T16:06:00.000Z'::timestamptz`).outcome, "invalid_input");
    });

    await scenario("capture functions are workflow-only and raw credentials never enter PostgreSQL", () => {
      assert.equal(psql(backend, `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname IN ('abandoned_carts_capture','abandoned_carts_mark_stale','abandoned_carts_convert') AND has_function_privilege('celebix_saas_workflow',p.oid,'EXECUTE') AND NOT has_function_privilege('celebix_saas_app',p.oid,'EXECUTE');`), "3");
      assert.equal(psql(backend, `SELECT count(*) FROM information_schema.columns WHERE table_schema='saas' AND table_name LIKE 'abandoned_cart%' AND column_name ~ '(credential|token|cookie|secret)' AND column_name<>'public_cart_digest';`), "0");
    });

    await scenario("backup and restore preserve cart authority", () => {
      const dump = command(backend.executables.pg_dump, ["-h", backend.socketDirectory, "-p", String(backend.port), "-U", "postgres", "-d", DATABASE], { binary: true }).stdout;
      psql(backend, `CREATE DATABASE ${RESTORE_DATABASE};`, "postgres");
      command(backend.executables.psql, ["-h", backend.socketDirectory, "-p", String(backend.port), "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", RESTORE_DATABASE], { input: dump, binary: true });
      assert.equal(psql(backend, `SELECT count(*) FROM saas.abandoned_carts WHERE id='${CART_A}';`, RESTORE_DATABASE), "1");
      apply(backend, "202607220030_abandoned_carts_assertions.sql", RESTORE_DATABASE);
      apply(backend, "202607220031_abandoned_cart_api_assertions.sql", RESTORE_DATABASE);
      apply(backend, "202607220032_abandoned_cart_capture_assertions.sql", RESTORE_DATABASE);
    });

    await scenario("rollback refuses to destroy persisted cart history", () => {
      assert.match(String(denied(backend, readFileSync(path.join(SQL, "202607220030_abandoned_carts.down.sql"), "utf8")).stderr), /ABANDONED_CART_DOWN_HISTORY_CONFLICT/);
    });

    await scenario("clean rollback removes only migration-030 through 032 objects", () => {
      psql(backend, "SET ROLE celebix_saas_owner; TRUNCATE saas.abandoned_cart_operations, saas.abandoned_cart_items, saas.abandoned_carts;");
      apply(backend, "202607220032_abandoned_cart_capture.down.sql");
      apply(backend, "202607220031_abandoned_cart_api.down.sql");
      apply(backend, "202607220030_abandoned_carts.down.sql");
      assert.equal(psql(backend, "SELECT to_regclass('saas.abandoned_carts') IS NULL;"), "t");
      assert.equal(psql(backend, "SELECT to_regclass('saas.orders') IS NOT NULL;"), "t");
      assert.equal(psql(backend, "SELECT to_regprocedure('saas.abandoned_carts_summary(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NULL;"), "t");
    });

    await scenario("migrations 030 through 032 reapply after rollback", () => {
      apply(backend, "202607220030_abandoned_carts.up.sql");
      apply(backend, "202607220030_abandoned_carts_assertions.sql");
      apply(backend, "202607220031_abandoned_cart_api.up.sql");
      apply(backend, "202607220031_abandoned_cart_api_assertions.sql");
      apply(backend, "202607220032_abandoned_cart_capture.up.sql");
      apply(backend, "202607220032_abandoned_cart_capture_assertions.sql");
      assert.equal(psql(backend, "SELECT to_regclass('saas.abandoned_carts') IS NOT NULL;"), "t");
    });

    await scenario("disposable databases are isolated from external PostgreSQL", () => {
      assert.equal(backend.socketDirectory.startsWith("/tmp/c3b3-"), true);
      assert.equal(psql(backend, "SELECT inet_server_addr() IS NULL;"), "t");
    });

    assert.equal(completed.length, TOTAL);
  } finally {
    if (backend) {
      psqlResult(backend, `DROP DATABASE IF EXISTS ${RESTORE_DATABASE}; DROP DATABASE IF EXISTS ${DATABASE};`, "postgres", { allowFailure: true });
      stopPostgres(backend);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
