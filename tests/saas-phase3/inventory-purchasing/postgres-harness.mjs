import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "inventory_purchasing";
const RESTORED = "inventory_purchasing_restored";
const PLAN = "00000000-0000-4000-8000-000000000001";
const BAD_PLAN = "00000000-0000-4000-8000-000000000099";
const STORE = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const OWNER = "20000000-0000-4000-8000-000000000001";
const ADMIN = "20000000-0000-4000-8000-000000000002";
const EDITOR = "20000000-0000-4000-8000-000000000003";
const ANALYST = "20000000-0000-4000-8000-000000000004";
const OWNER_MEMBERSHIP = "30000000-0000-4000-8000-000000000001";
const ADMIN_MEMBERSHIP = "30000000-0000-4000-8000-000000000002";
const EDITOR_MEMBERSHIP = "30000000-0000-4000-8000-000000000003";
const ANALYST_MEMBERSHIP = "30000000-0000-4000-8000-000000000004";
const PRODUCT = "40000000-0000-4000-8000-000000000001";
const PRODUCT_B = "40000000-0000-4000-8000-000000000002";
const VARIANT_A = "50000000-0000-4000-8000-000000000001";
const VARIANT_B = "50000000-0000-4000-8000-000000000002";
const CROSS_VARIANT = "50000000-0000-4000-8000-000000000003";
const ORDER = "60000000-0000-4000-8000-000000000001";
const ORDER_CANCEL = "60000000-0000-4000-8000-000000000002";
const ORDER_OVER = "60000000-0000-4000-8000-000000000003";
const ORDER_CONCURRENT = "60000000-0000-4000-8000-000000000004";
const ORDER_VERSION = "60000000-0000-4000-8000-000000000005";
const LINE_A = "61000000-0000-4000-8000-000000000001";
const LINE_B = "61000000-0000-4000-8000-000000000002";
const LINE_CANCEL = "61000000-0000-4000-8000-000000000003";
const LINE_OVER = "61000000-0000-4000-8000-000000000005";
const LINE_VERSION = "61000000-0000-4000-8000-000000000006";
const HOLD_PROVIDER = "70000000-0000-4000-8000-000000000010";
const HOLD_LINK = "70000000-0000-4000-8000-000000000011";
const HOLD_REDEMPTION = "70000000-0000-4000-8000-000000000012";
const HOLD_ATTEMPT = "70000000-0000-4000-8000-000000000013";
const HOLD_RESERVATION = "70000000-0000-4000-8000-000000000014";
const ADDRESS = `'{"recipientName":"Ada Lovelace","phone":"+905551110000","line1":"Test 1","city":"Istanbul","country":"TR"}'::jsonb`;
const ENVELOPE = `'{"algorithm":"A256GCM","ciphertext":"cXVpY2stbGluay10b2tlbi1jaXBoZXJ0ZXh0","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}'::jsonb`;
const NOW = "2026-07-22T18:00:00.000Z";
const PRIOR = [
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
  "202607220024_quick_order_links.up.sql",
  "202607220024_quick_order_links_assertions.sql",
  "202607220025_quick_order_links_api.up.sql",
  "202607220025_quick_order_links_api_assertions.sql",
  "202607220026_quick_order_checkout_runtime.up.sql",
  "202607220026_quick_order_checkout_runtime_assertions.sql",
  "202607220027_quick_order_checkout_api.up.sql",
  "202607220027_quick_order_checkout_api_assertions.sql",
  "202607220028_quick_order_redemption_expiry_authority.up.sql",
  "202607220028_quick_order_redemption_expiry_authority_assertions.sql",
  "202607220029_quick_order_settlement_authority.up.sql",
  "202607220029_quick_order_settlement_authority_assertions.sql",
  "202607220030_abandoned_carts.up.sql",
  "202607220030_abandoned_carts_assertions.sql",
  "202607220031_abandoned_cart_api.up.sql",
  "202607220031_abandoned_cart_api_assertions.sql",
  "202607220032_abandoned_cart_capture.up.sql",
  "202607220032_abandoned_cart_capture_assertions.sql",
  "202607220033_customer_management.up.sql",
  "202607220033_customer_management_assertions.sql",
  "202607220034_customer_management_api.up.sql",
  "202607220034_customer_management_api_assertions.sql",
  "202607220035_catalog_administration.up.sql",
  "202607220035_catalog_administration_assertions.sql",
  "202607220036_merchant_admin_modules.up.sql",
  "202607220036_merchant_admin_modules_assertions.sql",
  "202607220037_merchant_provider_preparation.up.sql",
  "202607220037_merchant_provider_preparation_assertions.sql",
  "202607220038_merchant_analytics.up.sql",
  "202607220038_merchant_analytics_assertions.sql",
  "202607220039_typed_storefront_settings.up.sql",
  "202607220039_typed_storefront_settings_assertions.sql",
  "202607220040_advanced_seo_preferences.up.sql",
  "202607220040_advanced_seo_preferences_assertions.sql",
  "202607220041_catalog_import_previews.up.sql",
  "202607220041_catalog_import_previews_assertions.sql",
  "202607220042_catalog_product_tags.up.sql",
  "202607220042_catalog_product_tags_assertions.sql",
];
const TABLES = [
  "inventory_locations",
  "inventory_balances",
  "inventory_movements",
  "purchase_orders",
  "purchase_order_lines",
  "inventory_operations",
];
const FUNCTIONS = [
  "inventory_list_locations(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)",
  "inventory_list_balances(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)",
  "purchasing_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)",
  "purchasing_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)",
  "purchasing_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,text,jsonb)",
  "purchasing_transition(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)",
  "purchasing_receive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,jsonb)",
  "inventory_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)",
];

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
}

