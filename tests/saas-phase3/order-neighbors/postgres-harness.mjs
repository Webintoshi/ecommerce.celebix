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
const DATABASE = `order_neighbors_${randomBytes(5).toString("hex")}`;
const PLAN = "00000000-0000-4000-8000-000000000001";
const STORE_A = "10000000-0000-4000-8000-000000000075";
const STORE_B = "10000000-0000-4000-8000-000000000076";
const PRINCIPAL = "20000000-0000-4000-8000-000000000075";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000075";
const ORDER_1 = "40000000-0000-4000-8000-000000000071";
const ORDER_2 = "40000000-0000-4000-8000-000000000072";
const ORDER_3 = "40000000-0000-4000-8000-000000000073";
const OTHER_ORDER = "40000000-0000-4000-8000-000000000074";
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
  "202607310075_order_neighbors.up.sql",
  "202607310075_order_neighbors_assertions.sql",
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
  const root = mkdtempSync(path.join(tmpdir(), "celebix-order-neighbors-"));
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

function authorityArguments(store = STORE_A) {
  return `'${store}'::uuid,'${PRINCIPAL}'::uuid,'${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${NOW}'::timestamptz`;
}

function neighbors(box, orderId, store = STORE_A) {
  return JSON.parse(psql(box, `BEGIN READ ONLY;SET LOCAL ROLE celebix_saas_app;
    SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
    FROM saas.orders_get_neighbors(${authorityArguments(store)},'${orderId}'::uuid);COMMIT;`));
}

function seed(box) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
      VALUES('${PRINCIPAL}','https://identity.example.test/oidc','order-neighbor-owner','owner@example.test',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
      ('${STORE_A}','Orders A','orders-a-75','active','tr','TRY','default','2026-01-01','2026-01-01'),
      ('${STORE_B}','Orders B','orders-b-75','active','tr','TRY','default','2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)
      VALUES('${MEMBERSHIP}','${PRINCIPAL}','${STORE_A}','store_owner','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at)
      VALUES('70000000-0000-4000-8000-000000000075','${STORE_A}','${PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01');
    INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at) VALUES
      ('${ORDER_1}','${STORE_A}','ORD-75-1','storefront','Ada','ada@example.test','TRY',100,0,0,100,'pending','pending','{}',1,'2026-07-31 09:00:00+00','2026-07-31 09:00:00+00'),
      ('${ORDER_2}','${STORE_A}','ORD-75-2','storefront','Alan','alan@example.test','TRY',100,0,0,100,'pending','pending','{}',1,'2026-07-31 10:00:00+00','2026-07-31 10:00:00+00'),
      ('${ORDER_3}','${STORE_A}','ORD-75-3','storefront','Grace','grace@example.test','TRY',100,0,0,100,'pending','pending','{}',1,'2026-07-31 10:00:00+00','2026-07-31 10:00:00+00'),
      ('${OTHER_ORDER}','${STORE_B}','OTHER-75','storefront','Other','other@example.test','TRY',100,0,0,100,'pending','pending','{}',1,'2026-07-31 11:00:00+00','2026-07-31 11:00:00+00');
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

    assert.deepEqual(neighbors(box, ORDER_2), {
      outcome: "found",
      result: {
        previous: { id: ORDER_3, orderNumber: "ORD-75-3" },
        next: { id: ORDER_1, orderNumber: "ORD-75-1" },
      },
    });
    assert.deepEqual(neighbors(box, ORDER_3), {
      outcome: "found",
      result: { next: { id: ORDER_2, orderNumber: "ORD-75-2" } },
    });
    assert.deepEqual(neighbors(box, ORDER_1), {
      outcome: "found",
      result: { previous: { id: ORDER_2, orderNumber: "ORD-75-2" } },
    });
    assert.equal(neighbors(box, OTHER_ORDER).outcome, "order_not_found");
    assert.equal(psql(box, "SELECT has_function_privilege('public','saas.orders_get_neighbors(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)','EXECUTE');"), "f");

    apply(box, "202607310075_order_neighbors.down.sql");
    assert.equal(psql(box, "SELECT pg_catalog.to_regprocedure('saas.orders_get_neighbors(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)') IS NULL;"), "t");
    apply(box, "202607310075_order_neighbors.up.sql");
    apply(box, "202607310075_order_neighbors_assertions.sql");
    assert.equal(neighbors(box, ORDER_2).result.previous.id, ORDER_3);
    process.stdout.write("PASS order neighbors are deterministic, tenant-scoped, rollback-safe, and authority-gated\n");
  } finally {
    stop(box);
  }
}

main();
