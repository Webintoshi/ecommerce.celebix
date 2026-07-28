import assert from "node:assert/strict";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;
const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "quick_order_hosted_bridge";
const ROLLBACK_DB = "quick_order_hosted_bridge_rollback";
const UP = "202607280058_quick_order_hosted_payment_bridge.up.sql";
const DOWN = "202607280058_quick_order_hosted_payment_bridge.down.sql";
const ASSERTIONS = "202607280058_quick_order_hosted_payment_bridge_assertions.sql";
const prior = JSON.parse(readFileSync(path.join(SQL, "phase3p-quick-order-hosted-payment-authority-manifest.json"), "utf8"));
const PRIOR_FIXTURE = readFileSync(path.join(ROOT, "tests/saas-phase3/quick-order-hosted-payment-authority/fixture.sql"), "utf8");
const FIXTURE = readFileSync(path.join(import.meta.dirname, "fixture.sql"), "utf8");
const STORE = "10000000-0000-4000-8000-000000000057";
const PRINCIPAL = "20000000-0000-4000-8000-000000000057";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000057";
const PLAN = "00000000-0000-4000-8000-000000000001";
const METHOD = "50000000-0000-4000-8000-000000000057";
const VARIANT = "41000000-0000-4000-8000-000000000057";
const HOST = "hosted-a.example.com";
const NOW = "2026-07-28T12:00:00.000Z";
const TOTAL = 14;
let completed = 0;