function command(program, args, { input, allowFailure = false } = {}) {
  const completed = spawnSync(program, args, {
    cwd: ROOT,
    encoding: "utf8",
    input,
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (completed.error) throw completed.error;
  if (!allowFailure && completed.status !== 0) {
    throw new Error(`${path.basename(program)} failed\n${completed.stderr}`);
  }
  return completed;
}

function start() {
  const executables = Object.fromEntries(
    ["initdb", "pg_ctl", "psql", "pg_dump", "pg_restore"].map((name) => [
      name,
      executable(name),
    ]),
  );
  const root = mkdtempSync("/tmp/celebix-inventory-purchasing-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 20000 + Math.floor(Math.random() * 15000);
  mkdirSync(socket, { mode: 0o700 });
  command(executables.initdb, [
    "-D",
    data,
    "--auth=trust",
    "--username=postgres",
    "--no-locale",
    "--encoding=UTF8",
  ]);
  command(executables.pg_ctl, [
    "-D",
    data,
    "-o",
    `-k ${socket} -p ${port} -h ''`,
    "-l",
    path.join(root, "postgres.log"),
    "start",
  ]);
  return {
    executables,
    root,
    data,
    socket,
    port,
    pid: Number.parseInt(readFileSync(path.join(data, "postmaster.pid"), "utf8"), 10),
  };
}

function stop(box) {
  if (!box) return;
  command(box.executables.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], {
    allowFailure: true,
  });
  rmSync(box.root, { recursive: true, force: true });
}

function absent(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error?.code === "ESRCH";
  }
}

function psql(box, source, database = DB, allowFailure = false) {
  return command(
    box.executables.psql,
    [
      "-h",
      box.socket,
      "-p",
      String(box.port),
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      database,
    ],
    { input: source, allowFailure },
  );
}

function apply(box, file, database = DB) {
  psql(box, readFileSync(path.join(SQL, file), "utf8"), database);
}

function authority({
  principal = OWNER,
  membership = OWNER_MEMBERSHIP,
  plan = PLAN,
  now = NOW,
} = {}) {
  return `'${STORE}'::uuid,'${principal}'::uuid,'${membership}'::uuid,'${plan}'::uuid,'free_starter'::text,1::bigint,'${now}'::timestamptz`;
}

function result(box, functionCall, database = DB) {
  const output = psql(
    box,
    `SET ROLE celebix_saas_app;SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${functionCall};`,
    database,
  ).stdout.trim();
  return JSON.parse(output);
}

function saveCall({
  operation,
  fingerprint,
  order = ORDER,
  expected = "NULL",
  location,
  supplier = "Anadolu Tedarik",
  lines,
  actor = {},
}) {
  return `saas.purchasing_save(${authority(actor)},'${operation}'::uuid,'${fingerprint}'::text,'${order}'::uuid,${expected}::bigint,'${location}'::uuid,'${supplier}'::text,'${JSON.stringify(lines)}'::jsonb)`;
}

function transitionCall({
  operation,
  fingerprint,
  order = ORDER,
  expected,
  transition,
}) {
  return `saas.purchasing_transition(${authority()},'${operation}'::uuid,'${fingerprint}'::text,'${order}'::uuid,${expected}::bigint,'${transition}'::text)`;
}

function receiveCall({
  operation,
  fingerprint,
  order = ORDER,
  expected,
  location,
  receipts,
}) {
  return `saas.purchasing_receive(${authority()},'${operation}'::uuid,'${fingerprint}'::text,'${order}'::uuid,${expected}::bigint,'${location}'::uuid,'${JSON.stringify(receipts)}'::jsonb)`;
}

function seed(box) {
  psql(
    box,
    `BEGIN;SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
('${OWNER}','https://id.test/oidc','owner','owner@test.invalid',true,'2026-01-01','2026-01-01'),
('${ADMIN}','https://id.test/oidc','admin','admin@test.invalid',true,'2026-01-01','2026-01-01'),
('${EDITOR}','https://id.test/oidc','editor','editor@test.invalid',true,'2026-01-01','2026-01-01'),
('${ANALYST}','https://id.test/oidc','analyst','analyst@test.invalid',true,'2026-01-01','2026-01-01');
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
('${STORE}','Inventory A','inventory-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
('${STORE_B}','Inventory B','inventory-b','active','tr','TRY','default','2026-01-01','2026-01-01');
INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
('${OWNER_MEMBERSHIP}','${OWNER}','${STORE}','store_owner','active','2026-01-01','2026-01-01'),
('${ADMIN_MEMBERSHIP}','${ADMIN}','${STORE}','admin','active','2026-01-01','2026-01-01'),
('${EDITOR_MEMBERSHIP}','${EDITOR}','${STORE}','editor','active','2026-01-01','2026-01-01'),
('${ANALYST_MEMBERSHIP}','${ANALYST}','${STORE}','analyst','active','2026-01-01','2026-01-01');
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
VALUES('70000000-0000-4000-8000-000000000001','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES
('${PRODUCT}','${STORE}','urun-a','Urun A','active','TRY',1,'2026-01-01','2026-01-01'),
('${PRODUCT_B}','${STORE_B}','urun-b','Urun B','active','TRY',1,'2026-01-01','2026-01-01');
INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES
('${VARIANT_A}','${PRODUCT}','${STORE}','A',1000,500,true,10,'active','{}',1,'2026-01-01','2026-01-01'),
('${VARIANT_B}','${PRODUCT}','${STORE}','B',2000,800,true,5,'active','{}',1,'2026-01-01','2026-01-01'),
('${CROSS_VARIANT}','${PRODUCT_B}','${STORE_B}','Cross',1000,500,true,7,'active','{}',1,'2026-01-01','2026-01-01');
COMMIT;`,
  );
}

function interactive(box) {
  const child = spawn(
    box.executables.psql,
    [
      "-h",
      box.socket,
      "-p",
      String(box.port),
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      DB,
    ],
    { cwd: ROOT, env: { ...process.env, LC_ALL: "C", LANG: "C" } },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  return {
    child,
    write(source) {
      child.stdin.write(source);
    },
    output() {
      return stdout;
    },
    error() {
      return stderr;
    },
    done() {
      return new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code) => {
          if (code === 0) resolve(stdout);
          else reject(new Error(`psql failed\n${stderr}`));
        });
      });
    },
  };
}

