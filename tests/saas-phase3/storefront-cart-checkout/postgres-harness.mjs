import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const DB = "storefront_cart_checkout";
const RESTORE_DB = "storefront_cart_checkout_restore";
const UP = "202607310072_storefront_cart_checkout.up.sql";
const DOWN = "202607310072_storefront_cart_checkout.down.sql";
const ASSERTIONS = "202607310072_storefront_cart_checkout_assertions.sql";
const MANIFEST = "phase4b-storefront-cart-checkout-manifest.json";
const STORE = "10000000-0000-4000-8000-000000000081";
const OTHER_STORE = "10000000-0000-4000-8000-000000000082";
const HOST = "guzide-cart.saas-staging.celebix.site";
const OTHER_HOST = "other-cart.saas-staging.celebix.site";
const PLAN = "00000000-0000-4000-8000-000000000001";
const PRINCIPAL = "20000000-0000-4000-8000-000000000081";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000081";
const PRODUCT = "40000000-0000-4000-8000-000000000081";
const OTHER_PRODUCT = "40000000-0000-4000-8000-000000000082";
const VARIANT = "50000000-0000-4000-8000-000000000081";
const OTHER_VARIANT = "50000000-0000-4000-8000-000000000082";
const CART = "60000000-0000-4000-8000-000000000081";
const CART_KEY = "cart-key-01";
const CART_DIGEST = "a".repeat(64);
const INTENT = "61000000-0000-4000-8000-000000000081";
const INTENT_DIGEST = "b".repeat(64);
const NOW = "2026-07-31T12:00:00.000Z";
const LATER = "2026-07-31T12:05:00.000Z";
const TOTAL = 35;
let completed = 0;

function executable(name) {
  const bundled = path.join(homedir(), ".codex", "tmp");
  let directories = [];
  try {
    directories = readdirSync(bundled, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^postgresql-[0-9.]+-install$/.test(entry.name))
      .map((entry) => path.join(bundled, entry.name, "bin"));
  } catch {}
  for (const directory of [process.env.POSTGRES_BIN, ...(process.env.PATH ?? "").split(path.delimiter), ...directories]) {
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
  const tools = Object.fromEntries(["initdb", "pg_ctl", "psql", "pg_dump", "pg_restore"].map((name) => [name, executable(name)]));
  // macOS limits Unix-domain socket paths to 103 bytes; /tmp keeps the disposable
  // cluster socket below that limit even when the workspace path is long.
  const root = mkdtempSync(path.join("/tmp", "celebix-commerce-"));
  const data = path.join(root, "data"), socket = path.join(root, "socket"), port = 20000 + Math.floor(Math.random() * 15000);
  mkdirSync(socket, { mode: 0o700 });
  command(tools.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(tools.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { tools, root, data, socket, port, pid: Number.parseInt(readFileSync(path.join(data, "postmaster.pid"), "utf8"), 10) };
}

function stop(box) {
  if (!box) return;
  command(box.tools.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], "", true);
  rmSync(box.root, { recursive: true, force: true });
}

function psql(box, sql, database = DB, allowFailure = false) {
  return command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], sql, allowFailure);
}

function psqlAsync(box, sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", DB], { cwd: ROOT, env: { ...process.env, LC_ALL: "C", LANG: "C" } });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => status === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr)));
    child.stdin.end(sql);
  });
}