const envelope = (key) => `{"algorithm":"A256GCM","ciphertext":"AQ","iv":"AAAAAAAAAAAAAAAA","keyId":"${key}","tag":"AAAAAAAAAAAAAAAAAAAAAA","version":1}`;
const address = `{"recipientName":"Ada Lovelace","phone":"+905551112233","line1":"Test 1","city":"Istanbul","postalCode":"34710","country":"TR"}`;
function bin(name) { const selected = path.join(PG, name); accessSync(selected, constants.X_OK); return selected; }
function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, { cwd: ROOT, input, encoding: "utf8", env: { ...process.env, LC_ALL: "C", LANG: "C" }, maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}
function start() {
  const root = mkdtempSync("/tmp/celebix-quick-hosted-bridge-");
  const data = path.join(root, "data"); const socket = path.join(root, "socket");
  const port = 27000 + Math.floor(Math.random() * 1000); mkdirSync(socket, { mode: 0o700 });
  command(bin("initdb"), ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(bin("pg_ctl"), ["-D", data, "-o", `-k ${socket} -p ${port}`, "-l", path.join(root, "postgres.log"), "start"]);
  return { root, data, socket, port };
}
function stop(box) { if (box) command(bin("pg_ctl"), ["-D", box.data, "-m", "fast", "stop"], "", true); }
function sql(box, input, database = DB, allowFailure = false) {
  return command(bin("psql"), ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], input, allowFailure);
}
function apply(box, file, database = DB) { sql(box, readFileSync(path.join(SQL, file), "utf8"), database); }
function pass(label, callback) { callback(); completed += 1; process.stdout.write(`PASS ${completed}/${TOTAL} ${label}\n`); }
async function passAsync(label, callback) { await callback(); completed += 1; process.stdout.write(`PASS ${completed}/${TOTAL} ${label}\n`); }
function client(box, applicationName) { return new Client({ host: box.socket, port: box.port, user: "postgres", database: DB, application_name: applicationName }); }
function suffix(ordinal) { return String(ordinal).padStart(12, "0"); }
function linkId(ordinal) { return `60000000-0000-4000-8000-${suffix(ordinal)}`; }
function sessionId(ordinal) { return `61000000-0000-4000-8000-${suffix(ordinal)}`; }
function attemptId(ordinal) { return `70000000-0000-4000-8000-${suffix(ordinal)}`; }
function redemptionDigest(ordinal) { return String.fromCharCode(96 + ordinal).repeat(64); }
function hosted(ordinal, quantity = 1) {
  const selected = suffix(ordinal);
  return `SET ROLE celebix_saas_app; SELECT outcome FROM saas.quick_links_create_hosted(
    '${STORE}','${PRINCIPAL}','${MEMBERSHIP}','${PLAN}','free_starter',1,'${NOW}',
    '${linkId(ordinal)}',ARRAY['80000000-0000-4000-8000-${selected}'::uuid],ARRAY['${VARIANT}'::uuid],
    ARRAY[${quantity}]::bigint[],'${METHOD}','${"a".repeat(64)}',ARRAY['PHYSICAL']::text[],
    'identity.current','${envelope("identity.current")}'::jsonb,'Ada Lovelace','ada@example.com','+905551112233',
    '${address}'::jsonb,'${address}'::jsonb,NULL,'hosted',0,0,24,
    '${String(ordinal).slice(-1).repeat(64)}','quick.current','${envelope("quick.current")}'::jsonb,
    '90000000-0000-4000-8000-${selected}','${String(ordinal + 1).slice(-1).repeat(64)}');`;
}
function claim(ordinal) {
  return `SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.quick_links_claim_redemption(
    '${HOST}','${String(ordinal).slice(-1).repeat(64)}','${sessionId(ordinal)}','${redemptionDigest(ordinal)}',
    '${NOW}','2026-07-28T12:15:00Z');`;
}
function legacy() {
  return `SET ROLE celebix_saas_app; SELECT outcome FROM saas.quick_links_create(
    '${STORE}','${PRINCIPAL}','${MEMBERSHIP}','${PLAN}','free_starter',1,'${NOW}',
    '68000000-0000-4000-8000-000000000090',ARRAY['88000000-0000-4000-8000-000000000090'::uuid],
    ARRAY['${VARIANT}'::uuid],ARRAY[1]::bigint[],'52000000-0000-4000-8000-000000000057',
    'Legacy','legacy@example.com','+905551112233','${address}'::jsonb,'${address}'::jsonb,NULL,'legacy',
    0,0,24,'${"9".repeat(64)}','quick.current','${envelope("quick.current")}'::jsonb,
    '98000000-0000-4000-8000-000000000090','${"8".repeat(64)}');`;
}
function claimLegacy() {
  return `SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.quick_links_claim_redemption(
    '${HOST}','${"9".repeat(64)}','67000000-0000-4000-8000-000000000090','${"9".repeat(64)}',
    '${NOW}','2026-07-28T12:15:00Z');`;
}
function createAndClaim(box, ordinal, quantity = 1) {
  assert.equal(sql(box, hosted(ordinal, quantity)).stdout.trim(), "committed");
  assert.equal(sql(box, claim(ordinal)).stdout.trim(), "claimed");
}
function authorityDigest(box, ordinal) {
  const selected = sql(box, `SET ROLE celebix_saas_workflow; SELECT result_payload->>'authorityDigest'
    FROM saas.quick_order_hosted_payment_authority('${HOST}','${redemptionDigest(ordinal)}','${NOW}');`).stdout.trim();
  assert.match(selected, /^[a-f0-9]{64}$/);
  return selected;
}
function begin(box, ordinal, attemptOrdinal = ordinal, now = NOW) {
  const digest = authorityDigest(box, ordinal);
  return sql(box, `SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.quick_order_hosted_payment_begin(
    '${HOST}','${redemptionDigest(ordinal)}','${attemptId(attemptOrdinal)}','${"f".repeat(64)}',
    '${String(attemptOrdinal).slice(-1).repeat(64)}','${digest}','${now}');`).stdout.trim();
}
function markInitialized(box, ordinal, status = "awaiting_customer") {
  return sql(box, `SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.payment_attempt_mark_initialized(
    '${attemptId(ordinal)}','72000000-0000-4000-8000-${suffix(ordinal)}','${"e".repeat(64)}',1,1,
    '${status}','provider-${ordinal}','iframe_ready','2026-07-28T12:01:00Z');`).stdout.trim();
}
function callback(box, ordinal, status = "captured", operationOrdinal = ordinal) {
  return sql(box, `SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.payment_attempt_apply_hosted_callback(
    'iyzico_iframe','${String(ordinal).slice(-1).repeat(64)}','73000000-0000-4000-8000-${suffix(operationOrdinal)}',
    '${"d".repeat(64)}','${"c".repeat(64)}',2,1,'${status}','provider-${ordinal}','${status === "captured" ? "payment_captured" : "payment_failed"}',
    12500,'TRY','2026-07-28T12:02:00Z');`).stdout.trim();
}