async function waitUntil(check, label) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timeout waiting for ${label}`);
}

const TOTAL = 34;
let count = 0;
async function scenario(name, run) {
  await run();
  count += 1;
  console.log(`PASS ${count}/${TOTAL} ${name}`);
}

async function main() {
  let box;
  let cleanupReady = false;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const file of PRIOR) apply(box, file);
    seed(box);
    const definitionsBefore = Object.fromEntries(
      [
        "saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)",
        "saas.catalog_create_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)",
        "saas.catalog_update_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)",
        "saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)",
        "saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)",
        "saas.catalog_admin_commit_import_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,bigint,text,text,jsonb,uuid)",
      ].map((signature) => [
        signature,
        psql(
          box,
          `SELECT pg_catalog.pg_get_functiondef('${signature}'::regprocedure);`,
        ).stdout,
      ]),
    );
    const authorityBefore = psql(
      box,
      "SELECT pg_catalog.pg_get_functiondef('saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text)'::regprocedure);",
    ).stdout;
    apply(box, "202607220043_inventory_purchasing.up.sql");
    apply(box, "202607220043_inventory_purchasing_assertions.sql");
    const location = psql(
      box,
      `SELECT id FROM saas.inventory_locations WHERE store_id='${STORE}' AND is_default AND status='active';`,
    ).stdout.trim();
    const crossLocation = psql(
      box,
      `SELECT id FROM saas.inventory_locations WHERE store_id='${STORE_B}' AND is_default AND status='active';`,
    ).stdout.trim();

    await scenario("migration order applies 043 only after 001-042", () => {
      assert.equal(PRIOR.at(-2), "202607220042_catalog_product_tags.up.sql");
      assert.ok(existsSync(path.join(SQL, "202607220043_inventory_purchasing.up.sql")));
      assert.equal(
        psql(box, "SELECT to_regclass('saas.inventory_locations') IS NOT NULL;").stdout.trim(),
        "t",
      );
    });
    await scenario("PostgreSQL 16 executes the disposable rehearsal", () => {
      assert.match(psql(box, "SHOW server_version;").stdout, /^16\./);
    });
    await scenario("catalog assertions prove exact inventory authority", () => {
      assert.equal(
        psql(
          box,
          `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname IN('inventory_list_locations','inventory_list_balances','purchasing_list','purchasing_get','purchasing_save','purchasing_transition','purchasing_receive','inventory_recover_operation');`,
        ).stdout.trim(),
        "8",
      );
    });
    await scenario("manifest pins eighteen exact checksums", () => {
      const manifest = JSON.parse(
        readFileSync(path.join(SQL, "phase3h-merchant-completion-manifest.json"), "utf8"),
      );
      assert.equal(manifest.artifacts.length, 18);
      for (const artifact of manifest.artifacts) {
        assert.equal(
          createHash("sha256")
            .update(readFileSync(path.join(SQL, artifact.file)))
            .digest("hex"),
          artifact.sha256,
          artifact.file,
        );
      }
    });
    await scenario("default location seed creates one active default per store", () => {
      assert.equal(
        psql(
          box,
          "SELECT count(*)=2 AND count(*)=count(DISTINCT store_id) FROM saas.inventory_locations WHERE is_default AND status='active';",
        ).stdout.trim(),
        "t",
      );
    });
    await scenario("existing stock creates opening balances and deterministic movements", () => {
      assert.equal(
        psql(
          box,
          `SELECT count(*) FROM saas.inventory_balances WHERE store_id='${STORE}';`,
        ).stdout.trim(),
        "2",
      );
      assert.equal(
        psql(
          box,
          `SELECT count(*) FROM saas.inventory_movements WHERE store_id='${STORE}' AND movement_kind='opening';`,
        ).stdout.trim(),
        "2",
      );
    });
    await scenario("active location balance aggregates equal persisted variant stock", () => {
      assert.equal(
        psql(
          box,
          `SELECT count(*) FROM saas.product_variants v WHERE v.status='active' AND (SELECT COALESCE(sum(b.quantity),0) FROM saas.inventory_balances b JOIN saas.inventory_locations l ON l.store_id=b.store_id AND l.id=b.location_id AND l.status='active' WHERE b.store_id=v.store_id AND b.variant_id=v.id)<>v.stock_quantity;`,
        ).stdout.trim(),
        "0",
      );
      const unmarked = psql(
        box,
        `SET ROLE celebix_saas_owner;UPDATE saas.product_variants SET stock_quantity=stock_quantity-1 WHERE store_id='${STORE}' AND id='${VARIANT_A}';`,
        DB,
        true,
      );
      assert.notEqual(unmarked.status, 0);
      assert.match(unmarked.stderr, /INVENTORY_STOCK_SOURCE_REQUIRED/);
      const managed = psql(
        box,
        `BEGIN;SET LOCAL ROLE celebix_saas_owner;
UPDATE saas.inventory_balances SET quantity=quantity+1,version=version+1,updated_at='2026-07-22T18:01:00Z' WHERE store_id='${STORE}' AND location_id='${location}' AND variant_id='${VARIANT_A}';
SELECT pg_catalog.set_config('saas.inventory.source_marker','inventory_managed',true);
UPDATE saas.product_variants SET stock_quantity=stock_quantity+1,version=version+1,updated_at='2026-07-22T18:01:00Z' WHERE store_id='${STORE}' AND id='${VARIANT_A}';
SELECT saas.inventory_active_balance_total('${STORE}','${VARIANT_A}')=(SELECT stock_quantity FROM saas.product_variants WHERE store_id='${STORE}' AND id='${VARIANT_A}')
  AND (SELECT count(*) FROM saas.inventory_movements WHERE store_id='${STORE}' AND variant_id='${VARIANT_A}')=1;
ROLLBACK;`,
      ).stdout.trim().split("\n").at(-1);
      assert.equal(managed, "t");
      const corrected = psql(
        box,
        `BEGIN;SET LOCAL ROLE celebix_saas_owner;
SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);
SELECT pg_catalog.set_config('saas.inventory.source_id','80000000-0000-4000-8000-000000000099',true);
SELECT pg_catalog.set_config('saas.inventory.source_time','2026-07-22T18:02:00Z',true);
UPDATE saas.product_variants SET stock_quantity=stock_quantity-2,version=version+1,updated_at='2026-07-22T18:02:00Z' WHERE store_id='${STORE}' AND id='${VARIANT_A}';
SELECT saas.inventory_active_balance_total('${STORE}','${VARIANT_A}')=8
  AND (SELECT stock_quantity FROM saas.product_variants WHERE store_id='${STORE}' AND id='${VARIANT_A}')=8
  AND (SELECT quantity_delta FROM saas.inventory_movements WHERE store_id='${STORE}' AND variant_id='${VARIANT_A}' AND source_id='80000000-0000-4000-8000-000000000099')=-2;
