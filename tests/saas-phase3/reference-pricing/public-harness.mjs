import assert from "node:assert/strict";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const DB = "reference_pricing_public_131";
const NOW = "2026-09-20T12:00:00.000Z";
const STORE = "10000000-0000-4000-8000-000000000131";
const HOST = "pricing-public.example.test";
const OWNER = "20000000-0000-4000-8000-000000000131";
const PLAN = "00000000-0000-4000-8000-000000000001";
const USD = "40000000-0000-4000-8000-000000000131";
const EUR = "40000000-0000-4000-8000-000000000132";
const SET = "41000000-0000-4000-8000-000000000131";
const RING = "50000000-0000-4000-8000-000000000131";
const CHAIN = "50000000-0000-4000-8000-000000000132";
const BAND = "50000000-0000-4000-8000-000000000133";
const UNAVAILABLE = "50000000-0000-4000-8000-000000000134";
const RING_VARIANT = "51000000-0000-4000-8000-000000000131";
const CHAIN_VARIANT = "51000000-0000-4000-8000-000000000132";
const BAND_VARIANT = "51000000-0000-4000-8000-000000000133";
const UNAVAILABLE_VARIANT = "51000000-0000-4000-8000-000000000134";
const QUICK_STORE = "10000000-0000-4000-8000-000000000057";
const QUICK_OWNER = "20000000-0000-4000-8000-000000000057";
const QUICK_MEMBERSHIP = "30000000-0000-4000-8000-000000000057";
const QUICK_VARIANT = "41000000-0000-4000-8000-000000000057";
const QUICK_METHOD = "50000000-0000-4000-8000-000000000057";
const QUICK_HOST = "hosted-a.example.com";
const QUICK_REDEMPTION = "70000000-0000-4000-8000-000000000031";
const QUICK_COOKIE = "5".repeat(64);

