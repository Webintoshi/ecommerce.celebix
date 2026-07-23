import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
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
const DB = "price_lists";
const RESTORED = "price_lists_restored";
const PLAN = "00000000-0000-4000-8000-000000000001";
const STORE = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const OWNER = "20000000-0000-4000-8000-000000000001";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000001";
const PRODUCT = "40000000-0000-4000-8000-000000000001";
const PRODUCT_B = "40000000-0000-4000-8000-000000000002";
const VARIANT = "50000000-0000-4000-8000-000000000001";
const VARIANT_B = "50000000-0000-4000-8000-000000000002";
const CROSS_VARIANT = "50000000-0000-4000-8000-000000000003";
const CUSTOMER = "60000000-0000-4000-8000-000000000001";
const CROSS_CUSTOMER = "60000000-0000-4000-8000-000000000002";
const TAG = "61000000-0000-4000-8000-000000000001";
const CROSS_TAG = "61000000-0000-4000-8000-000000000002";
const PROVIDER = "62000000-0000-4000-8000-000000000001";
const NOW = "2026-07-23T12:00:00.000Z";
const LATER = "2026-07-24T12:00:00.000Z";
const HOSTNAME = "pricing.example.test";
const ENVELOPE = `'{"algorithm":"A256GCM","ciphertext":"cXVpY2stbGluay10b2tlbi1jaXBoZXJ0ZXh0","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}'::jsonb`;
const DUPLICATE_ENVELOPE = `'{"algorithm":"A256GCM","ciphertext":"ZHVwbGljYXRlLXRva2VuLWNpcGhlcnRleHQ","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}'::jsonb`;
const EPOCH_CREATE_ENVELOPE = `'{"algorithm":"A256GCM","ciphertext":"ZXBvY2gtY3JlYXRlLXRva2VuLWNpcGhlcnRleHQ","iv":"AwMDAwMDAwMDAwMD","keyId":"key-1","tag":"BAQEBAQEBAQEBAQEBAQEBA","version":1}'::jsonb`;
const EPOCH_DUPLICATE_ENVELOPE = `'{"algorithm":"A256GCM","ciphertext":"ZXBvY2gtZHVwbGljYXRlLXRva2VuLWNpcGhlcnRleHQ","iv":"BQUFBQUFBQUFBQUF","keyId":"key-1","tag":"BgYGBgYGBgYGBgYGBgYGBg","version":1}'::jsonb`;
const ADDRESS = `'{"recipientName":"Ada Lovelace","phone":"+905551110000","line1":"Test 1","city":"Istanbul","country":"TR"}'::jsonb`;

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

const READER_SIGNATURES = [
  "saas.public_list_products(uuid,text,timestamp with time zone,integer)",
  "saas.public_get_product_by_slug(uuid,text,timestamp with time zone,text)",
  "saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)",
  "saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid,uuid[],text,text,jsonb,uuid,text)",
  "saas.abandoned_carts_capture(text,uuid,text,timestamp with time zone,jsonb,jsonb)",
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
  const root = mkdtempSync("/tmp/celebix-price-lists-");
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

function psqlAsync(box, source, database = DB) {
  return new Promise((resolve, reject) => {
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
        database,
      ],
      {
        cwd: ROOT,
        env: { ...process.env, LC_ALL: "C", LANG: "C" },
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdin.end(source);
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`psql failed\n${stderr}`));
    });
  });
}

function holdAdvisoryLock(box, lockKey, database = DB) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      box.executables.psql,
      [
        "-h", box.socket,
        "-p", String(box.port),
        "-X", "-qAt",
        "-v", "ON_ERROR_STOP=1",
        "-U", "postgres",
        "-d", database,
      ],
      {
        cwd: ROOT,
        env: { ...process.env, LC_ALL: "C", LANG: "C" },
      },
    );
    let stdout = "";
    let stderr = "";
    let ready = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!ready && stdout.includes("PRICE_EPOCH_LOCK_READY")) {
        ready = true;
        resolve({
          release: () => new Promise((releaseResolve, releaseReject) => {
            child.once("error", releaseReject);
            child.once("close", (code) => {
              if (code === 0) releaseResolve();
              else releaseReject(new Error(`lock holder failed\n${stderr}`));
            });
            child.stdin.end("COMMIT;\n\\q\n");
          }),
        });
      }
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (!ready) reject(new Error(`lock holder exited ${code}\n${stderr}`));
    });
    child.stdin.write(`BEGIN;
      SELECT pg_catalog.pg_advisory_xact_lock(${lockKey}::bigint);
      SELECT 'PRICE_EPOCH_LOCK_READY';\n`);
  });
}

async function waitFor(box, predicate, label) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`WAIT_TIMEOUT:${label}`);
}

async function proveTransitionWaitsForConsumer(box, {
  lockKey,
  consumerName,
  consumerCall,
  consumerRole,
  transitionName,
  transitionCall: suppliedTransitionCall,
}) {
  const holder = await holdAdvisoryLock(box, lockKey);
  const consumer = psqlAsync(
    box,
    `SET application_name='${consumerName}';SET ROLE ${consumerRole};
      SELECT outcome FROM ${consumerCall};`,
  );
  await waitFor(box, () => psql(box, `SELECT wait_event_type='Lock'
    FROM pg_catalog.pg_stat_activity
    WHERE application_name='${consumerName}';`).stdout.trim() === "t", `${consumerName}:pause`);

  let transitionSettled = false;
  const transition = psqlAsync(
    box,
    `SET application_name='${transitionName}';SET ROLE celebix_saas_app;
      SELECT outcome FROM ${suppliedTransitionCall};`,
  ).finally(() => { transitionSettled = true; });
  await waitFor(box, () => transitionSettled || psql(box, `SELECT wait_event_type='Lock'
    FROM pg_catalog.pg_stat_activity
    WHERE application_name='${transitionName}';`).stdout.trim() === "t", `${transitionName}:store-lock`);
  const waitedForConsumer = !transitionSettled;
  await holder.release();
  const [consumerResult, transitionResult] = await Promise.all([consumer, transition]);
  return {
    waitedForConsumer,
    consumerOutcome: consumerResult.stdout.trim(),
    transitionOutcome: transitionResult.stdout.trim(),
  };
}