ROLLBACK;`,
      ).stdout.trim().split("\n").at(-1);
      assert.equal(corrected, "t");
    });
    await scenario("location and balance projections are deterministic", () => {
      const first = result(box, `saas.inventory_list_locations(${authority()})`);
      const second = result(box, `saas.inventory_list_locations(${authority()})`);
      assert.deepEqual(first, second);
      assert.equal(first.outcome, "listed");
      assert.deepEqual(
        result(box, `saas.inventory_list_balances(${authority()},'${location}')`),
        result(box, `saas.inventory_list_balances(${authority()},'${location}')`),
      );
    });
    await scenario("owner and admin receive all six finite inventory actions", () => {
      for (const [principal, membership] of [
        [OWNER, OWNER_MEMBERSHIP],
        [ADMIN, ADMIN_MEMBERSHIP],
      ]) {
        for (const action of [
          "inventory.read",
          "inventory.manage",
          "purchasing.read",
          "purchasing.manage",
          "pricing.read",
          "pricing.manage",
        ]) {
          assert.equal(
            psql(
              box,
              `SELECT saas.merchant_action_authority_error(${authority({ principal, membership })},'catalog','${action}') IS NULL;`,
            ).stdout.trim(),
            "t",
          );
        }
      }
    });
    await scenario("editor receives inventory and purchasing management but pricing read only", () => {
      for (const action of [
        "inventory.read",
        "inventory.manage",
        "purchasing.read",
        "purchasing.manage",
        "pricing.read",
      ]) {
        assert.equal(
          psql(
            box,
            `SELECT saas.merchant_action_authority_error(${authority({ principal: EDITOR, membership: EDITOR_MEMBERSHIP })},'catalog','${action}') IS NULL;`,
          ).stdout.trim(),
          "t",
        );
      }
      assert.equal(
        psql(
          box,
          `SELECT saas.merchant_action_authority_error(${authority({ principal: EDITOR, membership: EDITOR_MEMBERSHIP })},'catalog','pricing.manage');`,
        ).stdout.trim(),
        "membership_denied",
      );
    });
    await scenario("analyst receives only inventory purchasing and pricing reads", () => {
      for (const action of ["inventory.read", "purchasing.read", "pricing.read"]) {
        assert.equal(
          psql(
            box,
            `SELECT saas.merchant_action_authority_error(${authority({ principal: ANALYST, membership: ANALYST_MEMBERSHIP })},'catalog','${action}') IS NULL;`,
          ).stdout.trim(),
          "t",
        );
      }
      for (const action of ["inventory.manage", "purchasing.manage", "pricing.manage"]) {
        assert.equal(
          psql(
            box,
            `SELECT saas.merchant_action_authority_error(${authority({ principal: ANALYST, membership: ANALYST_MEMBERSHIP })},'catalog','${action}');`,
          ).stdout.trim(),
          "membership_denied",
        );
      }
    });
    await scenario("feature and plan denial fail closed", () => {
      assert.equal(
        psql(
          box,
          `SELECT saas.merchant_action_authority_error(${authority()},'accounting','inventory.read');`,
        ).stdout.trim(),
        "feature_not_enabled",
      );
      assert.equal(
        result(
          box,
          `saas.inventory_list_locations(${authority({ plan: BAD_PLAN })})`,
        ).outcome,
        "durable_authority_invalid",
      );
    });

    const baseLines = [
      { lineId: LINE_A, variantId: VARIANT_A, orderedQuantity: 5, unitCostCents: 500 },
      { lineId: LINE_B, variantId: VARIANT_B, orderedQuantity: 2, unitCostCents: 800 },
    ];
    await scenario("purchase draft save and update lifecycle is atomic", () => {
      const created = result(
        box,
        saveCall({
          operation: "80000000-0000-4000-8000-000000000001",
          fingerprint: "a".repeat(64),
          location,
          lines: baseLines,
        }),
      );
      assert.equal(created.outcome, "saved");
      assert.equal(created.result.status, "draft");
      const updated = result(
        box,
        saveCall({
          operation: "80000000-0000-4000-8000-000000000002",
          fingerprint: "b".repeat(64),
          expected: "1",
          location,
          supplier: "Anadolu Tedarik A.S.",
          lines: baseLines,
        }),
      );
      assert.equal(updated.outcome, "saved");
      assert.equal(updated.result.version, 2);
    });
    await scenario("purchase order transition advances draft to ordered", () => {
      const ordered = result(
        box,
        transitionCall({
          operation: "80000000-0000-4000-8000-000000000003",
          fingerprint: "c".repeat(64),
          expected: 2,
          transition: "order",
        }),
      );
      assert.equal(ordered.outcome, "transitioned");
      assert.equal(ordered.result.status, "ordered");
      assert.equal(ordered.result.version, 3);
    });
    await scenario("partial receipt updates one balance variant and purchase line", () => {
      const received = result(
        box,
        receiveCall({
          operation: "80000000-0000-4000-8000-000000000004",
          fingerprint: "d".repeat(64),
          expected: 3,
          location,
          receipts: [{ lineId: LINE_A, quantity: 3 }],
        }),
      );
      assert.equal(received.outcome, "received");
      assert.equal(received.result.status, "partially_received");
      assert.equal(
        psql(
          box,
          `SELECT quantity FROM saas.inventory_balances WHERE store_id='${STORE}' AND location_id='${location}' AND variant_id='${VARIANT_A}';`,
        ).stdout.trim(),
        "13",
      );
    });
    const finalReceipt = receiveCall({
      operation: "80000000-0000-4000-8000-000000000005",
      fingerprint: "e".repeat(64),
      expected: 4,
      location,
      receipts: [
        { lineId: LINE_A, quantity: 2 },
        { lineId: LINE_B, quantity: 2 },
      ],
    });
    await scenario("full receipt completes every line and order", () => {
      const received = result(box, finalReceipt);
      assert.equal(received.outcome, "received");
      assert.equal(received.result.status, "received");
      assert.equal(received.result.version, 5);
    });
    await scenario("draft purchase can be cancelled without changing stock", () => {
      const before = psql(
        box,
        `SELECT stock_quantity FROM saas.product_variants WHERE id='${VARIANT_A}';`,
      ).stdout.trim();
      assert.equal(
        result(
          box,
          saveCall({
            operation: "80000000-0000-4000-8000-000000000006",
            fingerprint: "f".repeat(64),
            order: ORDER_CANCEL,
            location,
            lines: [{ ...baseLines[0], lineId: LINE_CANCEL }],
          }),
        ).outcome,
        "saved",
      );
      const cancelled = result(
        box,
        transitionCall({
          operation: "80000000-0000-4000-8000-000000000007",
          fingerprint: "1".repeat(64),
          order: ORDER_CANCEL,
          expected: 1,
          transition: "cancel",
        }),
      );
      assert.equal(cancelled.result.status, "cancelled");
      assert.equal(
        psql(
          box,
          `SELECT stock_quantity FROM saas.product_variants WHERE id='${VARIANT_A}';`,
        ).stdout.trim(),
        before,
      );
    });
    await scenario("receipt operation replay returns the immutable persisted result", () => {
      const replayed = result(box, finalReceipt);
      assert.equal(replayed.outcome, "operation_replayed");
      assert.equal(replayed.result.status, "received");
    });
    await scenario("receipt replay fingerprint mismatch is rejected", () => {
      assert.equal(
        result(box, finalReceipt.replace("e".repeat(64), "2".repeat(64))).outcome,
        "operation_mismatch",
      );
    });
    await scenario("stale purchase version is rejected", () => {
      assert.equal(
        result(
          box,
          transitionCall({
            operation: "80000000-0000-4000-8000-000000000008",
            fingerprint: "3".repeat(64),
            expected: 4,
            transition: "cancel",
          }),
        ).outcome,
        "version_conflict",
      );
    });
    await scenario("over receipt is rejected without stock change", () => {
      result(
        box,
        saveCall({
          operation: "80000000-0000-4000-8000-000000000009",
          fingerprint: "4".repeat(64),
          order: ORDER_OVER,
          location,
          lines: [{ ...baseLines[0], lineId: LINE_OVER, orderedQuantity: 1 }],
        }),
      );
      result(
        box,
        transitionCall({
          operation: "80000000-0000-4000-8000-00000000000a",
          fingerprint: "5".repeat(64),
          order: ORDER_OVER,
          expected: 1,
          transition: "order",
        }),
      );
      assert.equal(
        result(
          box,
          receiveCall({
            operation: "80000000-0000-4000-8000-00000000000b",
            fingerprint: "6".repeat(64),
            order: ORDER_OVER,
            expected: 2,
            location,
            receipts: [{ lineId: LINE_OVER, quantity: 2 }],
          }),
        ).outcome,
        "over_receipt",
      );
    });
    await scenario("cross-store location variant and order IDs are rejected", () => {
      assert.equal(
        result(
          box,
          saveCall({
            operation: "80000000-0000-4000-8000-00000000000c",
            fingerprint: "7".repeat(64),
            order: "60000000-0000-4000-8000-000000000099",
            location: crossLocation,
            lines: [
              {
                lineId: "61000000-0000-4000-8000-000000000099",
                variantId: CROSS_VARIANT,
                orderedQuantity: 1,
                unitCostCents: 1,
              },
            ],
          }),
        ).outcome,
        "invalid_input",
      );
    });
    await scenario("duplicate purchase lines and variants are rejected", () => {
      assert.equal(
        result(
          box,
          saveCall({
            operation: "80000000-0000-4000-8000-00000000000d",
            fingerprint: "8".repeat(64),
            order: "60000000-0000-4000-8000-000000000098",
            location,
            lines: [
              { ...baseLines[0], lineId: "61000000-0000-4000-8000-000000000098" },
              { ...baseLines[0], lineId: "61000000-0000-4000-8000-000000000098" },
            ],
          }),
        ).outcome,
        "invalid_input",
      );
    });
    await scenario("quantity and money arithmetic overflow is rejected", () => {
      assert.equal(
        result(
          box,
          saveCall({
            operation: "80000000-0000-4000-8000-00000000000e",
            fingerprint: "9".repeat(64),
            order: "60000000-0000-4000-8000-000000000097",
            location,
            lines: [
              {
                ...baseLines[0],
                lineId: "61000000-0000-4000-8000-000000000097",
                orderedQuantity: 2_147_483_647,
                unitCostCents: 8_000_000_000,
              },
            ],
          }),
        ).outcome,
        "invalid_input",
      );
      assert.equal(
        result(
          box,
          saveCall({
            operation: "80000000-0000-4000-8000-000000000020",
            fingerprint: "e1".repeat(32),
            order: ORDER_VERSION,
            location,
            lines: [
              {
                lineId: LINE_VERSION,
                variantId: VARIANT_B,
                orderedQuantity: 1,
                unitCostCents: 800,
              },
            ],
          }),
        ).outcome,
        "saved",
      );
      assert.equal(
        result(
          box,
          transitionCall({
            operation: "80000000-0000-4000-8000-000000000021",
            fingerprint: "e2".repeat(32),
            order: ORDER_VERSION,
            expected: 1,
            transition: "order",
          }),
        ).outcome,
        "transitioned",
      );
      const versionSnapshot = psql(
        box,
        `SELECT variant.version||'|'||balance.version||'|'||line.version||'|'||variant.stock_quantity||'|'||balance.quantity||'|'||line.received_quantity