function apply(box, file, database = DB) { psql(box, readFileSync(path.join(SQL, file), "utf8"), database); }
function migrations() {
  const accepted = /(?:\.up|\.seed|\.freeze|_grants|_assertions|catalog_assertions)\.sql$/;
  return readdirSync(SQL).filter((file) => {
    const sequence = Number.parseInt(file.slice(8, 12), 10);
    return Number.isSafeInteger(sequence) && sequence <= 71 && accepted.test(file) && !file.includes(".down.");
  }).sort((left, right) => {
    const a = Number.parseInt(left.slice(8, 12), 10), b = Number.parseInt(right.slice(8, 12), 10);
    if (a !== b) return a - b;
    const weight = (value) => value.includes("assertions") ? 3 : value.includes("freeze") || value.includes("grants") ? 2 : 1;
    return weight(left) - weight(right) || left.localeCompare(right);
  });
}
function esc(value) { return value.replaceAll("'", "''"); }
function envelope(result) { const line = result.stdout.trim().split("\n").at(-1); return line ? JSON.parse(line) : null; }
function publicCall(box, expression, database = DB) { return envelope(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT jsonb_build_object('outcome',outcome,'result_payload',result_payload) FROM ${expression};COMMIT;`, database)); }
function candidates(keyId = CART_KEY, digest = CART_DIGEST) { return esc(JSON.stringify([{ keyId, digest }])); }
function resolveCart(box, keyId = CART_KEY, digest = CART_DIGEST, hostname = HOST, now = NOW) { return publicCall(box, `saas.public_cart_resolve('${hostname}','${now}','${candidates(keyId, digest)}'::jsonb)`); }
function mutate(box, { operation = "70000000-0000-4000-8000-000000000081", fingerprint = "c".repeat(64), action = "add", expected = 0, product = PRODUCT, variant = VARIANT, quantity = 2, credentials = "[]", cart = CART, keyId = CART_KEY, digest = CART_DIGEST, now = NOW, hostname = HOST } = {}) {
  const creating = credentials === "[]";
  return publicCall(box, `saas.public_cart_mutate('${hostname}','${now}','${esc(credentials)}'::jsonb,'${cart}',${creating ? `'${keyId}'` : "NULL"},${creating ? `'${digest}'` : "NULL"},${creating ? "'2026-08-30T12:00:00Z'" : "NULL"},'${operation}','${fingerprint}','${action}',${expected},${product ? `'${product}'` : "NULL"},${variant ? `'${variant}'` : "NULL"},${quantity ?? "NULL"})`);
}
function createIntent(box, { intent = INTENT, keyId = "intent-key-01", digest = INTENT_DIGEST, product = PRODUCT, variant = VARIANT, quantity = 1, hostname = HOST } = {}) { return publicCall(box, `saas.public_buy_now_create('${hostname}','${NOW}','${intent}','${keyId}','${digest}','2026-07-31T12:15:00Z','${product}','${variant}',${quantity})`); }
function quote(box, kind = "cart", credentials = candidates(), hostname = HOST) { return publicCall(box, `saas.public_checkout_quote('${hostname}','${NOW}','${kind}','${credentials}'::jsonb)`); }
const DELIVERY = esc(JSON.stringify({ contact: { firstName: "Güzide", lastName: "Elif", email: "guzide@example.test", phone: "+905551112233" }, shippingAddress: { line1: "Bağdat Caddesi 1", city: "İstanbul", district: "Kadıköy", postalCode: "34710", country: "TR" }, note: "Kapıyı arayın" }));
function completeSql({ operation = "71000000-0000-4000-8000-000000000081", fingerprint = "d".repeat(64), kind = "cart", credentials = candidates(), customerCredentials = "[]", version = 3, payment = "bank_transfer", order = "72000000-0000-4000-8000-000000000081", customer = "73000000-0000-4000-8000-000000000081", address = "74000000-0000-4000-8000-000000000081", event = "75000000-0000-4000-8000-000000000081", receipt = "76000000-0000-4000-8000-000000000081", receiptDigest = "e".repeat(64), customerCredential = "77000000-0000-4000-8000-000000000081", customerDigest = "f".repeat(64), hostname = HOST } = {}) {
  return `saas.public_checkout_complete('${hostname}','${NOW}','${kind}','${credentials}'::jsonb,'${customerCredentials}'::jsonb,'${operation}','${fingerprint}',${version},'${DELIVERY}'::jsonb,'${payment}','${order}','${customer}','${address}','${event}','${receipt}','receipt-key-01','${receiptDigest}','2026-08-01T12:00:00Z','${customerCredential}','customer-key-01','${customerDigest}','2026-08-30T12:00:00Z')`;
}
function complete(box, input = {}) { return publicCall(box, completeSql(input)); }
async function scenario(name, run) { await run(); completed += 1; console.log(`PASS ${completed}/${TOTAL} ${name}`); }

function seed(box) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
('${STORE}','Güzide','guzide-cart','active','tr','TRY','starter','2026-01-01','2026-01-01'),
('${OTHER_STORE}','Other','other-cart','active','tr','TRY','starter','2026-01-01','2026-01-01');
INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${PRINCIPAL}','https://identity.example.test/oidc','cart-a','cart-a@example.test',true,'2026-01-01','2026-01-01');
INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${MEMBERSHIP}','${PRINCIPAL}','${STORE}','store_owner','active','2026-01-01','2026-01-01');
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('78000000-0000-4000-8000-000000000081','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES
('79000000-0000-4000-8000-000000000081','${STORE}','${HOST}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1),
('79000000-0000-4000-8000-000000000082','${OTHER_STORE}','${OTHER_HOST}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
INSERT INTO saas.products(id,store_id,slug,title,description,status,currency,version,created_at,updated_at) VALUES
('${PRODUCT}','${STORE}','altin-yuzuk','Altın Yüzük','Özel tasarım','active','TRY',1,'2026-01-02','2026-01-02'),
('${OTHER_PRODUCT}','${OTHER_STORE}','other-ring','Other Ring',NULL,'active','TRY',1,'2026-01-02','2026-01-02');
INSERT INTO saas.product_media(id,store_id,product_id,object_key,public_url,media_type,alt_text,width,height,byte_size,sort_order,status,created_at,updated_at,version) VALUES
('84000000-0000-4000-8000-000000000081','${STORE}','${PRODUCT}','stores/${STORE}/products/${PRODUCT}/84000000-0000-4000-8000-000000000081.webp','https://media.saas-staging.celebix.site/stores/${STORE}/products/${PRODUCT}/84000000-0000-4000-8000-000000000081.webp','image/webp','Altın Yüzük',800,800,4096,0,'active','2026-01-02','2026-01-02',1);
SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);SELECT pg_catalog.set_config('saas.inventory.source_id','80000000-0000-4000-8000-000000000081',true);SELECT pg_catalog.set_config('saas.inventory.source_time','${NOW}',true);
INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES
('${VARIANT}','${PRODUCT}','${STORE}','14 Ayar','YZK-1090',1127100,true,8,'active','{}',1,'2026-01-02','2026-01-02'),
('${OTHER_VARIANT}','${OTHER_PRODUCT}','${OTHER_STORE}','Standart','OTHER-1',50000,true,8,'active','{}',1,'2026-01-02','2026-01-02');
SELECT pg_catalog.set_config('saas.inventory.source_marker','',true);SELECT pg_catalog.set_config('saas.inventory.source_id','',true);SELECT pg_catalog.set_config('saas.inventory.source_time','',true);
INSERT INTO saas.payment_methods(id,store_id,kind,label,state,position,config,created_at,updated_at) VALUES
('81000000-0000-4000-8000-000000000081','${STORE}','bank_transfer','Banka havalesi','active',10,'{"accountHolder":"Güzide Kuyumcu","bankName":"Celebix Bank","iban":"TR330006100519786457841326","instructions":"Sipariş numaranızı açıklamaya yazın."}','2026-01-01','2026-01-01'),
('81000000-0000-4000-8000-000000000082','${STORE}','cash_on_delivery','Kapıda ödeme','active',20,'{"instructions":"Teslimatta ödeme yapın."}','2026-01-01','2026-01-01');
INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,created_at,updated_at) VALUES('82000000-0000-4000-8000-000000000081','${STORE}','shipping_setting','Standart kargo','{"regions":["TR"],"estimatedDays":3}','active','2026-01-01','2026-01-01');
COMMIT;`);
}

