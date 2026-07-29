import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;
const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP = "202607280064_storefront_one_page_checkout.up.sql";
const DOWN = "202607280064_storefront_one_page_checkout.down.sql";
const ASSERTIONS = "202607280064_storefront_one_page_checkout_assertions.sql";
const REQUIRED = [UP, DOWN, ASSERTIONS];
const DB = "storefront_one_page_checkout";
const CLEAN_DOWN_DB = "storefront_one_page_checkout_clean_down";
const ROLLBACK_DB = "storefront_one_page_checkout_rollback";
const ROLLBACK_RACE_DB = "storefront_one_page_checkout_rollback_race";
const SHIPPING_GUARD_DB = "storefront_one_page_checkout_shipping_guard";
const RACE_DB = "storefront_one_page_checkout_race";
const PREFLIGHT_DB = "storefront_one_page_checkout_preflight";
const MAX_PAYLOAD_DB = "storefront_one_page_checkout_max_payload";
const BODY_TAMPER_DB = "storefront_one_page_checkout_body_tamper";
const PREFLIGHT_BODY_TAMPER_DB = "storefront_one_page_checkout_preflight_body_tamper";
const TRIGGER_TAMPER_DB = "storefront_one_page_checkout_trigger_tamper";
const PERSISTENCE_TAMPER_DB = "storefront_one_page_checkout_persistence_tamper";
const SETTLEMENT_TABLE_TAMPER_DB = "storefront_one_page_checkout_settlement_table_tamper";
const SETTLEMENT_TRIGGER_TAMPER_DB = "storefront_one_page_checkout_settlement_trigger_tamper";
const ROLE_TAMPER_DB = "storefront_one_page_checkout_role_tamper";
const BUILTIN_SETTLEMENT_DB = "storefront_one_page_checkout_builtin_settlement";
const HOSTED_SETTLEMENT_DB = "storefront_one_page_checkout_hosted_settlement";
const HOSTED_FAILURE_DB = "storefront_one_page_checkout_hosted_failure";
const METHOD_DENIAL_DB = "storefront_one_page_checkout_method_denial";
const BUILTIN_RACE_DB = "storefront_one_page_checkout_builtin_race";
const EMERGENCY_RACE_DB = "storefront_one_page_checkout_emergency_race";
const DISCOUNT_USAGE_RACE_DB = "storefront_one_page_checkout_discount_usage_race";
const HOSTED_SNAPSHOT_DB = "storefront_one_page_checkout_hosted_snapshot";
const HOSTED_CONFIG_DB = "storefront_one_page_checkout_hosted_config";
const HOSTED_RETRY_DB = "storefront_one_page_checkout_hosted_retry";
const HOSTED_IDENTITY_DB = "storefront_one_page_checkout_hosted_identity";
const HOSTED_PRECOLLISION_DB = "storefront_one_page_checkout_hosted_precollision";
const HOSTED_AUTHORITY_RACE_DB = "storefront_one_page_checkout_hosted_authority_race";
const HOSTED_PRICE_RACE_DB = "storefront_one_page_checkout_hosted_price_race";
const HOSTED_SNAPSHOT_TAMPER_DB = "storefront_one_page_checkout_hosted_snapshot_tamper";
const DOWN_CALLBACK_RACE_DB = "storefront_one_page_checkout_down_callback_race";
const QUICK_CHECKOUT_DOWN_RACE_DB = "storefront_one_page_checkout_quick_checkout_down_race";
const prior = JSON.parse(readFileSync(path.join(
  SQL,
  "phase3q-quick-order-hosted-payment-bridge-manifest.json",
), "utf8"));
const PROVIDER_FIXTURE = readFileSync(path.join(
  ROOT,
  "tests/saas-phase3/iyzico-iframe-tenant-activation-runtime/fixture.sql",
), "utf8");

const STORE_A = "10000000-0000-4000-8000-000000000061";
const STORE_B = "10000000-0000-4000-8000-000000000062";
const HOST_A = "store-a.test";
const HOST_B = "store-b.test";
const CART_A = "60000000-0000-4000-8000-000000000064";
const CART_A_DIGEST = "a".repeat(64);
const CART_B = "60000000-0000-4000-8000-000000000065";
const CART_B_DIGEST = "f".repeat(64);
const WRONG_DIGEST = "b".repeat(64);
const NONCE_1 = "c".repeat(64);
const NONCE_2 = "d".repeat(64);
const NONCE_3 = "e".repeat(64);
const PRODUCT = "70000000-0000-4000-8000-000000000064";
const VARIANT = "71000000-0000-4000-8000-000000000064";
const SHIPPING = "72000000-0000-4000-8000-000000000064";
const SHIPPING_DRAFT = "72000000-0000-4000-8000-000000000065";
const DISCOUNT = "73000000-0000-4000-8000-000000000064";
const EXPIRED_DISCOUNT = "73000000-0000-4000-8000-000000000065";
const BANK_METHOD = "50000000-0000-4000-8000-000000000063";
const PROVIDER_METHOD = "50000000-0000-4000-8000-000000000061";
const CROSS_STORE_METHOD = "50000000-0000-4000-8000-000000000064";
const BUILTIN_OPERATION = "82000000-0000-4000-8000-000000000064";
const HOSTED_OPERATION = "82000000-0000-4000-8000-000000000065";
const HOSTED_ATTEMPT = "83000000-0000-4000-8000-000000000064";
const HOSTED_ORDER = "84000000-0000-4000-8000-000000000064";
const HOSTED_ORDER_ITEM = "85000000-0000-4000-8000-000000000064";
const HOSTED_ORDER_EVENT = "86000000-0000-4000-8000-000000000064";
const RETRY_ATTEMPT = "83000000-0000-4000-8000-000000000065";
const NOW = "2026-07-28T15:00:00.000Z";
const VALID_ADDRESS = Object.freeze({
  firstName: "Ada",
  lastName: "Yilmaz",
  line1: "Bagdat Caddesi 1",
  district: "Kadikoy",
  city: "Istanbul",
  countryCode: "TR",
  phone: "+905551112233",
});

function bin(name) {
  const bundledRoot = path.join(homedir(), ".codex", "tmp");
  let bundled = [];
  try {
    bundled = readdirSync(bundledRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^postgresql-[0-9.]+-install$/.test(entry.name))
      .map((entry) => path.join(bundledRoot, entry.name, "bin"));
  } catch { /* optional bundled runtime is absent */ }
  for (const directory of [process.env.POSTGRES_BIN, ...(process.env.PATH ?? "").split(path.delimiter), ...bundled]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch { /* continue */ }
  }
  throw new Error(`DISPOSABLE_DB_EXECUTION_BLOCKED: missing ${name}`);
}

function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    input,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  }
  return result;
}

