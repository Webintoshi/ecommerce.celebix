import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const MIGRATION = "202609200130_reference_pricing.up.sql";
const DB = "reference_pricing_130";
const NOW = "2026-09-20T12:00:00.000Z";
const STORE = "10000000-0000-4000-8000-000000000130";
const OTHER_STORE = "10000000-0000-4000-8000-000000000131";
const OWNER = "20000000-0000-4000-8000-000000000130";
const EDITOR = "20000000-0000-4000-8000-000000000131";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000130";
const EDITOR_MEMBERSHIP = "30000000-0000-4000-8000-000000000131";
const OTHER_MEMBERSHIP = "30000000-0000-4000-8000-000000000132";
const PLAN = "00000000-0000-4000-8000-000000000001";
const USD = "40000000-0000-4000-8000-000000000130";
const EUR = "40000000-0000-4000-8000-000000000131";
const GOLD = "40000000-0000-4000-8000-000000000132";
const SET_1 = "41000000-0000-4000-8000-000000000130";
const SET_2 = "41000000-0000-4000-8000-000000000131";
const PRODUCT = "50000000-0000-4000-8000-000000000130";
const FIXED = "51000000-0000-4000-8000-000000000130";
const USD_VARIANT = "51000000-0000-4000-8000-000000000131";
const EUR_VARIANT = "51000000-0000-4000-8000-000000000132";
const GOLD_VARIANT = "51000000-0000-4000-8000-000000000133";
const GOLD_VARIANT_2 = "51000000-0000-4000-8000-000000000134";
const LIST = "60000000-0000-4000-8000-000000000130";
const LIST_RULE = "61000000-0000-4000-8000-000000000130";