FROM saas.product_variants AS variant
JOIN saas.inventory_balances AS balance
  ON balance.store_id=variant.store_id AND balance.variant_id=variant.id AND balance.location_id='${location}'
JOIN saas.purchase_order_lines AS line
  ON line.store_id=variant.store_id AND line.variant_id=variant.id AND line.id='${LINE_VERSION}'
WHERE variant.store_id='${STORE}' AND variant.id='${VARIANT_B}';`,
      ).stdout.trim();
      for (const [columnUpdate, operation] of [
        [
          `UPDATE saas.inventory_balances SET version=9007199254740991
WHERE store_id='${STORE}' AND location_id='${location}' AND variant_id='${VARIANT_B}';`,
          "80000000-0000-4000-8000-000000000022",
        ],
        [
          `UPDATE saas.purchase_order_lines SET version=9007199254740991
WHERE store_id='${STORE}' AND purchase_order_id='${ORDER_VERSION}' AND id='${LINE_VERSION}';`,
          "80000000-0000-4000-8000-000000000023",
        ],
        [
          `UPDATE saas.product_variants SET version=9007199254740991
WHERE store_id='${STORE}' AND id='${VARIANT_B}';`,
          "80000000-0000-4000-8000-000000000024",
        ],
      ]) {
        const output = psql(
          box,
          `BEGIN;