function apply(box, file, database = DB) {
  psql(box, readFileSync(path.join(SQL, file), "utf8"), database);
}

function authority(now = NOW) {
  return `'${STORE}'::uuid,'${OWNER}'::uuid,'${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter'::text,1::bigint,'${now}'::timestamptz`;
}

function fingerprint(marker) {
  return createHash("sha256").update(marker).digest("hex");
}

function operation(seed) {
  return `8${String(seed).padStart(7, "0")}-0000-4000-8000-${String(seed).padStart(12, "0")}`;
}

function listId(seed) {
  return `7${String(seed).padStart(7, "0")}-0000-4000-8000-${String(seed).padStart(12, "0")}`;
}

function result(box, functionCall, role = "celebix_saas_app", database = DB) {
  const output = psql(
    box,
    `SET ROLE ${role};SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${functionCall};`,
    database,
  ).stdout.trim();
  return JSON.parse(output);
}

function resolve(box, {
  variant = VARIANT,
  channel = "storefront",
  now = NOW,
  email = null,
  database = DB,
} = {}) {
  const suppliedEmail = email === null ? "NULL::text" : `'${email}'::text`;
  const output = psql(
    box,
    `SET ROLE celebix_saas_app;SELECT pg_catalog.jsonb_build_object(
      'outcome',outcome,'priceCents',price_cents,'sourceKind',source_kind,'priceListId',price_list_id
    ) FROM saas.resolve_effective_variant_price(
      '${STORE}'::uuid,'${variant}'::uuid,'${channel}','${now}',${suppliedEmail}
    );`,
    database,
  ).stdout.trim();
  return JSON.parse(output);
}

function item(variantId, priceCents) {
  return { variantId, priceCents };
}

function rule(channel, priority, {
  customerTagId,
  startsAt = NOW,
  endsAt = LATER,
} = {}) {
  return {
    channel,
    ...(customerTagId ? { customerTagId } : {}),
    ...(startsAt ? { startsAt } : {}),
    ...(endsAt ? { endsAt } : {}),
    priority,
  };
}

function saveCall({
  op,
  list,
  expected = null,
  name = "Price list",
  items,
  rules,
  now = NOW,
  fp = fingerprint(op),
}) {
  return `saas.pricing_save(
    ${authority(now)},'${op}'::uuid,'${fp}','${list}'::uuid,
    ${expected === null ? "NULL" : expected}::bigint,'${name}',
    '${JSON.stringify(items)}'::jsonb,'${JSON.stringify(rules)}'::jsonb
  )`;
}

function transitionCall(kind, {
  op,
  list,
  expected,
  now = NOW,
  fp = fingerprint(op),
}) {
  return `saas.pricing_${kind}(
    ${authority(now)},'${op}'::uuid,'${fp}','${list}'::uuid,${expected}::bigint
  )`;
}

function readerDefinitions(box) {
  return Object.fromEntries(READER_SIGNATURES.map((signature) => [
    signature,
    psql(
      box,
      `SELECT pg_catalog.pg_get_functiondef('${signature}'::regprocedure);`,
    ).stdout,
  ]));
}

