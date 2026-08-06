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
const TOTAL = 10;
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

function apply(box, file) { return psql(box, readFileSync(path.join(SQL, file), "utf8")); }

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

function scenario(name, callback) { callback(); completed += 1; console.log(`PASS ${completed}/${TOTAL} ${name}`); }

let box;
try {
  for (const file of [UP, DOWN, ASSERTIONS]) assert.equal(existsSync(path.join(SQL, file)), true, `${file} missing`);
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
  });
  assert.equal(completed, TOTAL);
  console.log(`${TOTAL}/${TOTAL} PASS`);
} finally {
  stop(box);
}