SET LOCAL ROLE celebix_saas_owner;
${columnUpdate}
SET LOCAL ROLE celebix_saas_app;
SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
FROM ${receiveCall({
  operation,
  fingerprint: operation.slice(-2).repeat(32),
  order: ORDER_VERSION,
  expected: 2,
  location,
  receipts: [{ lineId: LINE_VERSION, quantity: 1 }],
})};
ROLLBACK;`,
        ).stdout.trim();
        assert.equal(JSON.parse(output).outcome, "invalid_input");
        assert.equal(
          psql(
            box,
            `SELECT variant.version||'|'||balance.version||'|'||line.version||'|'||variant.stock_quantity||'|'||balance.quantity||'|'||line.received_quantity
FROM saas.product_variants AS variant
JOIN saas.inventory_balances AS balance
  ON balance.store_id=variant.store_id AND balance.variant_id=variant.id AND balance.location_id='${location}'
JOIN saas.purchase_order_lines AS line
  ON line.store_id=variant.store_id AND line.variant_id=variant.id AND line.id='${LINE_VERSION}'
WHERE variant.store_id='${STORE}' AND variant.id='${VARIANT_B}';`,
          ).stdout.trim(),
          versionSnapshot,
        );
      }
    });
    await scenario("malformed and nonfinite timestamps fail closed", () => {
      assert.equal(
        result(
          box,
          `saas.inventory_list_locations(${authority({ now: "infinity" })})`,
        ).outcome,
        "invalid_input",
      );
    });
    await scenario("active checkout hold invariant remains enforced", () => {
      psql(
        box,
        `BEGIN;SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.checkout_provider_configs(
  id,store_id,provider_key,status,public_origin,configuration_key_id,
  sealed_configuration,configuration_digest,version,created_at,updated_at
) VALUES(
  '${HOLD_PROVIDER}','${STORE}','paytr','active','https://www.paytr.com','key-1',
  ${ENVELOPE},repeat('d',64),1,'2026-07-22T17:00:00Z','2026-07-22T17:00:00Z'
);
INSERT INTO saas.quick_order_links(
  id,store_id,creating_membership_id,provider_config_id,status,token_digest,
  token_key_id,sealed_token,customer_name,customer_email,customer_phone,
  shipping_address,billing_address,internal_label,currency,subtotal_cents,
  shipping_cents,discount_cents,total_cents,expires_at,version,created_at,updated_at
) VALUES(
  '${HOLD_LINK}','${STORE}','${OWNER_MEMBERSHIP}','${HOLD_PROVIDER}','active',
  repeat('a',64),'key-1',${ENVELOPE},'Ada Lovelace','ada@example.test',
  '+905551110000',${ADDRESS},${ADDRESS},'inventory hold','TRY',1000,0,0,1000,
  '2026-07-23T17:00:00Z',1,'2026-07-22T17:00:00Z','2026-07-22T17:00:00Z'
);
INSERT INTO saas.quick_order_link_items(
  id,store_id,quick_order_link_id,product_id,variant_id,position,product_name,
  variant_name,unit_price_cents,quantity,line_total_cents,created_at
) VALUES(
  '70000000-0000-4000-8000-000000000015','${STORE}','${HOLD_LINK}',
  '${PRODUCT}','${VARIANT_A}',0,'Urun A','A',1000,15,15000,'2026-07-22T17:00:00Z'
);
INSERT INTO saas.quick_order_redemption_sessions(
  id,store_id,quick_order_link_id,cookie_digest,expires_at,version,created_at,updated_at
) VALUES(
  '${HOLD_REDEMPTION}','${STORE}','${HOLD_LINK}',repeat('e',64),
  '2026-07-23T17:00:00Z',1,'2026-07-22T18:00:00Z','2026-07-22T18:00:00Z'
);
INSERT INTO saas.checkout_payment_attempts(
  id,store_id,quick_order_link_id,redemption_session_id,provider_config_id,
  provider_config_version,configuration_digest,configuration_key_id,
  sealed_configuration,merchant_oid,expected_subtotal_cents,
  expected_shipping_cents,expected_discount_cents,expected_payment_amount,
  currency,status,hold_expires_at,version,created_at,updated_at
) VALUES(
  '${HOLD_ATTEMPT}','${STORE}','${HOLD_LINK}','${HOLD_REDEMPTION}',
  '${HOLD_PROVIDER}',1,repeat('d',64),'key-1',${ENVELOPE},
  '1234567890abcdef1234567890abcdef',1000,0,0,1000,'TRY','reserved',
  '2026-07-22T18:05:00Z',1,'2026-07-22T18:00:00Z','2026-07-22T18:00:00Z'
);
INSERT INTO saas.checkout_inventory_reservations(
  id,store_id,attempt_id,quick_order_link_id,product_id,variant_id,quantity,
  stock_tracked,status,held_at,version,updated_at
) VALUES(
  '${HOLD_RESERVATION}','${STORE}','${HOLD_ATTEMPT}','${HOLD_LINK}',
  '${PRODUCT}','${VARIANT_A}',15,true,'held','2026-07-22T18:00:00Z',1,
  '2026-07-22T18:00:00Z'
);
COMMIT;`,
      );
      const before = psql(
        box,
        `SELECT variant.stock_quantity||'|'||balance.quantity||'|'||
  (SELECT count(*) FROM saas.inventory_movements AS movement
   WHERE movement.store_id=variant.store_id AND movement.variant_id=variant.id)
FROM saas.product_variants AS variant
JOIN saas.inventory_balances AS balance
  ON balance.store_id=variant.store_id AND balance.location_id='${location}' AND balance.variant_id=variant.id