function seed(box) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
VALUES('${OWNER}','https://id.test/oidc','owner','owner@test.invalid',true,'2026-01-01','2026-01-01');
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
('${STORE}','Pricing A','pricing-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
('${STORE_B}','Pricing B','pricing-b','active','tr','TRY','default','2026-01-01','2026-01-01');
INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)
VALUES('${MEMBERSHIP}','${OWNER}','${STORE}','store_owner','active','2026-01-01','2026-01-01');
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
VALUES('31000000-0000-4000-8000-000000000001','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES
('${PRODUCT}','${STORE}','pricing-product','Pricing Product','active','TRY',1,'2026-01-01','2026-01-01'),
('${PRODUCT_B}','${STORE_B}','cross-product','Cross Product','active','TRY',1,'2026-01-01','2026-01-01');
INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,cost_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES
('${VARIANT}','${PRODUCT}','${STORE}','Default','PRICE-1',1500,700,true,50,'active','{}',1,'2026-01-01','2026-01-01'),
('${VARIANT_B}','${PRODUCT}','${STORE}','Second','PRICE-2',2500,900,true,50,'active','{}',1,'2026-01-01','2026-01-01'),
('${CROSS_VARIANT}','${PRODUCT_B}','${STORE_B}','Cross','CROSS-1',999,400,true,50,'active','{}',1,'2026-01-01','2026-01-01');
INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)
VALUES('63000000-0000-4000-8000-000000000001','${STORE}','${HOSTNAME}','custom_domain','active',true,'2026-01-02','2026-01-01','2026-01-02',1);
INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,version,created_at,updated_at) VALUES
('${CUSTOMER}','${STORE}','active','Ada','Lovelace','ada@example.test',1,'2026-01-01','2026-01-01'),
('${CROSS_CUSTOMER}','${STORE_B}','active','Cross','Customer','cross@example.test',1,'2026-01-01','2026-01-01');
INSERT INTO saas.customer_tags(id,store_id,name,color,version,created_at,updated_at) VALUES
('${TAG}','${STORE}','VIP','#112233',1,'2026-01-01','2026-01-01'),
('${CROSS_TAG}','${STORE_B}','CROSS','#334455',1,'2026-01-01','2026-01-01');
INSERT INTO saas.customer_tag_assignments(store_id,customer_id,tag_id,assigned_at) VALUES
('${STORE}','${CUSTOMER}','${TAG}','2026-01-01'),
('${STORE_B}','${CROSS_CUSTOMER}','${CROSS_TAG}','2026-01-01');
INSERT INTO saas.checkout_provider_configs(
  id,store_id,provider_key,status,public_origin,configuration_key_id,
  sealed_configuration,configuration_digest,version,created_at,updated_at
) VALUES(
  '${PROVIDER}','${STORE}','paytr','active','https://www.paytr.com','key-1',
  ${ENVELOPE},repeat('d',64),1,'2026-01-01','2026-01-01'
);
COMMIT;`);
}

function quickCreateCall({
  link,
  itemId,
  op,
  email = "plain@example.test",
  token = "a",
}) {
  return `saas.quick_links_create(
    ${authority()},'${link}'::uuid,ARRAY['${itemId}'::uuid],ARRAY['${VARIANT}'::uuid],
    ARRAY[2::bigint],'${PROVIDER}'::uuid,'Ada Lovelace','${email}','+905551110000',
    ${ADDRESS},${ADDRESS},NULL::text,'pricing',0,0,24,
    repeat('${token}',64),'key-1',${ENVELOPE},'${op}'::uuid,'${fingerprint(op)}'
  )`;
}

function quickCreateMultiCall({ link, itemIds, op, token = "e" }) {
  return `saas.quick_links_create(
    ${authority()},'${link}'::uuid,
    ARRAY[${itemIds.map((id) => `'${id}'::uuid`).join(",")}],
    ARRAY['${VARIANT}'::uuid,'${VARIANT_B}'::uuid],ARRAY[2::bigint,3::bigint],
    '${PROVIDER}'::uuid,'Ada Lovelace','plain@example.test','+905551110000',
    ${ADDRESS},${ADDRESS},NULL::text,'epoch',0,0,24,
    repeat('${token}',64),'key-1',${EPOCH_CREATE_ENVELOPE},'${op}'::uuid,'${fingerprint(op)}'
  )`;
}

function quickDuplicateCall({ source, link, itemId, op, token = "b" }) {
  return `saas.quick_links_duplicate(
    ${authority()},'${source}'::uuid,'${link}'::uuid,ARRAY['${itemId}'::uuid],
    repeat('${token}',64),'key-1',${DUPLICATE_ENVELOPE},'${op}'::uuid,'${fingerprint(op)}'
  )`;
}

function quickDuplicateMultiCall({ source, link, itemIds, op, token = "f" }) {
  return `saas.quick_links_duplicate(
    ${authority()},'${source}'::uuid,'${link}'::uuid,
    ARRAY[${itemIds.map((id) => `'${id}'::uuid`).join(",")}],
    repeat('${token}',64),'key-1',${EPOCH_DUPLICATE_ENVELOPE},
    '${op}'::uuid,'${fingerprint(op)}'
  )`;
}

const TOTAL = 38;
let count = 0;
async function scenario(name, run) {
  await run();
  count += 1;
  console.log(`PASS ${count}/${TOTAL} ${name}`);
}

async function main() {
  let box;
  let cleanupPid;
  let originalReaders;
  try {
    box = start();
    cleanupPid = box.pid;
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const file of PRIOR) apply(box, file);
    seed(box);
    for (const file of [
      "202607220043_inventory_purchasing.up.sql",
      "202607220043_inventory_purchasing_assertions.sql",
      "202607220044_inventory_counts_transfers.up.sql",
      "202607220044_inventory_counts_transfers_assertions.sql",
    ]) apply(box, file);
    originalReaders = readerDefinitions(box);
    apply(box, "202607220045_price_lists.up.sql");
    apply(box, "202607220045_price_lists_assertions.sql");

    const draft = listId(1);
    const global = listId(2);
    const tagged = listId(3);
    const timed = listId(4);
    const priority = listId(5);
    const conflict = listId(6);
    const replacement = listId(7);
    const concurrentA = listId(8);
    const concurrentB = listId(9);

    await scenario("PostgreSQL 16 disposable authority is active", () => {
      assert.match(psql(box, "SHOW server_version;").stdout.trim(), /^16[.]/);
    });

    await scenario("four store-composite relations and all pricing RPCs exist", () => {
      assert.equal(
        psql(box, `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='saas' AND c.relname IN(
            'price_lists','price_list_items','price_list_rules','price_list_operations'
          );`).stdout.trim(),
        "4",
      );
      assert.equal(
        psql(box, `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='saas' AND p.proname IN(
            'pricing_list','pricing_get','pricing_save','pricing_activate',
            'pricing_archive','pricing_recover_operation','resolve_effective_variant_price'
          );`).stdout.trim(),
        "7",
      );
    });

    await scenario("draft save persists exact items rules cents and version", () => {
      const saved = result(box, saveCall({
        op: operation(1),
        list: draft,
        name: "Draft",
        items: [item(VARIANT, 1300)],
        rules: [rule("storefront", 1)],
      }));
      assert.equal(saved.outcome, "saved");
      assert.equal(saved.result.version, 1);
      assert.equal(saved.result.items[0].priceCents, 1300);
    });

    await scenario("draft update replaces exact children and advances version", () => {
      const updated = result(box, saveCall({
        op: operation(2),
        list: draft,
        expected: 1,
        name: "Draft updated",
        items: [item(VARIANT, 1290), item(VARIANT_B, 2390)],
        rules: [rule("storefront", 2), rule("quick_order", 2)],
      }));
      assert.equal(updated.outcome, "saved");
      assert.equal(updated.result.version, 2);
      assert.equal(updated.result.items.length, 2);
    });

    await scenario("operation replay returns byte-identical draft proof", () => {
      const call = saveCall({
        op: operation(2),
        list: draft,
        expected: 1,
        name: "Draft updated",
        items: [item(VARIANT, 1290), item(VARIANT_B, 2390)],
        rules: [rule("storefront", 2), rule("quick_order", 2)],
      });
      const replay = result(box, call);
      assert.equal(replay.outcome, "operation_replayed");
      assert.equal(replay.result.version, 2);
    });

    await scenario("operation fingerprint or price-list identity cannot retarget a persisted proof", () => {
      const mismatch = result(box, saveCall({
        op: operation(2),
        fp: fingerprint("different"),
        list: draft,
        expected: 2,
        name: "Retarget",
        items: [item(VARIANT, 1)],
        rules: [rule("storefront", 2)],
      }));
      assert.equal(mismatch.outcome, "operation_mismatch");
      assert.equal(mismatch.result, null);
      const listMismatch = result(box, saveCall({
        op: operation(2),
        list: listId(90),
        name: "Retargeted list",
        items: [item(VARIANT, 1290)],
        rules: [rule("storefront", 2)],
      }));
      assert.equal(listMismatch.outcome, "operation_mismatch");
      assert.equal(listMismatch.result, null);
    });

    await scenario("stale version update fails without changing list state", () => {
      const before = psql(box, `SELECT pg_catalog.to_jsonb(list)::text FROM saas.price_lists list WHERE id='${draft}';`).stdout;
      const stale = result(box, saveCall({
        op: operation(3),
        list: draft,
        expected: 1,
        name: "Stale",
        items: [item(VARIANT, 1)],
        rules: [rule("storefront", 2)],
      }));
      const after = psql(box, `SELECT pg_catalog.to_jsonb(list)::text FROM saas.price_lists list WHERE id='${draft}';`).stdout;
      assert.equal(stale.outcome, "version_conflict");
      assert.equal(after, before);
    });

    await scenario("pricing list and get return the same frozen projection shape", () => {
      const listed = result(box, `saas.pricing_list(${authority()})`);
      const found = result(box, `saas.pricing_get(${authority()},'${draft}'::uuid)`);
      assert.equal(listed.outcome, "listed");
      assert.deepEqual(listed.result.items[0], found.result);
    });

    await scenario("active global storefront rule resolves fixed cents", () => {
      assert.equal(result(box, saveCall({
        op: operation(4),
        list: global,
        name: "Global",
        items: [item(VARIANT, 1200)],
        rules: [rule("storefront", 10), rule("quick_order", 10)],
      })).outcome, "saved");
      assert.equal(result(box, transitionCall("activate", {
        op: operation(5), list: global, expected: 1,
      })).outcome, "activated");
      assert.equal(result(box, transitionCall("activate", {
        op: operation(5), list: draft, expected: 2,
      })).outcome, "operation_mismatch");
      assert.deepEqual(resolve(box), {
        outcome: "found",
        priceCents: 1200,
        sourceKind: "price_list",
        priceListId: global,
      });
    });

    await scenario("active global quick-order rule matches storefront cents", () => {
      assert.equal(resolve(box, { channel: "quick_order" }).priceCents, 1200);
    });

    await scenario("persisted-customer-tag quick-order rule uses exact normalized same-store email", () => {
      assert.equal(result(box, saveCall({
        op: operation(6),
        list: tagged,
        name: "VIP",
        items: [item(VARIANT, 900)],
        rules: [
          rule("quick_order", 50, { customerTagId: TAG }),
          rule("storefront", 50, { customerTagId: TAG }),
        ],
      })).outcome, "saved");
      assert.equal(result(box, transitionCall("activate", {
        op: operation(7), list: tagged, expected: 1,
      })).outcome, "activated");
      assert.equal(resolve(box, {
        channel: "quick_order",
        email: "ADA@EXAMPLE.TEST",
      }).priceCents, 900);
    });

    await scenario("anonymous tag rule ignored by storefront", () => {
      assert.equal(resolve(box, { channel: "storefront" }).priceCents, 1200);
    });

    await scenario("wrong-store customer email never supplies a customer tag", () => {
      assert.equal(resolve(box, {
        channel: "quick_order",
        email: "cross@example.test",
      }).priceCents, 1200);
    });

    await scenario("time boundary is inclusive and supplied timestamps require canonical UTC", () => {
      assert.equal(result(box, saveCall({
        op: operation(8),
        list: timed,
        name: "Timed",
        items: [item(VARIANT_B, 2100)],
        rules: [rule("storefront", 5)],
      })).outcome, "saved");
      assert.equal(result(box, transitionCall("activate", {
        op: operation(9), list: timed, expected: 1,
      })).outcome, "activated");
      assert.equal(resolve(box, { variant: VARIANT_B, now: NOW }).priceCents, 2100);
      assert.equal(resolve(box, { variant: VARIANT_B, now: LATER }).priceCents, 2500);

      const omittedStart = result(box, saveCall({
        op: operation(80),
        list: listId(80),
        name: "Omitted start",
        items: [item(VARIANT_B, 2200)],
        rules: [{ channel: "storefront", priority: 30 }],
      }));
      assert.equal(omittedStart.outcome, "saved");
      assert.equal(omittedStart.result.rules[0].startsAt, NOW);
      assert.equal(Object.hasOwn(omittedStart.result.rules[0], "endsAt"), false);

      const invalidTimestamps = [
        ["noncanonical-start", { channel: "storefront", startsAt: "2026-07-23 12:00:00+00", priority: 30 }],
        ["null-start", { channel: "storefront", startsAt: null, priority: 30 }],
        ["empty-start", { channel: "storefront", startsAt: "", priority: 30 }],
        ["malformed-start", { channel: "storefront", startsAt: "not-a-timestamp", priority: 30 }],
        ["infinite-start", { channel: "storefront", startsAt: "infinity", priority: 30 }],
        ["oversized-start", { channel: "storefront", startsAt: "2".repeat(512), priority: 30 }],
        ["empty-end", { channel: "storefront", startsAt: NOW, endsAt: "", priority: 30 }],
        ["malformed-end", { channel: "storefront", startsAt: NOW, endsAt: "not-a-timestamp", priority: 30 }],
        ["noncanonical-end", { channel: "storefront", startsAt: NOW, endsAt: "2026-07-24 12:00:00+00", priority: 30 }],
        ["infinite-end", { channel: "storefront", startsAt: NOW, endsAt: "infinity", priority: 30 }],
      ];
      for (const [index, [name, suppliedRule]] of invalidTimestamps.entries()) {
        const invalidList = listId(82 + index);
        assert.equal(result(box, saveCall({
          op: operation(82 + index),
          list: invalidList,
          name,
          items: [item(VARIANT_B, 2200)],
          rules: [suppliedRule],
        })).outcome, "invalid_input", name);
        assert.equal(
          psql(box, `SELECT count(*) FROM saas.price_lists WHERE id='${invalidList}';`).stdout.trim(),
          "0",
          name,
        );
      }

      const nullEnd = result(box, saveCall({
        op: operation(81),
        list: listId(81),
        name: "Null open end",
        items: [item(VARIANT_B, 2200)],
        rules: [{ channel: "storefront", startsAt: NOW, endsAt: null, priority: 30 }],
      }));
      assert.equal(nullEnd.outcome, "saved");
      assert.equal(Object.hasOwn(nullEnd.result.rules[0], "endsAt"), false);
    });

    await scenario("higher priority wins deterministically across both channels", () => {
      assert.equal(result(box, saveCall({
        op: operation(10),
        list: priority,
        name: "Priority",
        items: [item(VARIANT, 1100)],
        rules: [rule("storefront", 20), rule("quick_order", 20)],
      })).outcome, "saved");
      assert.equal(result(box, transitionCall("activate", {
        op: operation(11), list: priority, expected: 1,
      })).outcome, "activated");
      assert.equal(resolve(box).priceCents, 1100);
      assert.equal(resolve(box, { channel: "quick_order" }).priceCents, 1100);
    });

    await scenario("overlap rejection fails equal priority same authority range", () => {
      assert.equal(result(box, saveCall({
        op: operation(12),
        list: conflict,
        name: "Conflict",
        items: [item(VARIANT, 1000)],
        rules: [rule("storefront", 20)],
      })).outcome, "saved");
      assert.equal(result(box, transitionCall("activate", {
        op: operation(13), list: conflict, expected: 1,
      })).outcome, "pricing_conflict");
    });

    await scenario("archive fallback returns the next eligible active price", () => {
      assert.equal(result(box, transitionCall("archive", {
        op: operation(14), list: priority, expected: 2,
      })).outcome, "archived");
      assert.equal(result(box, transitionCall("archive", {
        op: operation(14), list: global, expected: 2,
      })).outcome, "operation_mismatch");
      assert.equal(resolve(box).priceCents, 1200);
    });

    await scenario("missing variant resolves not_found without leaking catalog state", () => {
      assert.deepEqual(resolve(box, {
        variant: "59999999-0000-4000-8000-000000000001",
      }), {
        outcome: "not_found",
        priceCents: null,
        sourceKind: null,
        priceListId: null,
      });
    });

    await scenario("archived variant resolves not_found and cannot use an active item", () => {
      psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.product_variants
        SET status='archived',archived_at='${NOW}',updated_at='${NOW}',version=version+1
        WHERE id='${VARIANT_B}';`);
      assert.equal(resolve(box, { variant: VARIANT_B }).outcome, "not_found");
      psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.product_variants
        SET status='active',archived_at=NULL,updated_at='${NOW}',version=version+1
        WHERE id='${VARIANT_B}';`);
    });

    await scenario("wrong-store item is rejected with no partial list", () => {
      const foreignList = listId(20);
      assert.equal(result(box, saveCall({
        op: operation(20),
        list: foreignList,
        items: [item(CROSS_VARIANT, 1)],
        rules: [rule("storefront", 1)],
      })).outcome, "invalid_input");
      assert.equal(psql(box, `SELECT count(*) FROM saas.price_lists WHERE id='${foreignList}';`).stdout.trim(), "0");
    });

    await scenario("wrong-store tag is rejected with no partial list", () => {
      const foreignList = listId(21);
      assert.equal(result(box, saveCall({
        op: operation(21),
        list: foreignList,
        items: [item(VARIANT, 1)],
        rules: [rule("quick_order", 1, { customerTagId: CROSS_TAG })],
      })).outcome, "invalid_input");
      assert.equal(psql(box, `SELECT count(*) FROM saas.price_lists WHERE id='${foreignList}';`).stdout.trim(), "0");
    });

    await scenario("overflow cents are rejected before persistence", () => {
      const overflowList = listId(22);
      assert.equal(result(box, saveCall({
        op: operation(22),
        list: overflowList,
        items: [item(VARIANT, 8000000001)],
        rules: [rule("storefront", 1)],
      })).outcome, "invalid_input");
      assert.equal(psql(box, `SELECT count(*) FROM saas.price_lists WHERE id='${overflowList}';`).stdout.trim(), "0");
    });

    await scenario("direct DML denial covers all four relations and immutable operations", () => {
      for (const statement of [
        "UPDATE saas.price_lists SET name='x' WHERE false",
        "DELETE FROM saas.price_list_items WHERE false",
        "INSERT INTO saas.price_list_rules(id,store_id,price_list_id,channel,starts_at,priority) VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'storefront',now(),1)",
        "DELETE FROM saas.price_list_operations WHERE false",
      ]) {
        assert.notEqual(psql(box, `SET ROLE celebix_saas_app;${statement};`, DB, true).status, 0);
      }
      assert.notEqual(psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.price_list_operations
        SET payload_fingerprint=repeat('0',64) WHERE operation_id='${operation(1)}';`, DB, true).status, 0);
    });

    await scenario("ACL and RLS close relations to every application role", () => {
      assert.equal(
        psql(box, `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='saas' AND c.relname LIKE 'price_list%' AND c.relrowsecurity AND c.relforcerowsecurity;`).stdout.trim(),
        "4",
      );
      assert.equal(
        psql(box, `SELECT count(*) FROM information_schema.role_table_grants
          WHERE table_schema='saas' AND table_name LIKE 'price_list%'
          AND grantee IN('celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver');`).stdout.trim(),
        "0",
      );
    });

    await scenario("resolver ACL is exact stable security-definer authority", () => {
      const signature = "saas.resolve_effective_variant_price(uuid,uuid,text,timestamp with time zone,text)";
      assert.equal(
        psql(box, `SELECT provolatile::text||':'||prosecdef::text FROM pg_proc WHERE oid='${signature}'::regprocedure;`).stdout.trim(),
        "s:true",
      );
      for (const role of ["celebix_saas_app", "celebix_saas_host_resolver", "celebix_saas_workflow"]) {
        assert.equal(
          psql(box, `SELECT has_function_privilege('${role}','${signature}','EXECUTE');`).stdout.trim(),
          "t",
        );
      }
      for (const role of ["celebix_saas_identity", "celebix_saas_bootstrap", "celebix_saas_observability", "celebix_saas_migrator"]) {
        assert.equal(
          psql(box, `SELECT has_function_privilege('${role}','${signature}','EXECUTE');`).stdout.trim(),
          "f",
        );
      }
      assert.equal(
        psql(box, `SET ROLE celebix_saas_app;SELECT outcome
          FROM saas.resolve_effective_variant_price(
            '${STORE}'::uuid,'${VARIANT}'::uuid,NULL,'${NOW}'::timestamptz,NULL
          );`).stdout.trim(),
        "invalid_input",
      );
    });

    await scenario("public list and detail expose the exact same effective price", () => {
      const list = result(
        box,
        `saas.public_list_products('${STORE}'::uuid,'${HOSTNAME}','${NOW}',10)`,
        "celebix_saas_host_resolver",
      );
      const detail = result(
        box,
        `saas.public_get_product_by_slug('${STORE}'::uuid,'${HOSTNAME}','${NOW}','pricing-product')`,
        "celebix_saas_host_resolver",
      );
      assert.equal(list.result[0].priceCents, resolve(box).priceCents);
      assert.equal(detail.result.priceCents, list.result[0].priceCents);
      assert.equal(detail.result.variants[0].priceCents, list.result[0].variants[0].priceCents);
    });

    const createLink = "90000000-0000-4000-8000-000000000001";
    await scenario("quick-link create snapshots the exact effective quick-order price", () => {
      const created = result(box, quickCreateCall({
        link: createLink,
        itemId: "91000000-0000-4000-8000-000000000001",
        op: operation(30),
      }));
      assert.equal(created.outcome, "committed");
      assert.equal(
        Number(psql(box, `SELECT unit_price_cents FROM saas.quick_order_link_items WHERE quick_order_link_id='${createLink}';`).stdout.trim()),
        resolve(box, { channel: "quick_order" }).priceCents,
      );
    });

    const duplicateLink = "90000000-0000-4000-8000-000000000002";
    await scenario("quick-link duplicate re-resolves and snapshots the same effective price", () => {
      const duplicated = result(box, quickDuplicateCall({
        source: createLink,
        link: duplicateLink,
        itemId: "91000000-0000-4000-8000-000000000002",
        op: operation(31),
      }));
      assert.equal(duplicated.outcome, "committed");
      assert.equal(
        Number(psql(box, `SELECT unit_price_cents FROM saas.quick_order_link_items WHERE quick_order_link_id='${duplicateLink}';`).stdout.trim()),
        resolve(box, { channel: "quick_order" }).priceCents,
      );
    });

    const cart = "92000000-0000-4000-8000-000000000001";
    await scenario("abandoned-cart capture snapshots the exact effective storefront price", () => {
      const captured = result(
        box,
        `saas.abandoned_carts_capture(
          '${HOSTNAME}','${cart}'::uuid,repeat('c',64),'${NOW}',
          '{"name":"Ada Lovelace","email":"plain@example.test","phone":"+905551110000"}'::jsonb,
          '[{"productId":"${PRODUCT}","variantId":"${VARIANT}","quantity":2}]'::jsonb
        )`,
        "celebix_saas_workflow",
      );
      assert.equal(captured.outcome, "captured");
      assert.equal(
        Number(psql(box, `SELECT unit_price_cents FROM saas.abandoned_cart_items WHERE cart_id='${cart}';`).stdout.trim()),
        resolve(box).priceCents,
      );
    });

    await scenario("later list change never mutates quick-link or abandoned immutable snapshots", () => {
      const before = psql(box, `SELECT string_agg(price::text,',' ORDER BY kind) FROM (
        SELECT 'cart' kind,unit_price_cents price FROM saas.abandoned_cart_items WHERE cart_id='${cart}'
        UNION ALL SELECT 'create',unit_price_cents FROM saas.quick_order_link_items WHERE quick_order_link_id='${createLink}'
        UNION ALL SELECT 'duplicate',unit_price_cents FROM saas.quick_order_link_items WHERE quick_order_link_id='${duplicateLink}'
      ) snapshot;`).stdout.trim();
      assert.equal(result(box, saveCall({
        op: operation(32),
        list: replacement,
        name: "Replacement",
        items: [item(VARIANT, 500)],
        rules: [rule("storefront", 100), rule("quick_order", 100)],
      })).outcome, "saved");
      assert.equal(result(box, transitionCall("activate", {
        op: operation(33), list: replacement, expected: 1,
      })).outcome, "activated");
      assert.equal(resolve(box).priceCents, 500);
      const after = psql(box, `SELECT string_agg(price::text,',' ORDER BY kind) FROM (
        SELECT 'cart' kind,unit_price_cents price FROM saas.abandoned_cart_items WHERE cart_id='${cart}'
        UNION ALL SELECT 'create',unit_price_cents FROM saas.quick_order_link_items WHERE quick_order_link_id='${createLink}'
        UNION ALL SELECT 'duplicate',unit_price_cents FROM saas.quick_order_link_items WHERE quick_order_link_id='${duplicateLink}'
      ) snapshot;`).stdout.trim();
      assert.equal(after, before);
    });

    await scenario("concurrent activation admits exactly one equal-priority overlapping list", async () => {
      for (const [seed, list] of [[40, concurrentA], [41, concurrentB]]) {
        assert.equal(result(box, saveCall({
          op: operation(seed),
          list,
          name: `Concurrent ${seed}`,
          items: [item(VARIANT_B, 1900 + seed)],
          rules: [rule("quick_order", 777, {
            startsAt: "2026-07-25T00:00:00.000Z",
            endsAt: "2026-07-26T00:00:00.000Z",
          })],
        })).outcome, "saved");
      }
      const calls = [
        transitionCall("activate", { op: operation(42), list: concurrentA, expected: 1 }),
        transitionCall("activate", { op: operation(43), list: concurrentB, expected: 1 }),
      ];
      const outcomes = (await Promise.all(calls.map((call) => psqlAsync(
        box,
        `SET ROLE celebix_saas_app;SELECT outcome FROM ${call};`,
      )))).map((entry) => entry.stdout.trim()).sort();
      assert.deepEqual(outcomes, ["activated", "pricing_conflict"]);
    });

    await scenario("operation recovery returns exact persisted result and rejects another fingerprint", () => {
      const recovered = result(
        box,
        `saas.pricing_recover_operation(${authority()},'${operation(1)}'::uuid,'${fingerprint(operation(1))}')`,
      );
      assert.equal(recovered.outcome, "operation_replayed");
      assert.equal(recovered.result.id, draft);
      const mismatch = result(
        box,
        `saas.pricing_recover_operation(${authority()},'${operation(1)}'::uuid,'${fingerprint("wrong")}')`,
      );
      assert.equal(mismatch.outcome, "operation_mismatch");
    });

    await scenario("shared store lock gives every persisted consumer one pricing epoch", async () => {
      const pricing = psql(box, `SELECT pg_get_functiondef('saas.pricing_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::regprocedure);`).stdout;
      const inventory = psql(box, `SELECT pg_get_functiondef('saas.inventory_counts_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,jsonb)'::regprocedure);`).stdout;
      const checkout = psql(box, `SELECT pg_get_functiondef('saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)'::regprocedure);`).stdout;
      for (const definition of [pricing, inventory, checkout]) {
        assert.match(definition, /saas[.]catalog[.]store:/);
      }
      assert.ok(pricing.indexOf("saas.pricing.operation:") < pricing.indexOf("saas.catalog.store:"));

      const epochLock = 70450045;
      const firstEpoch = listId(100);
      const secondEpoch = listId(101);
      assert.equal(result(box, saveCall({
        op: operation(100),
        list: firstEpoch,
        name: "First consumer epoch",
        items: [item(VARIANT, 700), item(VARIANT_B, 1700)],
        rules: [rule("storefront", 900), rule("quick_order", 900)],
      })).outcome, "saved");
      assert.equal(result(box, transitionCall("activate", {
        op: operation(101), list: firstEpoch, expected: 1,
      })).outcome, "activated");
      psql(box, `SET ROLE celebix_saas_owner;
        CREATE FUNCTION saas.price_epoch_test_pause()
        RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
        BEGIN
          PERFORM pg_catalog.pg_advisory_xact_lock(${epochLock}::bigint);
          RETURN NEW;
        END
        $f$;
        CREATE TRIGGER quick_item_price_epoch_pause
          BEFORE INSERT ON saas.quick_order_link_items
          FOR EACH ROW EXECUTE FUNCTION saas.price_epoch_test_pause();
        CREATE TRIGGER cart_item_price_epoch_pause
          BEFORE INSERT ON saas.abandoned_cart_items
          FOR EACH ROW EXECUTE FUNCTION saas.price_epoch_test_pause();`);

      const epochCreateLink = "90000000-0000-4000-8000-000000000100";
      const createRun = await proveTransitionWaitsForConsumer(box, {
        lockKey: epochLock,
        consumerName: "price_epoch_quick_create",
        consumerCall: quickCreateMultiCall({
          link: epochCreateLink,
          itemIds: [
            "91000000-0000-4000-8000-000000000100",
            "91000000-0000-4000-8000-000000000101",
          ],
          op: operation(102),
        }),
        consumerRole: "celebix_saas_app",
        transitionName: "price_epoch_archive_create",
        transitionCall: transitionCall("archive", {
          op: operation(103), list: firstEpoch, expected: 2,
        }),
      });
      const createSnapshot = JSON.parse(psql(box, `SELECT pg_catalog.jsonb_build_object(
          'subtotal',link.subtotal_cents,
          'lineSubtotal',pg_catalog.sum(item.line_total_cents),
          'prices',pg_catalog.jsonb_agg(item.unit_price_cents ORDER BY item.position)
        )
        FROM saas.quick_order_links link
        JOIN saas.quick_order_link_items item
          ON item.store_id=link.store_id AND item.quick_order_link_id=link.id
        WHERE link.store_id='${STORE}' AND link.id='${epochCreateLink}'
        GROUP BY link.subtotal_cents;`).stdout.trim());

      assert.equal(result(box, saveCall({
        op: operation(104),
        list: secondEpoch,
        name: "Second consumer epoch",
        items: [item(VARIANT, 800), item(VARIANT_B, 1800)],
        rules: [rule("storefront", 950), rule("quick_order", 950)],
      })).outcome, "saved");
      const epochDuplicateLink = "90000000-0000-4000-8000-000000000101";
      const duplicateRun = await proveTransitionWaitsForConsumer(box, {
        lockKey: epochLock,
        consumerName: "price_epoch_quick_duplicate",
        consumerCall: quickDuplicateMultiCall({
          source: epochCreateLink,
          link: epochDuplicateLink,
          itemIds: [
            "91000000-0000-4000-8000-000000000102",
            "91000000-0000-4000-8000-000000000103",
          ],
          op: operation(105),
        }),
        consumerRole: "celebix_saas_app",
        transitionName: "price_epoch_activate_duplicate",
        transitionCall: transitionCall("activate", {
          op: operation(106), list: secondEpoch, expected: 1,
        }),
      });
      const duplicateSnapshot = JSON.parse(psql(box, `SELECT pg_catalog.jsonb_build_object(
          'subtotal',link.subtotal_cents,
          'lineSubtotal',pg_catalog.sum(item.line_total_cents),
          'prices',pg_catalog.jsonb_agg(item.unit_price_cents ORDER BY item.position)
        )
        FROM saas.quick_order_links link
        JOIN saas.quick_order_link_items item
          ON item.store_id=link.store_id AND item.quick_order_link_id=link.id
        WHERE link.store_id='${STORE}' AND link.id='${epochDuplicateLink}'
        GROUP BY link.subtotal_cents;`).stdout.trim());

      const epochCart = "92000000-0000-4000-8000-000000000100";
      const cartRun = await proveTransitionWaitsForConsumer(box, {
        lockKey: epochLock,
        consumerName: "price_epoch_abandoned_cart",
        consumerCall: `saas.abandoned_carts_capture(
          '${HOSTNAME}','${epochCart}'::uuid,repeat('e',64),'${NOW}',
          '{"name":"Ada Lovelace","email":"plain@example.test","phone":"+905551110000"}'::jsonb,
          '[{"productId":"${PRODUCT}","variantId":"${VARIANT}","quantity":2},{"productId":"${PRODUCT}","variantId":"${VARIANT_B}","quantity":3}]'::jsonb
        )`,
        consumerRole: "celebix_saas_workflow",
        transitionName: "price_epoch_archive_cart",
        transitionCall: transitionCall("archive", {
          op: operation(107), list: secondEpoch, expected: 2,
        }),
      });
      const cartSnapshot = JSON.parse(psql(box, `SELECT pg_catalog.jsonb_build_object(
          'subtotal',cart.subtotal_cents,
          'lineSubtotal',pg_catalog.sum(item.line_total_cents),
          'prices',pg_catalog.jsonb_agg(item.unit_price_cents ORDER BY item.position)
        )
        FROM saas.abandoned_carts cart
        JOIN saas.abandoned_cart_items item
          ON item.store_id=cart.store_id AND item.cart_id=cart.id
        WHERE cart.store_id='${STORE}' AND cart.id='${epochCart}'
        GROUP BY cart.subtotal_cents;`).stdout.trim());
      psql(box, `SET ROLE celebix_saas_owner;
        DROP TRIGGER quick_item_price_epoch_pause ON saas.quick_order_link_items;
        DROP TRIGGER cart_item_price_epoch_pause ON saas.abandoned_cart_items;
        DROP FUNCTION saas.price_epoch_test_pause();`);

      assert.deepEqual(createRun, {
        waitedForConsumer: true,
        consumerOutcome: "committed",
        transitionOutcome: "archived",
      });
      assert.equal(createSnapshot.subtotal, createSnapshot.lineSubtotal);
      assert.deepEqual(createSnapshot.prices, [700, 1700]);
      assert.deepEqual(duplicateRun, {
        waitedForConsumer: true,
        consumerOutcome: "committed",
        transitionOutcome: "activated",
      });
      assert.equal(duplicateSnapshot.subtotal, duplicateSnapshot.lineSubtotal);
      assert.deepEqual(duplicateSnapshot.prices, [500, 2500]);
      assert.deepEqual(cartRun, {
        waitedForConsumer: true,
        consumerOutcome: "captured",
        transitionOutcome: "archived",
      });
      assert.equal(cartSnapshot.subtotal, cartSnapshot.lineSubtotal);
      assert.deepEqual(cartSnapshot.prices, [800, 1800]);
    });

    await scenario("backup and restore preserve pricing authority ACL RLS and effective result", () => {
      const dump = path.join(box.root, "price-lists.dump");
      command(box.executables.pg_dump, [
        "-h", box.socket, "-p", String(box.port), "-U", "postgres", "-Fc", "-f", dump, DB,
      ]);
      psql(box, `CREATE DATABASE ${RESTORED};`, "postgres");
      command(box.executables.pg_restore, [
        "-h", box.socket, "-p", String(box.port), "-U", "postgres", "-d", RESTORED, dump,
      ]);
      assert.deepEqual(resolve(box, { database: RESTORED }), resolve(box));
      assert.equal(
        psql(box, `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='saas' AND c.relname LIKE 'price_list%' AND c.relrowsecurity AND c.relforcerowsecurity;`, RESTORED).stdout.trim(),
        "4",
      );
      assert.notEqual(
        psql(box, "SET ROLE celebix_saas_app;SELECT count(*) FROM saas.price_lists;", RESTORED, true).status,
        0,
      );
    });

    await scenario("down restores exact pre-045 function definitions", () => {
      psql(box, `SET ROLE celebix_saas_owner;
        ALTER TABLE saas.price_list_operations DISABLE TRIGGER price_list_operations_immutable;
        TRUNCATE saas.price_list_operations,saas.price_list_rules,saas.price_list_items,saas.price_lists;
        ALTER TABLE saas.price_list_operations ENABLE TRIGGER price_list_operations_immutable;`);
      apply(box, "202607220045_price_lists.down.sql");
      assert.deepEqual(readerDefinitions(box), originalReaders);
      assert.equal(
        psql(box, "SELECT to_regclass('saas.price_lists') IS NULL;").stdout.trim(),
        "t",
      );
    });

    await scenario("reapply restores the exact effective-price authority", () => {
      apply(box, "202607220045_price_lists.up.sql");
      assert.equal(
        psql(box, "SELECT to_regprocedure('saas.resolve_effective_variant_price(uuid,uuid,text,timestamptz,text)') IS NOT NULL;").stdout.trim(),
        "t",
      );
      assert.equal(resolve(box).priceCents, 1500);
    });

    await scenario("reapplied assertions verify ownership constraints grants and reader drift", () => {
      apply(box, "202607220045_price_lists_assertions.sql");
      assert.equal(
        psql(box, `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='saas' AND p.proname='resolve_effective_variant_price'
          AND pg_get_userbyid(p.proowner)='celebix_saas_owner';`).stdout.trim(),
        "1",
      );
    });

    await scenario("cleanup removes disposable PostgreSQL and Unix-socket data", () => {
      const root = box.root;
      stop(box);
      box = null;
      assert.equal(absent(cleanupPid), true);
      assert.equal(rmSync(root, { recursive: true, force: true }), undefined);
    });

    assert.equal(count, TOTAL);
  } finally {
    stop(box);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
