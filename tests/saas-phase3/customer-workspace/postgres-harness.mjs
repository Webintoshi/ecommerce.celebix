import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DATABASE = `customer_workspace_${randomBytes(5).toString("hex")}`;
const PLAN = "00000000-0000-4000-8000-000000000001";
const STORE_A = "10000000-0000-4000-8000-000000000076";
const STORE_B = "10000000-0000-4000-8000-000000000077";
const PRINCIPAL = "20000000-0000-4000-8000-000000000076";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000076";
const CUSTOMER_1 = "40000000-0000-4000-8000-000000000071";
const CUSTOMER_2 = "40000000-0000-4000-8000-000000000072";
const CUSTOMER_3 = "40000000-0000-4000-8000-000000000073";
const OTHER_CUSTOMER = "40000000-0000-4000-8000-000000000074";
const NOW = "2026-07-31T12:00:00.000Z";
const MIGRATIONS = [
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
  "202607220033_customer_management.up.sql",
  "202607220034_customer_management_api.up.sql",
  "202607270040_customer_taxonomy_assignment_fix.up.sql",
  "202607310076_customer_workspace.up.sql",
  "202607310076_customer_workspace_assertions.sql",
  "202607310077_catalog_variant_choices.up.sql",
  "202607310077_catalog_variant_choices_assertions.sql",
];

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* try next */ }
  }
  return null;
}

function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    encoding: "utf8",
    input,
    env: { ...process.env, PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}

