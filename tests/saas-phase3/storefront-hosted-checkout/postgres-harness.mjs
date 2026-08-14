import assert from "node:assert/strict";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const DB = "storefront_hosted_checkout";
const UP = "202608060090_storefront_hosted_checkout_foundation.up.sql";
const DOWN = "202608060090_storefront_hosted_checkout_foundation.down.sql";
const ASSERTIONS = "202608060090_storefront_hosted_checkout_foundation_assertions.sql";
const START_UP = "202608060091_storefront_hosted_checkout_start.up.sql";
const START_DOWN = "202608060091_storefront_hosted_checkout_start.down.sql";
const START_ASSERTIONS = "202608060091_storefront_hosted_checkout_start_assertions.sql";
const SETTLEMENT_UP = "202608060092_storefront_hosted_checkout_settlement.up.sql";
const SETTLEMENT_DOWN = "202608060092_storefront_hosted_checkout_settlement.down.sql";
const SETTLEMENT_ASSERTIONS = "202608060092_storefront_hosted_checkout_settlement_assertions.sql";
const CART_READ_ONLY_AUTHORITY_UP = "202608140106_storefront_cart_read_only_authority.up.sql";
const CART_READ_ONLY_AUTHORITY_DOWN = "202608140106_storefront_cart_read_only_authority.down.sql";
const CART_READ_ONLY_AUTHORITY_ASSERTIONS = "202608140106_storefront_cart_read_only_authority_assertions.sql";
const STALE_SESSION_GUARD_UP = "202608140109_storefront_hosted_checkout_stale_session_guard.up.sql";
const STALE_SESSION_GUARD_DOWN = "202608140109_storefront_hosted_checkout_stale_session_guard.down.sql";
const STALE_SESSION_GUARD_ASSERTIONS = "202608140109_storefront_hosted_checkout_stale_session_guard_assertions.sql";
const CART_DRIFT_SETTLEMENT_UP = "202608140110_storefront_hosted_checkout_cart_drift_settlement.up.sql";
const CART_DRIFT_SETTLEMENT_DOWN = "202608140110_storefront_hosted_checkout_cart_drift_settlement.down.sql";
const CART_DRIFT_SETTLEMENT_ASSERTIONS = "202608140110_storefront_hosted_checkout_cart_drift_settlement_assertions.sql";
const STORE = "10000000-0000-4000-8000-000000000190";
const HOST = "hosted-foundation.saas-staging.celebix.site";
const PRODUCT = "20000000-0000-4000-8000-000000000190";
const VARIANT = "30000000-0000-4000-8000-000000000190";
const CART = "40000000-0000-4000-8000-000000000190";
const ATTEMPT = "50000000-0000-4000-8000-000000000190";
const SESSION = "60000000-0000-4000-8000-000000000190";
const METHOD = "70000000-0000-4000-8000-000000000190";
const PROFILE = "80000000-0000-4000-8000-000000000190";
const NOW = "2026-08-06T12:00:00.000Z";
const START_SESSION = "90000000-0000-4000-8000-000000000191";
const START_ATTEMPT = "91000000-0000-4000-8000-000000000191";
const START_OPERATION_2 = "92000000-0000-4000-8000-000000000191";
const TOTAL = 32;
let completed = 0;

function executable(name) {
  const directories = [process.env.POSTGRES_BIN, ...(process.env.PATH ?? "").split(path.delimiter)];
  try {
    directories.push(...readdirSync(path.join(homedir(), ".codex", "tmp"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^postgresql-[0-9.]+-(?:install|)/.test(entry.name))
      .map((entry) => path.join(homedir(), ".codex", "tmp", entry.name, "bin")));
  } catch { /* bundled PostgreSQL is optional */ }
  for (const directory of directories) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* continue */ }
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
  const tools = Object.fromEntries(["initdb", "pg_ctl", "psql"].map((name) => [name, executable(name)]));
  const root = mkdtempSync("/tmp/celebix-hosted-foundation-");
  const data = path.join(root, "data"), socket = path.join(root, "socket"), port = 20_000 + Math.floor(Math.random() * 15_000);
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

function psql(box, source, allowFailure = false) {
  return command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", DB], source, allowFailure);
}

function apply(box, file, allowFailure = false) { return psql(box, readFileSync(path.join(SQL, file), "utf8"), allowFailure); }

function migrations() {
  const accepted = /(?:[.]up|[.]seed|[.]freeze|_grants|_assertions|catalog_assertions)[.]sql$/;
  return readdirSync(SQL).filter((file) => {
    const sequence = Number.parseInt(file.slice(8, 12), 10);
    return Number.isSafeInteger(sequence) && sequence <= 71 && accepted.test(file) && !file.includes(".down.");
  }).sort((left, right) => {
    const sequence = Number.parseInt(left.slice(8, 12), 10) - Number.parseInt(right.slice(8, 12), 10);
    const weight = (file) => file.includes("assertions") ? 3 : file.includes("freeze") || file.includes("grants") ? 2 : 1;
    return sequence || weight(left) - weight(right) || left.localeCompare(right);
  });
}

function installLegacyCheckoutAuthority(box) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    CREATE TABLE saas.storefront_checkout_operations(
      operation_id uuid PRIMARY KEY,
      store_id uuid NOT NULL,
      cart_id uuid NOT NULL,
      action text NOT NULL CHECK(action IN('delivery','submit_builtin','submit_hosted')),
      fingerprint character(64) NOT NULL,
      result_payload jsonb NOT NULL,
      committed_at timestamptz NOT NULL,
      UNIQUE(store_id,cart_id,operation_id),
      FOREIGN KEY(store_id,cart_id) REFERENCES saas.abandoned_carts(store_id,id) ON DELETE RESTRICT,
      CONSTRAINT storefront_checkout_operations_fingerprint_check CHECK(fingerprint~'^[a-f0-9]{64}$'),
      CONSTRAINT storefront_checkout_operations_result_check CHECK(pg_catalog.jsonb_typeof(result_payload)='object'),
      CONSTRAINT storefront_checkout_operations_committed_check CHECK(pg_catalog.isfinite(committed_at))
    );
    CREATE INDEX storefront_checkout_operations_cart_committed_idx
      ON saas.storefront_checkout_operations(store_id,cart_id,committed_at DESC,operation_id);
    CREATE FUNCTION saas.guard_storefront_checkout_operation_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$ BEGIN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_OPERATION_IMMUTABLE'; END $f$;
    CREATE TRIGGER storefront_checkout_operations_immutable BEFORE UPDATE OR DELETE ON saas.storefront_checkout_operations FOR EACH ROW EXECUTE FUNCTION saas.guard_storefront_checkout_operation_mutation();
    ALTER TABLE saas.storefront_checkout_operations ENABLE ROW LEVEL SECURITY;ALTER TABLE saas.storefront_checkout_operations FORCE ROW LEVEL SECURITY;
    REVOKE ALL ON saas.storefront_checkout_operations FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;COMMIT;`);
}

function seed(box) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${STORE}','Hosted Foundation','hosted-foundation','active','tr','TRY','starter','2026-01-01','2026-01-01');
    INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES('11000000-0000-4000-8000-000000000190','${STORE}','${HOST}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
    INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES('${PRODUCT}','${STORE}','sekiz-stok','Sekiz Stok','active','TRY',1,'2026-01-01','2026-01-01');
    SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);SELECT pg_catalog.set_config('saas.inventory.source_id','12000000-0000-4000-8000-000000000190',true);SELECT pg_catalog.set_config('saas.inventory.source_time','${NOW}',true);
    INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES('${VARIANT}','${PRODUCT}','${STORE}','Standart','STOCK-8',10000,true,8,'active','{}',1,'2026-01-01','2026-01-01');
    SELECT pg_catalog.set_config('saas.inventory.source_marker','',true);SELECT pg_catalog.set_config('saas.inventory.source_id','',true);SELECT pg_catalog.set_config('saas.inventory.source_time','',true);
    INSERT INTO saas.payment_methods(id,store_id,kind,label,state,position,config,created_at,updated_at) VALUES('13000000-0000-4000-8000-000000000190','${STORE}','bank_transfer','Banka havalesi','active',10,'{"accountHolder":"Celebix","bankName":"Test Bank","iban":"TR330006100519786457841326","instructions":"Açıklamaya sipariş numarası yazın."}','2026-01-01','2026-01-01');
    INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,created_at,updated_at) VALUES('14000000-0000-4000-8000-000000000190','${STORE}','shipping_setting','Standart kargo','{"regions":["TR"],"estimatedDays":3,"shippingPriceCents":0}','active','2026-01-01','2026-01-01');
    INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at) VALUES('${CART}','${STORE}','active',1,'2026-09-01','${NOW}','${NOW}');
    INSERT INTO saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at) VALUES('${CART}','${STORE}','cart-key-190','${"a".repeat(64)}','2026-09-01');
    INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at) VALUES('${CART}','${STORE}','${PRODUCT}','${VARIANT}',7,10000,0,'${NOW}','${NOW}');
    COMMIT;`);
}