async function main() {
  let box;
  try {
    box = start();
    sql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const { file } of prior.migrationChain) apply(box, file);
    sql(box, `CREATE DATABASE ${ROLLBACK_DB} TEMPLATE ${DB};`, "postgres");
    sql(box, PRIOR_FIXTURE); sql(box, FIXTURE); apply(box, UP); apply(box, ASSERTIONS);

    pass("PostgreSQL 16 up, assertions, forced RLS, ACL and preflight pass", () => {
      assert.match(sql(box, "SHOW server_version;").stdout.trim(), /^16[.]/);
      assert.equal(sql(box, "SET ROLE celebix_saas_workflow; SELECT saas.quick_order_hosted_payment_bridge_preflight();").stdout.trim(), "t");
      assert.equal(sql(box, `BEGIN;
        ALTER TABLE saas.payment_attempts DISABLE TRIGGER payment_attempt_quick_order_terminal;
        SELECT saas.quick_order_hosted_payment_bridge_preflight();
        ROLLBACK;`).stdout.trim(), "f");
      assert.notEqual(sql(box, "SET ROLE celebix_saas_app; SELECT * FROM saas.quick_order_hosted_payment_bridges;", DB, true).status, 0);
    });
    pass("authority is host redemption method profile identity basket and total derived", () => {
      createAndClaim(box, 1);
      const value = sql(box, `SET ROLE celebix_saas_workflow; SELECT outcome||'|'||(result_payload->>'providerCode')||'|'||
        (result_payload->>'amountMinor')||'|'||(result_payload->'basket'->0->>'itemType')
        FROM saas.quick_order_hosted_payment_authority('${HOST}','${redemptionDigest(1)}','${NOW}');`).stdout.trim();
      assert.equal(value, "found|iyzico_iframe|12500|PHYSICAL");
    });
    pass("an ineligible linked item rejects the whole basket instead of silently dropping it", () => {
      sql(box, `UPDATE saas.products SET status='draft',version=version+1,updated_at='2026-07-28T12:00:01Z' WHERE id='40000000-0000-4000-8000-000000000057';`);
      assert.equal(sql(box, `SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.quick_order_hosted_payment_authority(
        '${HOST}','${redemptionDigest(1)}','2026-07-28T12:00:02Z');`).stdout.trim(), "not_found");
      sql(box, `UPDATE saas.products SET status='active',version=version+1,updated_at='2026-07-28T12:00:03Z' WHERE id='40000000-0000-4000-8000-000000000057';`);
    });
    pass("generic attempt and its exact stock reservation are created atomically", () => {
      assert.equal(begin(box, 1), "created");
      assert.equal(sql(box, `SELECT attempt.status||'|'||bridge.status||'|'||reservation.status||'|'||
        (reservation.attempt_id IS NULL)::text||'|'||(reservation.payment_attempt_id=attempt.id)::text
        FROM saas.payment_attempts attempt JOIN saas.quick_order_hosted_payment_bridges bridge ON bridge.attempt_id=attempt.id
        JOIN saas.checkout_inventory_reservations reservation ON reservation.payment_attempt_id=attempt.id
        WHERE attempt.id='${attemptId(1)}';`).stdout.trim(), "created|active|held|true|true");
    });
    pass("exact operation replays while second hosted operation is rejected", () => {
      assert.equal(begin(box, 1), "operation_replayed");
      assert.equal(begin(box, 1, 2), "attempt_in_progress");
      assert.equal(sql(box, `SELECT count(*)||'|'||(SELECT count(*) FROM saas.checkout_inventory_reservations WHERE payment_attempt_id IS NOT NULL)
        FROM saas.payment_attempts;`).stdout.trim(), "1|1");
    });
    pass("awaiting-customer abandonment keeps the hold and becomes a reconciliation candidate", () => {
      assert.equal(markInitialized(box, 1), "awaiting_customer");
      assert.equal(sql(box, `SET ROLE celebix_saas_workflow; SELECT saas.quick_order_hosted_payment_expire_created(
        '2026-07-28T12:06:00Z',10);`).stdout.trim(), "0");
      assert.equal(sql(box, `SET ROLE celebix_saas_workflow; SELECT attempt_status||'|'||attempt_version FROM
        saas.quick_order_hosted_payment_reconciliation_candidates('2026-07-28T12:06:00Z',10);`).stdout.trim(), "awaiting_customer|2");
      assert.equal(sql(box, `SELECT attempt.status||'|'||reservation.status FROM saas.payment_attempts attempt
        JOIN saas.checkout_inventory_reservations reservation ON reservation.payment_attempt_id=attempt.id
        WHERE attempt.id='${attemptId(1)}';`).stdout.trim(), "awaiting_customer|held");
    });
    pass("captured callback atomically creates one order, consumes stock and pays the link", () => {
      assert.equal(callback(box, 1), "captured");
      assert.equal(sql(box, `SELECT attempt.status||'|'||bridge.status||'|'||link.status||'|'||reservation.status||'|'||
        variant.stock_quantity||'|'||(SELECT count(*) FROM saas.orders WHERE quick_order_link_id=link.id)||'|'||
        (SELECT count(*) FROM saas.order_items WHERE order_id=bridge.order_id)||'|'||
        (SELECT count(*) FROM saas.order_events WHERE order_id=bridge.order_id)
        FROM saas.payment_attempts attempt JOIN saas.quick_order_hosted_payment_bridges bridge ON bridge.attempt_id=attempt.id
        JOIN saas.quick_order_links link ON link.id=bridge.quick_order_link_id
        JOIN saas.checkout_inventory_reservations reservation ON reservation.payment_attempt_id=attempt.id
        JOIN saas.product_variants variant ON variant.id=reservation.variant_id WHERE attempt.id='${attemptId(1)}';`).stdout.trim(),
      "captured|captured|paid|consumed|19|1|1|1");
    });
    pass("callback replay cannot duplicate order event or decrement", () => {
      assert.equal(callback(box, 1), "operation_replayed");
      assert.equal(sql(box, `SELECT stock_quantity||'|'||(SELECT count(*) FROM saas.orders)||'|'||
        (SELECT count(*) FROM saas.order_events) FROM saas.product_variants WHERE id='${VARIANT}';`).stdout.trim(), "19|1|1");
    });
    pass("terminal initialization failure releases without creating an order", () => {
      createAndClaim(box, 3); assert.equal(begin(box, 3), "created");
      assert.equal(markInitialized(box, 3, "failed"), "failed");
      assert.equal(sql(box, `SELECT bridge.status||'|'||reservation.status||'|'||(SELECT count(*) FROM saas.orders WHERE quick_order_link_id=bridge.quick_order_link_id)
        FROM saas.quick_order_hosted_payment_bridges bridge JOIN saas.checkout_inventory_reservations reservation
        ON reservation.payment_attempt_id=bridge.attempt_id WHERE bridge.attempt_id='${attemptId(3)}';`).stdout.trim(), "failed|released|0");
    });
    await passAsync("two simultaneous hosted begins serialize to one attempt and one reservation", async () => {
      createAndClaim(box, 4); const digest = authorityDigest(box, 4);
      const first = client(box, "bridge_begin_first"); const second = client(box, "bridge_begin_second");
      await Promise.all([first.connect(), second.connect()]);
      try {
        await Promise.all([first.query("SET ROLE celebix_saas_workflow"), second.query("SET ROLE celebix_saas_workflow")]);
        const execute = (session, ordinal) => session.query(`SELECT outcome FROM saas.quick_order_hosted_payment_begin(
          $1,$2,$3,$4,$5,$6,$7)`, [HOST, redemptionDigest(4), attemptId(ordinal), "b".repeat(64),
          String(ordinal).slice(-1).repeat(64), digest, new Date(NOW)]);
        const results = await Promise.all([execute(first, 4), execute(second, 5)]);
        assert.deepEqual(results.map(({ rows }) => rows[0].outcome).sort(), ["attempt_in_progress", "created"]);
        assert.equal(sql(box, `SELECT count(*)||'|'||(SELECT count(*) FROM saas.checkout_inventory_reservations reservation
          JOIN saas.quick_order_hosted_payment_bridges bridge ON bridge.attempt_id=reservation.payment_attempt_id
          WHERE bridge.quick_order_link_id='${linkId(4)}') FROM saas.quick_order_hosted_payment_bridges
          WHERE quick_order_link_id='${linkId(4)}';`).stdout.trim(), "1|1");
        const winner = sql(box, `SELECT attempt_id FROM saas.quick_order_hosted_payment_bridges
          WHERE quick_order_link_id='${linkId(4)}';`).stdout.trim();
        assert.match(winner, /^[0-9a-f-]{36}$/);
        assert.equal(sql(box, `SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.payment_attempt_mark_initialized(
          '${winner}','78000000-0000-4000-8000-000000000001','${"a".repeat(64)}',1,1,'failed',NULL,
          'race_released','2026-07-28T12:03:00Z');`).stdout.trim(), "failed");
      } finally { await Promise.all([first.end(), second.end()]); }
    });
    await passAsync("stock one legacy and hosted begin race admits exactly one durable hold", async () => {
      createAndClaim(box, 5);
      createAndClaim(box, 6);
      assert.equal(sql(box, legacy()).stdout.trim(), "committed");
      assert.equal(sql(box, claimLegacy()).stdout.trim(), "claimed");
      sql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
        SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);
        SELECT pg_catalog.set_config('saas.inventory.source_id','7a000000-0000-4000-8000-000000000001',true);
        SELECT pg_catalog.set_config('saas.inventory.source_time','2026-07-28T12:04:00Z',true);
        UPDATE saas.product_variants SET stock_quantity=1,version=version+1,updated_at='2026-07-28T12:04:00Z'
          WHERE id='${VARIANT}'; COMMIT;`);
      const digest = sql(box, `SET ROLE celebix_saas_workflow; SELECT result_payload->>'authorityDigest'
        FROM saas.quick_order_hosted_payment_authority('${HOST}','${redemptionDigest(5)}','2026-07-28T12:05:00Z');`).stdout.trim();
      const hostedSession = client(box, "hosted_stock_one"); const legacySession = client(box, "legacy_stock_one");
      await Promise.all([hostedSession.connect(), legacySession.connect()]);
      try {
        await Promise.all([hostedSession.query("SET ROLE celebix_saas_workflow"), legacySession.query("SET ROLE celebix_saas_workflow")]);
        const hostedBegin = hostedSession.query(`SELECT outcome FROM saas.quick_order_hosted_payment_begin(
          $1,$2,$3,$4,$5,$6,$7)`, [HOST, redemptionDigest(5), attemptId(50), "5".repeat(64), "57".repeat(32), digest,
          new Date("2026-07-28T12:05:00Z")]);
        const legacyBegin = legacySession.query(`SELECT outcome FROM saas.checkout_begin_attempt(
          $1,$2,$3,$4,$5,$6,$7)`, [HOST, "9".repeat(64), "79000000-0000-4000-8000-000000000090",
          "ab".repeat(16), "7b000000-0000-4000-8000-000000000090", "4".repeat(64), new Date("2026-07-28T12:05:00Z")]);
        const outcomes = (await Promise.all([hostedBegin, legacyBegin])).map(({ rows }) => rows[0].outcome).sort();
        assert.equal(outcomes.filter((outcome) => outcome === "stock_unavailable").length, 1, outcomes.join(","));
        assert.equal(outcomes.filter((outcome) => outcome === "created" || outcome === "committed").length, 1, outcomes.join(","));
        assert.equal(sql(box, `SELECT count(*) FROM saas.checkout_inventory_reservations
          WHERE variant_id='${VARIANT}' AND status='held';`).stdout.trim(), "1");
      } finally { await Promise.all([hostedSession.end(), legacySession.end()]); }
      sql(box, `SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.checkout_cleanup_pre_provider_attempts(
        '7c000000-0000-4000-8000-000000000001','7c000000-0000-4000-8000-000000000002','${"3".repeat(64)}',
        '2026-07-28T12:11:00Z',10);`);
      const activeGeneric = sql(box, `SELECT attempt_id FROM saas.quick_order_hosted_payment_bridges
        WHERE quick_order_link_id='${linkId(5)}' AND status='active';`).stdout.trim();
      if (activeGeneric) assert.equal(sql(box, `SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.payment_attempt_mark_initialized(
        '${activeGeneric}','7d000000-0000-4000-8000-000000000001','${"2".repeat(64)}',1,1,'failed',NULL,
        'race_released','2026-07-28T12:11:00Z');`).stdout.trim(), "failed");
      assert.equal(sql(box, `SELECT count(*) FROM saas.checkout_inventory_reservations WHERE status='held';`).stdout.trim(), "0");
    });
    await passAsync("captured callback observation and reconciliation finalize race create one order and decrement", async () => {
      const digest = sql(box, `SET ROLE celebix_saas_workflow; SELECT result_payload->>'authorityDigest'
        FROM saas.quick_order_hosted_payment_authority('${HOST}','${redemptionDigest(6)}','2026-07-28T12:11:30Z');`).stdout.trim();
      assert.match(digest, /^[a-f0-9]{64}$/);
      assert.equal(sql(box, `SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.quick_order_hosted_payment_begin(
        '${HOST}','${redemptionDigest(6)}','${attemptId(6)}','${"1".repeat(64)}','${"6".repeat(64)}','${digest}',
        '2026-07-28T12:11:30Z');`).stdout.trim(), "created");
      assert.equal(sql(box, `SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.payment_attempt_mark_initialized(
        '${attemptId(6)}','7e000000-0000-4000-8000-000000000001','${"0".repeat(64)}',1,1,'awaiting_customer',
        'provider-6','iframe_ready','2026-07-28T12:12:00Z');`).stdout.trim(), "awaiting_customer");
      assert.equal(sql(box, `SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.payment_attempt_mark_unknown(
        '${attemptId(6)}','7e000000-0000-4000-8000-000000000002','${"a".repeat(64)}',2,1,'provider-6',
        'provider_outcome_unknown','2026-07-28T12:12:15Z');`).stdout.trim(), "provider_outcome_unknown");
      assert.equal(sql(box, `SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.payment_attempt_claim_reconciliation(
        '${attemptId(6)}','7e000000-0000-4000-8000-000000000003','${"b".repeat(64)}',3,'worker.bridge',
        '7f000000-0000-4000-8000-000000000006','2026-07-28T12:12:30Z','2026-07-28T12:14:30Z',
        'test',1,'sha256:${"c".repeat(64)}');`).stdout.trim(), "claimed");
      const callbackSession = client(box, "captured_callback_race"); const reconcileSession = client(box, "captured_reconcile_race");
      await Promise.all([callbackSession.connect(), reconcileSession.connect()]);
      try {
        await Promise.all([callbackSession.query("SET ROLE celebix_saas_workflow"), reconcileSession.query("SET ROLE celebix_saas_workflow")]);
        const callbackResult = callbackSession.query(`SELECT outcome FROM saas.payment_attempt_apply_hosted_callback(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, ["iyzico_iframe", "6".repeat(64),
          "7f100000-0000-4000-8000-000000000006", "d".repeat(64), "e".repeat(64), 4, 1, "captured",
          "provider-6", "payment_captured", 12500, "TRY", new Date("2026-07-28T12:13:00Z")]);
        const reconcileResult = reconcileSession.query(`SELECT outcome FROM saas.payment_attempt_finalize_reconciliation(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [attemptId(6),
          "7f200000-0000-4000-8000-000000000006", "f".repeat(64), 4, "worker.bridge",
          "7f000000-0000-4000-8000-000000000006", 1, "captured", "provider-6", "payment_captured",
          12500, "TRY", new Date("2026-07-28T12:13:00Z")]);
        const outcomes = (await Promise.all([callbackResult, reconcileResult])).map(({ rows }) => rows[0].outcome);
        assert.equal(outcomes.includes("captured"), true);
        assert.equal(outcomes.filter((value) => value === "captured").length, 1);
        assert.equal(outcomes.some((value) => value === "processing" || value === "version_conflict"), true);
      } finally { await Promise.all([callbackSession.end(), reconcileSession.end()]); }
      assert.equal(sql(box, `SELECT attempt.status||'|'||bridge.status||'|'||reservation.status||'|'||variant.stock_quantity||'|'||
        (SELECT count(*) FROM saas.orders WHERE quick_order_link_id=bridge.quick_order_link_id)||'|'||
        (SELECT count(*) FROM saas.order_events WHERE order_id=bridge.order_id)
        FROM saas.payment_attempts attempt JOIN saas.quick_order_hosted_payment_bridges bridge ON bridge.attempt_id=attempt.id
        JOIN saas.checkout_inventory_reservations reservation ON reservation.payment_attempt_id=attempt.id
        JOIN saas.product_variants variant ON variant.id=reservation.variant_id WHERE attempt.id='${attemptId(6)}';`).stdout.trim(),
      "captured|captured|consumed|0|1|1");
    });
    pass("reconciliation candidates reject invalid time and bounds without widening", () => {
      assert.equal(sql(box, `SET ROLE celebix_saas_workflow; SELECT
        (SELECT count(*) FROM saas.quick_order_hosted_payment_reconciliation_candidates(NULL,10))||'|'||
        (SELECT count(*) FROM saas.quick_order_hosted_payment_reconciliation_candidates('infinity',10))||'|'||
        (SELECT count(*) FROM saas.quick_order_hosted_payment_reconciliation_candidates('${NOW}',0))||'|'||
        (SELECT count(*) FROM saas.quick_order_hosted_payment_reconciliation_candidates('${NOW}',101));`).stdout.trim(), "0|0|0|0");
    });
    pass("rollback requires drain and a clean rollback can reapply", () => {
      assert.notEqual(sql(box, readFileSync(path.join(SQL, DOWN), "utf8"), DB, true).status, 0);
      apply(box, UP, ROLLBACK_DB); apply(box, ASSERTIONS, ROLLBACK_DB); apply(box, DOWN, ROLLBACK_DB); apply(box, UP, ROLLBACK_DB); apply(box, ASSERTIONS, ROLLBACK_DB);
      assert.equal(sql(box, "SELECT saas.quick_order_hosted_payment_bridge_preflight();", ROLLBACK_DB).stdout.trim(), "t");
    });
    assert.equal(completed, TOTAL);
  } finally {
    stop(box);
    if (box?.root.startsWith("/tmp/celebix-quick-hosted-bridge-")) {
      rmSync(box.root, { recursive: true, force: true });
    }
  }
}

main().catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