WHERE variant.store_id='${STORE}' AND variant.id='${VARIANT_A}';`,
      ).stdout.trim();
      const heldDenial = psql(
        box,
        `BEGIN;SET LOCAL ROLE celebix_saas_owner;
SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);
SELECT pg_catalog.set_config('saas.inventory.source_id','70000000-0000-4000-8000-000000000016',true);
SELECT pg_catalog.set_config('saas.inventory.source_time','2026-07-22T18:03:00Z',true);
UPDATE saas.product_variants
SET stock_quantity=14,version=version+1,updated_at='2026-07-22T18:03:00Z'
WHERE store_id='${STORE}' AND id='${VARIANT_A}';
COMMIT;`,
        DB,
        true,
      );
      assert.notEqual(heldDenial.status, 0);
      assert.match(
        heldDenial.stderr,
        /CATALOG_VARIANT_HAS_HELD_CHECKOUT_RESERVATION|INVENTORY_ACTIVE_HOLD_VIOLATION/,
      );
      assert.equal(
        psql(
          box,
          `SELECT variant.stock_quantity||'|'||balance.quantity||'|'||
  (SELECT count(*) FROM saas.inventory_movements AS movement
   WHERE movement.store_id=variant.store_id AND movement.variant_id=variant.id)
FROM saas.product_variants AS variant
JOIN saas.inventory_balances AS balance
  ON balance.store_id=variant.store_id AND balance.location_id='${location}' AND balance.variant_id=variant.id
WHERE variant.store_id='${STORE}' AND variant.id='${VARIANT_A}';`,
        ).stdout.trim(),
        before,
      );
      psql(
        box,
        `SET ROLE celebix_saas_owner;
UPDATE saas.checkout_inventory_reservations
SET status='released',released_at='2026-07-22T18:04:00Z',version=2,
  updated_at='2026-07-22T18:04:00Z'
WHERE store_id='${STORE}' AND id='${HOLD_RESERVATION}';`,
      );
    });
    await scenario("concurrent receipt calls serialize on purchase variant and balance locks", async () => {
      const line = "61000000-0000-4000-8000-000000000004";
      result(
        box,
        saveCall({
          operation: "80000000-0000-4000-8000-00000000000f",
          fingerprint: "a1".repeat(32),
          order: ORDER_CONCURRENT,
          location,
          lines: [
            {
              lineId: line,
              variantId: VARIANT_A,
              orderedQuantity: 2,
              unitCostCents: 500,
            },
          ],
        }),
      );
      result(
        box,
        transitionCall({
          operation: "80000000-0000-4000-8000-000000000010",
          fingerprint: "b1".repeat(32),
          order: ORDER_CONCURRENT,
          expected: 1,
          transition: "order",
        }),
      );
      const first = interactive(box);
      first.write(
        `BEGIN;SET ROLE celebix_saas_app;SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${receiveCall({
          operation: "80000000-0000-4000-8000-000000000011",
          fingerprint: "c1".repeat(32),
          order: ORDER_CONCURRENT,
          expected: 2,
          location,
          receipts: [{ lineId: line, quantity: 1 }],
        })};SELECT 'FIRST_READY';\n`,
      );
      await waitUntil(() => first.output().includes("FIRST_READY"), "first receipt");
      const second = interactive(box);
      second.write(
        `BEGIN;SET ROLE celebix_saas_app;SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${receiveCall({
          operation: "80000000-0000-4000-8000-000000000012",
          fingerprint: "d1".repeat(32),
          order: ORDER_CONCURRENT,
          expected: 2,
          location,
          receipts: [{ lineId: line, quantity: 1 }],
        })};COMMIT;\\q\n`,
      );
      await waitUntil(
        () =>
          psql(
            box,
            "SELECT count(*)>0 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%80000000-0000-4000-8000-000000000012%';",
          ).stdout.trim() === "t",
        "second receipt row lock",
      );
      first.write("COMMIT;\\q\n");
      const [firstOutput, secondOutput] = await Promise.all([first.done(), second.done()]);
      assert.match(firstOutput, /"outcome": "received"/);
      assert.match(secondOutput, /"outcome": "version_conflict"/);
    });
    await scenario("inventory movement rows reject update and delete with stable errors", () => {
      for (const statement of [
        `UPDATE saas.inventory_movements SET quantity_delta=99 WHERE store_id='${STORE}' AND movement_kind='purchase_receipt'`,
        `DELETE FROM saas.inventory_movements WHERE store_id='${STORE}' AND movement_kind='purchase_receipt'`,
      ]) {
        const denied = psql(box, `SET ROLE celebix_saas_owner;${statement};`, DB, true);
        assert.notEqual(denied.status, 0);
        assert.match(denied.stderr, /INVENTORY_MOVEMENT_IMMUTABLE/);
      }
      for (const statement of [
        `UPDATE saas.inventory_operations SET payload_fingerprint=repeat('f',64) WHERE operation_id='80000000-0000-4000-8000-000000000001'`,
        `DELETE FROM saas.inventory_operations WHERE operation_id='80000000-0000-4000-8000-000000000001'`,
      ]) {
        const denied = psql(box, `SET ROLE celebix_saas_owner;${statement};`, DB, true);
        assert.notEqual(denied.status, 0);
        assert.match(denied.stderr, /INVENTORY_OPERATION_IMMUTABLE/);
      }
    });
    await scenario("application roles receive no direct inventory table DML", () => {
      for (const role of [
        "celebix_saas_app",
        "celebix_saas_workflow",
        "celebix_saas_host_resolver",
        "celebix_saas_bootstrap",
      ]) {
        for (const table of TABLES) {
          assert.equal(
            psql(
              box,
              `SELECT pg_catalog.has_table_privilege('${role}','saas.${table}','INSERT,UPDATE,DELETE');`,
            ).stdout.trim(),
            "f",
          );
        }
      }
    });
    await scenario("all six inventory relations enable and force RLS", () => {
      assert.equal(
        psql(
          box,
          `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relname=ANY(ARRAY[${TABLES.map((table) => `'${table}'`).join(",")}]) AND c.relrowsecurity AND c.relforcerowsecurity;`,
        ).stdout.trim(),
        "6",
      );
    });
    await scenario("only app receives execute on eight merchant functions", () => {
      for (const signature of FUNCTIONS) {
        assert.equal(
          psql(
            box,
            `SELECT pg_catalog.has_function_privilege('celebix_saas_app','saas.${signature}','EXECUTE');`,
          ).stdout.trim(),
          "t",
        );
        for (const role of [
          "celebix_saas_identity",
          "celebix_saas_workflow",
          "celebix_saas_host_resolver",
          "celebix_saas_bootstrap",
        ]) {
          assert.equal(
            psql(
              box,
              `SELECT pg_catalog.has_function_privilege('${role}','saas.${signature}','EXECUTE');`,
            ).stdout.trim(),
            "f",
          );
        }
        assert.equal(
          psql(
            box,
            `SELECT pg_catalog.has_function_privilege(0::oid,'saas.${signature}','EXECUTE');`,
          ).stdout.trim(),
          "f",
        );
      }
    });
    await scenario("backup and restore preserve executable inventory authority", () => {
      const archive = path.join(box.root, "inventory.dump");
      command(box.executables.pg_dump, [
        "-h",
        box.socket,
        "-p",
        String(box.port),
        "-U",
        "postgres",
        "-Fc",
        "-f",
        archive,
        DB,
      ]);
      psql(box, `CREATE DATABASE ${RESTORED};`, "postgres");
      command(box.executables.pg_restore, [
        "-h",
        box.socket,
        "-p",
        String(box.port),
        "-U",
        "postgres",
        "-d",
        RESTORED,
        archive,
      ]);
      apply(box, "202607220043_inventory_purchasing_assertions.sql", RESTORED);
      assert.equal(
        result(
          box,
          `saas.inventory_list_locations(${authority()})`,
          RESTORED,
        ).outcome,
        "listed",
      );
      assert.equal(
        psql(
          box,
          `SELECT count(*) FROM saas.inventory_movements WHERE movement_kind='purchase_receipt';`,
          RESTORED,
        ).stdout.trim(),
        psql(
          box,
          "SELECT count(*) FROM saas.inventory_movements WHERE movement_kind='purchase_receipt';",
        ).stdout.trim(),
      );
      psql(box, `DROP DATABASE ${RESTORED} WITH (FORCE);`, "postgres");
    });
    await scenario("rollback refuses nondisposable data then restores and reapplies exact state", () => {
      const refused = psql(
        box,
        readFileSync(
          path.join(SQL, "202607220043_inventory_purchasing.down.sql"),
          "utf8",
        ),
        DB,
        true,
      );
      assert.notEqual(refused.status, 0);
      assert.match(refused.stderr, /INVENTORY_PURCHASING_ROLLBACK_BLOCKED/);
      psql(
        box,
        `BEGIN;SET LOCAL ROLE celebix_saas_owner;
