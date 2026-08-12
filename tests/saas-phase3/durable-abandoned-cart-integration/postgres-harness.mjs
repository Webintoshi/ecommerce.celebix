import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP = "202608120101_durable_abandoned_cart_integration.up.sql";
const DOWN = "202608120101_durable_abandoned_cart_integration.down.sql";
const ASSERTIONS = "202608120101_durable_abandoned_cart_integration_assertions.sql";
const BACKFILL_UP = "202608120102_durable_abandoned_cart_rollout_backfill.up.sql";
const BACKFILL_DOWN = "202608120102_durable_abandoned_cart_rollout_backfill.down.sql";
const BACKFILL_ASSERTIONS = "202608120102_durable_abandoned_cart_rollout_backfill_assertions.sql";
const DB = `durable_abandoned_${randomBytes(5).toString("hex")}`;
const RESTORE_DB = `${DB}_restore`;
const STORE = "10000000-0000-4000-8000-000000000101";
const OTHER_STORE = "10000000-0000-4000-8000-000000000102";
const PRINCIPAL = "20000000-0000-4000-8000-000000000101";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000101";
const PRODUCT = "40000000-0000-4000-8000-000000000101";
const VARIANT = "50000000-0000-4000-8000-000000000101";
const VARIANT_TWO = "50000000-0000-4000-8000-000000000102";
const CART = "60000000-0000-4000-8000-000000000101";
const CART_TWO = "60000000-0000-4000-8000-000000000102";
const CART_THREE = "60000000-0000-4000-8000-000000000103";
const CART_FOUR = "60000000-0000-4000-8000-000000000104";
const CART_FIVE = "60000000-0000-4000-8000-000000000105";
const CART_DELETE = "60000000-0000-4000-8000-000000000106";
const CART_PREEXISTING = "60000000-0000-4000-8000-000000000107";
const PLAN = "00000000-0000-4000-8000-000000000001";
const HOST = "durable-cart.example.test";
const OTHER_HOST = "other-durable-cart.example.test";
const NOW = "2026-08-12T10:00:00.000Z";
const DIGEST = "a".repeat(64);
const DIGEST_TWO = "b".repeat(64);
const TOTAL = 30;
let completed = 0;

function bin(name) {
  const bundled = path.join(homedir(), ".codex", "tmp");
  let candidates = [];
  try {
    candidates = readdirSync(bundled, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^postgresql-16[.][0-9]+-install$/.test(entry.name))
      .map((entry) => path.join(bundled, entry.name, "bin"));
  } catch {}
  for (const directory of [process.env.POSTGRES_BIN, ...(process.env.PATH ?? "").split(path.delimiter), ...candidates]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch {}
  }
  throw new Error(`DISPOSABLE_DB_EXECUTION_BLOCKED: missing ${name}`);
}

function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, {
    cwd: ROOT, input, encoding: "utf8", env: { ...process.env, LC_ALL: "C", LANG: "C" }, maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}

