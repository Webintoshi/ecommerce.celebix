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
const DB = "inventory_counts_transfers";
const RESTORED = "inventory_counts_transfers_restored";
const PLAN = "00000000-0000-4000-8000-000000000001";
const STORE = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const OWNER = "20000000-0000-4000-8000-000000000001";
const OWNER_MEMBERSHIP = "30000000-0000-4000-8000-000000000001";
const PRODUCT = "40000000-0000-4000-8000-000000000001";
const PRODUCT_B = "40000000-0000-4000-8000-000000000002";
const VARIANT_A = "50000000-0000-4000-8000-000000000001";
const VARIANT_B = "50000000-0000-4000-8000-000000000002";
const CROSS_VARIANT = "50000000-0000-4000-8000-000000000003";
const LOCATION_B = "51000000-0000-4000-8000-000000000002";
const LOCATION_ARCHIVED = "51000000-0000-4000-8000-000000000003";
const COUNT_MAIN = "60000000-0000-4000-8000-000000000001";
const COUNT_STALE = "60000000-0000-4000-8000-000000000002";
const COUNT_NEGATIVE = "60000000-0000-4000-8000-000000000003";
const COUNT_HOLD = "60000000-0000-4000-8000-000000000004";
const COUNT_CONCURRENT_A = "60000000-0000-4000-8000-000000000005";
const COUNT_CONCURRENT_B = "60000000-0000-4000-8000-000000000006";
const COUNT_CANCEL = "60000000-0000-4000-8000-000000000007";
const COUNT_CANCEL_STARTED = "60000000-0000-4000-8000-000000000008";
const TRANSFER_RECEIVE = "70000000-0000-4000-8000-000000000001";
const TRANSFER_CANCEL = "70000000-0000-4000-8000-000000000002";
const TRANSFER_INSUFFICIENT = "70000000-0000-4000-8000-000000000003";
const TRANSFER_REVERSE_A = "70000000-0000-4000-8000-000000000004";
const TRANSFER_REVERSE_B = "70000000-0000-4000-8000-000000000005";
const CHECKOUT_LINK = "74000000-0000-4000-8000-000000000001";
const CHECKOUT_ITEM = "74000000-0000-4000-8000-000000000002";
const CHECKOUT_REDEMPTION = "74000000-0000-4000-8000-000000000003";
const CHECKOUT_ATTEMPT = "74000000-0000-4000-8000-000000000004";
const CHECKOUT_RESERVATION = "74000000-0000-4000-8000-000000000005";
const CHECKOUT_ORDER = "74000000-0000-4000-8000-000000000006";
const CHECKOUT_ORDER_ITEM = "74000000-0000-4000-8000-000000000007";
const CHECKOUT_ORDER_EVENT = "74000000-0000-4000-8000-000000000008";
const CHECKOUT_OPERATION = "74000000-0000-4000-8000-000000000009";
const CHECKOUT_MERCHANT_OID = "abcdef1234567890abcdef1234567890";
const NOW = "2026-07-22T20:00:00.000Z";
const ADDRESS = `'{"recipientName":"Ada Lovelace","phone":"+905551110000","line1":"Test 1","city":"Istanbul","country":"TR"}'::jsonb`;
const ENVELOPE = `'{"algorithm":"A256GCM","ciphertext":"cXVpY2stbGluay10b2tlbi1jaXBoZXJ0ZXh0","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}'::jsonb`;

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
  "inventory_counts",
  "inventory_count_lines",
  "inventory_transfers",
  "inventory_transfer_lines",
];
const FUNCTIONS = [
  "inventory_counts_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)",
  "inventory_counts_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)",
  "inventory_counts_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,jsonb)",
  "inventory_counts_start(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)",
  "inventory_counts_commit(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)",
  "inventory_counts_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)",
  "inventory_transfers_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)",
  "inventory_transfers_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)",
  "inventory_transfers_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,uuid,jsonb)",
  "inventory_transfers_dispatch(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)",
  "inventory_transfers_receive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)",
  "inventory_transfers_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)",
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
  const root = mkdtempSync("/tmp/celebix-inventory-counts-transfers-");
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

function authority(now = NOW) {
  return `'${STORE}'::uuid,'${OWNER}'::uuid,'${OWNER_MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter'::text,1::bigint,'${now}'::timestamptz`;
}

function catalogAuthority(now = NOW) {
  return `'${STORE}'::uuid,'${OWNER}'::uuid,'${OWNER_MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter'::text,1::bigint,100::bigint,'${now}'::timestamptz`;
}

function result(box, functionCall, database = DB) {
  const output = psql(
    box,
    `SET ROLE celebix_saas_app;SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${functionCall};`,
    database,
  ).stdout.trim();
  return JSON.parse(output);
}

function fingerprint(marker) {
  return createHash("sha256").update(marker).digest("hex");
}

function operation(seed) {
  return `8${String(seed).padStart(7, "0")}-0000-4000-8000-${String(seed).padStart(12, "0")}`;
}

function line(seed) {
  return `9${String(seed).padStart(7, "0")}-0000-4000-8000-${String(seed).padStart(12, "0")}`;
}

function countSave({
  op,
  count,
  expected = "NULL",
  location,
  lines,
  fp = fingerprint(op),
  now = NOW,
}) {
  return `saas.inventory_counts_save(${authority(now)},'${op}'::uuid,'${fp}','${count}'::uuid,${expected}::bigint,'${location}'::uuid,'${JSON.stringify(lines)}'::jsonb)`;
}

function countTransition(kind, { op, count, expected, fp = fingerprint(op), now = NOW }) {
  return `saas.inventory_counts_${kind}(${authority(now)},'${op}'::uuid,'${fp}','${count}'::uuid,${expected}::bigint)`;
}

function transferSave({
  op,
  transfer,
  expected = "NULL",
  source,
  destination,
  lines,
  fp = fingerprint(op),
  now = NOW,
}) {
  return `saas.inventory_transfers_save(${authority(now)},'${op}'::uuid,'${fp}','${transfer}'::uuid,${expected}::bigint,'${source}'::uuid,'${destination}'::uuid,'${JSON.stringify(lines)}'::jsonb)`;
}

function transferTransition(kind, {
  op,
  transfer,
  expected,
  fp = fingerprint(op),
  now = NOW,
}) {
  return `saas.inventory_transfers_${kind}(${authority(now)},'${op}'::uuid,'${fp}','${transfer}'::uuid,${expected}::bigint)`;
}

function interactive(box, applicationName) {
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
      env: { ...process.env, LC_ALL: "C", LANG: "C", PGAPPNAME: applicationName },
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  return {
    child,
    write(source) { child.stdin.write(source); },
    output() { return stdout; },
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

function seed(box) {
  psql(
    box,
    `BEGIN;SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
VALUES('${OWNER}','https://id.test/oidc','owner','owner@test.invalid',true,'2026-01-01','2026-01-01');
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
('${STORE}','Inventory A','inventory-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
('${STORE_B}','Inventory B','inventory-b','active','tr','TRY','default','2026-01-01','2026-01-01');
INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)
VALUES('${OWNER_MEMBERSHIP}','${OWNER}','${STORE}','store_owner','active','2026-01-01','2026-01-01');
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
VALUES('31000000-0000-4000-8000-000000000001','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES
('${PRODUCT}','${STORE}','urun-a','Urun A','active','TRY',1,'2026-01-01','2026-01-01'),
('${PRODUCT_B}','${STORE_B}','urun-b','Urun B','active','TRY',1,'2026-01-01','2026-01-01');
INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES
('${VARIANT_A}','${PRODUCT}','${STORE}','A',1000,500,true,20,'active','{}',1,'2026-01-01','2026-01-01'),
('${VARIANT_B}','${PRODUCT}','${STORE}','B',2000,800,true,12,'active','{}',1,'2026-01-01','2026-01-01'),
('${CROSS_VARIANT}','${PRODUCT_B}','${STORE_B}','Cross',1000,500,true,7,'active','{}',1,'2026-01-01','2026-01-01');
COMMIT;`,
  );
}

function seedHold(box, quantity) {
  psql(
    box,
    `BEGIN;SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.checkout_provider_configs(
  id,store_id,provider_key,status,public_origin,configuration_key_id,
  sealed_configuration,configuration_digest,version,created_at,updated_at
) VALUES(
  '72000000-0000-4000-8000-000000000010','${STORE}','paytr','active',
  'https://www.paytr.com','key-1',${ENVELOPE},repeat('d',64),1,
  '2026-07-22T19:00:00Z','2026-07-22T19:00:00Z'
);
INSERT INTO saas.quick_order_links(
  id,store_id,creating_membership_id,provider_config_id,status,token_digest,
  token_key_id,sealed_token,customer_name,customer_email,customer_phone,
  shipping_address,billing_address,internal_label,currency,subtotal_cents,
  shipping_cents,discount_cents,total_cents,expires_at,version,created_at,updated_at
) VALUES(
  '72000000-0000-4000-8000-000000000003','${STORE}','${OWNER_MEMBERSHIP}',
  '72000000-0000-4000-8000-000000000010','active',repeat('a',64),'key-1',
  ${ENVELOPE},'Ada Lovelace','ada@example.test','+905551110000',${ADDRESS},
  ${ADDRESS},'count hold','TRY',${quantity * 1000},0,0,${quantity * 1000},
  '2026-07-23T19:00:00Z',1,'2026-07-22T19:00:00Z','2026-07-22T19:00:00Z'
);
INSERT INTO saas.quick_order_link_items(
  id,store_id,quick_order_link_id,product_id,variant_id,position,product_name,
  variant_name,unit_price_cents,quantity,line_total_cents,created_at
) VALUES(
  '72000000-0000-4000-8000-000000000011','${STORE}',
  '72000000-0000-4000-8000-000000000003','${PRODUCT}','${VARIANT_A}',0,
  'Urun A','A',1000,${quantity},${quantity * 1000},'2026-07-22T19:00:00Z'
);
INSERT INTO saas.quick_order_redemption_sessions(
  id,store_id,quick_order_link_id,cookie_digest,expires_at,version,created_at,updated_at
) VALUES(
  '72000000-0000-4000-8000-000000000012','${STORE}',
  '72000000-0000-4000-8000-000000000003',repeat('e',64),
  '2026-07-23T19:00:00Z',1,'2026-07-22T20:00:00Z','2026-07-22T20:00:00Z'
);
INSERT INTO saas.checkout_payment_attempts(
  id,store_id,quick_order_link_id,redemption_session_id,provider_config_id,
  provider_config_version,configuration_digest,configuration_key_id,
  sealed_configuration,merchant_oid,expected_subtotal_cents,
  expected_shipping_cents,expected_discount_cents,expected_payment_amount,
  currency,status,hold_expires_at,version,created_at,updated_at
) VALUES(
  '72000000-0000-4000-8000-000000000002','${STORE}',
  '72000000-0000-4000-8000-000000000003',
  '72000000-0000-4000-8000-000000000012',
  '72000000-0000-4000-8000-000000000010',1,repeat('d',64),'key-1',${ENVELOPE},
  '1234567890abcdef1234567890abcdef',${quantity * 1000},0,0,${quantity * 1000},
  'TRY','reserved','2026-07-22T20:05:00Z',1,
  '2026-07-22T20:00:00Z','2026-07-22T20:00:00Z'
);
INSERT INTO saas.checkout_inventory_reservations(
  id,store_id,attempt_id,quick_order_link_id,product_id,variant_id,quantity,
  stock_tracked,status,held_at,version,updated_at
) VALUES(
  '72000000-0000-4000-8000-000000000001','${STORE}',
  '72000000-0000-4000-8000-000000000002',
  '72000000-0000-4000-8000-000000000003','${PRODUCT}','${VARIANT_A}',
  ${quantity},true,'held','2026-07-22T20:00:00Z',1,'2026-07-22T20:00:00Z'
);
COMMIT;`,
  );
}

function seedSettlement(box) {
  psql(
    box,
    `BEGIN;SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.quick_order_links(
  id,store_id,creating_membership_id,provider_config_id,status,token_digest,
  token_key_id,sealed_token,customer_name,customer_email,customer_phone,
  shipping_address,billing_address,internal_label,currency,subtotal_cents,
  shipping_cents,discount_cents,total_cents,expires_at,version,created_at,updated_at
) VALUES(
  '${CHECKOUT_LINK}','${STORE}','${OWNER_MEMBERSHIP}',
  '72000000-0000-4000-8000-000000000010','active',repeat('b',64),'key-1',
  ${ENVELOPE},'Grace Hopper','grace@example.test','+905551110001',${ADDRESS},
  ${ADDRESS},'checkout writer','TRY',1000,0,0,1000,
  '2026-07-23T19:00:00Z',1,'2026-07-22T19:00:00Z','2026-07-22T19:00:00Z'
);
INSERT INTO saas.quick_order_link_items(
  id,store_id,quick_order_link_id,product_id,variant_id,position,product_name,
  variant_name,unit_price_cents,quantity,line_total_cents,created_at
) VALUES(
  '${CHECKOUT_ITEM}','${STORE}','${CHECKOUT_LINK}','${PRODUCT}','${VARIANT_A}',0,
  'Urun A','A',1000,1,1000,'2026-07-22T19:00:00Z'
);
INSERT INTO saas.quick_order_redemption_sessions(
  id,store_id,quick_order_link_id,cookie_digest,expires_at,version,created_at,updated_at
) VALUES(
  '${CHECKOUT_REDEMPTION}','${STORE}','${CHECKOUT_LINK}',repeat('f',64),
  '2026-07-23T19:00:00Z',1,'2026-07-22T20:22:00Z','2026-07-22T20:22:00Z'
);
INSERT INTO saas.checkout_payment_attempts(
  id,store_id,quick_order_link_id,redemption_session_id,provider_config_id,
  provider_config_version,configuration_digest,configuration_key_id,
  sealed_configuration,merchant_oid,expected_subtotal_cents,
  expected_shipping_cents,expected_discount_cents,expected_payment_amount,
  currency,status,hold_expires_at,initiation_unknown_at,version,created_at,updated_at
) VALUES(
  '${CHECKOUT_ATTEMPT}','${STORE}','${CHECKOUT_LINK}','${CHECKOUT_REDEMPTION}',
  '72000000-0000-4000-8000-000000000010',1,repeat('d',64),'key-1',${ENVELOPE},
  '${CHECKOUT_MERCHANT_OID}',1000,0,0,1000,'TRY','initiation_unknown',
  '2026-07-22T20:27:00Z','2026-07-22T20:22:00Z',1,
  '2026-07-22T20:22:00Z','2026-07-22T20:22:00Z'
);
INSERT INTO saas.checkout_inventory_reservations(
  id,store_id,attempt_id,quick_order_link_id,product_id,variant_id,quantity,
  stock_tracked,status,held_at,version,updated_at
) VALUES(
  '${CHECKOUT_RESERVATION}','${STORE}','${CHECKOUT_ATTEMPT}','${CHECKOUT_LINK}',
  '${PRODUCT}','${VARIANT_A}',1,true,'held','2026-07-22T20:22:00Z',1,
  '2026-07-22T20:22:00Z'
);
COMMIT;`,
  );
}

function checkoutSettlementCall() {
  return `saas.checkout_settle_callback(
    '${CHECKOUT_MERCHANT_OID}',repeat('c',64),'${CHECKOUT_OPERATION}',
    '${fingerprint(CHECKOUT_OPERATION)}','success',1000,1000,'TRY','card',1,
    NULL,NULL,'${CHECKOUT_ORDER}',ARRAY['${CHECKOUT_ORDER_ITEM}'::uuid],
    '${CHECKOUT_ORDER_EVENT}','INV-CHECKOUT-1','2026-07-22T20:23:00Z'
  )`;
}

function movementRows(box, sourceId, movementKinds) {
  return JSON.parse(psql(
    box,
    `SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'variantId',variant_id,'locationId',location_id,'movementKind',movement_kind,
  'direction',direction,'quantityDelta',quantity_delta,'sourceKind',source_kind,
  'sourceId',source_id
) ORDER BY variant_id,movement_kind,location_id),'[]'::jsonb)
FROM saas.inventory_movements
WHERE source_id='${sourceId}' AND movement_kind=ANY(ARRAY[${movementKinds.map((kind) => `'${kind}'`).join(",")}]);`,
  ).stdout.trim());
}

function inventoryState(box) {
  return psql(
    box,
    `SELECT pg_catalog.jsonb_build_object(
  'variants',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(variant) ORDER BY variant.id)
    FROM saas.product_variants AS variant WHERE variant.store_id='${STORE}' AND variant.id IN('${VARIANT_A}','${VARIANT_B}')),
  'balances',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(balance) ORDER BY balance.location_id,balance.variant_id)
    FROM saas.inventory_balances AS balance WHERE balance.store_id='${STORE}' AND balance.variant_id IN('${VARIANT_A}','${VARIANT_B}')),
  'movements',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(movement) ORDER BY movement.id),'[]'::jsonb)
    FROM saas.inventory_movements AS movement WHERE movement.store_id='${STORE}' AND movement.variant_id IN('${VARIANT_A}','${VARIANT_B}'))
)::text;`,
  ).stdout;
}

function uuidArray(values) {
  return `ARRAY[${values.map((value) => `'${value}'::uuid`).join(",")}]::uuid[]`;
}

function denialState(box, {
  counts = [], transfers = [], variants = [], operations = [],
}) {
  const entityIds = [...counts, ...transfers];
  const raw = psql(
    box,
    `SELECT pg_catalog.jsonb_build_object(
  'counts',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(count_row) ORDER BY count_row.id),'[]'::jsonb) FROM saas.inventory_counts AS count_row WHERE count_row.id=ANY(${uuidArray(counts)})),
  'countLines',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(line_row) ORDER BY line_row.inventory_count_id,line_row.id),'[]'::jsonb) FROM saas.inventory_count_lines AS line_row WHERE line_row.inventory_count_id=ANY(${uuidArray(counts)})),
  'transfers',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(transfer_row) ORDER BY transfer_row.id),'[]'::jsonb) FROM saas.inventory_transfers AS transfer_row WHERE transfer_row.id=ANY(${uuidArray(transfers)})),
  'transferLines',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(line_row) ORDER BY line_row.inventory_transfer_id,line_row.id),'[]'::jsonb) FROM saas.inventory_transfer_lines AS line_row WHERE line_row.inventory_transfer_id=ANY(${uuidArray(transfers)})),
  'variants',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(variant_row) ORDER BY variant_row.id),'[]'::jsonb) FROM saas.product_variants AS variant_row WHERE variant_row.store_id='${STORE}' AND variant_row.id=ANY(${uuidArray(variants)})),
  'balances',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(balance_row) ORDER BY balance_row.location_id,balance_row.variant_id),'[]'::jsonb) FROM saas.inventory_balances AS balance_row WHERE balance_row.store_id='${STORE}' AND balance_row.variant_id=ANY(${uuidArray(variants)})),
  'movements',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(movement_row) ORDER BY movement_row.occurred_at,movement_row.id),'[]'::jsonb) FROM saas.inventory_movements AS movement_row WHERE movement_row.store_id='${STORE}' AND movement_row.variant_id=ANY(${uuidArray(variants)})),
  'operations',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(operation_row) ORDER BY operation_row.committed_at,operation_row.operation_id),'[]'::jsonb) FROM saas.inventory_operations AS operation_row WHERE operation_row.store_id='${STORE}' AND (operation_row.operation_id=ANY(${uuidArray(operations)}) OR operation_row.result_entity_id=ANY(${uuidArray(entityIds)}))),
  'activeReservations',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(reservation_row) ORDER BY reservation_row.variant_id,reservation_row.id),'[]'::jsonb) FROM saas.checkout_inventory_reservations AS reservation_row WHERE reservation_row.store_id='${STORE}' AND reservation_row.variant_id=ANY(${uuidArray(variants)}) AND reservation_row.status='held'),
  'activeHoldAttempts',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(attempt_row) ORDER BY attempt_row.id),'[]'::jsonb) FROM saas.checkout_payment_attempts AS attempt_row WHERE attempt_row.store_id='${STORE}' AND EXISTS(SELECT 1 FROM saas.checkout_inventory_reservations AS reservation_row WHERE reservation_row.store_id=attempt_row.store_id AND reservation_row.attempt_id=attempt_row.id AND reservation_row.variant_id=ANY(${uuidArray(variants)}) AND reservation_row.status='held'))
)::text;`,
  ).stdout.trim();
  return { raw, value: JSON.parse(raw) };
}

function assertDenialStateUnchanged(before, after) {
  assert.equal(after.raw, before.raw);
  assert.deepEqual(after.value, before.value);
}

const TOTAL = 30;
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
    apply(box, "202607220043_inventory_purchasing.up.sql");
    apply(box, "202607220043_inventory_purchasing_assertions.sql");

    const defaultLocation = psql(
      box,
      `SELECT id FROM saas.inventory_locations WHERE store_id='${STORE}' AND is_default AND status='active';`,
    ).stdout.trim();
    const crossLocation = psql(
      box,
      `SELECT id FROM saas.inventory_locations WHERE store_id='${STORE_B}' AND is_default AND status='active';`,
    ).stdout.trim();
    psql(
      box,
      `BEGIN;SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.inventory_locations(id,store_id,name,is_default,status,version,created_at,updated_at) VALUES
('${LOCATION_B}','${STORE}','Ikincil Depo',false,'active',1,'2026-07-22T19:00:00Z','2026-07-22T19:00:00Z'),
('${LOCATION_ARCHIVED}','${STORE}','Arsiv Depo',false,'archived',1,'2026-07-22T19:00:00Z','2026-07-22T19:00:00Z');
INSERT INTO saas.inventory_balances(store_id,location_id,variant_id,quantity,version,updated_at) VALUES
('${STORE}','${LOCATION_B}','${VARIANT_A}',0,1,'2026-07-22T19:00:00Z'),
('${STORE}','${LOCATION_B}','${VARIANT_B}',0,1,'2026-07-22T19:00:00Z');
COMMIT;`,
    );

    const operationShape043 = psql(
      box,
      `SELECT pg_catalog.string_agg(att.attname||':'||pg_catalog.format_type(att.atttypid,att.atttypmod),',' ORDER BY att.attnum)
FROM pg_catalog.pg_attribute AS att
WHERE att.attrelid='saas.inventory_operations'::regclass AND att.attnum>0 AND NOT att.attisdropped;`,
    ).stdout;
    const operationConstraints043 = psql(
      box,
      `SELECT pg_catalog.string_agg(conname||':'||pg_catalog.pg_get_constraintdef(oid),E'\n' ORDER BY conname)
FROM pg_catalog.pg_constraint WHERE conrelid='saas.inventory_operations'::regclass;`,
    ).stdout;
    const movementConstraints043 = psql(
      box,
      `SELECT pg_catalog.string_agg(conname||':'||pg_catalog.pg_get_constraintdef(oid),E'\n' ORDER BY conname)
FROM pg_catalog.pg_constraint WHERE conrelid='saas.inventory_movements'::regclass;`,
    ).stdout;
    const checkoutDefinition043 = psql(
      box,
      `SELECT pg_catalog.pg_get_functiondef('saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)'::regprocedure);`,
    ).stdout;
    const checkoutOwner043 = psql(
      box,
      `SELECT owner.rolname FROM pg_catalog.pg_proc AS proc JOIN pg_catalog.pg_roles AS owner ON owner.oid=proc.proowner WHERE proc.oid='saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)'::regprocedure;`,
    ).stdout;
    const checkoutAcl043 = psql(
      box,
      `SELECT COALESCE(proc.proacl::text,'NULL') FROM pg_catalog.pg_proc AS proc WHERE proc.oid='saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)'::regprocedure;`,
    ).stdout;

    await scenario("migration order applies 044 only after exact 043", () => {
      assert.equal(PRIOR.at(-2), "202607220042_catalog_product_tags.up.sql");
      assert.ok(existsSync(path.join(SQL, "202607220044_inventory_counts_transfers.up.sql")));
      apply(box, "202607220044_inventory_counts_transfers.up.sql");
    });
    await scenario("PostgreSQL 16 executes the disposable rehearsal", () => {
      assert.match(psql(box, "SHOW server_version;").stdout, /^16\./);
    });
    await scenario("catalog assertions prove count and transfer authority", () => {
      apply(box, "202607220044_inventory_counts_transfers_assertions.sql");
      assert.equal(
        psql(
          box,
          `SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname=ANY(ARRAY['inventory_counts_list','inventory_counts_get','inventory_counts_save','inventory_counts_start','inventory_counts_commit','inventory_counts_cancel','inventory_transfers_list','inventory_transfers_get','inventory_transfers_save','inventory_transfers_dispatch','inventory_transfers_receive','inventory_transfers_cancel']);`,
        ).stdout.trim(),
        "12",
      );
    });
    await scenario("manifest pins twenty one exact checksums", () => {
      const manifest = JSON.parse(
        readFileSync(path.join(SQL, "phase3h-merchant-completion-manifest.json"), "utf8"),
      );
      assert.equal(manifest.artifacts.length, 33);
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

    const mainLines = [
      { lineId: line(1), variantId: VARIANT_B },
      { lineId: line(2), variantId: VARIANT_A },
    ];
    let countVersion = 0;
    await scenario("count save list and get create a deterministic draft", () => {
      const saved = result(box, countSave({
        op: operation(1), count: COUNT_MAIN, location: defaultLocation, lines: mainLines,
      }));
      assert.equal(saved.outcome, "saved");
      assert.equal(saved.result.status, "draft");
      countVersion = saved.result.version;
      const listed = result(box, `saas.inventory_counts_list(${authority()})`);
      const found = result(
        box,
        `saas.inventory_counts_get(${authority()},'${COUNT_MAIN}'::uuid)`,
      );
      assert.equal(listed.outcome, "listed");
      assert.equal(found.outcome, "found");
      assert.equal(found.result.id, saved.result.id);
      assert.equal(found.result.version, saved.result.version);
      assert.deepEqual(found.result.lines.map((entry) => entry.variantId), [VARIANT_A, VARIANT_B]);
    });
    await scenario("count start freezes the exact expected location balances", () => {
      const started = result(box, countTransition("start", {
        op: operation(2), count: COUNT_MAIN, expected: countVersion,
      }));
      assert.equal(started.outcome, "started");
      assert.equal(started.result.status, "counting");
      const found = result(
        box,
        `saas.inventory_counts_get(${authority()},'${COUNT_MAIN}'::uuid)`,
      );
      assert.deepEqual(
        found.result.lines.map((entry) => [entry.variantId, entry.expectedQuantity]),
        [[VARIANT_A, 20], [VARIANT_B, 12]],
      );
      countVersion = started.result.version;
    });
    await scenario("counting save preserves frozen expectations and records counted quantities", () => {
      const saved = result(box, countSave({
        op: operation(3),
        count: COUNT_MAIN,
        expected: countVersion,
        location: defaultLocation,
        lines: [
          { lineId: line(2), variantId: VARIANT_A, countedQuantity: 18 },
          { lineId: line(1), variantId: VARIANT_B, countedQuantity: 15 },
        ],
      }));
      assert.equal(saved.outcome, "saved");
      const found = result(
        box,
        `saas.inventory_counts_get(${authority()},'${COUNT_MAIN}'::uuid)`,
      );
      assert.deepEqual(
        found.result.lines.map((entry) => [entry.expectedQuantity, entry.countedQuantity]),
        [[20, 18], [12, 15]],
      );
      countVersion = saved.result.version;
    });
    await scenario("count commit applies exact deltas movements versions and projection", () => {
      const committed = result(box, countTransition("commit", {
        op: operation(4), count: COUNT_MAIN, expected: countVersion,
      }));
      assert.equal(committed.outcome, "committed");
      assert.equal(committed.result.status, "committed");
      assert.equal(committed.result.version, countVersion + 1);
      assert.deepEqual(
        JSON.parse(psql(
          box,
          `SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(variant_id,quantity,version) ORDER BY variant_id) FROM saas.inventory_balances WHERE store_id='${STORE}' AND location_id='${defaultLocation}' AND variant_id IN('${VARIANT_A}','${VARIANT_B}');`,
        ).stdout.trim()),
        [[VARIANT_A, 18, 2], [VARIANT_B, 15, 2]],
      );
      assert.deepEqual(movementRows(box, COUNT_MAIN, ["count_adjustment"]), [
        {
          variantId: VARIANT_A, locationId: defaultLocation, movementKind: "count_adjustment",
          direction: "out", quantityDelta: -2, sourceKind: "count_adjustment", sourceId: COUNT_MAIN,
        },
        {
          variantId: VARIANT_B, locationId: defaultLocation, movementKind: "count_adjustment",
          direction: "in", quantityDelta: 3, sourceKind: "count_adjustment", sourceId: COUNT_MAIN,
        },
      ]);
      assert.equal(
        psql(
          box,
          `SELECT stock_quantity FROM saas.product_variants WHERE store_id='${STORE}' AND id='${VARIANT_A}';`,
        ).stdout.trim(),
        "18",
      );
    });

    await scenario("stale balance denies count commit with inventory conflict", () => {
      const save = result(box, countSave({
        op: operation(5), count: COUNT_STALE, location: defaultLocation,
        lines: [{ lineId: line(3), variantId: VARIANT_B }],
      }));
      const startResult = result(box, countTransition("start", {
        op: operation(6), count: COUNT_STALE, expected: save.result.version,
      }));
      const counted = result(box, countSave({
        op: operation(7), count: COUNT_STALE, expected: startResult.result.version,
        location: defaultLocation,
        lines: [{ lineId: line(3), variantId: VARIANT_B, countedQuantity: 14 }],
      }));
      psql(
        box,
        `BEGIN;SET LOCAL ROLE celebix_saas_owner;
UPDATE saas.inventory_balances SET quantity=quantity+1,version=version+1,updated_at='2026-07-22T20:03:00Z' WHERE store_id='${STORE}' AND location_id='${defaultLocation}' AND variant_id='${VARIANT_B}';
SELECT pg_catalog.set_config('saas.inventory.source_marker','inventory_managed',true);
UPDATE saas.product_variants SET stock_quantity=stock_quantity+1,version=version+1,updated_at='2026-07-22T20:03:00Z' WHERE store_id='${STORE}' AND id='${VARIANT_B}';
SELECT pg_catalog.set_config('saas.inventory.source_marker','',true);
COMMIT;`,
      );
      const denied = result(box, countTransition("commit", {
        op: operation(8), count: COUNT_STALE, expected: counted.result.version,
      }));
      assert.equal(denied.outcome, "inventory_conflict");
      assert.equal(
        psql(box, `SELECT count(*) FROM saas.inventory_operations WHERE operation_id='${operation(8)}';`).stdout.trim(),
        "0",
      );
    });
    await scenario("negative aggregate count projection is denied atomically", () => {
      const save = result(box, countSave({
        op: operation(9), count: COUNT_NEGATIVE, location: defaultLocation,
        lines: [{ lineId: line(4), variantId: VARIANT_A }],
      }));
      const startResult = result(box, countTransition("start", {
        op: operation(10), count: COUNT_NEGATIVE, expected: save.result.version,
      }));
      const counted = result(box, countSave({
        op: operation(11), count: COUNT_NEGATIVE, expected: startResult.result.version,
        location: defaultLocation,
        lines: [{ lineId: line(4), variantId: VARIANT_A, countedQuantity: 0 }],
      }));
      psql(
        box,
        `BEGIN;SET LOCAL ROLE celebix_saas_owner;
ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
UPDATE saas.product_variants SET stock_quantity=0 WHERE store_id='${STORE}' AND id='${VARIANT_A}';
ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;
COMMIT;`,
      );
      const before = psql(box, `SELECT quantity FROM saas.inventory_balances WHERE store_id='${STORE}' AND location_id='${defaultLocation}' AND variant_id='${VARIANT_A}';`).stdout.trim();
      const beforeDenial = denialState(box, {
        counts: [COUNT_NEGATIVE], variants: [VARIANT_A], operations: [operation(12)],
      });
      const denied = result(box, countTransition("commit", {
        op: operation(12), count: COUNT_NEGATIVE, expected: counted.result.version,
      }));
      assert.equal(denied.outcome, "invalid_input");
      assertDenialStateUnchanged(beforeDenial, denialState(box, {
        counts: [COUNT_NEGATIVE], variants: [VARIANT_A], operations: [operation(12)],
      }));
      assert.equal(psql(box, `SELECT quantity FROM saas.inventory_balances WHERE store_id='${STORE}' AND location_id='${defaultLocation}' AND variant_id='${VARIANT_A}';`).stdout.trim(), before);
      psql(
        box,
        `BEGIN;SET LOCAL ROLE celebix_saas_owner;
ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
UPDATE saas.product_variants SET stock_quantity=(SELECT saas.inventory_active_balance_total('${STORE}','${VARIANT_A}')) WHERE store_id='${STORE}' AND id='${VARIANT_A}';
ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;
COMMIT;`,
      );
    });
    await scenario("active checkout hold invariant denies count reduction", () => {
      seedHold(box, 17);
      const save = result(box, countSave({
        op: operation(13), count: COUNT_HOLD, location: defaultLocation,
        lines: [{ lineId: line(5), variantId: VARIANT_A }],
      }));
      const startResult = result(box, countTransition("start", {
        op: operation(14), count: COUNT_HOLD, expected: save.result.version,
      }));
      const counted = result(box, countSave({
        op: operation(15), count: COUNT_HOLD, expected: startResult.result.version,
        location: defaultLocation,
        lines: [{ lineId: line(5), variantId: VARIANT_A, countedQuantity: 16 }],
      }));
      const beforeDenial = denialState(box, {
        counts: [COUNT_HOLD], variants: [VARIANT_A], operations: [operation(16)],
      });
      const denied = result(box, countTransition("commit", {
        op: operation(16), count: COUNT_HOLD, expected: counted.result.version,
      }));
      assert.equal(denied.outcome, "active_hold_conflict");
      assertDenialStateUnchanged(beforeDenial, denialState(box, {
        counts: [COUNT_HOLD], variants: [VARIANT_A], operations: [operation(16)],
      }));
    });
    await scenario("count operation replay is exact and fingerprint mismatch is denied", () => {
      const persistedRaw = psql(
        box,
        `SELECT result_payload::text FROM saas.inventory_operations WHERE operation_id='${operation(4)}';`,
      ).stdout.trim();
      const replayRaw = psql(
        box,
        `SET ROLE celebix_saas_app;SELECT result_payload::text FROM ${countTransition("commit", {
          op: operation(4), count: COUNT_MAIN, expected: countVersion,
        })};`,
      ).stdout.trim();
      const replay = result(box, countTransition("commit", {
        op: operation(4), count: COUNT_MAIN, expected: countVersion,
      }));
      const mismatch = result(box, countTransition("commit", {
        op: operation(4), count: COUNT_MAIN, expected: countVersion,
        fp: fingerprint("different-count-payload"),
      }));
      assert.equal(replay.outcome, "operation_replayed");
      assert.equal(replayRaw, persistedRaw);
      assert.deepEqual(replay.result, JSON.parse(persistedRaw));
      assert.equal(mismatch.outcome, "operation_mismatch");
    });

    await scenario("two simultaneous counts serialize to commit and stable conflict", async () => {
      const createCounting = (countId, seed) => {
        const saved = result(box, countSave({
          op: operation(seed), count: countId, location: defaultLocation,
          lines: [{ lineId: line(seed), variantId: VARIANT_B }],
        }));
        const started = result(box, countTransition("start", {
          op: operation(seed + 1), count: countId, expected: saved.result.version,
        }));
        return result(box, countSave({
          op: operation(seed + 2), count: countId, expected: started.result.version,
          location: defaultLocation,
          lines: [{ lineId: line(seed), variantId: VARIANT_B, countedQuantity: 20 }],
        }));
      };
      const readyA = createCounting(COUNT_CONCURRENT_A, 20);
      const readyB = createCounting(COUNT_CONCURRENT_B, 30);
      const sessionA = interactive(box, "inventory_count_concurrent_a");
      const sessionB = interactive(box, "inventory_count_concurrent_b");
      sessionA.write(`SET ROLE celebix_saas_app;SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${countTransition("commit", { op: operation(23), count: COUNT_CONCURRENT_A, expected: readyA.result.version, now: "2026-07-22T20:10:00Z" })};`);
      sessionB.write(`SET ROLE celebix_saas_app;SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${countTransition("commit", { op: operation(33), count: COUNT_CONCURRENT_B, expected: readyB.result.version, now: "2026-07-22T20:10:01Z" })};`);
      sessionA.child.stdin.end();
      sessionB.child.stdin.end();
      const outputs = await Promise.all([sessionA.done(), sessionB.done()]);
      const outcomes = outputs.map((output) => JSON.parse(output.trim()).outcome).sort();
      assert.deepEqual(outcomes, ["committed", "inventory_conflict"]);
    });
    await scenario("draft and counting counts cancel without stock mutation", () => {
      const beforeDraft = inventoryState(box);
      const saved = result(box, countSave({
        op: operation(40), count: COUNT_CANCEL, location: defaultLocation,
        lines: [{ lineId: line(40), variantId: VARIANT_A }],
      }));
      const cancelled = result(box, countTransition("cancel", {
        op: operation(41), count: COUNT_CANCEL, expected: saved.result.version,
      }));
      assert.equal(cancelled.outcome, "cancelled");
      assert.equal(cancelled.result.status, "cancelled");
      assert.equal(inventoryState(box), beforeDraft);

      const beforeCounting = inventoryState(box);
      const countingSaved = result(box, countSave({
        op: operation(42), count: COUNT_CANCEL_STARTED, location: defaultLocation,
        lines: [{ lineId: line(41), variantId: VARIANT_B }],
      }));
      const countingStarted = result(box, countTransition("start", {
        op: operation(43), count: COUNT_CANCEL_STARTED, expected: countingSaved.result.version,
      }));
      const countingCancelled = result(box, countTransition("cancel", {
        op: operation(44), count: COUNT_CANCEL_STARTED, expected: countingStarted.result.version,
      }));
      assert.equal(countingCancelled.outcome, "cancelled");
      assert.equal(countingCancelled.result.status, "cancelled");
      assert.equal(inventoryState(box), beforeCounting);
      assert.equal(
        psql(box, `SELECT count(*) FROM saas.inventory_movements WHERE source_id IN('${COUNT_CANCEL}','${COUNT_CANCEL_STARTED}');`).stdout.trim(),
        "0",
      );
    });

    const receiveLines = [
      { lineId: line(50), variantId: VARIANT_B, quantity: 2 },
      { lineId: line(51), variantId: VARIANT_A, quantity: 3 },
    ];
    let receiveVersion = 0;
    await scenario("transfer save list and get create a deterministic draft", () => {
      const saved = result(box, transferSave({
        op: operation(50), transfer: TRANSFER_RECEIVE, source: defaultLocation,
        destination: LOCATION_B, lines: receiveLines,
      }));
      assert.equal(saved.outcome, "saved");
      assert.equal(saved.result.status, "draft");
      receiveVersion = saved.result.version;
      assert.equal(result(box, `saas.inventory_transfers_list(${authority()})`).outcome, "listed");
      const found = result(
        box,
        `saas.inventory_transfers_get(${authority()},'${TRANSFER_RECEIVE}')`,
      );
      assert.equal(found.result.id, saved.result.id);
      assert.equal(found.result.version, saved.result.version);
      assert.deepEqual(found.result.lines.map((entry) => entry.variantId), [VARIANT_A, VARIANT_B]);
    });
    await scenario("transfer requires distinct active source and destination locations", () => {
      for (const [source, destination] of [
        [defaultLocation, defaultLocation],
        [defaultLocation, LOCATION_ARCHIVED],
      ]) {
        const denied = result(box, transferSave({
          op: operation(52 + source.length + destination.length),
          transfer: `71000000-0000-4000-8000-0000000000${source === destination ? "01" : "02"}`,
          source,
          destination,
          lines: [{ lineId: line(52), variantId: VARIANT_A, quantity: 1 }],
        }));
        assert.equal(denied.outcome, "invalid_input");
      }
    });
    await scenario("transfer dispatch rejects insufficient source quantity atomically", () => {
      const saved = result(box, transferSave({
        op: operation(55), transfer: TRANSFER_INSUFFICIENT,
        source: LOCATION_B, destination: defaultLocation,
        lines: [{ lineId: line(55), variantId: VARIANT_A, quantity: 1 }],
      }));
      const beforeInsufficient = denialState(box, {
        transfers: [TRANSFER_INSUFFICIENT], variants: [VARIANT_A],
        operations: [operation(56)],
      });
      const denied = result(box, transferTransition("dispatch", {
        op: operation(56), transfer: TRANSFER_INSUFFICIENT,
        expected: saved.result.version,
      }));
      assert.equal(denied.outcome, "insufficient_stock");
      assertDenialStateUnchanged(beforeInsufficient, denialState(box, {
        transfers: [TRANSFER_INSUFFICIENT], variants: [VARIANT_A],
        operations: [operation(56)],
      }));
      assert.equal(
        psql(box, `SELECT count(*) FROM saas.inventory_movements WHERE source_id='${TRANSFER_INSUFFICIENT}';`).stdout.trim(),
        "0",
      );
      const heldTransfer = "70000000-0000-4000-8000-000000000007";
      const heldSaved = result(box, transferSave({
        op: operation(85), transfer: heldTransfer,
        source: defaultLocation, destination: LOCATION_B,
        lines: [{ lineId: line(85), variantId: VARIANT_A, quantity: 2 }],
        now: "2026-07-22T20:07:01Z",
      }));
      const beforeHeld = denialState(box, {
        transfers: [heldTransfer], variants: [VARIANT_A], operations: [operation(86)],
      });
      const heldDenied = result(box, transferTransition("dispatch", {
        op: operation(86), transfer: heldTransfer, expected: heldSaved.result.version,
        now: "2026-07-22T20:07:02Z",
      }));
      assert.equal(heldDenied.outcome, "active_hold_conflict");
      assertDenialStateUnchanged(beforeHeld, denialState(box, {
        transfers: [heldTransfer], variants: [VARIANT_A], operations: [operation(86)],
      }));
      psql(
        box,
        `SET ROLE celebix_saas_owner;UPDATE saas.checkout_inventory_reservations SET status='released',released_at='2026-07-22T20:08:00Z',version=2,updated_at='2026-07-22T20:08:00Z' WHERE id='72000000-0000-4000-8000-000000000001';`,
      );
    });
    await scenario("dispatch removes sellable source stock and appends transfer out", () => {
      const before = Number(psql(box, `SELECT stock_quantity FROM saas.product_variants WHERE store_id='${STORE}' AND id='${VARIANT_A}';`).stdout.trim());
      const dispatched = result(box, transferTransition("dispatch", {
        op: operation(57), transfer: TRANSFER_RECEIVE, expected: receiveVersion,
      }));
      assert.equal(dispatched.outcome, "dispatched");
      assert.equal(dispatched.result.status, "in_transit");
      receiveVersion = dispatched.result.version;
      assert.equal(
        Number(psql(box, `SELECT stock_quantity FROM saas.product_variants WHERE store_id='${STORE}' AND id='${VARIANT_A}';`).stdout.trim()),
        before - 3,
      );
      assert.deepEqual(movementRows(box, TRANSFER_RECEIVE, ["transfer_out"]), [
        {
          variantId: VARIANT_A, locationId: defaultLocation, movementKind: "transfer_out",
          direction: "out", quantityDelta: -3, sourceKind: "transfer", sourceId: TRANSFER_RECEIVE,
        },
        {
          variantId: VARIANT_B, locationId: defaultLocation, movementKind: "transfer_out",
          direction: "out", quantityDelta: -2, sourceKind: "transfer", sourceId: TRANSFER_RECEIVE,
        },
      ]);
    });
    await scenario("receive restores sellable stock at the destination", () => {
      const received = result(box, transferTransition("receive", {
        op: operation(58), transfer: TRANSFER_RECEIVE, expected: receiveVersion,
      }));
      assert.equal(received.outcome, "received");
      assert.equal(received.result.status, "received");
      assert.equal(
        psql(box, `SELECT quantity FROM saas.inventory_balances WHERE store_id='${STORE}' AND location_id='${LOCATION_B}' AND variant_id='${VARIANT_A}';`).stdout.trim(),
        "3",
      );
      assert.equal(
        psql(box, `SELECT stock_quantity FROM saas.product_variants WHERE store_id='${STORE}' AND id='${VARIANT_A}';`).stdout.trim(),
        "18",
      );
      assert.deepEqual(movementRows(box, TRANSFER_RECEIVE, ["transfer_in"]), [
        {
          variantId: VARIANT_A, locationId: LOCATION_B, movementKind: "transfer_in",
          direction: "in", quantityDelta: 3, sourceKind: "transfer", sourceId: TRANSFER_RECEIVE,
        },
        {
          variantId: VARIANT_B, locationId: LOCATION_B, movementKind: "transfer_in",
          direction: "in", quantityDelta: 2, sourceKind: "transfer", sourceId: TRANSFER_RECEIVE,
        },
      ]);
    });
    let cancelVersion = 0;
    await scenario("cancelling a dispatched transfer returns stock to its source", () => {
      const saved = result(box, transferSave({
        op: operation(60), transfer: TRANSFER_CANCEL, source: defaultLocation,
        destination: LOCATION_B,
        lines: [{ lineId: line(60), variantId: VARIANT_A, quantity: 2 }],
      }));
      const dispatched = result(box, transferTransition("dispatch", {
        op: operation(61), transfer: TRANSFER_CANCEL, expected: saved.result.version,
      }));
      cancelVersion = dispatched.result.version;
      const cancelled = result(box, transferTransition("cancel", {
        op: operation(62), transfer: TRANSFER_CANCEL, expected: cancelVersion,
      }));
      assert.equal(cancelled.outcome, "cancelled");
      assert.equal(cancelled.result.status, "cancelled");
      assert.deepEqual(movementRows(box, TRANSFER_CANCEL, ["transfer_out", "transfer_return"]), [
        {
          variantId: VARIANT_A, locationId: defaultLocation, movementKind: "transfer_out",
          direction: "out", quantityDelta: -2, sourceKind: "transfer", sourceId: TRANSFER_CANCEL,
        },
        {
          variantId: VARIANT_A, locationId: defaultLocation, movementKind: "transfer_return",
          direction: "in", quantityDelta: 2, sourceKind: "transfer", sourceId: TRANSFER_CANCEL,
        },
      ]);
    });
    await scenario("transfer operation replay is exact and fingerprint mismatch is denied", () => {
      const persistedRaw = psql(
        box,
        `SELECT result_payload::text FROM saas.inventory_operations WHERE operation_id='${operation(62)}';`,
      ).stdout.trim();
      const replayRaw = psql(
        box,
        `SET ROLE celebix_saas_app;SELECT result_payload::text FROM ${transferTransition("cancel", {
          op: operation(62), transfer: TRANSFER_CANCEL, expected: cancelVersion,
        })};`,
      ).stdout.trim();
      const replay = result(box, transferTransition("cancel", {
        op: operation(62), transfer: TRANSFER_CANCEL, expected: cancelVersion,
      }));
      const mismatch = result(box, transferTransition("cancel", {
        op: operation(62), transfer: TRANSFER_CANCEL, expected: cancelVersion,
        fp: fingerprint("different-transfer-payload"),
      }));
      assert.equal(replay.outcome, "operation_replayed");
      assert.equal(replayRaw, persistedRaw);
      assert.deepEqual(replay.result, JSON.parse(persistedRaw));
      assert.equal(mismatch.outcome, "operation_mismatch");
    });
    await scenario("cross store identifiers and duplicate transfer lines are denied", () => {
      const crossStore = result(box, transferSave({
        op: operation(64), transfer: "71000000-0000-4000-8000-000000000003",
        source: defaultLocation, destination: crossLocation,
        lines: [{ lineId: line(64), variantId: CROSS_VARIANT, quantity: 1 }],
      }));
      const duplicate = result(box, transferSave({
        op: operation(65), transfer: "71000000-0000-4000-8000-000000000004",
        source: defaultLocation, destination: LOCATION_B,
        lines: [
          { lineId: line(65), variantId: VARIANT_A, quantity: 1 },
          { lineId: line(66), variantId: VARIANT_A, quantity: 2 },
        ],
      }));
      assert.equal(crossStore.outcome, "invalid_input");
      assert.equal(duplicate.outcome, "invalid_input");
      const crossCount = result(box, countSave({
        op: operation(89), count: "69000000-0000-4000-8000-000000000001",
        location: defaultLocation,
        lines: [{ lineId: line(89), variantId: CROSS_VARIANT }],
      }));
      const duplicateCount = result(box, countSave({
        op: operation(90), count: "69000000-0000-4000-8000-000000000002",
        location: defaultLocation,
        lines: [
          { lineId: line(90), variantId: VARIANT_A },
          { lineId: line(91), variantId: VARIANT_A },
        ],
      }));
      assert.equal(crossCount.outcome, "invalid_input");
      assert.equal(duplicateCount.outcome, "invalid_input");
    });

    await scenario("reverse input count transfer and purchasing writers use deterministic lock order", async () => {
      const makeTransfer = (transfer, seed, lines, source, destination) => result(box, transferSave({
        op: operation(seed), transfer, source, destination, lines,
      }));

      const checkoutBarrierTransfer = "70000000-0000-4000-8000-000000000009";
      const checkoutBarrierCount = "69000000-0000-4000-8000-000000000003";
      const barrierTransfer = makeTransfer(
        checkoutBarrierTransfer,
        100,
        [
          { lineId: line(100), variantId: VARIANT_B, quantity: 1 },
          { lineId: line(101), variantId: VARIANT_A, quantity: 1 },
        ],
        defaultLocation,
        LOCATION_B,
      );
      const expectedAtBarrier = JSON.parse(psql(
        box,
        `SELECT pg_catalog.jsonb_object_agg(variant_id,quantity) FROM saas.inventory_balances WHERE store_id='${STORE}' AND location_id='${defaultLocation}' AND variant_id IN('${VARIANT_A}','${VARIANT_B}');`,
      ).stdout.trim());
      const barrierCountSaved = result(box, countSave({
        op: operation(102), count: checkoutBarrierCount, location: defaultLocation,
        lines: [
          { lineId: line(102), variantId: VARIANT_B },
          { lineId: line(103), variantId: VARIANT_A },
        ],
        now: "2026-07-22T20:22:00Z",
      }));
      const barrierCountStarted = result(box, countTransition("start", {
        op: operation(104), count: checkoutBarrierCount,
        expected: barrierCountSaved.result.version, now: "2026-07-22T20:22:01Z",
      }));
      const barrierCountReady = result(box, countSave({
        op: operation(105), count: checkoutBarrierCount,
        expected: barrierCountStarted.result.version, location: defaultLocation,
        lines: [
          { lineId: line(102), variantId: VARIANT_B, countedQuantity: expectedAtBarrier[VARIANT_B] },
          { lineId: line(103), variantId: VARIANT_A, countedQuantity: expectedAtBarrier[VARIANT_A] },
        ],
        now: "2026-07-22T20:22:02Z",
      }));
      seedSettlement(box);
      const stateBeforeBarrier = JSON.parse(psql(
        box,
        `SELECT pg_catalog.jsonb_object_agg(variant.id,pg_catalog.jsonb_build_object(
  'variant',pg_catalog.to_jsonb(variant),
  'source',(SELECT pg_catalog.to_jsonb(balance) FROM saas.inventory_balances AS balance WHERE balance.store_id=variant.store_id AND balance.location_id='${defaultLocation}' AND balance.variant_id=variant.id),
  'destination',(SELECT pg_catalog.to_jsonb(balance) FROM saas.inventory_balances AS balance WHERE balance.store_id=variant.store_id AND balance.location_id='${LOCATION_B}' AND balance.variant_id=variant.id)
)) FROM saas.product_variants AS variant WHERE variant.store_id='${STORE}' AND variant.id IN('${VARIANT_A}','${VARIANT_B}');`,
      ).stdout.trim());
      const catalogOperation = "75000000-0000-4000-8000-000000000009";
      const catalogFingerprint = fingerprint(catalogOperation);
      const catalogCall = (payloadFingerprint = catalogFingerprint) =>
        `saas.catalog_update_variant(${catalogAuthority("2026-07-22T20:22:59Z")},'${catalogOperation}'::uuid,'${payloadFingerprint}'::text,'${PRODUCT}'::uuid,'${VARIANT_A}'::uuid,${stateBeforeBarrier[VARIANT_A].variant.version}::bigint,'A Catalog Barrier'::text,'CATALOG-BARRIER-A'::text,NULL::text,1000::bigint,NULL::bigint,500::bigint,true,${stateBeforeBarrier[VARIANT_A].variant.stock_quantity + 2}::bigint,'{"barrier":"catalog"}'::jsonb)`;

      const blocker = interactive(box, "inventory_checkout_store_barrier");
      blocker.write(`BEGIN;SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:${STORE}',0));SELECT 'CHECKOUT_BARRIER_READY';\n`);
      await waitUntil(
        () => psql(box, `SELECT count(*) FROM pg_catalog.pg_locks AS lock JOIN pg_catalog.pg_stat_activity AS activity ON activity.pid=lock.pid WHERE activity.application_name='inventory_checkout_store_barrier' AND lock.locktype='advisory' AND lock.granted;`).stdout.trim() === "1",
        "checkout store barrier",
      );

      const catalogWriter = interactive(box, "inventory_catalog_other_writer");
      catalogWriter.write(`SET ROLE celebix_saas_app;SET statement_timeout='10s';SELECT outcome FROM ${catalogCall()};`);
      catalogWriter.child.stdin.end();
      await waitUntil(
        () => psql(box, `SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name='inventory_catalog_other_writer' AND wait_event_type='Lock';`).stdout.trim() === "1",
        "catalog advisory wait",
      );

      const checkoutWriter = interactive(box, "inventory_checkout_other_writer");
      checkoutWriter.write(`SET ROLE celebix_saas_workflow;SET statement_timeout='10s';SELECT outcome FROM ${checkoutSettlementCall()};`);
      checkoutWriter.child.stdin.end();
      await waitUntil(
        () => psql(box, `SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name='inventory_checkout_other_writer' AND wait_event_type='Lock';`).stdout.trim() === "1",
        "checkout advisory wait",
      );

      const transferBarrierWriter = interactive(box, "inventory_transfer_checkout_barrier");
      transferBarrierWriter.write(`SET ROLE celebix_saas_app;SET statement_timeout='10s';SELECT outcome FROM ${transferTransition("dispatch", {
        op: operation(106), transfer: checkoutBarrierTransfer,
        expected: barrierTransfer.result.version, now: "2026-07-22T20:23:01Z",
      })};`);
      transferBarrierWriter.child.stdin.end();
      await waitUntil(
        () => psql(box, `SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name='inventory_transfer_checkout_barrier' AND wait_event_type='Lock';`).stdout.trim() === "1",
        "transfer advisory wait",
      );

      const countBarrierWriter = interactive(box, "inventory_count_checkout_barrier");
      countBarrierWriter.write(`SET ROLE celebix_saas_app;SET statement_timeout='10s';SELECT outcome FROM ${countTransition("commit", {
        op: operation(107), count: checkoutBarrierCount,
        expected: barrierCountReady.result.version, now: "2026-07-22T20:23:02Z",
      })};`);
      countBarrierWriter.child.stdin.end();
      await waitUntil(
        () => psql(box, `SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name='inventory_count_checkout_barrier' AND wait_event_type='Lock';`).stdout.trim() === "1",
        "count advisory wait",
      );
      assert.equal(
        psql(
          box,
          `SELECT pg_catalog.count(*)||':'||pg_catalog.count(DISTINCT (waiting.classid,waiting.objid,waiting.objsubid)) FROM pg_catalog.pg_locks AS waiting JOIN pg_catalog.pg_stat_activity AS waiter ON waiter.pid=waiting.pid JOIN pg_catalog.pg_locks AS held ON held.locktype=waiting.locktype AND held.classid=waiting.classid AND held.objid=waiting.objid AND held.objsubid=waiting.objsubid JOIN pg_catalog.pg_stat_activity AS holder ON holder.pid=held.pid WHERE waiter.application_name=ANY(ARRAY['inventory_catalog_other_writer','inventory_checkout_other_writer','inventory_transfer_checkout_barrier','inventory_count_checkout_barrier']) AND holder.application_name='inventory_checkout_store_barrier' AND waiting.locktype='advisory' AND NOT waiting.granted AND held.granted;`,
        ).stdout.trim(),
        "4:1",
      );
      blocker.write("COMMIT;\n");
      blocker.child.stdin.end();
      await blocker.done();
      const barrierOutputs = await Promise.all([
        catalogWriter.done(),
        checkoutWriter.done(),
        transferBarrierWriter.done(),
        countBarrierWriter.done(),
      ]);
      assert.deepEqual(barrierOutputs.map((entry) => entry.trim()), [
        "updated", "settled", "dispatched", "inventory_conflict",
      ]);
      const stateAfterBarrier = JSON.parse(psql(
        box,
        `SELECT pg_catalog.jsonb_object_agg(variant.id,pg_catalog.jsonb_build_object(
  'variant',pg_catalog.to_jsonb(variant),
  'source',(SELECT pg_catalog.to_jsonb(balance) FROM saas.inventory_balances AS balance WHERE balance.store_id=variant.store_id AND balance.location_id='${defaultLocation}' AND balance.variant_id=variant.id),
  'destination',(SELECT pg_catalog.to_jsonb(balance) FROM saas.inventory_balances AS balance WHERE balance.store_id=variant.store_id AND balance.location_id='${LOCATION_B}' AND balance.variant_id=variant.id)
)) FROM saas.product_variants AS variant WHERE variant.store_id='${STORE}' AND variant.id IN('${VARIANT_A}','${VARIANT_B}');`,
      ).stdout.trim());
      const transferTimestamp = JSON.parse(
        psql(box, `SELECT pg_catalog.to_jsonb('2026-07-22T20:23:01Z'::timestamptz);`).stdout.trim(),
      );
      assert.deepEqual(stateAfterBarrier, {
        [VARIANT_A]: {
          variant: {
            ...stateBeforeBarrier[VARIANT_A].variant,
            title: "A Catalog Barrier",
            sku: "CATALOG-BARRIER-A",
            attributes: { barrier: "catalog" },
            version: stateBeforeBarrier[VARIANT_A].variant.version + 3,
            updated_at: transferTimestamp,
          },
          source: {
            ...stateBeforeBarrier[VARIANT_A].source,
            version: stateBeforeBarrier[VARIANT_A].source.version + 3,
            updated_at: transferTimestamp,
          },
          destination: stateBeforeBarrier[VARIANT_A].destination,
        },
        [VARIANT_B]: {
          variant: {
            ...stateBeforeBarrier[VARIANT_B].variant,
            stock_quantity: stateBeforeBarrier[VARIANT_B].variant.stock_quantity - 1,
            version: stateBeforeBarrier[VARIANT_B].variant.version + 1,
            updated_at: transferTimestamp,
          },
          source: {
            ...stateBeforeBarrier[VARIANT_B].source,
            quantity: stateBeforeBarrier[VARIANT_B].source.quantity - 1,
            version: stateBeforeBarrier[VARIANT_B].source.version + 1,
            updated_at: transferTimestamp,
          },
          destination: stateBeforeBarrier[VARIANT_B].destination,
        },
      });
      assert.deepEqual(movementRows(box, catalogOperation, ["catalog_adjustment"]), [{
        variantId: VARIANT_A, locationId: defaultLocation, movementKind: "catalog_adjustment",
        direction: "in", quantityDelta: 2, sourceKind: "catalog_adjustment", sourceId: catalogOperation,
      }]);
      assert.deepEqual(movementRows(box, CHECKOUT_ATTEMPT, ["checkout_sale"]), [{
        variantId: VARIANT_A, locationId: defaultLocation, movementKind: "checkout_sale",
        direction: "out", quantityDelta: -1, sourceKind: "checkout_sale", sourceId: CHECKOUT_ATTEMPT,
      }]);
      assert.deepEqual(movementRows(box, checkoutBarrierTransfer, ["transfer_out"]), [
        {
          variantId: VARIANT_A, locationId: defaultLocation, movementKind: "transfer_out",
          direction: "out", quantityDelta: -1, sourceKind: "transfer", sourceId: checkoutBarrierTransfer,
        },
        {
          variantId: VARIANT_B, locationId: defaultLocation, movementKind: "transfer_out",
          direction: "out", quantityDelta: -1, sourceKind: "transfer", sourceId: checkoutBarrierTransfer,
        },
      ]);
      const persistedCatalogRaw = psql(
        box,
        `SELECT result_payload::text FROM saas.catalog_operations WHERE operation_id='${catalogOperation}';`,
      ).stdout.trim();
      const catalogCreatedAt = psql(
        box,
        `SELECT saas.catalog_timestamp(created_at) FROM saas.product_variants WHERE id='${VARIANT_A}';`,
      ).stdout.trim();
      const expectedCatalogResult = {
        variant: {
          id: VARIANT_A,
          productId: PRODUCT,
          storeId: STORE,
          title: "A Catalog Barrier",
          sku: "CATALOG-BARRIER-A",
          priceCents: 1000,
          costCents: 500,
          stockTracking: true,
          stockQuantity: stateBeforeBarrier[VARIANT_A].variant.stock_quantity + 2,
          status: "active",
          attributes: { barrier: "catalog" },
          createdAt: catalogCreatedAt,
          updatedAt: "2026-07-22T20:22:59.000Z",
          version: stateBeforeBarrier[VARIANT_A].variant.version + 1,
        },
      };
      assert.deepEqual(JSON.parse(persistedCatalogRaw), expectedCatalogResult);
      assert.deepEqual(
        JSON.parse(psql(
          box,
          `SELECT pg_catalog.jsonb_build_object('operationId',operation_id,'operationKind',operation_kind,'fingerprint',payload_fingerprint,'productId',result_product_id,'variantId',result_variant_id,'result',result_payload) FROM saas.catalog_operations WHERE operation_id='${catalogOperation}';`,
        ).stdout.trim()),
        {
          operationId: catalogOperation,
          operationKind: "update_variant",
          fingerprint: catalogFingerprint,
          productId: PRODUCT,
          variantId: VARIANT_A,
          result: expectedCatalogResult,
        },
      );
      const catalogOperationRaw = psql(
        box,
        `SELECT pg_catalog.to_jsonb(operation_row)::text FROM saas.catalog_operations AS operation_row WHERE operation_id='${catalogOperation}';`,
      ).stdout.trim();
      const replayedCatalog = result(box, catalogCall());
      assert.equal(replayedCatalog.outcome, "operation_replayed");
      assert.deepEqual(replayedCatalog.result, JSON.parse(persistedCatalogRaw));
      assert.equal(
        psql(box, `SET ROLE celebix_saas_app;SELECT result_payload::text FROM ${catalogCall()};`).stdout.trim(),
        persistedCatalogRaw,
      );
      assert.equal(result(box, catalogCall(fingerprint("catalog-mismatch"))).outcome, "operation_mismatch");
      assert.equal(
        psql(box, `SELECT pg_catalog.to_jsonb(operation_row)::text FROM saas.catalog_operations AS operation_row WHERE operation_id='${catalogOperation}';`).stdout.trim(),
        catalogOperationRaw,
      );
      assert.deepEqual(
        JSON.parse(psql(
          box,
          `SELECT pg_catalog.jsonb_build_object('operationId',operation_id,'operationKind',operation_kind,'fingerprint',payload_fingerprint,'result',result_payload) FROM saas.checkout_operations WHERE operation_id='${CHECKOUT_OPERATION}';`,
        ).stdout.trim()),
        {
          operationId: CHECKOUT_OPERATION,
          operationKind: "settle_callback",
          fingerprint: fingerprint(CHECKOUT_OPERATION),
          result: {
            outcome: "settled", status: "success", orderId: CHECKOUT_ORDER,
            orderNumber: "INV-CHECKOUT-1", paymentAmount: 1000, totalAmount: 1000,
            currency: "TRY", paymentType: "card", testMode: 1,
          },
        },
      );
      assert.deepEqual(
        JSON.parse(psql(
          box,
          `SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('operationId',operation_id,'operationKind',operation_kind,'fingerprint',payload_fingerprint,'entityId',result_entity_id,'status',result_payload->>'status','version',(result_payload->>'version')::bigint) ORDER BY operation_id) FROM saas.inventory_operations WHERE operation_id IN('${operation(106)}','${operation(107)}');`,
        ).stdout.trim()),
        [{
          operationId: operation(106),
          operationKind: "transfer_dispatch",
          fingerprint: fingerprint(operation(106)),
          entityId: checkoutBarrierTransfer,
          status: "in_transit",
          version: barrierTransfer.result.version + 1,
        }],
      );

      const transferA = makeTransfer(
        TRANSFER_REVERSE_A,
        70,
        [
          { lineId: line(70), variantId: VARIANT_B, quantity: 1 },
          { lineId: line(71), variantId: VARIANT_A, quantity: 1 },
        ],
        defaultLocation,
        LOCATION_B,
      );
      const transferB = makeTransfer(
        TRANSFER_REVERSE_B,
        72,
        [
          { lineId: line(72), variantId: VARIANT_A, quantity: 1 },
          { lineId: line(73), variantId: VARIANT_B, quantity: 1 },
        ],
        LOCATION_B,
        defaultLocation,
      );
      const sessionA = interactive(box, "inventory_transfer_reverse_a");
      const sessionB = interactive(box, "inventory_transfer_reverse_b");
      sessionA.write(`SET ROLE celebix_saas_app;SET statement_timeout='5s';SELECT outcome FROM ${transferTransition("dispatch", { op: operation(74), transfer: TRANSFER_REVERSE_A, expected: transferA.result.version, now: "2026-07-22T20:20:00Z" })};`);
      sessionB.write(`SET ROLE celebix_saas_app;SET statement_timeout='5s';SELECT outcome FROM ${transferTransition("dispatch", { op: operation(75), transfer: TRANSFER_REVERSE_B, expected: transferB.result.version, now: "2026-07-22T20:20:01Z" })};`);
      sessionA.child.stdin.end();
      sessionB.child.stdin.end();
      const outputs = await Promise.all([sessionA.done(), sessionB.done()]);
      assert.deepEqual(outputs.map((entry) => entry.trim()).sort(), ["dispatched", "dispatched"]);
      const dispatchDefinition = psql(
        box,
        `SELECT pg_catalog.pg_get_functiondef('saas.inventory_transfers_dispatch(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::regprocedure);`,
      ).stdout;
      assert.ok(dispatchDefinition.indexOf("ORDER BY location.id FOR UPDATE") < dispatchDefinition.indexOf("ORDER BY variant.id FOR UPDATE"));
      assert.ok(dispatchDefinition.indexOf("ORDER BY variant.id FOR UPDATE") < dispatchDefinition.indexOf("ORDER BY balance.location_id,balance.variant_id FOR UPDATE"));

      const purchaseOrder = "73000000-0000-4000-8000-000000000001";
      const purchaseLine = "73100000-0000-4000-8000-000000000001";
      const purchaseSaved = result(
        box,
        `saas.purchasing_save(${authority("2026-07-22T20:21:00Z")},'${operation(76)}','${fingerprint(operation(76))}','${purchaseOrder}',NULL,'${LOCATION_B}','Diger Yazici','${JSON.stringify([{ lineId: purchaseLine, variantId: VARIANT_A, orderedQuantity: 1, unitCostCents: 500 }])}'::jsonb)`,
      );
      assert.equal(purchaseSaved.outcome, "saved");
      const purchaseOrdered = result(
        box,
        `saas.purchasing_transition(${authority("2026-07-22T20:21:01Z")},'${operation(77)}','${fingerprint(operation(77))}','${purchaseOrder}',${purchaseSaved.result.version},'order')`,
      );
      assert.equal(purchaseOrdered.outcome, "transitioned");
      const writerTransfer = "70000000-0000-4000-8000-000000000006";
      const writerSaved = result(box, transferSave({
        op: operation(78),
        transfer: writerTransfer,
        source: defaultLocation,
        destination: LOCATION_B,
        lines: [{ lineId: line(78), variantId: VARIANT_A, quantity: 1 }],
        now: "2026-07-22T20:21:02Z",
      }));
      const purchasingWriter = interactive(box, "inventory_purchasing_other_writer");
      const transferWriter = interactive(box, "inventory_transfer_other_writer");
      purchasingWriter.write(`SET ROLE celebix_saas_app;SET statement_timeout='5s';SELECT outcome FROM saas.purchasing_receive(${authority("2026-07-22T20:21:03Z")},'${operation(79)}','${fingerprint(operation(79))}','${purchaseOrder}',${purchaseOrdered.result.version},'${LOCATION_B}','${JSON.stringify([{ lineId: purchaseLine, quantity: 1 }])}'::jsonb);`);
      transferWriter.write(`SET ROLE celebix_saas_app;SET statement_timeout='5s';SELECT outcome FROM ${transferTransition("dispatch", { op: operation(84), transfer: writerTransfer, expected: writerSaved.result.version, now: "2026-07-22T20:21:04Z" })};`);
      purchasingWriter.child.stdin.end();
      transferWriter.child.stdin.end();
      const writerOutputs = await Promise.all([
        purchasingWriter.done(),
        transferWriter.done(),
      ]);
      assert.deepEqual(
        writerOutputs.map((entry) => entry.trim()).sort(),
        ["dispatched", "received"],
      );

      const replayTransfer = "70000000-0000-4000-8000-000000000008";
      const replaySaved = result(box, transferSave({
        op: operation(87),
        transfer: replayTransfer,
        source: defaultLocation,
        destination: LOCATION_B,
        lines: [{ lineId: line(87), variantId: VARIANT_B, quantity: 1 }],
        now: "2026-07-22T20:21:05Z",
      }));
      const replayWriterA = interactive(box, "inventory_transfer_replay_a");
      const replayWriterB = interactive(box, "inventory_transfer_replay_b");
      const replayCall = transferTransition("dispatch", {
        op: operation(88),
        transfer: replayTransfer,
        expected: replaySaved.result.version,
        now: "2026-07-22T20:21:06Z",
      });
      replayWriterA.write(`SET ROLE celebix_saas_app;SET statement_timeout='5s';SELECT outcome FROM ${replayCall};`);
      replayWriterB.write(`SET ROLE celebix_saas_app;SET statement_timeout='5s';SELECT outcome FROM ${replayCall};`);
      replayWriterA.child.stdin.end();
      replayWriterB.child.stdin.end();
      const replayOutputs = await Promise.all([
        replayWriterA.done(),
        replayWriterB.done(),
      ]);
      assert.deepEqual(
        replayOutputs.map((entry) => entry.trim()).sort(),
        ["dispatched", "operation_replayed"],
      );
    });
    await scenario("received and cancelled transfer movements are exactly balanced", () => {
      const balances = JSON.parse(psql(
        box,
        `SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(source_id,movement_kind,total) ORDER BY source_id,movement_kind) FROM (SELECT source_id,movement_kind,sum(quantity_delta) AS total FROM saas.inventory_movements WHERE source_id IN('${TRANSFER_RECEIVE}','${TRANSFER_CANCEL}') GROUP BY source_id,movement_kind) movements;`,
      ).stdout.trim());
      assert.deepEqual(balances, [
        [TRANSFER_RECEIVE, "transfer_in", 5],
        [TRANSFER_RECEIVE, "transfer_out", -5],
        [TRANSFER_CANCEL, "transfer_out", -2],
        [TRANSFER_CANCEL, "transfer_return", 2],
      ]);
    });
    await scenario("terminal lifecycle and dispatched transfer lines are immutable", () => {
      const saveDenied = result(box, transferSave({
        op: operation(80), transfer: TRANSFER_RECEIVE, expected: 3,
        source: defaultLocation, destination: LOCATION_B,
        lines: [{ lineId: line(80), variantId: VARIANT_A, quantity: 99 }],
      }));
      const receiveDenied = result(box, transferTransition("receive", {
        op: operation(81), transfer: TRANSFER_CANCEL, expected: 3,
      }));
      assert.equal(saveDenied.outcome, "invalid_transition");
      assert.equal(receiveDenied.outcome, "invalid_transition");
      assert.equal(
        psql(box, `SELECT quantity FROM saas.inventory_transfer_lines WHERE store_id='${STORE}' AND inventory_transfer_id='${TRANSFER_RECEIVE}' AND variant_id='${VARIANT_A}';`).stdout.trim(),
        "3",
      );
    });
    await scenario("operation proofs and inventory movements are immutable", () => {
      for (const statement of [
        `UPDATE saas.inventory_operations SET payload_fingerprint=repeat('f',64) WHERE operation_id='${operation(4)}'`,
        `DELETE FROM saas.inventory_operations WHERE operation_id='${operation(4)}'`,
        `UPDATE saas.inventory_movements SET quantity_delta=99 WHERE source_id='${COUNT_MAIN}'`,
        `DELETE FROM saas.inventory_movements WHERE source_id='${COUNT_MAIN}'`,
      ]) {
        const denied = psql(box, `SET ROLE celebix_saas_owner;${statement};`, DB, true);
        assert.notEqual(denied.status, 0);
        assert.match(denied.stderr, /INVENTORY_(?:OPERATION|MOVEMENT)_IMMUTABLE/);
      }
    });
    await scenario("forced RLS composite foreign keys ACLs and no direct app DML close authority", () => {
      assert.equal(
        psql(
          box,
          `SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relname=ANY(ARRAY['inventory_counts','inventory_count_lines','inventory_transfers','inventory_transfer_lines']) AND c.relrowsecurity AND c.relforcerowsecurity;`,
        ).stdout.trim(),
        "4",
      );
      for (const table of TABLES) {
        const denied = psql(box, `SET ROLE celebix_saas_app;DELETE FROM saas.${table};`, DB, true);
        assert.notEqual(denied.status, 0);
        assert.match(denied.stderr, /permission denied/);
      }
      for (const signature of FUNCTIONS) {
        assert.equal(
          psql(
            box,
            `SELECT pg_catalog.has_function_privilege('celebix_saas_app','saas.${signature}','EXECUTE') AND NOT pg_catalog.has_function_privilege('celebix_saas_workflow','saas.${signature}','EXECUTE') AND NOT pg_catalog.has_function_privilege(0::oid,'saas.${signature}','EXECUTE');`,
          ).stdout.trim(),
          "t",
          signature,
        );
      }
      assert.equal(
        psql(
          box,
          `SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid IN('saas.inventory_count_lines'::regclass,'saas.inventory_transfer_lines'::regclass) AND contype='f' AND pg_catalog.pg_get_constraintdef(oid) LIKE '%FOREIGN KEY (store_id,%';`,
        ).stdout.trim(),
        "4",
      );
    });
    await scenario("backup and restore preserve executable count transfer authority", () => {
      const dump = path.join(box.root, "inventory.dump");
      command(box.executables.pg_dump, [
        "-h", box.socket, "-p", String(box.port), "-U", "postgres",
        "-Fc", "-f", dump, DB,
      ]);
      psql(box, `CREATE DATABASE ${RESTORED};`, "postgres");
      command(box.executables.pg_restore, [
        "-h", box.socket, "-p", String(box.port), "-U", "postgres",
        "-d", RESTORED, "--exit-on-error", dump,
      ]);
      apply(box, "202607220044_inventory_counts_transfers_assertions.sql", RESTORED);
      assert.equal(
        psql(box, `SELECT count(*) FROM saas.inventory_counts;`, RESTORED).stdout.trim(),
        psql(box, `SELECT count(*) FROM saas.inventory_counts;`).stdout.trim(),
      );
      assert.equal(
        result(box, `saas.inventory_transfers_get(${authority()},'${TRANSFER_RECEIVE}')`, RESTORED).outcome,
        "found",
      );
      const ownerProof = JSON.parse(psql(
        box,
        `SELECT pg_catalog.jsonb_build_object(
  'tables',(SELECT pg_catalog.bool_and(pg_catalog.pg_get_userbyid(relation.relowner)='celebix_saas_owner' AND relation.relrowsecurity AND relation.relforcerowsecurity) FROM pg_catalog.pg_class AS relation JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='saas' AND relation.relname=ANY(ARRAY['inventory_counts','inventory_count_lines','inventory_transfers','inventory_transfer_lines'])),
  'functions',(SELECT pg_catalog.bool_and(pg_catalog.pg_get_userbyid(proc.proowner)='celebix_saas_owner') FROM pg_catalog.pg_proc AS proc JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=proc.pronamespace WHERE namespace.nspname='saas' AND (proc.proname=ANY(ARRAY['inventory_counts_list','inventory_counts_get','inventory_counts_save','inventory_counts_start','inventory_counts_commit','inventory_counts_cancel','inventory_transfers_list','inventory_transfers_get','inventory_transfers_save','inventory_transfers_dispatch','inventory_transfers_receive','inventory_transfers_cancel']) OR proc.proname='quick_checkout_settle_success_core')),
  'immutability',(SELECT pg_catalog.count(*)=2 FROM pg_catalog.pg_trigger AS trigger WHERE trigger.tgname=ANY(ARRAY['inventory_movements_immutable','inventory_operations_immutable']) AND trigger.tgenabled='O' AND NOT trigger.tgisinternal)
);`,
        RESTORED,
      ).stdout.trim());
      assert.deepEqual(ownerProof, {
        tables: true, functions: true, immutability: true,
      });
      const restoredImmutable = psql(
        box,
        `SET ROLE celebix_saas_owner;UPDATE saas.inventory_movements SET quantity_delta=99 WHERE source_id='${COUNT_MAIN}';`,
        RESTORED,
        true,
      );
      assert.notEqual(restoredImmutable.status, 0);
      assert.match(restoredImmutable.stderr, /INVENTORY_MOVEMENT_IMMUTABLE/);
      const restoredDirectDml = psql(
        box,
        `SET ROLE celebix_saas_app;DELETE FROM saas.inventory_counts;`,
        RESTORED,
        true,
      );
      assert.notEqual(restoredDirectDml.status, 0);
      assert.match(restoredDirectDml.stderr, /permission denied/);
      psql(box, `DROP DATABASE ${RESTORED} WITH (FORCE);`, "postgres");
    });
    await scenario("rollback refuses nondisposable state then restores exact 043 and reapplies", () => {
      const refused = psql(
        box,
        readFileSync(path.join(SQL, "202607220044_inventory_counts_transfers.down.sql"), "utf8"),
        DB,
        true,
      );
      assert.notEqual(refused.status, 0);
      assert.match(refused.stderr, /INVENTORY_COUNTS_TRANSFERS_ROLLBACK_BLOCKED/);

      psql(
        box,
        `BEGIN;SET LOCAL ROLE celebix_saas_owner;
ALTER TABLE saas.inventory_movements DISABLE TRIGGER inventory_movements_immutable;
ALTER TABLE saas.inventory_operations DISABLE TRIGGER inventory_operations_immutable;
DELETE FROM saas.inventory_operations WHERE operation_kind LIKE 'count_%' OR operation_kind LIKE 'transfer_%';
DELETE FROM saas.inventory_movements WHERE source_kind IN('count_adjustment','transfer');
DELETE FROM saas.inventory_count_lines;
DELETE FROM saas.inventory_counts;
DELETE FROM saas.inventory_transfer_lines;
DELETE FROM saas.inventory_transfers;
UPDATE saas.inventory_balances SET quantity=CASE WHEN location_id='${defaultLocation}' AND variant_id='${VARIANT_A}' THEN 20 WHEN location_id='${defaultLocation}' AND variant_id='${VARIANT_B}' THEN 12 WHEN location_id='${LOCATION_B}' THEN 0 ELSE quantity END,version=version+1,updated_at='2026-07-22T21:00:00Z' WHERE store_id='${STORE}';
SELECT pg_catalog.set_config('saas.inventory.source_marker','inventory_managed',true);
UPDATE saas.product_variants SET stock_quantity=CASE id WHEN '${VARIANT_A}' THEN 20 WHEN '${VARIANT_B}' THEN 12 ELSE stock_quantity END,version=version+1,updated_at='2026-07-22T21:00:00Z' WHERE store_id='${STORE}';
SELECT pg_catalog.set_config('saas.inventory.source_marker','',true);
ALTER TABLE saas.inventory_operations ENABLE TRIGGER inventory_operations_immutable;
ALTER TABLE saas.inventory_movements ENABLE TRIGGER inventory_movements_immutable;
COMMIT;`,
      );
      const patchedCheckoutDefinition = psql(
        box,
        `SELECT pg_catalog.pg_get_functiondef('saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)'::regprocedure);`,
      ).stdout;
      const driftedCheckoutDefinition = patchedCheckoutDefinition.replace(
        "inventory checkout store lock begin",
        "inventory checkout store lock begin drift",
      );
      assert.notEqual(driftedCheckoutDefinition, patchedCheckoutDefinition);
      psql(box, `SET ROLE celebix_saas_owner;${driftedCheckoutDefinition}`);
      const driftRefused = psql(
        box,
        readFileSync(path.join(SQL, "202607220044_inventory_counts_transfers.down.sql"), "utf8"),
        DB,
        true,
      );
      assert.notEqual(driftRefused.status, 0);
      assert.match(driftRefused.stderr, /INVENTORY_CHECKOUT_STORE_LOCK_RESTORE_DRIFT/);
      psql(box, `SET ROLE celebix_saas_owner;${patchedCheckoutDefinition}`);

      const residueCheckoutDefinition = patchedCheckoutDefinition.replace(
        "  -- Shared success settlement lock order is exact:",
        "  -- saas.catalog.store: residue\n  -- Shared success settlement lock order is exact:",
      );
      assert.notEqual(residueCheckoutDefinition, patchedCheckoutDefinition);
      psql(box, `SET ROLE celebix_saas_owner;${residueCheckoutDefinition}`);
      const residueRefused = psql(
        box,
        readFileSync(path.join(SQL, "202607220044_inventory_counts_transfers.down.sql"), "utf8"),
        DB,
        true,
      );
      assert.notEqual(residueRefused.status, 0);
      assert.match(residueRefused.stderr, /INVENTORY_CHECKOUT_STORE_LOCK_RESTORE_RESIDUE/);
      psql(box, `SET ROLE celebix_saas_owner;${patchedCheckoutDefinition}`);

      apply(box, "202607220044_inventory_counts_transfers.down.sql");
      assert.equal(psql(box, "SELECT to_regclass('saas.inventory_counts') IS NULL;").stdout.trim(), "t");
      assert.equal(
        psql(
          box,
          `SELECT pg_catalog.string_agg(att.attname||':'||pg_catalog.format_type(att.atttypid,att.atttypmod),',' ORDER BY att.attnum) FROM pg_catalog.pg_attribute AS att WHERE att.attrelid='saas.inventory_operations'::regclass AND att.attnum>0 AND NOT att.attisdropped;`,
        ).stdout,
        operationShape043,
      );
      assert.equal(
        psql(box, `SELECT pg_catalog.string_agg(conname||':'||pg_catalog.pg_get_constraintdef(oid),E'\n' ORDER BY conname) FROM pg_catalog.pg_constraint WHERE conrelid='saas.inventory_operations'::regclass;`).stdout,
        operationConstraints043,
      );
      assert.equal(
        psql(box, `SELECT pg_catalog.string_agg(conname||':'||pg_catalog.pg_get_constraintdef(oid),E'\n' ORDER BY conname) FROM pg_catalog.pg_constraint WHERE conrelid='saas.inventory_movements'::regclass;`).stdout,
        movementConstraints043,
      );
      assert.equal(
        psql(box, `SELECT pg_catalog.pg_get_functiondef('saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)'::regprocedure);`).stdout,
        checkoutDefinition043,
      );
      assert.equal(
        psql(box, `SELECT owner.rolname FROM pg_catalog.pg_proc AS proc JOIN pg_catalog.pg_roles AS owner ON owner.oid=proc.proowner WHERE proc.oid='saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)'::regprocedure;`).stdout,
        checkoutOwner043,
      );
      assert.equal(
        psql(box, `SELECT COALESCE(proc.proacl::text,'NULL') FROM pg_catalog.pg_proc AS proc WHERE proc.oid='saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)'::regprocedure;`).stdout,
        checkoutAcl043,
      );
      apply(box, "202607220044_inventory_counts_transfers.up.sql");
      apply(box, "202607220044_inventory_counts_transfers_assertions.sql");
      assert.equal(
        psql(box, `SELECT count(*) FROM saas.product_variants v WHERE v.status='active' AND saas.inventory_active_balance_total(v.store_id,v.id)<>v.stock_quantity;`).stdout.trim(),
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
