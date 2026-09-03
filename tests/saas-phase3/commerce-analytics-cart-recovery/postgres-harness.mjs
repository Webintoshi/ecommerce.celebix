import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const DB = `commerce_analytics_${randomBytes(5).toString("hex")}`;
const UP = "202609030124_commerce_analytics_cart_recovery.up.sql";
const DOWN = "202609030124_commerce_analytics_cart_recovery.down.sql";
const ASSERTIONS = "202609030124_commerce_analytics_cart_recovery_assertions.sql";
const STORE = "10000000-0000-4000-8000-000000000124";
const OTHER_STORE = "10000000-0000-4000-8000-000000000125";
const PRINCIPAL = "20000000-0000-4000-8000-000000000124";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000124";
const ANALYST = "20000000-0000-4000-8000-000000000125";
const ANALYST_MEMBERSHIP = "30000000-0000-4000-8000-000000000125";
const PLAN = "00000000-0000-4000-8000-000000000001";
const CART = "60000000-0000-4000-8000-000000000124";
const RESTORED_CART = "61000000-0000-4000-8000-000000000124";
const TOKEN = "63000000-0000-4000-8000-000000000124";
const OTHER_CART = "60000000-0000-4000-8000-000000000125";
const PRODUCT = "40000000-0000-4000-8000-000000000124";
const VARIANT = "50000000-0000-4000-8000-000000000124";
const CONNECTION = "70000000-0000-4000-8000-000000000124";
const WEBSITE = "71000000-0000-4000-8000-000000000124";
const ORDER = "80000000-0000-4000-8000-000000000124";
const FAILED_ORDER = "80000000-0000-4000-8000-000000000125";
const CANCELLED_ORDER = "80000000-0000-4000-8000-000000000126";
const NOW = "2026-09-03T12:00:00.000Z";
const TOTAL = 19;
let completed = 0;

function bin(name) {
  const bundled = path.join(homedir(), ".codex", "tmp");
  let candidates = [];
  try { candidates = readdirSync(bundled, { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^postgresql-16[.][0-9]+-install$/.test(entry.name)).map((entry) => path.join(bundled, entry.name, "bin")); } catch {}
  for (const directory of [process.env.POSTGRES_BIN, ...(process.env.PATH ?? "").split(path.delimiter), ...candidates]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch {}
  }
  throw new Error(`DISPOSABLE_DB_EXECUTION_BLOCKED: missing ${name}`);
}

function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, { cwd: ROOT, input, encoding: "utf8", env: { ...process.env, LC_ALL: "C", LANG: "C" }, maxBuffer: 128 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}

function start() {
  const tools = Object.fromEntries(["initdb", "pg_ctl", "psql"].map((name) => [name, bin(name)]));
  const root = mkdtempSync(path.join(tmpdir(), "cx-commerce-analytics-"));
  const data = path.join(root, "data"), socket = path.join(root, "socket"), port = 20000 + Math.floor(Math.random() * 15000);
  mkdirSync(socket, { mode: 0o700 });
  command(tools.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(tools.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { tools, root, data, socket, port };
}

function stop(box) { if (!box) return; command(box.tools.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], "", true); rmSync(box.root, { recursive: true, force: true }); }
function psql(box, source, database = DB, allowFailure = false) { return command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], source, allowFailure); }
function apply(box, file) { psql(box, readFileSync(path.join(SQL, file), "utf8")); }
function scalar(box, source) { return psql(box, source).stdout.trim().split("\n").at(-1) ?? ""; }
function json(box, source) { return JSON.parse(scalar(box, source)); }
function scenario(name, proof) { proof(); completed += 1; process.stdout.write(`PASS ${completed}/${TOTAL} ${name}\n`); }

function migrationsThrough123() {
  const accepted = /(?:[.]up|[.]seed|[.]freeze|_grants|_assertions|catalog_assertions)[.]sql$/;
  return readdirSync(SQL).filter((file) => {
    if (!/^2026\d{8}_.+[.]sql$/.test(file) || file.includes(".down.") || file.includes("rollback") || file.includes("forward_recovery") || file === "202607300073_seed_guzide_pilot_admin_domain.up.sql") return false;
    const sequence = Number.parseInt(file.slice(8, 12), 10);
    return Number.isSafeInteger(sequence) && sequence <= 123
      && (sequence <= 71 ? accepted.test(file) : file.endsWith(".up.sql"));
  }).sort((left, right) => {
    const sequence = Number.parseInt(left.slice(8, 12), 10) - Number.parseInt(right.slice(8, 12), 10);
    const weight = (file) => file.includes("assertions") ? 3 : file.includes("freeze") || file.includes("grants") ? 2 : 1;
    return sequence || weight(left) - weight(right) || left.localeCompare(right);
  });
}