function bin(name) {
  for (const directory of [process.env.POSTGRES_BIN, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* next directory */ }
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
  if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}

function start() {
  assertSafeEnvironment();
  const tools = Object.fromEntries(["initdb", "pg_ctl", "psql"].map((name) => [name, bin(name)]));
  const root = mkdtempSync(path.join(tmpdir(), "cx-reference-pricing-"));
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
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
  return command(box.tools.psql, [
    "-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", DB,
  ], source, allowFailure);
}

function scalar(box, source) { return psql(box, source).stdout.trim().split("\n").at(-1) ?? ""; }
function sqlString(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function jsonb(value) { return `${sqlString(JSON.stringify(value))}::jsonb`; }
function fingerprint(kind, value) { return createHash("sha256").update(JSON.stringify([kind, value])).digest("hex"); }
function authority({ store = STORE, principal = OWNER, membership = MEMBERSHIP } = {}) {
  return `${sqlString(store)}::uuid,${sqlString(principal)}::uuid,${sqlString(membership)}::uuid,${sqlString(PLAN)}::uuid,'free_starter',1,${sqlString(NOW)}::timestamptz`;
}
function operation(index) { return `70000000-0000-4000-8000-${String(index).padStart(12, "0")}`; }
function call(box, name, args, options = {}) {
  const result = psql(box, `SET ROLE celebix_saas_app; SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.${name}(${authority(options)},${args});`, true);
  assert.equal(result.status, 0, result.stderr || `failed: ${name}`);
  return JSON.parse(result.stdout.trim().split("\n").at(-1));
}
function define(box, id, kind, label, purity, op) {
  const values = { id, kind, label, purity };
  return call(box, "pricing_reference_define", `${sqlString(op)}::uuid,${sqlString(fingerprint("define", values))},${sqlString(id)}::uuid,${sqlString(kind)},${sqlString(label)},${purity === null ? "NULL::text" : `${sqlString(purity)}::text`}`);
}
function saveSet(box, id, expectedVersion, values, op) {
  return call(box, "pricing_reference_set_save", `${sqlString(op)}::uuid,${sqlString(fingerprint("save_set", { id, expectedVersion, values }))},${sqlString(id)}::uuid,${expectedVersion}::bigint,${jsonb(values)}`);
}
function preview(box, id, pageSize = 100, afterVariantId = null, options = {}) {
  return call(box, "pricing_reference_set_preview", `${sqlString(id)}::uuid,'storefront',${pageSize}::integer,${afterVariantId === null ? "NULL::uuid" : `${sqlString(afterVariantId)}::uuid`}`, options);
}
function activate(box, id, expectedVersion, scopeDigest, op) {
  return call(box, "pricing_reference_set_activate", `${sqlString(op)}::uuid,${sqlString(fingerprint("activate", { id, expectedVersion, scopeDigest }))},${sqlString(id)}::uuid,${expectedVersion}::bigint,${sqlString(scopeDigest)}`);
}
function policySave(box, variantId, expectedVariantVersion, expectedPolicyVersion, policy, op, options = {}) {
  return call(box, "pricing_variant_policy_save", `${sqlString(op)}::uuid,${sqlString(fingerprint("policy_save", { variantId, expectedVariantVersion, expectedPolicyVersion, policy }))},${sqlString(variantId)}::uuid,${expectedVariantVersion}::bigint,${expectedPolicyVersion}::bigint,${jsonb(policy)}`, options);
}
function effective(box, variantId, channel = "storefront") {
  return JSON.parse(scalar(box, `SELECT pg_catalog.to_jsonb(resolved) FROM saas.resolve_effective_variant_price(${sqlString(STORE)}::uuid,${sqlString(variantId)}::uuid,${sqlString(channel)},${sqlString(NOW)}::timestamptz,NULL::text) resolved;`));
}

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

function apply(box, file) { psql(box, readFileSync(path.join(SQL, file), "utf8")); }

function seed(box, { dynamicPricingEnabled = true } = {}) {
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
      ('${OWNER}','https://id.test/oidc','pricing-owner','pricing-owner@test.invalid',true,'2026-01-01','2026-01-01'),
      ('${EDITOR}','https://id.test/oidc','pricing-editor','pricing-editor@test.invalid',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
      ('${STORE}','Pricing A','pricing-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
      ('${OTHER_STORE}','Pricing B','pricing-b','active','tr','TRY','default','2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
      ('${MEMBERSHIP}','${OWNER}','${STORE}','store_owner','active','2026-01-01','2026-01-01'),
      ('${EDITOR_MEMBERSHIP}','${EDITOR}','${STORE}','editor','active','2026-01-01','2026-01-01'),
      ('${OTHER_MEMBERSHIP}','${OWNER}','${OTHER_STORE}','store_owner','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
      ('31000000-0000-4000-8000-000000000130','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01'),
      ('31000000-0000-4000-8000-000000000131','${OTHER_STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
    INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES
      ('${PRODUCT}','${STORE}','pricing-product','Pricing Product','active','TRY',1,'2026-01-01','2026-01-01');
    ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
    INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES
      ('${FIXED}','${PRODUCT}','${STORE}','Fixed',12345,false,0,'active','{}',1,'2026-01-01','2026-01-01'),
      ('${USD_VARIANT}','${PRODUCT}','${STORE}','USD',10000,false,0,'active','{}',1,'2026-01-01','2026-01-01'),
      ('${EUR_VARIANT}','${PRODUCT}','${STORE}','EUR',10000,false,0,'active','{}',1,'2026-01-01','2026-01-01'),
      ('${GOLD_VARIANT}','${PRODUCT}','${STORE}','Gold',10000,false,0,'active','{}',1,'2026-01-01','2026-01-01'),
      ('${GOLD_VARIANT_2}','${PRODUCT}','${STORE}','Gold 2',10000,false,0,'active','{}',1,'2026-01-01','2026-01-01');
    ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;
  COMMIT;`);
  if (dynamicPricingEnabled) psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.pricing_dynamic_activation(store_id,enabled)
    VALUES('${STORE}'::uuid,true);COMMIT;`);
}

let passed = 0;
function scenario(name, run) {
  run();
  passed += 1;
  process.stdout.write(`PASS ${passed} ${name}\n`);
}

function main() {
  let box;
  try {
    box = start();
    command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], `CREATE DATABASE ${DB};`);
    for (const file of migrationsThrough128()) apply(box, file);
    if (existsSync(path.join(SQL, MIGRATION))) {
      apply(box, MIGRATION);
      apply(box, "202609200130_reference_pricing_assertions.sql");
    }
    seed(box);

    // RED against canonical: this first real-role mutation has no implementation yet.
    scenario("merchant can define one immutable USD selling reference", () => {
      assert.equal(define(box, USD, "usd", "USD satış", null, operation(1)).outcome, "defined");
    });
    scenario("EUR and direct gold tariffs are independent definitions", () => {
      assert.equal(define(box, EUR, "eur", "EUR satış", null, operation(2)).outcome, "defined");
      assert.equal(define(box, GOLD, "gold_gram", "22 ayar gram satış", "0.916667", operation(3)).outcome, "defined");
    });
    scenario("duplicate USD definition cannot silently change its meaning", () => {
      const duplicate = define(box, "40000000-0000-4000-8000-000000000133", "usd", "Farklı USD", null, operation(4));
      assert.notEqual(duplicate.outcome, "defined");
    });
    const rates1 = [
      { referenceId: USD, rateTry: "40.00000000", active: true },
      { referenceId: EUR, rateTry: "45.00000000", active: true },
      { referenceId: GOLD, rateTry: "5000.00000000", active: true },
    ];
    scenario("draft reference set is saved without repricing live fixed variants", () => {
      assert.equal(saveSet(box, SET_1, 0, rates1, operation(5)).outcome, "saved");
      assert.equal(effective(box, FIXED).price_cents, 12345);
    });
    let firstScopeDigest;
    scenario("read-only impact preview returns a full-scope digest", () => {
      const result = preview(box, SET_1, 1);
      assert.equal(result.outcome, "previewed");
      assert.match(result.result.scopeDigest, /^[a-f0-9]{64}$/);
      firstScopeDigest = result.result.scopeDigest;
    });
    scenario("activation binds exactly one complete reference set", () => {
      assert.equal(activate(box, SET_1, 0, firstScopeDigest, operation(6)).outcome, "activated");
    });
    scenario("USD and EUR policies use exact source amounts and canonical effective price", () => {
      assert.equal(policySave(box, USD_VARIANT, 1, 0, { method: "usd", sourceAmount: "125", referenceId: USD }, operation(7)).outcome, "policy_saved");
      assert.equal(policySave(box, EUR_VARIANT, 1, 0, { method: "eur", sourceAmount: "100", referenceId: EUR }, operation(8)).outcome, "policy_saved");
      assert.equal(effective(box, USD_VARIANT).price_cents, 500000);
      assert.equal(effective(box, EUR_VARIANT).price_cents, 450000);
    });
    scenario("existing merchant preview reports calculated base, not stale stored cents", () => {
      const result = call(box, "pricing_preview", `'storefront',ARRAY[${sqlString(USD_VARIANT)}::uuid]`);
      assert.equal(result.outcome, "previewed");
      assert.equal(result.result.entries[0].basePriceCents, 500000);
      assert.equal(result.result.entries[0].effectivePriceCents, 500000);
      assert.equal(scalar(box, `SELECT price_cents FROM saas.product_variants WHERE id='${USD_VARIANT}'`), "10000");
    });
    scenario("legacy cached-cent writes cannot flatten a dynamic policy", () => {
      const denied = psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
        UPDATE saas.product_variants SET price_cents=500000,version=version+1 WHERE store_id='${STORE}' AND id='${USD_VARIANT}'; COMMIT;`, true);
      assert.notEqual(denied.status, 0);
      assert.match(denied.stderr, /PRICING_POLICY_PRICE_CONFLICT/);
    });
    const goldPolicy = { method: "gold_gram", metalGrams: "2.500000", referenceId: GOLD, purityMode: "direct", laborMode: "per_item_try", laborAmount: "750", upliftPercent: "0", allowFullDiscount: false };
    const { laborAmount: _unusedLaborAmount, ...noLaborGoldPolicy } = goldPolicy;
    scenario("direct 22-ayar tariff is not multiplied by purity again", () => {
      assert.equal(policySave(box, GOLD_VARIANT, 1, 0, goldPolicy, operation(9)).outcome, "policy_saved");
      assert.equal(effective(box, GOLD_VARIANT).price_cents, 1325000);
    });
    scenario("gold pricing is variant-specific and no quantity factor is hidden in unit price", () => {
      assert.equal(policySave(box, GOLD_VARIANT_2, 1, 0, { ...noLaborGoldPolicy, metalGrams: "1.000000", laborMode: "none" }, operation(10)).outcome, "policy_saved");
      assert.equal(effective(box, GOLD_VARIANT_2).price_cents, 500000);
    });
    scenario("preview counts every affected variant before one-row pagination", () => {
      const result = preview(box, SET_1, 1);
      assert.equal(result.outcome, "previewed");
      assert.equal(result.result.affectedVariants, 4);
      assert.equal(result.result.affectedProducts, 1);
      assert.equal(result.result.entries.length, 1);
    });
    scenario("same operation replays one policy result and a different payload conflicts", () => {
      const replay = policySave(box, GOLD_VARIANT, 1, 0, goldPolicy, operation(9));
      assert.equal(replay.outcome, "operation_replayed");
      const mismatch = policySave(box, GOLD_VARIANT, 1, 0, { ...goldPolicy, metalGrams: "3.000000" }, operation(9));
      assert.equal(mismatch.outcome, "operation_mismatch");
    });
    scenario("tenant-scoped operation recovery returns the original committed projection", () => {
      const recovered = call(box, "pricing_reference_operation_get", `${sqlString(operation(9))}::uuid`);
      assert.equal(recovered.outcome, "found");
      assert.equal(recovered.result.operationKind, "policy_save");
      assert.equal(recovered.result.result.variantId, GOLD_VARIANT);
    });
    const rates2 = rates1.map((row) => row.referenceId === GOLD ? { ...row, rateTry: "5200.00000000" } : row);
    scenario("draft set does not mutate the previously activated price", () => {
      assert.equal(saveSet(box, SET_2, 1, rates2, operation(11)).outcome, "saved");
      assert.equal(effective(box, GOLD_VARIANT).price_cents, 1325000);
    });
    let secondScopeDigest;
    scenario("new gold tariff publishes the exact changed unit price", () => {
      const impact = preview(box, SET_2, 1);
      assert.equal(impact.outcome, "previewed");
      secondScopeDigest = impact.result.scopeDigest;
      assert.equal(activate(box, SET_2, 1, secondScopeDigest, operation(12)).outcome, "activated");
      assert.equal(effective(box, GOLD_VARIANT).price_cents, 1375000);
    });
    scenario("explicit purity ratio uses matching fractional scales", () => {
      const ratio = { ...noLaborGoldPolicy, metalGrams: "1.000000", purityMode: "ratio", productPurity: "0.750000", laborMode: "none" };
      assert.equal(policySave(box, GOLD_VARIANT_2, 2, 1, ratio, operation(17)).outcome, "policy_saved");
      assert.equal(effective(box, GOLD_VARIANT_2).price_cents, 425454);
    });
    scenario("half-cent is rounded once at final nonnegative TRY unit price", () => {
      assert.equal(policySave(box, USD_VARIANT, 2, 1, { method: "usd", sourceAmount: "0.00012500", referenceId: USD }, operation(18)).outcome, "policy_saved");
      assert.equal(effective(box, USD_VARIANT).price_cents, 1);
    });
    scenario("scientific decimal and overflow are rejected before a price is published", () => {
      assert.equal(policySave(box, EUR_VARIANT, 2, 1, { method: "eur", sourceAmount: "1e3", referenceId: EUR }, operation(19)).outcome, "invalid_input");
      assert.equal(policySave(box, EUR_VARIANT, 2, 1, { method: "eur", sourceAmount: "80000000", referenceId: EUR }, operation(20)).outcome, "invalid_input");
      assert.equal(effective(box, EUR_VARIANT).price_cents, 450000);
    });
    scenario("stale active-set version cannot overwrite a newer activation", () => {
      assert.equal(activate(box, SET_1, 1, firstScopeDigest, operation(13)).outcome, "version_conflict");
    });
    scenario("fixed price-list override wins without multiplying by gold tariff", () => {
      psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
        INSERT INTO saas.price_lists(id,store_id,name,status,version,activated_at,created_at,updated_at) VALUES('${LIST}','${STORE}','Gold override','active',1,'2026-01-01','2026-01-01','2026-01-01');
        INSERT INTO saas.price_list_items(store_id,price_list_id,variant_id,price_cents,created_at) VALUES('${STORE}','${LIST}','${GOLD_VARIANT}',990000,'2026-01-01');
        INSERT INTO saas.price_list_rules(id,store_id,price_list_id,channel,starts_at,priority,created_at) VALUES('${LIST_RULE}','${STORE}','${LIST}','storefront','2026-01-01',50,'2026-01-01');
      COMMIT;`);
      assert.equal(effective(box, GOLD_VARIANT).price_cents, 990000);
      assert.equal(effective(box, GOLD_VARIANT).source_kind, "price_list");
    });
    scenario("editor may read impact but may not publish a reference", () => {
      assert.equal(preview(box, SET_2, 1, null, { principal: EDITOR, membership: EDITOR_MEMBERSHIP }).outcome, "previewed");
      const denied = call(box, "pricing_reference_set_activate", `${sqlString(operation(14))}::uuid,${sqlString("a".repeat(64))},${sqlString(SET_1)}::uuid,2::bigint,${sqlString(secondScopeDigest)}`, { principal: EDITOR, membership: EDITOR_MEMBERSHIP });
      assert.equal(denied.outcome, "membership_denied");
    });
    scenario("other tenant cannot bind this store's reference to a variant", () => {
      const wrong = policySave(box, USD_VARIANT, 2, 1, { method: "usd", sourceAmount: "125", referenceId: USD }, operation(15), { store: OTHER_STORE, membership: OTHER_MEMBERSHIP });
      assert.notEqual(wrong.outcome, "policy_saved");
    });
    scenario("explicit fixed TRY transition writes the validated current variant cents", () => {
      const fixed = policySave(box, USD_VARIANT, 3, 2, { method: "fixed_try", fixedPriceCents: 424242 }, operation(16));
      assert.equal(fixed.outcome, "policy_saved");
      assert.equal(effective(box, USD_VARIANT).price_cents, 424242);
      assert.equal(scalar(box, `SELECT price_cents FROM saas.product_variants WHERE store_id='${STORE}' AND id='${USD_VARIANT}'`), "424242");
    });
    scenario("direct app role cannot read merchant pricing tables", () => {
      const denied = psql(box, "SET ROLE celebix_saas_app; SELECT count(*) FROM saas.pricing_reference_sets;", true);
      assert.notEqual(denied.status, 0);
    });
    scenario("app role cannot call private pricing calculation or digest helpers", () => {
      const denied = psql(box, `SET ROLE celebix_saas_app; SELECT * FROM saas.pricing_calculate_variant_price('${STORE}'::uuid,'${GOLD_VARIANT}'::uuid,NULL::uuid);`, true);
      assert.notEqual(denied.status, 0);
      const digestDenied = psql(box, `SET ROLE celebix_saas_app; SELECT saas.pricing_reference_scope_digest('${STORE}'::uuid,'${SET_2}'::uuid,'${NOW}'::timestamptz);`, true);
      assert.notEqual(digestDenied.status, 0);
    });
    scenario("rollback refuses to erase live immutable pricing history", () => {
      const denied = psql(box, readFileSync(path.join(SQL, "202609200130_reference_pricing.down.sql"), "utf8"), true);
      assert.notEqual(denied.status, 0);
      assert.match(denied.stderr, /REFERENCE_PRICING_ROLLBACK_REQUIRES_EMPTY_HISTORY/);
      assert.equal(effective(box, FIXED).price_cents, 12345);
    });
  } finally { stop(box); }
}

export { SQL, DB, NOW, STORE, OWNER, MEMBERSHIP, PLAN, USD, SET_1, USD_VARIANT, FIXED,
  command, start, stop, psql, scalar, sqlString, jsonb, fingerprint, authority,
  operation, call, define, saveSet, preview, activate, policySave, effective,
  migrationsThrough128, apply, seed };

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main();
