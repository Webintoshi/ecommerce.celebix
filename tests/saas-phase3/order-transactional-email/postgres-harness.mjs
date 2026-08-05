import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const DB = `order_email_${randomBytes(5).toString("hex")}`;
const EMPTY = `${DB}_empty`;
const UP = "202608050089_order_transactional_email.up.sql";
const DOWN = "202608050089_order_transactional_email.down.sql";
const ASSERTIONS = "202608050089_order_transactional_email_assertions.sql";
const PLAN = "00000000-0000-4000-8000-000000000001";
const STORE_A = "10000000-0000-4000-8000-000000000089";
const STORE_B = "10000000-0000-4000-8000-000000000090";
const STORE_C = "10000000-0000-4000-8000-000000000091";
const PRINCIPAL_A = "20000000-0000-4000-8000-000000000089";
const PRINCIPAL_C = "20000000-0000-4000-8000-000000000091";
const MEMBERSHIP_A = "30000000-0000-4000-8000-000000000089";
const MEMBERSHIP_C = "30000000-0000-4000-8000-000000000091";
const NOW = "2026-08-05T12:00:00.000Z";
const TOTAL = 10;
let completed = 0;

function executable(name) {
  const directories = [process.env.POSTGRES_BIN, ...(process.env.PATH ?? "").split(path.delimiter)];
  try {
    directories.push(...readdirSync(path.join(homedir(), ".codex", "tmp"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^postgresql-16[.]/.test(entry.name))
      .map((entry) => path.join(homedir(), ".codex", "tmp", entry.name, "bin")));
  } catch { /* bundled PostgreSQL is optional */ }
  for (const directory of directories) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* continue */ }
  }
  return null;
}

function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    input,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}

function start() {
  assertSafeEnvironment();
  const tools = Object.fromEntries([...new Set(REQUIRED_NATIVE_TOOLS)].map((name) => [name, executable(name)]));
  if (Object.values(tools).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const root = mkdtempSync("/tmp/celebix-order-email-");
  const data = path.join(root, "data"), socket = path.join(root, "socket");
  const port = 20_000 + Math.floor(Math.random() * 15_000);
  mkdirSync(socket, { mode: 0o700 });
  command(tools.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(tools.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { tools, root, data, socket, port };
}

function stop(box) {
  if (!box) return;
  command(box.tools.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], "", true);
  rmSync(box.root, { recursive: true, force: true });
}

function psql(box, source, database = DB, allowFailure = false) {
  return command(box.tools.psql, [
    "-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], source, allowFailure);
}

function psqlAsync(box, source) {
  return new Promise((resolve, reject) => {
    const child = spawn(box.tools.psql, [
      "-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
      "-U", "postgres", "-d", DB,
    ], { cwd: ROOT, env: { ...process.env, LC_ALL: "C", LANG: "C" } });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => status === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr)));
    child.stdin.end(source);
  });
}

function apply(box, file, database = DB) {
  return psql(box, readFileSync(path.join(SQL, file), "utf8"), database);
}

function applyBase(box) {
  const accepted = /(?:[.]up|[.]seed|[.]freeze|_grants|_assertions|catalog_assertions)[.]sql$/;
  const files = readdirSync(SQL).filter((file) => {
    const sequence = Number.parseInt(file.slice(8, 12), 10);
    return Number.isSafeInteger(sequence) && sequence <= 71 && accepted.test(file) && !file.includes(".down.");
  }).sort((left, right) => {
    const sequence = Number.parseInt(left.slice(8, 12), 10) - Number.parseInt(right.slice(8, 12), 10);
    const weight = (file) => file.includes("assertions") ? 3 : file.includes("freeze") || file.includes("grants") ? 2 : 1;
    return sequence || weight(left) - weight(right) || left.localeCompare(right);
  });
  for (const file of files) apply(box, file);
}

function scenario(name, callback) {
  callback();
  completed += 1;
  process.stdout.write(`PASS ${completed}/${TOTAL} ${name}\n`);
}

async function scenarioAsync(name, callback) {
  await callback();
  completed += 1;
  process.stdout.write(`PASS ${completed}/${TOTAL} ${name}\n`);
}

function envelope(result) {
  const value = result.stdout.trim().split("\n").at(-1);
  return value ? JSON.parse(value) : null;
}

function workflow(box, expression) {
  return envelope(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_workflow;
    SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${expression};COMMIT;`));
}

function admin(box, expression) {
  return envelope(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_app;
    SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${expression};COMMIT;`));
}

function authority(store = STORE_A) {
  return `'${store}'::uuid,'${PRINCIPAL_A}'::uuid,'${MEMBERSHIP_A}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${NOW}'::timestamptz`;
}