function start() {
  const root = mkdtempSync(path.join("/tmp", "celebix-storefront-checkout-"));
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 30_400 + Math.floor(Math.random() * 100);
  mkdirSync(socket, { mode: 0o700 });
  command(bin("initdb"), ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(bin("pg_ctl"), ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { root, data, socket, port };
}

function stop(box) {
  if (!box) return;
  command(bin("pg_ctl"), ["-D", box.data, "-m", "fast", "stop"], "", true);
  rmSync(box.root, { recursive: true, force: true });
}

function sql(box, input, database = DB, allowFailure = false) {
  return command(bin("psql"), [
    "-h", box.socket,
    "-p", String(box.port),
    "-X", "-qAt",
    "-v", "ON_ERROR_STOP=1",
    "-U", "postgres",
    "-d", database,
  ], input, allowFailure);
}

function apply(box, file, database = DB, allowFailure = false) {
  const target = path.join(SQL, file);
  if (!existsSync(target)) throw new Error(`missing required SQL artifact: ${file}`);
  return command(bin("psql"), [
    "-h", box.socket,
    "-p", String(box.port),
    "-X", "-qAt",
    "-v", "ON_ERROR_STOP=1",
    "-U", "postgres",
    "-d", database,
    "-f", target,
  ], "", allowFailure);
}

function call(box, statement, database = DB) {
  const output = sql(box, `SET ROLE celebix_saas_workflow; ${statement};`, database).stdout.trim();
  const separator = output.indexOf("|");
  const outcome = separator < 0 ? output : output.slice(0, separator);
  const payloadText = separator < 0 ? "" : output.slice(separator + 1);
  return { outcome, payload: payloadText ? JSON.parse(payloadText) : null };
}

function quote(box, hostname = HOST_A, digest = CART_A_DIGEST, database = DB) {
  return call(box, `SELECT outcome,result_payload FROM saas.storefront_checkout_get_quote(
    '${hostname}','${digest}','${NOW}'::timestamptz
  )`, database);
}

function updateCall({
  expectedVersion,
  operationId,
  fingerprint,
  currentNonce,
  nextNonce,
  email = "ada@example.test",
  marketingOptIn = true,
  shippingAddress = VALID_ADDRESS,
  billingAddress = null,
  shippingCode = "standard",
  discountCode = null,
  credentialDigest = CART_A_DIGEST,
}) {
  return `SELECT outcome,result_payload FROM saas.storefront_checkout_update_delivery(
    '${HOST_A}','${credentialDigest}',${expectedVersion},'${operationId}'::uuid,'${fingerprint}',
    '${currentNonce}','${nextNonce}','${email}',${marketingOptIn},
    '${JSON.stringify(shippingAddress)}'::jsonb,
    ${billingAddress === null ? "NULL::jsonb" : `'${JSON.stringify(billingAddress)}'::jsonb`},
    ${shippingCode === null ? "NULL::text" : `'${shippingCode}'`},
    ${discountCode === null ? "NULL::text" : `'${discountCode}'`},'${NOW}'::timestamptz
  )`;
}

function submitBuiltInCall({
  expectedVersion,
  operationId = BUILTIN_OPERATION,
  fingerprint = "6".repeat(64),
  nonce = NONCE_2,
  paymentMethodId = BANK_METHOD,
  credentialDigest = CART_A_DIGEST,
}) {
  return `SELECT outcome,result_payload FROM saas.storefront_checkout_submit_builtin(
    '${HOST_A}','${credentialDigest}',${expectedVersion},'${operationId}'::uuid,'${fingerprint}',
    '${nonce}','${paymentMethodId}'::uuid,'${NOW}'::timestamptz
  )`;
}

function beginHostedCall({
  expectedVersion,
  operationId = HOSTED_OPERATION,
  fingerprint = "7".repeat(64),
  nonce = NONCE_2,
  paymentMethodId = PROVIDER_METHOD,
  attemptId = HOSTED_ATTEMPT,
  callbackDigest = "8".repeat(64),
  orderId = HOSTED_ORDER,
  orderItemIds = [HOSTED_ORDER_ITEM],
  orderEventId = HOSTED_ORDER_EVENT,
  orderNumber = "SF-2026-000064",
}) {
  return `SELECT outcome,result_payload FROM saas.storefront_checkout_begin_hosted(
    '${HOST_A}','${CART_A_DIGEST}',${expectedVersion},'${operationId}'::uuid,'${fingerprint}',
    '${nonce}','${paymentMethodId}'::uuid,'${attemptId}'::uuid,'${callbackDigest}',
    '${orderId}'::uuid,ARRAY[${orderItemIds.map((id) => `'${id}'::uuid`).join(",")}],
    '${orderEventId}'::uuid,'${orderNumber}','${NOW}'::timestamptz
  )`;
}

function prepareSubmittedCart(box, database, discountCode = "YAZ10", options = {}) {
  const credentialDigest = options.credentialDigest ?? CART_A_DIGEST;
  const currentNonce = options.currentNonce ?? NONCE_1;
  const nextNonce = options.nextNonce ?? NONCE_2;
  const operationId = options.operationId ?? "81000000-0000-4000-8000-000000000071";
  const issued = call(box, `SELECT outcome,result_payload FROM saas.storefront_checkout_issue_nonce(
    '${HOST_A}','${credentialDigest}','${currentNonce}','${NOW}'::timestamptz
  )`, database);
  assert.equal(issued.outcome, "issued");
  const updated = call(box, updateCall({
    expectedVersion: issued.payload.cartVersion,
    operationId,
    fingerprint: "5".repeat(64),
    currentNonce,
    nextNonce,
    discountCode,
    credentialDigest,
  }), database);
  assert.equal(updated.outcome, "updated");
  return updated.payload.cartVersion;
}

function addSecondCheckoutCart(box, database) {
  sql(box, `SET ROLE celebix_saas_owner;
    INSERT INTO saas.abandoned_carts(
      id,store_id,public_cart_digest,status,customer_name,customer_email,customer_phone,
      currency,subtotal_cents,discount_cents,total_cents,checkout_started_at,last_activity_at,
      abandoned_at,recovered_at,archived_at,version,created_at,updated_at
    ) VALUES(
      '${CART_B}','${STORE_A}','${CART_B_DIGEST}','active',NULL,NULL,NULL,
      'TRY',10000,0,10000,'2026-07-28T14:00:00Z','${NOW}',NULL,NULL,NULL,1,
      '2026-07-28T14:00:00Z','${NOW}'
    );
    INSERT INTO saas.abandoned_cart_items(
      id,store_id,cart_id,product_id,variant_id,position,product_name,variant_name,sku,
      image_url,unit_price_cents,quantity,discount_cents,line_total_cents,created_at
    ) VALUES(
      '76000000-0000-4000-8000-000000000065','${STORE_A}','${CART_B}','${PRODUCT}','${VARIANT}',
      0,'Snapshot title','Snapshot variant','CHECKOUT-1',NULL,10000,1,0,10000,
      '2026-07-28T14:00:00Z'
    );`, database);
}

async function exerciseEmergencyDisableRace(box, database, expectedVersion) {
  const admin = new Client({ host: box.socket, port: box.port, user: "postgres", database });
  const monitor = new Client({ host: box.socket, port: box.port, user: "postgres", database });
  await Promise.all([admin.connect(), monitor.connect()]);
  try {
    await admin.query("BEGIN");
    await admin.query("SET LOCAL ROLE celebix_saas_owner");
    await admin.query(`UPDATE saas.payment_methods SET state='emergency_disabled',
      emergency_reason='incident',version=version+1,updated_at='${NOW}'
      WHERE id='${PROVIDER_METHOD}'`);
    const checkout = concurrentUpdate(
      box,
      database,
      beginHostedCall({ expectedVersion }),
      "hosted-emergency-disable-race",
    );
    const blocked = await waitForDatabaseCondition(monitor, {
      text: `SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity
        WHERE application_name='hosted-emergency-disable-race'
          AND wait_event_type='Lock') AS matched`,
    });
    await admin.query("COMMIT");
    return { blocked, outcome: await checkout };
  } finally {
    await admin.query("ROLLBACK").catch(() => undefined);
    await Promise.all([admin.end(), monitor.end()]);
  }
}

async function exerciseHostedAuthorityRace(box, database, expectedVersion) {
  const connection = (applicationName) => new Client({
    host: box.socket,
    port: box.port,
    user: "postgres",
    database,
    application_name: applicationName,
  });
  const blocker = connection("hosted-authority-blocker");
  const checkout = connection("hosted-authority-race");
  const monitor = connection("hosted-authority-monitor");
  await Promise.all([blocker.connect(), checkout.connect(), monitor.connect()]);
  try {
    await blocker.query("BEGIN");
    await blocker.query(`SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'saas.payment.attempt.operation:${HOSTED_ATTEMPT}',0
    ))`);
    await checkout.query("BEGIN");
    await checkout.query("SET LOCAL ROLE celebix_saas_workflow");
    const beginPromise = checkout.query(beginHostedCall({ expectedVersion }));
    const blocked = await waitForDatabaseCondition(monitor, {
      text: `SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity
        WHERE application_name='hosted-authority-race' AND wait_event_type='Lock') AS matched`,
    });
    await blocker.query("COMMIT");
    const result = await beginPromise;
    await checkout.query("COMMIT");
    return { blocked, row: result.rows[0] };
  } finally {
    await blocker.query("ROLLBACK").catch(() => undefined);
    await checkout.query("ROLLBACK").catch(() => undefined);
    await Promise.all([blocker.end(), checkout.end(), monitor.end()]);
  }
}

function activePriceListFixture(box, database) {
  sql(box, `SET ROLE celebix_saas_owner;
    INSERT INTO saas.price_lists(
      id,store_id,name,status,version,activated_at,archived_at,created_at,updated_at
    ) VALUES(
      '98000000-0000-4000-8000-000000000064','${STORE_A}','Hosted race price',
      'active',1,'2026-07-28T14:00:00.000Z',NULL,
      '2026-07-28T13:00:00.000Z','2026-07-28T14:00:00.000Z'
    );
    INSERT INTO saas.price_list_items(
      store_id,price_list_id,variant_id,price_cents,created_at
    ) VALUES(
      '${STORE_A}','98000000-0000-4000-8000-000000000064','${VARIANT}',8000,
      '2026-07-28T14:00:00.000Z'
    );
    INSERT INTO saas.price_list_rules(
      id,store_id,price_list_id,channel,customer_tag_id,starts_at,ends_at,priority,created_at
    ) VALUES(
      '99000000-0000-4000-8000-000000000064','${STORE_A}',
      '98000000-0000-4000-8000-000000000064','storefront',NULL,
      '2026-07-28T14:00:00.000Z',NULL,100,'2026-07-28T14:00:00.000Z'
    );`, database);
}

async function exerciseHostedPriceSnapshotRace(box, database, expectedVersion) {
  const connection = (applicationName) => new Client({
    host: box.socket,
    port: box.port,
    user: "postgres",
    database,
    application_name: applicationName,
  });
  const blocker = connection("hosted-price-race-blocker");
  const checkout = connection("hosted-price-race-checkout");
  const admin = connection("hosted-price-race-admin");
  const monitor = connection("hosted-price-race-monitor");
  await Promise.all([blocker.connect(), checkout.connect(), admin.connect(), monitor.connect()]);
  try {
    await blocker.query("BEGIN");
    await blocker.query(`SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'saas.payment.attempt.operation:${HOSTED_ATTEMPT}',0
    ))`);
    await checkout.query("BEGIN");
    await checkout.query("SET LOCAL ROLE celebix_saas_workflow");
    const beginPromise = checkout.query(beginHostedCall({ expectedVersion }));
    const blocked = await waitForDatabaseCondition(monitor, {
      text: `SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity
        WHERE application_name='hosted-price-race-checkout'
          AND wait_event_type='Lock') AS matched`,
    });
    await admin.query(`SET ROLE celebix_saas_owner;
      UPDATE saas.price_lists SET status='archived',version=version+1,
        archived_at='2026-07-28T15:01:00.000Z',updated_at='2026-07-28T15:01:00.000Z'
      WHERE id='98000000-0000-4000-8000-000000000064'`);
    await blocker.query("COMMIT");
    const result = await beginPromise;
    await checkout.query("COMMIT");
    return { blocked, row: result.rows[0] };
  } finally {
    await blocker.query("ROLLBACK").catch(() => undefined);
    await checkout.query("ROLLBACK").catch(() => undefined);
    await Promise.all([blocker.end(), checkout.end(), admin.end(), monitor.end()]);
  }
}

async function exerciseConcurrentCallbackDown(box, database) {
  const connection = (applicationName) => new Client({
    host: box.socket,
    port: box.port,
    user: "postgres",
    database,
    application_name: applicationName,
  });
  const blocker = connection("checkout-callback-down-admission-blocker");
  const rollback = connection("checkout-callback-down-migration");
  const monitor = connection("checkout-callback-down-monitor");
  await Promise.all([blocker.connect(), rollback.connect(), monitor.connect()]);
  try {
    await blocker.query("BEGIN");
    await blocker.query(`SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'saas.storefront.checkout.settlement-admission',0
    ))`);
    const callbackPromise = concurrentUpdate(
      box,
      database,
      `SELECT outcome,result_payload FROM saas.payment_attempt_apply_hosted_callback(
        'paytr_iframe',repeat('8',64),'88000000-0000-4000-8000-000000000064'::uuid,
        repeat('a',64),repeat('b',64),2,1,'captured','provider-64',
        'payment_captured',11500,'TRY','2026-07-28T15:02:00.000Z'::timestamptz
      )`,
      "checkout-callback-down-settlement",
    ).then((outcome) => ({ ok: true, outcome, error: null }))
      .catch((error) => ({ ok: false, outcome: null, error }));
    const callbackBlocked = await waitForDatabaseCondition(monitor, {
      text: `SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity
        WHERE application_name='checkout-callback-down-settlement'
          AND wait_event_type='Lock') AS matched`,
    });
    const rollbackPromise = rollback.query(readFileSync(path.join(SQL, DOWN), "utf8"))
      .then(() => ({ ok: true, error: null }))
      .catch((error) => ({ ok: false, error }));
    const rollbackBlocked = await waitForDatabaseCondition(monitor, {
      text: `SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity
        WHERE application_name='checkout-callback-down-migration'
          AND wait_event_type='Lock') AS matched`,
    });
    await blocker.query("COMMIT");
    return {
      rollbackBlocked,
      callbackBlocked,
      rollback: await rollbackPromise,
      callback: await callbackPromise,
    };
  } finally {
    await blocker.query("ROLLBACK").catch(() => undefined);
    await Promise.all([blocker.end(), rollback.end(), monitor.end()]);
  }
}

async function exerciseLegacyQuickCheckoutDown(box, database) {
  const connection = (applicationName) => new Client({
    host: box.socket,
    port: box.port,
    user: "postgres",
    database,
    application_name: applicationName,
  });
  const blocker = connection("quick-checkout-down-order-blocker");
  const callback = connection("quick-checkout-down-callback");
  const rollback = connection("quick-checkout-down-migration");
  const monitor = connection("quick-checkout-down-monitor");
  await Promise.all([blocker.connect(), callback.connect(), rollback.connect(), monitor.connect()]);
  try {
    await blocker.query("BEGIN");
    await blocker.query("LOCK TABLE saas.orders IN ACCESS EXCLUSIVE MODE");
    await callback.query("BEGIN");
    await callback.query("SET LOCAL ROLE celebix_saas_owner");
    const callbackPromise = callback.query(`SELECT outcome,result_payload
      FROM saas.quick_checkout_settle_success_core(
        '68000000-0000-4000-8000-000000000064',NULL,NULL,
        '6b000000-0000-4000-8000-000000000064',
        ARRAY['6c000000-0000-4000-8000-000000000064'::uuid],
        '6d000000-0000-4000-8000-000000000064','QO-DOWN-RACE-64',
        '2026-07-28T15:02:00.000Z'
      )`).then(async (result) => {
        await callback.query("COMMIT");
        return { ok: true, outcome: result.rows[0]?.outcome, error: null };
      }).catch(async (error) => {
        await callback.query("ROLLBACK").catch(() => undefined);
        return { ok: false, outcome: null, error };
      });
    const callbackBlocked = await waitForDatabaseCondition(monitor, {
      text: `SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity
        WHERE application_name='quick-checkout-down-callback'
          AND wait_event_type='Lock') AS matched`,
    });
    const rollbackPromise = rollback.query(readFileSync(path.join(SQL, DOWN), "utf8"))
      .then(() => ({ ok: true, error: null }))
      .catch((error) => ({ ok: false, error }));
    const rollbackBlocked = await waitForDatabaseCondition(monitor, {
      text: `SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_locks
        WHERE pid=(SELECT pid FROM pg_catalog.pg_stat_activity
          WHERE application_name='quick-checkout-down-migration')
          AND relation='saas.checkout_payment_attempts'::regclass
          AND mode='AccessExclusiveLock' AND NOT granted) AS matched`,
    });
    await blocker.query("COMMIT");
    return {
      callbackBlocked,
      rollbackBlocked,
      callback: await callbackPromise,
      rollback: await rollbackPromise,
    };
  } finally {
    await blocker.query("ROLLBACK").catch(() => undefined);
    await callback.query("ROLLBACK").catch(() => undefined);
    await Promise.all([blocker.end(), callback.end(), rollback.end(), monitor.end()]);
  }
}

function initializeHosted(box, database, attemptId = HOSTED_ATTEMPT, ordinal = "64") {
  return call(box, `SELECT outcome,result_payload FROM saas.payment_attempt_mark_initialized(
    '${attemptId}'::uuid,'87000000-0000-4000-8000-${ordinal.padStart(12, "0")}'::uuid,
    repeat('9',64),1,1,'awaiting_customer','provider-${ordinal}','iframe_ready',
    '2026-07-28T15:01:00.000Z'::timestamptz
  )`, database);
}

function settleHosted(
  box,
  database,
  status = "captured",
  attemptId = HOSTED_ATTEMPT,
  ordinal = "64",
  callbackDigest = "8".repeat(64),
  amountCents = 11500,
  occurredAt = "2026-07-28T15:02:00.000Z",
  eventKeyDigest = "b".repeat(64),
) {
  return call(box, `SELECT outcome,result_payload FROM saas.payment_attempt_apply_hosted_callback(
    'paytr_iframe','${callbackDigest}','88000000-0000-4000-8000-${ordinal.padStart(12, "0")}'::uuid,
    repeat('a',64),'${eventKeyDigest}',2,1,'${status}','provider-${ordinal}',
    '${status === "captured" ? "payment_captured" : "payment_failed"}',${amountCents},'TRY',
    '${occurredAt}'::timestamptz
  )`, database);
}

function checkoutUuid(kind, authorityId, ordinal = 0) {
  const value = createHash("sha256")
    .update(`saas.storefront-checkout.v1:${kind}:${authorityId}:${ordinal}`)
    .digest("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-8${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
}

function hostedOrderNumber(attemptId) {
  return `SF-${createHash("sha256")
    .update(`saas.storefront-checkout.hosted-order.v1:${attemptId}`)
    .digest("hex").slice(0, 20).toUpperCase()}`;
}

function manualOrderInsert({
  id,
  orderNumber,
  source = "manual_import",
}) {
  return `INSERT INTO saas.orders(
    id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,
    subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,
    shipping_address,billing_address,version,created_at,updated_at
  ) VALUES(
    '${id}','${STORE_A}','${orderNumber}','${source}','Reserved Identity','reserved@example.test',
    '+905550000000','TRY',10000,0,0,10000,'confirmed','pending',
    '${JSON.stringify(VALID_ADDRESS)}'::jsonb,NULL,1,'${NOW}','${NOW}'
  )`;
}

async function exerciseUnrelatedIdentityWriteConcurrency(box, database) {
  const connection = (applicationName) => new Client({
    host: box.socket,
    port: box.port,
    user: "postgres",
    database,
    application_name: applicationName,
  });
  const first = connection("checkout-identity-unrelated-a");
  const second = connection("checkout-identity-unrelated-b");
  await Promise.all([first.connect(), second.connect()]);
  try {
    await first.query("BEGIN");
    await first.query("SET LOCAL ROLE celebix_saas_owner");
    await first.query(manualOrderInsert({
      id: "97000000-0000-4000-8000-000000000064",
      orderNumber: "UNRELATED-IDENTITY-64-A",
    }));
    const secondWrite = await second.query(`BEGIN;
      SET LOCAL ROLE celebix_saas_owner;
      SET LOCAL lock_timeout='500ms';
      ${manualOrderInsert({
        id: "97000000-0000-4000-8000-000000000065",
        orderNumber: "UNRELATED-IDENTITY-64-B",
      })};
      COMMIT;`).then(() => ({ ok: true, error: null }))
      .catch(async (error) => {
        await second.query("ROLLBACK").catch(() => undefined);
        return { ok: false, error };
      });
    await first.query("COMMIT");
    return secondWrite;
  } finally {
    await first.query("ROLLBACK").catch(() => undefined);
    await second.query("ROLLBACK").catch(() => undefined);
    await Promise.all([first.end(), second.end()]);
  }
}

async function concurrentUpdate(box, database, statement, applicationName) {
  const client = new Client({
    host: box.socket,
    port: box.port,
    user: "postgres",
    database,
    application_name: applicationName,
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE celebix_saas_workflow");
    const result = await client.query(statement);
    await client.query("COMMIT");
    return result.rows[0]?.outcome;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function waitForDatabaseCondition(client, statement, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await client.query(statement);
    if (result.rows[0]?.matched === true) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

async function exerciseConcurrentRollbackWrite(box, database) {
  const connection = (applicationName) => new Client({
    host: box.socket,
    port: box.port,
    user: "postgres",
    database,
    application_name: applicationName,
  });
  const blocker = connection("checkout-down-blocker");
  const rollback = connection("checkout-down-migration");
  const writer = connection("checkout-down-writer");
  const monitor = connection("checkout-down-monitor");
  let blockerOpen = false;
  let writerOpen = false;
  try {
    await Promise.all([blocker.connect(), rollback.connect(), writer.connect(), monitor.connect()]);
    await blocker.query("BEGIN");
    blockerOpen = true;
    await blocker.query("SET LOCAL ROLE celebix_saas_owner");
    await blocker.query("LOCK TABLE saas.storefront_checkout_operations IN ACCESS SHARE MODE");

    const rollbackPid = Number((await rollback.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
    const writerPid = Number((await writer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
    const rollbackPromise = rollback.query(readFileSync(path.join(SQL, DOWN), "utf8"))
      .then(() => ({ ok: true, error: null }))
      .catch((error) => ({ ok: false, error }));

    const rollbackLockObserved = await waitForDatabaseCondition(monitor, {
      text: `SELECT EXISTS(
        SELECT 1 FROM pg_catalog.pg_locks
        WHERE pid=$1 AND relation='saas.storefront_checkout_operations'::regclass
          AND mode='AccessExclusiveLock' AND NOT granted
      ) AS matched`,
      values: [rollbackPid],
    });

    const cartLockObserved = rollbackLockObserved && (await monitor.query({
      text: `SELECT EXISTS(
        SELECT 1 FROM pg_catalog.pg_locks
        WHERE pid=$1 AND relation='saas.abandoned_carts'::regclass
          AND mode='AccessExclusiveLock' AND granted
      ) AS matched`,
      values: [rollbackPid],
    })).rows[0]?.matched === true;

    let writerPromise = Promise.resolve({ ok: false, error: null });
    let writerBlocked = false;
    if (rollbackLockObserved) {
      await writer.query("BEGIN");
      writerOpen = true;
      await writer.query("SET LOCAL ROLE celebix_saas_owner");
      writerPromise = writer.query(`UPDATE saas.abandoned_carts
        SET marketing_opt_in=true WHERE id='${CART_A}'`)
        .then(async () => {
          await writer.query("COMMIT");
          writerOpen = false;
          return { ok: true, error: null };
        })
        .catch((error) => ({ ok: false, error }));
      writerBlocked = await waitForDatabaseCondition(monitor, {
        text: `SELECT EXISTS(
          SELECT 1 FROM pg_catalog.pg_locks
          WHERE pid=$1 AND relation='saas.abandoned_carts'::regclass
            AND mode='RowExclusiveLock' AND NOT granted
        ) AS matched`,
        values: [writerPid],
      });
    }

    await blocker.query("COMMIT");
    blockerOpen = false;
    const rollbackResult = await rollbackPromise;
    const writerResult = await writerPromise;
    if (writerOpen) {
      await writer.query("ROLLBACK").catch(() => undefined);
      writerOpen = false;
    }
    return { rollbackLockObserved, cartLockObserved, writerBlocked, rollbackResult, writerResult };
  } finally {
    if (blockerOpen) await blocker.query("ROLLBACK").catch(() => undefined);
    if (writerOpen) await writer.query("ROLLBACK").catch(() => undefined);
    await Promise.all([
      blocker.end().catch(() => undefined),
      rollback.end().catch(() => undefined),
      writer.end().catch(() => undefined),
      monitor.end().catch(() => undefined),
    ]);
  }
}

function preparePrerequisites(box) {
  sql(box, `CREATE DATABASE ${DB};`, "postgres");
  for (const { file } of prior.migrationChain) apply(box, file);
  apply(box, "202607280059_payment_method_single_active_provider.up.sql");
  sql(box, PROVIDER_FIXTURE);
  apply(box, "202607280060_iyzico_iframe_tenant_sandbox_evidence.up.sql");
  apply(box, "202607280061_iyzico_iframe_tenant_activation_runtime.up.sql");
  sql(box, `SET ROLE celebix_saas_owner;
    UPDATE saas.payment_methods SET
      config='{"bankName":"Test Bankasi","accountHolder":"Store A A.S.","iban":"TR330006100519786457841326","instructions":"Siparis numaranizi aciklamaya yazin."}'::jsonb,
      updated_at='${NOW}'
    WHERE id='${BANK_METHOD}';
    UPDATE saas.payment_methods SET state='active',updated_at='${NOW}'
    WHERE id='${PROVIDER_METHOD}';`);
  apply(box, "202607280062_builtin_payment_methods.up.sql");
  apply(box, "202607280063_payment_provider_builtin_compatibility.up.sql");
}

function checkoutFixture(box, database = DB) {
  sql(box, `BEGIN;
    SET LOCAL ROLE celebix_saas_owner;
    SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);
    SELECT pg_catalog.set_config('saas.inventory.source_id','77000000-0000-4000-8000-000000000064',true);
    SELECT pg_catalog.set_config('saas.inventory.source_time','${NOW}',true);
    UPDATE saas.stores SET name='Store A',updated_at='${NOW}' WHERE id='${STORE_A}';
    UPDATE saas.stores SET name='Store B',updated_at='${NOW}' WHERE id='${STORE_B}';

    INSERT INTO saas.payment_methods(
      id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,
      position,config,version,created_at,updated_at
    ) VALUES(
      '${CROSS_STORE_METHOD}','${STORE_B}','cash_on_delivery',NULL,NULL,'Store B COD',
      'active',NULL,0,'{"instructions":""}'::jsonb,1,'2026-07-28T14:00:00Z','${NOW}'
    );

    INSERT INTO saas.store_domains(
      id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version
    ) VALUES
      ('61000000-0000-4000-8000-000000000064','${STORE_A}','${HOST_A}',
       'custom_domain','active',true,'2026-07-28T14:00:00Z','2026-07-28T14:00:00Z','${NOW}',1),
      ('61000000-0000-4000-8000-000000000065','${STORE_B}','${HOST_B}',
       'custom_domain','active',true,'2026-07-28T14:00:00Z','2026-07-28T14:00:00Z','${NOW}',1);

    INSERT INTO saas.inventory_locations(
      id,store_id,name,is_default,status,version,created_at,updated_at
    ) VALUES(
      '62000000-0000-4000-8000-000000000064','${STORE_A}','Main',true,'active',1,
      '2026-07-28T14:00:00Z','${NOW}'
    );

    INSERT INTO saas.products(
      id,store_id,slug,title,description,status,currency,version,archived_at,created_at,updated_at
    ) VALUES(
      '${PRODUCT}','${STORE_A}','checkout-product','Checkout Product',NULL,'active','TRY',1,NULL,
      '2026-07-28T14:00:00Z','${NOW}'
    );
    INSERT INTO saas.product_variants(
      id,product_id,store_id,title,sku,barcode,price_cents,compare_at_cents,cost_cents,
      stock_tracking,stock_quantity,status,attributes,version,archived_at,created_at,updated_at
    ) VALUES(
      '${VARIANT}','${PRODUCT}','${STORE_A}','Standard','CHECKOUT-1',NULL,10000,NULL,NULL,
      true,5,'active','{}',1,NULL,'2026-07-28T14:00:00Z','${NOW}'
    );
    INSERT INTO saas.product_media(
      id,store_id,product_id,variant_id,object_key,public_url,media_type,alt_text,width,height,
      byte_size,sort_order,status,created_at,updated_at,archived_at,version
    ) VALUES(
      '74000000-0000-4000-8000-000000000064','${STORE_A}','${PRODUCT}',NULL,
      'stores/${STORE_A}/products/${PRODUCT}/74000000-0000-4000-8000-000000000064.webp',
      'https://cdn.test/stores/${STORE_A}/products/${PRODUCT}/74000000-0000-4000-8000-000000000064.webp',
      'image/webp','Checkout Product',100,100,1000,0,'active','2026-07-28T14:00:00Z','${NOW}',NULL,1
    );

    INSERT INTO saas.merchant_admin_records(
      id,store_id,record_kind,name,config,status,version,archived_at,created_at,updated_at
    ) VALUES
      ('${SHIPPING}','${STORE_A}','shipping_setting','Standard shipping',
       '{"regions":["TR"],"flatRateCents":2500,"freeShippingThresholdCents":50000,"estimatedDays":3}',
       'active',1,NULL,'2026-07-28T14:00:00Z','${NOW}'),
      ('${SHIPPING_DRAFT}','${STORE_A}','shipping_setting','Inactive shipping',
       '{"regions":["TR"],"flatRateCents":9999,"estimatedDays":1}',
       'draft',1,NULL,'2026-07-28T14:00:00Z','2026-07-28T15:01:00Z'),
      ('${DISCOUNT}','${STORE_A}','discount','Summer discount',
       '{"code":"YAZ10","discountType":"fixed","value":1000,"minimumOrderCents":0}',
       'active',1,NULL,'2026-07-28T14:00:00Z','${NOW}'),
      ('${EXPIRED_DISCOUNT}','${STORE_A}','discount','Expired discount',
       '{"code":"EXPIRED","discountType":"fixed","value":1000,"minimumOrderCents":0}',
       'archived',1,'${NOW}','2026-07-28T14:00:00Z','${NOW}'),
      ('75000000-0000-4000-8000-000000000064','${STORE_A}','policy','Mesafeli Satis Sozlesmesi',
       '{"policyType":"distance_sales","locale":"tr","body":"Mesafeli satis kosullari.","effectiveAt":"2026-07-28T14:00:00.000Z"}',
       'active',1,NULL,'2026-07-28T14:00:00Z','${NOW}');

    INSERT INTO saas.abandoned_carts(
      id,store_id,public_cart_digest,status,customer_name,customer_email,customer_phone,
      currency,subtotal_cents,discount_cents,total_cents,checkout_started_at,last_activity_at,
      abandoned_at,recovered_at,archived_at,version,created_at,updated_at
    ) VALUES(
      '${CART_A}','${STORE_A}','${CART_A_DIGEST}','active',NULL,NULL,NULL,
      'TRY',10000,0,10000,'2026-07-28T14:00:00Z','${NOW}',NULL,NULL,NULL,1,
      '2026-07-28T14:00:00Z','${NOW}'
    );
    INSERT INTO saas.abandoned_cart_items(
      id,store_id,cart_id,product_id,variant_id,position,product_name,variant_name,sku,
      image_url,unit_price_cents,quantity,discount_cents,line_total_cents,created_at
    ) VALUES(
      '76000000-0000-4000-8000-000000000064','${STORE_A}','${CART_A}','${PRODUCT}','${VARIANT}',
      0,'Snapshot title','Snapshot variant','CHECKOUT-1',NULL,10000,1,0,10000,'2026-07-28T14:00:00Z'
    );
    COMMIT;`, database);
}

function legacyQuickCheckoutFixture(box, database) {
  const envelope = JSON.stringify({
    algorithm: "A256GCM",
    ciphertext: "AQ",
    iv: "AAAAAAAAAAAAAAAA",
    keyId: "key-1",
    tag: "AAAAAAAAAAAAAAAAAAAAAA",
    version: 1,
  });
  const legacyAddress = JSON.stringify({
    recipientName: "Quick Buyer",
    phone: "+905551112233",
    line1: "Bagdat Caddesi 1",
    district: "Kadikoy",
    city: "Istanbul",
    country: "TR",
  });
  sql(box, `SET ROLE celebix_saas_owner;
    INSERT INTO saas.checkout_provider_configs(
      id,store_id,provider_key,status,public_origin,configuration_key_id,
      sealed_configuration,configuration_digest,version,created_at,updated_at
    ) VALUES(
      '65000000-0000-4000-8000-000000000064','${STORE_A}','paytr','active',
      'https://www.paytr.com','key-1','${envelope}',repeat('d',64),1,
      '2026-07-28T14:00:00.000Z','2026-07-28T14:00:00.000Z'
    );
    INSERT INTO saas.quick_order_links(
      id,store_id,creating_membership_id,provider_config_id,status,token_digest,
      token_key_id,sealed_token,customer_name,customer_email,customer_phone,
      shipping_address,billing_address,internal_label,currency,subtotal_cents,
      shipping_cents,discount_cents,total_cents,expires_at,version,created_at,updated_at
    ) VALUES(
      '66000000-0000-4000-8000-000000000064','${STORE_A}',
      '30000000-0000-4000-8000-000000000061',
      '65000000-0000-4000-8000-000000000064','active',repeat('6',64),'key-1',
      '${envelope}','Quick Buyer','quick@example.test','+905551112233',
      '${legacyAddress}','${legacyAddress}',
      'down race','TRY',10000,0,0,10000,'2026-07-28T18:00:00.000Z',1,
      '2026-07-28T14:00:00.000Z','2026-07-28T14:00:00.000Z'
    );
    INSERT INTO saas.quick_order_link_items(
      id,store_id,quick_order_link_id,product_id,variant_id,position,product_name,
      variant_name,sku,unit_price_cents,quantity,line_total_cents,created_at
    ) VALUES(
      '6a000000-0000-4000-8000-000000000064','${STORE_A}',
      '66000000-0000-4000-8000-000000000064','${PRODUCT}','${VARIANT}',0,
      'Checkout Product','Standard','CHECKOUT-1',10000,1,10000,
      '2026-07-28T14:00:00.000Z'
    );
    INSERT INTO saas.quick_order_redemption_sessions(
      id,store_id,quick_order_link_id,cookie_digest,expires_at,version,created_at,updated_at
    ) VALUES(
      '67000000-0000-4000-8000-000000000064','${STORE_A}',
      '66000000-0000-4000-8000-000000000064',repeat('7',64),
      '2026-07-28T18:00:00.000Z',1,'2026-07-28T15:00:00.000Z',
      '2026-07-28T15:00:00.000Z'
    );
    INSERT INTO saas.checkout_payment_attempts(
      id,store_id,quick_order_link_id,redemption_session_id,provider_config_id,
      provider_config_version,configuration_digest,configuration_key_id,
      sealed_configuration,merchant_oid,expected_subtotal_cents,
      expected_shipping_cents,expected_discount_cents,expected_payment_amount,currency,
      status,provider_token_digest,provider_token_key_id,sealed_provider_token,
      hold_expires_at,provider_ready_at,version,created_at,updated_at
    ) VALUES(
      '68000000-0000-4000-8000-000000000064','${STORE_A}',
      '66000000-0000-4000-8000-000000000064',
      '67000000-0000-4000-8000-000000000064',
      '65000000-0000-4000-8000-000000000064',1,repeat('d',64),'key-1',
      '${envelope}',repeat('8',32),10000,0,0,10000,'TRY','provider_ready',
      repeat('9',64),'key-1','${envelope}','2026-07-28T15:05:00.000Z',
      '2026-07-28T15:01:00.000Z',2,'2026-07-28T15:00:00.000Z',
      '2026-07-28T15:01:00.000Z'
    );
    INSERT INTO saas.checkout_inventory_reservations(
      id,store_id,attempt_id,quick_order_link_id,product_id,variant_id,quantity,
      stock_tracked,status,held_at,version,updated_at
    ) VALUES(
      '69000000-0000-4000-8000-000000000064','${STORE_A}',
      '68000000-0000-4000-8000-000000000064',
      '66000000-0000-4000-8000-000000000064','${PRODUCT}','${VARIANT}',1,true,
      'held','2026-07-28T15:00:00.000Z',1,'2026-07-28T15:00:00.000Z'
    );`, database);
}

function maximumCartFixture(box, database) {
  sql(box, `BEGIN;
    SET LOCAL ROLE celebix_saas_owner;
    SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);
    SELECT pg_catalog.set_config('saas.inventory.source_id','77000000-0000-4000-8000-000000000067',true);
    SELECT pg_catalog.set_config('saas.inventory.source_time','${NOW}',true);
    INSERT INTO saas.products(
      id,store_id,slug,title,description,status,currency,version,
      archived_at,created_at,updated_at
    )
    SELECT
      ('7a000000-0000-4000-8000-'||pg_catalog.lpad(item::text,12,'0'))::uuid,
      '${STORE_A}','max-item-'||pg_catalog.lpad(item::text,3,'0'),
      pg_catalog.repeat('🚀',200),NULL,'active','TRY',1,NULL,
      '2026-07-28T14:00:00Z','${NOW}'
    FROM pg_catalog.generate_series(1,99) item;
    INSERT INTO saas.product_variants(
      id,product_id,store_id,title,sku,barcode,price_cents,compare_at_cents,cost_cents,
      stock_tracking,stock_quantity,status,attributes,version,archived_at,created_at,updated_at
    )
    SELECT
      ('7b000000-0000-4000-8000-'||pg_catalog.lpad(item::text,12,'0'))::uuid,
      ('7a000000-0000-4000-8000-'||pg_catalog.lpad(item::text,12,'0'))::uuid,
      '${STORE_A}',pg_catalog.repeat('🧿',200),'MAXITEM-'||pg_catalog.lpad(item::text,3,'0'),
      NULL,100,NULL,NULL,true,5,'active','{}',1,NULL,'2026-07-28T14:00:00Z','${NOW}'
    FROM pg_catalog.generate_series(1,99) item;
    INSERT INTO saas.abandoned_cart_items(
      id,store_id,cart_id,product_id,variant_id,position,product_name,variant_name,sku,
      image_url,unit_price_cents,quantity,discount_cents,line_total_cents,created_at
    )
    SELECT
      ('7c000000-0000-4000-8000-'||pg_catalog.lpad(item::text,12,'0'))::uuid,
      '${STORE_A}','${CART_A}',
      ('7a000000-0000-4000-8000-'||pg_catalog.lpad(item::text,12,'0'))::uuid,
      ('7b000000-0000-4000-8000-'||pg_catalog.lpad(item::text,12,'0'))::uuid,
      item,pg_catalog.repeat('🚀',200),pg_catalog.repeat('🧿',200),
      'MAXITEM-'||pg_catalog.lpad(item::text,3,'0'),NULL,100,1,0,100,'${NOW}'
    FROM pg_catalog.generate_series(1,99) item;
    COMMIT;`, database);
}

async function main() {
  for (const file of REQUIRED) {
    assert.equal(existsSync(path.join(SQL, file)), true, `migration 064 artifact missing: ${file}`);
  }

  let box;
  try {
    box = start();
    preparePrerequisites(box);
    sql(box, `CREATE DATABASE ${CLEAN_DOWN_DB} TEMPLATE ${DB};`, "postgres");
    apply(box, UP);
    checkoutFixture(box);
    const workflowQuote = sql(box, `SET ROLE celebix_saas_workflow;
      SELECT outcome,result_payload FROM saas.storefront_checkout_get_quote(
        '${HOST_A}','${CART_A_DIGEST}','${NOW}'::timestamptz
      );`, DB, true);
    assert.equal(workflowQuote.status, 0,
      `the public checkout transaction role must execute quote authority: ${workflowQuote.stderr}`);
    assert.match(workflowQuote.stdout, /^found\|/);
    assert.equal(sql(box, `WITH public_function(oid) AS (
        SELECT pg_catalog.unnest(ARRAY[
          'saas.storefront_checkout_get_quote(text,text,timestamp with time zone)'::regprocedure,
          'saas.storefront_checkout_issue_nonce(text,text,text,timestamp with time zone)'::regprocedure,
          'saas.storefront_checkout_update_delivery(text,text,bigint,uuid,text,text,text,text,boolean,jsonb,jsonb,text,text,timestamp with time zone)'::regprocedure,
          'saas.storefront_checkout_submit_builtin(text,text,bigint,uuid,text,text,uuid,timestamp with time zone)'::regprocedure,
          'saas.storefront_checkout_begin_hosted(text,text,bigint,uuid,text,text,uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)'::regprocedure,
          'saas.storefront_checkout_recover_operation(text,text,uuid,text,timestamp with time zone)'::regprocedure,
          'saas.storefront_checkout_get_status(text,text,timestamp with time zone)'::regprocedure,
          'saas.storefront_checkout_get_policy(text,text,timestamp with time zone)'::regprocedure,
          'saas.storefront_checkout_preflight()'::regprocedure
        ])::oid
      )
      SELECT pg_catalog.count(*)=9
        AND pg_catalog.bool_and(pg_catalog.has_function_privilege(
          'celebix_saas_workflow',oid,'EXECUTE'
        ))
        AND pg_catalog.bool_and(NOT pg_catalog.has_function_privilege(
          'celebix_saas_app',oid,'EXECUTE'
        ))
        AND pg_catalog.bool_and(NOT pg_catalog.has_function_privilege(
          'public',oid,'EXECUTE'
        ))
        AND NOT EXISTS(
          SELECT 1 FROM public_function checked
          JOIN pg_catalog.pg_proc procedure ON procedure.oid=checked.oid
          CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
          ) privilege
          WHERE privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
            OR privilege.grantor<>'celebix_saas_owner'::regrole
            OR privilege.grantee NOT IN(
              'celebix_saas_owner'::regrole,'celebix_saas_workflow'::regrole
            )
        )
      FROM public_function;`).stdout.trim(), "t",
    "checkout functions must expose the exact owner/workflow-only ACL matrix");
    const appQuote = sql(box, `SET ROLE celebix_saas_app;
      SELECT outcome FROM saas.storefront_checkout_get_quote(
        '${HOST_A}','${CART_A_DIGEST}','${NOW}'::timestamptz
      );`, DB, true);
    assert.notEqual(appQuote.status, 0,
      "the panel app role must not bypass the public workflow repository");
    assert.match(appQuote.stderr, /permission denied for function storefront_checkout_get_quote/);
    const appPreflight = sql(box,
      `SET ROLE celebix_saas_app; SELECT saas.storefront_checkout_preflight();`, DB, true);
    assert.notEqual(appPreflight.status, 0,
      "checkout preflight must remain scoped to its operational workflow role");
    assert.equal(sql(box,
      `SET ROLE celebix_saas_workflow; SELECT saas.storefront_checkout_preflight();`).stdout.trim(), "t");
    for (const role of ["celebix_saas_app", "celebix_saas_workflow"]) {
      const rawRead = sql(box,
        `SET ROLE ${role}; SELECT count(*) FROM saas.storefront_checkout_operations;`, DB, true);
      assert.notEqual(rawRead.status, 0, `${role} must not read the checkout operation table`);
      const rawWrite = sql(box,
        `SET ROLE ${role}; DELETE FROM saas.storefront_checkout_operations;`, DB, true);
      assert.notEqual(rawWrite.status, 0, `${role} must not write the checkout operation table`);
    }
    apply(box, ASSERTIONS);

    for (const database of [
      BUILTIN_SETTLEMENT_DB,
      HOSTED_SETTLEMENT_DB,
      HOSTED_FAILURE_DB,
      METHOD_DENIAL_DB,
      BUILTIN_RACE_DB,
      EMERGENCY_RACE_DB,
      DISCOUNT_USAGE_RACE_DB,
      HOSTED_SNAPSHOT_DB,
      HOSTED_CONFIG_DB,
      HOSTED_RETRY_DB,
      HOSTED_IDENTITY_DB,
      HOSTED_PRECOLLISION_DB,
      HOSTED_AUTHORITY_RACE_DB,
      HOSTED_PRICE_RACE_DB,
      HOSTED_SNAPSHOT_TAMPER_DB,
      DOWN_CALLBACK_RACE_DB,
      QUICK_CHECKOUT_DOWN_RACE_DB,
    ]) {
      sql(box, `CREATE DATABASE ${database} TEMPLATE ${DB};`, "postgres");
    }

    const builtInVersion = prepareSubmittedCart(box, BUILTIN_SETTLEMENT_DB);
    const builtInPlaced = call(box, submitBuiltInCall({ expectedVersion: builtInVersion }), BUILTIN_SETTLEMENT_DB);
    assert.equal(builtInPlaced.outcome, "placed");
    assert.deepEqual(Object.keys(builtInPlaced.payload).sort(), ["kind", "orderNumber", "statusPath"]);
    assert.equal(builtInPlaced.payload.kind, "placed");
    assert.equal(sql(box, `SELECT order_row.source||'|'||order_row.status||'|'||order_row.payment_status||'|'||
        cart.status||'|'||(cart.recovered_order_id=order_row.id)::text||'|'||variant.stock_quantity||'|'||
        (SELECT count(*) FROM saas.orders WHERE storefront_cart_id=cart.id)||'|'||
        (SELECT count(*) FROM saas.storefront_checkout_discount_redemptions redemption
          WHERE redemption.order_id=order_row.id)||'|'||
        (SELECT payload->>'paymentMethod' FROM saas.order_events event WHERE event.order_id=order_row.id)
      FROM saas.orders order_row
      JOIN saas.abandoned_carts cart ON cart.store_id=order_row.store_id AND cart.id=order_row.storefront_cart_id
      JOIN saas.product_variants variant ON variant.id='${VARIANT}'
      WHERE order_row.storefront_cart_id='${CART_A}';`, BUILTIN_SETTLEMENT_DB).stdout.trim(),
    "storefront|confirmed|pending|archived|true|4|1|1|bank_transfer",
    "built-in submission must truthfully create one pending order, redeem once and decrement once");
    const builtInReplay = call(box, submitBuiltInCall({ expectedVersion: builtInVersion }), BUILTIN_SETTLEMENT_DB);
    assert.equal(builtInReplay.outcome, "operation_replayed");
    assert.deepEqual(builtInReplay.payload, builtInPlaced.payload);
    assert.equal(sql(box, `SELECT count(*)||'|'||(SELECT stock_quantity FROM saas.product_variants WHERE id='${VARIANT}')
      FROM saas.orders WHERE storefront_cart_id='${CART_A}';`, BUILTIN_SETTLEMENT_DB).stdout.trim(), "1|4",
    "built-in operation replay must not duplicate or decrement again");

    const snapshotVersion = prepareSubmittedCart(box, HOSTED_SNAPSHOT_DB);
    assert.equal(call(box, beginHostedCall({ expectedVersion: snapshotVersion }), HOSTED_SNAPSHOT_DB).outcome,
      "created");
    assert.equal(initializeHosted(box, HOSTED_SNAPSHOT_DB).outcome, "awaiting_customer");
    sql(box, `SET ROLE celebix_saas_owner;
      UPDATE saas.abandoned_carts SET
        customer_name='Post Begin Mutation',customer_email='mutated@example.test',
        customer_phone='+905559999999',
        shipping_address='{"firstName":"Mutated","lastName":"Buyer","line1":"Changed 9","district":"Besiktas","city":"Istanbul","countryCode":"TR","phone":"+905559999999"}'::jsonb,
        subtotal_cents=20000,discount_cents=1000,total_cents=21500,updated_at='${NOW}'
      WHERE id='${CART_A}';
      DELETE FROM saas.abandoned_cart_items WHERE cart_id='${CART_A}';
      INSERT INTO saas.abandoned_cart_items(
        id,store_id,cart_id,product_id,variant_id,position,product_name,variant_name,sku,
        image_url,unit_price_cents,quantity,discount_cents,line_total_cents,created_at
      ) VALUES(
        '76000000-0000-4000-8000-000000000099','${STORE_A}','${CART_A}','${PRODUCT}','${VARIANT}',
        0,'Mutated item','Mutated variant','MUTATED',NULL,10000,2,0,20000,'${NOW}'
      );`, HOSTED_SNAPSHOT_DB);
    assert.equal(call(box, `SELECT outcome,result_payload FROM saas.abandoned_carts_mark_stale(
      '2026-07-28T15:10:00Z','2026-07-28T15:00:00Z'
    )`, HOSTED_SNAPSHOT_DB).outcome, "committed");
    assert.equal(settleHosted(
      box, HOSTED_SNAPSHOT_DB, "captured", HOSTED_ATTEMPT, "64", "8".repeat(64),
      11500, "2026-07-28T15:12:00.000Z",
    ).outcome, "captured",
      "capture must settle the immutable begin-time cart snapshot after cart/item/stale mutations");
    assert.equal(sql(box, `SELECT order_row.customer_name||'|'||order_row.customer_email||'|'||
        order_row.customer_phone||'|'||order_row.total_cents||'|'||
        pg_catalog.jsonb_extract_path_text(order_row.shipping_address::jsonb,'firstName')||'|'||
        item.product_name||'|'||
        item.quantity||'|'||item.unit_price_cents||'|'||cart.status||'|'||variant.stock_quantity
      FROM saas.orders order_row
      JOIN saas.order_items item ON item.order_id=order_row.id
      JOIN saas.abandoned_carts cart ON cart.id=order_row.storefront_cart_id
      JOIN saas.product_variants variant ON variant.id=item.variant_id
      WHERE order_row.storefront_cart_id='${CART_A}';`, HOSTED_SNAPSHOT_DB).stdout.trim(),
    "Ada Yilmaz|ada@example.test|+905551112233|11500|Ada|Checkout Product|1|10000|archived|4",
    "captured order facts must come only from begin-authorized state");

    sql(box, `SET ROLE celebix_saas_owner;
      UPDATE saas.merchant_admin_records SET
        config=config||'{"usageLimit":2}'::jsonb,version=version+1,updated_at='${NOW}'
      WHERE id='${DISCOUNT}';
      INSERT INTO saas.merchant_admin_events(
        id,store_id,record_id,record_kind,event_kind,summary,occurred_at
      ) VALUES(
        '79000000-0000-4000-8000-000000000097','${STORE_A}','${DISCOUNT}',
        'discount','coupon_used','{}','${NOW}'
      );`, HOSTED_CONFIG_DB);
    const configVersion = prepareSubmittedCart(box, HOSTED_CONFIG_DB);
    assert.equal(call(box, beginHostedCall({ expectedVersion: configVersion }), HOSTED_CONFIG_DB).outcome,
      "created");
    addSecondCheckoutCart(box, HOSTED_CONFIG_DB);
    const reservedIssued = call(box, `SELECT outcome,result_payload FROM saas.storefront_checkout_issue_nonce(
      '${HOST_A}','${CART_B_DIGEST}',repeat('1',64),'${NOW}'::timestamptz
    )`, HOSTED_CONFIG_DB);
    assert.equal(reservedIssued.outcome, "issued");
    assert.equal(call(box, updateCall({
      expectedVersion: reservedIssued.payload.cartVersion,
      operationId: "81000000-0000-4000-8000-000000000097",
      fingerprint: "9".repeat(64),
      currentNonce: "1".repeat(64),
      nextNonce: "2".repeat(64),
      discountCode: "YAZ10",
      credentialDigest: CART_B_DIGEST,
    }), HOSTED_CONFIG_DB).outcome, "discount_invalid",
    "an active hosted bridge must reserve the remaining coupon usage slot");
    assert.equal(initializeHosted(box, HOSTED_CONFIG_DB).outcome, "awaiting_customer");
    sql(box, `SET ROLE celebix_saas_owner;
      UPDATE saas.merchant_admin_records SET
        status='draft',config=config||'{"usageLimit":1}'::jsonb,
        version=version+1,updated_at='2026-07-28T15:01:30Z'
      WHERE id='${DISCOUNT}';`, HOSTED_CONFIG_DB);
    assert.equal(settleHosted(box, HOSTED_CONFIG_DB).outcome, "captured",
      "capture must consume begin-committed discount authority after disable/tightening");
    assert.equal(sql(box, `SELECT count(*) FROM saas.storefront_checkout_discount_redemptions
      WHERE discount_record_id='${DISCOUNT}';`, HOSTED_CONFIG_DB).stdout.trim(), "1");

    const retryVersion = prepareSubmittedCart(box, HOSTED_RETRY_DB, null);
    assert.equal(call(box, beginHostedCall({ expectedVersion: retryVersion }), HOSTED_RETRY_DB).outcome,
      "created");
      const activeStatus = call(box, `SELECT outcome,result_payload FROM saas.storefront_checkout_get_status(
        '${HOST_A}','${CART_A_DIGEST}','${NOW}'
      )`, HOSTED_RETRY_DB);
      assert.deepEqual(activeStatus.payload, {
        kind: "processing",
        orderNumber: hostedOrderNumber(HOSTED_ATTEMPT),
      },
        "an active hosted bridge must report processing without provider authority");
    assert.equal(initializeHosted(box, HOSTED_RETRY_DB).outcome, "awaiting_customer");
    assert.equal(settleHosted(
      box, HOSTED_RETRY_DB, "failed", HOSTED_ATTEMPT, "64", "8".repeat(64), 12500,
    ).outcome, "failed");
    assert.deepEqual(call(box, `SELECT outcome,result_payload FROM saas.storefront_checkout_get_status(
      '${HOST_A}','${CART_A_DIGEST}','${NOW}'
    )`, HOSTED_RETRY_DB).payload, { kind: "ready" },
    "a terminal non-capture bridge must return the cart to ready");
    const retryNonce = "3".repeat(64);
    const retriedQuote = call(box, `SELECT outcome,result_payload FROM saas.storefront_checkout_issue_nonce(
      '${HOST_A}','${CART_A_DIGEST}','${retryNonce}','${NOW}'
    )`, HOSTED_RETRY_DB);
    assert.equal(retriedQuote.outcome, "issued");
    assert.equal(call(box, beginHostedCall({
      expectedVersion: retriedQuote.payload.cartVersion,
      operationId: "82000000-0000-4000-8000-000000000098",
      fingerprint: "4".repeat(64),
      nonce: retryNonce,
      attemptId: RETRY_ATTEMPT,
      callbackDigest: "4".repeat(64),
      orderId: "84000000-0000-4000-8000-000000000065",
      orderItemIds: ["85000000-0000-4000-8000-000000000065"],
      orderEventId: "86000000-0000-4000-8000-000000000065",
      orderNumber: "SF-2026-000065",
    }), HOSTED_RETRY_DB).outcome, "created",
    "a failed hosted attempt must permit one new active bridge while preserving history");
    assert.equal(initializeHosted(box, HOSTED_RETRY_DB, RETRY_ATTEMPT, "65").outcome,
      "awaiting_customer");
    assert.equal(settleHosted(
      box, HOSTED_RETRY_DB, "captured", RETRY_ATTEMPT, "65", "4".repeat(64),
      12500, "2026-07-28T15:02:00.000Z", "c".repeat(64),
    ).outcome, "captured");
    assert.equal(settleHosted(
      box, HOSTED_RETRY_DB, "failed", HOSTED_ATTEMPT, "64", "8".repeat(64), 12500,
    ).outcome, "operation_replayed",
      "an old terminal callback replay must remain bound to its historical bridge");
    assert.equal(sql(box, `SELECT count(*)||'|'||
        (SELECT count(*) FROM saas.storefront_checkout_payment_bridges WHERE cart_id='${CART_A}')||'|'||
        (SELECT count(*) FROM saas.storefront_checkout_payment_bridges
          WHERE cart_id='${CART_A}' AND status='active')
      FROM saas.orders WHERE storefront_cart_id='${CART_A}';`, HOSTED_RETRY_DB).stdout.trim(),
    "1|2|0");
    assert.equal(call(box, `SELECT outcome,result_payload FROM saas.storefront_checkout_get_status(
      '${HOST_A}','${CART_A_DIGEST}','${NOW}'
    )`, HOSTED_RETRY_DB).payload.kind, "paid");

      const reservedOrderId = checkoutUuid("hosted-order", HOSTED_ATTEMPT);
      const reservedItemId = checkoutUuid("hosted-order-item", HOSTED_ATTEMPT, 1);
      const reservedEventId = checkoutUuid("hosted-order-event", HOSTED_ATTEMPT);
      const reservedOrderNumber = hostedOrderNumber(HOSTED_ATTEMPT);
      const targetOrderId = "94000000-0000-4000-8000-000000000064";
      const targetItemId = "95000000-0000-4000-8000-000000000064";
      const targetEventId = "96000000-0000-4000-8000-000000000064";
      sql(box, `SET ROLE celebix_saas_owner;
        ${manualOrderInsert({ id: targetOrderId, orderNumber: "MANUAL-TARGET-64" })};
        INSERT INTO saas.order_items(
          id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,
          unit_price_cents,quantity,discount_cents,line_total_cents,created_at
        ) VALUES(
          '${targetItemId}','${STORE_A}','${targetOrderId}','${PRODUCT}','${VARIANT}',0,
          'Target item','Target variant','TARGET',10000,1,0,10000,'${NOW}'
        );
        INSERT INTO saas.order_events(
          id,store_id,order_id,actor_membership_id,event_type,from_value,to_value,message,payload,created_at
        ) VALUES(
          '${targetEventId}','${STORE_A}','${targetOrderId}',NULL,'note_added',NULL,NULL,
          'Target event','{}','${NOW}'
        );`, HOSTED_IDENTITY_DB);
      const identityVersion = prepareSubmittedCart(box, HOSTED_IDENTITY_DB);
      assert.equal(call(box, beginHostedCall({ expectedVersion: identityVersion }), HOSTED_IDENTITY_DB).outcome,
        "created");
      assert.equal(sql(box, `SELECT order_id||'|'||order_item_ids[1]||'|'||order_event_id||'|'||order_number
        FROM saas.storefront_checkout_payment_bridges WHERE attempt_id='${HOSTED_ATTEMPT}';`,
      HOSTED_IDENTITY_DB).stdout.trim(),
      `${reservedOrderId}|${reservedItemId}|${reservedEventId}|${reservedOrderNumber}`,
      "future settlement identities must be derived by the database from the attempt authority");
      const unrelatedIdentityWrites = await exerciseUnrelatedIdentityWriteConcurrency(
        box, HOSTED_IDENTITY_DB,
      );
      assert.equal(unrelatedIdentityWrites.ok, true,
        unrelatedIdentityWrites.error?.message ??
          "unrelated order identities must not serialize on one global settlement lock");
      const identityWrites = [
        `UPDATE saas.orders SET id='${reservedOrderId}' WHERE id='${targetOrderId}';`,
        `UPDATE saas.orders SET order_number='${reservedOrderNumber}' WHERE id='${targetOrderId}';`,
        `UPDATE saas.order_items SET id='${reservedItemId}' WHERE id='${targetItemId}';`,
        `UPDATE saas.order_events SET id='${reservedEventId}' WHERE id='${targetEventId}';`,
        `${manualOrderInsert({ id: reservedOrderId, orderNumber: "MANUAL-RESERVED-ID" })};`,
        `${manualOrderInsert({
          id: "94000000-0000-4000-8000-000000000065",
          orderNumber: reservedOrderNumber,
        })};`,
        `INSERT INTO saas.order_items(
          id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,
          unit_price_cents,quantity,discount_cents,line_total_cents,created_at
        ) VALUES(
          '${reservedItemId}','${STORE_A}','${targetOrderId}','${PRODUCT}','${VARIANT}',0,
          'Reserved item','Reserved variant','RESERVED',10000,1,0,10000,'${NOW}'
        );`,
        `INSERT INTO saas.order_events(
          id,store_id,order_id,actor_membership_id,event_type,from_value,to_value,message,payload,created_at
        ) VALUES(
          '${reservedEventId}','${STORE_A}','${targetOrderId}',NULL,'note_added',NULL,NULL,
          'Reserved event','{}','${NOW}'
        );`,
      ];
      for (const statement of identityWrites) {
        const denied = sql(box, `SET ROLE celebix_saas_owner; ${statement}`, HOSTED_IDENTITY_DB, true);
        assert.notEqual(denied.status, 0,
          "ordinary owner writes must not steal a hosted settlement identity before capture");
        assert.match(
          denied.stderr,
          /STOREFRONT_CHECKOUT_RESERVED_IDENTITY|ORDER_EVENT_IMMUTABLE/,
        );
      }
      assert.equal(initializeHosted(box, HOSTED_IDENTITY_DB).outcome, "awaiting_customer");
      assert.equal(settleHosted(box, HOSTED_IDENTITY_DB).outcome, "captured");

      const collisionId = checkoutUuid("hosted-order", HOSTED_ATTEMPT);
      const collisionNumber = hostedOrderNumber(HOSTED_ATTEMPT);
      sql(box, `SET ROLE celebix_saas_owner;
        ${manualOrderInsert({ id: collisionId, orderNumber: collisionNumber })};`, HOSTED_PRECOLLISION_DB);
      const collisionVersion = prepareSubmittedCart(box, HOSTED_PRECOLLISION_DB);
      assert.equal(call(box, beginHostedCall({ expectedVersion: collisionVersion }),
        HOSTED_PRECOLLISION_DB).outcome, "invalid_input",
      "a pre-existing deterministic settlement identity must fail before creating an attempt");
      assert.equal(sql(box, `SELECT
        (SELECT count(*) FROM saas.payment_attempts WHERE id='${HOSTED_ATTEMPT}')||'|'||
        (SELECT count(*) FROM saas.storefront_checkout_payment_bridges
          WHERE attempt_id='${HOSTED_ATTEMPT}');`, HOSTED_PRECOLLISION_DB).stdout.trim(), "0|0");

      const authorityVersion = prepareSubmittedCart(box, HOSTED_AUTHORITY_RACE_DB);
      const authorityRace = await exerciseHostedAuthorityRace(
        box, HOSTED_AUTHORITY_RACE_DB, authorityVersion,
      );
      assert.equal(authorityRace.blocked, true,
        "test must pause hosted checkout inside generic payment-attempt admission");
      assert.equal(authorityRace.row?.outcome, "created");
      const attemptEnvironment = sql(box, `SELECT environment FROM saas.payment_attempts
        WHERE id='${HOSTED_ATTEMPT}';`, HOSTED_AUTHORITY_RACE_DB).stdout.trim();
      assert.equal(authorityRace.row?.result_payload?.environment, attemptEnvironment,
        "returned hosted authority must be projected from the committed attempt row");

        activePriceListFixture(box, HOSTED_PRICE_RACE_DB);
        const priceRaceVersion = prepareSubmittedCart(box, HOSTED_PRICE_RACE_DB);
        const priceRace = await exerciseHostedPriceSnapshotRace(
          box, HOSTED_PRICE_RACE_DB, priceRaceVersion,
        );
        assert.equal(priceRace.blocked, true,
          "test must archive the price list after canonical quote resolution");
        assert.equal(priceRace.row?.outcome, "created");
        assert.equal(priceRace.row?.result_payload?.amountMinor, 9500);
        assert.equal(priceRace.row?.result_payload?.basket?.[0]?.unitAmountMinor, 8000,
          "hosted basket must retain the one canonical pre-archive quote price");
        assert.equal(sql(box, `SELECT
            (settlement_snapshot#>>'{money,subtotalCents}')||'|'||
            (settlement_snapshot#>>'{money,totalCents}')||'|'||
            (settlement_snapshot#>>'{items,0,unitPriceCents}')||'|'||
            (settlement_snapshot#>>'{items,0,lineTotalCents}')
          FROM saas.storefront_checkout_payment_bridges
          WHERE attempt_id='${HOSTED_ATTEMPT}';`, HOSTED_PRICE_RACE_DB).stdout.trim(),
        "8000|9500|8000|8000",
        "attempt, basket, and immutable settlement snapshot must use one price version");
        assert.equal(initializeHosted(box, HOSTED_PRICE_RACE_DB).outcome, "awaiting_customer");
        assert.equal(settleHosted(
          box, HOSTED_PRICE_RACE_DB, "captured", HOSTED_ATTEMPT, "64", "8".repeat(64), 9500,
        ).outcome, "captured");
        assert.equal(sql(box, `SELECT order_row.subtotal_cents||'|'||order_row.total_cents||'|'||
            item.unit_price_cents||'|'||item.line_total_cents||'|'||variant.stock_quantity
          FROM saas.orders order_row
          JOIN saas.order_items item ON item.order_id=order_row.id
          JOIN saas.product_variants variant ON variant.id=item.variant_id
          WHERE order_row.storefront_cart_id='${CART_A}';`, HOSTED_PRICE_RACE_DB).stdout.trim(),
        "8000|9500|8000|8000|4",
        "captured order rows must equal the provider-captured canonical quote amount");

        const tamperVersion = prepareSubmittedCart(box, HOSTED_SNAPSHOT_TAMPER_DB);
        assert.equal(call(box, beginHostedCall({ expectedVersion: tamperVersion }),
          HOSTED_SNAPSHOT_TAMPER_DB).outcome, "created");
        assert.equal(initializeHosted(box, HOSTED_SNAPSHOT_TAMPER_DB).outcome, "awaiting_customer");
        sql(box, `SET ROLE celebix_saas_owner;
          ALTER TABLE saas.storefront_checkout_payment_bridges
            DISABLE TRIGGER storefront_checkout_payment_bridges_immutable;
          UPDATE saas.storefront_checkout_payment_bridges SET settlement_snapshot=
            pg_catalog.jsonb_set(
              pg_catalog.jsonb_set(
                settlement_snapshot,'{items,0,lineTotalCents}','9999'::jsonb,false
              ),'{money,subtotalCents}','9999'::jsonb,false
            )
          WHERE attempt_id='${HOSTED_ATTEMPT}';
          ALTER TABLE saas.storefront_checkout_payment_bridges
            ENABLE TRIGGER storefront_checkout_payment_bridges_immutable;`,
        HOSTED_SNAPSHOT_TAMPER_DB);
        const corruptCapture = sql(box, `SET ROLE celebix_saas_workflow;
          SELECT outcome,result_payload FROM saas.payment_attempt_apply_hosted_callback(
            'paytr_iframe',repeat('8',64),'88000000-0000-4000-8000-000000000064'::uuid,
            repeat('a',64),repeat('b',64),2,1,'captured','provider-64',
            'payment_captured',11500,'TRY','2026-07-28T15:02:00.000Z'::timestamptz
          );`, HOSTED_SNAPSHOT_TAMPER_DB, true);
        assert.notEqual(corruptCapture.status, 0,
          "capture must reject item and top-level snapshot arithmetic corruption");
        assert.match(corruptCapture.stderr, /STOREFRONT_CHECKOUT_HOSTED_SETTLEMENT_CONFLICT/);
        assert.equal(sql(box, `SELECT attempt.status||'|'||bridge.status||'|'||
            reservation.status||'|'||variant.stock_quantity||'|'||
            (SELECT count(*) FROM saas.orders WHERE storefront_cart_id='${CART_A}')||'|'||
            (SELECT count(*) FROM saas.storefront_checkout_discount_redemptions)
          FROM saas.payment_attempts attempt
          JOIN saas.storefront_checkout_payment_bridges bridge ON bridge.attempt_id=attempt.id
          JOIN saas.checkout_inventory_reservations reservation
            ON reservation.payment_attempt_id=attempt.id
          JOIN saas.product_variants variant ON variant.id=reservation.variant_id
          WHERE attempt.id='${HOSTED_ATTEMPT}';`, HOSTED_SNAPSHOT_TAMPER_DB).stdout.trim(),
        "awaiting_customer|active|held|5|0|0",
        "corrupt capture must roll back before order, stock, reservation, or redemption effects");

      const downRaceVersion = prepareSubmittedCart(box, DOWN_CALLBACK_RACE_DB);
      assert.equal(call(box, beginHostedCall({ expectedVersion: downRaceVersion }),
        DOWN_CALLBACK_RACE_DB).outcome, "created");
      assert.equal(initializeHosted(box, DOWN_CALLBACK_RACE_DB).outcome, "awaiting_customer");
      const downCallbackRace = await exerciseConcurrentCallbackDown(box, DOWN_CALLBACK_RACE_DB);
      assert.equal(downCallbackRace.rollbackBlocked, true,
        "test must pause down after settlement admission and cart locking");
      assert.equal(downCallbackRace.callbackBlocked, true,
        "concurrent settlement must wait behind down admission without taking bridge/cart locks");
      assert.equal(downCallbackRace.rollback.ok, false);
      assert.match(downCallbackRace.rollback.error?.message ?? "", /STOREFRONT_CHECKOUT_DOWN_GUARD/);
      assert.equal(downCallbackRace.callback.ok, true,
        downCallbackRace.callback.error?.message ?? "captured callback must survive refused down");
      assert.equal(downCallbackRace.callback.outcome, "captured");
      assert.equal(sql(box, `SELECT count(*) FROM saas.orders
        WHERE storefront_cart_id='${CART_A}' AND payment_status='completed';`,
      DOWN_CALLBACK_RACE_DB).stdout.trim(), "1");

      legacyQuickCheckoutFixture(box, QUICK_CHECKOUT_DOWN_RACE_DB);
      const quickCheckoutDownRace = await exerciseLegacyQuickCheckoutDown(
        box, QUICK_CHECKOUT_DOWN_RACE_DB,
      );
      assert.equal(quickCheckoutDownRace.callbackBlocked, true,
        "legacy quick-checkout settlement must hold its attempt/reservation authority before order insertion");
      assert.equal(quickCheckoutDownRace.rollbackBlocked, true,
        "down must drain checkout_payment_attempts before taking shared order/reservation locks");
      assert.equal(quickCheckoutDownRace.callback.ok, true,
        quickCheckoutDownRace.callback.error?.message ??
          "legacy quick-checkout settlement must survive concurrent refused down");
      assert.equal(quickCheckoutDownRace.callback.outcome, "settled");
      assert.equal(quickCheckoutDownRace.rollback.ok, false);
      assert.match(quickCheckoutDownRace.rollback.error?.message ?? "", /STOREFRONT_CHECKOUT_DOWN_GUARD/);
      assert.equal(sql(box, `SELECT attempt.status||'|'||reservation.status||'|'||
          link.status||'|'||(SELECT count(*) FROM saas.orders
            WHERE quick_order_link_id=link.id)
        FROM saas.checkout_payment_attempts attempt
        JOIN saas.checkout_inventory_reservations reservation
          ON reservation.attempt_id=attempt.id
        JOIN saas.quick_order_links link ON link.id=attempt.quick_order_link_id
        WHERE attempt.id='68000000-0000-4000-8000-000000000064';`,
      QUICK_CHECKOUT_DOWN_RACE_DB).stdout.trim(), "succeeded|consumed|paid|1");

    const hostedVersion = prepareSubmittedCart(box, HOSTED_SETTLEMENT_DB);
    const hosted = call(box, beginHostedCall({ expectedVersion: hostedVersion }), HOSTED_SETTLEMENT_DB);
    assert.equal(hosted.outcome, "created");
    assert.equal(hosted.payload.reservationStatus, "held");
    assert.equal(hosted.payload.attemptId, HOSTED_ATTEMPT);
    assert.equal(hosted.payload.providerCode, "paytr_iframe");
    assert.equal(JSON.stringify(hosted.payload).includes("credential"), false);
    assert.equal(JSON.stringify(hosted.payload).includes("sealed"), false);
    assert.equal(sql(box, `SELECT attempt.status||'|'||bridge.status||'|'||reservation.status||'|'||
        (reservation.attempt_id IS NULL)::text||'|'||(reservation.quick_order_link_id IS NULL)::text
      FROM saas.payment_attempts attempt
      JOIN saas.storefront_checkout_payment_bridges bridge ON bridge.attempt_id=attempt.id
      JOIN saas.checkout_inventory_reservations reservation ON reservation.payment_attempt_id=attempt.id
      WHERE attempt.id='${HOSTED_ATTEMPT}';`, HOSTED_SETTLEMENT_DB).stdout.trim(),
    "created|active|held|true|true");
    assert.equal(initializeHosted(box, HOSTED_SETTLEMENT_DB).outcome, "awaiting_customer");
    const captured = settleHosted(box, HOSTED_SETTLEMENT_DB);
    assert.equal(captured.outcome, "captured");
    assert.equal(sql(box, `SELECT attempt.status||'|'||bridge.status||'|'||reservation.status||'|'||
        order_row.source||'|'||order_row.status||'|'||order_row.payment_status||'|'||
        cart.status||'|'||variant.stock_quantity||'|'||
        (SELECT count(*) FROM saas.orders WHERE storefront_cart_id=cart.id)
      FROM saas.payment_attempts attempt
      JOIN saas.storefront_checkout_payment_bridges bridge ON bridge.attempt_id=attempt.id
      JOIN saas.checkout_inventory_reservations reservation ON reservation.payment_attempt_id=attempt.id
      JOIN saas.orders order_row ON order_row.id=bridge.order_id
      JOIN saas.abandoned_carts cart ON cart.id=bridge.cart_id
      JOIN saas.product_variants variant ON variant.id=reservation.variant_id
      WHERE attempt.id='${HOSTED_ATTEMPT}';`, HOSTED_SETTLEMENT_DB).stdout.trim(),
    "captured|captured|consumed|storefront|confirmed|completed|archived|4|1");
    assert.equal(settleHosted(box, HOSTED_SETTLEMENT_DB).outcome, "operation_replayed");
    assert.equal(sql(box, `SELECT stock_quantity||'|'||(SELECT count(*) FROM saas.orders WHERE storefront_cart_id='${CART_A}')||'|'||
      (SELECT count(*) FROM saas.order_events event JOIN saas.orders order_row ON order_row.id=event.order_id
        WHERE order_row.storefront_cart_id='${CART_A}') FROM saas.product_variants WHERE id='${VARIANT}';`,
    HOSTED_SETTLEMENT_DB).stdout.trim(), "4|1|1",
    "callback replay must not duplicate the order/event or decrement stock twice");

    const failureVersion = prepareSubmittedCart(box, HOSTED_FAILURE_DB, null);
    assert.equal(call(box, beginHostedCall({ expectedVersion: failureVersion }), HOSTED_FAILURE_DB).outcome, "created");
    assert.equal(call(box, `SELECT outcome,result_payload FROM saas.payment_attempt_mark_initialized(
      '${HOSTED_ATTEMPT}','87000000-0000-4000-8000-000000000099',repeat('c',64),1,1,
      'failed',NULL,'initialization_failed','2026-07-28T15:01:00.000Z'
    )`, HOSTED_FAILURE_DB).outcome, "failed");
    assert.equal(sql(box, `SELECT bridge.status||'|'||reservation.status||'|'||cart.status||'|'||
        (SELECT count(*) FROM saas.orders WHERE storefront_cart_id=cart.id)
      FROM saas.storefront_checkout_payment_bridges bridge
      JOIN saas.checkout_inventory_reservations reservation ON reservation.payment_attempt_id=bridge.attempt_id
      JOIN saas.abandoned_carts cart ON cart.id=bridge.cart_id;`, HOSTED_FAILURE_DB).stdout.trim(),
    "failed|released|active|0",
    "provider failure must release its hold and leave the cart recoverable without a paid order");

    const denialVersion = prepareSubmittedCart(box, METHOD_DENIAL_DB, null);
    assert.equal(call(box, submitBuiltInCall({
      expectedVersion: denialVersion,
      operationId: "82000000-0000-4000-8000-000000000099",
      paymentMethodId: CROSS_STORE_METHOD,
    }), METHOD_DENIAL_DB).outcome, "payment_method_unavailable",
    "a cross-store method id must fail closed");
    sql(box, `SET ROLE celebix_saas_owner; UPDATE saas.payment_methods SET
      state='emergency_disabled',emergency_reason='incident',version=version+1,updated_at='${NOW}'
      WHERE id='${PROVIDER_METHOD}';`, METHOD_DENIAL_DB);
    assert.equal(call(box, beginHostedCall({ expectedVersion: denialVersion }), METHOD_DENIAL_DB).outcome,
      "payment_method_unavailable", "an emergency-disabled provider must fail closed");

    const builtInRaceVersion = prepareSubmittedCart(box, BUILTIN_RACE_DB, null);
    const builtInRaceOutcomes = await Promise.all([
      concurrentUpdate(box, BUILTIN_RACE_DB, submitBuiltInCall({
        expectedVersion: builtInRaceVersion,
        operationId: "82000000-0000-4000-8000-000000000081",
        fingerprint: "1".repeat(64),
      }), "built-in-submit-race-a"),
      concurrentUpdate(box, BUILTIN_RACE_DB, submitBuiltInCall({
        expectedVersion: builtInRaceVersion,
        operationId: "82000000-0000-4000-8000-000000000082",
        fingerprint: "2".repeat(64),
      }), "built-in-submit-race-b"),
    ]);
    assert.equal(builtInRaceOutcomes.filter((outcome) => outcome === "placed").length, 1,
      "simultaneous built-in submits must place exactly one order");
    assert.equal(sql(box, `SELECT count(*) FROM saas.orders
      WHERE storefront_cart_id='${CART_A}';`, BUILTIN_RACE_DB).stdout.trim(), "1");

    const emergencyVersion = prepareSubmittedCart(box, EMERGENCY_RACE_DB, null);
    const emergencyRace = await exerciseEmergencyDisableRace(box, EMERGENCY_RACE_DB, emergencyVersion);
    assert.equal(emergencyRace.blocked, true,
      "hosted begin must serialize behind the selected payment method row");
    assert.equal(emergencyRace.outcome, "payment_method_unavailable",
      "a concurrently committed emergency disable must fail hosted begin closed");
    assert.equal(sql(box, `SELECT count(*) FROM saas.payment_attempts
      WHERE id='${HOSTED_ATTEMPT}';`, EMERGENCY_RACE_DB).stdout.trim(), "0");

    addSecondCheckoutCart(box, DISCOUNT_USAGE_RACE_DB);
    sql(box, `SET ROLE celebix_saas_owner; UPDATE saas.merchant_admin_records SET
      config=config||'{"usageLimit":1}'::jsonb,version=version+1,updated_at='${NOW}'
      WHERE id='${DISCOUNT}';`, DISCOUNT_USAGE_RACE_DB);
    const usageVersionA = prepareSubmittedCart(box, DISCOUNT_USAGE_RACE_DB);
    const usageVersionB = prepareSubmittedCart(box, DISCOUNT_USAGE_RACE_DB, "YAZ10", {
      credentialDigest: CART_B_DIGEST,
      currentNonce: "1".repeat(64),
      nextNonce: "2".repeat(64),
      operationId: "81000000-0000-4000-8000-000000000083",
    });
    const usageOutcomes = await Promise.all([
      concurrentUpdate(box, DISCOUNT_USAGE_RACE_DB, submitBuiltInCall({
        expectedVersion: usageVersionA,
        operationId: "82000000-0000-4000-8000-000000000083",
        fingerprint: "3".repeat(64),
      }), "discount-usage-race-a"),
      concurrentUpdate(box, DISCOUNT_USAGE_RACE_DB, submitBuiltInCall({
        expectedVersion: usageVersionB,
        operationId: "82000000-0000-4000-8000-000000000084",
        fingerprint: "4".repeat(64),
        nonce: "2".repeat(64),
        credentialDigest: CART_B_DIGEST,
      }), "discount-usage-race-b"),
    ]);
    assert.deepEqual([...usageOutcomes].sort(), ["discount_invalid", "placed"],
      "a one-use coupon must be serialized across simultaneous carts");
    assert.equal(sql(box, `SELECT count(*)||'|'||
      (SELECT count(*) FROM saas.storefront_checkout_discount_redemptions
       WHERE discount_record_id='${DISCOUNT}') FROM saas.orders
      WHERE storefront_cart_id IN('${CART_A}','${CART_B}');`, DISCOUNT_USAGE_RACE_DB).stdout.trim(), "1|1");

    for (const role of ["celebix_saas_app", "celebix_saas_workflow"]) {
      for (const relation of [
        "storefront_checkout_discount_redemptions",
        "storefront_checkout_payment_bridges",
      ]) {
        assert.notEqual(sql(box, `SET ROLE ${role}; SELECT count(*) FROM saas.${relation};`, DB, true).status, 0,
          `${role} must have zero raw read authority on ${relation}`);
        assert.notEqual(sql(box, `SET ROLE ${role}; DELETE FROM saas.${relation};`, DB, true).status, 0,
          `${role} must have zero raw DML authority on ${relation}`);
      }
    }

    sql(box, `CREATE DATABASE ${MAX_PAYLOAD_DB} TEMPLATE ${DB};`, "postgres");
    maximumCartFixture(box, MAX_PAYLOAD_DB);
    const maximumQuote = quote(box, HOST_A, CART_A_DIGEST, MAX_PAYLOAD_DB);
    assert.equal(maximumQuote.outcome, "found");
    assert.equal(maximumQuote.payload.items.length, 100);
    assert.equal(Number(sql(box, `SET ROLE celebix_saas_workflow;
      SELECT pg_catalog.pg_column_size(result_payload)
      FROM saas.storefront_checkout_get_quote(
        '${HOST_A}','${CART_A_DIGEST}','${NOW}'::timestamptz
      );`, MAX_PAYLOAD_DB).stdout.trim()) > 65_536, true,
    "the maximum valid multibyte cart must exercise a replay larger than the old cap");
    const maximumIssued = call(box, `SELECT outcome,result_payload
      FROM saas.storefront_checkout_issue_nonce(
        '${HOST_A}','${CART_A_DIGEST}','${NONCE_1}','${NOW}'::timestamptz
      )`, MAX_PAYLOAD_DB);
    assert.equal(maximumIssued.outcome, "issued");
    const maximumOperationId = "80000000-0000-4000-8000-000000000074";
    const maximumFingerprint = "d".repeat(64);
    const maximumUpdateCommand = sql(box, `SET ROLE celebix_saas_workflow; ${updateCall({
      expectedVersion: 2,
      operationId: maximumOperationId,
      fingerprint: maximumFingerprint,
      currentNonce: NONCE_1,
      nextNonce: NONCE_2,
    })};`, MAX_PAYLOAD_DB, true);
    assert.equal(maximumUpdateCommand.status, 0,
      `maximum valid delivery update must stay finite, not throw: ${maximumUpdateCommand.stderr}`);
    const maximumSeparator = maximumUpdateCommand.stdout.trim().indexOf("|");
    const maximumUpdated = {
      outcome: maximumUpdateCommand.stdout.trim().slice(0, maximumSeparator),
      payload: JSON.parse(maximumUpdateCommand.stdout.trim().slice(maximumSeparator + 1)),
    };
    assert.equal(maximumUpdated.outcome, "updated");
    const maximumReplay = call(box, updateCall({
      expectedVersion: 2,
      operationId: maximumOperationId,
      fingerprint: maximumFingerprint,
      currentNonce: NONCE_1,
      nextNonce: NONCE_2,
    }), MAX_PAYLOAD_DB);
    assert.equal(maximumReplay.outcome, "operation_replayed");
    assert.deepEqual(maximumReplay.payload, maximumUpdated.payload,
      "a maximum valid multibyte cart must replay the exact canonical projection");

    const initial = quote(box);
    assert.equal(initial.outcome, "found");
    assert.deepEqual(Object.keys(initial.payload).sort(), [
      "cartId", "cartVersion", "currency", "discountCents", "discountCode", "items", "locale",
      "paymentMethods", "policyLinks", "schemaVersion", "selectedShippingId", "shippingCents",
      "shippingOptions", "storeName", "subtotalCents", "totalCents",
    ]);
    assert.equal(initial.payload.storeName, "Store A");
    assert.equal(initial.payload.shippingOptions[0].priceCents, 2_500);
    assert.equal(initial.payload.paymentMethods.filter((method) => method.kind === "provider").length, 1);
    assert.deepEqual(
      Object.keys(initial.payload.paymentMethods.find((method) => method.kind === "provider")).sort(),
      ["id", "kind", "label", "logoPath", "providerCode"],
    );
    assert.equal(initial.payload.paymentMethods.some((method) => method.kind === "bank_transfer"), true);
    assert.equal(initial.payload.paymentMethods.some((method) => method.kind === "cash_on_delivery"), true);
    assert.equal(initial.payload.policyLinks[0].href, "/politikalar/distance_sales");
    assert.equal(Object.hasOwn(initial.payload, "checkoutNonce"), false);
    assert.equal(JSON.stringify(initial.payload).includes("sealed_credentials"), false);
    assert.equal(JSON.stringify(initial.payload).includes("credential_digest"), false);
    assert.equal(quote(box, HOST_B, CART_A_DIGEST).outcome, "not_found");
    assert.equal(quote(box, HOST_A, WRONG_DIGEST).outcome, "not_found");

    assert.equal(sql(box, `SET ROLE celebix_saas_owner;
      SELECT saas.merchant_admin_config_valid('shipping_setting','{"regions":["TR"],"flatRateCents":2500}'::jsonb);`).stdout.trim(), "t");
    assert.equal(sql(box, `SET ROLE celebix_saas_owner;
      SELECT saas.merchant_admin_config_valid('shipping_setting','{"regions":["TR"],"unexpected":1}'::jsonb);`).stdout.trim(), "f");
    assert.equal(sql(box, `SET ROLE celebix_saas_owner;
      SELECT saas.merchant_admin_config_valid('shipping_setting','{"flatRateCents":1.5}'::jsonb);`).stdout.trim(), "f");

    sql(box, `SET ROLE celebix_saas_owner;
      UPDATE saas.merchant_admin_records SET
        config='{"regions":["TR"],"freeShippingThresholdCents":50000,"estimatedDays":3}',
        version=version+1,updated_at='${NOW}'
      WHERE id='${SHIPPING}';`);
    assert.equal(quote(box).payload.shippingOptions[0].priceCents, 0,
      "legacy active shipping settings without flatRateCents stay truthful and free");
    sql(box, `SET ROLE celebix_saas_owner;
      UPDATE saas.merchant_admin_records SET status='draft',version=version+1,updated_at='${NOW}'
      WHERE id='${SHIPPING}';`);
    const fallbackShipping = quote(box).payload.shippingOptions[0];
    assert.equal(fallbackShipping.priceCents, 0);
    assert.equal(fallbackShipping.label, "Ücretsiz standart teslimat");
    sql(box, `SET ROLE celebix_saas_owner;
      UPDATE saas.merchant_admin_records SET
        status='active',config='{"regions":["TR"],"flatRateCents":2500,"freeShippingThresholdCents":50000,"estimatedDays":3}',
        version=version+1,updated_at='${NOW}'
      WHERE id='${SHIPPING}';`);

    sql(box, `SET ROLE celebix_saas_owner;
      UPDATE saas.product_variants SET price_cents=12000,version=version+1,updated_at='${NOW}' WHERE id='${VARIANT}';`);
    assert.equal(quote(box).payload.subtotalCents, 12_000, "quote must re-read effective variant prices");
    sql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
      SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);
      SELECT pg_catalog.set_config('saas.inventory.source_id','77000000-0000-4000-8000-000000000065',true);
      SELECT pg_catalog.set_config('saas.inventory.source_time','${NOW}',true);
      UPDATE saas.product_variants SET price_cents=10000,stock_quantity=0,version=version+1,updated_at='${NOW}' WHERE id='${VARIANT}';
      COMMIT;`);
    assert.equal(quote(box).outcome, "stock_unavailable", "quote must revalidate stock");
    sql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
      SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);
      SELECT pg_catalog.set_config('saas.inventory.source_id','77000000-0000-4000-8000-000000000066',true);
      SELECT pg_catalog.set_config('saas.inventory.source_time','${NOW}',true);
      UPDATE saas.product_variants SET stock_quantity=5,version=version+1,updated_at='${NOW}' WHERE id='${VARIANT}';
      UPDATE saas.payment_methods SET state='emergency_disabled',emergency_reason='incident',version=version+1,updated_at='${NOW}'
      WHERE id='${PROVIDER_METHOD}'; COMMIT;`);

    sql(box, `SET session_replication_role=replica;
      INSERT INTO saas.checkout_inventory_reservations(
        id,store_id,attempt_id,quick_order_link_id,product_id,variant_id,quantity,
        stock_tracked,status,held_at,version,updated_at
      ) VALUES(
        '79000000-0000-4000-8000-000000000064','${STORE_A}',
        '79000000-0000-4000-8000-000000000065','79000000-0000-4000-8000-000000000066',
        '${PRODUCT}','${VARIANT}',5,true,'held','${NOW}',1,'${NOW}'
      );
      SET session_replication_role=origin;`);
    assert.equal(quote(box).outcome, "stock_unavailable",
      "held stock reservations must reduce availability");
    sql(box, `SET session_replication_role=replica;
      UPDATE saas.checkout_inventory_reservations SET stock_tracked=false
      WHERE id='79000000-0000-4000-8000-000000000064';
      SET session_replication_role=origin;`);
    assert.equal(quote(box).outcome, "found",
      "non-stock-tracked holds must not reduce availability");
    sql(box, `SET session_replication_role=replica;
      DELETE FROM saas.checkout_inventory_reservations
      WHERE id='79000000-0000-4000-8000-000000000064';
      SET session_replication_role=origin;`);

    assert.equal(quote(box).payload.paymentMethods.some((method) => method.kind === "provider"), false);
    sql(box, `SET ROLE celebix_saas_owner;
      UPDATE saas.payment_methods SET state='active',emergency_reason=NULL,version=version+1,updated_at='${NOW}'
      WHERE id='${PROVIDER_METHOD}';`);

    const issued = call(box, `SELECT outcome,result_payload FROM saas.storefront_checkout_issue_nonce(
      '${HOST_A}','${CART_A_DIGEST}','${NONCE_1}','${NOW}'::timestamptz
    )`);
    assert.equal(issued.outcome, "issued");
    assert.equal(issued.payload.cartVersion, 2);
    assert.equal(JSON.stringify(issued.payload).includes(NONCE_1), false);
    const issuedReplay = call(box, `SELECT outcome,result_payload FROM saas.storefront_checkout_issue_nonce(
      '${HOST_A}','${CART_A_DIGEST}','${NONCE_1}','${NOW}'::timestamptz
    )`);
    assert.equal(issuedReplay.outcome, "issued");
    assert.deepEqual(issuedReplay.payload, issued.payload,
      "retrying the same candidate digest must recover the unknown commit without another write");

    const conflict = call(box, updateCall({
      expectedVersion: 99,
      operationId: "80000000-0000-4000-8000-000000000064",
      fingerprint: "1".repeat(64),
      currentNonce: NONCE_1,
      nextNonce: NONCE_2,
    }));
    assert.equal(conflict.outcome, "version_conflict");

    const invalidAddress = call(box, updateCall({
      expectedVersion: 2,
      operationId: "80000000-0000-4000-8000-000000000065",
      fingerprint: "2".repeat(64),
      currentNonce: NONCE_1,
      nextNonce: NONCE_2,
      shippingAddress: { ...VALID_ADDRESS, unexpected: "rejected" },
    }));
    assert.equal(invalidAddress.outcome, "invalid_input");

    const overlongCombinedName = call(box, updateCall({
      expectedVersion: 2,
      operationId: "80000000-0000-4000-8000-000000000070",
      fingerprint: "8".repeat(64),
      currentNonce: NONCE_1,
      nextNonce: NONCE_2,
      shippingAddress: {
        ...VALID_ADDRESS,
        firstName: "A".repeat(110),
        lastName: "B".repeat(110),
      },
    }));
    assert.equal(overlongCombinedName.outcome, "invalid_input");

    const operationId = "80000000-0000-4000-8000-000000000066";
    const fingerprint = "3".repeat(64);
    const updated = call(box, updateCall({
      expectedVersion: 2,
      operationId,
      fingerprint,
      currentNonce: NONCE_1,
      nextNonce: NONCE_2,
      discountCode: "YAZ10",
    }));
    assert.equal(updated.outcome, "updated");
    assert.equal(updated.payload.discountCents, 1_000);
    assert.equal(updated.payload.shippingCents, 2_500);
    assert.equal(updated.payload.totalCents, 11_500);

    const replay = call(box, updateCall({
      expectedVersion: 2,
      operationId,
      fingerprint,
      currentNonce: NONCE_1,
      nextNonce: NONCE_2,
      discountCode: "YAZ10",
    }));
    assert.equal(replay.outcome, "operation_replayed");
    assert.deepEqual(replay.payload, updated.payload);
    assert.equal(call(box, updateCall({
      expectedVersion: 2,
      operationId,
      fingerprint: "4".repeat(64),
      currentNonce: NONCE_1,
      nextNonce: NONCE_2,
      discountCode: "YAZ10",
    })).outcome, "operation_mismatch");
    assert.equal(call(box, `SELECT outcome,result_payload FROM saas.storefront_checkout_recover_operation(
      '${HOST_A}','${CART_A_DIGEST}','${operationId}'::uuid,'${fingerprint}','${NOW}'::timestamptz
    )`).outcome, "operation_replayed");
    assert.equal(call(box, `SELECT outcome,result_payload FROM saas.storefront_checkout_recover_operation(
      '${HOST_B}','${CART_A_DIGEST}','${operationId}'::uuid,'${fingerprint}','${NOW}'::timestamptz
    )`).outcome, "not_found");
    assert.equal(call(box, `SELECT outcome,result_payload FROM saas.storefront_checkout_recover_operation(
      '${HOST_A}','${WRONG_DIGEST}','${operationId}'::uuid,'${fingerprint}','${NOW}'::timestamptz
    )`).outcome, "not_found");

    sql(box, `SET ROLE celebix_saas_owner;
      UPDATE saas.merchant_admin_records SET
        config=config||'{"usageLimit":2}'::jsonb,version=version+1,updated_at='${NOW}'
      WHERE id='${DISCOUNT}';
      INSERT INTO saas.merchant_admin_events(
        id,store_id,record_id,record_kind,event_kind,summary,occurred_at
      ) VALUES(
        '79000000-0000-4000-8000-000000000067','${STORE_A}','${DISCOUNT}',
        'discount','coupon_used','{}','${NOW}'
      );`);
    const withinUsageLimit = call(box, updateCall({
      expectedVersion: 3,
      operationId: "80000000-0000-4000-8000-000000000071",
      fingerprint: "9".repeat(64),
      currentNonce: NONCE_2,
      nextNonce: NONCE_3,
      discountCode: "YAZ10",
    }));
    assert.equal(withinUsageLimit.outcome, "updated",
      "a coupon below usageLimit remains available");
    sql(box, `SET ROLE celebix_saas_owner;
      INSERT INTO saas.merchant_admin_events(
        id,store_id,record_id,record_kind,event_kind,summary,occurred_at
      ) VALUES(
        '79000000-0000-4000-8000-000000000068','${STORE_A}','${DISCOUNT}',
        'discount','coupon_used','{}','${NOW}'
      );`);
    assert.equal(call(box, updateCall({
      expectedVersion: 4,
      operationId: "80000000-0000-4000-8000-000000000072",
      fingerprint: "a".repeat(64),
      currentNonce: NONCE_3,
      nextNonce: "f".repeat(64),
      discountCode: "YAZ10",
    })).outcome, "discount_invalid", "an exhausted usageLimit must reject the coupon");

    const expired = call(box, updateCall({
      expectedVersion: 4,
      operationId: "80000000-0000-4000-8000-000000000067",
      fingerprint: "5".repeat(64),
      currentNonce: NONCE_3,
      nextNonce: "f".repeat(64),
      discountCode: "EXPIRED",
    }));
    assert.equal(expired.outcome, "discount_invalid");

    sql(box, `CREATE DATABASE ${RACE_DB} TEMPLATE ${DB};`, "postgres");
    const raceA = updateCall({
      expectedVersion: 4,
      operationId: "80000000-0000-4000-8000-000000000068",
      fingerprint: "6".repeat(64),
      currentNonce: NONCE_3,
      nextNonce: "f".repeat(64),
    });
    const raceB = updateCall({
      expectedVersion: 4,
      operationId: "80000000-0000-4000-8000-000000000069",
      fingerprint: "7".repeat(64),
      currentNonce: NONCE_3,
      nextNonce: "0".repeat(64),
    });
    const raceOutcomes = await Promise.all([
      concurrentUpdate(box, RACE_DB, raceA, "delivery-race-a"),
      concurrentUpdate(box, RACE_DB, raceB, "delivery-race-b"),
    ]);
    assert.deepEqual(raceOutcomes.sort(), ["updated", "version_conflict"]);

    assert.equal(sql(box, `BEGIN;
      SET LOCAL ROLE celebix_saas_owner;
      ALTER TABLE saas.store_domains DISABLE TRIGGER store_domains_authority_guard;
      UPDATE saas.store_domains SET is_primary=false,updated_at='${NOW}'
      WHERE store_id='${STORE_A}' AND is_primary;
      ALTER TABLE saas.store_domains ENABLE TRIGGER store_domains_authority_guard;
      SET LOCAL ROLE celebix_saas_workflow;
      SELECT pg_catalog.concat_ws('|',
        (SELECT outcome FROM saas.storefront_checkout_get_quote('${HOST_A}','${CART_A_DIGEST}','${NOW}')),
        (SELECT outcome FROM saas.storefront_checkout_issue_nonce('${HOST_A}','${CART_A_DIGEST}','${NONCE_3}','${NOW}')),
        (SELECT outcome FROM saas.storefront_checkout_update_delivery(
          '${HOST_A}','${CART_A_DIGEST}',4,'80000000-0000-4000-8000-000000000073',repeat('b',64),
          '${NONCE_3}',repeat('f',64),'ada@example.test',true,
          '${JSON.stringify(VALID_ADDRESS)}'::jsonb,NULL,'standard',NULL,'${NOW}'
        )),
        (SELECT outcome FROM saas.storefront_checkout_recover_operation(
          '${HOST_A}','${CART_A_DIGEST}','${operationId}',repeat('3',64),'${NOW}'
        )),
        (SELECT outcome FROM saas.storefront_checkout_get_status('${HOST_A}','${CART_A_DIGEST}','${NOW}')),
        (SELECT outcome FROM saas.storefront_checkout_get_policy('${HOST_A}','distance_sales','${NOW}'))
      );
      ROLLBACK;`).stdout.trim(),
    "not_found|not_found|not_found|not_found|not_found|not_found",
    "all checkout endpoints must consume canonical-primary exact-host authority");

    assert.equal(call(box, `SELECT outcome,result_payload FROM saas.storefront_checkout_get_status(
      '${HOST_A}','${CART_A_DIGEST}','${NOW}'::timestamptz
    )`).payload.kind, "ready");
    const wrongSourceOrder = sql(box, `SET ROLE celebix_saas_owner;
      INSERT INTO saas.orders(
        id,store_id,order_number,source,customer_name,customer_email,currency,
        subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,
        shipping_address,version,created_at,updated_at,storefront_cart_id
      ) VALUES(
        '81000000-0000-4000-8000-000000000063','${STORE_A}','MANUAL-INVALID','manual_import',
        'Ada Yilmaz','ada@example.test','TRY',10000,2500,1000,11500,'pending','pending',
        '${JSON.stringify(VALID_ADDRESS)}',1,'${NOW}','${NOW}','${CART_A}'
      );`, DB, true);
    assert.notEqual(wrongSourceOrder.status, 0, "only storefront orders may bind a storefront cart");
    sql(box, `SET ROLE celebix_saas_owner;
      UPDATE saas.abandoned_carts SET selected_payment_method_id='${BANK_METHOD}',version=version+1,updated_at='${NOW}'
      WHERE id='${CART_A}';
      INSERT INTO saas.orders(
        id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,
        subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,
        shipping_address,tracking,version,created_at,updated_at,storefront_cart_id
      ) VALUES(
        '81000000-0000-4000-8000-000000000064','${STORE_A}','SF-2026-0001','storefront',
        'Ada Yilmaz','ada@example.test','+905551112233','TRY',10000,2500,1000,11500,
        'pending','pending','${JSON.stringify(VALID_ADDRESS)}',NULL,1,'${NOW}','${NOW}','${CART_A}'
      );`);
    const placed = call(box, `SELECT outcome,result_payload FROM saas.storefront_checkout_get_status(
      '${HOST_A}','${CART_A_DIGEST}','${NOW}'::timestamptz
    )`);
    assert.equal(placed.outcome, "found");
    assert.equal(placed.payload.kind, "placed");
    assert.equal(placed.payload.orderNumber, "SF-2026-0001");
    assert.equal(placed.payload.method.iban, "TR330006100519786457841326");
    assert.equal(JSON.stringify(placed.payload).includes("profileId"), false);

    const policy = call(box, `SELECT outcome,result_payload FROM saas.storefront_checkout_get_policy(
      '${HOST_A}','distance_sales','${NOW}'::timestamptz
    )`);
    assert.equal(policy.outcome, "found");
    assert.deepEqual(Object.keys(policy.payload).sort(), ["body", "effectiveAt", "label", "policyType"]);

    assert.equal(sql(box, `SET ROLE celebix_saas_workflow; SELECT saas.storefront_checkout_preflight();`).stdout.trim(), "t");
    sql(box, `CREATE DATABASE ${ROLE_TAMPER_DB} TEMPLATE ${DB};`, "postgres");
    sql(box, `SET ROLE celebix_saas_owner;
      GRANT EXECUTE ON FUNCTION saas.storefront_checkout_get_quote(
        text,text,timestamp with time zone
      ) TO celebix_saas_app;`, ROLE_TAMPER_DB);
    assert.equal(sql(box, `SELECT saas.storefront_checkout_preflight();`, ROLE_TAMPER_DB).stdout.trim(), "f",
      "preflight must reject an app grant on a workflow-only checkout function");
    assert.notEqual(apply(box, ASSERTIONS, ROLE_TAMPER_DB, true).status, 0,
      "assertions must reject an app grant on a workflow-only checkout function");
    sql(box, `SET ROLE celebix_saas_owner;
      REVOKE EXECUTE ON FUNCTION saas.storefront_checkout_get_quote(
        text,text,timestamp with time zone
      ) FROM celebix_saas_app;`, ROLE_TAMPER_DB);
    assert.equal(sql(box, `SELECT saas.storefront_checkout_preflight();`, ROLE_TAMPER_DB).stdout.trim(), "t");
    sql(box, `SET ROLE celebix_saas_owner;
      REVOKE EXECUTE ON FUNCTION saas.storefront_checkout_issue_nonce(
        text,text,text,timestamp with time zone
      ) FROM celebix_saas_workflow;`, ROLE_TAMPER_DB);
    const revokedWorkflowIssue = sql(box, `SET ROLE celebix_saas_workflow;
      SELECT outcome FROM saas.storefront_checkout_issue_nonce(
        '${HOST_A}','${CART_A_DIGEST}','${"9".repeat(64)}','${NOW}'::timestamptz
      );`, ROLE_TAMPER_DB, true);
    assert.notEqual(revokedWorkflowIssue.status, 0,
      "a revoked workflow grant must deny the real nonce function");
    assert.equal(sql(box, `SELECT saas.storefront_checkout_preflight();`, ROLE_TAMPER_DB).stdout.trim(), "f",
      "preflight must reject a missing workflow function grant");
    assert.notEqual(apply(box, ASSERTIONS, ROLE_TAMPER_DB, true).status, 0,
      "assertions must reject a missing workflow function grant");
    sql(box, `SET ROLE celebix_saas_owner;
      GRANT EXECUTE ON FUNCTION saas.storefront_checkout_issue_nonce(
        text,text,text,timestamp with time zone
      ) TO celebix_saas_workflow;`, ROLE_TAMPER_DB);
    assert.equal(sql(box, `SELECT saas.storefront_checkout_preflight();`, ROLE_TAMPER_DB).stdout.trim(), "t");
    apply(box, ASSERTIONS, ROLE_TAMPER_DB);

    sql(box, `CREATE DATABASE ${BODY_TAMPER_DB} TEMPLATE ${DB};`, "postgres");
    sql(box, `SET ROLE celebix_saas_owner;
      CREATE OR REPLACE FUNCTION saas.storefront_checkout_get_quote(
        p_hostname text,p_credential_digest text,p_now timestamptz
      ) RETURNS TABLE(outcome text,result_payload jsonb)
      LANGUAGE plpgsql STABLE SECURITY DEFINER
      SET search_path=pg_catalog,saas
      AS $body$ BEGIN
        RETURN QUERY SELECT 'found'::text,'{}'::jsonb;
      END $body$;`, BODY_TAMPER_DB);
    assert.equal(sql(box, `SELECT saas.storefront_checkout_preflight();`, BODY_TAMPER_DB).stdout.trim(), "f",
      "preflight must reject a public checkout function with constant-body drift");
    const tamperedQuoteHash = sql(box, `SELECT pg_catalog.md5(prosrc)
      FROM pg_catalog.pg_proc
      WHERE oid='saas.storefront_checkout_get_quote(text,text,timestamp with time zone)'::regprocedure;`, BODY_TAMPER_DB).stdout.trim();
    assert.notEqual(apply(box, UP, BODY_TAMPER_DB, true).status, 0,
      "reapply over body drift must fail closed");
    assert.equal(sql(box, `SELECT pg_catalog.md5(prosrc)
      FROM pg_catalog.pg_proc
      WHERE oid='saas.storefront_checkout_get_quote(text,text,timestamp with time zone)'::regprocedure;`, BODY_TAMPER_DB).stdout.trim(), tamperedQuoteHash,
    "failed reapply must preserve the existing state transactionally");
    assert.notEqual(apply(box, ASSERTIONS, BODY_TAMPER_DB, true).status, 0,
      "assertions must independently reject public function body drift");

    sql(box, `CREATE DATABASE ${PREFLIGHT_BODY_TAMPER_DB} TEMPLATE ${DB};`, "postgres");
    sql(box, `SET ROLE celebix_saas_owner;
      CREATE OR REPLACE FUNCTION saas.storefront_checkout_preflight()
      RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
      SET search_path=pg_catalog,saas
      AS $body$ BEGIN RETURN true; END $body$;`, PREFLIGHT_BODY_TAMPER_DB);
    const selfBodyAssertions = apply(box, ASSERTIONS, PREFLIGHT_BODY_TAMPER_DB, true);
    assert.notEqual(selfBodyAssertions.status, 0,
      "assertions must fingerprint the preflight body instead of trusting a constant true");
    assert.match(selfBodyAssertions.stderr, /STOREFRONT_CHECKOUT_ASSERT_FUNCTION_BODY_INVALID/);
    sql(box, `SET session_replication_role=replica;
      DELETE FROM saas.storefront_checkout_operations;
      UPDATE saas.orders SET storefront_cart_id=NULL WHERE storefront_cart_id IS NOT NULL;
      UPDATE saas.abandoned_carts SET
        marketing_opt_in=false,shipping_address=NULL,billing_address=NULL,
        shipping_method_code=NULL,shipping_cents=0,discount_record_id=NULL,
        discount_code=NULL,discount_cents=0,total_cents=subtotal_cents,
        checkout_nonce_digest=NULL,selected_payment_method_id=NULL;
      UPDATE saas.merchant_admin_records SET config=config-'flatRateCents'
      WHERE record_kind='shipping_setting' AND config?'flatRateCents';
      SET session_replication_role=origin;`, PREFLIGHT_BODY_TAMPER_DB);
    const tamperedPreflightDown = apply(box, DOWN, PREFLIGHT_BODY_TAMPER_DB, true);
    assert.notEqual(tamperedPreflightDown.status, 0,
      "down must independently reject a constant-true preflight body");
    assert.match(tamperedPreflightDown.stderr, /STOREFRONT_CHECKOUT_DOWN_SOURCE_INVALID/);
    assert.equal(sql(box, `SELECT pg_catalog.to_regclass(
      'saas.storefront_checkout_operations'
    ) IS NOT NULL;`, PREFLIGHT_BODY_TAMPER_DB).stdout.trim(), "t",
    "a refused down over preflight drift must preserve migration 064 transactionally");

    sql(box, `CREATE DATABASE ${TRIGGER_TAMPER_DB} TEMPLATE ${DB};`, "postgres");
    sql(box, `SET ROLE celebix_saas_owner;
      DROP TRIGGER storefront_checkout_operations_immutable
        ON saas.storefront_checkout_operations;
      CREATE TRIGGER storefront_checkout_operations_immutable
        BEFORE UPDATE ON saas.storefront_checkout_operations
        FOR EACH ROW EXECUTE FUNCTION saas.guard_storefront_checkout_operation_mutation();`, TRIGGER_TAMPER_DB);
    assert.equal(sql(box, `SELECT saas.storefront_checkout_preflight();`, TRIGGER_TAMPER_DB).stdout.trim(), "f",
      "preflight must reject incomplete immutable-trigger event shape");
    assert.notEqual(apply(box, ASSERTIONS, TRIGGER_TAMPER_DB, true).status, 0,
      "assertions must attest the exact immutable-trigger shape");

    sql(box, `CREATE DATABASE ${PERSISTENCE_TAMPER_DB} TEMPLATE ${DB};`, "postgres");
    sql(box, `SET ROLE celebix_saas_owner;
      ALTER TABLE saas.storefront_checkout_operations SET UNLOGGED;`, PERSISTENCE_TAMPER_DB);
    assert.equal(sql(box, `SELECT saas.storefront_checkout_preflight();`, PERSISTENCE_TAMPER_DB).stdout.trim(), "f",
      "preflight must reject an unlogged durable operation relation");
    assert.notEqual(apply(box, ASSERTIONS, PERSISTENCE_TAMPER_DB, true).status, 0,
      "assertions must attest durable relation kind and persistence");

    sql(box, `CREATE DATABASE ${SETTLEMENT_TABLE_TAMPER_DB} TEMPLATE ${DB};`, "postgres");
    sql(box, `SET ROLE celebix_saas_owner;
      ALTER TABLE saas.storefront_checkout_payment_bridges DISABLE ROW LEVEL SECURITY;`,
    SETTLEMENT_TABLE_TAMPER_DB);
    assert.equal(sql(box, `SELECT saas.storefront_checkout_preflight();`,
      SETTLEMENT_TABLE_TAMPER_DB).stdout.trim(), "f",
    "preflight must reject weakened hosted-bridge row security");
    assert.notEqual(apply(box, ASSERTIONS, SETTLEMENT_TABLE_TAMPER_DB, true).status, 0,
      "assertions must independently attest settlement table row security");

    sql(box, `CREATE DATABASE ${SETTLEMENT_TRIGGER_TAMPER_DB} TEMPLATE ${DB};`, "postgres");
    sql(box, `SET ROLE celebix_saas_owner;
      ALTER TABLE saas.payment_attempts DISABLE TRIGGER payment_attempt_storefront_checkout_terminal;`,
    SETTLEMENT_TRIGGER_TAMPER_DB);
    assert.equal(sql(box, `SELECT saas.storefront_checkout_preflight();`,
      SETTLEMENT_TRIGGER_TAMPER_DB).stdout.trim(), "f",
    "preflight must reject a disabled storefront settlement trigger");
    assert.notEqual(apply(box, ASSERTIONS, SETTLEMENT_TRIGGER_TAMPER_DB, true).status, 0,
      "assertions must independently attest the payment-attempt terminal trigger");

    sql(box, `CREATE DATABASE ${PREFLIGHT_DB} TEMPLATE ${DB};`, "postgres");
    sql(box, `SET ROLE celebix_saas_owner;
      ALTER TABLE saas.abandoned_carts DROP CONSTRAINT abandoned_carts_shipping_method_code_check;
      ALTER TABLE saas.abandoned_carts ADD CONSTRAINT abandoned_carts_shipping_method_code_check CHECK(true);`, PREFLIGHT_DB);
    assert.equal(sql(box, `SELECT saas.storefront_checkout_preflight();`, PREFLIGHT_DB).stdout.trim(), "f",
      "preflight must reject a named constraint with the wrong definition");
    sql(box, `SET ROLE celebix_saas_owner;
      ALTER TABLE saas.abandoned_carts DROP CONSTRAINT abandoned_carts_shipping_method_code_check;
      ALTER TABLE saas.abandoned_carts ADD CONSTRAINT abandoned_carts_shipping_method_code_check CHECK(
        shipping_method_code IS NULL OR shipping_method_code='standard'
      );`, PREFLIGHT_DB);
    assert.equal(sql(box, `SELECT saas.storefront_checkout_preflight();`, PREFLIGHT_DB).stdout.trim(), "t");
    sql(box, `SET ROLE celebix_saas_owner;
      ALTER TABLE saas.abandoned_carts ALTER COLUMN shipping_cents SET DEFAULT 1;`, PREFLIGHT_DB);
    assert.equal(sql(box, `SELECT saas.storefront_checkout_preflight();`, PREFLIGHT_DB).stdout.trim(), "f",
      "preflight must reject incorrect checkout column defaults");
    sql(box, `SET ROLE celebix_saas_owner;
      ALTER TABLE saas.abandoned_carts ALTER COLUMN shipping_cents SET DEFAULT 0;
      GRANT EXECUTE ON FUNCTION saas.storefront_checkout_hostname_valid(text)
      TO celebix_saas_identity;`, PREFLIGHT_DB);
    assert.equal(sql(box, `SELECT saas.storefront_checkout_preflight();`, PREFLIGHT_DB).stdout.trim(), "f",
      "preflight must reject helper execution grants to non-owner roles");
    sql(box, `SET ROLE celebix_saas_owner;
      REVOKE EXECUTE ON FUNCTION saas.storefront_checkout_hostname_valid(text)
      FROM celebix_saas_identity;`, PREFLIGHT_DB);
    assert.equal(sql(box, `SELECT saas.storefront_checkout_preflight();`, PREFLIGHT_DB).stdout.trim(), "t");
    sql(box, `SET ROLE celebix_saas_owner;
      GRANT SELECT ON saas.storefront_checkout_operations TO celebix_saas_identity;`, PREFLIGHT_DB);
    assert.equal(sql(box, `SELECT saas.storefront_checkout_preflight();`, PREFLIGHT_DB).stdout.trim(), "f",
      "preflight must reject table grants to every non-owner role");
    const tableWrite = sql(box, `SET ROLE celebix_saas_app;
      DELETE FROM saas.storefront_checkout_operations;`, DB, true);
    assert.notEqual(tableWrite.status, 0);
    const immutableWrite = sql(box, `SET ROLE celebix_saas_owner;
      UPDATE saas.storefront_checkout_operations SET result_payload='{}';`, DB, true);
    assert.notEqual(immutableWrite.status, 0);
    assert.match(immutableWrite.stderr, /STOREFRONT_CHECKOUT_OPERATION_IMMUTABLE/);

    apply(box, UP, DB, true).status !== 0 || assert.fail("064 reapply must fail closed");

    apply(box, UP, CLEAN_DOWN_DB);
    apply(box, ASSERTIONS, CLEAN_DOWN_DB);
    apply(box, DOWN, CLEAN_DOWN_DB);
    apply(box, "202607220040_advanced_seo_preferences_assertions.sql", CLEAN_DOWN_DB);
    apply(box, "202607280063_payment_provider_builtin_compatibility_assertions.sql", CLEAN_DOWN_DB);
    assert.equal(sql(box, `SELECT pg_catalog.to_regclass('saas.storefront_checkout_operations') IS NULL
      AND pg_catalog.to_regprocedure('saas.storefront_checkout_get_quote(text,text,timestamp with time zone)') IS NULL
      AND NOT saas.merchant_admin_config_valid('shipping_setting','{"flatRateCents":2500}'::jsonb);`, CLEAN_DOWN_DB).stdout.trim(), "t");
    apply(box, UP, CLEAN_DOWN_DB);
    apply(box, ASSERTIONS, CLEAN_DOWN_DB);
    assert.equal(sql(box, `SELECT saas.storefront_checkout_preflight();`, CLEAN_DOWN_DB).stdout.trim(), "t",
      "migration 064 must reapply cleanly after its guarded down migration");
    apply(box, DOWN, CLEAN_DOWN_DB);
    apply(box, "202607280063_payment_provider_builtin_compatibility_assertions.sql", CLEAN_DOWN_DB);

    sql(box, `CREATE DATABASE ${ROLLBACK_DB} TEMPLATE ${DB};`, "postgres");
    sql(box, `SET session_replication_role=replica;
      DELETE FROM saas.storefront_checkout_operations;
      UPDATE saas.orders SET storefront_cart_id=NULL WHERE storefront_cart_id IS NOT NULL;
      UPDATE saas.abandoned_carts SET
        marketing_opt_in=false,shipping_address=NULL,billing_address=NULL,
        shipping_method_code=NULL,shipping_cents=0,discount_record_id=NULL,
        discount_code=NULL,discount_cents=0,total_cents=subtotal_cents,
        checkout_nonce_digest=NULL,selected_payment_method_id=NULL
      WHERE id='${CART_A}';
      SET session_replication_role=origin;`, ROLLBACK_DB);
    assert.equal(sql(box, `SELECT saas.storefront_checkout_preflight();`, ROLLBACK_DB).stdout.trim(), "t");

    sql(box, `CREATE DATABASE ${SHIPPING_GUARD_DB} TEMPLATE ${ROLLBACK_DB};`, "postgres");
    const shippingConfigDown = apply(box, DOWN, SHIPPING_GUARD_DB, true);
    assert.notEqual(shippingConfigDown.status, 0,
      "rollback must refuse durable shipping settings that use flatRateCents");
    assert.match(shippingConfigDown.stderr, /STOREFRONT_CHECKOUT_DOWN_GUARD: flatRateCents/);
    assert.equal(sql(box, `SELECT saas.storefront_checkout_preflight();`, SHIPPING_GUARD_DB).stdout.trim(), "t",
      "a refused shipping rollback must preserve migration 064 transactionally");
    sql(box, `SET ROLE celebix_saas_owner;
      UPDATE saas.merchant_admin_records SET config=config-'flatRateCents'
      WHERE record_kind='shipping_setting' AND config?'flatRateCents';`, ROLLBACK_DB);

    sql(box, `CREATE DATABASE ${ROLLBACK_RACE_DB} TEMPLATE ${ROLLBACK_DB};`, "postgres");
    const rollbackRace = await exerciseConcurrentRollbackWrite(box, ROLLBACK_RACE_DB);
    assert.equal(rollbackRace.rollbackLockObserved, true,
      "test must pause rollback on the guarded operations relation");
    assert.equal(rollbackRace.cartLockObserved, true,
      "down must lock carts before waiting on the next guarded durable relation");
    assert.equal(rollbackRace.writerBlocked, true,
      "a checkout write starting after rollback locks must block behind rollback");
    assert.equal(rollbackRace.rollbackResult.ok, true,
      rollbackRace.rollbackResult.error?.message ?? "guarded rollback must complete cleanly");
    assert.equal(rollbackRace.writerResult.ok, false,
      "the blocked writer must not commit state into columns removed by rollback");
    assert.match(rollbackRace.writerResult.error?.message ?? "", /marketing_opt_in|does not exist/);

    sql(box, `SET ROLE celebix_saas_owner;
      UPDATE saas.abandoned_carts SET marketing_opt_in=true WHERE id='${CART_A}';`, ROLLBACK_DB);
    const cartStateDown = apply(box, DOWN, ROLLBACK_DB, true);
    assert.notEqual(cartStateDown.status, 0);
    assert.match(cartStateDown.stderr, /STOREFRONT_CHECKOUT_DOWN_GUARD/,
      "rollback must refuse isolated cart checkout state");
    sql(box, `SET ROLE celebix_saas_owner;
      UPDATE saas.abandoned_carts SET marketing_opt_in=false WHERE id='${CART_A}';`, ROLLBACK_DB);

    sql(box, `SET ROLE celebix_saas_owner;
      INSERT INTO saas.storefront_checkout_operations(
        operation_id,store_id,cart_id,action,fingerprint,result_payload,committed_at
      ) VALUES(
        '79000000-0000-4000-8000-000000000069','${STORE_A}','${CART_A}',
        'delivery',repeat('c',64),'{}','${NOW}'
      );`, ROLLBACK_DB);
    const operationDown = apply(box, DOWN, ROLLBACK_DB, true);
    assert.notEqual(operationDown.status, 0);
    assert.match(operationDown.stderr, /STOREFRONT_CHECKOUT_DOWN_GUARD/,
      "rollback must refuse isolated immutable operation state");
    sql(box, `SET session_replication_role=replica;
      DELETE FROM saas.storefront_checkout_operations;
      SET session_replication_role=origin;`, ROLLBACK_DB);

    sql(box, `SET ROLE celebix_saas_owner;
      UPDATE saas.orders SET storefront_cart_id='${CART_A}'
      WHERE id='81000000-0000-4000-8000-000000000064';`, ROLLBACK_DB);
    const orderPointerDown = apply(box, DOWN, ROLLBACK_DB, true);
    assert.notEqual(orderPointerDown.status, 0);
    assert.match(orderPointerDown.stderr, /STOREFRONT_CHECKOUT_DOWN_GUARD/,
      "rollback must refuse an isolated storefront order pointer");
    sql(box, `SET ROLE celebix_saas_owner;
      UPDATE saas.orders SET storefront_cart_id=NULL
      WHERE id='81000000-0000-4000-8000-000000000064';`, ROLLBACK_DB);

    sql(box, `SET ROLE celebix_saas_owner;
      CREATE TABLE saas.storefront_checkout_bridges(id uuid PRIMARY KEY);`, ROLLBACK_DB);
    const emptyBridgeDown = apply(box, DOWN, ROLLBACK_DB, true);
    assert.notEqual(emptyBridgeDown.status, 0);
    assert.match(emptyBridgeDown.stderr, /STOREFRONT_CHECKOUT_DOWN_GUARD/,
      "rollback must explicitly refuse an empty future checkout bridge");
    assert.equal(sql(box, `SELECT saas.storefront_checkout_preflight();`, ROLLBACK_DB).stdout.trim(), "t");

    process.stdout.write("PASS storefront one-page checkout PostgreSQL 16 harness\n");
  } finally {
    stop(box);
  }
}

await main();