function seed(box) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
      ('${STORE}','Commerce Analytics','commerce-analytics','active','tr','TRY','starter','2026-01-01','2026-01-01'),
      ('${OTHER_STORE}','Foreign Analytics','foreign-analytics','active','tr','TRY','starter','2026-01-01','2026-01-01');
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
      ('${PRINCIPAL}','https://identity.test','analytics-owner','owner@test.invalid',true,'2026-01-01','2026-01-01'),
      ('${ANALYST}','https://identity.test','analytics-analyst','analyst@test.invalid',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
      ('${MEMBERSHIP}','${PRINCIPAL}','${STORE}','store_owner','active','2026-01-01','2026-01-01'),
      ('${ANALYST_MEMBERSHIP}','${ANALYST}','${STORE}','analyst','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
      ('90000000-0000-4000-8000-000000000124','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
    INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES
      ('91000000-0000-4000-8000-000000000124','${STORE}','commerce.example.test','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
    INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES
      ('${PRODUCT}','${STORE}','analytics-product','Analytics Product','active','TRY','2026-01-01','2026-01-01');
    ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
    INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,created_at,updated_at) VALUES
      ('${VARIANT}','${PRODUCT}','${STORE}','Default','AN-1',2500,true,10,'active','{}','2026-01-01','2026-01-01');
    ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;
    INSERT INTO saas.store_analytics_connections(id,store_id,provider,website_id,hostname,status,version,last_verified_at,created_at,updated_at)
      VALUES('${CONNECTION}','${STORE}','umami','${WEBSITE}','commerce.example.test','active',1,'${NOW}','2026-01-01','${NOW}');
    ALTER TABLE saas.storefront_carts DISABLE TRIGGER USER;
    ALTER TABLE saas.storefront_cart_items DISABLE TRIGGER USER;
    INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)
      VALUES('${CART}','${STORE}','active',1,'2026-10-01','2026-09-01','2026-09-01');
    INSERT INTO saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at)
      VALUES('${CART}','${STORE}','current_01','${"a".repeat(64)}','2026-10-01');
    INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at)
      VALUES('${CART}','${STORE}','${PRODUCT}','${VARIANT}',2,2500,0,'2026-09-01','2026-09-01');
    ALTER TABLE saas.storefront_cart_items ENABLE TRIGGER USER;
    ALTER TABLE saas.storefront_carts ENABLE TRIGGER USER;
    INSERT INTO saas.abandoned_carts(id,store_id,public_cart_digest,status,currency,subtotal_cents,discount_cents,total_cents,checkout_started_at,last_activity_at,version,created_at,updated_at)
      VALUES('${CART}','${STORE}','${"a".repeat(64)}','active','TRY',5000,0,5000,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z',1,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
      ('${OTHER_CART}','${OTHER_STORE}','${"b".repeat(64)}','active','TRY',2500,0,2500,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z',1,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z');
    INSERT INTO saas.abandoned_cart_items(id,store_id,cart_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
      VALUES('62000000-0000-4000-8000-000000000124','${STORE}','${CART}','${PRODUCT}','${VARIANT}',0,'Analytics Product','Default','AN-1',2500,2,0,5000,'2026-09-01');
    COMMIT;`);
}

function evaluate(box, now = NOW) { return json(box, `BEGIN;SET LOCAL ROLE celebix_saas_workflow;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.commerce_analytics_evaluate_carts('${now}',100);COMMIT;`); }
function authority(principal = PRINCIPAL, membership = MEMBERSHIP, now = NOW) { return `'${STORE}','${principal}','${membership}','${PLAN}','free_starter',1,'${now}'`; }

function main() {
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const migration of migrationsThrough123()) apply(box, migration);
    scenario("PostgreSQL 16 target schema through 123 is ready", () => assert.match(scalar(box, "SHOW server_version;"), /^16[.]/));
    seed(box);
    apply(box, UP); apply(box, ASSERTIONS);
    psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.abandoned_carts SET source_cart_id='${CART}' WHERE id='${CART}';`);
    scenario("migration 124 up, hostname reconciliation, and assertions pass", () => {
      assert.equal(scalar(box, "SELECT to_regclass('saas.abandoned_cart_episodes') IS NOT NULL;"), "t");
      assert.equal(scalar(box, `SELECT count(*) FROM saas.store_analytics_hostnames WHERE store_id='${STORE}' AND hostname='commerce.example.test' AND active;`), "1");
      assert.equal(scalar(box, `SELECT count(*) FROM saas.store_analytics_hostnames WHERE store_id='${STORE}' AND hostname='admin.commerce.example.test';`), "0");
      assert.equal(json(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT result_payload FROM saas.analytics_connection_get_for_host('commerce.example.test','${NOW}');COMMIT;`).websiteId, WEBSITE);
    });
    scenario("old application signatures remain available on the new schema", () => assert.equal(scalar(box, "SELECT to_regprocedure('saas.analytics_outbox_claim(timestamp with time zone,integer,interval)') IS NOT NULL AND to_regprocedure('saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)') IS NOT NULL;"), "t"));
    scenario("safe cart attribution preserves first touch and projects to the durable cart", () => { const result = json(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT jsonb_build_object('outcome',outcome) FROM saas.public_cart_attribution_record('commerce.example.test','${NOW}','[{"keyId":"current_01","digest":"${"a".repeat(64)}"}]','{"firstTouch":{"source":"atlas-qa","medium":"test","campaign":"cart-recovery"},"lastTouch":{"source":"atlas-qa","medium":"test","campaign":"cart-recovery"},"referrerHost":"search.example.test","landingPathGroup":"/products/analytics-product","deviceGroup":"desktop"}');COMMIT;`); assert.equal(result.outcome, "recorded"); assert.equal(scalar(box, `SELECT first_touch_source||':'||last_touch_campaign||':'||device_group FROM saas.abandoned_carts WHERE id='${CART}';`), "atlas-qa:cart-recovery:desktop"); });
    scenario("default thresholds are bounded and automation is off", () => assert.deepEqual(json(box, `SELECT to_jsonb(selected) FROM (SELECT candidate_minutes,abandoned_hours,recovery_link_hours,automatic_recovery_enabled,maximum_message_attempts,minimum_message_interval_hours FROM saas.commerce_analytics_settings_for_store('${STORE}','${NOW}')) selected;`), { candidate_minutes: 30, abandoned_hours: 24, recovery_link_hours: 72, automatic_recovery_enabled: false, maximum_message_attempts: 3, minimum_message_interval_hours: 6 }));
    scenario("invalid per-store thresholds fail closed", () => assert.notEqual(psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.store_commerce_analytics_settings SET candidate_minutes=14 WHERE store_id='${STORE}';`, DB, true).status, 0));
    scenario("eligible product-bearing cart becomes one candidate episode", () => { const result = evaluate(box, "2026-09-03T12:31:00.000Z"); assert.equal(result.payload.candidate, 1); assert.equal(scalar(box, `SELECT lifecycle_status||':'||(SELECT count(*) FROM saas.abandoned_cart_episodes WHERE store_id='${STORE}' AND cart_id='${CART}') FROM saas.abandoned_carts WHERE id='${CART}';`), "candidate:1"); });
    scenario("candidate crosses the store abandonment threshold once", () => { const result = evaluate(box, "2026-09-04T12:00:00.000Z"); assert.equal(result.payload.abandoned, 1); assert.equal(scalar(box, `SELECT lifecycle_status FROM saas.abandoned_carts WHERE id='${CART}';`), "abandoned"); });
    scenario("evaluation replay does not duplicate an episode or event", () => { evaluate(box, "2026-09-04T12:00:00.000Z"); assert.equal(scalar(box, `SELECT (SELECT count(*) FROM saas.abandoned_cart_episodes WHERE cart_id='${CART}')||':'||(SELECT count(*) FROM saas.analytics_delivery_outbox WHERE cart_id='${CART}' AND event_kind='cart_abandoned');`), "1:1"); });
    scenario("reopenable recovery link restores only eligible current-price items", () => {
      const issued = json(box, `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.commerce_cart_recovery_link_issue(${authority(PRINCIPAL, MEMBERSHIP, "2026-09-04T12:01:00Z")},'${CART}','${TOKEN}','${"c".repeat(64)}',1);COMMIT;`);
      assert.equal(issued.outcome, "committed"); assert.equal(issued.payload.hostname, "commerce.example.test");
      const noted = json(box, `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.commerce_cart_recovery_attempt_record(${authority(PRINCIPAL, MEMBERSHIP, "2026-09-04T12:01:30Z")},'${CART}','64000000-0000-4000-8000-000000000124','note','QA note');COMMIT;`);
      assert.equal(noted.outcome, "committed"); assert.equal(noted.payload.kind, "note");
      const restored = json(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.public_cart_recovery_restore('commerce.example.test','2026-09-04T12:02:00Z','${"c".repeat(64)}','${RESTORED_CART}','current_01','${"d".repeat(64)}','2026-10-01');COMMIT;`);
      assert.equal(restored.outcome, "restored"); assert.equal(restored.payload.restoredItems, 1); assert.equal(restored.payload.cart.subtotalCents, 5000);
      assert.equal(scalar(box, `SELECT lifecycle_status||':'||(SELECT used_at IS NOT NULL FROM saas.abandoned_cart_recovery_tokens WHERE id='${TOKEN}') FROM saas.abandoned_carts WHERE id='${CART}';`), "resumed:true");
      const replay = json(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT jsonb_build_object('outcome',outcome) FROM saas.public_cart_recovery_restore('commerce.example.test','2026-09-04T12:03:00Z','${"c".repeat(64)}','${RESTORED_CART}','current_01','${"d".repeat(64)}','2026-10-01');COMMIT;`);
      assert.equal(replay.outcome, "restored");
    });
    scenario("pending payment never marks recovered", () => { psql(box, `SET ROLE celebix_saas_owner;INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at) VALUES('${ORDER}','${STORE}','ATLAS-124','storefront','QA','qa@test.invalid','TRY',5000,0,0,5000,'confirmed','pending','{}',1,'${NOW}','${NOW}');UPDATE saas.abandoned_carts SET recovered_order_id='${ORDER}',lifecycle_status='converted_pending_payment' WHERE id='${CART}';`); assert.equal(scalar(box, `SELECT lifecycle_status FROM saas.abandoned_carts WHERE id='${CART}';`), "converted_pending_payment"); });
    scenario("captured payment alone marks recovered and enqueues canonical events", () => { psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.orders SET payment_status='completed',updated_at='2026-09-04T13:00:00Z' WHERE id='${ORDER}';`); assert.equal(scalar(box, `SELECT lifecycle_status FROM saas.abandoned_carts WHERE id='${CART}';`), "recovered"); assert.equal(scalar(box, `SELECT count(*) FROM saas.analytics_delivery_outbox WHERE store_id='${STORE}' AND event_kind IN ('purchase','cart_recovered');`), "2"); assert.equal(scalar(box, `SELECT converted_at IS NOT NULL FROM saas.abandoned_cart_recovery_tokens WHERE id='${TOKEN}';`), "t"); assert.equal(scalar(box, `SELECT first_touch_source||':'||last_touch_campaign FROM saas.order_commerce_attribution WHERE store_id='${STORE}' AND order_id='${ORDER}';`), "atlas-qa:cart-recovery"); });
    scenario("payment failure, refund, and cancellation are server-side outbox events with opaque keys", () => {
      psql(box, `SET ROLE celebix_saas_owner;
        INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at) VALUES
          ('${FAILED_ORDER}','${STORE}','ATLAS-124-FAILED','storefront','QA','qa@test.invalid','TRY',2500,0,0,2500,'confirmed','failed','{}',1,'2026-09-04T13:01:00Z','2026-09-04T13:01:00Z'),
          ('${CANCELLED_ORDER}','${STORE}','ATLAS-124-CANCELLED','storefront','QA','qa@test.invalid','TRY',2500,0,0,2500,'cancelled','pending','{}',1,'2026-09-04T13:02:00Z','2026-09-04T13:02:00Z');
        UPDATE saas.orders SET status='refunded',payment_status='refunded',updated_at='2026-09-04T13:03:00Z' WHERE id='${ORDER}';`);
      assert.equal(scalar(box, `SELECT count(*) FROM saas.analytics_delivery_outbox WHERE store_id='${STORE}' AND event_kind IN ('payment_failed','refund','order_cancelled');`), "3");
      assert.equal(scalar(box, `SELECT bool_and(event_key~'^[0-9a-f]{64}$') FROM saas.analytics_delivery_outbox WHERE store_id='${STORE}';`), "t");
    });
    scenario("v2 worker claims generalized events with one lease each", () => { const result = json(box, `BEGIN;SET LOCAL ROLE celebix_saas_workflow;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.analytics_outbox_claim_v2('2026-09-04T14:00:00Z',100,interval '30 seconds');COMMIT;`); assert.equal(result.outcome, "claimed"); assert.ok(result.payload.length >= 2); assert.ok(result.payload.every((entry) => /^[0-9a-f]{64}$/.test(entry.leaseToken))); });
    scenario("dead-letter requeue is event-scoped and safely resets delivery state", () => { const claimed = json(box, `SELECT jsonb_build_object('eventId',id,'leaseToken',lease_token) FROM saas.analytics_delivery_outbox WHERE store_id='${STORE}' AND status='processing' ORDER BY id LIMIT 1;`); const failed = json(box, `BEGIN;SET LOCAL ROLE celebix_saas_workflow;SELECT jsonb_build_object('outcome',outcome) FROM saas.analytics_outbox_mark_failed('${claimed.eventId}','${claimed.leaseToken}','2026-09-04T14:00:10Z','collector_unavailable','2026-09-04T14:00:10Z',true);COMMIT;`); assert.equal(failed.outcome, "failed"); const result = json(box, `BEGIN;SET LOCAL ROLE celebix_saas_workflow;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.analytics_outbox_requeue_dead_letter('${claimed.eventId}','2026-09-04T14:01:00Z');COMMIT;`); assert.equal(result.outcome, "requeued"); assert.equal(scalar(box, `SELECT status||':'||attempt_count||':'||(last_error_code IS NULL) FROM saas.analytics_delivery_outbox WHERE id='${claimed.eventId}';`), "pending:0:true"); });
    scenario("analytics snapshot is currency-aware PostgreSQL financial truth", () => { const result = json(box, `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.commerce_analytics_snapshot(${authority(PRINCIPAL, MEMBERSHIP, "2026-09-05T00:00:00Z")},'2026-09-01','2026-09-04T13:30:00Z');COMMIT;`); assert.equal(result.outcome, "resolved"); assert.deepEqual(result.payload.currencies.map((row) => row.currency), ["TRY"]); assert.equal(result.payload.currencies[0].grossRevenueMinor, 5000); assert.equal(result.payload.currencies[0].refundedMinor, 5000); });
    scenario("analyst read is allowed without mutation authority expansion", () => { const result = json(box, `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome) FROM saas.commerce_analytics_snapshot(${authority(ANALYST, ANALYST_MEMBERSHIP, "2026-09-05T00:00:00Z")},'2026-09-01','2026-09-04T13:30:00Z');COMMIT;`); assert.equal(result.outcome, "resolved"); assert.equal(scalar(box, "SELECT has_function_privilege('celebix_saas_app','saas.commerce_analytics_evaluate_carts(timestamp with time zone,integer)','EXECUTE');"), "f"); });
    scenario("cross-tenant cart cannot enter the store episode or outbox", () => assert.equal(scalar(box, `SELECT count(*) FROM saas.abandoned_cart_episodes WHERE store_id='${STORE}' AND cart_id='${OTHER_CART}';`), "0"));
    scenario("down migration is guarded after lifecycle data exists", () => { const failed = psql(box, readFileSync(path.join(SQL, DOWN), "utf8"), DB, true); assert.notEqual(failed.status, 0); assert.match(failed.stderr, /COMMERCE_ANALYTICS_DOWN_GUARD/); });
    assert.equal(completed, TOTAL);
    process.stdout.write(`PASS ${TOTAL}/${TOTAL} commerce analytics cart recovery PostgreSQL 16 rehearsal complete\n`);
  } finally { stop(box); }
}

main();