function start() {
  const tools = Object.fromEntries(["initdb", "pg_ctl", "psql", "pg_dump", "pg_restore", "createdb"].map((name) => [name, bin(name)]));
  const root = mkdtempSync(path.join(tmpdir(), "cx-durable-abandoned-"));
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
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
  return command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], source, allowFailure);
}
function psqlAsync(box, source, database = DB) {
  return new Promise((resolve,reject) => {
    const child=spawn(box.tools.psql,["-h",box.socket,"-p",String(box.port),"-X","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d",database],{
      cwd:ROOT,env:{...process.env,LC_ALL:"C",LANG:"C"},stdio:["pipe","pipe","pipe"],
    });
    let stdout="",stderr="";
    child.stdout.on("data",(chunk) => { stdout+=chunk; });
    child.stderr.on("data",(chunk) => { stderr+=chunk; });
    child.on("error",reject);
    child.on("close",(status) => status===0 ? resolve({stdout,stderr}) : reject(new Error(stderr)));
    child.stdin.end(source);
  });
}
function apply(box, file, database = DB, prefix = "") { return psql(box, `${prefix}${readFileSync(path.join(SQL, file), "utf8")}`, database); }
function scenario(name, run) { run(); completed += 1; process.stdout.write(`PASS ${completed}/${TOTAL} ${name}\n`); }
function envelope(result) { return JSON.parse(result.stdout.trim().split("\n").at(-1)); }
function publicCall(box, expression) {
  return envelope(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${expression};COMMIT;`));
}
async function publicCallAsync(box, expression) {
  return envelope(await psqlAsync(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${expression};COMMIT;`));
}
function candidates(digest = DIGEST, keyId = "cart-key-01") { return JSON.stringify([{ keyId, digest }]).replaceAll("'", "''"); }
function mutate(box, { cart = CART, digest = DIGEST, keyId = "cart-key-01", operation = "70000000-0000-4000-8000-000000000101", fingerprint = "c".repeat(64), action = "add", expected = 0, quantity = 2, now = NOW } = {}) {
  const creating = expected === 0;
  return publicCall(box, `saas.public_cart_mutate('${HOST}','${now}','${creating ? "[]" : candidates(digest,keyId)}'::jsonb,'${cart}',${creating ? `'${keyId}'` : "NULL"},${creating ? `'${digest}'` : "NULL"},${creating ? "'2026-09-12T10:00:00Z'" : "NULL"},'${operation}','${fingerprint}','${action}',${expected},'${PRODUCT}','${VARIANT}',${action === "remove" ? "NULL" : quantity})`);
}
const DELIVERY = JSON.stringify({
  contact: { firstName: "Durable", lastName: "Customer", email: "durable@example.test", phone: "+905551112233" },
  shippingAddress: { line1: "Test Caddesi 1", city: "Istanbul", district: "Kadikoy", postalCode: "34710", country: "TR" },
  note: "Durable checkout",
}).replaceAll("'", "''");
function complete(box, {
  cart, digest, keyId, expected = 1, now, operation, fingerprint, order, customer, address, event, receipt, receiptDigest,
  customerCredential, customerDigest,
}) {
  return publicCall(box, `saas.public_checkout_complete(
    '${HOST}','${now}','cart','${candidates(digest,keyId)}'::jsonb,'[]'::jsonb,
    '${operation}','${fingerprint}',${expected},'${DELIVERY}'::jsonb,'bank_transfer',
    '${order}','${customer}','${address}','${event}','${receipt}','receipt-${keyId}','${receiptDigest}','${now}'::timestamptz+INTERVAL '12 hours',
    '${customerCredential}','customer-${keyId}','${customerDigest}','${now}'::timestamptz+INTERVAL '30 days'
  )`);
}
function authority(now) { return `'${STORE}'::uuid,'${PRINCIPAL}'::uuid,'${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${now}'::timestamptz`; }
function list(box, now, status = "NULL") {
  return envelope(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.abandoned_carts_list(${authority(now)},${status},NULL,'newest',100,NULL,NULL,NULL);COMMIT;`));
}
function row(box, cart = CART, database = DB) {
  return JSON.parse(psql(box, `SELECT pg_catalog.row_to_json(selected)::text FROM (SELECT id,source_cart_id,status,subtotal_cents,total_cents,last_activity_at,abandoned_at,recovered_at,archived_at,recovered_order_id,version FROM saas.abandoned_carts WHERE store_id='${STORE}' AND source_cart_id='${cart}') selected;`, database).stdout.trim() || "null");
}

function baseMigrations() {
  const accepted = /(?:[.]up|[.]seed|[.]freeze|_grants|_assertions|catalog_assertions)[.]sql$/;
  return readdirSync(SQL).filter((file) => {
    const sequence = Number.parseInt(file.slice(8, 12), 10);
    return Number.isSafeInteger(sequence) && sequence <= 71 && accepted.test(file) && !file.includes(".down.");
  }).sort((left, right) => {
    const difference = Number.parseInt(left.slice(8, 12), 10) - Number.parseInt(right.slice(8, 12), 10);
    const weight = (file) => file.includes("assertions") ? 3 : file.includes("freeze") || file.includes("grants") ? 2 : 1;
    return difference || weight(left) - weight(right) || left.localeCompare(right);
  });
}

function currentMigrations() {
  const accepted = /[.]up[.]sql$/;
  return readdirSync(SQL).filter((file) => {
    const sequence = Number.parseInt(file.slice(8,12),10);
    return Number.isSafeInteger(sequence) && sequence>=72 && sequence<=100
      && accepted.test(file) && !file.includes(".down.")
      && file!=="202607300073_seed_guzide_pilot_admin_domain.up.sql";
  }).sort((left,right) => {
    const prefixDifference=left.slice(0,12).localeCompare(right.slice(0,12));
    return prefixDifference || left.localeCompare(right);
  });
}

function seed(box) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
      ('${STORE}','Durable Cart','durable-cart','active','tr','TRY','starter','2026-01-01','2026-01-01'),
      ('${OTHER_STORE}','Other Cart','other-durable-cart','active','tr','TRY','starter','2026-01-01','2026-01-01');
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
      VALUES('${PRINCIPAL}','https://identity.example.test/oidc','durable-owner','owner@example.test',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)
      VALUES('${MEMBERSHIP}','${PRINCIPAL}','${STORE}','store_owner','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
      VALUES('80000000-0000-4000-8000-000000000101','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
    INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES
      ('81000000-0000-4000-8000-000000000101','${STORE}','${HOST}','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1),
      ('81000000-0000-4000-8000-000000000102','${OTHER_STORE}','${OTHER_HOST}','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
    INSERT INTO saas.products(id,store_id,slug,title,description,status,currency,version,created_at,updated_at)
      VALUES('${PRODUCT}','${STORE}','altin-yuzuk','Altın Yüzük','Güvenli katalog verisi','active','TRY',1,'2026-01-01','2026-01-01');
    SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);
    SELECT pg_catalog.set_config('saas.inventory.source_id','84000000-0000-4000-8000-000000000101',true);
    SELECT pg_catalog.set_config('saas.inventory.source_time','${NOW}',true);
    INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES
      ('${VARIANT}','${PRODUCT}','${STORE}','14 Ayar','YZK-101',12500,false,0,'active','{}',1,'2026-01-01','2026-01-01'),
      ('${VARIANT_TWO}','${PRODUCT}','${STORE}','18 Ayar','YZK-102',15000,false,0,'active','{}',1,'2026-01-01','2026-01-01');
    SELECT pg_catalog.set_config('saas.inventory.source_marker','',true);
    SELECT pg_catalog.set_config('saas.inventory.source_id','',true);
    SELECT pg_catalog.set_config('saas.inventory.source_time','',true);
    INSERT INTO saas.payment_methods(id,store_id,kind,label,state,position,config,created_at,updated_at)
      VALUES('85000000-0000-4000-8000-000000000101','${STORE}','bank_transfer','Banka havalesi','active',10,
        '{"accountHolder":"Durable Cart","bankName":"Test Bank","iban":"TR330006100519786457841326","instructions":"Sipariş numarasını yazın."}',
        '2026-01-01','2026-01-01');
    INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,created_at,updated_at)
      VALUES('86000000-0000-4000-8000-000000000101','${STORE}','shipping_setting','Standart kargo',
        '{"regions":["TR"],"estimatedDays":3}','active','2026-01-01','2026-01-01');
    COMMIT;`);
}