function bin(name) {
  for (const directory of [process.env.POSTGRES_BIN, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* next */ }
  }
  throw new Error(`DISPOSABLE_DB_EXECUTION_BLOCKED: missing ${name}`);
}
function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, { cwd: ROOT, input, encoding: "utf8", env: { ...process.env, LC_ALL: "C", LANG: "C" }, maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}
function start() {
  assertSafeEnvironment();
  const tools = Object.fromEntries(["initdb", "pg_ctl", "psql"].map((name) => [name, bin(name)]));
  const root = mkdtempSync(path.join(tmpdir(), "cx-reference-public-"));
  const data = path.join(root, "data"); const socket = path.join(root, "socket");
  const port = 21000 + Math.floor(Math.random() * 10000);
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
function scalar(box, source) { return psql(box, source).stdout.trim().split("\n").at(-1) ?? ""; }
function apply(box, file) { psql(box, readFileSync(path.join(SQL, file), "utf8")); }
function migrationsThrough128() {
  const accepted = /(?:[.]up|[.]seed|[.]freeze|_grants|_assertions|catalog_assertions)[.]sql$/;
  return readdirSync(SQL).filter((file) => {
    if (!/^2026\d{8}_.+[.]sql$/.test(file) || file.includes(".down.") || file.includes("rollback") || file.includes("forward_recovery") || file === "202607300073_seed_guzide_pilot_admin_domain.up.sql") return false;
    const sequence = Number.parseInt(file.slice(8, 12), 10);
    return Number.isSafeInteger(sequence) && sequence <= 128 && (sequence <= 71 ? accepted.test(file) : file.endsWith(".up.sql"));
  }).sort((left, right) => {
    const sequence = Number.parseInt(left.slice(8, 12), 10) - Number.parseInt(right.slice(8, 12), 10);
    const weight = (file) => file.includes("assertions") ? 3 : file.includes("freeze") || file.includes("grants") ? 2 : 1;
    return sequence || weight(left) - weight(right) || left.localeCompare(right);
  });
}
function publicCall(box, expression) {
  const result = psql(box, `SET ROLE celebix_saas_host_resolver; SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${expression};`, true);
  assert.equal(result.status, 0, result.stderr || expression);
  return JSON.parse(result.stdout.trim().split("\n").at(-1));
}
let passed = 0;
function scenario(name, run) { run(); passed += 1; process.stdout.write(`PASS ${passed} ${name}\n`); }

function seedPublic(box) {
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
      VALUES('${OWNER}','https://id.test/oidc','public-owner','public-owner@test.invalid',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
      VALUES('${STORE}','Public Pricing','public-pricing','active','tr','TRY','starter','2026-01-01','2026-01-01');
    INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)
      VALUES('11000000-0000-4000-8000-000000000131','${STORE}','${HOST}','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
    INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES
      ('${RING}','${STORE}','gold-ring','Gold Ring','active','TRY',1,'2026-01-04','2026-01-04'),
      ('${CHAIN}','${STORE}','silver-chain','Silver Chain','active','TRY',1,'2026-01-03','2026-01-03'),
      ('${BAND}','${STORE}','plain-band','Plain Band','active','TRY',1,'2026-01-02','2026-01-02'),
      ('${UNAVAILABLE}','${STORE}','unpriced-earring','Unpriced Earring','active','TRY',1,'2026-01-05','2026-01-05');
    ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
    INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,compare_at_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES
      ('${RING_VARIANT}','${RING}','${STORE}','Ring',10000,400000,false,0,'active','{}',1,'2026-01-04','2026-01-04'),
      ('${CHAIN_VARIANT}','${CHAIN}','${STORE}','Chain',300000,450000,false,0,'active','{}',1,'2026-01-03','2026-01-03'),
      ('${BAND_VARIANT}','${BAND}','${STORE}','Band',250000,NULL,true,0,'active','{}',1,'2026-01-02','2026-01-02'),
      ('${UNAVAILABLE_VARIANT}','${UNAVAILABLE}','${STORE}','Earring',12300,NULL,false,0,'active','{}',1,'2026-01-05','2026-01-05');
    ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;
    INSERT INTO saas.catalog_categories(id,store_id,parent_id,name,slug,position,status,version,created_at,updated_at)
      VALUES('63000000-0000-4000-8000-000000000131','${STORE}',NULL,'Rings','rings',0,'active',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.catalog_product_categories(store_id,product_id,category_id,position) VALUES
      ('${STORE}','${RING}','63000000-0000-4000-8000-000000000131',0),
      ('${STORE}','${BAND}','63000000-0000-4000-8000-000000000131',1);
    INSERT INTO saas.pricing_reference_definitions(id,store_id,kind,label,reference_purity,created_by,created_at) VALUES
      ('${USD}','${STORE}','usd','USD satış',NULL,'${OWNER}','${NOW}'),
      ('${EUR}','${STORE}','eur','EUR satış',NULL,'${OWNER}','${NOW}');
    INSERT INTO saas.pricing_reference_sets(id,store_id,version,created_by,created_at)
      VALUES('${SET}','${STORE}',1,'${OWNER}','${NOW}');
    INSERT INTO saas.pricing_reference_set_values(store_id,set_id,reference_id,rate_try,active) VALUES
      ('${STORE}','${SET}','${USD}',40,true),('${STORE}','${SET}','${EUR}',NULL,false);
    INSERT INTO saas.pricing_reference_state(store_id,active_set_id,version,last_set_version,updated_at)
      VALUES('${STORE}','${SET}',1,1,'${NOW}');
    INSERT INTO saas.pricing_variant_policy_versions(store_id,variant_id,version,method,source_amount,reference_id,labor_mode,labor_amount,uplift_percent,allow_full_discount,policy_payload,created_by,created_at) VALUES
      ('${STORE}','${RING_VARIANT}',1,'usd',125,'${USD}','none',0,0,false,'{"method":"usd","referenceId":"${USD}","sourceAmount":"125"}','${OWNER}','${NOW}'),
      ('${STORE}','${UNAVAILABLE_VARIANT}',1,'eur',100,'${EUR}','none',0,0,false,'{"method":"eur","referenceId":"${EUR}","sourceAmount":"100"}','${OWNER}','${NOW}');
    INSERT INTO saas.pricing_variant_policy_state(store_id,variant_id,current_version) VALUES
      ('${STORE}','${RING_VARIANT}',1),('${STORE}','${UNAVAILABLE_VARIANT}',1);
  COMMIT;`);
}

function seedQuickOrder(box) {
  // The source fixture's iyzico profile requires a separate tenant attestation in
  // current schema. PAYTR uses the same hosted-create path without that unrelated gate.
  const fixture = readFileSync(path.join(ROOT, "tests/saas-phase3/quick-order-hosted-payment-authority/fixture.sql"), "utf8");
  psql(box, fixture
    .replaceAll("'iyzico_iframe'", "'paytr_iframe'")
    .replaceAll("'iyzico A'", "'PAYTR A'")
    .replaceAll("'iyzico B'", "'PAYTR B'")
    .replaceAll("'active',NULL,0,'{\"environment\":\"test\"}',1",
      "'active',NULL,0,'{\"environment\":\"test\",\"locale\":\"tr\",\"threeDSecure\":\"provider_managed\",\"installmentMode\":\"all\",\"maxInstallment\":0}',1"));
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.pricing_reference_definitions(id,store_id,kind,label,reference_purity,created_by,created_at)
      VALUES('40000000-0000-4000-8000-000000000057','${QUICK_STORE}','usd','USD satış',NULL,'${QUICK_OWNER}','${NOW}');
    INSERT INTO saas.pricing_reference_sets(id,store_id,version,created_by,created_at)
      VALUES('41000000-0000-4000-8000-000000000057','${QUICK_STORE}',1,'${QUICK_OWNER}','${NOW}');
    INSERT INTO saas.pricing_reference_set_values(store_id,set_id,reference_id,rate_try,active)
      VALUES('${QUICK_STORE}','41000000-0000-4000-8000-000000000057','40000000-0000-4000-8000-000000000057',40,true);
    INSERT INTO saas.pricing_reference_state(store_id,active_set_id,version,last_set_version,updated_at)
      VALUES('${QUICK_STORE}','41000000-0000-4000-8000-000000000057',1,1,'${NOW}');
    INSERT INTO saas.pricing_variant_policy_versions(store_id,variant_id,version,method,source_amount,reference_id,labor_mode,labor_amount,uplift_percent,allow_full_discount,policy_payload,created_by,created_at)
      VALUES('${QUICK_STORE}','${QUICK_VARIANT}',1,'usd',125,'40000000-0000-4000-8000-000000000057','none',0,0,false,
        '{"method":"usd","referenceId":"40000000-0000-4000-8000-000000000057","sourceAmount":"125"}','${QUICK_OWNER}','${NOW}');
    INSERT INTO saas.pricing_variant_policy_state(store_id,variant_id,current_version)
      VALUES('${QUICK_STORE}','${QUICK_VARIANT}',1);
  COMMIT;`);
}
function hostedCreate(box, ordinal = 31) {
  const suffix = String(ordinal).padStart(12, "0");
  const envelope = (key) => `{"algorithm":"A256GCM","ciphertext":"AQ","iv":"AAAAAAAAAAAAAAAA","keyId":"${key}","tag":"AAAAAAAAAAAAAAAAAAAAAA","version":1}`;
  const address = '{"recipientName":"Ada Lovelace","phone":"+905551112233","line1":"Test 1","city":"Istanbul","postalCode":"34710","country":"TR"}';
  const result = psql(box, `SET ROLE celebix_saas_app; SELECT outcome FROM saas.quick_links_create_hosted(
    '${QUICK_STORE}','${QUICK_OWNER}','${QUICK_MEMBERSHIP}','${PLAN}','free_starter',1,'${NOW}',
    '60000000-0000-4000-8000-${suffix}',ARRAY['80000000-0000-4000-8000-${suffix}'::uuid],ARRAY['${QUICK_VARIANT}'::uuid],
    ARRAY[1]::bigint[],'${QUICK_METHOD}',NULL,ARRAY[NULL]::text[],
    NULL,NULL::jsonb,'Ada Lovelace','ada@example.com','+905551112233',
    '${address}'::jsonb,'${address}'::jsonb,NULL,'hosted',0,0,24,
    '${"3".repeat(64)}','quick.current','${envelope("quick.current")}'::jsonb,
    '90000000-0000-4000-8000-${suffix}','${"4".repeat(64)}');`, true);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split("\n").at(-1);
}

function claimQuickLinkAndChangeRate(box) {
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)
      VALUES('11000000-0000-4000-8000-000000000057','${QUICK_STORE}','${QUICK_HOST}',
        'custom_domain','active',true,'2026-07-27','2026-07-27','2026-07-27',1);
  COMMIT;`);
  const claimed = scalar(box, `SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.quick_links_claim_redemption(
    '${QUICK_HOST}','${"3".repeat(64)}','${QUICK_REDEMPTION}','${QUICK_COOKIE}',
    '${NOW}','2026-09-20T12:15:00.000Z')`);
  assert.equal(claimed, "claimed");
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.pricing_reference_sets(id,store_id,version,created_by,created_at)
      VALUES('41000000-0000-4000-8000-000000000058','${QUICK_STORE}',2,'${QUICK_OWNER}','2026-09-20T12:01:00Z');
    INSERT INTO saas.pricing_reference_set_values(store_id,set_id,reference_id,rate_try,active)
      VALUES('${QUICK_STORE}','41000000-0000-4000-8000-000000000058',
        '40000000-0000-4000-8000-000000000057',41,true);
    UPDATE saas.pricing_reference_state SET active_set_id='41000000-0000-4000-8000-000000000058',
      version=2,last_set_version=2,updated_at='2026-09-20T12:01:00Z' WHERE store_id='${QUICK_STORE}';
  COMMIT;`);
}

