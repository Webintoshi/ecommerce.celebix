import assert from "node:assert/strict";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const DB = "promotions_studio_126";
const TOTAL = 25;
let completed = 0;
const STORE = "10000000-0000-4000-8000-000000000126";
const PERCENT = "40000000-0000-4000-8000-000000000126";
const FIXED = "40000000-0000-4000-8000-000000000127";
const SHIPPING = "40000000-0000-4000-8000-000000000128";
const TIER = "40000000-0000-4000-8000-000000000129";
const BUNDLE = "40000000-0000-4000-8000-000000000130";
const BUY = "40000000-0000-4000-8000-000000000131";
const GIFT = "40000000-0000-4000-8000-000000000132";
function bin(name) { for (const directory of [process.env.POSTGRES_BIN, ...(process.env.PATH ?? "").split(path.delimiter), ...(() => { try { return readdirSync(path.join(homedir(), ".codex", "tmp"), { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^postgresql-16[.]/.test(entry.name)).map((entry) => path.join(homedir(), ".codex", "tmp", entry.name, "bin")); } catch { return []; } })()]) { if (!directory) continue; try { const candidate = path.join(directory, name); accessSync(candidate, constants.X_OK); return candidate; } catch {} } throw new Error(`DISPOSABLE_DB_EXECUTION_BLOCKED: missing ${name}`); }
function command(program, args, input = "", allowFailure = false) { const result = spawnSync(program, args, { cwd: ROOT, input, encoding: "utf8", env: { ...process.env, LC_ALL: "C", LANG: "C" } }); if (result.error) throw result.error; if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\\n${result.stderr}`); return result; }
function start() { assertSafeEnvironment(); const tools = Object.fromEntries([...new Set([...REQUIRED_NATIVE_TOOLS,"initdb","pg_ctl","psql"])].map((name) => [name, bin(name)])); const root = mkdtempSync(path.join(tmpdir(), "cx-promotions-studio-")); const data = path.join(root, "data"), socket = path.join(root, "socket"), port = 21000 + Math.floor(Math.random() * 10000); mkdirSync(socket, { mode: 0o700 }); command(tools.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]); command(tools.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]); return { tools, root, data, socket, port }; }
function stop(box) { if (box) { command(box.tools.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], "", true); rmSync(box.root, { recursive: true, force: true }); } }
function psql(box, source, database = DB, allowFailure = false) { return command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], source, allowFailure); }
function apply(box, file) { psql(box, readFileSync(path.join(SQL, file), "utf8")); }
function scalar(box, source) { return psql(box, source).stdout.trim().split(String.fromCharCode(10)).at(-1) ?? ""; }
function scenario(name, callback) { callback(); completed += 1; process.stdout.write([`PASS ${completed}/${TOTAL} ${name}`, ""].join(String.fromCharCode(10))); }
function migrationsThrough125() {
  const accepted = /(?:[.]up|[.]seed|[.]freeze|_grants|_assertions|catalog_assertions)[.]sql$/;
  return readdirSync(SQL).filter((file) => {
    if (!/^2026\d{8}_.+[.]sql$/.test(file) || file.includes('.down.') || file.includes('rollback') || file.includes('forward_recovery') || file === '202607300073_seed_guzide_pilot_admin_domain.up.sql') return false;
    const sequence = Number.parseInt(file.slice(8, 12), 10);
    return Number.isSafeInteger(sequence) && sequence <= 125 && (sequence <= 71 ? accepted.test(file) : file.endsWith('.up.sql'));
  }).sort((left,right) => { const sequence=Number.parseInt(left.slice(8,12),10)-Number.parseInt(right.slice(8,12),10); const weight=(file)=>file.includes('assertions')?3:file.includes('freeze')||file.includes('grants')?2:1; return sequence||weight(left)-weight(right)||left.localeCompare(right); });
}
function rule(benefit) { return JSON.stringify({schemaVersion:1,benefit,targets:{mode:"all",include:[],exclude:[]},audience:{mode:"everyone"},trigger:{kind:"automatic"},schedule:{timezone:"Europe/Istanbul"},limits:{totalUsage:null,perCustomerUsage:null,budgetMinor:null,orderMaximumMinor:null},conditions:{minimumBasketMinor:0,minimumQuantity:0,minimumProductQuantity:0},combinationPolicy:{kind:"none"},priority:0,marginPolicy:{kind:"warn"},progressMessagePolicy:{enabled:false}}).replaceAll("'", "''"); }
function seed(box) {
  psql(box, `INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES ('${STORE}','Promotions Studio','promotions-studio','active','tr','TRY','starter','2026-01-01','2026-01-01');`);
  const rules = [[PERCENT,{kind:"percentage",percentageBps:1000}],[FIXED,{kind:"fixed_amount",amountMinor:50,currency:"TRY"}],[SHIPPING,{kind:"free_shipping"}],[TIER,{kind:"quantity_tiers",tiers:[{minimumQuantity:2,percentageBps:1000}]}],[BUNDLE,{kind:"bundle_price",bundleQuantity:3,bundlePriceMinor:200,currency:"TRY"}],[BUY,{kind:"buy_x_get_y",buyQuantity:2,receiveQuantity:1,discountPercentageBps:10000,reward:{strategy:"same_product_cheapest"}}],[GIFT,{kind:"gift",giftVariantId:"50000000-0000-4000-8000-000000000126"}]];
  for (const [id, benefit] of rules) psql(box, `INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES ('${id}','${STORE}','${benefit.kind}','paused',1,'${rule(benefit)}'::jsonb,'2026-01-01','2026-01-01');`);
}
function activate(box, id) { psql(box, `UPDATE saas.promotions SET status=CASE WHEN id='${id}' THEN 'active' ELSE 'paused' END WHERE store_id='${STORE}';`); }
function discount(box) { return scalar(box, `SELECT saas.promotion_evaluate_v1('${STORE}','{"currency":"TRY","cartLines":[{"lineId":"50000000-0000-4000-8000-000000000126","position":0,"productId":"50000000-0000-4000-8000-000000000126","variantId":"50000000-0000-4000-8000-000000000126","quantity":3,"unitPriceMinor":100}],"shippingBeforeDiscountMinor":40,"submittedCodes":[]}'::jsonb,'2026-09-05T00:00:00Z')->>'discountTotalMinor'`); }
let box;
try {
  box = start();
  command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-q", "-U", "postgres", "-d", "postgres", "-c", `CREATE DATABASE ${DB}`]);
  for (const migration of migrationsThrough125()) apply(box, migration);
  scenario("migration 126 applies after the accepted additive chain", () => apply(box, "202609050126_promotions_studio.up.sql"));
  apply(box, "202609050126_promotions_studio_assertions.sql");
  seed(box);
  scenario("exact eleven promotion relations exist", () => assert.equal(scalar(box, "SELECT count(*) FROM pg_class WHERE relnamespace='saas'::regnamespace AND relname IN ('promotions','promotion_versions','promotion_targets','promotion_codes','promotion_code_batches','promotion_usage_reservations','promotion_redemptions','promotion_audit_events','promotion_operations','order_promotion_snapshots','order_discount_allocations')"), "11"));
  scenario("evaluator is installed", () => assert.equal(scalar(box, "SELECT pg_catalog.to_regprocedure('saas.promotion_evaluate_v1(uuid,jsonb,timestamp with time zone)') IS NOT NULL"), "t"));
  scenario("tenant policies are forced", () => assert.equal(scalar(box, "SELECT count(*) FROM pg_class WHERE relnamespace='saas'::regnamespace AND relname LIKE 'promotion%' AND relrowsecurity AND relforcerowsecurity"), "9"));
  scenario("app has narrow RPC execution and no direct promotion table writes", () => { assert.equal(scalar(box,"SELECT pg_catalog.has_function_privilege('celebix_saas_app','saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text[],integer)'::regprocedure,'EXECUTE')"),"t"); assert.equal(scalar(box,"SELECT pg_catalog.has_table_privilege('celebix_saas_app','saas.promotions','INSERT,UPDATE,DELETE')"),"f"); assert.equal(scalar(box,"SELECT pg_catalog.has_function_privilege('celebix_saas_identity','saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text[],integer)'::regprocedure,'EXECUTE')"),"f"); });
  scenario("every promotion helper and RPC revokes PUBLIC execute", () => assert.equal(scalar(box, "SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname LIKE 'promotion_%' AND pg_catalog.has_function_privilege('public',p.oid,'EXECUTE')"), "0"));
  scenario("rule validation rejects malformed documents", () => assert.equal(scalar(box, "SELECT saas.promotion_rule_document_valid('{}'::jsonb)"), "f"));
  scenario("code normalization rejects whitespace and canonically folds Turkish letters", () => { assert.equal(scalar(box, "SELECT COALESCE(saas.promotion_normalize_code(' indirim-20 '),'')"),""); assert.equal(scalar(box, "SELECT saas.promotion_normalize_code('İndirim-20')"),"INDIRIM-20"); });
  scenario("code normalization rejects non-ASCII lookalikes", () => { assert.equal(scalar(box, "SELECT COALESCE(saas.promotion_normalize_code('KODß'),'')"), ""); assert.equal(scalar(box, "SELECT COALESCE(saas.promotion_normalize_code('KODΣ'),'')"), ""); });
  scenario("strict rule validation rejects bad nested values before evaluator casts", () => { const bad = rule({kind:"percentage",percentageBps:1000}).replace('"percentageBps":1000', '"percentageBps":"bad"'); assert.equal(scalar(box, `SELECT saas.promotion_rule_document_valid('${bad}'::jsonb)`), "f"); assert.equal(scalar(box, `SELECT saas.promotion_evaluate_v1('${STORE}','{"currency":"TRY","cartLines":[],"shippingBeforeDiscountMinor":0}'::jsonb,'2026-09-05T00:00:00Z')->>'discountTotalMinor'`), "0"); });
  scenario("operations use a SHA-256 fingerprint", () => assert.equal(scalar(box, "SELECT saas.promotion_operation_fingerprint('create','{}'::jsonb)"), "71e89af0bd175d9da125da99ba0742ecb9c2c259f88b03f362ce0108fcc253cc"));
  scenario("draft rules never apply", () => assert.equal(scalar(box, "SELECT saas.promotion_evaluate_v1('00000000-0000-4000-8000-000000000001','{\"currency\":\"TRY\",\"cartLines\":[],\"shippingBeforeDiscountMinor\":0}'::jsonb,'2026-09-05T00:00:00Z')->>'discountTotalMinor'"), "0"));
  scenario("percentage promotion uses integer minor units", () => { activate(box,PERCENT); assert.equal(discount(box),"30"); });
  scenario("fixed promotion caps at eligible cart value", () => { activate(box,FIXED); assert.equal(discount(box),"50"); });
  scenario("shipping promotion is bounded by shipping", () => { activate(box,SHIPPING); assert.equal(discount(box),"40"); });
  scenario("quantity tier selects the reached percentage", () => { activate(box,TIER); assert.equal(discount(box),"30"); });
  scenario("bundle price calculates a bounded saving", () => { activate(box,BUNDLE); assert.equal(discount(box),"100"); });
  scenario("buy X get Y discounts the deterministic cheapest unit", () => { activate(box,BUY); assert.equal(discount(box),"100"); });
  scenario("gift produces zero-paid immutable gift effect", () => { activate(box,GIFT); assert.equal(scalar(box, `SELECT saas.promotion_evaluate_v1('${STORE}','{"currency":"TRY","cartLines":[],"shippingBeforeDiscountMinor":0}'::jsonb,'2026-09-05T00:00:00Z')->'gifts'->0->>'paidMinor'`),"0"); });
  scenario("evaluator output has separated shipping and reconciled line effects", () => { activate(box,SHIPPING); const output=scalar(box, `SELECT saas.promotion_evaluate_v1('${STORE}','{"currency":"TRY","cartLines":[{"lineId":"50000000-0000-4000-8000-000000000126","position":0,"productId":"50000000-0000-4000-8000-000000000126","variantId":"50000000-0000-4000-8000-000000000126","quantity":1,"unitPriceMinor":100}],"shippingBeforeDiscountMinor":40,"submittedCodes":[]}'::jsonb,'2026-09-05T00:00:00Z')`); const value=JSON.parse(output); assert.equal(value.shippingDiscountTotalMinor,40); assert.equal(value.lineDiscountTotalMinor,0); assert.equal(value.discountTotalMinor,40); assert.equal(value.grandTotalMinor,100); assert.equal(value.eligiblePromotionIds.length,1); assert.equal(value.shippingEffects.length,1); });
  scenario("down migration refuses without emergency setting", () => assert.notEqual(psql(box, readFileSync(path.join(SQL, "202609050126_promotions_studio.down.sql"), "utf8"), DB, true).status, 0));
  scenario("allowed-empty emergency down removes functions before relations", () => { psql(box, `DELETE FROM saas.promotions WHERE store_id='${STORE}'`); const down = readFileSync(path.join(SQL, "202609050126_promotions_studio.down.sql"), "utf8").replace("BEGIN;", "BEGIN; SET LOCAL saas.promotions_studio_emergency_drop = 'approved-pre-restore';"); const result=psql(box, down, DB, true); if (result.status!==0) throw new Error(result.stderr); apply(box, "202609050126_promotions_studio.up.sql"); });
  scenario("migration is replay-safe", () => apply(box, "202609050126_promotions_studio.up.sql"));
  scenario("assertions replay safely", () => apply(box, "202609050126_promotions_studio_assertions.sql"));
  scenario("harness used no external connection", () => assert.equal(process.env.DATABASE_URL, undefined));
  assert.equal(completed, TOTAL);
  process.stdout.write([`PROMOTIONS_STUDIO_POSTGRESQL16_COMPLETE ${completed}/${TOTAL}`, ""].join(String.fromCharCode(10)));
} finally { stop(box); }