function seedHold(box) {
  const delivery = JSON.stringify({ contact: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", phone: "+905551112233" }, shippingAddress: { line1: "Test 1", city: "İstanbul", country: "TR" } });
  const items = JSON.stringify([{ productId: PRODUCT, variantId: VARIANT, title: "Sekiz Stok", variantTitle: "Standart", sku: "STOCK-8", quantity: 2, unitPriceCents: 10000, lineTotalCents: 20000, stockTracked: true }]);
  psql(box, `BEGIN;SET LOCAL session_replication_role=replica;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.payment_attempts(id,store_id,payment_method_id,profile_id,provider_code,environment,credential_version,order_reference,amount_minor,currency,status,safe_code,version,created_at,updated_at) VALUES('${ATTEMPT}','${STORE}','${METHOD}','${PROFILE}','paytr_iframe','test',1,'sf:${SESSION}',20000,'TRY','created','created',1,'${NOW}','${NOW}');
    INSERT INTO saas.storefront_hosted_checkout_sessions(id,store_id,cart_id,payment_attempt_id,payment_method_id,profile_id,provider_code,environment,credential_version,execution_adapter_version,execution_evidence_digest,order_reference,order_id,customer_id,address_id,event_id,receipt_id,customer_credential_id,source_version,commerce_authority_digest,currency,subtotal_minor,shipping_minor,discount_minor,total_minor,delivery_snapshot,item_snapshot,status,safe_code,hold_expires_at,version,payment_session_key_id,payment_session_credential_digest,payment_session_expires_at,receipt_key_id,receipt_credential_digest,receipt_expires_at,customer_key_id,customer_credential_digest,customer_expires_at,created_at,updated_at)
    VALUES('${SESSION}','${STORE}','${CART}','${ATTEMPT}','${METHOD}','${PROFILE}','paytr_iframe','test',1,1,'sha256:${"b".repeat(64)}','sf:${SESSION}','61000000-0000-4000-8000-000000000191','62000000-0000-4000-8000-000000000191','63000000-0000-4000-8000-000000000191','64000000-0000-4000-8000-000000000191','65000000-0000-4000-8000-000000000191','66000000-0000-4000-8000-000000000191',1,'${"c".repeat(64)}','TRY',20000,0,0,20000,'${delivery}'::jsonb,'${items}'::jsonb,'active','created','2026-08-06T12:15:00Z',1,'payment-session-key','${"d".repeat(64)}','2026-08-06T12:15:00Z','receipt-key','${"e".repeat(64)}','2026-08-07T12:00:00Z','customer-key','${"f".repeat(64)}','2026-09-05T12:00:00Z','${NOW}','${NOW}');
    INSERT INTO saas.checkout_inventory_reservations(id,store_id,attempt_id,payment_attempt_id,quick_order_link_id,storefront_hosted_session_id,product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at) VALUES('67000000-0000-4000-8000-000000000191','${STORE}',NULL,'${ATTEMPT}',NULL,'${SESSION}','${PRODUCT}','${VARIANT}',2,true,'held','${NOW}',1,'${NOW}');COMMIT;`);
}

function seedProvider(box) {
  const sealed = JSON.stringify({ algorithm: "A256GCM", ciphertext: "AA", iv: "AAAAAAAAAAAAAAAA", keyId: "profile-key-190", tag: "AAAAAAAAAAAAAAAAAAAAAA", version: 1 });
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.merchant_provider_execution_authorities(provider_code,capability,environment,adapter_version,evidence_digest,readiness,enabled,approved_at)
      VALUES('paytr_iframe','payment_processing','test',1,'sha256:${"b".repeat(64)}','sandbox_ready',true,'${NOW}')
      ON CONFLICT(provider_code,environment) DO UPDATE SET adapter_version=EXCLUDED.adapter_version,evidence_digest=EXCLUDED.evidence_digest,readiness=EXCLUDED.readiness,enabled=true,approved_at=EXCLUDED.approved_at;
    INSERT INTO saas.merchant_provider_profiles(id,store_id,provider_code,capability,public_config,masked_account_reference,sealed_credentials,credential_digest,credential_key_id,credential_schema_version,credential_version,status,version,last_validated_at,created_at,updated_at,execution_environment,execution_adapter_version,execution_evidence_digest,validation_environment,validation_adapter_version)
      VALUES('${PROFILE}','${STORE}','paytr_iframe','payment_processing','{"environment":"test"}','merchant-***190','${sealed}'::jsonb,'${"9".repeat(64)}','profile-key-190',1,1,'active',1,'${NOW}','${NOW}','${NOW}','test',1,'sha256:${"b".repeat(64)}','test',1);
    INSERT INTO saas.payment_methods(id,store_id,kind,profile_id,provider_code,label,state,position,config,created_at,updated_at)
      VALUES('${METHOD}','${STORE}','provider','${PROFILE}','paytr_iframe','Kredi veya banka kartı','active',20,'{"environment":"test"}','${NOW}','${NOW}');COMMIT;`);
}

function seedStandardSession(box, input) {
  const createdAt = input.createdAt ?? NOW;
  const holdExpiresAt = input.holdExpiresAt ?? "2026-08-06T12:15:00Z";
  const delivery = JSON.stringify({ contact: { firstName: "Grace", lastName: "Hopper", email: `${input.key}@example.test`, phone: input.phone }, shippingAddress: { line1: "Test 2", city: "İstanbul", country: "TR" } }).replaceAll("'", "''");
  const items = JSON.stringify([{ productId: PRODUCT, variantId: VARIANT, title: "Sekiz Stok", variantTitle: "Standart", sku: "STOCK-8", quantity: input.quantity, unitPriceCents: 10000, lineTotalCents: 10000 * input.quantity }]).replaceAll("'", "''");
  psql(box, `BEGIN;SET LOCAL session_replication_role=replica;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at) VALUES('${input.cart}','${STORE}','active',${input.cartVersion ?? 1},'2026-09-01','${createdAt}','${createdAt}');
    INSERT INTO saas.payment_attempts(id,store_id,payment_method_id,profile_id,provider_code,environment,credential_version,order_reference,amount_minor,currency,status,safe_code,version,created_at,updated_at) VALUES('${input.attempt}','${STORE}','${METHOD}','${PROFILE}','paytr_iframe','test',1,'sf:${input.session}',${10000 * input.quantity},'TRY','${input.attemptStatus}','seeded',1,'${createdAt}','${createdAt}');
    INSERT INTO saas.storefront_hosted_checkout_sessions(id,store_id,cart_id,payment_attempt_id,payment_method_id,profile_id,provider_code,environment,credential_version,execution_adapter_version,execution_evidence_digest,order_reference,order_id,customer_id,address_id,event_id,receipt_id,customer_credential_id,source_version,commerce_authority_digest,currency,subtotal_minor,shipping_minor,discount_minor,total_minor,delivery_snapshot,item_snapshot,status,safe_code,hold_expires_at,version,payment_session_key_id,payment_session_credential_digest,payment_session_expires_at,receipt_key_id,receipt_credential_digest,receipt_expires_at,customer_key_id,customer_credential_digest,customer_expires_at,created_at,updated_at)
    VALUES('${input.session}','${STORE}','${input.cart}','${input.attempt}','${METHOD}','${PROFILE}','paytr_iframe','test',1,1,'sha256:${"b".repeat(64)}','sf:${input.session}','${input.order}','${input.customer}','${input.address}','${input.event}','${input.receipt}','${input.customerCredential}',1,'${"c".repeat(64)}','TRY',${10000 * input.quantity},0,0,${10000 * input.quantity},'${delivery}'::jsonb,'${items}'::jsonb,'${input.sessionStatus}','seeded','${holdExpiresAt}',1,'pay-${input.key}','${"d".repeat(64)}','${holdExpiresAt}','receipt-${input.key}','${"e".repeat(64)}','2026-08-07T11:40:00Z','customer-${input.key}','${"f".repeat(64)}','2026-09-05T11:40:00Z','${createdAt}','${createdAt}');
    INSERT INTO saas.checkout_inventory_reservations(id,store_id,attempt_id,payment_attempt_id,quick_order_link_id,storefront_hosted_session_id,product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at) VALUES('${input.reservation}','${STORE}',NULL,'${input.attempt}',NULL,'${input.session}','${PRODUCT}','${VARIANT}',${input.quantity},true,'held','${createdAt}',1,'${createdAt}');COMMIT;`);
}

function scenario(name, callback) { callback(); completed += 1; console.log(`PASS ${completed}/${TOTAL} ${name}`); }

let box;
try {
  for (const file of [UP, DOWN, ASSERTIONS, START_UP, START_DOWN, START_ASSERTIONS, SETTLEMENT_UP, SETTLEMENT_DOWN, SETTLEMENT_ASSERTIONS, CART_READ_ONLY_AUTHORITY_UP, CART_READ_ONLY_AUTHORITY_DOWN, CART_READ_ONLY_AUTHORITY_ASSERTIONS, STALE_SESSION_GUARD_UP, STALE_SESSION_GUARD_DOWN, STALE_SESSION_GUARD_ASSERTIONS, CART_DRIFT_SETTLEMENT_UP, CART_DRIFT_SETTLEMENT_DOWN, CART_DRIFT_SETTLEMENT_ASSERTIONS]) assert.equal(existsSync(path.join(SQL, file)), true, `${file} missing`);
  box = start();
  command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], `CREATE DATABASE ${DB};`);
  for (const file of migrations()) apply(box, file);
  installLegacyCheckoutAuthority(box);
  apply(box, "202607310072_storefront_cart_checkout.up.sql");
  apply(box, "202608010073_storefront_checkout_readiness.up.sql");
  seed(box);
  scenario("foundation authority is absent before migration 090", () => {
    assert.equal(psql(box, "SELECT to_regclass('saas.storefront_hosted_checkout_sessions') IS NULL AND to_regprocedure('saas.storefront_available_stock(uuid,uuid,timestamp with time zone,uuid)') IS NULL;").stdout.trim(), "t");
  });
  apply(box, UP); apply(box, ASSERTIONS);
  scenario("PostgreSQL 16 installs the private foundation", () => {
    assert.match(psql(box, "SHOW server_version;").stdout, /^16[.]/);
    assert.equal(psql(box, "SELECT to_regclass('saas.storefront_hosted_checkout_sessions') IS NOT NULL;").stdout.trim(), "t");
  });
  seedProvider(box);
  apply(box, CART_READ_ONLY_AUTHORITY_UP); apply(box, CART_READ_ONLY_AUTHORITY_ASSERTIONS);
  scenario("cart resolution remains available in the repository read-only transaction", () => {
    const credentials = JSON.stringify([{ keyId: "cart-key-190", digest: "a".repeat(64) }]).replaceAll("'", "''");
    const outcome = psql(box, `BEGIN READ ONLY;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome FROM saas.public_cart_resolve('${HOST}','${NOW}','${credentials}'::jsonb);COMMIT;`).stdout.trim();
    assert.equal(outcome, "found");
  });
  scenario("quote projection exposes one execution-authorized hosted card", () => {
    const methods = JSON.parse(psql(box, `SELECT saas.storefront_payment_methods_projection('${STORE}');`).stdout.trim());
    assert.deepEqual(methods.map(({ kind }) => kind), ["bank_transfer", "hosted_card"]);
    assert.deepEqual(methods[1], { kind: "hosted_card", id: METHOD, label: "Kredi veya banka kartı", instructions: "Güvenli sağlayıcı ekranında tamamlanır.", providerCode: "paytr_iframe", presentation: "iframe", requiredCustomerFields: [] });
  });
  seedHold(box);
  scenario("available stock subtracts another active standard checkout hold", () => {
    assert.equal(psql(box, `SELECT saas.storefront_available_stock('${STORE}','${VARIANT}','${NOW}',NULL);`).stdout.trim(), "6");
  });
  scenario("available stock excludes only the exact current standard session", () => {
    assert.equal(psql(box, `SELECT saas.storefront_available_stock('${STORE}','${VARIANT}','${NOW}','${SESSION}');`).stdout.trim(), "8");
  });
  scenario("cart projection cannot sell stock held by hosted checkout", () => {
    const projection = JSON.parse(psql(box, `SELECT saas.storefront_cart_projection('${STORE}','${CART}','${NOW}');`).stdout.trim());
    assert.equal(projection.items[0].available, false);
    assert.equal(projection.checkoutBlocker, "stock_unavailable");
  });
  scenario("cart mutation and buy-now creation cannot consume held stock", () => {
    const credentials = JSON.stringify([{ keyId: "cart-key-190", digest: "a".repeat(64) }]).replaceAll("'", "''");
    const mutate = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome FROM saas.public_cart_mutate('${HOST}','${NOW}','${credentials}'::jsonb,'${CART}',NULL,NULL,NULL,'68000000-0000-4000-8000-000000000191','${"1".repeat(64)}','quantity',1,'${PRODUCT}','${VARIANT}',7);COMMIT;`).stdout.trim();
    const buyNow = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome FROM saas.public_buy_now_create('${HOST}','${NOW}','69000000-0000-4000-8000-000000000191','intent-key-190','${"2".repeat(64)}','2026-08-06T12:15:00Z','${PRODUCT}','${VARIANT}',7);COMMIT;`).stdout.trim();
    assert.equal(mutate, "stock_unavailable");
    assert.equal(buyNow, "stock_unavailable");
  });
  scenario("offline completion cannot consume stock held by hosted checkout", () => {
    const credentials = JSON.stringify([{ keyId: "cart-key-190", digest: "a".repeat(64) }]).replaceAll("'", "''");
    const delivery = JSON.stringify({ contact: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", phone: "+905551112233" }, shippingAddress: { line1: "Test 1", city: "İstanbul", country: "TR" } }).replaceAll("'", "''");
    const result = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome FROM saas.public_checkout_complete('${HOST}','${NOW}','cart','${credentials}'::jsonb,'[]'::jsonb,'6a000000-0000-4000-8000-000000000191','${"3".repeat(64)}',1,'${delivery}'::jsonb,'bank_transfer','6b000000-0000-4000-8000-000000000191','6c000000-0000-4000-8000-000000000191','6d000000-0000-4000-8000-000000000191','6e000000-0000-4000-8000-000000000191','6f000000-0000-4000-8000-000000000191','receipt-key-190','${"4".repeat(64)}','2026-08-07T12:00:00Z','71000000-0000-4000-8000-000000000191','customer-key-190','${"5".repeat(64)}','2026-09-05T12:00:00Z');COMMIT;`).stdout.trim();
    assert.equal(result, "stock_unavailable");
    assert.equal(psql(box, `SELECT count(*) FROM saas.orders WHERE store_id='${STORE}';`).stdout.trim(), "0");
  });
  scenario("runtime roles have no direct hosted-session table authority", () => {
    assert.notEqual(psql(box, "SET ROLE celebix_saas_host_resolver;SELECT count(*) FROM saas.storefront_hosted_checkout_sessions;", true).status, 0);
  });
  scenario("drained rollback and reapply preserve the prior storefront", () => {
    psql(box, `BEGIN;SET LOCAL session_replication_role=replica;SET LOCAL ROLE celebix_saas_owner;DELETE FROM saas.checkout_inventory_reservations WHERE storefront_hosted_session_id='${SESSION}';DELETE FROM saas.storefront_hosted_checkout_sessions WHERE id='${SESSION}';DELETE FROM saas.payment_attempts WHERE id='${ATTEMPT}';COMMIT;`);
    apply(box, DOWN);
    assert.equal(psql(box, "SELECT to_regclass('saas.storefront_hosted_checkout_sessions') IS NULL;").stdout.trim(), "t");
    assert.equal(psql(box, "SELECT to_regclass('saas.storefront_carts') IS NOT NULL;").stdout.trim(), "t");
    apply(box, UP); apply(box, ASSERTIONS);
    apply(box, CART_READ_ONLY_AUTHORITY_UP); apply(box, CART_READ_ONLY_AUTHORITY_ASSERTIONS);
  });
  scenario("start authority is absent before migration 091", () => {
    assert.equal(psql(box, "SELECT to_regprocedure('saas.public_storefront_hosted_checkout_authority(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid)') IS NULL;").stdout.trim(), "t");
  });
  apply(box, START_UP); apply(box, START_ASSERTIONS);
  scenario("091 installs only host-resolver start RPC authority", () => {
    assert.equal(psql(box, "SELECT has_function_privilege('celebix_saas_host_resolver','saas.public_storefront_hosted_checkout_status(text,timestamp with time zone,jsonb)','EXECUTE') AND NOT has_function_privilege('celebix_saas_app','saas.public_storefront_hosted_checkout_status(text,timestamp with time zone,jsonb)','EXECUTE');").stdout.trim(), "t");
  });
  const credentials = JSON.stringify([{ keyId: "cart-key-190", digest: "a".repeat(64) }]).replaceAll("'", "''");
  const delivery = JSON.stringify({ contact: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", phone: "+905551112233" }, shippingAddress: { line1: "Test 1", city: "İstanbul", country: "TR" } }).replaceAll("'", "''");
  let authority;
  scenario("authority binds the exact cart, delivery, method, provider and execution evidence", () => {
    const row = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.public_storefront_hosted_checkout_authority('${HOST}','${NOW}','cart','${credentials}'::jsonb,1,'${delivery}'::jsonb,'${METHOD}');COMMIT;`).stdout.trim();
    const parsed = JSON.parse(row); authority = parsed.result;
    assert.equal(parsed.outcome, "found");
    assert.equal(authority.sourceId, CART); assert.equal(authority.paymentMethodId, METHOD);
    assert.equal(authority.providerCode, "paytr_iframe"); assert.equal(authority.totalMinor, 70000);
    assert.match(authority.authorityDigest, /^[a-f0-9]{64}$/);
    assert.equal("sealedCredentials" in authority, false);
  });
  scenario("cross-store credentials and cart version drift are denied", () => {
    const cross = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome FROM saas.public_storefront_hosted_checkout_authority('other.saas-staging.celebix.site','${NOW}','cart','${credentials}'::jsonb,1,'${delivery}'::jsonb,'${METHOD}');COMMIT;`).stdout.trim();
    const drift = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome FROM saas.public_storefront_hosted_checkout_authority('${HOST}','${NOW}','cart','${credentials}'::jsonb,2,'${delivery}'::jsonb,'${METHOD}');COMMIT;`).stdout.trim();
    assert.equal(cross, "authority_unavailable"); assert.equal(drift, "authority_unavailable");
  });
  scenario("authority mismatch creates no session or hold", () => {
    const mismatch = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome FROM saas.public_storefront_hosted_checkout_begin('${HOST}','${NOW}','cart','${credentials}'::jsonb,1,'${delivery}'::jsonb,'${METHOD}','${"0".repeat(64)}','${START_ATTEMPT}','${"1".repeat(64)}','${START_SESSION}','${"2".repeat(64)}','93000000-0000-4000-8000-000000000191','94000000-0000-4000-8000-000000000191','95000000-0000-4000-8000-000000000191','96000000-0000-4000-8000-000000000191','97000000-0000-4000-8000-000000000191','98000000-0000-4000-8000-000000000191','pay-session-key','${"3".repeat(64)}','receipt-key-191','${"4".repeat(64)}','customer-key-191','${"5".repeat(64)}');COMMIT;`).stdout.trim();
    assert.equal(mismatch, "durable_authority_invalid");
    assert.equal(psql(box, `SELECT count(*) FROM saas.storefront_hosted_checkout_sessions WHERE id='${START_SESSION}';`).stdout.trim(), "0");
  });
  scenario("provider begin rejection rolls back the hosted session and reservations", () => {
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
      INSERT INTO saas.payment_attempts(id,store_id,payment_method_id,profile_id,provider_code,environment,credential_version,order_reference,amount_minor,currency,status,safe_code,version,created_at,updated_at)
      VALUES('8a000000-0000-4000-8000-000000000191','${STORE}','${METHOD}','${PROFILE}','paytr_iframe','test',1,'conflict:191',1,'TRY','created','created',1,'${NOW}','${NOW}');
      INSERT INTO saas.payment_callback_bindings(callback_binding_digest,attempt_id,store_id,payment_method_id,profile_id,provider_code,environment,credential_version,created_at)
      VALUES('${"e".repeat(64)}','8a000000-0000-4000-8000-000000000191','${STORE}','${METHOD}','${PROFILE}','paytr_iframe','test',1,'${NOW}');COMMIT;`);
    const rejected = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome FROM saas.public_storefront_hosted_checkout_begin('${HOST}','${NOW}','cart','${credentials}'::jsonb,1,'${delivery}'::jsonb,'${METHOD}','${authority.authorityDigest}','8b000000-0000-4000-8000-000000000191','${"f".repeat(64)}','8c000000-0000-4000-8000-000000000191','${"e".repeat(64)}','8d000000-0000-4000-8000-000000000191','8e000000-0000-4000-8000-000000000191','8f000000-0000-4000-8000-000000000191','81000000-0000-4000-8000-000000000191','82000000-0000-4000-8000-000000000191','83000000-0000-4000-8000-000000000191','pay-session-reject','${"1".repeat(64)}','receipt-reject','${"2".repeat(64)}','customer-reject','${"3".repeat(64)}');COMMIT;`).stdout.trim();
    assert.equal(rejected, "callback_binding_conflict");
    assert.equal(psql(box, "SELECT (SELECT count(*)::text FROM saas.storefront_hosted_checkout_sessions WHERE id='8c000000-0000-4000-8000-000000000191')||(SELECT count(*)::text FROM saas.checkout_inventory_reservations WHERE storefront_hosted_session_id='8c000000-0000-4000-8000-000000000191');").stdout.trim(), "00");
  });
  scenario("begin atomically creates one session, a payment attempt and held stock", () => {
    const begin = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.public_storefront_hosted_checkout_begin('${HOST}','${NOW}','cart','${credentials}'::jsonb,1,'${delivery}'::jsonb,'${METHOD}','${authority.authorityDigest}','${START_ATTEMPT}','${"1".repeat(64)}','${START_SESSION}','${"2".repeat(64)}','93000000-0000-4000-8000-000000000191','94000000-0000-4000-8000-000000000191','95000000-0000-4000-8000-000000000191','96000000-0000-4000-8000-000000000191','97000000-0000-4000-8000-000000000191','98000000-0000-4000-8000-000000000191','pay-session-key','${"3".repeat(64)}','receipt-key-191','${"4".repeat(64)}','customer-key-191','${"5".repeat(64)}');COMMIT;`).stdout.trim();
    const parsed = JSON.parse(begin); assert.equal(parsed.outcome, "created"); assert.equal(parsed.result.sessionId, START_SESSION);
    assert.equal(psql(box, `SELECT (SELECT count(*) FROM saas.payment_attempts WHERE id='${START_ATTEMPT}')||':'||(SELECT count(*) FROM saas.checkout_inventory_reservations WHERE storefront_hosted_session_id='${START_SESSION}')||':'||saas.storefront_available_stock('${STORE}','${VARIANT}','${NOW}',NULL);`).stdout.trim(), "1:1:1");
  });
  scenario("start is replay-safe and one active source cannot open a second attempt", () => {
    const replay = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome FROM saas.public_storefront_hosted_checkout_begin('${HOST}','${NOW}','cart','${credentials}'::jsonb,1,'${delivery}'::jsonb,'${METHOD}','${authority.authorityDigest}','${START_ATTEMPT}','${"1".repeat(64)}','${START_SESSION}','${"2".repeat(64)}','93000000-0000-4000-8000-000000000191','94000000-0000-4000-8000-000000000191','95000000-0000-4000-8000-000000000191','96000000-0000-4000-8000-000000000191','97000000-0000-4000-8000-000000000191','98000000-0000-4000-8000-000000000191','pay-session-key','${"3".repeat(64)}','receipt-key-191','${"4".repeat(64)}','customer-key-191','${"5".repeat(64)}');COMMIT;`).stdout.trim();
    const second = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome FROM saas.public_storefront_hosted_checkout_begin('${HOST}','${NOW}','cart','${credentials}'::jsonb,1,'${delivery}'::jsonb,'${METHOD}','${authority.authorityDigest}','${START_OPERATION_2}','${"6".repeat(64)}','99000000-0000-4000-8000-000000000191','${"7".repeat(64)}','9a000000-0000-4000-8000-000000000191','9b000000-0000-4000-8000-000000000191','9c000000-0000-4000-8000-000000000191','9d000000-0000-4000-8000-000000000191','9e000000-0000-4000-8000-000000000191','9f000000-0000-4000-8000-000000000191','pay-session-key-2','${"8".repeat(64)}','receipt-key-192','${"9".repeat(64)}','customer-key-192','${"a".repeat(64)}');COMMIT;`).stdout.trim();
    assert.equal(replay, "operation_replayed"); assert.equal(second, "attempt_in_progress");
  });
  apply(box, STALE_SESSION_GUARD_UP); apply(box, STALE_SESSION_GUARD_ASSERTIONS);
  scenario("expired holds in an active-family session still block a duplicate begin", () => {
    const guarded = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome FROM saas.public_storefront_hosted_checkout_begin('${HOST}','2026-08-06T12:16:00Z','cart','${credentials}'::jsonb,1,'${delivery}'::jsonb,'${METHOD}','${authority.authorityDigest}','${START_OPERATION_2}','${"6".repeat(64)}','99000000-0000-4000-8000-000000000191','${"7".repeat(64)}','9a000000-0000-4000-8000-000000000191','9b000000-0000-4000-8000-000000000191','9c000000-0000-4000-8000-000000000191','9d000000-0000-4000-8000-000000000191','9e000000-0000-4000-8000-000000000191','9f000000-0000-4000-8000-000000000191','pay-session-key-2','${"8".repeat(64)}','receipt-key-192','${"9".repeat(64)}','customer-key-192','${"a".repeat(64)}');ROLLBACK;`).stdout.trim();
    assert.equal(guarded, "attempt_in_progress");
  });
  const sessionCredentials = JSON.stringify([{ keyId: "pay-session-key", digest: "3".repeat(64) }]).replaceAll("'", "''");
  scenario("presentation requires an exact sealed envelope and stays credential-bound", () => {
    const invalid = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome FROM saas.public_storefront_hosted_checkout_presentation_save('${HOST}','${NOW}','${sessionCredentials}'::jsonb,'a0000000-0000-4000-8000-000000000191','${"b".repeat(64)}',1,'presentation-key','${"c".repeat(64)}','{}'::jsonb,'2026-08-06T12:05:00Z');COMMIT;`).stdout.trim();
    const envelope = JSON.stringify({ algorithm: "A256GCM", ciphertext: "AA", iv: "A".repeat(16), keyId: "presentation-key", tag: "A".repeat(22), version: 1 }).replaceAll("'", "''");
    const saved = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome FROM saas.public_storefront_hosted_checkout_presentation_save('${HOST}','${NOW}','${sessionCredentials}'::jsonb,'a0000000-0000-4000-8000-000000000191','${"b".repeat(64)}',1,'presentation-key','${"c".repeat(64)}','${envelope}'::jsonb,'2026-08-06T12:05:00Z');COMMIT;`).stdout.trim();
    const read = JSON.parse(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT result_payload FROM saas.public_storefront_hosted_checkout_presentation('${HOST}','${NOW}','${sessionCredentials}'::jsonb);COMMIT;`).stdout.trim());
    assert.equal(invalid, "invalid_input"); assert.equal(saved, "updated"); assert.equal(read.presentationDigest, "c".repeat(64));
  });
  scenario("status is hostname and unexpired payment-session credential bound", () => {
    const found = JSON.parse(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT result_payload FROM saas.public_storefront_hosted_checkout_status('${HOST}','${NOW}','${sessionCredentials}'::jsonb);COMMIT;`).stdout.trim());
    const wrong = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome FROM saas.public_storefront_hosted_checkout_status('${HOST}','${NOW}','[{"keyId":"pay-session-key","digest":"${"d".repeat(64)}"}]'::jsonb);COMMIT;`).stdout.trim();
    const expired = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome FROM saas.public_storefront_hosted_checkout_status('${HOST}','2026-08-06T12:16:00Z','${sessionCredentials}'::jsonb);COMMIT;`).stdout.trim();
    assert.equal(found.status, "provider_ready"); assert.equal(wrong, "not_found"); assert.equal(expired, "session_expired");
    for (const forbidden of ["profileId", "delivery", "items", "sealedCredentials"]) assert.equal(forbidden in found, false);
  });
  scenario("091 rollback refuses to remove live hosted sessions", () => {
    assert.notEqual(apply(box, START_DOWN, true).status, 0);
  });
  scenario("settlement authority is absent before migration 092", () => {
    assert.equal(psql(box, "SELECT to_regprocedure('saas.storefront_hosted_checkout_terminal_transition()') IS NULL;").stdout.trim(), "t");
  });
  apply(box, SETTLEMENT_UP); apply(box, SETTLEMENT_ASSERTIONS);
  apply(box, CART_DRIFT_SETTLEMENT_UP); apply(box, CART_DRIFT_SETTLEMENT_ASSERTIONS);
  scenario("092 installs the private trigger and workflow-only maintenance RPCs", () => {
    assert.equal(psql(box, "SELECT saas.storefront_hosted_checkout_settlement_preflight() AND has_function_privilege('celebix_saas_workflow','saas.storefront_hosted_checkout_expire_created(timestamp with time zone,integer)','EXECUTE') AND NOT has_function_privilege('celebix_saas_host_resolver','saas.storefront_hosted_checkout_expire_created(timestamp with time zone,integer)','EXECUTE');").stdout.trim(), "t");
  });
  scenario("captured callback creates exactly one paid order and consumes stock authority", () => {
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.payment_attempts SET status='awaiting_customer',safe_code='iframe_ready',version=version+1,updated_at='2026-08-06T12:01:00Z' WHERE id='${START_ATTEMPT}';COMMIT;`);
    const outcome = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_workflow;SELECT outcome FROM saas.payment_attempt_apply_hosted_callback('paytr_iframe','${"2".repeat(64)}','aa000000-0000-4000-8000-000000000191','${"6".repeat(64)}','${"7".repeat(64)}',2,1,'captured','provider-191','payment_captured',70000,'TRY','2026-08-06T12:02:00Z');COMMIT;`).stdout.trim();
    assert.equal(outcome, "captured");
    assert.equal(psql(box, `SELECT (SELECT count(*) FROM saas.orders WHERE id='93000000-0000-4000-8000-000000000191')||':'||(SELECT payment_status FROM saas.orders WHERE id='93000000-0000-4000-8000-000000000191')||':'||(SELECT status FROM saas.checkout_inventory_reservations WHERE storefront_hosted_session_id='${START_SESSION}')||':'||(SELECT stock_quantity FROM saas.product_variants WHERE id='${VARIANT}')||':'||(SELECT status FROM saas.storefront_carts WHERE id='${CART}')||':'||(SELECT count(*) FROM saas.order_events WHERE order_id='93000000-0000-4000-8000-000000000191')||':'||(SELECT count(*) FROM saas.storefront_order_receipts WHERE order_id='93000000-0000-4000-8000-000000000191');`).stdout.trim(), "1:completed:consumed:1:converted:1:1");
    const receipt = JSON.parse(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT result_payload FROM saas.public_receipt_get('${HOST}','2026-08-06T12:03:00Z','[{"keyId":"receipt-key-191","digest":"${"4".repeat(64)}"}]'::jsonb,'[{"keyId":"customer-key-191","digest":"${"5".repeat(64)}"}]'::jsonb);COMMIT;`).stdout.trim());
    assert.equal(receipt.paymentStatus, "completed");
    assert.equal(receipt.paymentMethod.kind, "hosted_card");
    assert.equal(receipt.orderReference, "SF-93000000000040008000000000000191");
    const orderAddress = JSON.parse(psql(box, "SELECT shipping_address FROM saas.orders WHERE id='93000000-0000-4000-8000-000000000191';").stdout.trim());
    assert.equal(orderAddress.recipientName, "Ada Lovelace");
  });
  scenario("captured callback replay cannot duplicate order, event, receipt or stock decrement", () => {
    const outcome = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_workflow;SELECT outcome FROM saas.payment_attempt_apply_hosted_callback('paytr_iframe','${"2".repeat(64)}','aa000000-0000-4000-8000-000000000191','${"6".repeat(64)}','${"7".repeat(64)}',2,1,'captured','provider-191','payment_captured',70000,'TRY','2026-08-06T12:02:00Z');COMMIT;`).stdout.trim();
    assert.equal(outcome, "operation_replayed");
    assert.equal(psql(box, `SELECT (SELECT count(*) FROM saas.orders WHERE id='93000000-0000-4000-8000-000000000191')||':'||(SELECT count(*) FROM saas.order_events WHERE order_id='93000000-0000-4000-8000-000000000191')||':'||(SELECT count(*) FROM saas.storefront_order_receipts WHERE order_id='93000000-0000-4000-8000-000000000191')||':'||(SELECT stock_quantity FROM saas.product_variants WHERE id='${VARIANT}');`).stdout.trim(), "1:1:1:1");
  });
  scenario("captured snapshot settles while a newer active cart remains available", () => {
    seedStandardSession(box, { key: "drift", phone: "+905551112238", quantity: 1, cartVersion: 2, attemptStatus: "awaiting_customer", sessionStatus: "provider_ready", cart: "e1000000-0000-4000-8000-000000000192", attempt: "e2000000-0000-4000-8000-000000000192", session: "e3000000-0000-4000-8000-000000000192", order: "e4000000-0000-4000-8000-000000000192", customer: "e5000000-0000-4000-8000-000000000192", address: "e6000000-0000-4000-8000-000000000192", event: "e7000000-0000-4000-8000-000000000192", receipt: "e8000000-0000-4000-8000-000000000192", customerCredential: "e9000000-0000-4000-8000-000000000192", reservation: "ea000000-0000-4000-8000-000000000192" });
    psql(box, "BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.payment_attempts SET status='submitted',safe_code='submitted',version=version+1,updated_at='2026-08-06T12:03:00Z' WHERE id='e2000000-0000-4000-8000-000000000192';UPDATE saas.payment_attempts SET status='captured',safe_code='payment_captured',version=version+1,updated_at='2026-08-06T12:04:00Z' WHERE id='e2000000-0000-4000-8000-000000000192';COMMIT;");
    assert.equal(psql(box, "SELECT (SELECT status FROM saas.storefront_hosted_checkout_sessions WHERE id='e3000000-0000-4000-8000-000000000192')||':'||(SELECT status FROM saas.checkout_inventory_reservations WHERE storefront_hosted_session_id='e3000000-0000-4000-8000-000000000192')||':'||(SELECT status FROM saas.storefront_carts WHERE id='e1000000-0000-4000-8000-000000000192')||':'||(SELECT count(*) FROM saas.orders WHERE id='e4000000-0000-4000-8000-000000000192');").stdout.trim(), "captured:consumed:active:1");
  });
  scenario("failed payment releases the exact hold and retains the source cart", () => {
    seedStandardSession(box, { key: "fail", phone: "+905551112234", quantity: 1, attemptStatus: "created", sessionStatus: "active", cart: "a1000000-0000-4000-8000-000000000192", attempt: "a2000000-0000-4000-8000-000000000192", session: "a3000000-0000-4000-8000-000000000192", order: "a4000000-0000-4000-8000-000000000192", customer: "a5000000-0000-4000-8000-000000000192", address: "a6000000-0000-4000-8000-000000000192", event: "a7000000-0000-4000-8000-000000000192", receipt: "a8000000-0000-4000-8000-000000000192", customerCredential: "a9000000-0000-4000-8000-000000000192", reservation: "aa000000-0000-4000-8000-000000000192" });
    psql(box, "BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.payment_attempts SET status='failed',safe_code='provider_failed',version=version+1,updated_at='2026-08-06T12:03:00Z' WHERE id='a2000000-0000-4000-8000-000000000192';COMMIT;");
    assert.equal(psql(box, "SELECT (SELECT status FROM saas.storefront_hosted_checkout_sessions WHERE id='a3000000-0000-4000-8000-000000000192')||':'||(SELECT status FROM saas.checkout_inventory_reservations WHERE storefront_hosted_session_id='a3000000-0000-4000-8000-000000000192')||':'||(SELECT status FROM saas.storefront_carts WHERE id='a1000000-0000-4000-8000-000000000192')||':'||(SELECT count(*) FROM saas.orders WHERE id='a4000000-0000-4000-8000-000000000192');").stdout.trim(), "failed:released:active:0");
  });
  scenario("unknown provider outcome moves to processing without order or hold release", () => {
    seedStandardSession(box, { key: "unknown", phone: "+905551112235", quantity: 1, attemptStatus: "created", sessionStatus: "active", cart: "b1000000-0000-4000-8000-000000000192", attempt: "b2000000-0000-4000-8000-000000000192", session: "b3000000-0000-4000-8000-000000000192", order: "b4000000-0000-4000-8000-000000000192", customer: "b5000000-0000-4000-8000-000000000192", address: "b6000000-0000-4000-8000-000000000192", event: "b7000000-0000-4000-8000-000000000192", receipt: "b8000000-0000-4000-8000-000000000192", customerCredential: "b9000000-0000-4000-8000-000000000192", reservation: "ba000000-0000-4000-8000-000000000192" });
    psql(box, "BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.payment_attempts SET status='provider_outcome_unknown',safe_code='provider_timeout',version=version+1,updated_at='2026-08-06T12:04:00Z' WHERE id='b2000000-0000-4000-8000-000000000192';COMMIT;");
    assert.equal(psql(box, "SELECT (SELECT status FROM saas.storefront_hosted_checkout_sessions WHERE id='b3000000-0000-4000-8000-000000000192')||':'||(SELECT status FROM saas.checkout_inventory_reservations WHERE storefront_hosted_session_id='b3000000-0000-4000-8000-000000000192')||':'||(SELECT count(*) FROM saas.orders WHERE id='b4000000-0000-4000-8000-000000000192');").stdout.trim(), "processing:held:0");
  });
  scenario("bounded expiry atomically expires only pre-provider attempts", () => {
    seedStandardSession(box, { key: "expiry", phone: "+905551112236", quantity: 1, attemptStatus: "created", sessionStatus: "active", createdAt: "2026-08-06T11:40:00Z", holdExpiresAt: "2026-08-06T11:55:00Z", cart: "c1000000-0000-4000-8000-000000000192", attempt: "c2000000-0000-4000-8000-000000000192", session: "c3000000-0000-4000-8000-000000000192", order: "c4000000-0000-4000-8000-000000000192", customer: "c5000000-0000-4000-8000-000000000192", address: "c6000000-0000-4000-8000-000000000192", event: "c7000000-0000-4000-8000-000000000192", receipt: "c8000000-0000-4000-8000-000000000192", customerCredential: "c9000000-0000-4000-8000-000000000192", reservation: "ca000000-0000-4000-8000-000000000192" });
    assert.equal(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_workflow;SELECT saas.storefront_hosted_checkout_expire_created('${NOW}',25);COMMIT;`).stdout.trim(), "1");
    assert.equal(psql(box, "SELECT (SELECT status FROM saas.storefront_hosted_checkout_sessions WHERE id='c3000000-0000-4000-8000-000000000192')||':'||(SELECT status FROM saas.checkout_inventory_reservations WHERE storefront_hosted_session_id='c3000000-0000-4000-8000-000000000192')||':'||(SELECT status FROM saas.storefront_carts WHERE id='c1000000-0000-4000-8000-000000000192');").stdout.trim(), "expired:expired:active");
  });
  scenario("verified late capture without stock records stock conflict and fabricates no order", () => {
    seedStandardSession(box, { key: "late", phone: "+905551112237", quantity: 1, attemptStatus: "awaiting_customer", sessionStatus: "provider_ready", cart: "d1000000-0000-4000-8000-000000000192", attempt: "d2000000-0000-4000-8000-000000000192", session: "d3000000-0000-4000-8000-000000000192", order: "d4000000-0000-4000-8000-000000000192", customer: "d5000000-0000-4000-8000-000000000192", address: "d6000000-0000-4000-8000-000000000192", event: "d7000000-0000-4000-8000-000000000192", receipt: "d8000000-0000-4000-8000-000000000192", customerCredential: "d9000000-0000-4000-8000-000000000192", reservation: "da000000-0000-4000-8000-000000000192" });
    psql(box, `BEGIN;SET LOCAL session_replication_role=replica;SET LOCAL ROLE celebix_saas_owner;SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);SELECT pg_catalog.set_config('saas.inventory.source_id','db000000-0000-4000-8000-000000000192',true);SELECT pg_catalog.set_config('saas.inventory.source_time','2026-08-06T12:05:00Z',true);UPDATE saas.product_variants SET stock_quantity=0,version=version+1,updated_at='2026-08-06T12:05:00Z' WHERE id='${VARIANT}';COMMIT;`);
    psql(box, "BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.payment_attempts SET status='submitted',safe_code='submitted',version=version+1,updated_at='2026-08-06T12:06:00Z' WHERE id='d2000000-0000-4000-8000-000000000192';UPDATE saas.payment_attempts SET status='captured',safe_code='payment_captured',version=version+1,updated_at='2026-08-06T12:07:00Z' WHERE id='d2000000-0000-4000-8000-000000000192';COMMIT;");
    assert.equal(psql(box, "SELECT (SELECT status FROM saas.storefront_hosted_checkout_sessions WHERE id='d3000000-0000-4000-8000-000000000192')||':'||(SELECT safe_code FROM saas.storefront_hosted_checkout_sessions WHERE id='d3000000-0000-4000-8000-000000000192')||':'||(SELECT status FROM saas.checkout_inventory_reservations WHERE storefront_hosted_session_id='d3000000-0000-4000-8000-000000000192')||':'||(SELECT count(*) FROM saas.orders WHERE id='d4000000-0000-4000-8000-000000000192');").stdout.trim(), "stock_conflict:captured_stock_conflict:released:0");
  });
  assert.equal(completed, TOTAL);
  console.log(`${TOTAL}/${TOTAL} PASS`);
} finally {
  stop(box);
}