function seedPreexistingCart(box) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)
      VALUES('${CART_PREEXISTING}','${STORE}','active',1,'2026-09-12','2026-08-12 09:00+00','2026-08-12 09:01+00');
    INSERT INTO saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at)
      VALUES('${CART_PREEXISTING}','${STORE}','preexisting-key',repeat('e',64),'2026-09-12');
    INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at)
      VALUES('${CART_PREEXISTING}','${STORE}','${PRODUCT}','${VARIANT}',2,12500,0,'2026-08-12 09:00+00','2026-08-12 09:01+00');
    COMMIT;`);
}

async function main() {
  for (const file of [UP, DOWN, ASSERTIONS, BACKFILL_UP, BACKFILL_DOWN, BACKFILL_ASSERTIONS]) assert.equal(existsSync(path.join(SQL, file)), true, file);
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const file of baseMigrations()) apply(box, file);
    seed(box);
    for (const file of currentMigrations()) apply(box, file);
    seedPreexistingCart(box);
    apply(box, UP);
    apply(box, BACKFILL_UP);
    apply(box, ASSERTIONS);
    apply(box, BACKFILL_ASSERTIONS);

    scenario("PostgreSQL 16 applies migration 101", () => assert.match(psql(box, "SHOW server_version;").stdout, /^16[.]/));
    scenario("migration 102 backfills a pre-existing active cart exactly once", () => {
      const projected = row(box,CART_PREEXISTING);
      assert.equal(projected.status,"active");
      assert.equal(projected.subtotal_cents,25000);
      assert.equal(psql(box,`SELECT count(*) FROM saas.abandoned_carts WHERE store_id='${STORE}' AND source_cart_id='${CART_PREEXISTING}';`).stdout.trim(),"1");
    });
    const created = mutate(box);
    scenario("first durable add commits normally", () => assert.equal(created.outcome, "committed"));
    scenario("first durable add creates immediate active merchant projection", () => {
      const projected = row(box);
      assert.equal(projected.status, "active"); assert.equal(projected.subtotal_cents, 25000); assert.equal(projected.total_cents, 25000);
    });
    scenario("projection snapshots catalog name SKU and quantity", () => {
      assert.equal(psql(box, `SELECT product_name||':'||sku||':'||quantity FROM saas.abandoned_cart_items WHERE store_id='${STORE}' AND cart_id=(SELECT id FROM saas.abandoned_carts WHERE source_cart_id='${CART}');`).stdout.trim(), "Altın Yüzük:YZK-101:2");
    });
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
      UPDATE saas.storefront_cart_items SET quantity=5,updated_at='2026-08-12T10:01:00Z'
      WHERE store_id='${STORE}' AND cart_id='${CART}' AND variant_id='${VARIANT}';
      COMMIT;`);
    scenario("item-only durable mutation refreshes projection at commit", () => {
      const projected=row(box);
      assert.equal(projected.subtotal_cents,62500);
      assert.equal(Date.parse(projected.last_activity_at),Date.parse("2026-08-12T10:01:00Z"));
      assert.equal(psql(box, `SELECT quantity FROM saas.abandoned_cart_items WHERE store_id='${STORE}' AND cart_id=(SELECT id FROM saas.abandoned_carts WHERE source_cart_id='${CART}');`).stdout.trim(),"5");
    });
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;SELECT saas.reconcile_durable_abandoned_carts('${STORE}','2026-08-12T10:30:00Z');COMMIT;`);
    scenario("item-only activity cannot be falsely abandoned before its own threshold", () => assert.equal(row(box).status,"active"));
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
      INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)
        VALUES('${CART_DELETE}','${STORE}','active',1,'2030-01-01','2020-01-01','2020-01-01');
      INSERT INTO saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at)
        VALUES('${CART_DELETE}','${STORE}','cart-delete',repeat('d',64),'2030-01-01');
      INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at) VALUES
        ('${CART_DELETE}','${STORE}','${PRODUCT}','${VARIANT}',1,12500,0,'2020-01-01','2020-01-01'),
        ('${CART_DELETE}','${STORE}','${PRODUCT}','${VARIANT_TWO}',1,15000,1,'2020-01-01','2020-01-01');
      COMMIT;`);
    const beforeItemDelete=Number(psql(box,"SELECT extract(epoch FROM pg_catalog.statement_timestamp())*1000;").stdout.trim());
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
      DELETE FROM saas.storefront_cart_items WHERE store_id='${STORE}' AND cart_id='${CART_DELETE}' AND variant_id='${VARIANT_TWO}';
      COMMIT;`);
    scenario("item-only delete advances server-owned activity while another item remains", () => {
      const projected=row(box,CART_DELETE);
      assert.equal(projected.status,"active");
      assert.equal(projected.subtotal_cents,12500);
      assert.ok(Date.parse(projected.last_activity_at)>=beforeItemDelete);
    });
    const changed = mutate(box, { operation: "70000000-0000-4000-8000-000000000102", fingerprint: "d".repeat(64), action: "quantity", expected: 1, quantity: 3, now: "2026-08-12T10:05:00Z" });
    scenario("quantity mutation updates the same projection", () => { assert.equal(changed.outcome, "committed"); assert.equal(row(box).subtotal_cents, 37500); });
    scenario("29 minutes 59 seconds remains active", () => { list(box, "2026-08-12T10:34:59Z"); assert.equal(row(box).status, "active"); });
    scenario("exactly 30 minutes becomes abandoned on authorized read", () => { list(box, "2026-08-12T10:35:00Z"); assert.equal(row(box).status, "abandoned"); });
    const resumed = mutate(box, { operation: "70000000-0000-4000-8000-000000000103", fingerprint: "e".repeat(64), action: "quantity", expected: 2, quantity: 4, now: "2026-08-12T10:36:00Z" });
    scenario("new durable activity reactivates without false recovery", () => { assert.equal(resumed.outcome, "committed"); const projected=row(box); assert.equal(projected.status,"active"); assert.equal(projected.recovered_at,null); });
    const removed = mutate(box, { operation: "70000000-0000-4000-8000-000000000104", fingerprint: "f".repeat(64), action: "remove", expected: 3, now: "2026-08-12T10:37:00Z" });
    scenario("empty durable cart archives and clears snapshot", () => { assert.equal(removed.outcome,"committed"); assert.equal(row(box).status,"archived"); assert.equal(psql(box,`SELECT count(*) FROM saas.abandoned_cart_items WHERE cart_id=(SELECT id FROM saas.abandoned_carts WHERE source_cart_id='${CART}');`).stdout.trim(),"0"); });
    const second = mutate(box, { cart: CART_TWO, digest: DIGEST_TWO, keyId: "cart-key-02", operation: "70000000-0000-4000-8000-000000000105", fingerprint: "1".repeat(64), quantity: 1, now: "2026-08-12T11:00:00Z" });
    scenario("second cart creates an isolated projection", () => { assert.equal(second.outcome,"committed"); assert.equal(row(box,CART_TWO).subtotal_cents,12500); });
    const secondVersion = row(box,CART_TWO).version;
    const replayed = mutate(box, { cart: CART_TWO, digest: DIGEST_TWO, keyId: "cart-key-02", operation: "70000000-0000-4000-8000-000000000105", fingerprint: "1".repeat(64), quantity: 1, now: "2026-08-12T11:00:00Z" });
    scenario("operation replay does not duplicate or advance the projection", () => { assert.equal(replayed.outcome,"operation_replayed"); assert.equal(row(box,CART_TWO).version,secondVersion); });
    scenario("cross-store sync input cannot attach another tenant cart", () => {
      psql(box,`BEGIN;SET LOCAL ROLE celebix_saas_owner;SELECT saas.sync_durable_abandoned_cart('${OTHER_STORE}','${CART_TWO}','2026-08-12T11:01:00Z');COMMIT;`);
      assert.equal(psql(box,`SELECT count(*) FROM saas.abandoned_carts WHERE store_id='${OTHER_STORE}' AND source_cart_id='${CART_TWO}';`).stdout.trim(),"0");
    });
    scenario("unauthorized merchant read cannot trigger reconciliation", () => {
      const denied = envelope(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.abandoned_carts_summary('${OTHER_STORE}','${PRINCIPAL}','${MEMBERSHIP}','${PLAN}','free_starter',1,'2026-08-12T12:00:00Z');COMMIT;`));
      assert.equal(denied.outcome,"membership_denied"); assert.equal(row(box,CART_TWO).status,"active");
    });
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;SELECT saas.reconcile_durable_abandoned_carts('${STORE}','2026-08-12T11:30:00Z');COMMIT;`);
    const completedAbandoned = complete(box, {
      cart:CART_TWO,digest:DIGEST_TWO,keyId:"cart-key-02",now:"2026-08-12T11:31:00Z",
      operation:"83000000-0000-4000-8000-000000000101",fingerprint:"2".repeat(64),order:"82000000-0000-4000-8000-000000000101",
      customer:"87000000-0000-4000-8000-000000000101",address:"88000000-0000-4000-8000-000000000101",event:"89000000-0000-4000-8000-000000000101",
      receipt:"8a000000-0000-4000-8000-000000000101",receiptDigest:"8".repeat(64),customerCredential:"8b000000-0000-4000-8000-000000000101",customerDigest:"9".repeat(64),
    });
    scenario("abandoned checkout becomes recovered with exact order", () => { assert.equal(completedAbandoned.outcome,"committed"); const projected=row(box,CART_TWO); assert.equal(projected.status,"recovered"); assert.equal(projected.recovered_order_id,"82000000-0000-4000-8000-000000000101"); });
    const third = mutate(box, { cart: CART_THREE, digest: "3".repeat(64), keyId: "cart-key-03", operation: "70000000-0000-4000-8000-000000000106", fingerprint: "3".repeat(64), quantity: 1, now: "2026-08-12T12:00:00Z" });
    scenario("third active cart is projected before checkout", () => { assert.equal(third.outcome,"committed"); assert.equal(row(box,CART_THREE).status,"active"); });
    const completedActive = complete(box, {
      cart:CART_THREE,digest:"3".repeat(64),keyId:"cart-key-03",now:"2026-08-12T12:01:00Z",
      operation:"83000000-0000-4000-8000-000000000102",fingerprint:"4".repeat(64),order:"82000000-0000-4000-8000-000000000102",
      customer:"87000000-0000-4000-8000-000000000102",address:"88000000-0000-4000-8000-000000000102",event:"89000000-0000-4000-8000-000000000102",
      receipt:"8a000000-0000-4000-8000-000000000102",receiptDigest:"a".repeat(64),customerCredential:"8b000000-0000-4000-8000-000000000102",customerDigest:"b".repeat(64),
    });
    scenario("active checkout archives with exact order instead of false recovery", () => { assert.equal(completedActive.outcome,"committed"); const projected=row(box,CART_THREE); assert.equal(projected.status,"archived"); assert.equal(projected.recovered_order_id,"82000000-0000-4000-8000-000000000102"); assert.equal(projected.recovered_at,null); });
    const fourth = mutate(box, { cart: CART_FOUR, digest: "5".repeat(64), keyId: "cart-key-04", operation: "70000000-0000-4000-8000-000000000107", fingerprint: "5".repeat(64), quantity: 1, now: "2026-08-12T12:10:00Z" });
    const fourthProjection = row(box,CART_FOUR);
    const archived = envelope(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_app;
      SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
      FROM saas.abandoned_carts_archive(${authority("2026-08-12T12:11:00Z")},'70000000-0000-4000-8000-000000000108',repeat('6',64),'${fourthProjection.id}',${fourthProjection.version});
      COMMIT;`));
    mutate(box, { cart: CART_FOUR, digest: "5".repeat(64), keyId: "cart-key-04", operation: "70000000-0000-4000-8000-000000000109", fingerprint: "7".repeat(64), action: "quantity", expected: 1, quantity: 2, now: "2026-08-12T12:12:00Z" });
    scenario("manual merchant archive remains terminal after later cart activity", () => {
      assert.equal(fourth.outcome,"committed"); assert.equal(archived.outcome,"committed");
      const projected=row(box,CART_FOUR); assert.equal(projected.status,"archived"); assert.equal(projected.total_cents,12500);
    });
    const fifth = mutate(box, { cart:CART_FIVE,digest:"c".repeat(64),keyId:"cart-key-05",operation:"70000000-0000-4000-8000-000000000110",fingerprint:"8".repeat(64),quantity:1,now:"2026-08-12T12:20:00Z" });
    const concurrentExpression = (operation,fingerprint,quantity) => `saas.public_cart_mutate('${HOST}','2026-08-12T12:21:00Z','${candidates("c".repeat(64),"cart-key-05")}'::jsonb,'${CART_FIVE}',NULL,NULL,NULL,'${operation}','${fingerprint}','quantity',1,'${PRODUCT}','${VARIANT}',${quantity})`;
    const concurrent = await Promise.all([
      publicCallAsync(box,concurrentExpression("70000000-0000-4000-8000-000000000111","9".repeat(64),2)),
      publicCallAsync(box,concurrentExpression("70000000-0000-4000-8000-000000000112","a".repeat(64),3)),
    ]);
    scenario("concurrent cart mutations serialize to one exact projection", () => {
      assert.equal(fifth.outcome,"committed");
      assert.deepEqual(concurrent.map((result) => result.outcome).sort(),["committed","version_conflict"]);
      assert.ok([25000,37500].includes(row(box,CART_FIVE).total_cents));
      assert.equal(psql(box,`SELECT count(*) FROM saas.abandoned_carts WHERE store_id='${STORE}' AND source_cart_id='${CART_FIVE}';`).stdout.trim(),"1");
    });
    scenario("runtime roles retain no direct source or projection table authority", () => assert.equal(psql(box,`SELECT pg_catalog.bool_or(pg_catalog.has_table_privilege(runtime_role,protected_table,privilege_name))
      FROM pg_catalog.unnest(ARRAY['celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver']) runtime_role
      CROSS JOIN pg_catalog.unnest(ARRAY[
        'saas.storefront_carts','saas.storefront_cart_credentials','saas.storefront_cart_items','saas.storefront_cart_operations',
        'saas.storefront_checkout_intents','saas.storefront_customer_credentials','saas.storefront_order_receipts','saas.storefront_checkout_operations',
        'saas.abandoned_carts','saas.abandoned_cart_items'
      ]) protected_table
      CROSS JOIN pg_catalog.unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege_name;`).stdout.trim(),"f"));
    scenario("raw cart token is absent from durable projection", () => assert.equal(psql(box,`SELECT (pg_catalog.row_to_json(cart)::text LIKE '%c1.%' OR pg_catalog.row_to_json(cart)::text LIKE '%cart-key-02%')::int FROM saas.abandoned_carts cart WHERE source_cart_id='${CART_TWO}';`).stdout.trim(),"0"));
    scenario("transaction rollback leaves no projection", () => {
      const result=psql(box,`BEGIN;SET LOCAL ROLE celebix_saas_owner;INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at) VALUES('60000000-0000-4000-8000-000000000199','${STORE}','active',1,'2026-09-12','2026-08-12','2026-08-12');INSERT INTO saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at) VALUES('60000000-0000-4000-8000-000000000199','${STORE}','rollback-key',repeat('9',64),'2026-09-12');ROLLBACK;SELECT count(*) FROM saas.abandoned_carts WHERE source_cart_id='60000000-0000-4000-8000-000000000199';`);
      assert.equal(result.stdout.trim().split("\n").at(-1),"0");
    });
    scenario("backup and restore preserve source and order binding", () => {
      const archive=path.join(box.root,"durable.dump"); command(box.tools.pg_dump,["-h",box.socket,"-p",String(box.port),"-U","postgres","-d",DB,"-Fc","-f",archive]);
      command(box.tools.createdb,["-h",box.socket,"-p",String(box.port),"-U","postgres",RESTORE_DB]); command(box.tools.pg_restore,["-h",box.socket,"-p",String(box.port),"-U","postgres","-d",RESTORE_DB,archive]);
      assert.equal(row(box,CART_TWO,RESTORE_DB).status,"recovered");
    });
    scenario("rollout backfill rollback is guarded and preserves projected history", () => {
      assert.notEqual(psql(box,readFileSync(path.join(SQL,BACKFILL_DOWN),"utf8"),DB,true).status,0);
      apply(box,BACKFILL_DOWN,DB,"SET celebix.allow_durable_abandoned_cart_rollout_backfill_down='on';\n");
      assert.equal(row(box,CART_PREEXISTING).source_cart_id,CART_PREEXISTING);
    });
    scenario("unguarded rollback is rejected", () => assert.notEqual(psql(box,readFileSync(path.join(SQL,DOWN),"utf8"),DB,true).status,0));
    scenario("guarded rollback and reapply restore exact authority", () => { apply(box,DOWN,DB,"SET celebix.allow_durable_abandoned_cart_integration_down='on';\n"); apply(box,UP); apply(box,ASSERTIONS); assert.equal(psql(box,"SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgname='durable_abandoned_cart_sync';").stdout.trim(),"1"); });
    scenario("disposable database has no leaked sessions", () => assert.equal(psql(box,"SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE datname=current_database() AND pid<>pg_catalog.pg_backend_pid();").stdout.trim(),"0"));
    assert.equal(completed,TOTAL); process.stdout.write(`${TOTAL}/${TOTAL} PASS\n`);
  } finally { stop(box); }
}

main().catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode=1; });
