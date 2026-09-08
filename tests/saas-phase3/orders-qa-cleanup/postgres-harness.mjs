import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CLEANUP_SQL = path.join(ROOT, "scripts", "atlas-orders-qa-cleanup.sql");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const TOKEN = randomBytes(6).toString("hex");
const TEMPLATE = `orders_qa_cleanup_template_${TOKEN}`;
const STORE = "a828862c-4cc1-475a-89cc-5fbee31eb43f";
const OTHER_STORE = "11111111-1111-4111-8111-111111111111";
const ORDER_A = "af1982e0-c3f2-5f39-8509-8e0250394b13";
const ORDER_B = "0e8bca85-e87c-5a82-8a4e-d615b6d4df29";
const REAL_ORDER = "99999999-9999-4999-8999-999999999999";
const OTHER_ORDER = "88888888-8888-4888-8888-888888888888";
const DRAFT_A = "195bbbd8-f7f6-46ca-a83a-6e15e30eac23";
const DRAFT_B = "3355619c-9e3c-4296-8d7e-8a6848cf54eb";
const TOTAL = 11;
const completed = [];

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next isolated/native location.
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
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout).trim());
  }
  return result;
}

const bins = Object.fromEntries(["initdb", "pg_ctl", "psql"].map((name) => [name, executable(name)]));
assert.ok(Object.values(bins).every(Boolean), "PostgreSQL 16 native tools are required");

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "celebix-orders-qa-cleanup-"));
const socketDirectory = path.join("/tmp", `orders-qa-${TOKEN}`);
const dataDirectory = path.join(temporaryDirectory, "data");
const port = 20_000 + Math.floor(Math.random() * 20_000);
mkdirSync(socketDirectory, { mode: 0o700 });