ALTER TABLE saas.inventory_movements DISABLE TRIGGER inventory_movements_immutable;
ALTER TABLE saas.inventory_operations DISABLE TRIGGER inventory_operations_immutable;
DELETE FROM saas.inventory_operations;
DELETE FROM saas.inventory_movements WHERE movement_kind<>'opening';
DELETE FROM saas.purchase_order_lines;
DELETE FROM saas.purchase_orders;
UPDATE saas.inventory_balances SET quantity=CASE variant_id WHEN '${VARIANT_A}' THEN 10 WHEN '${VARIANT_B}' THEN 5 ELSE quantity END,version=version+1,updated_at='2026-07-22T19:00:00Z' WHERE store_id='${STORE}';
SELECT pg_catalog.set_config('saas.inventory.source_marker','inventory_managed',true);
UPDATE saas.product_variants SET stock_quantity=CASE id WHEN '${VARIANT_A}' THEN 10 WHEN '${VARIANT_B}' THEN 5 ELSE stock_quantity END,version=version+1,updated_at='2026-07-22T19:00:00Z' WHERE store_id='${STORE}';
SELECT pg_catalog.set_config('saas.inventory.source_marker','',true);
COMMIT;`,
      );
      const stocksBefore = psql(
        box,
        "SELECT store_id||':'||id||':'||stock_quantity FROM saas.product_variants ORDER BY store_id,id;",
      ).stdout;
      apply(box, "202607220043_inventory_purchasing.down.sql");
      assert.equal(
        psql(box, "SELECT to_regclass('saas.inventory_locations') IS NULL;").stdout.trim(),
        "t",
      );
      assert.equal(
        psql(
          box,
          "SELECT pg_catalog.pg_get_functiondef('saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text)'::regprocedure);",
        ).stdout,
        authorityBefore,
      );
      for (const [signature, definition] of Object.entries(definitionsBefore)) {
        assert.equal(
          psql(
            box,
            `SELECT pg_catalog.pg_get_functiondef('${signature}'::regprocedure);`,
          ).stdout,
          definition,
          signature,
        );
      }
      apply(box, "202607220043_inventory_purchasing.up.sql");
      apply(box, "202607220043_inventory_purchasing_assertions.sql");
      assert.equal(
        psql(
          box,
          "SELECT store_id||':'||id||':'||stock_quantity FROM saas.product_variants ORDER BY store_id,id;",
        ).stdout,
        stocksBefore,
      );
      assert.equal(
        psql(
          box,
          "SELECT count(*) FROM saas.product_variants v WHERE v.status='active' AND (SELECT COALESCE(sum(b.quantity),0) FROM saas.inventory_balances b JOIN saas.inventory_locations l ON l.store_id=b.store_id AND l.id=b.location_id AND l.status='active' WHERE b.store_id=v.store_id AND b.variant_id=v.id)<>v.stock_quantity;",
        ).stdout.trim(),
        "0",
      );
    });
    assert.equal(count, TOTAL - 1);
    cleanupReady = true;
  } finally {
    const root = box?.root;
    const data = box?.data;
    const socket = box?.socket;
    const pid = box?.pid;
    stop(box);
    if (cleanupReady) {
      await scenario("cleanup removes disposable PostgreSQL and external connection state", () => {
        assert.equal(existsSync(root), false);
        assert.equal(existsSync(data), false);
        assert.equal(existsSync(socket), false);
        assert.equal(absent(pid), true);
      });
      assert.equal(count, TOTAL);
      console.log(`${TOTAL}/${TOTAL} PASS backup/restore rollback/reapply cleanup PASS`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
