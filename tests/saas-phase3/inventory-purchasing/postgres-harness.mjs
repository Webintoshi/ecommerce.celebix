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

function transactionJson(box, source, database = DB) {
  return psql(box, source, database).stdout
    .trim()
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
}

function resultSelect(functionCall) {
  return `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${functionCall};`;
}

function writerWitnessSelect({ variant, operationTable, operation }) {
  return `SELECT pg_catalog.jsonb_build_object(
  'stock',variant.stock_quantity,
  'balance',saas.inventory_active_balance_total(variant.store_id,variant.id),
  'aggregateEqual',variant.stock_quantity=saas.inventory_active_balance_total(variant.store_id,variant.id),
  'movementCount',(SELECT count(*) FROM saas.inventory_movements AS movement WHERE movement.store_id=variant.store_id AND movement.variant_id=variant.id),
  'openingDelta',(SELECT COALESCE(sum(movement.quantity_delta),0) FROM saas.inventory_movements AS movement WHERE movement.store_id=variant.store_id AND movement.variant_id=variant.id AND movement.movement_kind='opening'),
  'nonOpeningMovements',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'kind',movement.movement_kind,'direction',movement.direction,'delta',movement.quantity_delta,
    'sourceKind',movement.source_kind,'sourceId',movement.source_id
  ) ORDER BY movement.occurred_at,movement.id),'[]'::jsonb) FROM saas.inventory_movements AS movement WHERE movement.store_id=variant.store_id AND movement.variant_id=variant.id AND movement.movement_kind<>'opening'),
  'operationProofCount',(SELECT count(*) FROM saas.${operationTable} AS operation WHERE operation.operation_id='${operation}'),
  'operationKind',(SELECT operation.operation_kind FROM saas.${operationTable} AS operation WHERE operation.operation_id='${operation}'),
  'operationFingerprint',(SELECT operation.payload_fingerprint FROM saas.${operationTable} AS operation WHERE operation.operation_id='${operation}'),
  'operationResult',(SELECT operation.result_payload FROM saas.${operationTable} AS operation WHERE operation.operation_id='${operation}')
) FROM saas.product_variants AS variant WHERE variant.store_id='${STORE}' AND variant.id='${variant}';`;
}

function purchaseMutationSnapshotSelect({ variant, location, order, line, operation }) {
  return `SELECT pg_catalog.jsonb_build_object(
  'variant',(SELECT to_jsonb(row_value) FROM saas.product_variants AS row_value WHERE row_value.store_id='${STORE}' AND row_value.id='${variant}'),
  'balance',(SELECT to_jsonb(row_value) FROM saas.inventory_balances AS row_value WHERE row_value.store_id='${STORE}' AND row_value.location_id='${location}' AND row_value.variant_id='${variant}'),
  'purchase',(SELECT to_jsonb(row_value) FROM saas.purchase_orders AS row_value WHERE row_value.store_id='${STORE}' AND row_value.id='${order}'),
  'line',(SELECT to_jsonb(row_value) FROM saas.purchase_order_lines AS row_value WHERE row_value.store_id='${STORE}' AND row_value.purchase_order_id='${order}' AND row_value.id='${line}'),
  'movements',(SELECT COALESCE(pg_catalog.jsonb_agg(to_jsonb(row_value) ORDER BY row_value.occurred_at,row_value.id),'[]'::jsonb) FROM saas.inventory_movements AS row_value WHERE row_value.store_id='${STORE}' AND row_value.variant_id='${variant}'),
  'operations',(SELECT COALESCE(pg_catalog.jsonb_agg(to_jsonb(row_value) ORDER BY row_value.committed_at,row_value.operation_id),'[]'::jsonb) FROM saas.inventory_operations AS row_value WHERE row_value.store_id='${STORE}' AND (row_value.result_entity_id='${order}' OR row_value.operation_id='${operation}'))
);`;
}