function psql(database, source, variables = {}, allowFailure = false) {
  const variableArgs = Object.entries(variables).flatMap(([key, value]) => ["-v", `${key}=${value}`]);
  return command(bins.psql, [
    "-h", socketDirectory, "-p", String(port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    ...variableArgs, "-U", "postgres", "-d", database,
  ], { input: source, allowFailure });
}

function createDatabase(name, template) {
  psql("postgres", `CREATE DATABASE ${name}${template ? ` TEMPLATE ${template}` : ""};`);
}

function cloneDatabase(label) {
  const name = `orders_qa_${label}_${TOKEN}`;
  createDatabase(name, TEMPLATE);
  return name;
}

function cleanup(database, apply = false) {
  assert.ok(existsSync(CLEANUP_SQL), "exact-ID cleanup SQL must exist");
  return psql(database, readFileSync(CLEANUP_SQL, "utf8"), {
    apply: apply ? 1 : 0,
    expected_database: database,
  }, true);
}

function count(database, relation, where = "TRUE") {
  return Number(psql(database, `SELECT count(*) FROM ${relation} WHERE ${where};`).stdout.trim());
}

function seed() {
  psql(TEMPLATE, `
    CREATE SCHEMA saas;
    CREATE TABLE saas.stores(id uuid PRIMARY KEY,slug text NOT NULL);
    CREATE TABLE saas.orders(
      id uuid PRIMARY KEY,store_id uuid NOT NULL,order_number text NOT NULL,source text NOT NULL,
      customer_name text,customer_email text,customer_phone text,currency text NOT NULL,total_cents bigint NOT NULL,
      status text NOT NULL,payment_status text NOT NULL,shipping_address jsonb,billing_address jsonb,
      customer_id uuid,quick_order_link_id uuid,paid_at timestamptz,refunded_at timestamptz,created_at timestamptz NOT NULL
    );
    CREATE UNIQUE INDEX orders_store_id_id_key ON saas.orders(store_id,id);
    CREATE TABLE saas.order_items(id uuid PRIMARY KEY,store_id uuid NOT NULL,order_id uuid NOT NULL REFERENCES saas.orders(id));
    CREATE TABLE saas.order_events(id uuid PRIMARY KEY,store_id uuid NOT NULL,order_id uuid NOT NULL REFERENCES saas.orders(id),event_type text NOT NULL);
    CREATE TABLE saas.order_operations(operation_id uuid PRIMARY KEY,store_id uuid NOT NULL,order_id uuid NOT NULL REFERENCES saas.orders(id),operation_kind text NOT NULL);
    CREATE TABLE saas.order_drafts(id uuid PRIMARY KEY,store_id uuid NOT NULL,converted_order_id uuid REFERENCES saas.orders(id),draft_number text NOT NULL,status text NOT NULL,adjust_inventory boolean NOT NULL,customer_name text,customer_email text,note text,total_cents bigint NOT NULL,created_at timestamptz NOT NULL);
    CREATE TABLE saas.order_draft_lines(id uuid PRIMARY KEY,store_id uuid NOT NULL,draft_id uuid NOT NULL REFERENCES saas.order_drafts(id));
    CREATE TABLE saas.order_draft_operations(operation_id uuid PRIMARY KEY,store_id uuid NOT NULL,draft_id uuid NOT NULL REFERENCES saas.order_drafts(id));
    CREATE TABLE saas.order_email_deliveries(id uuid PRIMARY KEY,store_id uuid NOT NULL,order_id uuid NOT NULL REFERENCES saas.orders(id),status text NOT NULL,lease_id uuid);
    CREATE TABLE saas.analytics_delivery_outbox(id uuid PRIMARY KEY,store_id uuid NOT NULL,order_id uuid NOT NULL REFERENCES saas.orders(id),status text NOT NULL,lease_token uuid);
    CREATE TABLE saas.shipping_shipments(id uuid PRIMARY KEY,store_id uuid NOT NULL,order_id uuid NOT NULL REFERENCES saas.orders(id));
    CREATE TABLE saas.manual_order_inventory_commitments(store_id uuid NOT NULL,order_id uuid NOT NULL REFERENCES saas.orders(id),variant_id uuid NOT NULL);
    INSERT INTO saas.stores VALUES ('${STORE}','guzide-kuyumcu-4'),('${OTHER_STORE}','other-store');
    INSERT INTO saas.orders VALUES
      ('${ORDER_A}','${STORE}','MAN-af1982e0c3f25f398509','manual','ATLAS QA','atlas@example.test',NULL,'TRY',9094500,'confirmed','pending','{}','{}',NULL,NULL,NULL,NULL,'2026-08-01T15:36:36.656Z'),
      ('${ORDER_B}','${STORE}','MAN-0e8bca85e87c5a828a4e','manual','ATLAS QA','atlas@example.test',NULL,'TRY',9094500,'confirmed','pending','{}','{}',NULL,NULL,NULL,NULL,'2026-08-01T15:37:26.880Z'),
      ('${REAL_ORDER}','${STORE}','10823','manual_import','Gercek','real@example.invalid',NULL,'TRY',1885155,'delivered','completed','{}','{}','77777777-7777-4777-8777-777777777777',NULL,'2025-08-14T14:40:00Z',NULL,'2025-08-14T14:40:00Z'),
      ('${OTHER_ORDER}','${OTHER_STORE}','OTHER-1','manual','Other','other@example.invalid',NULL,'TRY',100,'confirmed','pending','{}','{}',NULL,NULL,NULL,NULL,'2026-08-01T15:36:36Z');
    INSERT INTO saas.order_items VALUES
      ('20000000-0000-4000-8000-000000000001','${STORE}','${ORDER_A}'),
      ('20000000-0000-4000-8000-000000000002','${STORE}','${ORDER_B}');
    INSERT INTO saas.order_events VALUES
      ('30000000-0000-4000-8000-000000000001','${STORE}','${ORDER_A}','order_created'),
      ('30000000-0000-4000-8000-000000000002','${STORE}','${ORDER_A}','status_transition'),
      ('30000000-0000-4000-8000-000000000003','${STORE}','${ORDER_B}','order_created'),
      ('30000000-0000-4000-8000-000000000004','${STORE}','${ORDER_B}','shipping_updated'),
      ('30000000-0000-4000-8000-000000000005','${STORE}','${ORDER_B}','status_transition');
    INSERT INTO saas.order_operations VALUES
      ('40000000-0000-4000-8000-000000000001','${STORE}','${ORDER_A}','transition_status'),
      ('40000000-0000-4000-8000-000000000002','${STORE}','${ORDER_B}','transition_status'),
      ('40000000-0000-4000-8000-000000000003','${STORE}','${ORDER_B}','update_shipping');
    INSERT INTO saas.order_drafts VALUES
      ('${DRAFT_A}','${STORE}','${ORDER_A}','TSL-a','converted',false,'ATLAS QA','atlas@example.test','QA test',9094500,'2026-08-01T15:36:36.269Z'),
      ('${DRAFT_B}','${STORE}','${ORDER_B}','TSL-b','converted',false,'ATLAS QA','atlas@example.test','QA test',9094500,'2026-08-01T15:37:26.682Z');
    INSERT INTO saas.order_draft_lines VALUES
      ('50000000-0000-4000-8000-000000000001','${STORE}','${DRAFT_A}'),
      ('50000000-0000-4000-8000-000000000002','${STORE}','${DRAFT_B}');
    INSERT INTO saas.order_draft_operations VALUES
      ('60000000-0000-4000-8000-000000000001','${STORE}','${DRAFT_A}'),
      ('60000000-0000-4000-8000-000000000002','${STORE}','${DRAFT_A}'),
      ('60000000-0000-4000-8000-000000000003','${STORE}','${DRAFT_A}'),
      ('60000000-0000-4000-8000-000000000004','${STORE}','${DRAFT_B}'),
      ('60000000-0000-4000-8000-000000000005','${STORE}','${DRAFT_B}'),
      ('60000000-0000-4000-8000-000000000006','${STORE}','${DRAFT_B}');
  `);
}

async function scenario(name, run) {
  await run();
  completed.push(name);
  process.stdout.write(`PASS ${completed.length}/${TOTAL} ${name}\n`);
}

try {
  command(bins.initdb, ["-D", dataDirectory, "--auth=trust", "--username=postgres", "--no-locale"]);
  command(bins.pg_ctl, ["-D", dataDirectory, "-o", `-k ${socketDirectory} -p ${port} -h ''`, "-l", path.join(temporaryDirectory, "postgres.log"), "start"]);
  createDatabase(TEMPLATE);
  seed();

  await scenario("default mode is a rollback-only dry run", () => {
    const database = cloneDatabase("dry_run");
    const result = cleanup(database);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(count(database, "saas.orders"), 4);
  });
  await scenario("dry run reports only the exact two-order allowlist", () => {
    const database = cloneDatabase("report");
    const result = cleanup(database);
    assert.match(result.stdout, new RegExp(ORDER_A));
    assert.match(result.stdout, new RegExp(ORDER_B));
    assert.doesNotMatch(result.stdout, new RegExp(REAL_ORDER));
  });
  await scenario("apply deletes the exact disposable orders", () => {
    const database = cloneDatabase("apply_orders");
    const result = cleanup(database, true);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(count(database, "saas.orders", `store_id='${STORE}' AND id IN ('${ORDER_A}','${ORDER_B}')`), 0);
  });
  await scenario("apply deletes only the allowlisted lifecycle dependencies", () => {
    const database = cloneDatabase("apply_deps");
    const result = cleanup(database, true);
    assert.equal(result.status, 0, result.stderr);
    for (const relation of ["order_items", "order_events", "order_operations", "order_drafts", "order_draft_lines", "order_draft_operations"]) {
      assert.equal(count(database, `saas.${relation}`), 0, relation);
    }
  });
  await scenario("apply preserves same-store real orders and other tenants", () => {
    const database = cloneDatabase("preserve");
    const result = cleanup(database, true);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(count(database, "saas.orders", `id IN ('${REAL_ORDER}','${OTHER_ORDER}')`), 2);
  });
  await scenario("missing allowlist member fails closed", () => {
    const database = cloneDatabase("missing");
    psql(database, `DELETE FROM saas.order_draft_operations WHERE draft_id='${DRAFT_B}'; DELETE FROM saas.order_draft_lines WHERE draft_id='${DRAFT_B}'; DELETE FROM saas.order_drafts WHERE id='${DRAFT_B}'; DELETE FROM saas.order_operations WHERE order_id='${ORDER_B}'; DELETE FROM saas.order_events WHERE order_id='${ORDER_B}'; DELETE FROM saas.order_items WHERE order_id='${ORDER_B}'; DELETE FROM saas.orders WHERE id='${ORDER_B}';`);
    const result = cleanup(database, true);
    assert.notEqual(result.status, 0);
    assert.equal(count(database, "saas.orders", `id='${ORDER_A}'`), 1);
  });
  await scenario("changed order state fails closed", () => {
    const database = cloneDatabase("changed");
    psql(database, `UPDATE saas.orders SET payment_status='completed',paid_at=now() WHERE id='${ORDER_A}';`);
    const result = cleanup(database, true);
    assert.notEqual(result.status, 0);
    assert.equal(count(database, "saas.orders", `id IN ('${ORDER_A}','${ORDER_B}')`), 2);
  });
  await scenario("pending notification dependency fails closed", () => {
    const database = cloneDatabase("email");
    psql(database, `INSERT INTO saas.order_email_deliveries VALUES ('70000000-0000-4000-8000-000000000001','${STORE}','${ORDER_A}','pending',NULL);`);
    const result = cleanup(database, true);
    assert.notEqual(result.status, 0);
    assert.equal(count(database, "saas.orders", `id IN ('${ORDER_A}','${ORDER_B}')`), 2);
  });
  await scenario("unexpected shipping dependency fails closed", () => {
    const database = cloneDatabase("shipping");
    psql(database, `INSERT INTO saas.shipping_shipments VALUES ('70000000-0000-4000-8000-000000000002','${STORE}','${ORDER_B}');`);
    const result = cleanup(database, true);
    assert.notEqual(result.status, 0);
    assert.equal(count(database, "saas.orders", `id IN ('${ORDER_A}','${ORDER_B}')`), 2);
  });
  await scenario("unexpected lifecycle row count fails closed", () => {
    const database = cloneDatabase("row_count");
    psql(database, `INSERT INTO saas.order_events VALUES ('70000000-0000-4000-8000-000000000003','${STORE}','${ORDER_A}','unexpected');`);
    const result = cleanup(database, true);
    assert.notEqual(result.status, 0);
    assert.equal(count(database, "saas.orders", `id IN ('${ORDER_A}','${ORDER_B}')`), 2);
  });
  await scenario("immutable lifecycle history is rejected before delete", () => {
    const database = cloneDatabase("immutable");
    psql(database, `
      CREATE FUNCTION saas.reject_draft_operation_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_TEST'; END $$;
      CREATE TRIGGER reject_draft_operation_delete BEFORE DELETE ON saas.order_draft_operations FOR EACH ROW EXECUTE FUNCTION saas.reject_draft_operation_delete();
    `);
    const result = cleanup(database, true);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /atlas_orders_qa_cleanup_immutable_history/);
    assert.equal(count(database, "saas.orders", `id IN ('${ORDER_A}','${ORDER_B}')`), 2);
  });

  assert.equal(completed.length, TOTAL);
  process.stdout.write(`PASS ${TOTAL}/${TOTAL} orders QA cleanup PostgreSQL 16 rehearsal complete\n`);
} finally {
  if (existsSync(path.join(dataDirectory, "postmaster.pid"))) {
    command(bins.pg_ctl, ["-D", dataDirectory, "-m", "fast", "stop"], { allowFailure: true });
  }
  rmSync(socketDirectory, { recursive: true, force: true });
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