function main() {
  let box;
  try {
    box = start();
    command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], `CREATE DATABASE ${DB};`);
    for (const file of migrationsThrough128()) apply(box, file);
    apply(box, "202609200130_reference_pricing.up.sql");
    apply(box, "202609200130_reference_pricing_assertions.sql");
    if (existsSync(path.join(SQL, "202609200131_reference_pricing_public.up.sql"))) {
      apply(box, "202609200131_reference_pricing_public.up.sql");
      apply(box, "202609200131_reference_pricing_public_assertions.sql");
    }
    seedPublic(box);
    scenario("public list omits stale compare-at below the dynamic selling price", () => {
      const listed = publicCall(box, `saas.public_list_products('${STORE}','${HOST}','${NOW}',48)`);
      assert.equal(listed.outcome, "found");
      const ring = listed.result.find(({ id }) => id === RING);
      assert.equal(ring.priceCents, 500000);
      assert.equal("compareAtCents" in ring, false);
      assert.equal("compareAtCents" in ring.variants[0], false);
    });
    scenario("category, detail, and search share the same safe price projection", () => {
      const category = publicCall(box, `saas.public_list_products_by_category('${STORE}','${HOST}','${NOW}','rings',48)`);
      const detail = publicCall(box, `saas.public_get_product_by_slug('${STORE}','${HOST}','${NOW}','gold-ring')`);
      const search = publicCall(box, `saas.public_search_products('${HOST}','${NOW}','Gold Ring',48,NULL)`);
      for (const ring of [category.result.items.find(({ id }) => id === RING), detail.result, search.result.items[0]]) {
        assert.equal(ring.priceCents, 500000);
        assert.equal("compareAtCents" in ring, false);
        assert.equal("compareAtCents" in ring.variants[0], false);
      }
    });
    scenario("unavailable reference hides only its own product", () => {
      const listed = publicCall(box, `saas.public_list_products('${STORE}','${HOST}','${NOW}',48)`);
      assert.deepEqual(new Set(listed.result.map(({ id }) => id)), new Set([RING, CHAIN, BAND]));
      assert.equal(publicCall(box, `saas.public_get_product_by_slug('${STORE}','${HOST}','${NOW}','unpriced-earring')`).outcome, "not_found");
    });
    scenario("global price sort applies before one-row pagination, including an out-of-stock lower price", () => {
      const first = publicCall(box, `saas.public_catalog_query_v2('${HOST}','${NOW}',NULL,'','all','price-asc',1,0)`);
      assert.equal(first.outcome, "found");
      assert.equal(first.result.total, 3);
      assert.deepEqual(first.result.items.map(({ id }) => id), [BAND]);
      assert.equal(first.result.nextOffset, 1);
      const second = publicCall(box, `saas.public_catalog_query_v2('${HOST}','${NOW}',NULL,'','all','price-asc',1,1)`);
      assert.deepEqual(second.result.items.map(({ id }) => id), [CHAIN]);
    });
    scenario("discount filter uses effective prices and genuine compare-at values", () => {
      const result = publicCall(box, `saas.public_catalog_query_v2('${HOST}','${NOW}',NULL,'','discounted','price-desc',1,0)`);
      assert.equal(result.result.total, 1);
      assert.deepEqual(result.result.items.map(({ id }) => id), [CHAIN]);
    });
    scenario("category and search restrictions are evaluated globally before limit", () => {
      const rings = publicCall(box, `saas.public_catalog_query_v2('${HOST}','${NOW}','rings','','all','price-desc',1,0)`);
      assert.equal(rings.result.total, 2);
      assert.deepEqual(rings.result.items.map(({ id }) => id), [RING]);
      const search = publicCall(box, `saas.public_catalog_query_v2('${HOST}','${NOW}',NULL,'Silver','all','featured',1,0)`);
      assert.equal(search.result.total, 1);
      assert.deepEqual(search.result.items.map(({ id }) => id), [CHAIN]);
    });
    scenario("quick-order hosted creation captures the same effective unit price", () => {
      seedQuickOrder(box);
      assert.equal(hostedCreate(box), "committed");
      assert.equal(scalar(box, `SELECT unit_price_cents FROM saas.quick_order_link_items WHERE store_id='${QUICK_STORE}' AND variant_id='${QUICK_VARIANT}'`), "500000");
    });
    scenario("a previously created quick link cannot begin a new payment at a stale price", () => {
      claimQuickLinkAndChangeRate(box);
      assert.equal(scalar(box, `SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.checkout_begin_attempt(
        '${QUICK_HOST}','${QUICK_COOKIE}','71000000-0000-4000-8000-000000000031',
        '${"6".repeat(32)}','72000000-0000-4000-8000-000000000031','${"7".repeat(64)}',
        '2026-09-20T12:02:00Z')`), "price_changed");
      assert.equal(scalar(box, `SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.quick_order_hosted_payment_begin(
        '${QUICK_HOST}','${QUICK_COOKIE}','73000000-0000-4000-8000-000000000031',
        '${"8".repeat(64)}','${"9".repeat(64)}','${"a".repeat(64)}','2026-09-20T12:02:00Z')`), "price_changed");
      assert.equal(scalar(box, `SELECT count(*) FROM saas.checkout_payment_attempts WHERE store_id='${QUICK_STORE}'`), "0");
      assert.equal(scalar(box, `SELECT count(*) FROM saas.payment_attempts WHERE store_id='${QUICK_STORE}'`), "0");
    });
    scenario("rollback refuses to restore old public and quick-order readers while dynamic pricing is active", () => {
      const result = psql(box, readFileSync(path.join(SQL, "202609200131_reference_pricing_public.down.sql"), "utf8"), true);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /REFERENCE_PRICING_PUBLIC_ROLLBACK_REQUIRES_NO_DYNAMIC_POLICIES/);
      assert.equal(scalar(box, `SELECT count(*) FROM pg_catalog.pg_proc WHERE oid='saas.public_catalog_query_v2(text,timestamptz,text,text,text,text,integer,integer)'::regprocedure`), "1");
    });
  } finally { stop(box); }
}

main();