function start() {
  assertSafeEnvironment();
  const tools = Object.fromEntries([...new Set(REQUIRED_NATIVE_TOOLS)].map((name) => [name, executable(name)]));
  if (Object.values(tools).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const root = mkdtempSync(path.join(tmpdir(), "cx-cw-"));
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 20_000 + Math.floor(Math.random() * 15_000);
  mkdirSync(socket, { mode: 0o700 });
  command(tools.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(tools.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { tools, root, data, socket, port, started: true };
}

function stop(box) {
  if (!box) return;
  if (box.started) command(box.tools.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], "", true);
  rmSync(box.root, { recursive: true, force: true });
}

function psql(box, source, database = DATABASE, allowFailure = false) {
  return command(box.tools.psql, [
    "-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], source, allowFailure).stdout.trim();
}

function apply(box, file) {
  psql(box, readFileSync(path.join(SQL, file), "utf8"));
}

function authorityArguments() {
  return `'${STORE_A}'::uuid,'${PRINCIPAL}'::uuid,'${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${NOW}'::timestamptz`;
}

function workspace(box, customerId) {
  return JSON.parse(psql(box, `BEGIN READ ONLY;SET LOCAL ROLE celebix_saas_app;
    SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
    FROM saas.customers_get_workspace(${authorityArguments()},'${customerId}'::uuid);COMMIT;`));
}

function variantChoices(box) {
  return JSON.parse(psql(box, `BEGIN READ ONLY;SET LOCAL ROLE celebix_saas_app;
    SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
    FROM saas.catalog_list_variant_choices(
      '${STORE_A}'::uuid,'${PRINCIPAL}'::uuid,'${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,
      'free_starter',1,100,'${NOW}'::timestamptz
    );COMMIT;`));
}

function orderId(index) {
  return `41000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function seed(box) {
  const linkedOrders = Array.from({ length: 52 }, (_, index) => {
    const number = index + 1;
    return `('${orderId(number)}','${STORE_A}','CUST-${number}','storefront','Alan Turing','alan@example.test','TRY',100,0,0,100,'delivered','completed','{}',1,'2026-07-31 11:00:00+00','2026-07-31 11:00:00+00','${CUSTOMER_2}')`;
  }).join(",\n");
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
      VALUES('${PRINCIPAL}','https://identity.example.test/oidc','customer-workspace-owner','owner@example.test',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
      ('${STORE_A}','Customers A','customers-a-76','active','tr','TRY','default','2026-01-01','2026-01-01'),
      ('${STORE_B}','Customers B','customers-b-76','active','tr','TRY','default','2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)
      VALUES('${MEMBERSHIP}','${PRINCIPAL}','${STORE_A}','store_owner','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at)
      VALUES('70000000-0000-4000-8000-000000000076','${STORE_A}','${PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01');
    INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,phone,version,created_at,updated_at) VALUES
      ('${CUSTOMER_1}','${STORE_A}','active','Ada','Lovelace','ada@example.test',NULL,1,'2026-07-31 09:00:00+00','2026-07-31 09:00:00+00'),
      ('${CUSTOMER_2}','${STORE_A}','active','Alan','Turing','alan@example.test',NULL,1,'2026-07-31 10:00:00+00','2026-07-31 10:00:00+00'),
      ('${CUSTOMER_3}','${STORE_A}','active','Grace','Hopper','grace@example.test',NULL,1,'2026-07-31 10:00:00+00','2026-07-31 10:00:00+00'),
      ('${OTHER_CUSTOMER}','${STORE_B}','active','Other','Store','other@example.test',NULL,1,'2026-07-31 11:00:00+00','2026-07-31 11:00:00+00');
    INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at,customer_id) VALUES
      ${linkedOrders};
    INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at,customer_id) VALUES
      ('42000000-0000-4000-8000-000000000001','${STORE_A}','EMAIL-ONLY','storefront','Alan Turing','alan@example.test','TRY',999,0,0,999,'delivered','completed','{}',1,'2026-07-31 12:00:00+00','2026-07-31 12:00:00+00',NULL),
      ('42000000-0000-4000-8000-000000000002','${STORE_B}','OTHER-STORE','storefront','Other Store','other@example.test','TRY',999,0,0,999,'delivered','completed','{}',1,'2026-07-31 12:00:00+00','2026-07-31 12:00:00+00','${OTHER_CUSTOMER}');
    INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at)
      VALUES('43000000-0000-4000-8000-000000000077','${STORE_A}','altin-yuzuk','Altın Yüzük','active','TRY',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at)
      VALUES('44000000-0000-4000-8000-000000000077','43000000-0000-4000-8000-000000000077','${STORE_A}','Varsayılan','ALTIN-77',10000,true,7,'active','{}',1,'2026-01-01','2026-01-01');
    COMMIT;`);
}

function main() {
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DATABASE};`, "postgres");
    for (const migration of MIGRATIONS) apply(box, migration);
    assert.match(psql(box, "SHOW server_version;"), /^16[.]/);
    seed(box);

    const middle = workspace(box, CUSTOMER_2);
    assert.equal(middle.outcome, "found");
    assert.deepEqual(middle.result.neighbors, {
      previous: { id: CUSTOMER_3, displayName: "Grace Hopper" },
      next: { id: CUSTOMER_1, displayName: "Ada Lovelace" },
    });
    assert.equal(middle.result.orders.length, 50);
    assert.equal(middle.result.orders[0].id, orderId(52));
    assert.equal(middle.result.orders.at(-1).id, orderId(3));
    assert.equal(middle.result.orders.some((order) => order.orderNumber === "EMAIL-ONLY"), false);
    assert.deepEqual(workspace(box, CUSTOMER_3).result.neighbors, { next: { id: CUSTOMER_2, displayName: "Alan Turing" } });
    assert.deepEqual(workspace(box, CUSTOMER_1).result.neighbors, { previous: { id: CUSTOMER_2, displayName: "Alan Turing" } });
    assert.equal(workspace(box, OTHER_CUSTOMER).outcome, "customer_not_found");
    assert.deepEqual(variantChoices(box), {
      outcome: "listed",
      result: { items: [{ productId: "43000000-0000-4000-8000-000000000077", productTitle: "Altın Yüzük", variantId: "44000000-0000-4000-8000-000000000077", variantTitle: "Varsayılan", sku: "ALTIN-77" }] },
    });

    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.memberships SET role='analyst' WHERE id='${MEMBERSHIP}';COMMIT;`);
    assert.equal(workspace(box, CUSTOMER_2).outcome, "found");
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.memberships SET role='store_owner' WHERE id='${MEMBERSHIP}';UPDATE saas.stores SET status='suspended' WHERE id='${STORE_A}';COMMIT;`);
    assert.equal(workspace(box, CUSTOMER_2).outcome, "store_inactive");
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.stores SET status='active' WHERE id='${STORE_A}';COMMIT;`);
    assert.equal(psql(box, "SELECT has_function_privilege('public','saas.customers_get_workspace(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)','EXECUTE');"), "f");

    apply(box, "202607310076_customer_workspace.down.sql");
    assert.equal(psql(box, "SELECT pg_catalog.to_regprocedure('saas.customers_get_workspace(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)') IS NULL;"), "t");
    apply(box, "202607310076_customer_workspace.up.sql");
    apply(box, "202607310076_customer_workspace_assertions.sql");
    assert.equal(workspace(box, CUSTOMER_2).result.orders.length, 50);
    apply(box, "202607310077_catalog_variant_choices.down.sql");
    assert.equal(psql(box, "SELECT pg_catalog.to_regprocedure('saas.catalog_list_variant_choices(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz)') IS NULL;"), "t");
    apply(box, "202607310077_catalog_variant_choices.up.sql");
    apply(box, "202607310077_catalog_variant_choices_assertions.sql");
    assert.equal(variantChoices(box).result.items[0].sku, "ALTIN-77");
    process.stdout.write("PASS customer workspace and catalog variant choices are tenant-scoped, bounded, rollback-safe, and authority-gated\n");
  } finally {
    stop(box);
  }
}

main();