function orderSql({ id, store = STORE_A, source = "storefront", payment = "pending", number = id.slice(-6) }) {
  return `INSERT INTO saas.orders(
    id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,
    shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at
  ) VALUES('${id}','${store}','CX-${number}','${source}','Ada Lovelace','ada@example.test','TRY',12000,0,0,12000,
    'pending','${payment}','{}',1,'${NOW}','${NOW}');`;
}

function eventSql({ id, order, store = STORE_A, type = "order_created", from = null, to = null }) {
  return `INSERT INTO saas.order_events(id,store_id,order_id,event_type,from_value,to_value,message,payload,created_at)
    VALUES('${id}','${store}','${order}','${type}',${from ? `'${from}'` : "NULL"},${to ? `'${to}'` : "NULL"},
      'Email harness event','{}','${NOW}');`;
}

function seed(box) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
      ('${PRINCIPAL_A}','https://identity.example.test/oidc','order-email-owner','owner89@example.test',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
      ('${STORE_A}','Güzide Kuyumcu','order-email-a','active','tr','TRY','hemenaku','2026-01-01','2026-01-01'),
      ('${STORE_B}','İkinci Mağaza','order-email-b','active','tr','TRY','hemenaku','2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
      ('${MEMBERSHIP_A}','${PRINCIPAL_A}','${STORE_A}','store_owner','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
      ('40000000-0000-4000-8000-000000000089','${STORE_A}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01'),
      ('40000000-0000-4000-8000-000000000090','${STORE_B}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
    INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES
      ('50000000-0000-4000-8000-000000000089','${STORE_A}','order-email-a.saas-staging.celebix.site','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1),
      ('50000000-0000-4000-8000-000000000090','${STORE_B}','order-email-b.saas-staging.celebix.site','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
    INSERT INTO saas.admin_domains(id,store_id,hostname,kind,status,canonical,verified_at,version,created_at,updated_at) VALUES
      ('60000000-0000-4000-8000-000000000089','${STORE_A}','order-email-a.admin.saas-staging.celebix.site','platform_subdomain','active',true,'2026-01-01',1,'2026-01-01','2026-01-01'),
      ('60000000-0000-4000-8000-000000000090','${STORE_B}','order-email-b.admin.saas-staging.celebix.site','platform_subdomain','active',true,'2026-01-01',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at)
      VALUES('70000000-0000-4000-8000-000000000089','${STORE_A}','notification_setting','Sipariş bildirimleri',
        '{"emailEnabled":true,"senderLabel":"Güzide Kuyumcu","replyToEmail":"support@example.test"}',
        'active',1,'${NOW}','${NOW}');
    COMMIT;`);
}

async function main() {
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    applyBase(box);
    seed(box);
    apply(box, "202608010078_manual_order_drafts.up.sql");
    apply(box, "202608010079_manual_order_uuid_contract.up.sql");
    apply(box, "202608030081_storefront_design_workspace.up.sql");
    apply(box, UP);
    apply(box, ASSERTIONS);
    const migratedSetting = psql(box, `SELECT (config->>'orderNotificationsEnabled')||'|'||(config->>'notificationEmail')||'|'||version
      FROM saas.merchant_admin_records WHERE store_id='${STORE_A}' AND record_kind='notification_setting';`).stdout.trim();
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;DELETE FROM saas.merchant_admin_records
      WHERE store_id='${STORE_A}' AND record_kind='notification_setting';COMMIT;`);
    psql(box, `CREATE DATABASE ${EMPTY} TEMPLATE ${DB};`, "postgres");
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
      INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at)
      VALUES('70000000-0000-4000-8000-000000000089','${STORE_A}','notification_setting','Sipariş bildirimleri',
        '{"emailEnabled":true,"orderNotificationsEnabled":true,"notificationEmail":"orders@example.test","senderLabel":"Güzide Kuyumcu","replyToEmail":"support@example.test"}',
        'active',1,'${NOW}','${NOW}');
      INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
        ('${PRINCIPAL_C}','https://identity.example.test/oidc','order-email-new-owner','new-owner@example.test',true,'${NOW}','${NOW}');
      INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
        ('${STORE_C}','Yeni Mağaza','order-email-c','active','tr','TRY','hemenaku','${NOW}','${NOW}');
      INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
        ('${MEMBERSHIP_C}','${PRINCIPAL_C}','${STORE_C}','store_owner','active','${NOW}','${NOW}');
      COMMIT;`);
    const seededSetting = psql(box, `SELECT (config->>'orderNotificationsEnabled')||'|'||(config->>'notificationEmail')||'|'||
        (config->>'senderLabel')||'|'||(config->>'replyToEmail')
      FROM saas.merchant_admin_records WHERE store_id='${STORE_C}' AND record_kind='notification_setting';`).stdout.trim();

    scenario("PostgreSQL 16 installs the private outbox contract", () => {
      assert.match(psql(box, "SHOW server_version;").stdout, /^16[.]/);
      assert.equal(psql(box, "SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='saas.order_email_deliveries'::regclass;").stdout.trim(), "t");
      assert.equal(migratedSetting, "true|support@example.test|2");
      assert.equal(seededSetting, "true|new-owner@example.test|Yeni Mağaza|new-owner@example.test");
    });

    const storefront = "80000000-0000-4000-8000-000000000089";
    const paid = "80000000-0000-4000-8000-000000000090";
    const manual = "80000000-0000-4000-8000-000000000091";
    const imported = "80000000-0000-4000-8000-000000000092";
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
      ${orderSql({ id: storefront })}${eventSql({ id: "81000000-0000-4000-8000-000000000089", order: storefront })}
      ${orderSql({ id: paid, payment: "completed" })}${eventSql({ id: "81000000-0000-4000-8000-000000000090", order: paid })}
      ${orderSql({ id: manual, source: "manual" })}${eventSql({ id: "81000000-0000-4000-8000-000000000091", order: manual })}
      ${orderSql({ id: imported, source: "manual_import" })}${eventSql({ id: "81000000-0000-4000-8000-000000000092", order: imported })}
      COMMIT;`);
    scenario("source and already-paid matrix emits only approved logical emails", () => {
      assert.equal(psql(box, `SELECT string_agg(event_type||':'||recipient_kind,',' ORDER BY event_type,recipient_kind)
        FROM saas.order_email_deliveries WHERE order_id='${storefront}';`).stdout.trim(), "merchant_new_order:merchant,order_received:customer");
      assert.equal(psql(box, `SELECT string_agg(event_type,',' ORDER BY event_type) FROM saas.order_email_deliveries WHERE order_id='${paid}';`).stdout.trim(), "merchant_new_order,order_received,payment_completed");
      assert.equal(psql(box, `SELECT string_agg(event_type,',' ORDER BY event_type) FROM saas.order_email_deliveries WHERE order_id='${manual}';`).stdout.trim(), "order_received");
      assert.equal(psql(box, `SELECT count(*) FROM saas.order_email_deliveries WHERE order_id='${imported}';`).stdout.trim(), "0");
    });

    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
      ${eventSql({ id: "82000000-0000-4000-8000-000000000089", order: storefront, type: "status_transition", from: "preparing", to: "shipped" })}
      ${eventSql({ id: "82000000-0000-4000-8000-000000000090", order: storefront, type: "status_transition", from: "shipped", to: "delivered" })}
      ${eventSql({ id: "82000000-0000-4000-8000-000000000091", order: storefront, type: "status_transition", from: "delivered", to: "cancelled" })}
      ${eventSql({ id: "82000000-0000-4000-8000-000000000092", order: storefront, type: "payment_transition", from: "pending", to: "completed" })}
      ${eventSql({ id: "82000000-0000-4000-8000-000000000093", order: storefront, type: "payment_transition", from: "completed", to: "refunded" })}
      COMMIT;`);
    scenario("status and payment transitions map without preparing mail", () => {
      assert.equal(psql(box, `SELECT string_agg(event_type,',' ORDER BY event_type) FROM saas.order_email_deliveries
        WHERE order_id='${storefront}' AND recipient_kind='customer';`).stdout.trim(),
      "order_cancelled,order_delivered,order_received,order_shipped,payment_completed,refund_completed");
    });

    const replayOrder = "80000000-0000-4000-8000-000000000093";
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;${orderSql({ id: replayOrder })}COMMIT;`);
    await scenarioAsync("concurrent replay creates one row per logical email", async () => {
      const insert = (id) => `BEGIN;SET LOCAL ROLE celebix_saas_owner;${eventSql({ id, order: replayOrder })}COMMIT;`;
      await Promise.all([
        psqlAsync(box, insert("83000000-0000-4000-8000-000000000089")),
        psqlAsync(box, insert("83000000-0000-4000-8000-000000000090")),
      ]);
      assert.equal(psql(box, `SELECT count(*) FROM saas.order_email_deliveries WHERE order_id='${replayOrder}' AND event_type='order_received';`).stdout.trim(), "1");
      assert.equal(psql(box, `SELECT count(*) FROM saas.order_email_deliveries WHERE order_id='${replayOrder}' AND event_type='merchant_new_order';`).stdout.trim(), "1");
    });

    const rolledBack = "80000000-0000-4000-8000-000000000094";
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;${orderSql({ id: rolledBack })}${eventSql({ id: "84000000-0000-4000-8000-000000000089", order: rolledBack })}ROLLBACK;`);
    scenario("commerce rollback removes the outbox work atomically", () => {
      assert.equal(psql(box, `SELECT count(*) FROM saas.orders WHERE id='${rolledBack}';`).stdout.trim(), "0");
      assert.equal(psql(box, `SELECT count(*) FROM saas.order_email_deliveries WHERE order_id='${rolledBack}';`).stdout.trim(), "0");
    });

    psql(box, "BEGIN;SET LOCAL ROLE celebix_saas_owner;DELETE FROM saas.order_email_deliveries;COMMIT;");
    const leasedOrder = "80000000-0000-4000-8000-000000000095";
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;${orderSql({ id: leasedOrder, source: "manual" })}${eventSql({ id: "85000000-0000-4000-8000-000000000089", order: leasedOrder })}COMMIT;`);
    const firstLease = "86000000-0000-4000-8000-000000000089";
    const secondLease = "86000000-0000-4000-8000-000000000090";
    const firstClaim = workflow(box, `saas.order_email_work_claim('worker_a','${NOW}','2026-08-05T12:01:00Z',1,'${firstLease}')`);
    const secondClaim = workflow(box, `saas.order_email_work_claim('worker_b','2026-08-05T12:02:00Z','2026-08-05T12:03:00Z',1,'${secondLease}')`);
    scenario("expired lease is reclaimed with the same deterministic request key", () => {
      assert.equal(firstClaim.outcome, "claimed");
      assert.equal(secondClaim.outcome, "claimed");
      assert.equal(firstClaim.result.items[0].deliveryId, secondClaim.result.items[0].deliveryId);
      assert.equal(firstClaim.result.items[0].idempotencyKey, secondClaim.result.items[0].idempotencyKey);
      assert.equal(secondClaim.result.items[0].attemptCount, 2);
    });

    scenario("tenant admin authority cannot cross stores and has no direct table grant", () => {
      assert.equal(admin(box, `saas.order_email_admin_list(${authority()},'${leasedOrder}')`).outcome, "listed");
      assert.equal(admin(box, `saas.order_email_admin_list(${authority(STORE_B)},'${leasedOrder}')`).outcome, "membership_denied");
      assert.notEqual(psql(box, "SET ROLE celebix_saas_app;SELECT count(*) FROM saas.order_email_deliveries;", DB, true).status, 0);
    });

    const delivery = secondClaim.result.items[0].deliveryId;
    const providerId = "resend-message-089";
    const early = workflow(box, `saas.order_email_provider_event_record('svix-089','${providerId}','delivered','2026-08-05T12:02:10Z','2026-08-05T12:02:11Z',NULL)`);
    workflow(box, `saas.order_email_work_seal('${delivery}','${secondLease}','worker_b','2026-08-05T12:02:00Z','order_email_01',
      decode('${"ab".repeat(64)}','hex'),'${"a".repeat(64)}','${"b".repeat(64)}','a•••@example.test',
      '2026-08-05T12:02:00Z','2026-08-06T12:02:00Z')`);
    const accepted = workflow(box, `saas.order_email_work_accept('${delivery}','${secondLease}','worker_b','2026-08-05T12:02:12Z','${providerId}')`);
    const replay = workflow(box, `saas.order_email_provider_event_record('svix-089','${providerId}','delivered','2026-08-05T12:02:10Z','2026-08-05T12:02:13Z',NULL)`);
    scenario("early signed provider receipt reconciles and replay is idempotent", () => {
      assert.equal(early.outcome, "recorded");
      assert.equal(accepted.outcome, "accepted");
      assert.equal(replay.outcome, "operation_replayed");
      assert.equal(psql(box, `SELECT status FROM saas.order_email_deliveries WHERE id='${delivery}';`).stdout.trim(), "delivered");
      assert.equal(psql(box, "SELECT count(*) FROM saas.order_email_provider_events WHERE provider_event_id='svix-089';").stdout.trim(), "1");
    });

    scenario("down migration blocks live evidence", () => {
      const blocked = psql(box, readFileSync(path.join(SQL, DOWN), "utf8"), DB, true);
      assert.notEqual(blocked.status, 0);
      assert.match(blocked.stderr, /ORDER_TRANSACTIONAL_EMAIL_DOWN_BLOCKED/u);
    });

    scenario("empty guarded down and reapply preserve the contract", () => {
      apply(box, DOWN, EMPTY);
      assert.equal(psql(box, "SELECT to_regclass('saas.order_email_deliveries') IS NULL;", EMPTY).stdout.trim(), "t");
      apply(box, UP, EMPTY);
      apply(box, ASSERTIONS, EMPTY);
    });

    assert.equal(completed, TOTAL);
    process.stdout.write(`${TOTAL}/${TOTAL} PASS\n`);
  } finally {
    stop(box);
  }
}

await main();