async function main() {
  let box;
  try {
    for (const file of [UP, DOWN, ASSERTIONS, MANIFEST]) assert.equal(existsSync(path.join(SQL, file)), true, file);
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const file of migrations()) apply(box, file);
    seed(box);
    apply(box, UP); apply(box, ASSERTIONS);
    psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.merchant_admin_records SET config=config||'{"shippingPriceCents":9900}'::jsonb WHERE id='82000000-0000-4000-8000-000000000081';`);

    await scenario("manifest pins migration 072 artifacts", () => { const manifest = JSON.parse(readFileSync(path.join(SQL, MANIFEST), "utf8")); assert.equal(manifest.postgresqlMajor, 16); for (const artifact of [...manifest.artifacts, ...manifest.rollbackArtifacts]) assert.equal(createHash("sha256").update(readFileSync(path.join(SQL, artifact.file))).digest("hex"), artifact.sha256, artifact.file); });
    await scenario("PostgreSQL 16 applies durable commerce authority", () => { assert.match(psql(box, "SHOW server_version;").stdout, /^16\./); for (const table of ["storefront_carts", "storefront_cart_credentials", "storefront_cart_items", "storefront_cart_operations", "storefront_checkout_intents", "storefront_customer_credentials", "storefront_order_receipts", "storefront_checkout_operations"]) assert.equal(psql(box, `SELECT to_regclass('saas.${table}') IS NOT NULL;`).stdout.trim(), "t"); });
    await scenario("new cart add creates a bound credential and trusted projection", () => { const result = mutate(box); assert.equal(result.outcome, "committed"); assert.equal(result.result_payload.credentialCreated, true); assert.equal(result.result_payload.cart.version, 1); assert.equal(result.result_payload.cart.itemCount, 2); assert.equal(result.result_payload.cart.totalCents, 2264100); assert.equal(result.result_payload.cart.items[0].media.url.startsWith("https://media.saas-staging.celebix.site/"),true); assert.doesNotMatch(JSON.stringify(result), /storeId|credentialDigest|operationId/); });
    await scenario("cart credential resolves only for its exact hostname", () => { assert.equal(resolveCart(box).outcome, "found"); assert.equal(resolveCart(box, CART_KEY, CART_DIGEST, OTHER_HOST).outcome, "not_found"); assert.equal(resolveCart(box, CART_KEY, "9".repeat(64)).outcome, "not_found"); });
    await scenario("incremental add validates resulting stock instead of only the requested increment", () => { psql(box, `SET ROLE celebix_saas_owner;SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',false);SELECT pg_catalog.set_config('saas.inventory.source_id','83000000-0000-4000-8000-000000000080',false);SELECT pg_catalog.set_config('saas.inventory.source_time','${NOW}',false);UPDATE saas.product_variants SET stock_quantity=2,version=version+1,updated_at='${NOW}' WHERE id='${VARIANT}';`); const credentials=JSON.stringify([{keyId:CART_KEY,digest:CART_DIGEST}]); assert.equal(mutate(box,{operation:"70000000-0000-4000-8000-000000000080",expected:1,quantity:1,credentials}).outcome,"stock_unavailable"); psql(box, `SET ROLE celebix_saas_owner;SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',false);SELECT pg_catalog.set_config('saas.inventory.source_id','83000000-0000-4000-8000-000000000079',false);SELECT pg_catalog.set_config('saas.inventory.source_time','${NOW}',false);UPDATE saas.product_variants SET stock_quantity=8,version=version+1,updated_at='${NOW}' WHERE id='${VARIANT}';`); });
    await scenario("cart update remove and optimistic versions are enforced", () => { const credentials = JSON.stringify([{ keyId: CART_KEY, digest: CART_DIGEST }]); const updated = mutate(box, { operation: "70000000-0000-4000-8000-000000000082", action: "quantity", expected: 1, quantity: 3, credentials }); assert.equal(updated.outcome, "committed"); assert.equal(updated.result_payload.cart.version, 2); assert.equal(mutate(box, { operation: "70000000-0000-4000-8000-000000000083", action: "quantity", expected: 1, quantity: 1, credentials }).outcome, "version_conflict"); });
    await scenario("cart operation replay is immutable and mismatch is denied", () => { const credentials = JSON.stringify([{ keyId: CART_KEY, digest: CART_DIGEST }]); const input = { operation: "70000000-0000-4000-8000-000000000084", action: "quantity", expected: 2, quantity: 2, credentials, fingerprint: "8".repeat(64) }; assert.equal(mutate(box, input).outcome, "committed"); assert.equal(mutate(box, input).outcome, "operation_replayed"); assert.equal(mutate(box, { ...input, fingerprint: "7".repeat(64) }).outcome, "operation_mismatch"); });
    await scenario("malformed and oversized credential candidates fail closed", () => { assert.equal(publicCall(box, `saas.public_cart_resolve('${HOST}','${NOW}','{}'::jsonb)`).outcome, "invalid_input"); const many = esc(JSON.stringify(Array.from({ length: 17 }, (_, index) => ({ keyId: `key-${index}`, digest: "a".repeat(64) })))); assert.equal(publicCall(box, `saas.public_cart_resolve('${HOST}','${NOW}','${many}'::jsonb)`).outcome, "invalid_input"); });
    await scenario("cross-store products cannot enter a cart", () => { const credentials = JSON.stringify([{ keyId: CART_KEY, digest: CART_DIGEST }]); assert.equal(mutate(box, { operation: "70000000-0000-4000-8000-000000000085", expected: 3, credentials, product: OTHER_PRODUCT, variant: OTHER_VARIANT }).outcome, "not_found"); });
    await scenario("remove deletes only the selected line and keeps an empty durable cart", () => { const cart = "60000000-0000-4000-8000-000000000083", keyId = "cart-key-03", digest = "3".repeat(64); assert.equal(mutate(box, { cart, keyId, digest, operation: "70000000-0000-4000-8000-000000000086", quantity: 1 }).outcome, "committed"); const credentials = JSON.stringify([{ keyId, digest }]); const removed = mutate(box, { cart, credentials, operation: "70000000-0000-4000-8000-000000000087", action: "remove", expected: 1, quantity: null }); assert.equal(removed.outcome, "committed"); assert.equal(removed.result_payload.cart.itemCount, 0); assert.equal(removed.result_payload.cart.version, 2); });
    await scenario("concurrent line mutations serialize to one commit and one version conflict", async () => { const cart = "60000000-0000-4000-8000-000000000084", keyId = "cart-key-04", digest = "4".repeat(64); assert.equal(mutate(box, { cart, keyId, digest, operation: "70000000-0000-4000-8000-000000000088", quantity: 1 }).outcome, "committed"); const credentials = esc(JSON.stringify([{ keyId, digest }])); const call = (operation, fingerprint, quantity) => `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome FROM saas.public_cart_mutate('${HOST}','${NOW}','${credentials}'::jsonb,'${cart}',NULL,NULL,NULL,'${operation}','${fingerprint}','quantity',1,'${PRODUCT}','${VARIANT}',${quantity});COMMIT;`; const outcomes = (await Promise.all([psqlAsync(box, call("70000000-0000-4000-8000-000000000089", "5".repeat(64), 2)), psqlAsync(box, call("70000000-0000-4000-8000-000000000090", "6".repeat(64), 3))])).map(({ stdout }) => stdout.trim().split("\n").at(-1)).sort(); assert.deepEqual(outcomes, ["committed", "version_conflict"]); const resolved = resolveCart(box, keyId, digest); assert.equal(resolved.result_payload.version, 2); assert.equal([2, 3].includes(resolved.result_payload.items[0].quantity), true); });
    await scenario("buy now creates an isolated expiring intent", () => { const result = createIntent(box); assert.equal(result.outcome, "committed"); assert.equal(result.result_payload.intentKind, "buy_now"); assert.equal(resolveCart(box).result_payload.itemCount, 2); });
    await scenario("cart quote recomputes totals and projects active built-ins", () => { const result = quote(box); assert.equal(result.outcome, "quoted"); assert.deepEqual(result.result_payload.paymentMethods.map(({ kind }) => kind), ["bank_transfer", "cash_on_delivery"]); assert.equal(result.result_payload.cart.shippingCents, 9900); assert.equal(result.result_payload.estimatedDays, 3); });
    await scenario("buy-now quote is separate from regular cart", () => { const result = quote(box, "buy_now", candidates("intent-key-01", INTENT_DIGEST)); assert.equal(result.outcome, "quoted"); assert.equal(result.result_payload.cart.itemCount, 1); assert.equal(resolveCart(box).result_payload.itemCount, 2); });
    await scenario("inactive payment methods are not projected", () => { psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.payment_methods SET state='disabled' WHERE store_id='${STORE}' AND kind='cash_on_delivery';`); assert.deepEqual(quote(box).result_payload.paymentMethods.map(({ kind }) => kind), ["bank_transfer"]); psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.payment_methods SET state='active' WHERE store_id='${STORE}' AND kind='cash_on_delivery';`); });
    await scenario("missing payment and shipping configuration fail closed", () => { psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.payment_methods SET state='disabled' WHERE store_id='${STORE}';`); assert.equal(quote(box).outcome, "payment_unavailable"); assert.equal(resolveCart(box).result_payload.checkoutReady,false); psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.payment_methods SET state='active' WHERE store_id='${STORE}';UPDATE saas.merchant_admin_records SET status='draft' WHERE store_id='${STORE}' AND record_kind='shipping_setting';`); assert.equal(quote(box).outcome, "shipping_unavailable"); assert.equal(resolveCart(box).result_payload.checkoutReady,false); psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.merchant_admin_records SET status='active' WHERE store_id='${STORE}' AND record_kind='shipping_setting';`); });
    await scenario("price drift is retained as one unavailable cart line before checkout writes", () => { psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.product_variants SET price_cents=1200000,version=version+1,updated_at='${LATER}' WHERE id='${VARIANT}';`); const projection=resolveCart(box).result_payload; assert.equal(projection.items.length,1); assert.equal(projection.items[0].unitPriceCents,1127100); assert.equal(projection.items[0].available,false); assert.equal(projection.checkoutReady,false); assert.equal(complete(box).outcome, "price_changed"); assert.equal(psql(box, `SELECT count(*) FROM saas.orders WHERE store_id='${STORE}';`).stdout.trim(), "0"); psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.product_variants SET price_cents=1127100,version=version+1,updated_at='${NOW}' WHERE id='${VARIANT}';`); });
    await scenario("stock drift is detected before checkout writes", () => { psql(box, `SET ROLE celebix_saas_owner;SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',false);SELECT pg_catalog.set_config('saas.inventory.source_id','83000000-0000-4000-8000-000000000081',false);SELECT pg_catalog.set_config('saas.inventory.source_time','${NOW}',false);UPDATE saas.product_variants SET stock_quantity=1,version=version+1,updated_at='${NOW}' WHERE id='${VARIANT}';`); assert.equal(complete(box).outcome, "stock_unavailable"); psql(box, `SET ROLE celebix_saas_owner;SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',false);SELECT pg_catalog.set_config('saas.inventory.source_id','83000000-0000-4000-8000-000000000082',false);SELECT pg_catalog.set_config('saas.inventory.source_time','${NOW}',false);UPDATE saas.product_variants SET stock_quantity=8,version=version+1,updated_at='${NOW}' WHERE id='${VARIANT}';`); });
    await scenario("bank checkout creates customer address order items event receipt and pending payment", () => { const result = complete(box); assert.equal(result.outcome, "committed"); assert.equal(result.result_payload.receipt.paymentMethod.kind, "bank_transfer"); assert.equal(result.result_payload.receipt.paymentStatus, "pending"); assert.deepEqual(result.result_payload.credentialPersistence,{receipt:true,customer:true,receiptKeyId:"receipt-key-01",customerKeyId:"customer-key-01"}); assert.deepEqual(result.result_payload.receipt.delivery,{recipientName:"Güzide Elif",addressLine1:"Bağdat Caddesi 1",city:"İstanbul",district:"Kadıköy",postalCode:"34710",country:"TR"}); assert.equal(psql(box, `SELECT (SELECT count(*) FROM saas.customers WHERE store_id='${STORE}')||','||(SELECT count(*) FROM saas.customer_addresses WHERE store_id='${STORE}')||','||(SELECT count(*) FROM saas.orders WHERE store_id='${STORE}')||','||(SELECT count(*) FROM saas.order_items WHERE store_id='${STORE}')||','||(SELECT count(*) FROM saas.order_events WHERE store_id='${STORE}');`).stdout.trim(), "1,1,1,1,1"); });
    await scenario("checkout consumes stock with the checkout_sale source marker", () => { assert.equal(psql(box, `SELECT stock_quantity FROM saas.product_variants WHERE id='${VARIANT}';`).stdout.trim(), "6"); assert.equal(psql(box, `SELECT count(*) FROM saas.inventory_movements WHERE store_id='${STORE}' AND source_kind='checkout_sale' AND source_id='72000000-0000-4000-8000-000000000081';`).stdout.trim(), "1"); });
    await scenario("same checkout operation replays one immutable receipt", () => { const replay = complete(box); assert.equal(replay.outcome, "operation_replayed"); assert.equal(replay.result_payload.receipt.orderReference.startsWith("SF-"), true); assert.equal(psql(box, `SELECT count(*) FROM saas.orders WHERE store_id='${STORE}';`).stdout.trim(), "1"); assert.equal(complete(box, { fingerprint: "0".repeat(64) }).outcome, "operation_mismatch"); });
    await scenario("checkout recovery proves committed outcome read-only", () => { const result = publicCall(box, `saas.public_checkout_recover('${HOST}','${NOW}','71000000-0000-4000-8000-000000000081','${"d".repeat(64)}')`); assert.equal(result.outcome, "operation_replayed"); assert.equal(result.result_payload.receipt.paymentMethod.kind, "bank_transfer"); });
    await scenario("receipt credential is hostname digest and customer bound", () => { const receiptCredentials = candidates("receipt-key-01", "e".repeat(64)); const customerCredentials=candidates("customer-key-01","f".repeat(64)); assert.equal(publicCall(box, `saas.public_receipt_get('${HOST}','${NOW}','${receiptCredentials}'::jsonb,'${customerCredentials}'::jsonb)`).outcome, "found"); assert.equal(publicCall(box, `saas.public_receipt_get('${HOST}','${NOW}','${receiptCredentials}'::jsonb,'${candidates("customer-key-01","0".repeat(64))}'::jsonb)`).outcome, "not_found"); assert.equal(publicCall(box, `saas.public_receipt_get('${OTHER_HOST}','${NOW}','${receiptCredentials}'::jsonb,'${customerCredentials}'::jsonb)`).outcome, "not_found"); });
    await scenario("guest account credential is reused for later same-browser orders", () => { const credentials = candidates("customer-key-01", "f".repeat(64)); const intent=createIntent(box,{intent:"61000000-0000-4000-8000-000000000084",keyId:"intent-key-04",digest:"9".repeat(64),quantity:1});assert.equal(intent.outcome,"committed");const second=complete(box,{operation:"71000000-0000-4000-8000-000000000084",fingerprint:"a".repeat(64),kind:"buy_now",credentials:candidates("intent-key-04","9".repeat(64)),customerCredentials:credentials,version:1,order:"72000000-0000-4000-8000-000000000084",customer:"73000000-0000-4000-8000-000000000084",address:"74000000-0000-4000-8000-000000000084",event:"75000000-0000-4000-8000-000000000084",receipt:"76000000-0000-4000-8000-000000000084",receiptDigest:"a".repeat(64),customerCredential:"77000000-0000-4000-8000-000000000084",customerDigest:"b".repeat(64)});assert.equal(second.outcome,"committed");assert.deepEqual(second.result_payload.credentialPersistence,{receipt:true,customer:false,receiptKeyId:"receipt-key-01",customerKeyId:"customer-key-01"}); const result = publicCall(box, `saas.public_account_orders('${HOST}','${NOW}','${credentials}'::jsonb,20)`); assert.equal(result.outcome, "found"); assert.equal(result.result_payload.items.length, 2); assert.doesNotMatch(JSON.stringify(result), /customerId|storeId|credential/); });
    await scenario("concurrent checkout creates exactly one order", async () => { const intent = createIntent(box, { intent: "61000000-0000-4000-8000-000000000082", keyId: "intent-key-02", digest: "1".repeat(64), quantity: 1 }); assert.equal(intent.outcome, "committed"); const credentials = candidates("intent-key-02", "1".repeat(64)); const call = completeSql({ operation: "71000000-0000-4000-8000-000000000082", fingerprint: "2".repeat(64), kind: "buy_now", credentials, version: 1, payment: "cash_on_delivery", order: "72000000-0000-4000-8000-000000000082", customer: "73000000-0000-4000-8000-000000000082", address: "74000000-0000-4000-8000-000000000082", event: "75000000-0000-4000-8000-000000000082", receipt: "76000000-0000-4000-8000-000000000082", receiptDigest: "3".repeat(64), customerCredential: "77000000-0000-4000-8000-000000000082", customerDigest: "4".repeat(64) }); const sql = `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome FROM ${call};COMMIT;`; const outcomes = (await Promise.all([psqlAsync(box, sql), psqlAsync(box, sql)])).map(({ stdout }) => stdout.trim().split("\n").at(-1)).sort(); assert.deepEqual(outcomes, ["committed", "operation_replayed"]); assert.equal(psql(box, `SELECT count(*) FROM saas.orders WHERE store_id='${STORE}';`).stdout.trim(), "3"); });
    await scenario("same submitted email never expands an anonymous account credential", () => { const first=publicCall(box,`saas.public_account_orders('${HOST}','${NOW}','${candidates("customer-key-01","f".repeat(64))}'::jsonb,20)`); const second=publicCall(box,`saas.public_account_orders('${HOST}','${NOW}','${candidates("customer-key-01","4".repeat(64))}'::jsonb,20)`); assert.equal(first.result_payload.items.length,2); assert.equal(second.result_payload.items.length,1); assert.notEqual(first.result_payload.items[0].orderReference,second.result_payload.items[0].orderReference); const intent=createIntent(box,{intent:"61000000-0000-4000-8000-000000000083",keyId:"intent-key-03",digest:"5".repeat(64),quantity:1});assert.equal(intent.outcome,"committed");const collisionDelivery=esc(JSON.stringify({contact:{firstName:"Başka",lastName:"Kişi",email:"different@example.test",phone:"+905551112233"},shippingAddress:{line1:"Başka adres",city:"İstanbul",district:"Kadıköy",country:"TR"}}));const collision=completeSql({operation:"71000000-0000-4000-8000-000000000083",fingerprint:"6".repeat(64),kind:"buy_now",credentials:candidates("intent-key-03","5".repeat(64)),version:1,order:"72000000-0000-4000-8000-000000000083",customer:"73000000-0000-4000-8000-000000000083",address:"74000000-0000-4000-8000-000000000083",event:"75000000-0000-4000-8000-000000000083",receipt:"76000000-0000-4000-8000-000000000083",receiptDigest:"7".repeat(64),customerCredential:"77000000-0000-4000-8000-000000000083",customerDigest:"8".repeat(64)}).replace(`'${DELIVERY}'::jsonb`,`'${collisionDelivery}'::jsonb`);assert.equal(publicCall(box,collision).outcome,"invalid_input");assert.equal(psql(box,`SELECT count(*) FROM saas.orders WHERE store_id='${STORE}';`).stdout.trim(),"3"); });
    await scenario("cash on delivery remains pending and intent is consumed", () => { assert.equal(psql(box, `SELECT payment_status FROM saas.orders WHERE id='72000000-0000-4000-8000-000000000082';`).stdout.trim(), "pending"); assert.equal(psql(box, `SELECT status FROM saas.storefront_checkout_intents WHERE id='61000000-0000-4000-8000-000000000082';`).stdout.trim(), "converted"); });
    await scenario("expired carts and intents fail closed", () => { assert.equal(publicCall(box, `saas.public_cart_resolve('${HOST}','2026-09-01T12:00:00Z','${candidates()}'::jsonb)`).outcome, "cart_expired"); assert.equal(publicCall(box, `saas.public_checkout_quote('${HOST}','2026-08-01T12:00:00Z','buy_now','${candidates("intent-key-01", INTENT_DIGEST)}'::jsonb)`).outcome, "cart_expired"); });
    await scenario("runtime roles have no direct table authority", () => { for (const role of ["celebix_saas_app", "celebix_saas_host_resolver"]) for (const table of ["storefront_carts", "storefront_cart_credentials", "storefront_cart_items", "storefront_cart_operations", "storefront_checkout_intents", "storefront_customer_credentials", "storefront_order_receipts", "storefront_checkout_operations"]) assert.notEqual(psql(box, `SET ROLE ${role};SELECT count(*) FROM saas.${table};`, DB, true).status, 0, `${role} ${table}`); });
    await scenario("only the host resolver executes public commerce workflows", () => { for (const signature of ["saas.public_cart_resolve(text,timestamp with time zone,jsonb)", "saas.public_checkout_quote(text,timestamp with time zone,text,jsonb)", "saas.public_receipt_get(text,timestamp with time zone,jsonb,jsonb)"]) { assert.equal(psql(box, `SELECT has_function_privilege('celebix_saas_host_resolver','${signature}','EXECUTE');`).stdout.trim(), "t"); assert.equal(psql(box, `SELECT has_function_privilege('celebix_saas_app','${signature}','EXECUTE');`).stdout.trim(), "f"); } });
    await scenario("operation rows are immutable", () => { for (const table of ["storefront_cart_operations", "storefront_checkout_operations"]) assert.notEqual(psql(box, `SET ROLE celebix_saas_owner;DELETE FROM saas.${table};`, DB, true).status, 0); });
    await scenario("backup and restore preserve receipt and account authority", () => { const dump = path.join(box.root, "commerce.dump"); psql(box, `CREATE DATABASE ${RESTORE_DB};`, "postgres"); command(box.tools.pg_dump, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-Fc", "-f", dump, DB]); command(box.tools.pg_restore, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "--exit-on-error", "-d", RESTORE_DB, dump]); assert.equal(publicCall(box, `saas.public_receipt_get('${HOST}','${NOW}','${candidates("receipt-key-01", "e".repeat(64))}'::jsonb,'${candidates("customer-key-01", "f".repeat(64))}'::jsonb)`, RESTORE_DB).outcome, "found"); });
    await scenario("rollback removes only migration 072 authority", () => { apply(box, DOWN); assert.equal(psql(box, "SELECT to_regclass('saas.storefront_carts') IS NULL;").stdout.trim(), "t"); assert.equal(psql(box, "SELECT to_regprocedure('saas.public_policy_index(text,timestamp with time zone)') IS NOT NULL;").stdout.trim(), "t"); });
    await scenario("reapply restores commerce schema and functions", () => { apply(box, UP); apply(box, ASSERTIONS); assert.equal(psql(box, "SELECT to_regclass('saas.storefront_carts') IS NOT NULL;").stdout.trim(), "t"); assert.equal(psql(box, "SELECT to_regprocedure('saas.public_checkout_complete(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)') IS NOT NULL;").stdout.trim(), "t"); });
    assert.equal(completed, TOTAL - 1);
  } finally {
    const root = box?.root, pid = box?.pid;
    stop(box);
    if (box) {
      const cleanupVerified = () => { assert.equal(root ? existsSync(root) : false, false); if (pid) { try { process.kill(pid, 0); assert.fail("postgres process still alive"); } catch (error) { if (error?.code !== "ESRCH") throw error; } } };
      if (completed === TOTAL - 1) { await scenario("cleanup removes the disposable PostgreSQL cluster", cleanupVerified); assert.equal(completed, TOTAL); console.log(`${TOTAL}/${TOTAL} PASS`); } else cleanupVerified();
    }
  }
}

await main();