function variantMutationSnapshotSelect({ variant }) {
  return `SELECT pg_catalog.jsonb_build_object(
  'variant',(SELECT to_jsonb(row_value) FROM saas.product_variants AS row_value WHERE row_value.store_id='${STORE}' AND row_value.id='${variant}'),
  'balances',(SELECT COALESCE(pg_catalog.jsonb_agg(to_jsonb(row_value) ORDER BY row_value.location_id),'[]'::jsonb) FROM saas.inventory_balances AS row_value WHERE row_value.store_id='${STORE}' AND row_value.variant_id='${variant}'),
  'movements',(SELECT COALESCE(pg_catalog.jsonb_agg(to_jsonb(row_value) ORDER BY row_value.occurred_at,row_value.id),'[]'::jsonb) FROM saas.inventory_movements AS row_value WHERE row_value.store_id='${STORE}' AND row_value.variant_id='${variant}'),
  'heldReservations',(SELECT COALESCE(pg_catalog.jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id),'[]'::jsonb) FROM saas.checkout_inventory_reservations AS row_value WHERE row_value.store_id='${STORE}' AND row_value.variant_id='${variant}' AND row_value.status='held')
);`;
}

function assertWriterEvidence(
  rows,
  {
    successOutcome,
    replayOutcome = "operation_replayed",
    stock,
    openingDelta,
    operationKind,
    fingerprint,
    nonOpeningMovements = [],
  },
) {
  assert.equal(rows.length, 4);
  assert.equal(rows[0].outcome, successOutcome);
  assert.equal(rows[1].outcome, replayOutcome);
  assert.deepEqual(rows[1].result, rows[0].result);
  assert.equal(rows[2].outcome, "operation_mismatch");
  assert.equal(rows[3].stock, stock);
  assert.equal(rows[3].balance, stock);
  assert.equal(rows[3].aggregateEqual, true);
  assert.equal(rows[3].movementCount, 1 + nonOpeningMovements.length);
  assert.equal(rows[3].openingDelta, openingDelta);
  assert.deepEqual(rows[3].nonOpeningMovements, nonOpeningMovements);
  assert.equal(rows[3].operationProofCount, 1);
  assert.equal(rows[3].operationKind, operationKind);
  assert.equal(rows[3].operationFingerprint, fingerprint);
  assert.deepEqual(rows[3].operationResult, rows[0].result);
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

function interactive(box, applicationName = "inventory-purchasing-interactive") {
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
    {
      cwd: ROOT,
      env: {
        ...process.env,
        LC_ALL: "C",
        LANG: "C",
        PGAPPNAME: applicationName,
      },
    },
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
    await scenario("manifest pins twenty one exact checksums", () => {
      const manifest = JSON.parse(
        readFileSync(path.join(SQL, "phase3h-merchant-completion-manifest.json"), "utf8"),
      );
      assert.equal(manifest.artifacts.length, 21);
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

      const catalogAuthority = `'${STORE}'::uuid,'${OWNER}'::uuid,'${OWNER_MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter'::text,1::bigint,100::bigint,'${NOW}'::timestamptz`;
      const writerProduct = "90000000-0000-4000-8000-000000000101";
      const writerProductVariant = "91000000-0000-4000-8000-000000000101";
      const createProductOperation = "92000000-0000-4000-8000-000000000101";
      const createProduct = (fingerprint) =>
        `saas.catalog_create_product(${catalogAuthority},'${createProductOperation}'::uuid,'${fingerprint}'::text,'${writerProduct}'::uuid,'${writerProductVariant}'::uuid,'writer-product'::text,'Writer Product'::text,'Writer product inventory proof'::text,'draft'::text,'TRY'::text,'Default'::text,'WRITER-PRODUCT'::text,NULL::text,1000::bigint,NULL::bigint,500::bigint,true,4::bigint,'{}'::jsonb)`;
      assertWriterEvidence(
        transactionJson(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;
${resultSelect(createProduct("11".repeat(32)))}
${resultSelect(createProduct("11".repeat(32)))}
${resultSelect(createProduct("12".repeat(32)))}
SET LOCAL ROLE celebix_saas_owner;
${writerWitnessSelect({ variant: writerProductVariant, operationTable: "catalog_operations", operation: createProductOperation })}
ROLLBACK;`,
        ),
        {
          successOutcome: "created",
          stock: 4,
          openingDelta: 4,
          operationKind: "create_product",
          fingerprint: "11".repeat(32),
        },
      );

      const writerVariant = "91000000-0000-4000-8000-000000000102";
      const createVariantOperation = "92000000-0000-4000-8000-000000000102";
      const createVariant = (fingerprint) =>
        `saas.catalog_create_variant(${catalogAuthority},'${createVariantOperation}'::uuid,'${fingerprint}'::text,'${PRODUCT}'::uuid,'${writerVariant}'::uuid,'Writer Variant'::text,'WRITER-VARIANT'::text,NULL::text,1100::bigint,NULL::bigint,600::bigint,true,6::bigint,'{}'::jsonb)`;
      assertWriterEvidence(
        transactionJson(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;
${resultSelect(createVariant("13".repeat(32)))}
${resultSelect(createVariant("13".repeat(32)))}
${resultSelect(createVariant("14".repeat(32)))}
SET LOCAL ROLE celebix_saas_owner;
${writerWitnessSelect({ variant: writerVariant, operationTable: "catalog_operations", operation: createVariantOperation })}
ROLLBACK;`,
        ),
        {
          successOutcome: "created",
          stock: 6,
          openingDelta: 6,
          operationKind: "create_variant",
          fingerprint: "13".repeat(32),
        },
      );

      const updateVariantOperation = "92000000-0000-4000-8000-000000000103";
      const updateVariant = (fingerprint) =>
        `saas.catalog_update_variant(${catalogAuthority},'${updateVariantOperation}'::uuid,'${fingerprint}'::text,'${PRODUCT}'::uuid,'${VARIANT_A}'::uuid,1::bigint,'A Updated'::text,'WRITER-UPDATE'::text,NULL::text,1000::bigint,NULL::bigint,500::bigint,true,12::bigint,'{}'::jsonb)`;
      assertWriterEvidence(
        transactionJson(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;
${resultSelect(updateVariant("15".repeat(32)))}
${resultSelect(updateVariant("15".repeat(32)))}
${resultSelect(updateVariant("16".repeat(32)))}
SET LOCAL ROLE celebix_saas_owner;
${writerWitnessSelect({ variant: VARIANT_A, operationTable: "catalog_operations", operation: updateVariantOperation })}
ROLLBACK;`,
        ),
        {
          successOutcome: "updated",
          stock: 12,
          openingDelta: 10,
          operationKind: "update_variant",
          fingerprint: "15".repeat(32),
          nonOpeningMovements: [
            {
              kind: "catalog_adjustment",
              direction: "in",
              delta: 2,
              sourceKind: "catalog_adjustment",
              sourceId: updateVariantOperation,
            },
          ],
        },
      );

      const legacyProduct = "90000000-0000-4000-8000-000000000104";
      const legacyVariant = "91000000-0000-4000-8000-000000000104";
      const legacyOperation = "92000000-0000-4000-8000-000000000104";
      const legacyJob = "93000000-0000-4000-8000-000000000104";
      const legacyPayload = JSON.stringify([
        {
          productId: legacyProduct,
          variantId: legacyVariant,
          title: "Legacy Writer",
          slug: "legacy-writer",
          priceCents: 1200,
          sku: "LEGACY-WRITER",
          stockQuantity: 8,
        },
      ]);
      const legacyImport = (fingerprint) =>
        `saas.catalog_admin_import_products(${authority()},100::bigint,'${legacyOperation}'::uuid,'${fingerprint}'::text,'${legacyJob}'::uuid,'writer.csv'::text,'${legacyPayload}'::jsonb)`;
      assertWriterEvidence(
        transactionJson(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;
${resultSelect(legacyImport("17".repeat(32)))}
${resultSelect(legacyImport("17".repeat(32)))}
${resultSelect(legacyImport("18".repeat(32)))}
SET LOCAL ROLE celebix_saas_owner;
${writerWitnessSelect({ variant: legacyVariant, operationTable: "catalog_admin_operations", operation: legacyOperation })}
ROLLBACK;`,
        ),
        {
          successOutcome: "imported",
          stock: 8,
          openingDelta: 8,
          operationKind: "import_products",
          fingerprint: "17".repeat(32),
        },
      );

      const preview = "94000000-0000-4000-8000-000000000105";
      const previewPrepareOperation = "92000000-0000-4000-8000-000000000105";
      const previewCommitOperation = "92000000-0000-4000-8000-000000000106";
      const previewJob = "93000000-0000-4000-8000-000000000106";
      const previewVariant = psql(
        box,
        `SELECT saas.catalog_import_preview_uuid('${preview}',1,'variant');`,
      ).stdout.trim();
      const previewPayload = JSON.stringify([
        {
          title: "Preview Writer",
          slug: "preview-writer",
          priceCents: 1300,
          sku: "PREVIEW-WRITER",
          stockQuantity: 9,
        },
      ]);
      const preparePreview = `saas.catalog_admin_prepare_import_preview(${authority()},100::bigint,'${previewPrepareOperation}'::uuid,'${"19".repeat(32)}'::text,'${preview}'::uuid,'shopify_csv'::text,'preview.csv'::text,'${"2a".repeat(32)}'::text,'${previewPayload}'::jsonb)`;
      const commitPreview = (fingerprint) =>
        `saas.catalog_admin_commit_import_preview(${authority()},100::bigint,'${previewCommitOperation}'::uuid,'${fingerprint}'::text,'${preview}'::uuid,1::bigint,'shopify_csv'::text,'${"2a".repeat(32)}'::text,'${previewPayload}'::jsonb,'${previewJob}'::uuid)`;
      assertWriterEvidence(
        transactionJson(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_app;
SELECT outcome FROM ${preparePreview};
${resultSelect(commitPreview("1a".repeat(32)))}
${resultSelect(commitPreview("1a".repeat(32)))}
${resultSelect(commitPreview("1b".repeat(32)))}
SET LOCAL ROLE celebix_saas_owner;
${writerWitnessSelect({ variant: previewVariant, operationTable: "catalog_admin_operations", operation: previewCommitOperation })}
ROLLBACK;`,
        ),
        {
          successOutcome: "imported",
          stock: 9,
          openingDelta: 9,
          operationKind: "commit_import_preview",
          fingerprint: "1a".repeat(32),
        },
      );

      const settlementOperation = "92000000-0000-4000-8000-000000000107";
      const settlementAttempt = "95000000-0000-4000-8000-000000000107";
      const settlementOrder = "96000000-0000-4000-8000-000000000107";
      const settlementCall = (callbackDigest, fingerprint) =>
        `saas.checkout_settle_callback('1234567890abcdef1234567890abcdea'::text,'${callbackDigest}'::text,'${settlementOperation}'::uuid,'${fingerprint}'::text,'success'::text,1000::bigint,1000::bigint,'TRY'::text,'card'::text,1::integer,NULL::text,NULL::text,'${settlementOrder}'::uuid,ARRAY['96000000-0000-4000-8000-000000000108'::uuid],'96000000-0000-4000-8000-000000000109'::uuid,'WRITER-ORDER'::text,'${NOW}'::timestamptz)`;
      assertWriterEvidence(
        transactionJson(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.checkout_provider_configs(id,store_id,provider_key,status,public_origin,configuration_key_id,sealed_configuration,configuration_digest,version,created_at,updated_at)
VALUES('95000000-0000-4000-8000-000000000101','${STORE}','paytr','active','https://www.paytr.com','key-1',${ENVELOPE},repeat('d',64),1,'2026-07-22T17:00:00Z','2026-07-22T17:00:00Z');
INSERT INTO saas.quick_order_links(id,store_id,creating_membership_id,provider_config_id,status,token_digest,token_key_id,sealed_token,customer_name,customer_email,customer_phone,shipping_address,billing_address,internal_label,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,expires_at,version,created_at,updated_at)
VALUES('95000000-0000-4000-8000-000000000102','${STORE}','${OWNER_MEMBERSHIP}','95000000-0000-4000-8000-000000000101','active',repeat('a',64),'key-1',${ENVELOPE},'Ada Lovelace','ada-writer@example.test','+905551110000',${ADDRESS},${ADDRESS},'writer settlement','TRY',1000,0,0,1000,'2026-07-23T17:00:00Z',1,'2026-07-22T17:00:00Z','2026-07-22T17:00:00Z');
INSERT INTO saas.quick_order_link_items(id,store_id,quick_order_link_id,product_id,variant_id,position,product_name,variant_name,unit_price_cents,quantity,line_total_cents,created_at)
VALUES('95000000-0000-4000-8000-000000000103','${STORE}','95000000-0000-4000-8000-000000000102','${PRODUCT}','${VARIANT_A}',0,'Urun A','A',500,2,1000,'2026-07-22T17:00:00Z');
INSERT INTO saas.quick_order_redemption_sessions(id,store_id,quick_order_link_id,cookie_digest,expires_at,version,created_at,updated_at)
VALUES('95000000-0000-4000-8000-000000000104','${STORE}','95000000-0000-4000-8000-000000000102',repeat('e',64),'2026-07-23T17:00:00Z',1,'2026-07-22T17:50:00Z','2026-07-22T17:50:00Z');
INSERT INTO saas.checkout_payment_attempts(id,store_id,quick_order_link_id,redemption_session_id,provider_config_id,provider_config_version,configuration_digest,configuration_key_id,sealed_configuration,merchant_oid,expected_subtotal_cents,expected_shipping_cents,expected_discount_cents,expected_payment_amount,currency,status,provider_token_digest,provider_token_key_id,sealed_provider_token,hold_expires_at,provider_ready_at,version,created_at,updated_at)
VALUES('${settlementAttempt}','${STORE}','95000000-0000-4000-8000-000000000102','95000000-0000-4000-8000-000000000104','95000000-0000-4000-8000-000000000101',1,repeat('d',64),'key-1',${ENVELOPE},'1234567890abcdef1234567890abcdea',1000,0,0,1000,'TRY','provider_ready',repeat('1',64),'key-1',${ENVELOPE},'2026-07-22T17:55:00Z','2026-07-22T17:51:00Z',1,'2026-07-22T17:50:00Z','2026-07-22T17:51:00Z');
INSERT INTO saas.checkout_inventory_reservations(id,store_id,attempt_id,quick_order_link_id,product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at)
VALUES('95000000-0000-4000-8000-000000000105','${STORE}','${settlementAttempt}','95000000-0000-4000-8000-000000000102','${PRODUCT}','${VARIANT_A}',2,true,'held','2026-07-22T17:50:00Z',1,'2026-07-22T17:50:00Z');
SET LOCAL ROLE celebix_saas_workflow;
${resultSelect(settlementCall("2b".repeat(32), "1c".repeat(32)))}
${resultSelect(settlementCall("2b".repeat(32), "1c".repeat(32)))}
${resultSelect(settlementCall("2c".repeat(32), "1d".repeat(32)))}
SET LOCAL ROLE celebix_saas_owner;
${writerWitnessSelect({ variant: VARIANT_A, operationTable: "checkout_operations", operation: settlementOperation })}
ROLLBACK;`,
        ),
        {
          successOutcome: "settled",
          replayOutcome: "replayed",
          stock: 8,
          openingDelta: 10,
          operationKind: "settle_callback",
          fingerprint: "1c".repeat(32),
          nonOpeningMovements: [
            {
              kind: "checkout_sale",
              direction: "out",
              delta: -2,
              sourceKind: "checkout_sale",
              sourceId: settlementAttempt,
            },
          ],
        },
      );
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
      const before = psql(
        box,
        purchaseMutationSnapshotSelect({
          variant: VARIANT_A,
          location,
          order: ORDER_OVER,
          line: LINE_OVER,
          operation: "80000000-0000-4000-8000-00000000000b",
        }),
      ).stdout.trim();
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
      assert.equal(
        psql(
          box,
          purchaseMutationSnapshotSelect({
            variant: VARIANT_A,
            location,
            order: ORDER_OVER,
            line: LINE_OVER,
            operation: "80000000-0000-4000-8000-00000000000b",
          }),
        ).stdout.trim(),
        before,
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
                variantId: VARIANT_A,
                orderedQuantity: 1,
                unitCostCents: 1,
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
            operation: "80000000-0000-4000-8000-000000000026",
            fingerprint: "71".repeat(32),
            order: "60000000-0000-4000-8000-000000000096",
            location,
            lines: [
              {
                lineId: "61000000-0000-4000-8000-000000000096",
                variantId: CROSS_VARIANT,
                orderedQuantity: 1,
                unitCostCents: 1,
              },
            ],
          }),
        ).outcome,
        "invalid_input",
      );
      const crossOrder = "60000000-0000-4000-8000-000000000095";
      const crossOrderRows = transactionJson(
        box,
        `BEGIN;SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.purchase_orders(id,store_id,location_id,supplier_name,status,total_cost_cents,version,created_at,updated_at)
VALUES('${crossOrder}','${STORE_B}','${crossLocation}','Cross Supplier','draft',1,1,'${NOW}','${NOW}');
SET LOCAL ROLE celebix_saas_app;
${resultSelect(
  saveCall({
    operation: "80000000-0000-4000-8000-000000000027",
    fingerprint: "72".repeat(32),
    order: crossOrder,
    location,
    lines: [
      {
        lineId: "61000000-0000-4000-8000-000000000095",
        variantId: VARIANT_A,
        orderedQuantity: 1,
        unitCostCents: 1,
      },
    ],
  }),
)}
ROLLBACK;`,
      );
      assert.equal(crossOrderRows.length, 1);
      assert.equal(crossOrderRows[0].outcome, "invalid_input");
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
              { ...baseLines[1], lineId: "61000000-0000-4000-8000-000000000098" },
            ],
          }),
        ).outcome,
        "invalid_input",
      );
      assert.equal(
        result(
          box,
          saveCall({
            operation: "80000000-0000-4000-8000-000000000028",
            fingerprint: "81".repeat(32),
            order: "60000000-0000-4000-8000-000000000094",
            location,
            lines: [
              { ...baseLines[0], lineId: "61000000-0000-4000-8000-000000000093" },
              { ...baseLines[0], lineId: "61000000-0000-4000-8000-000000000094" },
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
      const malformed = psql(
        box,
        `SET ROLE celebix_saas_app;SELECT outcome FROM saas.inventory_list_locations(${authority({ now: "not-a-timestamp" })});`,
        DB,
        true,
      );
      assert.notEqual(malformed.status, 0);
      assert.match(malformed.stderr, /invalid input syntax for type timestamp with time zone/);
      for (const nonfinite of ["infinity", "-infinity"]) {
        assert.equal(
          result(
            box,
            `saas.inventory_list_locations(${authority({ now: nonfinite })})`,
          ).outcome,
          "invalid_input",
        );
      }
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
        variantMutationSnapshotSelect({ variant: VARIANT_A }),
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
          variantMutationSnapshotSelect({ variant: VARIANT_A }),
        ).stdout.trim(),
        before,
      );
      const reconcileDenial = psql(
        box,
        `BEGIN;SET LOCAL ROLE celebix_saas_owner;
SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);
SELECT pg_catalog.set_config('saas.inventory.source_id','70000000-0000-4000-8000-000000000017',true);
SELECT pg_catalog.set_config('saas.inventory.source_time','2026-07-22T18:03:30Z',true);
SELECT saas.inventory_reconcile_variant_delta('${STORE}','${VARIANT_A}',15,14,false);
COMMIT;`,
        DB,
        true,
      );
      assert.notEqual(reconcileDenial.status, 0);
      assert.match(reconcileDenial.stderr, /INVENTORY_ACTIVE_HOLD_VIOLATION/);
      assert.equal(
        psql(
          box,
          variantMutationSnapshotSelect({ variant: VARIANT_A }),
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
      const secondLine = "61000000-0000-4000-8000-000000000007";
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
            {
              lineId: secondLine,
              variantId: VARIANT_B,
              orderedQuantity: 1,
              unitCostCents: 800,
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

      const purchaseProbe = `SELECT 1 FROM saas.purchase_orders WHERE store_id='${STORE}' AND id='${ORDER_CONCURRENT}' FOR UPDATE NOWAIT`;
      const variantAProbe = `SELECT 1 FROM saas.product_variants WHERE store_id='${STORE}' AND id='${VARIANT_A}' FOR UPDATE NOWAIT`;
      const variantBProbe = `SELECT 1 FROM saas.product_variants WHERE store_id='${STORE}' AND id='${VARIANT_B}' FOR UPDATE NOWAIT`;
      const balanceAProbe = `SELECT 1 FROM saas.inventory_balances WHERE store_id='${STORE}' AND location_id='${location}' AND variant_id='${VARIANT_A}' FOR UPDATE NOWAIT`;
      const balanceBProbe = `SELECT 1 FROM saas.inventory_balances WHERE store_id='${STORE}' AND location_id='${location}' AND variant_id='${VARIANT_B}' FOR UPDATE NOWAIT`;
      const probe = (source, expectedBlocked, label) => {
        const completed = psql(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_owner;${source};ROLLBACK;`,
          DB,
          true,
        );
        if (expectedBlocked) {
          assert.notEqual(completed.status, 0, label);
          assert.match(completed.stderr, /could not obtain lock on row/, label);
        } else {
          assert.equal(completed.status, 0, `${label}: ${completed.stderr}`);
          assert.equal(completed.stdout.trim(), "1", label);
        }
      };
      const lockReceipts = [
        { lineId: secondLine, quantity: 1 },
        { lineId: line, quantity: 1 },
      ];
      const proveLockStage = async ({
        name,
        blockerSql,
        operation,
        blockedProbes,
        freeProbes,
      }) => {
        const blocker = interactive(box, `inventory_lock_blocker_${name}`);
        blocker.write(
          `BEGIN;SET LOCAL ROLE celebix_saas_owner;${blockerSql};SELECT 'BLOCKER_READY';\n`,
        );
        await waitUntil(
          () => blocker.output().includes("BLOCKER_READY"),
          `${name} blocker`,
        );
        const receiverApp = `inventory_lock_receiver_${name}`;
        const receiver = interactive(box, receiverApp);
        receiver.write(
          `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM ${receiveCall({
            operation,
            fingerprint: operation.slice(-2).repeat(32),
            order: ORDER_CONCURRENT,
            expected: 2,
            location,
            receipts: lockReceipts,
          })};ROLLBACK;SELECT 'RECEIVER_DONE';\\q\n`,
        );
        try {
          await waitUntil(
            () =>
              psql(
                box,
                `SELECT a.wait_event_type='Lock' AND EXISTS(
  SELECT 1 FROM pg_catalog.pg_locks AS held
  WHERE held.pid=a.pid AND NOT held.granted
)
FROM pg_catalog.pg_stat_activity AS a
WHERE a.datname=current_database() AND a.application_name='${receiverApp}';`,
              ).stdout.trim() === "t",
            `${name} pg_stat_activity and pg_locks barrier`,
          );
          for (const [label, source] of blockedProbes) probe(source, true, `${name} ${label}`);
          for (const [label, source] of freeProbes) probe(source, false, `${name} ${label}`);
        } finally {
          blocker.write("ROLLBACK;\\q\n");
        }
        const [blockerOutput, receiverOutput] = await Promise.all([
          blocker.done(),
          receiver.done(),
        ]);
        assert.match(blockerOutput, /BLOCKER_READY/);
        assert.match(receiverOutput, /received/);
        assert.match(receiverOutput, /RECEIVER_DONE/);
      };

      await proveLockStage({
        name: "purchase",
        blockerSql: purchaseProbe.replace(" NOWAIT", ""),
        operation: "80000000-0000-4000-8000-000000000031",
        blockedProbes: [["purchase blocked", purchaseProbe]],
        freeProbes: [
          ["variant A downstream free", variantAProbe],
          ["variant B downstream free", variantBProbe],
          ["balance A downstream free", balanceAProbe],
          ["balance B downstream free", balanceBProbe],
        ],
      });
      await proveLockStage({
        name: "variant_a",
        blockerSql: variantAProbe.replace(" NOWAIT", ""),
        operation: "80000000-0000-4000-8000-000000000032",
        blockedProbes: [
          ["purchase retained", purchaseProbe],
          ["variant A blocked", variantAProbe],
        ],
        freeProbes: [
          ["variant B sorted downstream free", variantBProbe],
          ["balance A downstream free", balanceAProbe],
          ["balance B downstream free", balanceBProbe],
        ],
      });
      await proveLockStage({
        name: "variant_b",
        blockerSql: variantBProbe.replace(" NOWAIT", ""),
        operation: "80000000-0000-4000-8000-000000000033",
        blockedProbes: [
          ["purchase retained", purchaseProbe],
          ["variant A sorted predecessor retained", variantAProbe],
          ["variant B blocked", variantBProbe],
        ],
        freeProbes: [
          ["balance A downstream free", balanceAProbe],
          ["balance B downstream free", balanceBProbe],
        ],
      });
      await proveLockStage({
        name: "balance_a",
        blockerSql: balanceAProbe.replace(" NOWAIT", ""),
        operation: "80000000-0000-4000-8000-000000000034",
        blockedProbes: [
          ["purchase retained", purchaseProbe],
          ["variant A retained", variantAProbe],
          ["variant B retained", variantBProbe],
          ["balance A blocked", balanceAProbe],
        ],
        freeProbes: [["balance B sorted downstream free", balanceBProbe]],
      });
      await proveLockStage({
        name: "balance_b",
        blockerSql: balanceBProbe.replace(" NOWAIT", ""),
        operation: "80000000-0000-4000-8000-000000000035",
        blockedProbes: [
          ["purchase retained", purchaseProbe],
          ["variant A retained", variantAProbe],
          ["variant B retained", variantBProbe],
          ["balance A sorted predecessor retained", balanceAProbe],
          ["balance B blocked", balanceBProbe],
        ],
        freeProbes: [],
      });

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
      const restoreProbeSignature =
        "saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)";
      const patchedDefinition = psql(
        box,
        `SELECT pg_catalog.pg_get_functiondef('${restoreProbeSignature}'::regprocedure);`,
      ).stdout;
      const extraGucDefinition = patchedDefinition.replace(
        "-- inventory marker begin",
        "-- inventory marker begin\n  PERFORM pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);",
      );
      psql(box, extraGucDefinition);
      const gucShapeRefused = psql(
        box,
        readFileSync(
          path.join(SQL, "202607220043_inventory_purchasing.down.sql"),
          "utf8",
        ),
        DB,
        true,
      );
      assert.notEqual(gucShapeRefused.status, 0);
      assert.match(gucShapeRefused.stderr, /INVENTORY_WRITER_RESTORE_DRIFT/);
      psql(box, patchedDefinition);

      const sourceIdSet =
        "PERFORM pg_catalog.set_config('saas.inventory.source_id',p_operation_id::text,true);";
      const sourceTimeSet =
        "PERFORM pg_catalog.set_config('saas.inventory.source_time',p_now::text,true);";
      assert.ok(patchedDefinition.includes(`${sourceIdSet}\n  ${sourceTimeSet}`));
      for (const injectedStatement of [
        "PERFORM pg_catalog.set_config('saas.unrelated','x',true);",
        "PERFORM 1;",
      ]) {
        const sameLineDefinition = patchedDefinition.replace(
          sourceTimeSet,
          `${sourceTimeSet} ${injectedStatement}`,
        );
        psql(box, sameLineDefinition);
        const sameLineRefused = psql(
          box,
          readFileSync(
            path.join(SQL, "202607220043_inventory_purchasing.down.sql"),
            "utf8",
          ),
          DB,
          true,
        );
        assert.notEqual(sameLineRefused.status, 0);
        assert.match(sameLineRefused.stderr, /INVENTORY_WRITER_RESTORE_DRIFT/);
        psql(box, patchedDefinition);
      }

      const reorderedDefinition = patchedDefinition.replace(
        `${sourceIdSet}\n  ${sourceTimeSet}`,
        `${sourceTimeSet}\n  ${sourceIdSet}`,
      );
      psql(box, reorderedDefinition);
      const reorderedRefused = psql(
        box,
        readFileSync(
          path.join(SQL, "202607220043_inventory_purchasing.down.sql"),
          "utf8",
        ),
        DB,
        true,
      );
      assert.notEqual(reorderedRefused.status, 0);
      assert.match(reorderedRefused.stderr, /INVENTORY_WRITER_RESTORE_DRIFT/);
      psql(box, patchedDefinition);

      const residueDefinition = patchedDefinition.replace(
        "-- inventory marker begin",
        "-- saas.inventory.source_marker restore residue\n  -- inventory marker begin",
      );
      psql(box, residueDefinition);
      const residueRefused = psql(
        box,
        readFileSync(
          path.join(SQL, "202607220043_inventory_purchasing.down.sql"),
          "utf8",
        ),
        DB,
        true,
      );
      assert.notEqual(residueRefused.status, 0);
      assert.match(residueRefused.stderr, /INVENTORY_WRITER_RESTORE_RESIDUE/);
      psql(box, patchedDefinition);

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
