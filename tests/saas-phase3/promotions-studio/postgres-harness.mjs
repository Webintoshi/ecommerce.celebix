import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";
import { assertPromotionPerformanceBudget, percentile95 } from "./performance.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const DB = "promotions_studio_126";
const TOTAL = 157;
let completed = 0;
let catalogFixtureProductBaseline = 0;
const STORE = "10000000-0000-4000-8000-000000000126";
const STOREFRONT_HOST = "promotions-studio.saas-staging.celebix.site";
const QUOTE_CART = "61000000-0000-4000-8000-000000000126";
const QUOTE_CART_DIGEST = "9".repeat(64);
const PERCENT = "40000000-0000-4000-8000-000000000126";
const FIXED = "40000000-0000-4000-8000-000000000127";
const SHIPPING = "40000000-0000-4000-8000-000000000128";
const TIER = "40000000-0000-4000-8000-000000000129";
const BUNDLE = "40000000-0000-4000-8000-000000000130";
const BUY = "40000000-0000-4000-8000-000000000131";
const GIFT = "40000000-0000-4000-8000-000000000132";
const OTHER_STORE = "20000000-0000-4000-8000-000000000126";
const LEGACY_STORE = "15000000-0000-4000-8000-000000000126";
const LEGACY_PERCENT = "15000000-0000-4000-8000-000000000127";
const LEGACY_FIXED = "15000000-0000-4000-8000-000000000128";
const LEGACY_INVALID = "15000000-0000-4000-8000-000000000129";
const LEGACY_GENERAL = "15000000-0000-4000-8000-000000000130";
const LEGACY_ARCHIVED = "15000000-0000-4000-8000-000000000131";
const BATCH_PROMOTION = "b1000000-0000-4000-8000-000000000126";
const PRIMARY_BATCH = "b3000000-0000-4000-8000-000000000126";
const PRIMARY_BATCH_OPERATION = "b4000000-0000-4000-8000-000000000126";
const MAX_BATCH = "b3000000-0000-4000-8000-000000000127";
const OLD_BATCH = "b3000000-0000-4000-8000-000000000128";
const OTHER_PRODUCT = "50000000-0000-4000-8000-000000000129";
const CATEGORY = "50000000-0000-4000-8000-000000000130";
const BRAND = "50000000-0000-4000-8000-000000000131";
const COLLECTION = "50000000-0000-4000-8000-000000000132";
const PAYMENT_METHOD = "50000000-0000-4000-8000-000000000133";
const DISABLED_PAYMENT_METHOD = "50000000-0000-4000-8000-000000000134";
const HOSTED_V2_PROFILE = "50000000-0000-4000-8000-000000000135";
const HOSTED_V2_METHOD = "50000000-0000-4000-8000-000000000136";
const PLAN = "31000000-0000-4000-8000-000000000126";
const DISABLED_PLAN = "31000000-0000-4000-8000-000000000127";
const INACTIVE_STORE = "20000000-0000-4000-8000-000000000127";
const ACTORS = Object.freeze({
  store_owner: Object.freeze({ principal: "32000000-0000-4000-8000-000000000126", membership: "33000000-0000-4000-8000-000000000126" }),
  admin: Object.freeze({ principal: "32000000-0000-4000-8000-000000000127", membership: "33000000-0000-4000-8000-000000000127" }),
  editor: Object.freeze({ principal: "32000000-0000-4000-8000-000000000128", membership: "33000000-0000-4000-8000-000000000128" }),
  analyst: Object.freeze({ principal: "32000000-0000-4000-8000-000000000129", membership: "33000000-0000-4000-8000-000000000129" }),
  revoked: Object.freeze({ principal: "32000000-0000-4000-8000-000000000130", membership: "33000000-0000-4000-8000-000000000130" }),
  waiting: Object.freeze({ principal: "32000000-0000-4000-8000-000000000131", membership: "33000000-0000-4000-8000-000000000131" }),
  other: Object.freeze({ principal: "32000000-0000-4000-8000-000000000132", membership: "33000000-0000-4000-8000-000000000132" }),
});
function bin(name) { for (const directory of [process.env.POSTGRES_BIN, ...(process.env.PATH ?? "").split(path.delimiter), ...(() => { try { return readdirSync(path.join(homedir(), ".codex", "tmp"), { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^postgresql-16[.]/.test(entry.name)).map((entry) => path.join(homedir(), ".codex", "tmp", entry.name, "bin")); } catch { return []; } })()]) { if (!directory) continue; try { const candidate = path.join(directory, name); accessSync(candidate, constants.X_OK); return candidate; } catch {} } throw new Error(`DISPOSABLE_DB_EXECUTION_BLOCKED: missing ${name}`); }
function command(program, args, input = "", allowFailure = false) { const result = spawnSync(program, args, { cwd: ROOT, input, encoding: "utf8", env: { ...process.env, LC_ALL: "C", LANG: "C" } }); if (result.error) throw result.error; if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\\n${result.stderr}`); return result; }
function start() { assertSafeEnvironment(); const tools = Object.fromEntries([...new Set([...REQUIRED_NATIVE_TOOLS,"initdb","pg_ctl","psql"])].map((name) => [name, bin(name)])); const root = mkdtempSync(path.join(tmpdir(), "cx-promotions-studio-")); const data = path.join(root, "data"), socket = path.join(root, "socket"), port = 21000 + Math.floor(Math.random() * 10000); mkdirSync(socket, { mode: 0o700 }); command(tools.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]); command(tools.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]); return { tools, root, data, socket, port }; }
function stop(box) { if (box) { command(box.tools.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], "", true); rmSync(box.root, { recursive: true, force: true }); } }
function psql(box, source, database = DB, allowFailure = false) { return command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], source, allowFailure); }
function psqlArgs(box, database = DB) { return ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database]; }
function psqlAsync(box, source, database = DB) {
  return new Promise((resolve, reject) => {
    const child = spawn(box.tools.psql, psqlArgs(box, database), { cwd: ROOT, env: { ...process.env, LC_ALL: "C", LANG: "C" } });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject); child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(source);
  });
}
function openPsqlSession(box, database = DB) {
  const child = spawn(box.tools.psql, psqlArgs(box, database), { cwd: ROOT, env: { ...process.env, LC_ALL: "C", LANG: "C" } });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
  const completion = new Promise((resolve, reject) => { child.on("error", reject); child.on("close", (status) => resolve({ status, stdout, stderr })); });
  return {
    child,
    completion,
    write(source) { child.stdin.write(source); },
    end(source = "") { child.stdin.end(source); },
    waitFor(pattern, timeout = 5000) { return new Promise((resolve, reject) => { const started = Date.now(); const poll = () => { if (pattern.test(stdout)) resolve(stdout); else if (Date.now() - started >= timeout) reject(new Error(`psql output timeout: ${stdout}\n${stderr}`)); else setTimeout(poll, 20); }; poll(); }); },
  };
}
async function waitForScalar(box, source, expected, timeout = 5000) { const started = Date.now(); while (Date.now() - started < timeout) { if (scalar(box, source) === expected) return; await new Promise((resolve) => setTimeout(resolve, 20)); } throw new Error(`database condition timeout: ${source}`); }
function apply(box, file) { psql(box, readFileSync(path.join(SQL, file), "utf8")); }
function scalar(box, source) { return psql(box, source).stdout.trim().split(String.fromCharCode(10)).at(-1) ?? ""; }
function scenario(name, callback) { callback(); completed += 1; process.stdout.write([`PASS ${completed}/${TOTAL} ${name}`, ""].join(String.fromCharCode(10))); }
async function asyncScenario(name, callback) { await callback(); completed += 1; process.stdout.write([`PASS ${completed}/${TOTAL} ${name}`, ""].join(String.fromCharCode(10))); }
const CATALOG_FACT_RELATIONS = Object.freeze(["products","product_variants","catalog_product_categories","catalog_admin_resource_products","catalog_admin_resources"]);
const AUDIENCE_FACT_RELATIONS = Object.freeze(["orders","customer_segment_memberships","customer_tag_assignments","customers","abandoned_carts"]);
const PROFILE_RELATIONS = Object.freeze([...CATALOG_FACT_RELATIONS,...AUDIENCE_FACT_RELATIONS,"promotions","promotion_usage_reservations"]);
const FACT_LOADERS = Object.freeze(["promotion_evaluator_materialize_lines","promotion_evaluator_audience_facts","promotion_evaluator_code_facts","promotion_evaluator_candidate_facts"]);
// Earlier PG16 plans measured about 364 catalog index tuples. The set-wise plan
// is lower, while 500 preserves planner headroom and still fails 1,600/32,000 fan-outs.
const CATALOG_INDEX_TUPLE_CEILING = 500;
const CATALOG_SEQUENTIAL_TUPLE_CEILING = 100;
function sqlNames(names) { return names.map((name)=>`'${name}'`).join(","); }
function measuredEvaluation(box, overrides = {}) {
  psql(box, `${PROFILE_RELATIONS.map((name)=>`ANALYZE saas.${name}`).join("; ")}; SELECT pg_catalog.pg_stat_reset()`);
  const source=JSON.stringify(context(overrides)).replaceAll("'","''");
  const value=JSON.parse(scalar(box,`SET track_functions='all'; SELECT saas.promotion_evaluate_v1('${STORE}','${source}'::jsonb,'2026-09-05T00:00:00Z')`));
  const tables=JSON.parse(scalar(box,`SELECT pg_catalog.jsonb_object_agg(relname,pg_catalog.jsonb_build_object('seqScan',seq_scan,'seqTupRead',seq_tup_read,'idxScan',idx_scan,'idxTupFetch',idx_tup_fetch) ORDER BY relname) FROM pg_catalog.pg_stat_user_tables WHERE schemaname='saas' AND relname=ANY(ARRAY[${sqlNames(PROFILE_RELATIONS)}])`));
  const indexes=JSON.parse(scalar(box,`SELECT COALESCE(pg_catalog.jsonb_object_agg(relname,pg_catalog.jsonb_build_object('idxScan',idx_scan,'idxTupRead',idx_tup_read,'idxTupFetch',idx_tup_fetch) ORDER BY relname),'{}'::jsonb) FROM (SELECT relname,sum(idx_scan)::bigint idx_scan,sum(idx_tup_read)::bigint idx_tup_read,sum(idx_tup_fetch)::bigint idx_tup_fetch FROM pg_catalog.pg_stat_all_indexes WHERE schemaname='saas' AND relname=ANY(ARRAY[${sqlNames(PROFILE_RELATIONS)}]) GROUP BY relname) index_stats`));
  const trackedFunctions=[...FACT_LOADERS,"promotion_evaluator_gift_variant_valid"];
  const functions=JSON.parse(scalar(box,`SELECT COALESCE(pg_catalog.jsonb_object_agg(funcname,calls ORDER BY funcname),'{}'::jsonb) FROM (SELECT funcname,sum(calls)::bigint calls FROM pg_catalog.pg_stat_user_functions WHERE schemaname='saas' AND funcname=ANY(ARRAY[${sqlNames(trackedFunctions)}]) GROUP BY funcname) measured_functions`));
  return {value,tables,indexes,functions};
}
function relationCounter(stats, relations, field) { return relations.reduce((total,relation)=>total+Number(stats[relation]?.[field]??0),0); }
function relationFootprint(profile, relations) { return Object.fromEntries(relations.map((relation)=>[relation,{seqTupRead:Number(profile.tables[relation]?.seqTupRead??0),idxTupRead:Number(profile.indexes[relation]?.idxTupRead??0),idxTupFetch:Number(profile.tables[relation]?.idxTupFetch??0)}])); }
function assertFactLoadersOnce(profile) { for (const loader of FACT_LOADERS) assert.equal(Number(profile.functions[loader]??0),1,`${loader} must execute exactly once: ${JSON.stringify(profile.functions)}`); }
function assertCatalogBudget(profile) { assert.equal(relationCounter(profile.tables,CATALOG_FACT_RELATIONS,"seqTupRead")<=CATALOG_SEQUENTIAL_TUPLE_CEILING,true,JSON.stringify(relationFootprint(profile,CATALOG_FACT_RELATIONS))); assert.equal(relationCounter(profile.indexes,CATALOG_FACT_RELATIONS,"idxTupRead")<=CATALOG_INDEX_TUPLE_CEILING,true,JSON.stringify(relationFootprint(profile,CATALOG_FACT_RELATIONS))); }
function profileSummary(profile) { return {functions:Object.fromEntries([...FACT_LOADERS,"promotion_evaluator_gift_variant_valid"].map((name)=>[name,Number(profile.functions[name]??0)])),catalog:relationFootprint(profile,CATALOG_FACT_RELATIONS),audience:relationFootprint(profile,AUDIENCE_FACT_RELATIONS),promotions:profile.tables.promotions}; }
function migrationsThrough125() {
  const accepted = /(?:[.]up|[.]seed|[.]freeze|_grants|_assertions|catalog_assertions)[.]sql$/;
  return readdirSync(SQL).filter((file) => {
    if (!/^2026\d{8}_.+[.]sql$/.test(file) || file.includes('.down.') || file.includes('rollback') || file.includes('forward_recovery') || file === '202607300073_seed_guzide_pilot_admin_domain.up.sql') return false;
    const sequence = Number.parseInt(file.slice(8, 12), 10);
    return Number.isSafeInteger(sequence) && sequence <= 125 && (sequence <= 71 ? accepted.test(file) : file.endsWith('.up.sql'));
  }).sort((left,right) => { const sequence=Number.parseInt(left.slice(8,12),10)-Number.parseInt(right.slice(8,12),10); const weight=(file)=>file.includes('assertions')?3:file.includes('freeze')||file.includes('grants')?2:1; return sequence||weight(left)-weight(right)||left.localeCompare(right); });
}
function rule(benefit) { const targets=benefit.kind==="bundle_price"?{mode:"selected",include:benefit.items.map(({variantId})=>({kind:"variant",id:variantId})),exclude:[]}:{mode:"all",include:[],exclude:[]}; return JSON.stringify({schemaVersion:1,benefit,targets,audience:{mode:"everyone"},trigger:{kind:"automatic"},schedule:{timezone:"Europe/Istanbul"},limits:{totalUsage:null,perCustomerUsage:null,budgetMinor:null,orderMaximumMinor:null},conditions:{minimumBasketMinor:0,minimumQuantity:0,minimumProductQuantity:0},combinationPolicy:{kind:"none"},priority:0,marginPolicy:{kind:"warn"},progressMessagePolicy:{enabled:false}}).replaceAll("'", "''"); }
function validRuleDocument() { return JSON.parse(rule({kind:"percentage",percentageBps:1000})); }
function validates(box, value) { return scalar(box, `SELECT saas.promotion_rule_document_valid('${JSON.stringify(value).replaceAll("'", "''")}'::jsonb)`); }
function seedPromotions(box) {
  const rules = [[PERCENT,{kind:"percentage",percentageBps:1000}],[FIXED,{kind:"fixed_amount",amountMinor:50,currency:"TRY"}],[SHIPPING,{kind:"free_shipping"}],[TIER,{kind:"quantity_tiers",tiers:[{minimumQuantity:2,percentageBps:1000}]}],[BUNDLE,bundleBenefit()],[BUY,{kind:"buy_x_get_y",buyQuantity:2,receiveQuantity:1,discountPercentageBps:10000,reward:{strategy:"same_product_cheapest"}}],[GIFT,{kind:"gift",giftVariantId:"50000000-0000-4000-8000-000000000126",quantity:1,autoAdd:true}]];
  for (const [id, benefit] of rules) psql(box, `
    INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at)
    VALUES ('${id}','${STORE}','${benefit.kind}','paused',1,'${rule(benefit)}'::jsonb,'2026-01-01','2026-01-01');
    INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at)
    VALUES ('${id}','${STORE}','${id}',1,'${rule(benefit)}'::jsonb,'2026-01-01');
  `);
}
function seed(box) {
  psql(box, `INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES ('${STORE}','Promotions Studio','promotions-studio','active','tr','TRY','starter','2026-01-01','2026-01-01');`);
  psql(box, `INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES ('${OTHER_STORE}','Other Promotions Studio','other-promotions-studio','active','tr','TRY','starter','2026-01-01','2026-01-01');
    INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES
      ('${LINE}','${STORE}','promotion-line','Promotion line','active','TRY','2026-01-01','2026-01-01'),
      ('${BUNDLE_LINE}','${STORE}','promotion-bundle-line','Promotion bundle line','draft','TRY','2026-01-01','2026-01-01'),
      ('${OTHER_PRODUCT}','${OTHER_STORE}','other-promotion-line','Other promotion line','active','TRY','2026-01-01','2026-01-01');
    ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
    INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES
      ('${LINE}','${LINE}','${STORE}','Promotion variant',100,40,false,0,'active','2026-01-01','2026-01-01'),
      ('${BUNDLE_LINE}','${BUNDLE_LINE}','${STORE}','Promotion bundle variant',0,0,false,0,'active','2026-01-01','2026-01-01'),
      ('${OTHER_PRODUCT}','${OTHER_PRODUCT}','${OTHER_STORE}','Other promotion variant',100,40,false,0,'active','2026-01-01','2026-01-01');
    ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;
    INSERT INTO saas.catalog_categories(id,store_id,parent_id,name,slug,position,depth,status,created_at,updated_at) VALUES('${CATEGORY}','${STORE}',NULL,'Promotion category','promotion-category',0,1,'active','2026-01-01','2026-01-01');
    INSERT INTO saas.catalog_product_categories(store_id,product_id,category_id,position) VALUES('${STORE}','${LINE}','${CATEGORY}',0);
    INSERT INTO saas.catalog_admin_resources(id,store_id,resource_kind,name,slug,config,status,version,created_at,updated_at) VALUES
      ('${BRAND}','${STORE}','brand','Promotion brand','promotion-brand','{}','active',1,'2026-01-01','2026-01-01'),
      ('${COLLECTION}','${STORE}','collection','Promotion collection','promotion-collection','{}','active',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.catalog_admin_resource_products(store_id,resource_id,product_id,position) VALUES
      ('${STORE}','${BRAND}','${LINE}',0),('${STORE}','${COLLECTION}','${LINE}',0);
    INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,created_at,updated_at) VALUES('${LINE}','${STORE}','active','Promotion','Customer','promotion-customer@test.invalid','2026-01-01','2026-01-01');
    INSERT INTO saas.customer_tags(id,store_id,name,color,created_at,updated_at) VALUES('${LINE}','${STORE}','Promotion tag','#111111','2026-01-01','2026-01-01');
    INSERT INTO saas.customer_segments(id,store_id,name,created_at,updated_at) VALUES('${LINE}','${STORE}','Promotion segment','2026-01-01','2026-01-01');
    INSERT INTO saas.customer_tag_assignments(store_id,customer_id,tag_id,assigned_at) VALUES('${STORE}','${LINE}','${LINE}','2026-01-01');
    INSERT INTO saas.customer_segment_memberships(store_id,customer_id,segment_id,assigned_at) VALUES('${STORE}','${LINE}','${LINE}','2026-01-01');
    INSERT INTO saas.payment_methods(id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,position,config,version,created_at,updated_at) VALUES
      ('${PAYMENT_METHOD}','${STORE}','cash_on_delivery',NULL,NULL,'Promotion payment','active',NULL,9000,'{}',1,'2026-01-01','2026-01-01'),
      ('${DISABLED_PAYMENT_METHOD}','${STORE}','bank_transfer',NULL,NULL,'Disabled promotion payment','disabled',NULL,9001,'{}',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at)
    VALUES('${LINE}','${STORE}','shipping_setting','Standart kargo','{"regions":["TR"],"estimatedDays":3}'::jsonb,'active',1,'2026-01-01','2026-01-01');`);
  seedPromotions(box);
}
function seedLegacyBefore126(box) {
  psql(box, `INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
    VALUES('${LEGACY_STORE}','Legacy Promotions','legacy-promotions','active','tr','TRY','starter','2026-01-01','2026-01-01');
    INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,archived_at,created_at,updated_at) VALUES
      ('${LEGACY_PERCENT}','${LEGACY_STORE}','discount','Legacy percent','{"discountType":"percent","value":12.34,"minimumOrderCents":1.0,"usageLimit":1.0}'::jsonb,'active',1,NULL,'2026-09-04T12:00:00.123456Z','2026-09-04T12:00:00.123456Z'),
      ('${LEGACY_FIXED}','${LEGACY_STORE}','discount','Legacy fixed','{"discountType":"fixed","value":1.0,"code":"legacy_code"}'::jsonb,'active',1,NULL,'2026-09-04T12:00:00.123789Z','2026-09-04T12:00:00.123789Z'),
      ('${LEGACY_INVALID}','${LEGACY_STORE}','discount','Legacy invalid','{"discountType":"percent","value":"not-a-number"}'::jsonb,'active',1,NULL,'2026-09-04T12:00:00.124Z','2026-09-04T12:00:00.124Z'),
      ('${LEGACY_ARCHIVED}','${LEGACY_STORE}','discount','Legacy archived','{"discountType":"fixed","value":10,"code":"ARCHIVED_PRE126"}'::jsonb,'archived',1,'2026-09-04T12:00:00.124Z','2026-09-04T12:00:00.124Z','2026-09-04T12:00:00.124Z'),
      ('${LEGACY_GENERAL}','${LEGACY_STORE}','general_setting','Legacy general','{"timezone":"UTC"}'::jsonb,'active',1,NULL,'2026-09-04T12:00:00.125Z','2026-09-04T12:00:00.125Z');`);
}
function seedAuthority(box) {
  psql(box, `
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
    VALUES('${INACTIVE_STORE}','Inactive Promotions Studio','inactive-promotions-studio','suspended','tr','TRY','starter','2026-01-01','2026-01-01');
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
      ('${ACTORS.store_owner.principal}','https://issuer.test','promotion-owner','promotion-owner@test.invalid',true,'2026-01-01','2026-01-01'),
      ('${ACTORS.admin.principal}','https://issuer.test','promotion-admin','promotion-admin@test.invalid',true,'2026-01-01','2026-01-01'),
      ('${ACTORS.editor.principal}','https://issuer.test','promotion-editor','promotion-editor@test.invalid',true,'2026-01-01','2026-01-01'),
      ('${ACTORS.analyst.principal}','https://issuer.test','promotion-analyst','promotion-analyst@test.invalid',true,'2026-01-01','2026-01-01'),
      ('${ACTORS.revoked.principal}','https://issuer.test','promotion-revoked','promotion-revoked@test.invalid',true,'2026-01-01','2026-01-01'),
      ('${ACTORS.waiting.principal}','https://issuer.test','promotion-waiting','promotion-waiting@test.invalid',true,'2026-01-01','2026-01-01'),
      ('${ACTORS.other.principal}','https://issuer.test','promotion-other','promotion-other@test.invalid',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
      ('${ACTORS.store_owner.membership}','${ACTORS.store_owner.principal}','${STORE}','store_owner','active','2026-01-01','2026-01-01'),
      ('${ACTORS.admin.membership}','${ACTORS.admin.principal}','${STORE}','admin','active','2026-01-01','2026-01-01'),
      ('${ACTORS.editor.membership}','${ACTORS.editor.principal}','${STORE}','editor','active','2026-01-01','2026-01-01'),
      ('${ACTORS.analyst.membership}','${ACTORS.analyst.principal}','${STORE}','analyst','active','2026-01-01','2026-01-01'),
      ('${ACTORS.revoked.membership}','${ACTORS.revoked.principal}','${STORE}','admin','revoked','2026-01-01','2026-01-01'),
      ('${ACTORS.waiting.membership}','${ACTORS.waiting.principal}','${STORE}','admin','active','2026-01-01','2026-01-01'),
      ('${ACTORS.other.membership}','${ACTORS.other.principal}','${OTHER_STORE}','store_owner','active','2026-01-01','2026-01-01');
    INSERT INTO saas.plans(id,plan_code,version,status,valid_from,valid_until,created_at,updated_at) VALUES
      ('${PLAN}','promotion_test',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01'),
      ('${DISABLED_PLAN}','promotion_disabled',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01');
    ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable;
    INSERT INTO saas.plan_features(plan_id,feature_key,feature_ordinal,enabled) VALUES
      ('${PLAN}','promotions',10,true),('${DISABLED_PLAN}','promotions',10,false);
    ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable;
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at) VALUES
      ('34000000-0000-4000-8000-000000000126','${STORE}','${PLAN}','promotion_test',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01'),
      ('34000000-0000-4000-8000-000000000127','${OTHER_STORE}','${DISABLED_PLAN}','promotion_disabled',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01');
  `);
}
function seedQuoteSource(box) {
  psql(box, `INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)
    VALUES('62000000-0000-4000-8000-000000000126','${STORE}','${STOREFRONT_HOST}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
    UPDATE saas.payment_methods SET config='{"instructions":"Teslimatta odeme yapin."}'::jsonb WHERE store_id='${STORE}' AND id='${PAYMENT_METHOD}';
    UPDATE saas.merchant_admin_records SET config='{"regions":["TR"],"estimatedDays":3,"shippingPriceCents":40}'::jsonb WHERE store_id='${STORE}' AND id='${LINE}';
    INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)
    VALUES('${QUOTE_CART}','${STORE}','active',1,'2026-09-06T00:00:00.000Z','2026-09-04T00:00:00.000Z','2026-09-04T00:00:00.000Z');
    INSERT INTO saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at)
    VALUES('${QUOTE_CART}','${STORE}','promotion-quote','${QUOTE_CART_DIGEST}','2026-09-06T00:00:00.000Z');
    INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at)
    VALUES('${QUOTE_CART}','${STORE}','${LINE}','${LINE}',3,100,9,'2026-09-04T00:00:00.000Z','2026-09-04T00:00:00.000Z');`);
}
function authority(role, store = STORE, plan = PLAN) {
  const actor = ACTORS[role];
  return { store, principal: actor.principal, membership: actor.membership, plan, planCode: plan === PLAN ? "promotion_test" : "promotion_disabled", planVersion: 1 };
}
function authorityArguments(role, store = STORE, plan = PLAN, now = "2026-09-05T00:00:00Z") {
  const value = authority(role, store, plan);
  return `'${value.store}','${value.principal}','${value.membership}','${value.plan}','${value.planCode}',${value.planVersion},'${now}'`;
}
function appScalar(box, source) { return scalar(box, `SET ROLE celebix_saas_app; ${source}; RESET ROLE`); }
function hostScalar(box, source) { return scalar(box, `SET ROLE celebix_saas_host_resolver; ${source}; RESET ROLE`); }
function quoteV2(box, codes = [], transactionMode = "") {
  const invocation = `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.public_checkout_quote_v2('${STOREFRONT_HOST}','2026-09-05T00:00:00.000Z','cart','[{"keyId":"promotion-quote","digest":"${QUOTE_CART_DIGEST}"}]'::jsonb,'[]'::jsonb,${sqlTextArray(codes)},'{"firstTouch":{"source":"unknown","medium":"unknown"},"lastTouch":{"source":"unknown","medium":"unknown"},"landingPathGroup":"/unknown","deviceGroup":"unknown"}'::jsonb)`;
  return JSON.parse(transactionMode === "read_only"
    ? scalar(box, `BEGIN TRANSACTION READ ONLY; SET LOCAL ROLE celebix_saas_host_resolver; ${invocation}; COMMIT`)
    : hostScalar(box, invocation));
}
function seedHostedV2Provider(box) {
  const sealed=JSON.stringify({algorithm:"A256GCM",ciphertext:"AA",iv:"AAAAAAAAAAAAAAAA",keyId:"hosted-v2-profile",tag:"AAAAAAAAAAAAAAAAAAAAAA",version:1});
  psql(box,`INSERT INTO saas.merchant_provider_execution_authorities(provider_code,capability,environment,adapter_version,evidence_digest,readiness,enabled,approved_at)
      VALUES('paytr_iframe','payment_processing','test',1,'sha256:${"8".repeat(64)}','sandbox_ready',true,'2026-09-05T00:00:00.000Z')
      ON CONFLICT(provider_code,environment) DO UPDATE SET capability=EXCLUDED.capability,adapter_version=EXCLUDED.adapter_version,evidence_digest=EXCLUDED.evidence_digest,readiness=EXCLUDED.readiness,enabled=true,approved_at=EXCLUDED.approved_at;
    INSERT INTO saas.merchant_provider_profiles(id,store_id,provider_code,capability,public_config,masked_account_reference,sealed_credentials,credential_digest,credential_key_id,credential_schema_version,credential_version,status,version,last_validated_at,created_at,updated_at,execution_environment,execution_adapter_version,execution_evidence_digest,validation_environment,validation_adapter_version)
      VALUES('${HOSTED_V2_PROFILE}','${STORE}','paytr_iframe','payment_processing','{"environment":"test"}','hosted-v2-***','${sealed}'::jsonb,'${"7".repeat(64)}','hosted-v2-profile',1,1,'active',1,'2026-09-05T00:00:00.000Z','2026-09-05T00:00:00.000Z','2026-09-05T00:00:00.000Z','test',1,'sha256:${"8".repeat(64)}','test',1);
    INSERT INTO saas.payment_methods(id,store_id,kind,profile_id,provider_code,label,state,position,config,version,created_at,updated_at)
      VALUES('${HOSTED_V2_METHOD}','${STORE}','provider','${HOSTED_V2_PROFILE}','paytr_iframe','Hosted V2 card','active',9100,'{"environment":"test","locale":"tr","threeDSecure":"provider_managed","installmentMode":"all","maxInstallment":0}',1,'2026-09-05T00:00:00.000Z','2026-09-05T00:00:00.000Z')`);
}
function hostedV2Delivery(base,email=null,phone=null) { return {contact:{firstName:"Hosted",lastName:"Customer",email:email??`hosted-${base}@test.invalid`,phone:phone??`+90556${String(base).padStart(7,"0").slice(-7)}`},shippingAddress:{line1:"Hosted V2 Caddesi 1",city:"Istanbul",country:"TR"}}; }
function hostedAuthorityV2(box,{base,cartId=QUOTE_CART,digest=QUOTE_CART_DIGEST,keyId="promotion-quote",codes=[],customerCandidates=[],delivery=null,orderId=null,prospectiveCustomerId=null,operationId=null,hostname=STOREFRONT_HOST,now="2026-09-05T00:00:00.000Z"}) {
  const selectedDelivery=delivery??hostedV2Delivery(base), selectedOrder=orderId??task4Uuid(base), selectedCustomer=prospectiveCustomerId??task4Uuid(base+1), selectedOperation=operationId??task4Uuid(base+2);
  const invocation=`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.public_storefront_hosted_checkout_authority_v2('${hostname}','${now}','cart','[{"keyId":"${keyId}","digest":"${digest}"}]'::jsonb,1,'${JSON.stringify(selectedDelivery).replaceAll("'","''")}'::jsonb,'${HOSTED_V2_METHOD}','${JSON.stringify(customerCandidates).replaceAll("'","''")}'::jsonb,'${JSON.stringify(codes).replaceAll("'","''")}'::jsonb,'${selectedOrder}','${selectedCustomer}','${selectedOperation}')`;
  return {orderId:selectedOrder,prospectiveCustomerId:selectedCustomer,operationId:selectedOperation,delivery:selectedDelivery,invocation,result:JSON.parse(hostScalar(box,invocation))};
}
function hostedBeginV2(box,{base,prepared,cartId,digest,keyId="task4-offline",codes=[],customerCandidates=[],fingerprint=null,expectedEvaluatorDigest=null,now="2026-09-05T00:00:00.000Z"}) {
  const ids={operationId:task4Uuid(base),sessionId:task4Uuid(base+1),addressId:task4Uuid(base+2),eventId:task4Uuid(base+3),receiptId:task4Uuid(base+4),customerCredentialId:task4Uuid(base+5)};
  const selectedFingerprint=fingerprint??createHash("sha256").update(`hosted-v2-begin:${base}`).digest("hex"), callback=createHash("sha256").update(`hosted-v2-callback:${base}`).digest("hex"), authority=prepared.result.result;
  const invocation=`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.public_storefront_hosted_checkout_begin_v2('${STOREFRONT_HOST}','${now}','cart','[{"keyId":"${keyId}","digest":"${digest}"}]'::jsonb,1,'${JSON.stringify(prepared.delivery).replaceAll("'","''")}'::jsonb,'${HOSTED_V2_METHOD}','${authority.authorityDigest}','${ids.operationId}','${selectedFingerprint}','${ids.sessionId}','${callback}','${prepared.orderId}','${authority.customerId}','${ids.addressId}','${ids.eventId}','${ids.receiptId}','${ids.customerCredentialId}','hosted-pay-${base}','${"1".repeat(64)}','hosted-receipt-${base}','${"2".repeat(64)}','hosted-customer-${base}','${"3".repeat(64)}','${JSON.stringify(customerCandidates).replaceAll("'","''")}'::jsonb,'${JSON.stringify(codes).replaceAll("'","''")}'::jsonb,'${expectedEvaluatorDigest??authority.evaluatorAuthorityDigest}')`;
  return {ids,invocation,result:JSON.parse(hostScalar(box,invocation))};
}
function task4Uuid(value) { return `95000000-0000-4000-8000-${String(value).padStart(12,"0")}`; }
function seedOfflineV2Cart(box,{cartId,digest,lineCount=1,quantity=3,seriesOffset=0}) {
  psql(box,`INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)
    VALUES('${cartId}','${STORE}','active',1,'2026-09-06T00:00:00.000Z','2026-09-04T00:00:00.000Z','2026-09-04T00:00:00.000Z');
    INSERT INTO saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at)
    VALUES('${cartId}','${STORE}','task4-offline','${digest}','2026-09-06T00:00:00.000Z');
    ${lineCount===1
      ? `INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at) VALUES('${cartId}','${STORE}','${LINE}','${LINE}',${quantity},100,0,'2026-09-04','2026-09-04');`
      : `INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) SELECT ('96000000-0000-4000-8000-'||pg_catalog.lpad((${seriesOffset}+series)::text,12,'0'))::uuid,'${STORE}','offline-v2-'||(${seriesOffset}+series),'Offline V2 '||(${seriesOffset}+series),'active','TRY','2026-09-04','2026-09-04' FROM pg_catalog.generate_series(1,${lineCount}) series;
        ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
        INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,created_at,updated_at) SELECT ('97000000-0000-4000-8000-'||pg_catalog.lpad((${seriesOffset}+series)::text,12,'0'))::uuid,('96000000-0000-4000-8000-'||pg_catalog.lpad((${seriesOffset}+series)::text,12,'0'))::uuid,'${STORE}','Offline V2 variant '||(${seriesOffset}+series),100,40,false,0,'active','2026-09-04','2026-09-04' FROM pg_catalog.generate_series(1,${lineCount}) series;
        ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;
        INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at) SELECT '${cartId}','${STORE}',('96000000-0000-4000-8000-'||pg_catalog.lpad((${seriesOffset}+series)::text,12,'0'))::uuid,('97000000-0000-4000-8000-'||pg_catalog.lpad((${seriesOffset}+series)::text,12,'0'))::uuid,1,100,series-1,'2026-09-04','2026-09-04' FROM pg_catalog.generate_series(1,${lineCount}) series;`}`);
}
function completeOfflineV2(box,{base,digest,codes=[],fingerprint="6".repeat(64),email=null,customerCandidates=[]}) {
  const ids={operationId:task4Uuid(base),orderId:task4Uuid(base+1),customerId:task4Uuid(base+2),addressId:task4Uuid(base+3),eventId:task4Uuid(base+4),receiptId:task4Uuid(base+5),customerCredentialId:task4Uuid(base+6),cartId:task4Uuid(base+7)};
  const selectedEmail=email??`offline-${base}@test.invalid`;
  const receiptDigest=createHash("sha256").update(`task4-offline-receipt:${base}`).digest("hex");
  const customerDigest=createHash("sha256").update(`task4-offline-customer:${base}`).digest("hex");
  const delivery={contact:{firstName:"Ada",lastName:"Lovelace",email:selectedEmail,phone:`+90555${String(base).padStart(7,"0").slice(-7)}`},shippingAddress:{line1:"Task4 Caddesi 1",city:"Istanbul",country:"TR"}};
  const invocation=`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.public_checkout_complete_v2('${STOREFRONT_HOST}','2026-09-05T00:00:00.000Z','cart','[{"keyId":"task4-offline","digest":"${digest}"}]'::jsonb,'${JSON.stringify(customerCandidates).replaceAll("'","''")}'::jsonb,'${ids.operationId}','${fingerprint}',1,'${JSON.stringify(delivery).replaceAll("'","''")}'::jsonb,'cash_on_delivery','${ids.orderId}','${ids.customerId}','${ids.addressId}','${ids.eventId}','${ids.receiptId}','receipt-v2','${receiptDigest}','2026-09-05T23:00:00.000Z','${ids.customerCredentialId}','customer-v2','${customerDigest}','2026-10-05T00:00:00.000Z',${sqlTextArray(codes)})`;
  return {ids,invocation,result:JSON.parse(hostScalar(box,invocation))};
}
function completeOfflineV1(box,{base,digest,fingerprint="5".repeat(64),email,customerCandidates=[]}) {
  const ids={operationId:task4Uuid(base),orderId:task4Uuid(base+1),customerId:task4Uuid(base+2),addressId:task4Uuid(base+3),eventId:task4Uuid(base+4),receiptId:task4Uuid(base+5),customerCredentialId:task4Uuid(base+6),cartId:task4Uuid(base+7)};
  const receiptDigest=createHash("sha256").update(`task4-offline-v1-receipt:${base}`).digest("hex");
  const customerDigest=createHash("sha256").update(`task4-offline-v1-customer:${base}`).digest("hex");
  const delivery={contact:{firstName:"Ada",lastName:"Lovelace",email,phone:`+90555${String(1000).padStart(7,"0").slice(-7)}`},shippingAddress:{line1:"Task4 Caddesi 1",city:"Istanbul",country:"TR"}};
  const invocation=`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.public_checkout_complete('${STOREFRONT_HOST}','2026-09-05T00:00:00.000Z','cart','[{"keyId":"task4-offline","digest":"${digest}"}]'::jsonb,'${JSON.stringify(customerCandidates).replaceAll("'","''")}'::jsonb,'${ids.operationId}','${fingerprint}',1,'${JSON.stringify(delivery).replaceAll("'","''")}'::jsonb,'cash_on_delivery','${ids.orderId}','${ids.customerId}','${ids.addressId}','${ids.eventId}','${ids.receiptId}','receipt-v1','${receiptDigest}','2026-09-05T23:00:00.000Z','${ids.customerCredentialId}','customer-v1','${customerDigest}','2026-10-05T00:00:00.000Z')`;
  return {ids,receiptDigest,customerDigest,invocation,result:JSON.parse(hostScalar(box,invocation))};
}
function batchCreateFingerprint(box, { promotionId, count, prefix, codeLength, perCustomerUsage, expiresAt = null, store = STORE }) {
  const expires = expiresAt === null ? "NULL" : `'${expiresAt}'`;
  return scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('code_batch','${store}',pg_catalog.jsonb_build_object('promotionId','${promotionId}'::uuid,'count',${count},'prefix','${prefix}','codeLength',${codeLength},'perCustomerUsage',${perCustomerUsage},'expiresAt',${expires}))`);
}
function createBatch(box, { role = "store_owner", operationId, batchId, promotionId, count, prefix, codeLength, perCustomerUsage, expiresAt = null, now = "2026-09-05T00:00:00.000Z", fingerprint = null, store = STORE, plan = PLAN }) {
  const boundFingerprint = fingerprint ?? batchCreateFingerprint(box, { promotionId, count, prefix, codeLength, perCustomerUsage, expiresAt, store });
  const expires = expiresAt === null ? "NULL::timestamptz" : `'${expiresAt}'::timestamptz`;
  return JSON.parse(appScalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_create_code_batch_v1(${authorityArguments(role, store, plan, now)},'${operationId}','${boundFingerprint}','${batchId}','${promotionId}',${count},'${prefix}',${codeLength},${perCustomerUsage},${expires})`));
}
function statusBatch(box, { role = "store_owner", operationId, batchId, expectedVersion, nextStatus, now = "2026-09-05T00:00:01.000Z", fingerprint = null, store = STORE, plan = PLAN }) {
  const boundFingerprint = fingerprint ?? scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('code_batch_status','${store}',pg_catalog.jsonb_build_object('batchId','${batchId}'::uuid,'expectedVersion',${expectedVersion},'nextStatus','${nextStatus}'))`);
  return JSON.parse(appScalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_code_batch_status_v1(${authorityArguments(role, store, plan, now)},'${operationId}','${boundFingerprint}','${batchId}',${expectedVersion},'${nextStatus}')`));
}
function batchList(box, role, promotionId, limit = 100, cursor = null, now = "2026-09-05T00:00:10.000Z", store = STORE, plan = PLAN) {
  const values = cursor === null ? "NULL::timestamptz,NULL::timestamptz,NULL::uuid" : `'${cursor.snapshotAt}'::timestamptz,'${cursor.createdAt}'::timestamptz,'${cursor.id}'::uuid`;
  return JSON.parse(appScalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_code_batch_list_v1(${authorityArguments(role, store, plan, now)},'${promotionId}',${limit},${values})`));
}
function checkProjection(box, functionName, role, document, promotionId = null, expectedVersion = null) {
  const encodedRule = JSON.stringify(document).replaceAll("'", "''");
  const identity = promotionId === null ? "NULL::uuid,NULL::bigint" : `'${promotionId}'::uuid,${expectedVersion}`;
  return JSON.parse(appScalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.${functionName}(${authorityArguments(role)},${identity},'${encodedRule}'::jsonb)`));
}
function semanticCreateFingerprintExpression(name, document = validRuleDocument()) {
  return `saas.promotion_operation_fingerprint_v2('create','${STORE}',pg_catalog.jsonb_build_object('name','${name.replaceAll("'", "''")}','ruleDocument','${JSON.stringify(document).replaceAll("'", "''")}'::jsonb))`;
}
function semanticCreateFingerprint(box, name, document = validRuleDocument()) { return scalar(box,`SELECT ${semanticCreateFingerprintExpression(name,document)}`); }
function reservationOperationResult(groupId, members, status = "reserved", overrides = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    reservationGroupId: groupId,
    status,
    currency: "TRY",
    discountTotalMinor: members.reduce((total, member) => total + member.discountMinor, 0),
    expiresAt: "2026-09-06T00:00:00.000Z",
    evaluatorFingerprint: "b".repeat(64),
    reservations: members.map((member) => ({ promotionId: member.promotionId, reservationId: member.reservationId, promotionVersion: member.promotionVersion ?? 1, normalizedCode: member.normalizedCode ?? null, discountMinor: member.discountMinor })),
    ...overrides,
  }).replaceAll("'", "''");
}
function redemptionOperationResult(reservationGroupId, redemptionGroupId, orderId, members, overrides = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    reservationGroupId,
    redemptionGroupId,
    status: "committed",
    orderId,
    currency: "TRY",
    discountTotalMinor: members.reduce((total, member) => total + member.discountMinor, 0),
    evaluatorFingerprint: "b".repeat(64),
    redemptions: members.map((member) => ({ promotionId: member.promotionId, reservationId: member.reservationId, redemptionId: member.redemptionId, promotionVersion: member.promotionVersion ?? 1, normalizedCode: member.normalizedCode ?? null, discountMinor: member.discountMinor })),
    ...overrides,
  }).replaceAll("'", "''");
}
function frozenReservationSnapshot({ promotionId, promotionVersion = 1, promotionName = "Frozen promotion fixture", ruleDocument = validRuleDocument(), normalizedCode = null, discountMinor, evaluatedAt = "2026-09-05T00:00:00.000Z", lineId = LINE, position = 0, quantity = 1, grossUnitMinor = null }) {
  const gross = grossUnitMinor ?? Math.max(100, discountMinor);
  return JSON.stringify({
    promotionId,
    promotionVersion,
    promotionName,
    couponCode: normalizedCode,
    benefit: ruleDocument.benefit,
    targets: ruleDocument.targets,
    discountLines: [{ lineId, position, discountMinor, capturedRanges: [{ startOrdinal: 0, quantity, grossUnitMinor: gross, discountUnitMinor: discountMinor / quantity, kind: "sale" }] }],
    shippingDiscountMinor: 0,
    giftLines: [],
    discountTotalMinor: discountMinor,
    currency: "TRY",
    evaluatedAt,
  }).replaceAll("'", "''");
}
function boundaryOrderSnapshot(rangeCount) {
  const discountLines=Array.from({length:20},(_,position)=>{
    let discountMinor=0;
    const capturedRanges=Array.from({length:rangeCount},(_,startOrdinal)=>{
      const discountUnitMinor=startOrdinal%2+1; discountMinor+=discountUnitMinor;
      return {startOrdinal,quantity:1,grossUnitMinor:8000000000,discountUnitMinor,kind:"sale"};
    });
    return {lineId:`bbbbbbbb-bbbb-4bbb-8bbb-${String(position+1).padStart(12,"0")}`,position,discountMinor,capturedRanges};
  });
  return {
    promotionId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",promotionVersion:1,promotionName:"Captured test",couponCode:"SAVE20",
    benefit:{kind:"percentage",percentageBps:1000},targets:{mode:"all",include:[],exclude:[]},discountLines,
    shippingDiscountMinor:0,giftLines:[],discountTotalMinor:discountLines.reduce((total,line)=>total+line.discountMinor,0),currency:"TRY",evaluatedAt:"2026-09-05T10:00:00.000Z",
  };
}
function frozenReservationSnapshotFor(box, options) {
  const binding = JSON.parse(scalar(box, `SELECT pg_catalog.jsonb_build_object('promotionName',promotion.name,'ruleDocument',version_row.rule_document) FROM saas.promotions promotion JOIN saas.promotion_versions version_row ON version_row.store_id=promotion.store_id AND version_row.promotion_id=promotion.id AND version_row.version=${options.promotionVersion ?? 1} WHERE promotion.store_id='${options.store ?? STORE}' AND promotion.id='${options.promotionId}'`));
  return frozenReservationSnapshot({ ...options, ...binding });
}
function settlementFingerprint(box, kind, payload, store = STORE) {
  return scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('${kind}','${store}','${JSON.stringify(payload).replaceAll("'", "''")}'::jsonb)`);
}
function reserveGroup(box, { operationId, sourceKind = "offline_checkout", sourceReference, evaluatorContext = context(), now = "2026-09-05T00:00:00.000Z", fingerprint = null, store = STORE }) {
  const payload = { sourceKind, sourceReference, evaluatorContext };
  const boundFingerprint = fingerprint ?? settlementFingerprint(box, "reserve", payload, store);
  return JSON.parse(scalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_reserve_group_v1('${store}','${operationId}','${boundFingerprint}','${sourceKind}','${sourceReference}','${JSON.stringify(evaluatorContext).replaceAll("'", "''")}'::jsonb,'${now}')`));
}
function reserveGroupCall(box, options) {
  const sourceKind = options.sourceKind ?? "offline_checkout", evaluatorContext = options.evaluatorContext ?? context(), store = options.store ?? STORE;
  const fingerprint = options.fingerprint ?? settlementFingerprint(box,"reserve",{sourceKind,sourceReference:options.sourceReference,evaluatorContext},store);
  return `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_reserve_group_v1('${store}','${options.operationId}','${fingerprint}','${sourceKind}','${options.sourceReference}','${JSON.stringify(evaluatorContext).replaceAll("'", "''")}'::jsonb,'${options.now ?? "2026-09-05T00:00:00.000Z"}')`;
}
function releaseGroup(box, { operationId, reservationGroupId, now = "2026-09-05T00:00:01.000Z", fingerprint = null, store = STORE }) {
  const boundFingerprint = fingerprint ?? settlementFingerprint(box, "release", { reservationGroupId }, store);
  return JSON.parse(scalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_release_reservation_group_v1('${store}','${operationId}','${boundFingerprint}','${reservationGroupId}','${now}')`));
}
function commitGroup(box, { operationId, reservationGroupId, orderId, now = "2026-09-05T00:00:01.000Z", fingerprint = null, store = STORE }) {
  const boundFingerprint = fingerprint ?? settlementFingerprint(box, "commit", { reservationGroupId, orderId }, store);
  return JSON.parse(scalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_commit_reservation_group_v1('${store}','${operationId}','${boundFingerprint}','${reservationGroupId}','${orderId}','${now}')`));
}
function recoverSettlement(box, { operationId, kind, fingerprint, now = "2026-09-05T00:00:02.000Z", store = STORE }) {
  return JSON.parse(scalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_recover_settlement_operation_v1('${store}','${now}','${operationId}','${kind}','${fingerprint}')`));
}
function insertReservationFixture(box, { operationId, reservationId, promotionId, codeId, normalizedCode, customerId, expiresAt = "2026-09-05T00:15:00.000Z", fingerprintCharacter = "1", sourceKind = "offline_checkout", sourceReference = reservationId }) {
  const result = reservationOperationResult(operationId, [{ promotionId, reservationId, normalizedCode, discountMinor: 10 }], "reserved", { expiresAt });
  const snapshot = frozenReservationSnapshotFor(box, { promotionId, normalizedCode, discountMinor: 10, lineId: reservationId });
  psql(box, `BEGIN;
    INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at)
    VALUES('${operationId}','${STORE}','${operationId}','reserve',repeat('${fingerprintCharacter}',64),'reservation_group','${operationId}','${result}'::jsonb,'2026-09-05T00:00:00.000Z');
    INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,code_id,normalized_code,reservation_group_id,customer_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_uses,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at)
    VALUES('${reservationId}','${STORE}','${promotionId}',1,'${codeId}','${normalizedCode}','${operationId}','${customerId}','${operationId}',repeat('${fingerprintCharacter}',64),'${sourceKind}','${sourceReference}',1,10,10,'TRY','${snapshot}'::jsonb,repeat('b',64),'reserved','${expiresAt}','2026-09-05T00:00:00.000Z','2026-09-05T00:00:00.000Z');
    COMMIT;`);
}
function commitReservationFixture(box, { reservationOperationId, reservationId, redemptionOperationId, redemptionId, orderId, promotionId, codeId, normalizedCode, customerId }) {
  const result = redemptionOperationResult(reservationOperationId, redemptionOperationId, orderId, [{ promotionId, reservationId, redemptionId, normalizedCode, discountMinor: 10 }]);
  const fingerprint = settlementFingerprint(box,"commit",{reservationGroupId:reservationOperationId,orderId});
  psql(box, `BEGIN;
    INSERT INTO saas.orders(id,store_id,order_number,source,customer_id,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at)
    VALUES('${orderId}','${STORE}','SLICE-C-${orderId.slice(-6)}','storefront','${customerId}','Slice C','slice-c@test.invalid','TRY',100,0,10,90,'pending','pending','{}','2026-09-05T00:00:01.000Z','2026-09-05T00:00:01.000Z');
    INSERT INTO saas.order_items(id,store_id,order_id,position,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
    VALUES('${reservationId}','${STORE}','${orderId}',0,'Slice C item',100,1,10,90,'2026-09-05T00:00:01.000Z');
    UPDATE saas.promotion_usage_reservations SET status='committed',updated_at='2026-09-05T00:00:01.000Z' WHERE store_id='${STORE}' AND id='${reservationId}';
    INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at)
    VALUES('${redemptionOperationId}','${STORE}','${redemptionOperationId}','commit','${fingerprint}','redemption_group','${redemptionOperationId}','${result}'::jsonb,'2026-09-05T00:00:01.000Z');
    INSERT INTO saas.promotion_redemptions(id,store_id,promotion_id,reservation_id,reservation_group_id,redemption_group_id,operation_id,operation_fingerprint,promotion_version,code_id,normalized_code,order_id,customer_id,discount_minor,currency,evaluator_fingerprint,created_at)
    VALUES('${redemptionId}','${STORE}','${promotionId}','${reservationId}','${reservationOperationId}','${redemptionOperationId}','${redemptionOperationId}','${fingerprint}',1,'${codeId}','${normalizedCode}','${orderId}','${customerId}',10,'TRY',repeat('b',64),'2026-09-05T00:00:01.000Z');
    INSERT INTO saas.order_promotion_snapshots(id,store_id,order_id,promotion_id,redemption_id,promotion_version,normalized_code,currency,discount_minor,evaluator_fingerprint,snapshot,created_at)
    SELECT '${redemptionId}','${STORE}','${orderId}',promotion_id,'${redemptionId}',promotion_version,normalized_code,currency,discount_minor,evaluator_fingerprint,evaluator_snapshot,'2026-09-05T00:00:01.000Z'
    FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND id='${reservationId}';
    INSERT INTO saas.order_discount_allocations(id,store_id,order_id,snapshot_id,line_id,line_position,discount_minor,created_at)
    VALUES('${redemptionOperationId}','${STORE}','${orderId}','${redemptionId}','${reservationId}',0,10,'2026-09-05T00:00:01.000Z');
    COMMIT;`);
}
function createCall(box, role, promotionId, operationId, name, document = validRuleDocument(), store = STORE, plan = PLAN) {
  const encodedName = name.replaceAll("'", "''"), encodedRule = JSON.stringify(document).replaceAll("'", "''");
  return `SELECT outcome||':'||COALESCE(result_payload->>'id','') FROM saas.promotion_create_v1(${authorityArguments(role, store, plan)},'${operationId}','${semanticCreateFingerprint(box,name,document)}','${promotionId}','${encodedName}','${encodedRule}'::jsonb)`;
}
function updateCall(box, role, promotionId, operationId, expectedVersion, name, document, now = "2026-09-05T00:00:00Z") {
  const encodedName = name.replaceAll("'", "''"), encodedRule = JSON.stringify(document).replaceAll("'", "''");
  const fingerprint = scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('update','${STORE}',pg_catalog.jsonb_build_object('id','${promotionId}'::uuid,'expectedVersion',${expectedVersion},'name','${encodedName}','ruleDocument','${encodedRule}'::jsonb))`);
  const value = authority(role);
  return `SELECT outcome||':'||COALESCE(result_payload->>'id','') FROM saas.promotion_update_v1('${value.store}','${value.principal}','${value.membership}','${value.plan}','${value.planCode}',${value.planVersion},'${now}','${operationId}','${fingerprint}','${promotionId}',${expectedVersion},'${encodedName}','${encodedRule}'::jsonb)`;
}
function lifecycleCall(box, role, promotionId, operationId, expectedVersion, nextStatus, now = "2026-09-05T00:00:00Z") {
  const kind = nextStatus === "archived" ? "archive" : "lifecycle";
  const fingerprint = scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('${kind}','${STORE}',pg_catalog.jsonb_build_object('id','${promotionId}'::uuid,'expectedVersion',${expectedVersion},'nextStatus','${nextStatus}'))`);
  const value = authority(role);
  return `SELECT outcome||':'||COALESCE(result_payload->>'id','') FROM saas.promotion_lifecycle_v1('${value.store}','${value.principal}','${value.membership}','${value.plan}','${value.planCode}',${value.planVersion},'${now}','${operationId}','${fingerprint}','${promotionId}',${expectedVersion},'${nextStatus}')`;
}
function sqlTextArray(values) { return `ARRAY[${values.map((value) => `'${value.replaceAll("'", "''")}'`).join(",")}]::text[]`; }
function duplicateCall(box, role, destinationId, sourceId, operationId, expectedVersion, name, codes = [], now = "2026-09-05T00:00:00Z") {
  const encodedName = name.replaceAll("'", "''");
  const fingerprint = scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('duplicate','${STORE}',pg_catalog.jsonb_build_object('sourcePromotionId','${sourceId}'::uuid,'expectedVersion',${expectedVersion},'name','${encodedName}','codes',pg_catalog.to_jsonb(${sqlTextArray(codes)})))`);
  const value = authority(role);
  return `SELECT outcome||':'||COALESCE(result_payload->>'id','') FROM saas.promotion_duplicate_v1('${value.store}','${value.principal}','${value.membership}','${value.plan}','${value.planCode}',${value.planVersion},'${now}','${operationId}','${fingerprint}','${destinationId}','${sourceId}',${expectedVersion},'${encodedName}',${sqlTextArray(codes)})`;
}
function listPage(box, role, filters = {}, cursor = null, now = "2026-09-05T00:00:00Z") {
  const value = authority(role), search = filters.search ?? null, encodedSearch = search === null ? "NULL::text" : `'${search.replaceAll("'", "''")}'`;
  const timestamp = (entry) => entry === null || entry === undefined ? "NULL::timestamptz" : `'${entry}'::timestamptz`;
  const snapshotAt = cursor?.snapshotAt ?? null, afterCreatedAt = cursor?.createdAt ?? null, afterId = cursor?.id ?? null;
  return JSON.parse(appScalar(box, `SELECT result_payload FROM saas.promotion_list_v1('${value.store}','${value.principal}','${value.membership}','${value.plan}','${value.planCode}',${value.planVersion},'${now}',${encodedSearch},${sqlTextArray(filters.effectiveStatuses ?? [])},${sqlTextArray(filters.triggerKinds ?? [])},${sqlTextArray(filters.benefitKinds ?? [])},${sqlTextArray(filters.audienceModes ?? [])},${timestamp(filters.scheduleFrom)},${timestamp(filters.scheduleTo)},${filters.limit ?? 25},${timestamp(snapshotAt)},${timestamp(afterCreatedAt)},${afterId === null ? "NULL::uuid" : `'${afterId}'::uuid`})`));
}
function pickerList(box, role, kind, search = null, limit = 50, cursor = null) {
  const encodedSearch = search === null ? "NULL::text" : `'${search.replaceAll("'", "''")}'`, encodedSort = cursor?.sortKey === undefined ? "NULL::text" : `'${cursor.sortKey.replaceAll("'", "''")}'`, encodedId = cursor?.id === undefined ? "NULL::uuid" : `'${cursor.id}'::uuid`;
  return JSON.parse(appScalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_picker_list_v1(${authorityArguments(role)},'${kind}',${encodedSearch},${limit},${encodedSort},${encodedId})`));
}
function pickerResolve(box, role, kind, ids) {
  const encodedIds = ids.length === 0 ? "ARRAY[]::uuid[]" : `ARRAY[${ids.map((id) => `'${id}'::uuid`).join(",")}]::uuid[]`;
  return JSON.parse(appScalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_picker_resolve_v1(${authorityArguments(role)},'${kind}',${encodedIds})`));
}
function simulateSelected(box, role, selected, overrides = {}, now = "2026-09-05T00:00:00Z") {
  const value = authority(role), selectedPayload = JSON.stringify(selected).replaceAll("'", "''"), payload = JSON.stringify(context(overrides)).replaceAll("'", "''");
  return appScalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_simulate_v1('${value.store}','${value.principal}','${value.membership}','${value.plan}','${value.planCode}',${value.planVersion},'${now}','${selectedPayload}'::jsonb,'${payload}'::jsonb)`);
}
function activate(box, id) { psql(box, `UPDATE saas.promotions SET status=CASE WHEN id='${id}' THEN 'active' ELSE 'paused' END WHERE store_id='${STORE}';`); }
const LINE = "50000000-0000-4000-8000-000000000126";
const BUNDLE_LINE = "50000000-0000-4000-8000-000000000127";
function bundleBenefit(bundlePriceMinor=200) { return {kind:"bundle_price",items:[{variantId:LINE,quantity:3},{variantId:BUNDLE_LINE,quantity:1}],bundlePriceMinor,currency:"TRY"}; }
function bundleCart(quantity=4) { return [{...context().cartLines[0],quantity},{lineId:BUNDLE_LINE,position:1,productId:BUNDLE_LINE,variantId:BUNDLE_LINE,quantity:1,unitPriceMinor:0,unitCostMinor:0,currency:"TRY",categoryIds:[],brandId:null,collectionIds:[]}]; }
function context(overrides = {}) { return {
  storeId: STORE, customerId: null, paidOrderCount: 0, customerSegmentIds: [], customerTagIds: [],
  cartLines: [{ lineId: LINE, position: 0, productId: LINE, variantId: LINE, quantity: 3, unitPriceMinor: 100, unitCostMinor: 40, currency: "TRY", categoryIds: [], brandId: null, collectionIds: [] }],
  shippingMethodId: null, paymentMethodId: null, shippingBeforeDiscountMinor: 40, currency: "TRY",
  storeLocalTime: "2026-09-05T00:00:00.000Z", salesChannel: "storefront", submittedCodes: [], abandonedCart: null, ...overrides,
}; }
function settlementContext(lineId, overrides = {}) {
  return context({ cartLines:[{...context().cartLines[0],lineId}], shippingBeforeDiscountMinor:0, ...overrides });
}
function seedSettlementPromotion(box, { id, name, document = validRuleDocument(), status = "active", pauseOthers = true }) {
  const encodedName=name.replaceAll("'","''"), encoded=JSON.stringify(document).replaceAll("'","''");
  psql(box,`${pauseOthers?`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}';`:""} INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','${encodedName}','${status}',1,'${encoded}'::jsonb,'2026-09-05T00:00:00.000Z','2026-09-05T00:00:00.000Z'); INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES('${id}','${STORE}','${id}',1,'${encoded}'::jsonb,'2026-09-05T00:00:00.000Z')`);
}
function insertSettlementOrder(box,{orderId,lineId,customerId=null,quantity=3,unitPriceMinor=100,discountMinor=30,orderDiscountMinor=null,subtotalMinor=null,shippingMinor=0,createdAt="2026-09-05T04:00:01.000Z",variantId=LINE,extraItems=[]}) {
  const items=[{id:lineId,position:0,quantity,unitPriceMinor,discountMinor,variantId},...extraItems];
  const itemSubtotal=items.reduce((sum,item)=>sum+item.quantity*item.unitPriceMinor,0), subtotal=subtotalMinor??itemSubtotal, discount=orderDiscountMinor??items.reduce((sum,item)=>sum+item.discountMinor,0), total=subtotal+shippingMinor-discount;
  const customer=customerId===null?"NULL":`'${customerId}'`;
  const values=items.map((item)=>`('${item.id}','${STORE}','${orderId}',${item.position},'${item.variantId}','${item.variantId}','Settlement item',${item.unitPriceMinor},${item.quantity},${item.discountMinor},${item.quantity*item.unitPriceMinor-item.discountMinor},'${createdAt}')`).join(",");
  psql(box,`INSERT INTO saas.orders(id,store_id,order_number,source,customer_id,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at) VALUES('${orderId}','${STORE}','SET-${orderId.slice(-8)}','storefront',${customer},'Settlement','settlement@test.invalid','TRY',${subtotal},${shippingMinor},${discount},${total},'pending','pending','{}','${createdAt}','${createdAt}'); INSERT INTO saas.order_items(id,store_id,order_id,position,product_id,variant_id,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at) VALUES ${values}`);
}
function insertHostedSession(box,{sessionId,orderId,store=STORE,createdAt="2026-09-05T04:00:00.000Z",status="active",terminalAt=null}) {
  const holdExpiresAt=new Date(Date.parse(createdAt)+15*60*1000).toISOString(), updatedAt=terminalAt??createdAt, terminal=terminalAt===null?"NULL":`'${terminalAt}'`;
  psql(box,`ALTER TABLE saas.storefront_hosted_checkout_sessions DISABLE TRIGGER ALL;
    INSERT INTO saas.storefront_hosted_checkout_sessions(
      id,store_id,cart_id,intent_id,payment_attempt_id,payment_method_id,profile_id,provider_code,environment,
      credential_version,execution_adapter_version,execution_evidence_digest,order_reference,order_id,customer_id,address_id,event_id,receipt_id,customer_credential_id,
      source_version,commerce_authority_digest,currency,subtotal_minor,shipping_minor,discount_minor,total_minor,delivery_snapshot,item_snapshot,status,safe_code,
      hold_expires_at,terminal_at,version,payment_session_key_id,payment_session_credential_digest,payment_session_expires_at,
      receipt_key_id,receipt_credential_digest,receipt_expires_at,customer_key_id,customer_credential_digest,customer_expires_at,created_at,updated_at
    ) VALUES(
      '${sessionId}','${store}','${sessionId}',NULL,'${sessionId}','${PAYMENT_METHOD}','${sessionId}','paytr_iframe','test',1,1,'sha256:${"1".repeat(64)}',
      'settlement-${sessionId.slice(-8)}','${orderId}','${LINE}','${sessionId}','${sessionId}','${sessionId}','${sessionId}',1,'${"2".repeat(64)}','TRY',300,0,30,270,
      '{}'::jsonb,'[{}]'::jsonb,'${status}','payment_started','${holdExpiresAt}',${terminal},1,
      'settlement','${"3".repeat(64)}','${holdExpiresAt}',
      'settlement','${"4".repeat(64)}','${new Date(Date.parse(createdAt)+24*60*60*1000).toISOString()}',
      'settlement','${"5".repeat(64)}','${new Date(Date.parse(createdAt)+30*24*60*60*1000).toISOString()}','${createdAt}','${updatedAt}');
    ALTER TABLE saas.storefront_hosted_checkout_sessions ENABLE TRIGGER ALL`);
}
function evaluate(box, overrides = {}, now = "2026-09-05T00:00:00.000Z") { return JSON.parse(scalar(box, `SELECT saas.promotion_evaluate_v1('${STORE}','${JSON.stringify(context(overrides)).replaceAll("'", "''")}'::jsonb,'${now}')`)); }
function parseContract(value) { const parser = command(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", "import { parsePromotionEvaluatorResult } from './packages/saas-contracts/src/promotions/index.ts'; const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk); parsePromotionEvaluatorResult(JSON.parse(Buffer.concat(chunks).toString('utf8')));"], JSON.stringify(value), true); assert.equal(parser.status, 0, parser.stderr); }
function parseQuoteV2Contract(value) { const parser = command(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", "import { parsePublicCheckoutQuoteV2 } from './packages/saas-contracts/src/storefront/index.ts'; const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk); parsePublicCheckoutQuoteV2(JSON.parse(Buffer.concat(chunks).toString('utf8')));"], JSON.stringify(value), true); assert.equal(parser.status, 0, parser.stderr); }
function discount(box) { return String(evaluate(box).discountTotalMinor); }
function performanceLines(count = 20) { return Array.from({length:count},(_,position)=>{ const suffix=String(position+1).padStart(12,"0"); return {lineId:`53000000-0000-4000-8000-${suffix}`,position,productId:`51000000-0000-4000-8000-${suffix}`,variantId:`52000000-0000-4000-8000-${suffix}`,quantity:1,unitPriceMinor:100,unitCostMinor:40,currency:"TRY",categoryIds:[],brandId:null,collectionIds:[]}; }); }
function seedPerformanceCatalog(box) {
  psql(box, `INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at)
    SELECT ('51000000-0000-4000-8000-'||lpad(series::text,12,'0'))::uuid,'${STORE}','promotion-real-'||series,'Promotion real '||series,'active','TRY','2026-01-01','2026-01-01' FROM pg_catalog.generate_series(1,20) series;
    ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
    INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,created_at,updated_at)
    SELECT ('52000000-0000-4000-8000-'||lpad(series::text,12,'0'))::uuid,('51000000-0000-4000-8000-'||lpad(series::text,12,'0'))::uuid,'${STORE}','Promotion real variant '||series,100,40,false,0,'active','2026-01-01','2026-01-01' FROM pg_catalog.generate_series(1,20) series;
    ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;
    INSERT INTO saas.catalog_product_categories(store_id,product_id,category_id,position)
    SELECT '${STORE}',('51000000-0000-4000-8000-'||lpad(series::text,12,'0'))::uuid,'${CATEGORY}',0 FROM pg_catalog.generate_series(1,10) series;
    INSERT INTO saas.catalog_admin_resource_products(store_id,resource_id,product_id,position)
    SELECT '${STORE}','${BRAND}',('51000000-0000-4000-8000-'||lpad(series::text,12,'0'))::uuid,series-10 FROM pg_catalog.generate_series(11,20) series;
    INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at)
    SELECT ('36000000-0000-4000-8000-'||lpad(series::text,12,'0'))::uuid,'${STORE}','Historic inactive promotion '||series,'paused',1,'${rule({kind:"percentage",percentageBps:1000})}'::jsonb,'2025-01-01','2025-01-01' FROM pg_catalog.generate_series(1,1600) series;`);
}
function targetedRule(audience) { const document=validRuleDocument(); document.targets={mode:"selected",include:[{kind:"category",id:CATEGORY},{kind:"brand",id:BRAND}],exclude:[]}; document.audience=audience; return document; }
function antiFanoutProof() {
  seedPerformanceCatalog(box);
  const lines=performanceLines(), proof={customerId:LINE,cartLines:lines};
  const tagRule=targetedRule({mode:"customer_tags",referenceIds:[LINE]});
  const segmentRule=targetedRule({mode:"customer_segments",referenceIds:[LINE]});
  const first="70000000-0000-4000-8000-000000000301";
  psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'; INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${first}','${STORE}','fanout-1','active',1,'${JSON.stringify(tagRule)}'::jsonb,'2026-01-01','2026-01-01');`);
  const onePromotionOneLine=measuredEvaluation(box,{...proof,cartLines:[lines[0]]});
  const onePromotionTwentyLines=measuredEvaluation(box,proof);
  psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at)
    SELECT ('70000000-0000-4000-8000-'||lpad((300+series)::text,12,'0'))::uuid,'${STORE}','fanout-'||series,'active',1,CASE WHEN series%2=0 THEN '${JSON.stringify(segmentRule)}'::jsonb ELSE '${JSON.stringify(tagRule)}'::jsonb END,'2026-01-01','2026-01-01' FROM pg_catalog.generate_series(2,100) series;`);
  const hundredPromotionsTwentyLines=measuredEvaluation(box,proof);
  for (const profile of [onePromotionOneLine,onePromotionTwentyLines,hundredPromotionsTwentyLines]) { assertFactLoadersOnce(profile); assertCatalogBudget(profile); assert.equal(Number(profile.functions.promotion_evaluator_gift_variant_valid??0),0,JSON.stringify(profile.functions)); }
  assert.equal(scalar(box,`SELECT count(*) FROM saas.products WHERE store_id='${STORE}' AND slug LIKE 'promotion-fixture-%'`),"1600");
  assert.equal(scalar(box,`SELECT count(DISTINCT product_id)||':'||count(DISTINCT id) FROM saas.product_variants WHERE store_id='${STORE}' AND id::text LIKE '52000000-%'`),"20:20");
  assert.equal(scalar(box,`SELECT count(*) FILTER (WHERE rule_document->'audience'->>'mode'='customer_tags')||':'||count(*) FILTER (WHERE rule_document->'audience'->>'mode'='customer_segments') FROM saas.promotions WHERE store_id='${STORE}' AND status='active'`),"50:50");
  assert.deepEqual(relationFootprint(onePromotionTwentyLines,[...CATALOG_FACT_RELATIONS,...AUDIENCE_FACT_RELATIONS]),relationFootprint(hundredPromotionsTwentyLines,[...CATALOG_FACT_RELATIONS,...AUDIENCE_FACT_RELATIONS]));
  assert.equal(Number(hundredPromotionsTwentyLines.tables.promotions.seqScan)<=2,true,JSON.stringify(hundredPromotionsTwentyLines.tables.promotions));
  assert.equal(Number(hundredPromotionsTwentyLines.tables.promotions.seqTupRead)<=Number(onePromotionTwentyLines.tables.promotions.seqTupRead)+100,true,JSON.stringify({one:onePromotionTwentyLines.tables.promotions,hundred:hundredPromotionsTwentyLines.tables.promotions}));
  const value=hundredPromotionsTwentyLines.value;
  assert.equal(value.eligiblePromotionIds.length,100);
  assert.deepEqual(value.appliedPromotions,[{promotionId:first,version:1,name:"fanout-1",benefitKind:"percentage",lineDiscountMinor:200,shippingDiscountMinor:0,discountTotalMinor:200}]);
  assert.equal(value.rejectedPromotions.length,99);
  assert.deepEqual(value.lineEffects,lines.map((line)=>({promotionId:first,lineId:line.lineId,discountMinor:10,giftQuantity:0})));
  assert.deepEqual({subtotal:value.subtotalBeforeDiscountMinor,line:value.lineDiscountTotalMinor,shipping:value.shippingBeforeDiscountMinor,shippingDiscount:value.shippingDiscountTotalMinor,discount:value.discountTotalMinor,grand:value.grandTotalMinor},{subtotal:2000,line:200,shipping:40,shippingDiscount:0,discount:200,grand:1840});
  assert.equal(value.grandTotalMinor,value.subtotalBeforeDiscountMinor-value.lineDiscountTotalMinor+value.shippingBeforeDiscountMinor-value.shippingDiscountTotalMinor);
  const benchmarkContext={...proof,submittedCodes:["ATLAS1","ATLAS2","ATLAS3","ATLAS4","ATLAS5"]};
  const encodedBenchmark=JSON.stringify(context(benchmarkContext)).replaceAll("'","''");
  const warmSamplesMs=JSON.parse(scalar(box,`CREATE TEMP TABLE promotion_benchmark_timings(ordinal integer PRIMARY KEY,elapsed_ms double precision); DO $benchmark$ DECLARE sample integer; started_at timestamptz; BEGIN FOR sample IN 1..5 LOOP started_at:=pg_catalog.clock_timestamp(); PERFORM saas.promotion_evaluate_v1('${STORE}','${encodedBenchmark}'::jsonb,'2026-09-05T00:00:00Z'); INSERT INTO promotion_benchmark_timings VALUES(sample,extract(epoch FROM pg_catalog.clock_timestamp()-started_at)*1000); END LOOP; END $benchmark$; SELECT pg_catalog.jsonb_agg(elapsed_ms ORDER BY ordinal) FROM promotion_benchmark_timings`));
  const coldSamplesMs=Array.from({length:5},()=>{ const startedAt=performance.now(); const cold=psql(box,`DISCARD PLANS; SELECT saas.promotion_evaluate_v1('${STORE}','${encodedBenchmark}'::jsonb,'2026-09-05T00:00:00Z')`); assert.equal(cold.status,0); return performance.now()-startedAt; });
  process.stdout.write(`PROMOTIONS_PERFORMANCE_RAW ${JSON.stringify({warmP95Ms:Number(percentile95(warmSamplesMs).toFixed(3)),coldP95Ms:Number(percentile95(coldSamplesMs).toFixed(3)),warmSamplesMs:warmSamplesMs.map((value)=>Number(value.toFixed(3))),coldSamplesMs:coldSamplesMs.map((value)=>Number(value.toFixed(3)))})}\n`);
  const timing=assertPromotionPerformanceBudget({warmSamplesMs,coldSamplesMs});
  process.stdout.write(`PROMOTIONS_PERFORMANCE_METRICS ${JSON.stringify({...timing,activePromotions:100,cartLines:20,couponCodes:5,targetFacts:["product","category","segment"]})}\n`);
  parseContract(value);
  const selectedDocument=validRuleDocument();
  const selectedAtLimit=JSON.parse(simulateSelected(box,"analyst",{id:"70000000-0000-4000-8000-000000000499",expectedVersion:null,name:"Selected candidate above cap",ruleDocument:selectedDocument},proof));
  assert.equal(selectedAtLimit.outcome,"simulated");
  assert.equal(selectedAtLimit.result.evaluation.merchantExplanation,"promotion_configuration_limit_exceeded");
  assert.deepEqual(selectedAtLimit.result.evaluation.eligiblePromotionIds,[]);
  psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('70000000-0000-4000-8000-000000000401','${STORE}','fanout-101','active',1,'${JSON.stringify(tagRule)}'::jsonb,'2026-01-01','2026-01-01')`);
  const aboveLimit=evaluate(box,proof);
  assert.equal(aboveLimit.merchantExplanation,"promotion_configuration_limit_exceeded");
  assert.deepEqual(aboveLimit.eligiblePromotionIds,[]);
  assert.deepEqual(aboveLimit.appliedPromotions,[]);
  assert.deepEqual(aboveLimit.lineEffects,[]);
  process.stdout.write(`PROMOTIONS_ANTI_FANOUT_METRICS ${JSON.stringify({onePromotionOneLine:profileSummary(onePromotionOneLine),onePromotionTwentyLines:profileSummary(onePromotionTwentyLines),hundredPromotionsTwentyLines:profileSummary(hundredPromotionsTwentyLines)})}\n`);
}
function giftFanoutProof() {
  const lines=performanceLines(), proof={customerId:LINE,cartLines:lines}, gift=validRuleDocument(), first="70000000-0000-4000-8000-000000000601";
  gift.benefit={kind:"gift",giftVariantId:LINE,quantity:1,autoAdd:true}; gift.audience={mode:"customer_segments",referenceIds:[LINE]};
  psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'; INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${first}','${STORE}','gift-1','active',1,'${JSON.stringify(gift)}'::jsonb,'2026-01-01','2026-01-01');`);
  const onePromotion=measuredEvaluation(box,proof);
  psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) SELECT ('70000000-0000-4000-8000-'||lpad((601+series)::text,12,'0'))::uuid,'${STORE}','gift-'||(1+series),'active',1,'${JSON.stringify(gift)}'::jsonb,'2026-01-01','2026-01-01' FROM pg_catalog.generate_series(1,99) series;`);
  const hundredPromotions=measuredEvaluation(box,proof);
  for (const profile of [onePromotion,hundredPromotions]) { assertFactLoadersOnce(profile); assertCatalogBudget(profile); assert.equal(Number(profile.functions.promotion_evaluator_gift_variant_valid??0),0,JSON.stringify(profile.functions)); }
  assert.deepEqual(relationFootprint(onePromotion,["products","product_variants"]),relationFootprint(hundredPromotions,["products","product_variants"]));
  assert.equal(Number(hundredPromotions.tables.promotions.seqScan)<=2,true,JSON.stringify(hundredPromotions.tables.promotions));
  assert.equal(Number(hundredPromotions.tables.promotions.seqTupRead)<=Number(onePromotion.tables.promotions.seqTupRead)+200,true,JSON.stringify({one:onePromotion.tables.promotions,hundred:hundredPromotions.tables.promotions}));
  assert.equal(hundredPromotions.value.eligiblePromotionIds.length,100);
  assert.equal(hundredPromotions.value.appliedPromotions.length,1);
  assert.equal(hundredPromotions.value.rejectedPromotions.length,99);
  assert.deepEqual(hundredPromotions.value.gifts,[{promotionId:first,variantId:LINE,quantity:1,paidMinor:0,autoAdd:true}]);
  parseContract(hundredPromotions.value);
  process.stdout.write(`PROMOTIONS_GIFT_SETWISE_METRICS ${JSON.stringify({onePromotion:profileSummary(onePromotion),hundredPromotions:profileSummary(hundredPromotions)})}\n`);
}
let box;
try {
  box = start();
  command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-q", "-U", "postgres", "-d", "postgres", "-c", `CREATE DATABASE ${DB}`]);
  for (const migration of migrationsThrough125()) apply(box, migration);
  seedLegacyBefore126(box);
  const legacyCommerceDefinitions=scalar(box,`SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('signature',routine.oid::regprocedure::text,'source',pg_catalog.md5(routine.prosrc),'volatility',routine.provolatile,'securityDefiner',routine.prosecdef) ORDER BY routine.oid::regprocedure::text) FROM pg_catalog.pg_proc routine WHERE routine.oid=ANY(ARRAY['saas.public_checkout_quote(text,timestamp with time zone,text,jsonb)'::regprocedure::oid,'saas.public_checkout_quote(text,timestamp with time zone,text,jsonb,jsonb)'::regprocedure::oid,'saas.public_checkout_complete(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)'::regprocedure::oid])`);
  const legacyHostedTerminalDefinition=scalar(box,`SELECT pg_catalog.md5(proc.prosrc) FROM pg_catalog.pg_proc proc WHERE proc.oid='saas.storefront_hosted_checkout_terminal_transition()'::regprocedure`);
  scenario("migration 126 applies after the accepted additive chain", () => apply(box, "202609050126_promotions_studio.up.sql"));
  scenario("additive V2 checkout RPCs preserve every V1 checkout definition", () => {
    assert.equal(scalar(box,`SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('signature',routine.oid::regprocedure::text,'source',pg_catalog.md5(routine.prosrc),'volatility',routine.provolatile,'securityDefiner',routine.prosecdef) ORDER BY routine.oid::regprocedure::text) FROM pg_catalog.pg_proc routine WHERE routine.oid=ANY(ARRAY['saas.public_checkout_quote(text,timestamp with time zone,text,jsonb)'::regprocedure::oid,'saas.public_checkout_quote(text,timestamp with time zone,text,jsonb,jsonb)'::regprocedure::oid,'saas.public_checkout_complete(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)'::regprocedure::oid])`),legacyCommerceDefinitions);
    const signatures=[
      "saas.public_checkout_quote_v2(text,timestamp with time zone,text,jsonb,jsonb,text[],jsonb)",
      "saas.public_checkout_complete_v2(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone,text[])",
      "saas.public_checkout_recover_v2(text,timestamp with time zone,uuid,text)",
      "saas.public_receipt_get_v2(text,timestamp with time zone,jsonb,jsonb)",
      "saas.public_account_orders_v2(text,timestamp with time zone,jsonb,integer)",
      "saas.public_storefront_hosted_checkout_authority_v2(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid)",
      "saas.public_storefront_hosted_checkout_begin_v2(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text)",
    ];
    for (const signature of signatures) {
      assert.equal(scalar(box,`SELECT pg_catalog.to_regprocedure('${signature}') IS NOT NULL`),"t",signature);
      assert.equal(scalar(box,`SELECT pg_catalog.has_function_privilege('celebix_saas_host_resolver','${signature}'::regprocedure,'EXECUTE')`),"t",signature);
      for (const role of ["public","celebix_saas_app","celebix_saas_identity","celebix_saas_workflow"]) assert.equal(scalar(box,`SELECT pg_catalog.has_function_privilege('${role}','${signature}'::regprocedure,'EXECUTE')`),"f",`${role}:${signature}`);
      assert.equal(scalar(box,`SELECT owner.rolname||':'||routine.prosecdef||':'||(COALESCE(routine.proconfig,'{}'::text[]) @> ARRAY['search_path=pg_catalog, saas']) FROM pg_catalog.pg_proc routine JOIN pg_catalog.pg_roles owner ON owner.oid=routine.proowner WHERE routine.oid='${signature}'::regprocedure`),"celebix_saas_owner:true:true",signature);
    }
  });
  scenario("migration-time legacy adoption is automatic exact and idempotent", () => {
    const digest = createHash("sha256").update(`promotion-legacy-v1:${LEGACY_STORE}:${LEGACY_PERCENT}`).digest("hex");
    const expectedPromotionId = `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`;
    assert.equal(scalar(box, `SELECT count(*) FROM saas.promotions WHERE store_id='${LEGACY_STORE}'`), "2");
    assert.equal(scalar(box, `SELECT id FROM saas.promotions WHERE store_id='${LEGACY_STORE}' AND legacy_record_id='${LEGACY_PERCENT}'`), expectedPromotionId);
    assert.notEqual(expectedPromotionId, LEGACY_PERCENT);
    assert.equal(scalar(box, `SELECT pg_catalog.to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')||':'||pg_catalog.to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM saas.promotions WHERE store_id='${LEGACY_STORE}' AND legacy_record_id='${LEGACY_PERCENT}'`), "2026-09-04T12:00:00.123Z:2026-09-04T12:00:00.123Z");
    assert.equal(scalar(box, `SELECT (rule_document->'benefit'->>'percentageBps')||':'||(rule_document->'limits'->>'totalUsage')||':'||(rule_document->'conditions'->>'minimumBasketMinor')||':'||(rule_document->'schedule'->>'timezone') FROM saas.promotions WHERE store_id='${LEGACY_STORE}' AND legacy_record_id='${LEGACY_PERCENT}'`), "1234:1:1:UTC");
    assert.equal(scalar(box, `SELECT (rule_document->'benefit'->>'amountMinor')||':'||(rule_document->'benefit'->>'currency')||':'||(rule_document->'trigger'->'codes'->>0) FROM saas.promotions WHERE store_id='${LEGACY_STORE}' AND legacy_record_id='${LEGACY_FIXED}'`), "1:TRY:LEGACY_CODE");
    assert.equal(scalar(box, `SELECT count(*) FROM saas.promotions WHERE store_id='${LEGACY_STORE}' AND legacy_record_id='${LEGACY_INVALID}'`), "0");
    assert.equal(scalar(box, `SELECT count(*) FROM saas.promotions WHERE store_id='${LEGACY_STORE}' AND legacy_record_id='${LEGACY_ARCHIVED}'`), "0");
    assert.equal(scalar(box, `SELECT saas.promotion_legacy_review_reason_v1('${LEGACY_STORE}','${LEGACY_ARCHIVED}',name,config) FROM saas.merchant_admin_records WHERE id='${LEGACY_ARCHIVED}'`), "invalid_legacy_record");
    assert.equal(scalar(box, `SELECT count(*) FROM saas.merchant_admin_records WHERE store_id='${LEGACY_STORE}'`), "5");
    assert.equal(scalar(box, `SELECT saas.promotion_adopt_legacy_discounts_v1('${LEGACY_STORE}','2026-09-05T00:00:00.000Z')`), "0");
  });
  scenario("Slice C batch metadata and exact RPC signatures are installed", () => {
    assert.equal(scalar(box, "SELECT pg_catalog.string_agg(attname,',' ORDER BY attnum) FROM pg_catalog.pg_attribute WHERE attrelid='saas.promotion_code_batches'::regclass AND attnum>0 AND NOT attisdropped"), "id,store_id,promotion_id,status,requested_count,operation_id,created_at,version,prefix,code_length,per_customer_usage,expires_at,updated_at");
    assert.equal(scalar(box, "SELECT pg_catalog.to_regprocedure('saas.promotion_create_code_batch_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,integer,text,integer,integer,timestamp with time zone)') IS NOT NULL"), "t");
    assert.equal(scalar(box, "SELECT pg_catalog.to_regprocedure('saas.promotion_code_batch_status_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)') IS NOT NULL"), "t");
    assert.equal(scalar(box, "SELECT pg_catalog.to_regprocedure('saas.promotion_code_batch_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,integer,timestamp with time zone,timestamp with time zone,uuid)') IS NOT NULL"), "t");
  });
  scenario("Slice D additive group settlement signatures are installed and remain internal", () => {
    for (const signature of [
      "saas.promotion_reserve_group_v1(uuid,uuid,text,text,text,jsonb,timestamp with time zone)",
      "saas.promotion_release_reservation_group_v1(uuid,uuid,text,uuid,timestamp with time zone)",
      "saas.promotion_commit_reservation_group_v1(uuid,uuid,text,uuid,uuid,timestamp with time zone)",
      "saas.promotion_recover_settlement_operation_v1(uuid,timestamp with time zone,uuid,text,text)",
      "saas.promotion_order_snapshot_valid_v1(jsonb)",
      "saas.promotion_captured_unit_refund_minor_v1(uuid,uuid,uuid,jsonb,jsonb,bigint,bigint)",
    ]) {
      assert.equal(scalar(box, `SELECT pg_catalog.to_regprocedure('${signature}') IS NOT NULL`), "t", signature);
      for (const role of ["public", "celebix_saas_app", "celebix_saas_host_resolver", "celebix_saas_identity", "celebix_saas_workflow"]) {
        assert.equal(scalar(box, `SELECT pg_catalog.has_function_privilege('${role}','${signature}'::regprocedure,'EXECUTE')`), "f", `${role}:${signature}`);
      }
    }
    const expirySignature="saas.promotion_expire_due_reservations_v1(timestamp with time zone,integer)";
    assert.equal(scalar(box, `SELECT pg_catalog.has_function_privilege('celebix_saas_workflow','${expirySignature}'::regprocedure,'EXECUTE')`), "t");
    assert.equal(scalar(box, `SELECT pg_catalog.has_function_privilege('celebix_saas_owner','${expirySignature}'::regprocedure,'EXECUTE')`), "t");
    for (const role of ["public","celebix_saas_app","celebix_saas_host_resolver","celebix_saas_identity"]) assert.equal(scalar(box,`SELECT pg_catalog.has_function_privilege('${role}','${expirySignature}'::regprocedure,'EXECUTE')`),"f",`${role}:${expirySignature}`);
    assert.equal(scalar(box,`SELECT owner.rolname||':'||(COALESCE(proc.proconfig,'{}'::text[]) @> ARRAY['search_path=pg_catalog, saas']) FROM pg_catalog.pg_proc proc JOIN pg_catalog.pg_roles owner ON owner.oid=proc.proowner WHERE proc.oid='${expirySignature}'::regprocedure`),"celebix_saas_owner:true");
  });
  apply(box, "202609050126_promotions_studio_assertions.sql");
  seed(box);
  seedAuthority(box);
  seedQuoteSource(box);
  scenario("V2 quote is read-only and freezes exact discount and aggregate gift-stock authority", () => {
    activate(box,PERCENT);
    const before=scalar(box,`SELECT count(*)||':'||(SELECT count(*) FROM saas.storefront_cart_attribution WHERE store_id='${STORE}' AND cart_id='${QUOTE_CART}') FROM saas.storefront_checkout_start_snapshots WHERE store_id='${STORE}' AND cart_id='${QUOTE_CART}'`);
    const first=quoteV2(box,[],"read_only"), replay=quoteV2(box,[],"read_only");
    assert.equal(first.outcome,"quoted",JSON.stringify(first)); assert.deepEqual(replay,first); assert.match(first.result.authorityDigest,/^[a-f0-9]{64}$/);
    assert.deepEqual({version:first.result.quote.cart.version,itemCount:first.result.quote.cart.itemCount,subtotal:first.result.quote.cart.subtotalCents,shipping:first.result.quote.cart.shippingCents,lineDiscount:first.result.quote.cart.lineDiscountCents,shippingDiscount:first.result.quote.cart.shippingDiscountCents,discount:first.result.quote.cart.discountCents,total:first.result.quote.cart.totalCents,status:first.result.quote.promotionStatus},{version:1,itemCount:3,subtotal:300,shipping:40,lineDiscount:30,shippingDiscount:0,discount:30,total:310,status:{kind:"evaluated"}});
    assert.deepEqual(first.result.quote.appliedPromotions,[{name:"percentage",benefitKind:"percentage",lineDiscountCents:30,shippingDiscountCents:0,discountCents:30}]);
    assert.deepEqual(first.result.quote.rejectedPromotions,[]); assert.deepEqual(first.result.quote.gifts,[]); assert.deepEqual(first.result.quote.progressMessages,[]);
    assert.deepEqual(first.result.quote.cart.items.map(({lineTotalCents,discountCents,payableCents})=>({lineTotalCents,discountCents,payableCents})),[{lineTotalCents:300,discountCents:30,payableCents:270}]);
    assert.equal(JSON.stringify(first.result.quote).includes("promotionId"),false); assert.equal(JSON.stringify(first.result.quote).includes("lineId"),false); parseQuoteV2Contract(first.result.quote);
    assert.equal(scalar(box,`SELECT count(*)||':'||(SELECT count(*) FROM saas.storefront_cart_attribution WHERE store_id='${STORE}' AND cart_id='${QUOTE_CART}') FROM saas.storefront_checkout_start_snapshots WHERE store_id='${STORE}' AND cart_id='${QUOTE_CART}'`),before);

    const giftRule=validRuleDocument(); giftRule.benefit={kind:"gift",giftVariantId:LINE,quantity:1,autoAdd:true};
    activate(box,GIFT);
    psql(box,`ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET stock_tracking=true,stock_quantity=3 WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
    const stockThreeEvaluation=evaluate(box), stockThreeQuote=quoteV2(box);
    assert.deepEqual(stockThreeEvaluation.gifts,[]); assert.equal(stockThreeEvaluation.appliedPromotions.some(({promotionId})=>promotionId===GIFT),false); assert.equal(stockThreeEvaluation.rejectedPromotions.some(({promotionId,reason})=>promotionId===GIFT&&reason==="conditions_not_met"),true);
    assert.equal(stockThreeQuote.outcome,"quoted",JSON.stringify(stockThreeQuote)); assert.deepEqual({applied:stockThreeQuote.result.quote.appliedPromotions,gifts:stockThreeQuote.result.quote.gifts,items:stockThreeQuote.result.quote.cart.items.length,total:stockThreeQuote.result.quote.cart.totalCents},{applied:[],gifts:[],items:1,total:340}); parseQuoteV2Contract(stockThreeQuote.result.quote);
    const stockThreeSimulation=JSON.parse(simulateSelected(box,"analyst",{id:GIFT,expectedVersion:1,name:"gift",ruleDocument:giftRule})).result.evaluation;
    assert.deepEqual({applied:stockThreeSimulation.appliedPromotions,gifts:stockThreeSimulation.gifts,rejected:stockThreeSimulation.rejectedPromotions},{applied:stockThreeEvaluation.appliedPromotions,gifts:stockThreeEvaluation.gifts,rejected:stockThreeEvaluation.rejectedPromotions});

    psql(box,`ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET stock_quantity=4 WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
    const stockFourEvaluation=evaluate(box), stockFourQuote=quoteV2(box);
    assert.deepEqual(stockFourEvaluation.gifts,[{promotionId:GIFT,variantId:LINE,quantity:1,paidMinor:0,autoAdd:true}]);
    assert.equal(stockFourQuote.outcome,"quoted",JSON.stringify(stockFourQuote)); assert.deepEqual({applied:stockFourQuote.result.quote.appliedPromotions,gifts:stockFourQuote.result.quote.gifts,items:stockFourQuote.result.quote.cart.items.length,total:stockFourQuote.result.quote.cart.totalCents},{applied:[{name:"gift",benefitKind:"gift",lineDiscountCents:0,shippingDiscountCents:0,discountCents:0}],gifts:[{variantId:LINE,quantity:1,autoAdd:true}],items:2,total:340}); parseQuoteV2Contract(stockFourQuote.result.quote);
    psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'; ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET stock_tracking=false,stock_quantity=0 WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
  });
  scenario("V2 advisory quote distinguishes unknown and ineligible codes while deferring payment-conditioned codes", () => {
    const ineligible="63000000-0000-4000-8000-000000000126", payment="63000000-0000-4000-8000-000000000127", ineligibleRule=validRuleDocument(), paymentRule=validRuleDocument();
    ineligibleRule.trigger={kind:"code",codes:["INELIGIBLE"]}; ineligibleRule.conditions={...ineligibleRule.conditions,minimumBasketMinor:301};
    paymentRule.trigger={kind:"code",codes:["PAYLATER"]}; paymentRule.conditions={...paymentRule.conditions,paymentMethodIds:[PAYMENT_METHOD]};
    psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'; INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${ineligible}','${STORE}','Ineligible code','active',1,'${JSON.stringify(ineligibleRule)}'::jsonb,'2026-09-05T00:00:00.000Z','2026-09-05T00:00:00.000Z'),('${payment}','${STORE}','Payment selection required','active',1,'${JSON.stringify(paymentRule)}'::jsonb,'2026-09-05T00:00:00.000Z','2026-09-05T00:00:00.000Z')`);
    const value=quoteV2(box,["INELIGIBLE","MISSING","PAYLATER"]); assert.equal(value.outcome,"quoted",JSON.stringify(value));
    assert.deepEqual(value.result.quote.appliedPromotions,[]); assert.deepEqual(value.result.quote.rejectedPromotions,[{normalizedCode:"INELIGIBLE",reason:"not_eligible"},{normalizedCode:"MISSING",reason:"invalid_code"}]); assert.equal(value.result.quote.rejectedPromotions.some(({normalizedCode})=>normalizedCode==="PAYLATER"),false); parseQuoteV2Contract(value.result.quote);
    psql(box,`DELETE FROM saas.promotions WHERE store_id='${STORE}' AND id IN ('${ineligible}','${payment}')`);
  });
  scenario("V2 quote never evaluates a prefix beyond twenty cart lines", () => {
    psql(box,`UPDATE saas.storefront_cart_items SET position=0 WHERE store_id='${STORE}' AND cart_id='${QUOTE_CART}';
      INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) SELECT ('91000000-0000-4000-8000-'||pg_catalog.lpad(series::text,12,'0'))::uuid,'${STORE}','quote-product-'||series,'Quote product '||series,'active','TRY','2026-09-04','2026-09-04' FROM pg_catalog.generate_series(1,20) series;
      ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
      INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,created_at,updated_at) SELECT ('92000000-0000-4000-8000-'||pg_catalog.lpad(series::text,12,'0'))::uuid,('91000000-0000-4000-8000-'||pg_catalog.lpad(series::text,12,'0'))::uuid,'${STORE}','Quote variant '||series,100,40,false,0,'active','2026-09-04','2026-09-04' FROM pg_catalog.generate_series(1,20) series;
      ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;
      INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at) SELECT '${QUOTE_CART}','${STORE}',('91000000-0000-4000-8000-'||pg_catalog.lpad(series::text,12,'0'))::uuid,('92000000-0000-4000-8000-'||pg_catalog.lpad(series::text,12,'0'))::uuid,1,100,series,'2026-09-04','2026-09-04' FROM pg_catalog.generate_series(1,20) series;`);
    activate(box,PERCENT); const value=quoteV2(box); assert.equal(value.outcome,"quoted",JSON.stringify(value));
    assert.deepEqual(value.result.quote.promotionStatus,{kind:"not_evaluated",reason:"cart_line_limit"}); assert.deepEqual(value.result.quote.appliedPromotions,[]); assert.deepEqual(value.result.quote.rejectedPromotions,[]); assert.deepEqual(value.result.quote.gifts,[]); assert.deepEqual(value.result.quote.progressMessages,["Sepetinizde çok fazla ürün satırı olduğu için promosyon uygulanamadı."]); assert.deepEqual({items:value.result.quote.cart.items.length,itemCount:value.result.quote.cart.itemCount,subtotal:value.result.quote.cart.subtotalCents,discount:value.result.quote.cart.discountCents,total:value.result.quote.cart.totalCents},{items:21,itemCount:23,subtotal:2300,discount:0,total:2340}); parseQuoteV2Contract(value.result.quote);
    psql(box,`DELETE FROM saas.storefront_cart_items WHERE store_id='${STORE}' AND cart_id='${QUOTE_CART}' AND variant_id::text LIKE '92000000-%'; DELETE FROM saas.product_variants WHERE store_id='${STORE}' AND id::text LIKE '92000000-%'; DELETE FROM saas.products WHERE store_id='${STORE}' AND id::text LIKE '91000000-%'; UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'`);
  });
  scenario("feature-off quotes remain gross while entitled evaluator failure is unavailable", () => {
    activate(box,PERCENT); psql(box,`ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable; UPDATE saas.plan_features SET enabled=false WHERE plan_id='${PLAN}' AND feature_key='promotions'; ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable`);
    const featureOff=quoteV2(box); assert.equal(featureOff.outcome,"quoted",JSON.stringify(featureOff)); assert.deepEqual({discount:featureOff.result.quote.cart.discountCents,total:featureOff.result.quote.cart.totalCents,applied:featureOff.result.quote.appliedPromotions,gifts:featureOff.result.quote.gifts},{discount:0,total:340,applied:[],gifts:[]}); parseQuoteV2Contract(featureOff.result.quote);
    psql(box,`ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable; UPDATE saas.plan_features SET enabled=true WHERE plan_id='${PLAN}' AND feature_key='promotions'; ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable; UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'; INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) SELECT ('93000000-0000-4000-8000-'||pg_catalog.lpad(series::text,12,'0'))::uuid,'${STORE}','Quote overflow '||series,'active',1,'${JSON.stringify(validRuleDocument())}'::jsonb,'2026-09-05','2026-09-05' FROM pg_catalog.generate_series(1,101) series`);
    const failed=quoteV2(box); assert.deepEqual(failed,{outcome:"unavailable",result:null});
    psql(box,`DELETE FROM saas.promotions WHERE store_id='${STORE}' AND id::text LIKE '93000000-%'`);
  });
  scenario("hosted V2 customer prepare is exact, idempotent and creates no checkout facts", () => {
    seedHostedV2Provider(box);
    const base=2000, before=scalar(box,`SELECT (SELECT count(*) FROM saas.customers WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.customer_addresses WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.orders WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.storefront_hosted_checkout_sessions WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}')`);
    const prepared=hostedAuthorityV2(box,{base}); assert.equal(prepared.result.outcome,"found",JSON.stringify(prepared.result));
    assert.deepEqual({customerId:prepared.result.result.customerId,orderId:prepared.result.result.orderId,subtotal:prepared.result.result.subtotalMinor,shipping:prepared.result.result.shippingMinor,discount:prepared.result.result.discountMinor,total:prepared.result.result.totalMinor,basket:prepared.result.result.basket},{customerId:prepared.prospectiveCustomerId,orderId:prepared.orderId,subtotal:300,shipping:40,discount:0,total:340,basket:[{name:"Promotion line",quantity:1,itemType:"PHYSICAL",reference:LINE,unitAmountMinor:300},{name:"Kargo",quantity:1,itemType:"VIRTUAL",reference:"shipping:standard",unitAmountMinor:40}]});
    const after=scalar(box,`SELECT (SELECT count(*) FROM saas.customers WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.customer_addresses WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.orders WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.storefront_hosted_checkout_sessions WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}')`);
    const [customers,addresses,orders,sessions,reservations]=before.split(":").map(Number); assert.equal(after,`${customers+1}:${addresses}:${orders}:${sessions}:${reservations}`);
    const replay=hostedAuthorityV2(box,{base,orderId:prepared.orderId,prospectiveCustomerId:task4Uuid(base+2),delivery:prepared.delivery}); assert.deepEqual(replay.result,prepared.result); assert.equal(scalar(box,`SELECT version||':'||pg_catalog.to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM saas.customers WHERE store_id='${STORE}' AND id='${prepared.prospectiveCustomerId}'`),"1:2026-09-05T00:00:00.000Z");
  });
  scenario("hosted V2 rejects NULL and split customer identity without mutation", () => {
    const base=2100, email=`hosted-${base}@test.invalid`, phone=`+90556${String(base).padStart(7,"0").slice(-7)}`;
    psql(box,`INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,phone,version,created_at,updated_at) VALUES('${task4Uuid(base)}','${STORE}','active','Email','Owner','${email}',NULL,1,'2026-09-05','2026-09-05'),('${task4Uuid(base+1)}','${STORE}','active','Phone','Owner','phone-owner-${base}@test.invalid','${phone}',1,'2026-09-05','2026-09-05')`);
    const before=scalar(box,`SELECT count(*)||':'||(SELECT count(*) FROM saas.storefront_hosted_checkout_sessions WHERE store_id='${STORE}') FROM saas.customers WHERE store_id='${STORE}'`);
    const split=hostedAuthorityV2(box,{base:base+2,delivery:hostedV2Delivery(base,email,phone)}); assert.deepEqual(split.result,{outcome:"invalid_input",result:null});
    const nullCall=JSON.parse(hostScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.public_storefront_hosted_checkout_authority_v2('${STOREFRONT_HOST}','2026-09-05T00:00:00.000Z',NULL,'[{"keyId":"promotion-quote","digest":"${QUOTE_CART_DIGEST}"}]'::jsonb,1,'${JSON.stringify(hostedV2Delivery(base+3)).replaceAll("'","''")}'::jsonb,'${HOSTED_V2_METHOD}','[]'::jsonb,'[]'::jsonb,'${task4Uuid(base+3)}','${task4Uuid(base+4)}','${task4Uuid(base+5)}')`)); assert.deepEqual(nullCall,{outcome:"invalid_input",result:null});
    assert.equal(scalar(box,`SELECT count(*)||':'||(SELECT count(*) FROM saas.storefront_hosted_checkout_sessions WHERE store_id='${STORE}') FROM saas.customers WHERE store_id='${STORE}'`),before);
  });
  scenario("hosted V2 evaluates selected payment authority and freezes exact discounted basket", () => {
    activate(box,PERCENT); const prepared=hostedAuthorityV2(box,{base:2200}); assert.equal(prepared.result.outcome,"found",JSON.stringify(prepared.result)); const authority=prepared.result.result;
    assert.deepEqual({line:authority.lineDiscountMinor,shipping:authority.shippingDiscountMinor,discount:authority.discountMinor,total:authority.totalMinor,status:authority.promotionStatus},{line:30,shipping:0,discount:30,total:310,status:{kind:"evaluated"}}); assert.deepEqual(authority.appliedPromotions,[{name:"percentage",benefitKind:"percentage",lineDiscountCents:30,shippingDiscountCents:0,discountCents:30}]); assert.deepEqual(authority.items.map(({lineTotalCents,discountCents,payableCents})=>({lineTotalCents,discountCents,payableCents})),[{lineTotalCents:300,discountCents:30,payableCents:270}]); assert.deepEqual(authority.basket,[{name:"Promotion line",quantity:1,itemType:"PHYSICAL",reference:LINE,unitAmountMinor:270},{name:"Kargo",quantity:1,itemType:"VIRTUAL",reference:"shipping:standard",unitAmountMinor:40}]); assert.match(authority.evaluatorAuthorityDigest,/^[a-f0-9]{64}$/); assert.match(authority.authorityDigest,/^[a-f0-9]{64}$/); assert.equal(JSON.stringify(authority).includes("_evaluator"),false); psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'`);
  });
  scenario("hosted V2 provider basket admits 99 payable rows plus shipping and rejects 100 plus shipping", () => {
    const passBase=2300,passDigest=createHash("sha256").update("hosted-v2-cart-2300-99-lines").digest("hex"),passCart=task4Uuid(passBase+7); seedOfflineV2Cart(box,{cartId:passCart,digest:passDigest,lineCount:99,seriesOffset:3000}); const passing=hostedAuthorityV2(box,{base:passBase,cartId:passCart,digest:passDigest,keyId:"task4-offline"}); assert.equal(passing.result.outcome,"found",JSON.stringify(passing.result)); assert.equal(passing.result.result.items.length,99); assert.equal(passing.result.result.basket.length,100); assert.equal(passing.result.result.basket.at(-1).itemType,"VIRTUAL");
    const passBegin=hostedBeginV2(box,{base:2350,prepared:passing,cartId:passCart,digest:passDigest,keyId:"task4-offline"}); assert.equal(passBegin.result.outcome,"created",JSON.stringify(passBegin.result)); assert.equal(passBegin.result.result.authority.basket.length,100); assert.equal(scalar(box,`SELECT count(*) FROM saas.checkout_inventory_reservations WHERE store_id='${STORE}' AND storefront_hosted_session_id='${passBegin.ids.sessionId}' AND status='held'`),"99"); psql(box,`UPDATE saas.payment_attempts SET status='cancelled',safe_code='cancelled',version=version+1,updated_at='2026-09-05T00:01:00.000Z' WHERE store_id='${STORE}' AND id='${passBegin.ids.operationId}'`);
    const failBase=2400,failDigest=createHash("sha256").update("hosted-v2-cart-2400-100-lines").digest("hex"),failCart=task4Uuid(failBase+7); seedOfflineV2Cart(box,{cartId:failCart,digest:failDigest,lineCount:100,seriesOffset:4000}); const failing=hostedAuthorityV2(box,{base:failBase,cartId:failCart,digest:failDigest,keyId:"task4-offline"}); assert.deepEqual(failing.result,{outcome:"authority_unavailable",result:null}); assert.equal(scalar(box,`SELECT count(*) FILTER(WHERE cart_id='${passCart}' AND status='cancelled')||':'||count(*) FILTER(WHERE cart_id='${failCart}') FROM saas.storefront_hosted_checkout_sessions WHERE store_id='${STORE}' AND cart_id IN ('${passCart}','${failCart}')`),"1:0");
    psql(box,`UPDATE saas.products SET status='draft',updated_at='2026-09-05T00:00:01.000Z' WHERE store_id='${STORE}' AND id::text LIKE '96000000-%'`);
  });
  scenario("hosted V2 begin freezes one coded cap and full lost-response retries replay exactly", () => {
    const base=2500,digest=createHash("sha256").update("hosted-v2-cart-2500").digest("hex"),cartId=task4Uuid(base+7),operationId=task4Uuid(base),promotion="f1000000-0000-4000-8000-000000000001",batchId="f2000000-0000-4000-8000-000000000001"; seedOfflineV2Cart(box,{cartId,digest});
    const coded=validRuleDocument(); coded.trigger={kind:"code",codes:["HOSTRETRY"]}; coded.limits={...coded.limits,totalUsage:1}; seedSettlementPromotion(box,{id:promotion,name:"Hosted retry cap code",document:coded});
    const batch=createBatch(box,{operationId:"f3000000-0000-4000-8000-000000000001",batchId,promotionId:promotion,count:1,prefix:"HRETRY",codeLength:22,perCustomerUsage:1,expiresAt:"2026-09-07T00:00:00.000Z"}); assert.equal(batch.outcome,"created",JSON.stringify(batch));
    const code=scalar(box,`SELECT code FROM saas.promotion_codes WHERE store_id='${STORE}' AND batch_id='${batchId}'`);
    const prepared=hostedAuthorityV2(box,{base:base+20,cartId,digest,keyId:"task4-offline",codes:[code],operationId}); assert.equal(prepared.result.outcome,"found",JSON.stringify(prepared.result));
    const begun=hostedBeginV2(box,{base,prepared,cartId,digest,codes:[code]}); assert.equal(begun.result.outcome,"created",JSON.stringify(begun.result)); const result=begun.result.result;
    assert.equal(result.amountMinor,result.authority.totalMinor); assert.equal(result.amountMinor,310); assert.deepEqual(result.authority,prepared.result.result); assert.equal(result.promotionReservation.status,"reserved"); assert.equal(result.promotionReservation.expiresAt,result.receiptExpiresAt); assert.equal(result.promotionReservation.expiresAt,"2026-09-06T00:00:00.000Z");
    assert.equal(scalar(box,`SELECT session.total_minor||':'||session.discount_minor||':'||session.evaluator_authority_digest||':'||session.promotion_reservation_group_id||':'||pg_catalog.to_char(session.promotion_reservation_expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')||':'||(SELECT count(*) FROM saas.checkout_inventory_reservations hold WHERE hold.storefront_hosted_session_id=session.id AND hold.status='held')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id=session.store_id AND reservation.reservation_group_id=session.promotion_reservation_group_id AND reservation.status='reserved' AND reservation.expires_at=session.receipt_expires_at) FROM saas.storefront_hosted_checkout_sessions session WHERE session.store_id='${STORE}' AND session.id='${begun.ids.sessionId}'`),`310:30:${result.authority.evaluatorAuthorityDigest}:${result.promotionReservation.reservationGroupId}:2026-09-06T00:00:00.000Z:1:1`);
    const preparedReplay=hostedAuthorityV2(box,{base:base+20,cartId,digest,keyId:"task4-offline",codes:[code],orderId:prepared.orderId,prospectiveCustomerId:prepared.prospectiveCustomerId,delivery:prepared.delivery,operationId}); assert.equal(preparedReplay.result.outcome,"found",JSON.stringify(preparedReplay.result)); assert.deepEqual(preparedReplay.result.result,prepared.result.result);
    const replay=hostedBeginV2(box,{base,prepared:preparedReplay,cartId,digest,codes:[code]}); assert.equal(replay.result.outcome,"operation_replayed"); assert.deepEqual(replay.result.result,result); assert.equal(scalar(box,`SELECT (SELECT count(*) FROM saas.storefront_hosted_checkout_sessions WHERE store_id='${STORE}' AND id='${begun.ids.sessionId}')||':'||(SELECT count(*) FROM saas.payment_attempts WHERE store_id='${STORE}' AND id='${begun.ids.operationId}')||':'||(SELECT count(*) FROM saas.storefront_hosted_checkout_operations WHERE store_id='${STORE}' AND operation_id='${begun.ids.operationId}')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND reservation_group_id='${result.promotionReservation.reservationGroupId}' AND code_id IS NOT NULL)`),"1:1:1:1");
    const replayBeforeExpiry=hostedAuthorityV2(box,{base:base+20,cartId,digest,keyId:"task4-offline",codes:[code],orderId:prepared.orderId,prospectiveCustomerId:prepared.prospectiveCustomerId,delivery:prepared.delivery,operationId,now:"2026-09-05T00:14:59.999Z"}); assert.equal(replayBeforeExpiry.result.outcome,"found",JSON.stringify(replayBeforeExpiry.result)); assert.deepEqual(replayBeforeExpiry.result.result,prepared.result.result);
    const replayAtExpiry=hostedAuthorityV2(box,{base:base+20,cartId,digest,keyId:"task4-offline",codes:[code],orderId:prepared.orderId,prospectiveCustomerId:prepared.prospectiveCustomerId,delivery:prepared.delivery,operationId,now:"2026-09-05T00:15:00.000Z"}); assert.deepEqual(replayAtExpiry.result,{outcome:"authority_unavailable",result:null});
    const operationFacts=scalar(box,`SELECT (SELECT count(*) FROM saas.storefront_hosted_checkout_sessions WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.payment_attempts WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}')`);
    const authorityMismatch=hostedAuthorityV2(box,{base:base+20,cartId,digest,keyId:"task4-offline",codes:[],orderId:prepared.orderId,prospectiveCustomerId:prepared.prospectiveCustomerId,delivery:prepared.delivery,operationId}); assert.deepEqual(authorityMismatch.result,{outcome:"operation_mismatch",result:null});
    const sourceMismatch=hostedAuthorityV2(box,{base:base+20,orderId:prepared.orderId,prospectiveCustomerId:prepared.prospectiveCustomerId,delivery:prepared.delivery,operationId}); assert.deepEqual(sourceMismatch.result,{outcome:"operation_mismatch",result:null});
    const wrongCustomer=task4Uuid(base+30); psql(box,`INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,phone,version,created_at,updated_at) VALUES('${wrongCustomer}','${STORE}','active','Wrong','Customer','wrong-hosted-replay@test.invalid','+905559999999',1,'2026-09-04','2026-09-04'); INSERT INTO saas.storefront_customer_credentials(id,store_id,customer_id,key_id,credential_digest,expires_at,created_at,last_seen_at) VALUES('${task4Uuid(base+31)}','${STORE}','${wrongCustomer}','wrong-replay','${"4".repeat(64)}','2026-09-06','2026-09-04','2026-09-04')`);
    const customerMismatch=hostedAuthorityV2(box,{base:base+20,cartId,digest,keyId:"task4-offline",codes:[code],customerCandidates:[{keyId:"wrong-replay",digest:"4".repeat(64)}],orderId:prepared.orderId,prospectiveCustomerId:prepared.prospectiveCustomerId,delivery:prepared.delivery,operationId}); assert.deepEqual(customerMismatch.result,{outcome:"operation_mismatch",result:null});
    const otherHostname="other-promotions-studio.saas-staging.celebix.site"; psql(box,`INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES('${task4Uuid(base+32)}','${OTHER_STORE}','${otherHostname}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1)`);
    const storeMismatch=hostedAuthorityV2(box,{base:base+20,hostname:otherHostname,cartId,digest,keyId:"task4-offline",codes:[code],orderId:prepared.orderId,prospectiveCustomerId:prepared.prospectiveCustomerId,delivery:prepared.delivery,operationId}); assert.deepEqual(storeMismatch.result,{outcome:"operation_mismatch",result:null});
    const otherOperation=hostedAuthorityV2(box,{base:base+20,cartId,digest,keyId:"task4-offline",codes:[code],orderId:prepared.orderId,prospectiveCustomerId:prepared.prospectiveCustomerId,delivery:prepared.delivery,operationId:task4Uuid(base+33)}); assert.equal(otherOperation.result.outcome,"found",JSON.stringify(otherOperation.result)); assert.deepEqual({discount:otherOperation.result.result.discountMinor,applied:otherOperation.result.result.appliedPromotions,gifts:otherOperation.result.result.gifts},{discount:0,applied:[],gifts:[]}); assert.notEqual(otherOperation.result.result.authorityDigest,prepared.result.result.authorityDigest);
    assert.equal(scalar(box,`SELECT (SELECT count(*) FROM saas.storefront_hosted_checkout_sessions WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.payment_attempts WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}')`),operationFacts);
    const mismatch=hostedBeginV2(box,{base,prepared,cartId,digest,fingerprint:"f".repeat(64)}); assert.deepEqual(mismatch.result,{outcome:"operation_mismatch",result:null}); assert.equal(scalar(box,`SELECT (SELECT count(*) FROM saas.storefront_hosted_checkout_sessions WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.payment_attempts WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}')`),operationFacts);
    psql(box,`UPDATE saas.payment_attempts SET status='cancelled',safe_code='cancelled',version=version+1,updated_at='2026-09-05T00:01:00.000Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'`);
    assert.equal(scalar(box,`SELECT session.status||':'||(SELECT count(*) FROM saas.checkout_inventory_reservations hold WHERE hold.storefront_hosted_session_id=session.id AND hold.status='released')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id=session.store_id AND reservation.reservation_group_id=session.promotion_reservation_group_id AND reservation.status='released') FROM saas.storefront_hosted_checkout_sessions session WHERE session.store_id='${STORE}' AND session.id='${begun.ids.sessionId}'`),"cancelled:1:1");
    psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'`);
  });
  scenario("hosted V2 gross begin has an exact null reservation and no promotion rows", () => {
    const base=2600,digest=createHash("sha256").update("hosted-v2-cart-2600").digest("hex"),cartId=task4Uuid(base+7); seedOfflineV2Cart(box,{cartId,digest}); psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'`);
    const prepared=hostedAuthorityV2(box,{base:base+20,cartId,digest,keyId:"task4-offline"}); assert.equal(prepared.result.outcome,"found",JSON.stringify(prepared.result)); assert.deepEqual(prepared.result.result.appliedPromotions,[]); assert.deepEqual(prepared.result.result.gifts,[]);
    const begun=hostedBeginV2(box,{base,prepared,cartId,digest}); assert.equal(begun.result.outcome,"created",JSON.stringify(begun.result)); assert.equal(begun.result.result.promotionReservation,null); assert.equal(scalar(box,`SELECT (promotion_reservation_group_id IS NULL)||':'||(promotion_reservation_expires_at IS NULL)||':'||(SELECT count(*) FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id=session.store_id AND reservation.source_kind='hosted_checkout' AND reservation.source_reference=session.id::text) FROM saas.storefront_hosted_checkout_sessions session WHERE session.store_id='${STORE}' AND session.id='${begun.ids.sessionId}'`),"true:true:0");
    psql(box,`UPDATE saas.storefront_hosted_checkout_sessions SET status='provider_ready',safe_code='provider_ready',version=version+1,updated_at='2026-09-05T00:00:00.001Z' WHERE store_id='${STORE}' AND id='${begun.ids.sessionId}'; UPDATE saas.payment_attempts SET status='awaiting_customer',safe_code='awaiting_customer',version=version+1,updated_at='2026-09-05T00:00:00.001Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'; UPDATE saas.payment_attempts SET status='submitted',safe_code='submitted',version=version+1,updated_at='2026-09-05T00:00:00.002Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'; UPDATE saas.payment_attempts SET status='captured',safe_code='captured',version=version+1,updated_at='2026-09-05T00:01:00.000Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'`);
    assert.equal(scalar(box,`SELECT session.status||':'||(session.promotion_reservation_group_id IS NULL)||':'||(SELECT count(*) FROM saas.checkout_inventory_reservations hold WHERE hold.storefront_hosted_session_id=session.id AND hold.status='consumed')||':'||orders.discount_cents||':'||orders.total_cents||':'||(SELECT count(*) FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id=session.store_id AND reservation.source_kind='hosted_checkout' AND reservation.source_reference=session.id::text)||':'||(SELECT result_payload->'receipt'->>'discountCents' FROM saas.storefront_checkout_operations operation WHERE operation.operation_id=session.payment_attempt_id) FROM saas.storefront_hosted_checkout_sessions session JOIN saas.orders orders ON orders.store_id=session.store_id AND orders.id=session.order_id WHERE session.store_id='${STORE}' AND session.id='${begun.ids.sessionId}'`),"captured:true:1:0:340:0:0");
  });
  scenario("hosted V2 begin drift and NULL inputs leave no attempt, session or reservation", () => {
    const base=2700,digest=createHash("sha256").update("hosted-v2-cart-2700").digest("hex"),cartId=task4Uuid(base+7); seedOfflineV2Cart(box,{cartId,digest}); activate(box,PERCENT); const prepared=hostedAuthorityV2(box,{base:base+20,cartId,digest,keyId:"task4-offline"}); assert.equal(prepared.result.outcome,"found"); const before=scalar(box,`SELECT (SELECT count(*) FROM saas.payment_attempts WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.storefront_hosted_checkout_sessions WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}')`);
    const drift=hostedBeginV2(box,{base,prepared,cartId,digest,expectedEvaluatorDigest:"0".repeat(64)}); assert.deepEqual(drift.result,{outcome:"durable_authority_invalid",result:null}); const nullCall=JSON.parse(hostScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.public_storefront_hosted_checkout_begin_v2('${STOREFRONT_HOST}','2026-09-05T00:00:00.000Z',NULL,'[]'::jsonb,1,'{}'::jsonb,'${HOSTED_V2_METHOD}',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'[]'::jsonb,'[]'::jsonb,NULL)`)); assert.deepEqual(nullCall,{outcome:"invalid_input",result:null}); assert.equal(scalar(box,`SELECT (SELECT count(*) FROM saas.payment_attempts WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.storefront_hosted_checkout_sessions WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}')`),before);
    const valid=hostedBeginV2(box,{base:base+20,prepared,cartId,digest}); assert.equal(valid.result.outcome,"created",JSON.stringify(valid.result));
    const activeFacts=scalar(box,`SELECT (SELECT count(*) FROM saas.payment_attempts WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.storefront_hosted_checkout_sessions WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}')`);
    const afterStockHorizon=hostedBeginV2(box,{base:base+40,prepared,cartId,digest,now:"2026-09-05T00:16:00.000Z"}); assert.deepEqual(afterStockHorizon.result,{outcome:"attempt_in_progress",result:null});
    assert.equal(scalar(box,`SELECT (SELECT count(*) FROM saas.payment_attempts WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.storefront_hosted_checkout_sessions WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}')`),activeFacts);
    psql(box,`UPDATE saas.payment_attempts SET status='cancelled',safe_code='cancelled',version=version+1,updated_at='2026-09-05T00:16:00.001Z' WHERE store_id='${STORE}' AND id='${valid.ids.operationId}'; UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'`);
  });
  scenario("hosted V2 capture after the stock horizon commits its frozen discount, receipt and customer delivery name", () => {
    const base=2800,digest=createHash("sha256").update("hosted-v2-cart-2800").digest("hex"),cartId=task4Uuid(base+7),customerId=task4Uuid(base+8);
    const email=`hosted-existing-${base}@test.invalid`,phone=`+90557${String(base).padStart(7,"0").slice(-7)}`,delivery=hostedV2Delivery(base,email,phone);
    seedOfflineV2Cart(box,{cartId,digest});
    psql(box,`INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,phone,version,created_at,updated_at) VALUES('${customerId}','${STORE}','active','Old','Name','${email}','${phone}',1,'2026-09-04','2026-09-04')`);
    activate(box,PERCENT);
    const prepared=hostedAuthorityV2(box,{base:base+20,cartId,digest,keyId:"task4-offline",delivery});
    assert.equal(prepared.result.outcome,"found",JSON.stringify(prepared.result)); assert.equal(prepared.result.result.customerId,customerId);
    assert.equal(scalar(box,`SELECT first_name||':'||last_name||':'||version FROM saas.customers WHERE store_id='${STORE}' AND id='${customerId}'`),"Old:Name:1");
    const begun=hostedBeginV2(box,{base,prepared,cartId,digest}); assert.equal(begun.result.outcome,"created",JSON.stringify(begun.result));
    psql(box,`UPDATE saas.storefront_hosted_checkout_sessions SET status='provider_ready',safe_code='provider_ready',version=version+1,updated_at='2026-09-05T00:00:00.001Z' WHERE store_id='${STORE}' AND id='${begun.ids.sessionId}'; UPDATE saas.payment_attempts SET status='awaiting_customer',safe_code='awaiting_customer',version=version+1,updated_at='2026-09-05T00:00:00.001Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'; UPDATE saas.payment_attempts SET status='submitted',safe_code='submitted',version=version+1,updated_at='2026-09-05T00:00:00.002Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'`);
    assert.equal(scalar(box,`SELECT saas.storefront_hosted_checkout_expire_created('2026-09-05T00:16:00.000Z',25)||':'||session.status||':'||(SELECT count(*) FROM saas.checkout_inventory_reservations hold WHERE hold.storefront_hosted_session_id=session.id AND hold.status='held')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id=session.store_id AND reservation.reservation_group_id=session.promotion_reservation_group_id AND reservation.status='reserved') FROM saas.storefront_hosted_checkout_sessions session WHERE session.store_id='${STORE}' AND session.id='${begun.ids.sessionId}'`),"0:provider_ready:1:1");
    psql(box,`UPDATE saas.payment_attempts SET status='captured',safe_code='captured',version=version+1,updated_at='2026-09-05T00:16:00.000Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'`);
    assert.equal(scalar(box,`SELECT session.status||':'||orders.discount_cents||':'||orders.total_cents||':'||item.discount_cents||':'||(SELECT count(*) FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id=session.store_id AND reservation.reservation_group_id=session.promotion_reservation_group_id AND reservation.status='committed')||':'||(SELECT count(*) FROM saas.promotion_redemptions redemption WHERE redemption.store_id=session.store_id AND redemption.order_id=session.order_id)||':'||(SELECT count(*) FROM saas.order_promotion_snapshots snapshot WHERE snapshot.store_id=session.store_id AND snapshot.order_id=session.order_id)||':'||(SELECT count(*) FROM saas.order_discount_allocations allocation WHERE allocation.store_id=session.store_id AND allocation.order_id=session.order_id)||':'||(SELECT count(*) FROM saas.checkout_inventory_reservations hold WHERE hold.storefront_hosted_session_id=session.id AND hold.status='consumed') FROM saas.storefront_hosted_checkout_sessions session JOIN saas.orders orders ON orders.store_id=session.store_id AND orders.id=session.order_id JOIN saas.order_items item ON item.store_id=orders.store_id AND item.order_id=orders.id AND item.position=0 WHERE session.store_id='${STORE}' AND session.id='${begun.ids.sessionId}'`),"captured:30:310:30:1:1:1:1:1");
    assert.equal(scalar(box,`SELECT first_name||':'||last_name||':'||version FROM saas.customers WHERE store_id='${STORE}' AND id='${customerId}'`),"Hosted:Customer:2");
    assert.equal(scalar(box,`SELECT (result_payload->'receipt'->>'discountCents')||':'||(result_payload->'receipt'->>'totalCents')||':'||(result_payload->'receipt'->'appliedPromotions'->0->>'name') FROM saas.storefront_checkout_operations WHERE operation_id='${begun.ids.operationId}'`),"30:310:percentage");
    assert.equal(scalar(box,`SELECT pg_catalog.md5(proc.prosrc) FROM pg_catalog.pg_proc proc WHERE proc.oid='saas.storefront_hosted_checkout_terminal_transition()'::regprocedure`),legacyHostedTerminalDefinition);
    psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'`);
  });
  scenario("hosted V2 same-variant auto-add gift reserves one aggregated hold and captures a zero-payable item", () => {
    const base=2900,digest=createHash("sha256").update("hosted-v2-cart-2900").digest("hex"),cartId=task4Uuid(base+7); seedOfflineV2Cart(box,{cartId,digest}); activate(box,GIFT);
    psql(box,`INSERT INTO saas.inventory_locations(id,store_id,name,is_default,status,version,created_at,updated_at) VALUES(saas.inventory_deterministic_uuid('inventory-default-location','${STORE}'),'${STORE}','Task 4 depo',true,'active',1,'2026-09-04','2026-09-04') ON CONFLICT DO NOTHING; INSERT INTO saas.inventory_balances(store_id,location_id,variant_id,quantity,version,updated_at) VALUES('${STORE}',saas.inventory_deterministic_uuid('inventory-default-location','${STORE}'),'${LINE}',4,1,'2026-09-04') ON CONFLICT(store_id,location_id,variant_id) DO UPDATE SET quantity=EXCLUDED.quantity,version=saas.inventory_balances.version+1,updated_at=EXCLUDED.updated_at; ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET stock_tracking=true,stock_quantity=4 WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
    const faultBase=2950,faultDigest=createHash("sha256").update("hosted-v2-cart-2950-hold-failure").digest("hex"),faultCart=task4Uuid(faultBase+7); seedOfflineV2Cart(box,{cartId:faultCart,digest:faultDigest});
    const faultPrepared=hostedAuthorityV2(box,{base:faultBase+20,cartId:faultCart,digest:faultDigest,keyId:"task4-offline"}); assert.equal(faultPrepared.result.outcome,"found",JSON.stringify(faultPrepared.result));
    const faultSession=task4Uuid(faultBase+1);
    psql(box,`CREATE FUNCTION saas.task4_hosted_v2_hold_failure() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $fn$ BEGIN IF NEW.storefront_hosted_session_id='${faultSession}'::uuid THEN RAISE EXCEPTION 'TASK4_HOSTED_V2_HOLD_FAILURE'; END IF; RETURN NEW; END $fn$; CREATE TRIGGER task4_hosted_v2_hold_failure BEFORE INSERT ON saas.checkout_inventory_reservations FOR EACH ROW EXECUTE FUNCTION saas.task4_hosted_v2_hold_failure()`);
    const faulted=hostedBeginV2(box,{base:faultBase,prepared:faultPrepared,cartId:faultCart,digest:faultDigest}); assert.deepEqual(faulted.result,{outcome:"durable_authority_invalid",result:null});
    psql(box,`DROP TRIGGER task4_hosted_v2_hold_failure ON saas.checkout_inventory_reservations; DROP FUNCTION saas.task4_hosted_v2_hold_failure()`);
    assert.equal(scalar(box,`SELECT (SELECT count(*) FROM saas.payment_attempts WHERE store_id='${STORE}' AND id='${faulted.ids.operationId}')||':'||(SELECT count(*) FROM saas.storefront_hosted_checkout_sessions WHERE store_id='${STORE}' AND id='${faultSession}')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND source_kind='hosted_checkout' AND source_reference='${faultSession}')||':'||(SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}' AND result_entity_id=saas.storefront_commerce_uuid('promotion-reservation-group-v1:${STORE}:'||saas.storefront_commerce_uuid('hosted-promotion-reserve-v2:${faultSession}')::text))`),"0:0:0:0");
    const prepared=hostedAuthorityV2(box,{base:base+20,cartId,digest,keyId:"task4-offline"}); assert.equal(prepared.result.outcome,"found",JSON.stringify(prepared.result)); const authority=prepared.result.result;
    assert.deepEqual(authority.gifts,[{variantId:LINE,quantity:1,autoAdd:true}]); assert.equal(JSON.stringify(authority.gifts).includes("lineId"),false); assert.equal(authority.discountMinor,0); assert.equal(authority.items.length,2); assert.equal(authority.items[1].payableCents,0); assert.equal(authority.basket.length,2);
    const begun=hostedBeginV2(box,{base,prepared,cartId,digest}); assert.equal(begun.result.outcome,"created",JSON.stringify(begun.result)); assert.notEqual(begun.result.result.promotionReservation,null);
    assert.equal(scalar(box,`SELECT count(*)||':'||sum(quantity)||':'||bool_and(status='held') FROM saas.checkout_inventory_reservations WHERE store_id='${STORE}' AND storefront_hosted_session_id='${begun.ids.sessionId}'`),"1:4:true");
    psql(box,`UPDATE saas.storefront_hosted_checkout_sessions SET status='provider_ready',safe_code='provider_ready',version=version+1,updated_at='2026-09-05T00:00:00.001Z' WHERE store_id='${STORE}' AND id='${begun.ids.sessionId}'; UPDATE saas.payment_attempts SET status='awaiting_customer',safe_code='awaiting_customer',version=version+1,updated_at='2026-09-05T00:00:00.001Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'; UPDATE saas.payment_attempts SET status='submitted',safe_code='submitted',version=version+1,updated_at='2026-09-05T00:00:00.002Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'; UPDATE saas.payment_attempts SET status='captured',safe_code='captured',version=version+1,updated_at='2026-09-05T00:01:00.000Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'`);
    assert.equal(scalar(box,`SELECT count(*)||':'||count(*) FILTER(WHERE position=1 AND variant_id='${LINE}' AND quantity=1 AND unit_price_cents=0 AND discount_cents=0 AND line_total_cents=0) FROM saas.order_items WHERE store_id='${STORE}' AND order_id='${prepared.orderId}'`),"2:1");
    assert.equal(scalar(box,`SELECT stock_quantity FROM saas.product_variants WHERE store_id='${STORE}' AND id='${LINE}'`),"0");
    assert.equal(scalar(box,`SELECT (SELECT count(*) FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id='${STORE}' AND reservation.source_kind='hosted_checkout' AND reservation.source_reference='${begun.ids.sessionId}' AND reservation.status='committed')||':'||(SELECT count(*) FROM saas.promotion_redemptions redemption WHERE redemption.store_id='${STORE}' AND redemption.order_id='${prepared.orderId}')||':'||(SELECT count(*) FROM saas.order_promotion_snapshots snapshot WHERE snapshot.store_id='${STORE}' AND snapshot.order_id='${prepared.orderId}')||':'||(SELECT count(*) FROM saas.order_discount_allocations allocation WHERE allocation.store_id='${STORE}' AND allocation.order_id='${prepared.orderId}')||':'||(SELECT saas.promotion_commit_integrity_valid_v1(redemption.store_id,redemption.redemption_group_id) FROM saas.promotion_redemptions redemption WHERE redemption.store_id='${STORE}' AND redemption.order_id='${prepared.orderId}' LIMIT 1)`),"1:1:1:0:true");
    psql(box,`ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET stock_tracking=false,stock_quantity=0 WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
    psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'`);
  });
  scenario("hosted V2 deterministically caps auto-add gift order lines before quote, reserve, stock and capture", () => {
    const base=3200,digest=createHash("sha256").update("hosted-v2-cart-3200-line-budget").digest("hex"),cartId=task4Uuid(base+7),seriesOffset=7000;
    const giftRule=validRuleDocument();
    giftRule.benefit={kind:"gift",giftVariantId:"e7000000-0000-4000-8000-000000000001",quantity:1,autoAdd:true};
    giftRule.combinationPolicy={kind:"benefit_classes",benefitClasses:["gift"]};
    seedOfflineV2Cart(box,{cartId,digest,lineCount:20,seriesOffset});
    psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}';
      INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at)
      SELECT ('e6000000-0000-4000-8000-'||pg_catalog.lpad(series::text,12,'0'))::uuid,'${STORE}','hosted-gift-budget-'||series,'Hosted gift budget '||series,'active','TRY','2026-09-04','2026-09-04'
      FROM pg_catalog.generate_series(1,100) series;
      ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
      INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,created_at,updated_at)
      SELECT ('e7000000-0000-4000-8000-'||pg_catalog.lpad(series::text,12,'0'))::uuid,('e6000000-0000-4000-8000-'||pg_catalog.lpad(series::text,12,'0'))::uuid,'${STORE}','Hosted gift variant '||series,0,0,false,0,'active','2026-09-04','2026-09-04'
      FROM pg_catalog.generate_series(1,100) series;
      ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;
      INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at)
      SELECT ('e8000000-0000-4000-8000-'||pg_catalog.lpad(series::text,12,'0'))::uuid,'${STORE}','Hosted gift budget '||series,'active',1,
        pg_catalog.jsonb_set('${JSON.stringify(giftRule)}'::jsonb,'{benefit,giftVariantId}',pg_catalog.to_jsonb(('e7000000-0000-4000-8000-'||pg_catalog.lpad(series::text,12,'0'))),false),
        '2026-09-05','2026-09-05'
      FROM pg_catalog.generate_series(100,1,-1) series;
      INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at)
      SELECT promotion.id,promotion.store_id,promotion.id,1,promotion.rule_document,'2026-09-05'
      FROM saas.promotions promotion WHERE promotion.store_id='${STORE}' AND promotion.id::text LIKE 'e8000000-%';`);
    const expectedPromotionIds=Array.from({length:80},(_,index)=>`e8000000-0000-4000-8000-${String(index+1).padStart(12,"0")}`);
    const expectedGiftVariantIds=Array.from({length:80},(_,index)=>`e7000000-0000-4000-8000-${String(index+1).padStart(12,"0")}`);
    const quoteInvocation=`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.public_checkout_quote_v2('${STOREFRONT_HOST}','2026-09-05T00:00:00.000Z','cart','[{"keyId":"task4-offline","digest":"${digest}"}]'::jsonb,'[]'::jsonb,ARRAY[]::text[],'{"firstTouch":{"source":"unknown","medium":"unknown"},"lastTouch":{"source":"unknown","medium":"unknown"},"landingPathGroup":"/unknown","deviceGroup":"unknown"}'::jsonb)`;
    const quote=JSON.parse(hostScalar(box,quoteInvocation)); assert.equal(quote.outcome,"quoted",JSON.stringify(quote));
    assert.deepEqual(quote.result.quote.appliedPromotions.map(({name})=>name),expectedPromotionIds.map((_id,index)=>`Hosted gift budget ${index+1}`));
    assert.deepEqual(quote.result.quote.gifts.map(({variantId})=>variantId),expectedGiftVariantIds);
    assert.deepEqual({items:quote.result.quote.cart.items.length,itemCount:quote.result.quote.cart.itemCount,applied:quote.result.quote.appliedPromotions.length,rejected:quote.result.quote.rejectedPromotions.length,gifts:quote.result.quote.gifts.length,total:quote.result.quote.cart.totalCents},{items:100,itemCount:20,applied:80,rejected:0,gifts:80,total:2040});
    parseQuoteV2Contract(quote.result.quote);
    const prepared=hostedAuthorityV2(box,{base:base+20,cartId,digest,keyId:"task4-offline"}); assert.equal(prepared.result.outcome,"found",JSON.stringify(prepared.result)); const authority=prepared.result.result;
    assert.deepEqual(authority.appliedPromotions.map(({name})=>name),quote.result.quote.appliedPromotions.map(({name})=>name)); assert.deepEqual(authority.gifts,quote.result.quote.gifts);
    assert.deepEqual({items:authority.items.length,paid:authority.items.filter((item)=>item.payableCents>0).length,gifts:authority.items.filter((item)=>item.payableCents===0).length,basket:authority.basket.length,basketTotal:authority.basket.reduce((sum,item)=>sum+item.unitAmountMinor,0)},{items:100,paid:20,gifts:80,basket:21,basketTotal:2040});
    assert.equal(authority.basket.some((item)=>expectedGiftVariantIds.includes(item.reference)),false);
    const begun=hostedBeginV2(box,{base,prepared,cartId,digest}); assert.equal(begun.result.outcome,"created",JSON.stringify(begun.result)); assert.deepEqual(begun.result.result.authority,authority);
    assert.equal(scalar(box,`SELECT pg_catalog.jsonb_array_length(session.item_snapshot)||':'||pg_catalog.jsonb_array_length(session.promotion_evaluation->'appliedPromotions')||':'||pg_catalog.jsonb_array_length(session.promotion_evaluation->'rejectedPromotions')||':'||(SELECT count(*) FROM pg_catalog.jsonb_array_elements(session.promotion_evaluation->'rejectedPromotions') rejected WHERE rejected->>'reason'='order_line_limit')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id=session.store_id AND reservation.reservation_group_id=session.promotion_reservation_group_id AND reservation.status='reserved')||':'||(SELECT count(*) FROM saas.checkout_inventory_reservations hold WHERE hold.store_id=session.store_id AND hold.storefront_hosted_session_id=session.id AND hold.status='held')||':'||(SELECT count(*) FROM saas.checkout_inventory_reservations hold WHERE hold.store_id=session.store_id AND hold.storefront_hosted_session_id=session.id AND hold.variant_id::text LIKE 'e7000000-%' AND right(hold.variant_id::text,12)::integer>80) FROM saas.storefront_hosted_checkout_sessions session WHERE session.store_id='${STORE}' AND session.id='${begun.ids.sessionId}'`),"100:80:20:20:80:100:0");
    const captureStartedAt=performance.now();
    psql(box,`UPDATE saas.storefront_hosted_checkout_sessions SET status='provider_ready',safe_code='provider_ready',version=version+1,updated_at='2026-09-05T00:00:00.001Z' WHERE store_id='${STORE}' AND id='${begun.ids.sessionId}'; UPDATE saas.payment_attempts SET status='awaiting_customer',safe_code='awaiting_customer',version=version+1,updated_at='2026-09-05T00:00:00.001Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'; UPDATE saas.payment_attempts SET status='submitted',safe_code='submitted',version=version+1,updated_at='2026-09-05T00:00:00.002Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'; UPDATE saas.payment_attempts SET status='captured',safe_code='captured',version=version+1,updated_at='2026-09-05T00:01:00.000Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'`);
    const captureElapsedMs=performance.now()-captureStartedAt;
    assert.equal(captureElapsedMs<30_000,true,`80-promotion hosted capture took ${captureElapsedMs.toFixed(1)}ms`);
    const receipt=JSON.parse(scalar(box,`SELECT result_payload->'receipt' FROM saas.storefront_checkout_operations WHERE operation_id='${begun.ids.operationId}'`));
    assert.deepEqual(receipt.appliedPromotions,authority.appliedPromotions); assert.deepEqual(receipt.gifts,authority.gifts); assert.equal(receipt.items.length,100);
    assert.equal(scalar(box,`SELECT count(*)||':'||pg_catalog.min(position)||':'||pg_catalog.max(position)||':'||count(DISTINCT position)||':'||count(*) FILTER(WHERE position>=20 AND unit_price_cents=0 AND discount_cents=0 AND line_total_cents=0)||':'||(SELECT count(*) FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id='${STORE}' AND reservation.source_reference='${begun.ids.sessionId}' AND reservation.status='committed')||':'||(SELECT count(*) FROM saas.promotion_redemptions redemption WHERE redemption.store_id='${STORE}' AND redemption.order_id='${prepared.orderId}')||':'||(SELECT count(*) FROM saas.order_promotion_snapshots snapshot WHERE snapshot.store_id='${STORE}' AND snapshot.order_id='${prepared.orderId}') FROM saas.order_items item WHERE item.store_id='${STORE}' AND item.order_id='${prepared.orderId}'`),"100:0:99:100:80:80:80:80");
    assert.equal(scalar(box,`SELECT pg_catalog.jsonb_array_length(detail->'items')||':'||(detail->>'itemCount') FROM (SELECT saas.orders_detail_projection('${STORE}','${prepared.orderId}') detail) projected`),"100:100");
    psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}';
      UPDATE saas.promotions SET status='active' WHERE store_id='${STORE}' AND id::text LIKE 'e8000000-%' AND right(id::text,12)::integer<=81;
      UPDATE saas.promotions SET rule_document=pg_catalog.jsonb_set(rule_document,'{benefit,quantity}','9999'::jsonb,false) WHERE store_id='${STORE}' AND id='e8000000-0000-4000-8000-000000000080';
      UPDATE saas.promotions SET rule_document=pg_catalog.jsonb_set(rule_document,'{benefit,giftVariantId}',pg_catalog.to_jsonb('e7000000-0000-4000-8000-000000000080'::text),false) WHERE store_id='${STORE}' AND id='e8000000-0000-4000-8000-000000000081';`);
    const boundaryLines=Array.from({length:20},(_,position)=>{ const suffix=String(seriesOffset+position+1).padStart(12,"0"); return {lineId:`e9000000-0000-4000-8000-${String(position+1).padStart(12,"0")}`,position,productId:`96000000-0000-4000-8000-${suffix}`,variantId:`97000000-0000-4000-8000-${suffix}`,quantity:1,unitPriceMinor:100,unitCostMinor:40,currency:"TRY",categoryIds:[],brandId:null,collectionIds:[]}; });
    const boundary=evaluate(box,{cartLines:boundaryLines});
    assert.deepEqual({eligible:boundary.eligiblePromotionIds.length,applied:boundary.appliedPromotions.length,rejected:boundary.rejectedPromotions.length,gifts:boundary.gifts.length},{eligible:81,applied:80,rejected:1,gifts:80});
    assert.deepEqual(boundary.rejectedPromotions,[{promotionId:"e8000000-0000-4000-8000-000000000081",reason:"order_line_limit"}]);
    assert.equal(boundary.gifts.find(({promotionId})=>promotionId==="e8000000-0000-4000-8000-000000000080")?.quantity,9999); assert.equal(boundary.gifts.some(({promotionId})=>promotionId==="e8000000-0000-4000-8000-000000000081"),false); parseContract(boundary);
    psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'; UPDATE saas.products SET status='draft',updated_at='2026-09-05T00:01:01.000Z' WHERE store_id='${STORE}' AND (id::text LIKE 'e6000000-%' OR id::text LIKE '96000000-%')`);
  });
  scenario("hosted V2 capture at the receipt horizon fails closed without settling promotion or order", () => {
    const base=3000,digest=createHash("sha256").update("hosted-v2-cart-3000").digest("hex"),cartId=task4Uuid(base+7); seedOfflineV2Cart(box,{cartId,digest}); activate(box,PERCENT);
    const prepared=hostedAuthorityV2(box,{base:base+20,cartId,digest,keyId:"task4-offline"}),begun=hostedBeginV2(box,{base,prepared,cartId,digest}); assert.equal(begun.result.outcome,"created",JSON.stringify(begun.result));
    psql(box,`UPDATE saas.storefront_hosted_checkout_sessions SET status='provider_ready',safe_code='provider_ready',version=version+1,updated_at='2026-09-05T00:00:00.001Z' WHERE store_id='${STORE}' AND id='${begun.ids.sessionId}'; UPDATE saas.payment_attempts SET status='awaiting_customer',safe_code='awaiting_customer',version=version+1,updated_at='2026-09-05T00:00:00.001Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'; UPDATE saas.payment_attempts SET status='submitted',safe_code='submitted',version=version+1,updated_at='2026-09-05T00:00:00.002Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'`);
    const captured=psql(box,`UPDATE saas.payment_attempts SET status='captured',safe_code='captured',version=version+1,updated_at='2026-09-06T00:00:00.000Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'`,DB,true); assert.notEqual(captured.status,0); assert.match(captured.stderr,/STOREFRONT_HOSTED_CHECKOUT_V2_PROMOTION_EXPIRED/);
    assert.equal(scalar(box,`SELECT attempt.status||':'||session.status||':'||(SELECT count(*) FROM saas.orders orders WHERE orders.store_id=session.store_id AND orders.id=session.order_id)||':'||(SELECT count(*) FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id=session.store_id AND reservation.reservation_group_id=session.promotion_reservation_group_id AND reservation.status='reserved') FROM saas.payment_attempts attempt JOIN saas.storefront_hosted_checkout_sessions session ON session.store_id=attempt.store_id AND session.payment_attempt_id=attempt.id WHERE attempt.store_id='${STORE}' AND attempt.id='${begun.ids.operationId}'`),"submitted:provider_ready:0:1");
    psql(box,`UPDATE saas.payment_attempts SET status='cancelled',safe_code='cancelled',version=version+1,updated_at='2026-09-05T00:01:00.000Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'; DELETE FROM saas.store_domains WHERE id='${task4Uuid(base+32)}'; UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'`);
  });
  scenario("hosted V2 stock conflicts release frozen promotions and prevent late-capture stock theft", () => {
    const base=3100,digest=createHash("sha256").update("hosted-v2-cart-3100").digest("hex"),cartId=task4Uuid(base+7); seedOfflineV2Cart(box,{cartId,digest}); activate(box,PERCENT);
    const prepared=hostedAuthorityV2(box,{base:base+20,cartId,digest,keyId:"task4-offline"}),begun=hostedBeginV2(box,{base,prepared,cartId,digest}); assert.equal(begun.result.outcome,"created",JSON.stringify(begun.result));
    psql(box,`UPDATE saas.checkout_inventory_reservations SET status='released',released_at='2026-09-05T00:00:01.000Z',version=version+1,updated_at='2026-09-05T00:00:01.000Z' WHERE store_id='${STORE}' AND storefront_hosted_session_id='${begun.ids.sessionId}'; UPDATE saas.storefront_hosted_checkout_sessions SET status='provider_ready',safe_code='provider_ready',version=version+1,updated_at='2026-09-05T00:00:00.001Z' WHERE store_id='${STORE}' AND id='${begun.ids.sessionId}'; UPDATE saas.payment_attempts SET status='awaiting_customer',safe_code='awaiting_customer',version=version+1,updated_at='2026-09-05T00:00:00.001Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'; UPDATE saas.payment_attempts SET status='submitted',safe_code='submitted',version=version+1,updated_at='2026-09-05T00:00:00.002Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'; UPDATE saas.payment_attempts SET status='captured',safe_code='captured',version=version+1,updated_at='2026-09-05T00:01:00.000Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'`);
    assert.equal(scalar(box,`SELECT attempt.status||':'||session.status||':'||session.safe_code||':'||(SELECT count(*) FROM saas.orders orders WHERE orders.store_id=session.store_id AND orders.id=session.order_id)||':'||(SELECT count(*) FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id=session.store_id AND reservation.reservation_group_id=session.promotion_reservation_group_id AND reservation.status='released') FROM saas.payment_attempts attempt JOIN saas.storefront_hosted_checkout_sessions session ON session.store_id=attempt.store_id AND session.payment_attempt_id=attempt.id WHERE attempt.store_id='${STORE}' AND attempt.id='${begun.ids.operationId}'`),"captured:stock_conflict:captured_stock_conflict:0:1");

    const firstBase=3300,secondBase=3400,firstDigest=createHash("sha256").update("hosted-v2-cart-3300-late-capture").digest("hex"),secondDigest=createHash("sha256").update("hosted-v2-cart-3400-stock-owner").digest("hex"),firstCart=task4Uuid(firstBase+7),secondCart=task4Uuid(secondBase+7);
    seedOfflineV2Cart(box,{cartId:firstCart,digest:firstDigest,quantity:1}); seedOfflineV2Cart(box,{cartId:secondCart,digest:secondDigest,quantity:1});
    psql(box,`ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET stock_tracking=true,stock_quantity=1 WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
    const firstPrepared=hostedAuthorityV2(box,{base:firstBase+20,cartId:firstCart,digest:firstDigest,keyId:"task4-offline"}),firstBegun=hostedBeginV2(box,{base:firstBase,prepared:firstPrepared,cartId:firstCart,digest:firstDigest}); assert.equal(firstBegun.result.outcome,"created",JSON.stringify(firstBegun.result));
    psql(box,`UPDATE saas.storefront_hosted_checkout_sessions SET status='provider_ready',safe_code='provider_ready',version=version+1,updated_at='2026-09-05T00:00:00.001Z' WHERE store_id='${STORE}' AND id='${firstBegun.ids.sessionId}'; UPDATE saas.payment_attempts SET status='awaiting_customer',safe_code='awaiting_customer',version=version+1,updated_at='2026-09-05T00:00:00.001Z' WHERE store_id='${STORE}' AND id='${firstBegun.ids.operationId}'; UPDATE saas.payment_attempts SET status='submitted',safe_code='submitted',version=version+1,updated_at='2026-09-05T00:00:00.002Z' WHERE store_id='${STORE}' AND id='${firstBegun.ids.operationId}'`);
    const secondPrepared=hostedAuthorityV2(box,{base:secondBase+20,cartId:secondCart,digest:secondDigest,keyId:"task4-offline",now:"2026-09-05T00:16:00.000Z"}),secondBegun=hostedBeginV2(box,{base:secondBase,prepared:secondPrepared,cartId:secondCart,digest:secondDigest,now:"2026-09-05T00:16:00.000Z"}); assert.equal(secondBegun.result.outcome,"created",JSON.stringify(secondBegun.result));
    psql(box,`UPDATE saas.payment_attempts SET status='captured',safe_code='captured',version=version+1,updated_at='2026-09-05T00:17:00.000Z' WHERE store_id='${STORE}' AND id='${firstBegun.ids.operationId}'`);
    assert.equal(scalar(box,`SELECT first_session.status||':'||first_session.safe_code||':'||(SELECT count(*) FROM saas.orders orders WHERE orders.store_id=first_session.store_id AND orders.id=first_session.order_id)||':'||(SELECT count(*) FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id=first_session.store_id AND reservation.reservation_group_id=first_session.promotion_reservation_group_id AND reservation.status='released')||':'||second_session.status||':'||(SELECT count(*) FROM saas.checkout_inventory_reservations hold WHERE hold.store_id=second_session.store_id AND hold.storefront_hosted_session_id=second_session.id AND hold.status='held')||':'||saas.storefront_available_stock(second_session.store_id,'${LINE}','2026-09-05T00:17:00.000Z',second_session.id) FROM saas.storefront_hosted_checkout_sessions first_session CROSS JOIN saas.storefront_hosted_checkout_sessions second_session WHERE first_session.store_id='${STORE}' AND first_session.id='${firstBegun.ids.sessionId}' AND second_session.store_id=first_session.store_id AND second_session.id='${secondBegun.ids.sessionId}'`),"stock_conflict:captured_stock_conflict:0:1:active:1:1");
    psql(box,`UPDATE saas.payment_attempts SET status='cancelled',safe_code='cancelled',version=version+1,updated_at='2026-09-05T00:18:00.000Z' WHERE store_id='${STORE}' AND id='${secondBegun.ids.operationId}'; ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET stock_tracking=true,stock_quantity=1 WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);

    const trackedBase=3500,trackedDigest=createHash("sha256").update("hosted-v2-cart-3500-frozen-tracked").digest("hex"),trackedCart=task4Uuid(trackedBase+7); seedOfflineV2Cart(box,{cartId:trackedCart,digest:trackedDigest,quantity:1});
    const trackedPrepared=hostedAuthorityV2(box,{base:trackedBase+20,cartId:trackedCart,digest:trackedDigest,keyId:"task4-offline",now:"2026-09-05T00:20:00.000Z"}),trackedBegun=hostedBeginV2(box,{base:trackedBase,prepared:trackedPrepared,cartId:trackedCart,digest:trackedDigest,now:"2026-09-05T00:20:00.000Z"}); assert.equal(trackedBegun.result.outcome,"created",JSON.stringify(trackedBegun.result)); assert.equal(scalar(box,`SELECT stock_tracked FROM saas.checkout_inventory_reservations WHERE store_id='${STORE}' AND storefront_hosted_session_id='${trackedBegun.ids.sessionId}'`),"t");
    psql(box,`ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_checkout_hold; ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET stock_tracking=false,stock_quantity=0 WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_checkout_hold; UPDATE saas.storefront_hosted_checkout_sessions SET status='provider_ready',safe_code='provider_ready',version=version+1,updated_at='2026-09-05T00:20:00.001Z' WHERE store_id='${STORE}' AND id='${trackedBegun.ids.sessionId}'; UPDATE saas.payment_attempts SET status='awaiting_customer',safe_code='awaiting_customer',version=version+1,updated_at='2026-09-05T00:20:00.001Z' WHERE store_id='${STORE}' AND id='${trackedBegun.ids.operationId}'; UPDATE saas.payment_attempts SET status='submitted',safe_code='submitted',version=version+1,updated_at='2026-09-05T00:20:00.002Z' WHERE store_id='${STORE}' AND id='${trackedBegun.ids.operationId}'; UPDATE saas.payment_attempts SET status='captured',safe_code='captured',version=version+1,updated_at='2026-09-05T00:21:00.000Z' WHERE store_id='${STORE}' AND id='${trackedBegun.ids.operationId}'`);
    assert.equal(scalar(box,`SELECT attempt.status||':'||session.status||':'||variant.stock_tracking||':'||variant.stock_quantity||':'||(SELECT count(*) FROM saas.orders orders WHERE orders.store_id=session.store_id AND orders.id=session.order_id)||':'||(SELECT count(*) FROM saas.checkout_inventory_reservations hold WHERE hold.store_id=session.store_id AND hold.storefront_hosted_session_id=session.id AND hold.status='released')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id=session.store_id AND reservation.reservation_group_id=session.promotion_reservation_group_id AND reservation.status='released') FROM saas.payment_attempts attempt JOIN saas.storefront_hosted_checkout_sessions session ON session.store_id=attempt.store_id AND session.payment_attempt_id=attempt.id JOIN saas.product_variants variant ON variant.store_id=session.store_id AND variant.id='${LINE}' WHERE attempt.store_id='${STORE}' AND attempt.id='${trackedBegun.ids.operationId}'`),"captured:stock_conflict:false:0:0:1:1");

    const untrackedBase=3600,untrackedDigest=createHash("sha256").update("hosted-v2-cart-3600-frozen-untracked").digest("hex"),untrackedCart=task4Uuid(untrackedBase+7); seedOfflineV2Cart(box,{cartId:untrackedCart,digest:untrackedDigest,quantity:1});
    const untrackedPrepared=hostedAuthorityV2(box,{base:untrackedBase+20,cartId:untrackedCart,digest:untrackedDigest,keyId:"task4-offline",now:"2026-09-05T00:22:00.000Z"}),untrackedBegun=hostedBeginV2(box,{base:untrackedBase,prepared:untrackedPrepared,cartId:untrackedCart,digest:untrackedDigest,now:"2026-09-05T00:22:00.000Z"}); assert.equal(untrackedBegun.result.outcome,"created",JSON.stringify(untrackedBegun.result)); assert.equal(scalar(box,`SELECT stock_tracked FROM saas.checkout_inventory_reservations WHERE store_id='${STORE}' AND storefront_hosted_session_id='${untrackedBegun.ids.sessionId}'`),"f");
    psql(box,`ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_checkout_hold; ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET stock_tracking=true,stock_quantity=0 WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_checkout_hold; UPDATE saas.storefront_hosted_checkout_sessions SET status='provider_ready',safe_code='provider_ready',version=version+1,updated_at='2026-09-05T00:22:00.001Z' WHERE store_id='${STORE}' AND id='${untrackedBegun.ids.sessionId}'; UPDATE saas.payment_attempts SET status='awaiting_customer',safe_code='awaiting_customer',version=version+1,updated_at='2026-09-05T00:22:00.001Z' WHERE store_id='${STORE}' AND id='${untrackedBegun.ids.operationId}'; UPDATE saas.payment_attempts SET status='submitted',safe_code='submitted',version=version+1,updated_at='2026-09-05T00:22:00.002Z' WHERE store_id='${STORE}' AND id='${untrackedBegun.ids.operationId}'; UPDATE saas.payment_attempts SET status='captured',safe_code='captured',version=version+1,updated_at='2026-09-05T00:23:00.000Z' WHERE store_id='${STORE}' AND id='${untrackedBegun.ids.operationId}'`);
    assert.equal(scalar(box,`SELECT attempt.status||':'||session.status||':'||variant.stock_tracking||':'||variant.stock_quantity||':'||(SELECT count(*) FROM saas.orders orders WHERE orders.store_id=session.store_id AND orders.id=session.order_id)||':'||(SELECT count(*) FROM saas.checkout_inventory_reservations hold WHERE hold.store_id=session.store_id AND hold.storefront_hosted_session_id=session.id AND hold.status='consumed')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id=session.store_id AND reservation.reservation_group_id=session.promotion_reservation_group_id AND reservation.status='committed') FROM saas.payment_attempts attempt JOIN saas.storefront_hosted_checkout_sessions session ON session.store_id=attempt.store_id AND session.payment_attempt_id=attempt.id JOIN saas.product_variants variant ON variant.store_id=session.store_id AND variant.id='${LINE}' WHERE attempt.store_id='${STORE}' AND attempt.id='${untrackedBegun.ids.operationId}'`),"captured:captured:true:0:1:1:1");
    psql(box,`ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET stock_tracking=false,stock_quantity=0 WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
    psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'`);
  });
  scenario("offline V2 completion atomically freezes discounts, settlement graphs and an exact replayable receipt", () => {
    const base=1000,digest=createHash("sha256").update("offline-v2-cart-1000").digest("hex"),cartId=task4Uuid(base+7); seedOfflineV2Cart(box,{cartId,digest}); activate(box,PERCENT);
    const first=completeOfflineV2(box,{base,digest}); assert.equal(first.result.outcome,"committed",JSON.stringify(first.result));
    const receipt=first.result.result.receipt;
    assert.deepEqual({subtotal:receipt.subtotalCents,shipping:receipt.shippingCents,lineDiscount:receipt.lineDiscountCents,shippingDiscount:receipt.shippingDiscountCents,discount:receipt.discountCents,total:receipt.totalCents,status:receipt.promotionStatus},{subtotal:300,shipping:40,lineDiscount:30,shippingDiscount:0,discount:30,total:310,status:{kind:"evaluated"}});
    assert.deepEqual(receipt.appliedPromotions,[{name:"percentage",benefitKind:"percentage",lineDiscountCents:30,shippingDiscountCents:0,discountCents:30}]); assert.deepEqual(receipt.gifts,[]);
    assert.deepEqual(receipt.items.map(({lineTotalCents,discountCents,payableCents})=>({lineTotalCents,discountCents,payableCents})),[{lineTotalCents:300,discountCents:30,payableCents:270}]); assert.equal(JSON.stringify(receipt).includes("promotionId"),false);
    assert.equal(scalar(box,`SELECT orders.subtotal_cents||':'||orders.shipping_cents||':'||orders.discount_cents||':'||orders.total_cents||':'||items.discount_cents||':'||(SELECT count(*) FROM saas.promotion_usage_reservations r WHERE r.store_id=orders.store_id AND r.source_kind='offline_checkout' AND r.source_reference=orders.id::text AND r.status='committed')||':'||(SELECT count(*) FROM saas.promotion_redemptions r WHERE r.store_id=orders.store_id AND r.order_id=orders.id)||':'||(SELECT count(*) FROM saas.order_promotion_snapshots s WHERE s.store_id=orders.store_id AND s.order_id=orders.id)||':'||(SELECT count(*) FROM saas.order_discount_allocations a WHERE a.store_id=orders.store_id AND a.order_id=orders.id) FROM saas.orders orders JOIN saas.order_items items ON items.store_id=orders.store_id AND items.order_id=orders.id WHERE orders.store_id='${STORE}' AND orders.id='${first.ids.orderId}'`),"300:40:30:310:30:1:1:1:1");
    const replay=JSON.parse(hostScalar(box,first.invocation)); assert.equal(replay.outcome,"operation_replayed"); assert.deepEqual(replay.result,first.result.result);
    const customerDigest=createHash("sha256").update(`task4-offline-customer:${base}`).digest("hex"),receiptDigest=createHash("sha256").update(`task4-offline-receipt:${base}`).digest("hex");
    const customerCredentials=JSON.stringify([{keyId:"customer-v2",digest:customerDigest}]).replaceAll("'","''"),receiptCredentials=JSON.stringify([{keyId:"receipt-v2",digest:receiptDigest}]).replaceAll("'","''");
    const legacyRecovery=JSON.parse(hostScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.public_checkout_recover('${STOREFRONT_HOST}','2026-09-05T00:00:00.000Z','${first.ids.operationId}','${"6".repeat(64)}')`));
    const versionedRecovery=JSON.parse(hostScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.public_checkout_recover_v2('${STOREFRONT_HOST}','2026-09-05T00:00:00.000Z','${first.ids.operationId}','${"6".repeat(64)}')`));
    assert.deepEqual(legacyRecovery,{outcome:"not_found",result:null}); assert.equal(versionedRecovery.outcome,"operation_replayed"); assert.deepEqual(versionedRecovery.result,first.result.result);
    const legacyV2Receipt=JSON.parse(hostScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.public_receipt_get('${STOREFRONT_HOST}','2026-09-05T00:00:00.000Z','${receiptCredentials}'::jsonb,'${customerCredentials}'::jsonb)`));
    const versionedV2Receipt=JSON.parse(hostScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.public_receipt_get_v2('${STOREFRONT_HOST}','2026-09-05T00:00:00.000Z','${receiptCredentials}'::jsonb,'${customerCredentials}'::jsonb)`));
    assert.deepEqual(legacyV2Receipt,{outcome:"not_found",result:null}); assert.deepEqual(versionedV2Receipt,{outcome:"found",result:receipt});
    const legacyBase=1050,legacyDigest=createHash("sha256").update("offline-v1-cart-1050").digest("hex"),legacyCart=task4Uuid(legacyBase+7); seedOfflineV2Cart(box,{cartId:legacyCart,digest:legacyDigest});
    const legacy=completeOfflineV1(box,{base:legacyBase,digest:legacyDigest,email:`offline-${base}@test.invalid`,customerCandidates:[{keyId:"customer-v2",digest:customerDigest}]}); assert.equal(legacy.result.outcome,"committed",JSON.stringify(legacy.result)); assert.equal(Object.hasOwn(legacy.result.result.receipt,"promotionStatus"),false);
    const legacyReceiptCredentials=JSON.stringify([{keyId:"receipt-v1",digest:legacy.receiptDigest}]).replaceAll("'","''");
    const legacyReceipt=JSON.parse(hostScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.public_receipt_get('${STOREFRONT_HOST}','2026-09-05T00:00:00.000Z','${legacyReceiptCredentials}'::jsonb,'${customerCredentials}'::jsonb)`)); assert.deepEqual(legacyReceipt,{outcome:"found",result:legacy.result.result.receipt});
    const legacyOrders=JSON.parse(hostScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.public_account_orders('${STOREFRONT_HOST}','2026-09-05T00:00:00.000Z','${customerCredentials}'::jsonb,20)`));
    const versionedOrders=JSON.parse(hostScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.public_account_orders_v2('${STOREFRONT_HOST}','2026-09-05T00:00:00.000Z','${customerCredentials}'::jsonb,20)`));
    assert.equal(legacyOrders.outcome,"found"); assert.deepEqual(legacyOrders.result.items,[legacy.result.result.receipt]); assert.equal(versionedOrders.outcome,"found"); assert.deepEqual(versionedOrders.result.items,[legacy.result.result.receipt,receipt]);
    const mismatch=completeOfflineV2(box,{base,digest,fingerprint:"7".repeat(64)}); assert.equal(mismatch.result.outcome,"operation_mismatch"); assert.equal(scalar(box,`SELECT count(*) FROM saas.orders WHERE store_id='${STORE}' AND id='${first.ids.orderId}'`),"1");
    psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'`);
  });
  scenario("offline V2 entitled evaluator failure rolls back customer, order, operation and reservations", () => {
    const base=1100,digest=createHash("sha256").update("offline-v2-cart-1100").digest("hex"),cartId=task4Uuid(base+7); seedOfflineV2Cart(box,{cartId,digest});
    psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'; INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) SELECT ('98000000-0000-4000-8000-'||pg_catalog.lpad(series::text,12,'0'))::uuid,'${STORE}','Complete overflow '||series,'active',1,'${JSON.stringify(validRuleDocument())}'::jsonb,'2026-09-05','2026-09-05' FROM pg_catalog.generate_series(1,101) series`);
    const failed=completeOfflineV2(box,{base,digest}); assert.deepEqual(failed.result,{outcome:"unavailable",result:null});
    assert.equal(scalar(box,`SELECT (SELECT count(*) FROM saas.orders WHERE store_id='${STORE}' AND id='${failed.ids.orderId}')||':'||(SELECT count(*) FROM saas.customers WHERE store_id='${STORE}' AND id='${failed.ids.customerId}')||':'||(SELECT count(*) FROM saas.storefront_checkout_operations WHERE operation_id='${failed.ids.operationId}')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND source_reference='${failed.ids.orderId}')||':'||(SELECT status FROM saas.storefront_carts WHERE store_id='${STORE}' AND id='${cartId}')`),"0:0:0:0:active");
    psql(box,`DELETE FROM saas.promotions WHERE store_id='${STORE}' AND id::text LIKE '98000000-%'`);
  });
  scenario("offline V2 feature-off checkout remains an exact gross sale without settlement rows", () => {
    const base=1200,digest=createHash("sha256").update("offline-v2-cart-1200").digest("hex"),cartId=task4Uuid(base+7); seedOfflineV2Cart(box,{cartId,digest}); activate(box,PERCENT);
    psql(box,`ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable; UPDATE saas.plan_features SET enabled=false WHERE plan_id='${PLAN}' AND feature_key='promotions'; ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable`);
    const completed=completeOfflineV2(box,{base,digest}); assert.equal(completed.result.outcome,"committed",JSON.stringify(completed.result)); const receipt=completed.result.result.receipt;
    assert.deepEqual({discount:receipt.discountCents,total:receipt.totalCents,status:receipt.promotionStatus,applied:receipt.appliedPromotions,gifts:receipt.gifts},{discount:0,total:340,status:{kind:"evaluated"},applied:[],gifts:[]});
    assert.equal(scalar(box,`SELECT count(*) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND source_reference='${completed.ids.orderId}'`),"0");
    psql(box,`ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable; UPDATE saas.plan_features SET enabled=true WHERE plan_id='${PLAN}' AND feature_key='promotions'; ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable; UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'`);
  });
  scenario("offline V2 completes a twenty-one-line cart gross without evaluating a prefix", () => {
    const base=1300,digest=createHash("sha256").update("offline-v2-cart-1300").digest("hex"),cartId=task4Uuid(base+7); seedOfflineV2Cart(box,{cartId,digest,lineCount:21,seriesOffset:100}); activate(box,PERCENT);
    const before=scalar(box,`SELECT count(*) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}'`),completed=completeOfflineV2(box,{base,digest}); assert.equal(completed.result.outcome,"committed",JSON.stringify(completed.result)); const receipt=completed.result.result.receipt;
    assert.deepEqual({items:receipt.items.length,subtotal:receipt.subtotalCents,discount:receipt.discountCents,total:receipt.totalCents,status:receipt.promotionStatus,applied:receipt.appliedPromotions,gifts:receipt.gifts},{items:21,subtotal:2100,discount:0,total:2140,status:{kind:"not_evaluated",reason:"cart_line_limit"},applied:[],gifts:[]});
    assert.equal(scalar(box,`SELECT count(*) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}'`),before); psql(box,`UPDATE saas.products SET status='draft',updated_at='2026-09-05T00:00:01.000Z' WHERE store_id='${STORE}' AND id::text LIKE '96000000-%'; UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'`);
  });
  scenario("offline V2 zero-value auto-added gifts still reserve, settle and replay atomically", () => {
    const base=1400,digest=createHash("sha256").update("offline-v2-cart-1400").digest("hex"),cartId=task4Uuid(base+7); seedOfflineV2Cart(box,{cartId,digest}); activate(box,GIFT);
    const first=completeOfflineV2(box,{base,digest}); assert.equal(first.result.outcome,"committed",JSON.stringify(first.result)); const receipt=first.result.result.receipt;
    assert.deepEqual({discount:receipt.discountCents,total:receipt.totalCents,gifts:receipt.gifts},{discount:0,total:340,gifts:[{variantId:LINE,quantity:1,autoAdd:true}]});
    assert.deepEqual({items:receipt.items.length,paidQuantity:receipt.items[0].quantity,giftVariant:receipt.items[1].variantId,giftQuantity:receipt.items[1].quantity,giftPayable:receipt.items[1].payableCents},{items:2,paidQuantity:3,giftVariant:LINE,giftQuantity:1,giftPayable:0});
    assert.equal(scalar(box,`SELECT count(*)||':'||count(*) FILTER(WHERE position=1 AND variant_id='${LINE}' AND unit_price_cents=0 AND quantity=1 AND discount_cents=0 AND line_total_cents=0) FROM saas.order_items WHERE store_id='${STORE}' AND order_id='${first.ids.orderId}'`),"2:1");
    assert.equal(scalar(box,`SELECT (SELECT count(*) FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id='${STORE}' AND reservation.source_kind='offline_checkout' AND reservation.source_reference='${first.ids.orderId}' AND reservation.status='committed')||':'||(SELECT count(*) FROM saas.promotion_redemptions redemption WHERE redemption.store_id='${STORE}' AND redemption.order_id='${first.ids.orderId}')||':'||(SELECT count(*) FROM saas.order_promotion_snapshots snapshot WHERE snapshot.store_id='${STORE}' AND snapshot.order_id='${first.ids.orderId}')||':'||(SELECT count(*) FROM saas.order_discount_allocations allocation WHERE allocation.store_id='${STORE}' AND allocation.order_id='${first.ids.orderId}')||':'||(SELECT saas.promotion_commit_integrity_valid_v1(redemption.store_id,redemption.redemption_group_id) FROM saas.promotion_redemptions redemption WHERE redemption.store_id='${STORE}' AND redemption.order_id='${first.ids.orderId}' LIMIT 1)`),"1:1:1:0:true");
    const replay=JSON.parse(hostScalar(box,first.invocation)); assert.equal(replay.outcome,"operation_replayed"); assert.deepEqual(replay.result,first.result.result); psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'`);
  });
  scenario("offline V2 rejects an insufficient same-variant gift before mutation and commits the gross sale", () => {
    const base=1450,digest=createHash("sha256").update("offline-v2-cart-1450").digest("hex"),cartId=task4Uuid(base+7); seedOfflineV2Cart(box,{cartId,digest,quantity:3}); activate(box,GIFT);
    psql(box,`INSERT INTO saas.inventory_locations(id,store_id,name,is_default,status,version,created_at,updated_at) VALUES(saas.inventory_deterministic_uuid('inventory-default-location','${STORE}'),'${STORE}','Task 4 depo',true,'active',1,'2026-09-04','2026-09-04') ON CONFLICT DO NOTHING; INSERT INTO saas.inventory_balances(store_id,location_id,variant_id,quantity,version,updated_at) VALUES('${STORE}',saas.inventory_deterministic_uuid('inventory-default-location','${STORE}'),'${LINE}',3,1,'2026-09-04') ON CONFLICT(store_id,location_id,variant_id) DO UPDATE SET quantity=EXCLUDED.quantity,version=saas.inventory_balances.version+1,updated_at=EXCLUDED.updated_at; ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET stock_tracking=true,stock_quantity=3 WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
    const completed=completeOfflineV2(box,{base,digest}); assert.equal(completed.result.outcome,"committed",JSON.stringify(completed.result));
    assert.deepEqual({applied:completed.result.result.receipt.appliedPromotions,gifts:completed.result.result.receipt.gifts,items:completed.result.result.receipt.items.length,total:completed.result.result.receipt.totalCents},{applied:[],gifts:[],items:1,total:340});
    assert.equal(scalar(box,`SELECT variant.stock_quantity||':'||(SELECT count(*) FROM saas.orders WHERE store_id='${STORE}' AND id='${completed.ids.orderId}')||':'||(SELECT count(*) FROM saas.order_items WHERE store_id='${STORE}' AND order_id='${completed.ids.orderId}')||':'||(SELECT count(*) FROM saas.storefront_checkout_operations WHERE operation_id='${completed.ids.operationId}')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND source_kind='offline_checkout' AND source_reference='${completed.ids.orderId}')||':'||(SELECT status FROM saas.storefront_carts WHERE store_id='${STORE}' AND id='${cartId}') FROM saas.product_variants variant WHERE variant.store_id='${STORE}' AND variant.id='${LINE}'`),"0:1:1:1:0:converted");
  });
  scenario("offline V2 same-variant gift commits only with combined sale and gift stock", () => {
    const base=1500,digest=createHash("sha256").update("offline-v2-cart-1500").digest("hex"),cartId=task4Uuid(base+7); seedOfflineV2Cart(box,{cartId,digest,quantity:3});
    psql(box,`UPDATE saas.inventory_balances SET quantity=4,version=version+1,updated_at='2026-09-04T00:00:01.000Z' WHERE store_id='${STORE}' AND location_id=saas.inventory_deterministic_uuid('inventory-default-location','${STORE}') AND variant_id='${LINE}'; ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET stock_tracking=true,stock_quantity=4 WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
    const completed=completeOfflineV2(box,{base,digest}); assert.equal(completed.result.outcome,"committed",JSON.stringify(completed.result));
    assert.equal(scalar(box,`SELECT variant.stock_quantity||':'||(SELECT count(*) FROM saas.order_items item WHERE item.store_id='${STORE}' AND item.order_id='${completed.ids.orderId}' AND item.variant_id='${LINE}')||':'||(SELECT sum(item.quantity) FROM saas.order_items item WHERE item.store_id='${STORE}' AND item.order_id='${completed.ids.orderId}' AND item.variant_id='${LINE}')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id='${STORE}' AND reservation.source_kind='offline_checkout' AND reservation.source_reference='${completed.ids.orderId}' AND reservation.status='committed')||':'||(SELECT status FROM saas.storefront_carts WHERE store_id='${STORE}' AND id='${cartId}') FROM saas.product_variants variant WHERE variant.store_id='${STORE}' AND variant.id='${LINE}'`),"0:2:4:1:converted");
    psql(box,`ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET stock_tracking=false WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'`);
  });
  scenario("zero-priced paid merchandise sharing an auto-gift variant settles only the deterministic gift tail", () => {
    const product="99000000-0000-4000-8000-000000000152",variant="99100000-0000-4000-8000-000000000152";
    psql(box,`INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES('${product}','${STORE}','zero-gift-positive','Zero gift positive','active','TRY','2026-09-04','2026-09-04'); ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES('${variant}','${product}','${STORE}','Positive sibling',100,40,false,0,'active','2026-09-04','2026-09-04'); UPDATE saas.product_variants SET price_cents=0,cost_cents=0,stock_tracking=false,stock_quantity=0 WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
    const appendPositive=(cartId)=>psql(box,`UPDATE saas.storefront_cart_items SET unit_price_cents=0 WHERE store_id='${STORE}' AND cart_id='${cartId}' AND variant_id='${LINE}'; INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at) VALUES('${cartId}','${STORE}','${product}','${variant}',1,100,1,'2026-09-04','2026-09-04')`);
    const offlineBase=1520,offlineDigest=createHash("sha256").update("offline-zero-paid-auto-gift").digest("hex"),offlineCart=task4Uuid(offlineBase+7); seedOfflineV2Cart(box,{cartId:offlineCart,digest:offlineDigest,quantity:1}); appendPositive(offlineCart); activate(box,GIFT);
    const offline=completeOfflineV2(box,{base:offlineBase,digest:offlineDigest}); assert.equal(offline.result.outcome,"committed",JSON.stringify(offline.result)); assert.deepEqual(offline.result.result.receipt.items.map(({variantId,quantity,unitPriceCents})=>({variantId,quantity,unitPriceCents})),[{variantId:LINE,quantity:1,unitPriceCents:0},{variantId:variant,quantity:1,unitPriceCents:100},{variantId:LINE,quantity:1,unitPriceCents:0}]);
    const offlineGroup=scalar(box,`SELECT reservation_group_id FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND source_reference='${offline.ids.orderId}' LIMIT 1`); assert.equal(scalar(box,`SELECT saas.promotion_auto_gift_order_lines_valid_v1('${STORE}','${offline.ids.orderId}','${offlineGroup}')`),"t");
    assert.equal(scalar(box,`BEGIN; ALTER TABLE saas.order_items DISABLE TRIGGER ALL; UPDATE saas.order_items SET quantity=2 WHERE store_id='${STORE}' AND order_id='${offline.ids.orderId}' AND position=2; SELECT saas.promotion_auto_gift_order_lines_valid_v1('${STORE}','${offline.ids.orderId}','${offlineGroup}'); ROLLBACK`),"f");
    const hostedBase=1550,hostedDigest=createHash("sha256").update("hosted-zero-paid-auto-gift").digest("hex"),hostedCart=task4Uuid(hostedBase+7); seedOfflineV2Cart(box,{cartId:hostedCart,digest:hostedDigest,quantity:1}); appendPositive(hostedCart); const prepared=hostedAuthorityV2(box,{base:hostedBase+20,cartId:hostedCart,digest:hostedDigest,keyId:"task4-offline"}); assert.equal(prepared.result.outcome,"found",JSON.stringify(prepared.result)); const begun=hostedBeginV2(box,{base:hostedBase,prepared,cartId:hostedCart,digest:hostedDigest}); assert.equal(begun.result.outcome,"created",JSON.stringify(begun.result)); psql(box,`UPDATE saas.storefront_hosted_checkout_sessions SET status='provider_ready',safe_code='provider_ready',version=version+1,updated_at='2026-09-05T00:00:00.001Z' WHERE store_id='${STORE}' AND id='${begun.ids.sessionId}'; UPDATE saas.payment_attempts SET status='awaiting_customer',safe_code='awaiting_customer',version=version+1,updated_at='2026-09-05T00:00:00.001Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'; UPDATE saas.payment_attempts SET status='submitted',safe_code='submitted',version=version+1,updated_at='2026-09-05T00:00:00.002Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'; UPDATE saas.payment_attempts SET status='captured',safe_code='captured',version=version+1,updated_at='2026-09-05T00:01:00.000Z' WHERE store_id='${STORE}' AND id='${begun.ids.operationId}'`);
    assert.equal(scalar(box,`SELECT session.status||':'||(SELECT pg_catalog.string_agg(item.position||'/'||item.variant_id::text||'/'||item.quantity||'/'||item.unit_price_cents,',' ORDER BY item.position) FROM saas.order_items item WHERE item.store_id=session.store_id AND item.order_id=session.order_id) FROM saas.storefront_hosted_checkout_sessions session WHERE session.store_id='${STORE}' AND session.id='${begun.ids.sessionId}'`),`captured:0/${LINE}/1/0,1/${variant}/1/100,2/${LINE}/1/0`);
    psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'; UPDATE saas.products SET status='draft',updated_at='2026-09-05T00:01:01.000Z' WHERE store_id='${STORE}' AND id='${product}'; ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET price_cents=100,cost_cents=40 WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
  });
  scenario("offline V2 rejects split customer credentials without partial checkout facts", () => {
    const base=1600,digest=createHash("sha256").update("task4-offline-split-cart").digest("hex"),cartId=task4Uuid(base+7);
    const firstCustomer=task4Uuid(base+10),secondCustomer=task4Uuid(base+11),firstCredential=task4Uuid(base+12),secondCredential=task4Uuid(base+13);
    const firstDigest=createHash("sha256").update("task4-offline-split-a").digest("hex"),secondDigest=createHash("sha256").update("task4-offline-split-b").digest("hex");
    seedOfflineV2Cart(box,{cartId,digest});
    psql(box,`INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,phone,version,created_at,updated_at) VALUES('${firstCustomer}','${STORE}','active','Split','One','offline-${base}@test.invalid','+90555${String(base).padStart(7,"0").slice(-7)}',1,'2026-09-05','2026-09-05'),('${secondCustomer}','${STORE}','active','Split','Two','split-two-${base}@test.invalid','+90554${String(base).padStart(7,"0").slice(-7)}',1,'2026-09-05','2026-09-05'); INSERT INTO saas.storefront_customer_credentials(id,store_id,customer_id,key_id,credential_digest,expires_at,created_at,last_seen_at) VALUES('${firstCredential}','${STORE}','${firstCustomer}','split-a','${firstDigest}','2026-10-05','2026-09-05','2026-09-05'),('${secondCredential}','${STORE}','${secondCustomer}','split-b','${secondDigest}','2026-10-05','2026-09-05','2026-09-05')`);
    const failed=completeOfflineV2(box,{base,digest,customerCandidates:[{keyId:"split-a",digest:firstDigest},{keyId:"split-b",digest:secondDigest}]});
    assert.deepEqual(failed.result,{outcome:"invalid_input",result:null});
    assert.equal(scalar(box,`SELECT (SELECT count(*) FROM saas.orders WHERE store_id='${STORE}' AND id='${failed.ids.orderId}')||':'||(SELECT count(*) FROM saas.customers WHERE store_id='${STORE}' AND id='${failed.ids.customerId}')||':'||(SELECT count(*) FROM saas.storefront_checkout_operations WHERE operation_id='${failed.ids.operationId}')||':'||(SELECT count(*) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND source_reference='${failed.ids.orderId}')||':'||(SELECT status FROM saas.storefront_carts WHERE store_id='${STORE}' AND id='${cartId}')||':'||(SELECT pg_catalog.min(version)||':'||pg_catalog.max(version) FROM saas.customers WHERE store_id='${STORE}' AND id IN ('${firstCustomer}','${secondCustomer}'))`),"0:0:0:0:active:1:1");
  });
  scenario("exact eleven promotion relations exist", () => assert.equal(scalar(box, "SELECT count(*) FROM pg_class WHERE relnamespace='saas'::regnamespace AND relname IN ('promotions','promotion_versions','promotion_targets','promotion_codes','promotion_code_batches','promotion_usage_reservations','promotion_redemptions','promotion_audit_events','promotion_operations','order_promotion_snapshots','order_discount_allocations')"), "11"));
  scenario("evaluator is installed", () => assert.equal(scalar(box, "SELECT pg_catalog.to_regprocedure('saas.promotion_evaluate_v1(uuid,jsonb,timestamp with time zone)') IS NOT NULL"), "t"));
  scenario("tenant policies are forced", () => assert.equal(scalar(box, "SELECT count(*) FROM pg_class WHERE relnamespace='saas'::regnamespace AND relname LIKE 'promotion%' AND relrowsecurity AND relforcerowsecurity"), "9"));
  scenario("app has narrow RPC execution and no direct promotion table writes", () => { assert.equal(scalar(box,"SELECT pg_catalog.has_function_privilege('celebix_saas_app','saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text[],integer)'::regprocedure,'EXECUTE')"),"t"); assert.equal(scalar(box,"SELECT pg_catalog.has_table_privilege('celebix_saas_app','saas.promotions','INSERT,UPDATE,DELETE')"),"f"); assert.equal(scalar(box,"SELECT pg_catalog.has_function_privilege('celebix_saas_identity','saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text[],integer)'::regprocedure,'EXECUTE')"),"f"); });
  scenario("every promotion helper and RPC revokes PUBLIC execute", () => assert.equal(scalar(box, "SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname LIKE 'promotion_%' AND pg_catalog.has_function_privilege('public',p.oid,'EXECUTE')"), "0"));
  scenario("rule validation rejects malformed documents", () => assert.equal(scalar(box, "SELECT saas.promotion_rule_document_valid('{}'::jsonb)"), "f"));
  scenario("code normalization rejects whitespace or formula-leading punctuation and canonically folds Turkish letters", () => { assert.equal(scalar(box, "SELECT COALESCE(saas.promotion_normalize_code(' indirim-20 '),'')"),""); assert.equal(scalar(box, "SELECT COALESCE(saas.promotion_normalize_code('-FORMULA'),'')||':'||COALESCE(saas.promotion_normalize_code('_FORMULA'),'')"),":"); assert.equal(scalar(box, "SELECT saas.promotion_normalize_code('İndirim-20')"),"INDIRIM-20"); });
  scenario("code normalization rejects non-ASCII lookalikes", () => { assert.equal(scalar(box, "SELECT COALESCE(saas.promotion_normalize_code('KODß'),'')"), ""); assert.equal(scalar(box, "SELECT COALESCE(saas.promotion_normalize_code('KODΣ'),'')"), ""); });
  scenario("strict rule validation rejects bad nested values before evaluator casts", () => { const bad = rule({kind:"percentage",percentageBps:1000}).replace('"percentageBps":1000', '"percentageBps":"bad"'); assert.equal(scalar(box, `SELECT saas.promotion_rule_document_valid('${bad}'::jsonb)`), "f"); assert.equal(evaluate(box,{cartLines:[],shippingBeforeDiscountMinor:0}).discountTotalMinor,0); });
  scenario("operations use a SHA-256 fingerprint", () => assert.equal(scalar(box, "SELECT saas.promotion_operation_fingerprint('create','{}'::jsonb)"), "71e89af0bd175d9da125da99ba0742ecb9c2c259f88b03f362ce0108fcc253cc"));
  scenario("conflict and margin checks are separate exact bounded projections", () => {
    const document=validRuleDocument();
    const conflicts=checkProjection(box,"promotion_conflicts_v1","analyst",document);
    assert.deepEqual(conflicts,{outcome:"checked",result:{blocking:false,findings:[]}});
    const legacyProjection={outcome:"checked",result:{blocking:false,conflicts:[],margin:"warn"}};
    assert.deepEqual(JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_conflicts_v1(${authorityArguments("analyst")},'${JSON.stringify(document)}'::jsonb)`)),legacyProjection);
    assert.deepEqual(JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_margin_check_v1(${authorityArguments("analyst")},'${JSON.stringify(document)}'::jsonb)`)),legacyProjection);
    const margin=checkProjection(box,"promotion_margin_check_v1","analyst",document);
    assert.deepEqual(margin,{outcome:"checked",result:{blocking:false,status:"clear",summary:{evaluatedVariantCount:1,knownCostVariantCount:1,unknownCostVariantCount:0,atRiskVariantCount:0},findings:[]}});
    const foreign="39000000-0000-4000-8000-000000000126";
    psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${foreign}','${OTHER_STORE}','Foreign check','draft',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01')`);
    assert.equal(checkProjection(box,"promotion_conflicts_v1","analyst",document,foreign,1).outcome,"not_found");
    assert.equal(checkProjection(box,"promotion_conflicts_v1","analyst",document,PERCENT,2).outcome,"version_conflict");
    assert.equal(checkProjection(box,"promotion_margin_check_v1","analyst",document,PERCENT,1).outcome,"checked");
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_conflicts_v1(${authorityArguments("analyst")},'${PERCENT}',NULL,'${JSON.stringify(document)}'::jsonb)`),"invalid_input");
  });
  scenario("conflict projection derives concrete blockers and half-open overlap warnings", () => {
    const collisionId="39000000-0000-4000-8000-000000000127", overlapId="39000000-0000-4000-8000-000000000128";
    psql(box,`INSERT INTO saas.promotion_codes(id,store_id,promotion_id,batch_id,code,status,created_at) VALUES('${collisionId}','${STORE}','${PERCENT}',NULL,'BLOCKCODE','active','2026-01-01'); INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${overlapId}','${STORE}','Existing overlap','active',1,'${JSON.stringify(validRuleDocument())}','2026-01-01','2026-01-01')`);
    const blocked=validRuleDocument();
    blocked.benefit={kind:"fixed_amount",amountMinor:500,currency:"USD"};
    blocked.targets={mode:"selected",include:[{kind:"product",id:LINE}],exclude:[{kind:"product",id:LINE}]};
    blocked.trigger={kind:"code",codes:["BLOCKCODE"]};
    blocked.schedule={timezone:"Europe/Istanbul",startsAt:"2026-09-01T00:00:00.000Z",endsAt:"2026-09-02T00:00:00.000Z"};
    blocked.limits={totalUsage:0,perCustomerUsage:0,budgetMinor:0,orderMaximumMinor:0};
    blocked.marginPolicy={kind:"maximum_percentage",maximumPercentageBps:0};
    const projection=checkProjection(box,"promotion_conflicts_v1","analyst",blocked).result;
    assert.equal(projection.blocking,true);
    assert.deepEqual(projection.findings.map((finding)=>finding.code),["benefit_currency_mismatch","budget_zero","coupon_code_conflict","customer_usage_limit_zero","margin_percentage_zero","no_eligible_catalog_items","order_maximum_zero","schedule_ended","target_include_exclude_conflict","usage_limit_zero"]);
    for (const finding of projection.findings) assert.deepEqual(Object.keys(finding).sort(),["code","relatedPromotionId","relatedPromotionName","severity"]);
    assert.equal(projection.blocking,projection.findings.some((finding)=>finding.severity==="blocking"));
    const foreign=validRuleDocument(); foreign.targets={mode:"selected",include:[{kind:"product",id:OTHER_PRODUCT}],exclude:[]};
    assert.deepEqual(checkProjection(box,"promotion_conflicts_v1","analyst",foreign).result,{blocking:true,findings:[{code:"reference_unavailable",severity:"blocking",relatedPromotionId:null,relatedPromotionName:null}]});
    const warning=checkProjection(box,"promotion_conflicts_v1","analyst",validRuleDocument()).result;
    assert.deepEqual(warning,{blocking:false,findings:[{code:"schedule_target_overlap",severity:"warning",relatedPromotionId:overlapId,relatedPromotionName:"Existing overlap"}]});
    const boundary=validRuleDocument(); boundary.schedule={timezone:"Europe/Istanbul",startsAt:"2026-09-06T00:00:00.000Z",endsAt:"2026-09-07T00:00:00.000Z"};
    psql(box,`UPDATE saas.promotions SET rule_document=pg_catalog.jsonb_set(rule_document,'{schedule}','{"timezone":"Europe/Istanbul","startsAt":"2026-09-05T00:00:00.000Z","endsAt":"2026-09-06T00:00:00.000Z"}'::jsonb) WHERE store_id='${STORE}' AND id='${overlapId}'`);
    assert.deepEqual(checkProjection(box,"promotion_conflicts_v1","analyst",boundary).result,{blocking:false,findings:[]});
    const unrelatedProduct="39000000-0000-4000-8000-000000000129", unrelatedVariant="39000000-0000-4000-8000-000000000130";
    psql(box,`INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES('${unrelatedProduct}','${STORE}','conflict-unrelated','Conflict unrelated','active','TRY','2026-01-01','2026-01-01'); ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES('${unrelatedVariant}','${unrelatedProduct}','${STORE}','Conflict unrelated',100,40,false,0,'active','2026-01-01','2026-01-01'); ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
    const productOverlap=validRuleDocument(); productOverlap.targets={mode:"selected",include:[{kind:"product",id:LINE}],exclude:[]};
    const variantOverlap=validRuleDocument(); variantOverlap.targets={mode:"selected",include:[{kind:"variant",id:LINE}],exclude:[]};
    const unrelatedVariantOverlap=validRuleDocument(); unrelatedVariantOverlap.targets={mode:"selected",include:[{kind:"variant",id:unrelatedVariant}],exclude:[]};
    psql(box,`UPDATE saas.promotions SET rule_document='${JSON.stringify(productOverlap)}'::jsonb WHERE store_id='${STORE}' AND id='${overlapId}'`);
    assert.deepEqual(checkProjection(box,"promotion_conflicts_v1","analyst",variantOverlap).result,{blocking:false,findings:[{code:"schedule_target_overlap",severity:"warning",relatedPromotionId:overlapId,relatedPromotionName:"Existing overlap"}]});
    assert.deepEqual(checkProjection(box,"promotion_conflicts_v1","analyst",unrelatedVariantOverlap).result,{blocking:false,findings:[]});
    const stockProvider="39000000-0000-4000-8000-000000000140", stockLink="39000000-0000-4000-8000-000000000141", stockSession="39000000-0000-4000-8000-000000000142", stockAttempt="39000000-0000-4000-8000-000000000143", stockReservation="39000000-0000-4000-8000-000000000144";
    const sealed=`'{"algorithm":"A256GCM","ciphertext":"cXVpY2stbGluay10b2tlbi1jaXBoZXJ0ZXh0","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}'::jsonb`;
    const address=`'{"recipientName":"Promotion Stock","phone":"+905551110000","line1":"Test 1","city":"Istanbul","country":"TR"}'::jsonb`;
    psql(box,`ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
      UPDATE saas.product_variants SET stock_tracking=true,stock_quantity=2 WHERE store_id='${STORE}' AND id='${LINE}';
      ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;
      INSERT INTO saas.checkout_provider_configs(id,store_id,provider_key,status,public_origin,configuration_key_id,sealed_configuration,version,created_at,updated_at)
        VALUES('${stockProvider}','${STORE}','paytr','active','https://www.paytr.com','key-1',${sealed},1,'2026-09-04T23:50:00Z','2026-09-04T23:50:00Z');
      INSERT INTO saas.quick_order_links(id,store_id,creating_membership_id,provider_config_id,status,token_digest,token_key_id,sealed_token,customer_name,customer_email,customer_phone,shipping_address,billing_address,internal_label,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,expires_at,version,created_at,updated_at)
        VALUES('${stockLink}','${STORE}','${ACTORS.store_owner.membership}','${stockProvider}','active',repeat('a',63)||'1','key-1',${sealed},'Promotion Stock','stock@test.invalid','+905551110000',${address},${address},'promotion gift stock','TRY',100,0,0,100,'2026-09-05T23:50:00Z',1,'2026-09-04T23:50:00Z','2026-09-04T23:50:00Z');
      INSERT INTO saas.quick_order_redemption_sessions(id,store_id,quick_order_link_id,cookie_digest,expires_at,version,created_at,updated_at)
        VALUES('${stockSession}','${STORE}','${stockLink}',repeat('b',63)||'1','2026-09-05T01:00:00Z',1,'2026-09-04T23:59:00Z','2026-09-04T23:59:00Z');
      INSERT INTO saas.checkout_payment_attempts(id,store_id,quick_order_link_id,redemption_session_id,provider_config_id,provider_config_version,configuration_digest,configuration_key_id,sealed_configuration,merchant_oid,expected_subtotal_cents,expected_shipping_cents,expected_discount_cents,expected_payment_amount,currency,status,hold_expires_at,version,created_at,updated_at)
        VALUES('${stockAttempt}','${STORE}','${stockLink}','${stockSession}','${stockProvider}',1,repeat('c',64),'key-1',${sealed},'39000000000040008000000000000143',100,0,0,100,'TRY','reserved','2026-09-05T00:04:00Z',1,'2026-09-04T23:59:00Z','2026-09-04T23:59:00Z');
      INSERT INTO saas.checkout_inventory_reservations(id,store_id,attempt_id,quick_order_link_id,product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at)
        VALUES('${stockReservation}','${STORE}','${stockAttempt}','${stockLink}','${LINE}','${LINE}',2,true,'held','2026-09-04T23:59:00Z',1,'2026-09-04T23:59:00Z')`);
    assert.equal(scalar(box,`SELECT stock_quantity||':'||saas.storefront_available_stock('${STORE}','${LINE}','2026-09-05T00:00:00Z',NULL) FROM saas.product_variants WHERE store_id='${STORE}' AND id='${LINE}'`),"2:0");
    const gift=validRuleDocument(); gift.benefit={kind:"gift",giftVariantId:LINE,quantity:1,autoAdd:true};
    assert.deepEqual(checkProjection(box,"promotion_conflicts_v1","analyst",gift).result,{blocking:true,findings:[{code:"gift_stock_unavailable",severity:"blocking",relatedPromotionId:null,relatedPromotionName:null}]});
    psql(box,`UPDATE saas.checkout_inventory_reservations SET status='released',released_at='2026-09-05T00:00:01Z',version=2,updated_at='2026-09-05T00:00:01Z' WHERE id='${stockReservation}'; ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET stock_tracking=false,stock_quantity=0 WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile; DELETE FROM saas.promotion_codes WHERE store_id='${STORE}' AND id='${collisionId}'; DELETE FROM saas.promotions WHERE store_id='${STORE}' AND id='${overlapId}'`);
  });
  scenario("margin projection uses canonical prices and preserves unknown cost", () => {
    const products=["39000000-0000-4000-8000-000000000131","39000000-0000-4000-8000-000000000132","39000000-0000-4000-8000-000000000133","39000000-0000-4000-8000-000000000134"], list="39000000-0000-4000-8000-000000000135", listRule="39000000-0000-4000-8000-000000000136";
    psql(box,`INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES('${products[0]}','${STORE}','projection-margin-risk','margin risk','active','TRY','2026-01-01','2026-01-01'),('${products[1]}','${STORE}','projection-margin-unknown','margin unknown','active','TRY','2026-01-01','2026-01-01'),('${products[2]}','${STORE}','projection-margin-safe','margin safe','active','TRY','2026-01-01','2026-01-01'),('${products[3]}','${STORE}','projection-margin-price-list','margin price list','active','TRY','2026-01-01','2026-01-01'); ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES('${products[0]}','${products[0]}','${STORE}','risk',100,95,false,0,'active','2026-01-01','2026-01-01'),('${products[1]}','${products[1]}','${STORE}','unknown',100,NULL,false,0,'active','2026-01-01','2026-01-01'),('${products[2]}','${products[2]}','${STORE}','safe',100,20,false,0,'active','2026-01-01','2026-01-01'),('${products[3]}','${products[3]}','${STORE}','price list',100,80,false,0,'active','2026-01-01','2026-01-01'); ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile; INSERT INTO saas.price_lists(id,store_id,name,status,version,activated_at,created_at,updated_at) VALUES('${list}','${STORE}','Margin canonical list','active',1,'2026-09-01','2026-01-01','2026-09-01'); INSERT INTO saas.price_list_items(store_id,price_list_id,variant_id,price_cents,created_at) VALUES('${STORE}','${list}','${products[3]}',70,'2026-01-01'); INSERT INTO saas.price_list_rules(id,store_id,price_list_id,channel,customer_tag_id,starts_at,ends_at,priority,created_at) VALUES('${listRule}','${STORE}','${list}','storefront',NULL,'2026-09-01',NULL,100,'2026-01-01')`);
    const document=validRuleDocument(); document.targets={mode:"selected",include:products.map((id)=>({kind:"product",id})),exclude:[]};
    const projection=checkProjection(box,"promotion_margin_check_v1","analyst",document).result;
    assert.deepEqual(projection,{blocking:false,status:"warning",summary:{evaluatedVariantCount:4,knownCostVariantCount:3,unknownCostVariantCount:1,atRiskVariantCount:2},findings:[{code:"below_cost_risk",severity:"warning",count:2,sampleVariantIds:[products[0],products[3]]},{code:"cost_unknown",severity:"warning",count:1,sampleVariantIds:[products[1]]}]});
    const floor=structuredClone(document); floor.marginPolicy={kind:"floor_at_cost"}; assert.deepEqual(checkProjection(box,"promotion_margin_check_v1","analyst",floor).result,projection);
    const capped=validRuleDocument(); capped.targets={mode:"selected",include:products.slice(0,2).map((id)=>({kind:"product",id})),exclude:[]}; capped.marginPolicy={kind:"maximum_percentage",maximumPercentageBps:400};
    assert.deepEqual(checkProjection(box,"promotion_margin_check_v1","analyst",capped).result,{blocking:false,status:"unknown",summary:{evaluatedVariantCount:2,knownCostVariantCount:1,unknownCostVariantCount:1,atRiskVariantCount:0},findings:[{code:"cost_unknown",severity:"warning",count:1,sampleVariantIds:[products[1]]}]});
  });
  await asyncScenario("publish readiness is enforced atomically by lifecycle and active update", async () => {
    const promotion="39000000-0000-4000-8000-000000000141", createOperation="39000000-0000-4000-8000-000000000142", blockedOperation="39000000-0000-4000-8000-000000000143", updateOperation="39000000-0000-4000-8000-000000000144", publishOperation="39000000-0000-4000-8000-000000000145", liveBlockedOperation="39000000-0000-4000-8000-000000000146";
    const blocked=validRuleDocument(); blocked.limits={...blocked.limits,totalUsage:0};
    assert.equal(appScalar(box,createCall(box,"store_owner",promotion,createOperation,"Readiness blocked",blocked)),`created:${promotion}`);
    const actor=authority("store_owner"), lifecycleFingerprint=scalar(box,`SELECT saas.promotion_operation_fingerprint_v2('lifecycle','${STORE}',pg_catalog.jsonb_build_object('id','${promotion}'::uuid,'expectedVersion',1,'nextStatus','active'))`);
    const blockedResult=JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_lifecycle_v1('${actor.store}','${actor.principal}','${actor.membership}','${actor.plan}','${actor.planCode}',${actor.planVersion},'2026-09-05T00:00:00Z','${blockedOperation}','${lifecycleFingerprint}','${promotion}',1,'active')`));
    assert.equal(blockedResult.outcome,"publish_blocked"); assert.equal(blockedResult.result.blocking,true); assert.deepEqual(blockedResult.result.findings.map((finding)=>finding.code),["usage_limit_zero"]);
    assert.equal(scalar(box,`SELECT version||':'||(SELECT count(*) FROM saas.promotion_versions WHERE store_id=p.store_id AND promotion_id=p.id)||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id=p.store_id AND promotion_id=p.id)||':'||(SELECT count(*) FROM saas.promotion_operations WHERE store_id=p.store_id AND operation_id='${blockedOperation}') FROM saas.promotions p WHERE store_id='${STORE}' AND id='${promotion}'`),"1:1:1:0");
    const valid=validRuleDocument(); assert.equal(appScalar(box,updateCall(box,"store_owner",promotion,updateOperation,1,"Readiness valid",valid)),`updated:${promotion}`); assert.equal(appScalar(box,lifecycleCall(box,"store_owner",promotion,publishOperation,2,"active")),`updated:${promotion}`);
    const contradiction=validRuleDocument(); contradiction.targets={mode:"selected",include:[{kind:"product",id:LINE}],exclude:[{kind:"product",id:LINE}]};
    const encoded=JSON.stringify(contradiction).replaceAll("'","''"), fingerprint=scalar(box,`SELECT saas.promotion_operation_fingerprint_v2('update','${STORE}',pg_catalog.jsonb_build_object('id','${promotion}'::uuid,'expectedVersion',3,'name','Live blocked','ruleDocument','${encoded}'::jsonb))`);
    const before=scalar(box,`SELECT version||':'||(SELECT count(*) FROM saas.promotion_versions WHERE store_id=p.store_id AND promotion_id=p.id)||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id=p.store_id AND promotion_id=p.id) FROM saas.promotions p WHERE store_id='${STORE}' AND id='${promotion}'`);
    const liveBlocked=JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_update_v1('${actor.store}','${actor.principal}','${actor.membership}','${actor.plan}','${actor.planCode}',${actor.planVersion},'2026-09-05T00:00:00Z','${liveBlockedOperation}','${fingerprint}','${promotion}',3,'Live blocked','${encoded}'::jsonb)`));
    assert.equal(liveBlocked.outcome,"publish_blocked"); assert.equal(liveBlocked.result.blocking,true); assert.equal(scalar(box,`SELECT version||':'||(SELECT count(*) FROM saas.promotion_versions WHERE store_id=p.store_id AND promotion_id=p.id)||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id=p.store_id AND promotion_id=p.id) FROM saas.promotions p WHERE store_id='${STORE}' AND id='${promotion}'`),before);

    const giftPromotion="39000000-0000-4000-8000-000000000147", giftCreate="39000000-0000-4000-8000-000000000148", giftPublish="39000000-0000-4000-8000-000000000149", gift=validRuleDocument(); gift.benefit={kind:"gift",giftVariantId:LINE,quantity:1,autoAdd:true};
    assert.equal(appScalar(box,createCall(box,"store_owner",giftPromotion,giftCreate,"Readiness race",gift)),`created:${giftPromotion}`);
    psql(box,"ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile");
    const blocker=openPsqlSession(box);
    try {
      blocker.write(`BEGIN; UPDATE saas.product_variants SET status='archived',archived_at='2026-09-05T00:00:00Z',updated_at='2026-09-05T00:00:00Z' WHERE store_id='${STORE}' AND id='${LINE}'; SELECT 'REFERENCE_ARCHIVE_BARRIER';\n`);
      await blocker.waitFor(/REFERENCE_ARCHIVE_BARRIER/);
      const pending=psqlAsync(box,`SET application_name='promotion_publish_readiness_race'; SET ROLE celebix_saas_app; ${lifecycleCall(box,"store_owner",giftPromotion,giftPublish,1,"active")}; RESET ROLE`);
      await waitForScalar(box,"SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name='promotion_publish_readiness_race' AND wait_event_type='Lock')","t");
      blocker.end("COMMIT;\n");
      const [archiveResult,publishResult]=await Promise.all([blocker.completion,pending]); assert.equal(archiveResult.status,0,archiveResult.stderr); assert.equal(publishResult.status,0,publishResult.stderr); assert.equal(publishResult.stdout.trim(),"invalid_reference:");
      assert.equal(scalar(box,`SELECT version||':'||(SELECT count(*) FROM saas.promotion_operations WHERE store_id=p.store_id AND operation_id='${giftPublish}') FROM saas.promotions p WHERE store_id='${STORE}' AND id='${giftPromotion}'`),"1:0");
    } finally {
      if (!blocker.child.killed && blocker.child.exitCode===null) blocker.end("ROLLBACK;\n");
      psql(box,`UPDATE saas.product_variants SET status='active',archived_at=NULL,updated_at='2026-09-05T00:00:01Z' WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
    }

    const raceCodeId="39000000-0000-4000-8000-000000000150", raceOperation="39000000-0000-4000-8000-000000000151", raceRule=validRuleDocument(); raceRule.trigger={kind:"code",codes:["READINESSRACE"]};
    const raceEncoded=JSON.stringify(raceRule).replaceAll("'","''"), raceFingerprint=scalar(box,`SELECT saas.promotion_operation_fingerprint_v2('update','${STORE}',pg_catalog.jsonb_build_object('id','${promotion}'::uuid,'expectedVersion',3,'name','Code race blocked','ruleDocument','${raceEncoded}'::jsonb))`), raceBefore=scalar(box,`SELECT version||':'||(SELECT count(*) FROM saas.promotion_versions WHERE store_id=p.store_id AND promotion_id=p.id)||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id=p.store_id AND promotion_id=p.id) FROM saas.promotions p WHERE store_id='${STORE}' AND id='${promotion}'`);
    const codeBlocker=openPsqlSession(box);
    try {
      codeBlocker.write(`BEGIN; SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-code:${STORE}',0)); INSERT INTO saas.promotion_codes(id,store_id,promotion_id,batch_id,code,status,created_at) VALUES('${raceCodeId}','${STORE}','${PERCENT}',NULL,'READINESSRACE','active','2026-09-05T00:00:00Z'); SELECT 'CODE_NAMESPACE_BARRIER';\n`);
      await codeBlocker.waitFor(/CODE_NAMESPACE_BARRIER/);
      const pending=psqlAsync(box,`SET application_name='promotion_publish_code_race'; SET ROLE celebix_saas_app; SELECT outcome||':'||COALESCE(result_payload->'findings'->0->>'code','') FROM saas.promotion_update_v1('${actor.store}','${actor.principal}','${actor.membership}','${actor.plan}','${actor.planCode}',${actor.planVersion},'2026-09-05T00:00:00Z','${raceOperation}','${raceFingerprint}','${promotion}',3,'Code race blocked','${raceEncoded}'::jsonb); RESET ROLE`);
      await waitForScalar(box,"SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name='promotion_publish_code_race' AND wait_event_type='Lock')","t");
      codeBlocker.end("COMMIT;\n");
      const [codeInsertResult,updateResult]=await Promise.all([codeBlocker.completion,pending]); assert.equal(codeInsertResult.status,0,codeInsertResult.stderr); assert.equal(updateResult.status,0,updateResult.stderr); assert.equal(updateResult.stdout.trim(),"publish_blocked:coupon_code_conflict");
      assert.equal(scalar(box,`SELECT version||':'||(SELECT count(*) FROM saas.promotion_versions WHERE store_id=p.store_id AND promotion_id=p.id)||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id=p.store_id AND promotion_id=p.id) FROM saas.promotions p WHERE store_id='${STORE}' AND id='${promotion}'`),raceBefore); assert.equal(scalar(box,`SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_id='${raceOperation}'`),"0");
    } finally {
      if (!codeBlocker.child.killed && codeBlocker.child.exitCode===null) codeBlocker.end("ROLLBACK;\n");
      psql(box,`DELETE FROM saas.promotion_codes WHERE store_id='${STORE}' AND id='${raceCodeId}'`);
    }
  });
  scenario("draft rules never apply", () => assert.equal(scalar(box, "SELECT saas.promotion_evaluate_v1('00000000-0000-4000-8000-000000000001','{\"storeId\":\"00000000-0000-4000-8000-000000000001\",\"customerId\":null,\"paidOrderCount\":0,\"customerSegmentIds\":[],\"customerTagIds\":[],\"cartLines\":[],\"shippingMethodId\":null,\"paymentMethodId\":null,\"shippingBeforeDiscountMinor\":0,\"currency\":\"TRY\",\"storeLocalTime\":\"2026-09-05T00:00:00.000Z\",\"salesChannel\":\"storefront\",\"submittedCodes\":[],\"abandonedCart\":null}'::jsonb,'2026-09-05T00:00:00Z')->>'discountTotalMinor'"), "0"));
  scenario("percentage promotion uses integer minor units", () => { activate(box,PERCENT); assert.equal(discount(box),"30"); });
  scenario("fixed promotion caps at eligible cart value", () => { activate(box,FIXED); assert.equal(discount(box),"50"); });
  scenario("shipping promotion is bounded by shipping", () => { activate(box,SHIPPING); assert.equal(discount(box),"40"); });
  scenario("quantity tier selects the reached percentage", () => { activate(box,TIER); assert.equal(discount(box),"30"); });
  scenario("bundle price calculates a bounded saving", () => { activate(box,BUNDLE); psql(box,`UPDATE saas.products SET status='active' WHERE id='${BUNDLE_LINE}'`); assert.equal(String(evaluate(box,{cartLines:bundleCart(3)}).discountTotalMinor),"100"); psql(box,`UPDATE saas.products SET status='draft' WHERE id='${BUNDLE_LINE}'`); });
  scenario("buy X get Y discounts the deterministic cheapest unit", () => { activate(box,BUY); assert.equal(discount(box),"100"); });
  scenario("gift produces zero-paid immutable gift effect", () => { activate(box,GIFT); assert.equal(evaluate(box,{cartLines:[],shippingBeforeDiscountMinor:0}).gifts[0].paidMinor,0); });
  scenario("gift availability is quantity-aware and manual gifts deterministically discount one authoritative line", () => {
    const id="73000000-0000-4000-8000-000000000126", auto=validRuleDocument(); auto.benefit={kind:"gift",giftVariantId:LINE,quantity:2,autoAdd:true};
    psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','quantity-aware gift','active',1,'${JSON.stringify(auto)}','2026-01-01','2026-01-01')`); activate(box,id);
    const automatic=evaluate(box,{cartLines:[],shippingBeforeDiscountMinor:0});
    assert.deepEqual(automatic.gifts,[{promotionId:id,variantId:LINE,quantity:2,paidMinor:0,autoAdd:true}]); assert.deepEqual(automatic.lineEffects,[]); assert.equal(automatic.discountTotalMinor,0); parseContract(automatic);
    psql(box,`UPDATE saas.product_variants SET status='archived',archived_at='2026-09-05T00:00:00.000Z',updated_at='2026-09-05T00:00:00.000Z' WHERE store_id='${STORE}' AND id='${LINE}'`);
    let unavailable=evaluate(box,{cartLines:[],shippingBeforeDiscountMinor:0});
    assert.deepEqual(unavailable.gifts,[]); assert.equal(unavailable.appliedPromotions.some((item)=>item.promotionId===id),false);
    psql(box,`UPDATE saas.product_variants SET status='active',archived_at=NULL,updated_at='2026-09-05T00:00:00.000Z' WHERE store_id='${STORE}' AND id='${LINE}'; UPDATE saas.products SET status='archived',archived_at='2026-09-05T00:00:00.000Z',updated_at='2026-09-05T00:00:00.000Z' WHERE store_id='${STORE}' AND id='${LINE}'`);
    unavailable=evaluate(box,{cartLines:[],shippingBeforeDiscountMinor:0});
    assert.deepEqual(unavailable.gifts,[]); assert.equal(unavailable.appliedPromotions.some((item)=>item.promotionId===id),false);
    psql(box,`UPDATE saas.products SET status='active',archived_at=NULL,updated_at='2026-09-05T00:00:00.000Z' WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET stock_tracking=true,stock_quantity=2 WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;
      INSERT INTO saas.checkout_payment_attempts(id,store_id,quick_order_link_id,redemption_session_id,provider_config_id,provider_config_version,configuration_digest,configuration_key_id,sealed_configuration,merchant_oid,expected_subtotal_cents,expected_shipping_cents,expected_discount_cents,expected_payment_amount,currency,status,hold_expires_at,version,created_at,updated_at)
      SELECT '73000000-0000-4000-8000-000000000140',store_id,quick_order_link_id,redemption_session_id,provider_config_id,provider_config_version,configuration_digest,configuration_key_id,sealed_configuration,'73000000000040008000000000000140',expected_subtotal_cents,expected_shipping_cents,expected_discount_cents,expected_payment_amount,currency,'reserved','2026-09-05T00:05:00.000Z',1,'2026-09-05T00:00:00.000Z','2026-09-05T00:00:00.000Z' FROM saas.checkout_payment_attempts WHERE id='39000000-0000-4000-8000-000000000143';
      INSERT INTO saas.checkout_inventory_reservations(id,store_id,attempt_id,quick_order_link_id,product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at) VALUES('73000000-0000-4000-8000-000000000141','${STORE}','73000000-0000-4000-8000-000000000140','39000000-0000-4000-8000-000000000141','${LINE}','${LINE}',1,true,'held','2026-09-05T00:00:00.000Z',1,'2026-09-05T00:00:00.000Z')`);
    assert.equal(scalar(box,`SELECT saas.storefront_available_stock('${STORE}','${LINE}','2026-09-05T00:00:00.000Z',NULL)`),"1");
    unavailable=evaluate(box,{cartLines:[],shippingBeforeDiscountMinor:0});
    assert.deepEqual(unavailable.gifts,[]); assert.equal(unavailable.appliedPromotions.some((item)=>item.promotionId===id),false); assert.equal(unavailable.rejectedPromotions.some((item)=>item.promotionId===id&&item.reason==="conditions_not_met"),true);
    assert.deepEqual(checkProjection(box,"promotion_conflicts_v1","analyst",auto).result,{blocking:true,findings:[{code:"gift_stock_unavailable",severity:"blocking",relatedPromotionId:null,relatedPromotionName:null}]});
    psql(box,`ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET stock_quantity=5 WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
    assert.equal(scalar(box,`SELECT saas.storefront_available_stock('${STORE}','${LINE}','2026-09-05T00:00:00.000Z',NULL)`),"4");
    const heldPaidDemand=evaluate(box);
    assert.deepEqual(heldPaidDemand.gifts,[]); assert.equal(heldPaidDemand.appliedPromotions.some((item)=>item.promotionId===id),false); assert.equal(heldPaidDemand.rejectedPromotions.some((item)=>item.promotionId===id&&item.reason==="conditions_not_met"),true);
    psql(box,`UPDATE saas.checkout_inventory_reservations SET status='released',released_at='2026-09-05T00:00:01.000Z',version=2,updated_at='2026-09-05T00:00:01.000Z' WHERE id='73000000-0000-4000-8000-000000000141'`);
    assert.deepEqual(evaluate(box).gifts,[{promotionId:id,variantId:LINE,quantity:2,paidMinor:0,autoAdd:true}]);

    const competitorId="73000000-0000-4000-8000-000000000138", firstAuto=structuredClone(auto), secondAuto=structuredClone(auto);
    firstAuto.benefit.quantity=1; firstAuto.combinationPolicy={kind:"benefit_classes",benefitClasses:["gift"]}; secondAuto.benefit.quantity=1; secondAuto.combinationPolicy={kind:"benefit_classes",benefitClasses:["gift"]};
    psql(box,`UPDATE saas.promotions SET status='active',rule_document='${JSON.stringify(firstAuto)}'::jsonb WHERE store_id='${STORE}' AND id='${id}'; INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${competitorId}','${STORE}','Cumulative gift competitor','active',1,'${JSON.stringify(secondAuto)}'::jsonb,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z'); ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET stock_quantity=4 WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
    const cumulative=evaluate(box);
    assert.deepEqual(cumulative.gifts,[{promotionId:id,variantId:LINE,quantity:1,paidMinor:0,autoAdd:true}]); assert.deepEqual(cumulative.appliedPromotions.map(({promotionId})=>promotionId),[id]); assert.equal(cumulative.rejectedPromotions.some(({promotionId,reason})=>promotionId===competitorId&&reason==="conditions_not_met"),true); parseContract(cumulative);
    const cumulativeQuote=quoteV2(box), cumulativeReplay=quoteV2(box); assert.deepEqual(cumulativeReplay,cumulativeQuote); assert.equal(cumulativeQuote.outcome,"quoted",JSON.stringify(cumulativeQuote)); assert.deepEqual({applied:cumulativeQuote.result.quote.appliedPromotions.map(({name})=>name),gifts:cumulativeQuote.result.quote.gifts,items:cumulativeQuote.result.quote.cart.items.length},{applied:["quantity-aware gift"],gifts:[{variantId:LINE,quantity:1,autoAdd:true}],items:2}); parseQuoteV2Contract(cumulativeQuote.result.quote);
    const reorderedSimulation=JSON.parse(simulateSelected(box,"analyst",{id,expectedVersion:1,name:"quantity-aware gift",ruleDocument:firstAuto})).result.evaluation;
    assert.deepEqual({applied:reorderedSimulation.appliedPromotions.map(({promotionId})=>promotionId),gifts:reorderedSimulation.gifts,rejected:reorderedSimulation.rejectedPromotions},{applied:[id],gifts:cumulative.gifts,rejected:cumulative.rejectedPromotions});
    psql(box,`DELETE FROM saas.promotions WHERE store_id='${STORE}' AND id='${competitorId}'; UPDATE saas.promotions SET rule_document='${JSON.stringify(auto)}'::jsonb WHERE store_id='${STORE}' AND id='${id}'`);
    const qualifier="73000000-0000-4000-8000-000000000129";
    psql(box,`INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES('${qualifier}','${STORE}','gift-qualifier','Gift qualifier','active','TRY','2026-01-01','2026-01-01'); ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES('${qualifier}','${qualifier}','${STORE}','Gift qualifier',50,NULL,false,0,'active','2026-01-01','2026-01-01'); ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
    const autoFloor=structuredClone(auto); autoFloor.targets={mode:"selected",include:[{kind:"variant",id:qualifier}],exclude:[]}; autoFloor.marginPolicy={kind:"floor_at_cost"}; psql(box,`UPDATE saas.promotions SET rule_document='${JSON.stringify(autoFloor)}'::jsonb WHERE store_id='${STORE}' AND id='${id}'`);
    const autoUnknownCost=evaluate(box,{cartLines:[{...context().cartLines[0],lineId:qualifier,position:0,productId:qualifier,variantId:qualifier,quantity:1}],shippingBeforeDiscountMinor:0}); assert.deepEqual(autoUnknownCost.gifts,[{promotionId:id,variantId:LINE,quantity:2,paidMinor:0,autoAdd:true}]); assert.deepEqual(autoUnknownCost.lineEffects,[]); assert.equal(autoUnknownCost.discountTotalMinor,0); parseContract(autoUnknownCost);

    const manual=structuredClone(auto); manual.benefit.autoAdd=false;
    psql(box,`UPDATE saas.promotions SET rule_document='${JSON.stringify(manual)}'::jsonb WHERE store_id='${STORE}' AND id='${id}'`);
    const chosen="73000000-0000-4000-8000-000000000127", later="73000000-0000-4000-8000-000000000128";
    const manualLines=[{...context().cartLines[0],lineId:chosen,position:0,quantity:2},{...context().cartLines[0],lineId:later,position:1,quantity:2}];
    const manualValue=evaluate(box,{cartLines:manualLines,shippingBeforeDiscountMinor:0});
    assert.deepEqual(manualValue.gifts,[{promotionId:id,variantId:LINE,quantity:2,paidMinor:0,autoAdd:false,lineId:chosen}]);
    assert.deepEqual(manualValue.lineEffects,[{promotionId:id,lineId:chosen,discountMinor:200,giftQuantity:0}]); assert.equal(manualValue.discountTotalMinor,200); parseContract(manualValue);
    const oneGiftLine=[{...context().cartLines[0],lineId:chosen,position:0,quantity:2}];
    const assertGiftRejected=(value,reason="conditions_not_met")=>{ assert.deepEqual(value.gifts,[]); assert.equal(value.appliedPromotions.some((item)=>item.promotionId===id),false); assert.equal(value.lineEffects.some((item)=>item.promotionId===id),false); assert.equal(value.rejectedPromotions.some((item)=>item.promotionId===id&&item.reason===reason),true); parseContract(value); };
    const updateManualRule=(document)=>psql(box,`UPDATE saas.promotions SET rule_document='${JSON.stringify(document)}'::jsonb WHERE store_id='${STORE}' AND id='${id}'`);
    const orderCapped=structuredClone(manual); orderCapped.limits.orderMaximumMinor=199; updateManualRule(orderCapped); assertGiftRejected(evaluate(box,{cartLines:oneGiftLine,shippingBeforeDiscountMinor:0}));
    const budgetCapped=structuredClone(manual); budgetCapped.limits.budgetMinor=199; updateManualRule(budgetCapped); assertGiftRejected(evaluate(box,{cartLines:oneGiftLine,shippingBeforeDiscountMinor:0}));
    const floorCapped=structuredClone(manual); floorCapped.marginPolicy={kind:"floor_at_cost"}; updateManualRule(floorCapped); const floorRejected=evaluate(box,{cartLines:oneGiftLine,shippingBeforeDiscountMinor:0}); assertGiftRejected(floorRejected); assert.equal(floorRejected.discountTotalMinor,0); psql(box,`UPDATE saas.product_variants SET cost_cents=NULL WHERE store_id='${STORE}' AND id='${LINE}'`); const unknownCostManual=evaluate(box,{cartLines:oneGiftLine,shippingBeforeDiscountMinor:0}); assertGiftRejected(unknownCostManual,"margin_unknown_cost"); assert.equal(unknownCostManual.discountTotalMinor,0); psql(box,`UPDATE saas.product_variants SET cost_cents=40 WHERE store_id='${STORE}' AND id='${LINE}'`);
    const percentageCapped=structuredClone(manual); percentageCapped.marginPolicy={kind:"maximum_percentage",maximumPercentageBps:9999}; updateManualRule(percentageCapped); assertGiftRejected(evaluate(box,{cartLines:oneGiftLine,shippingBeforeDiscountMinor:0}));
    const percentageAllowed=structuredClone(manual); percentageAllowed.benefit.quantity=1; percentageAllowed.marginPolicy={kind:"maximum_percentage",maximumPercentageBps:5000}; updateManualRule(percentageAllowed); const withinPercentage=evaluate(box,{cartLines:oneGiftLine,shippingBeforeDiscountMinor:0}); assert.deepEqual(withinPercentage.gifts,[{promotionId:id,variantId:LINE,quantity:1,paidMinor:0,autoAdd:false,lineId:chosen}]); assert.deepEqual(withinPercentage.lineEffects,[{promotionId:id,lineId:chosen,discountMinor:100,giftQuantity:0}]); assert.equal(withinPercentage.discountTotalMinor,100); parseContract(withinPercentage);
    const eligibleCapped=structuredClone(manual); eligibleCapped.targets={mode:"selected",include:[{kind:"variant",id:qualifier}],exclude:[]}; updateManualRule(eligibleCapped); assertGiftRejected(evaluate(box,{cartLines:[oneGiftLine[0],{...context().cartLines[0],lineId:qualifier,position:1,productId:qualifier,variantId:qualifier,quantity:1}],shippingBeforeDiscountMinor:0}));
    const priorId="73000000-0000-4000-8000-000000000130", prior=validRuleDocument(); prior.benefit={kind:"fixed_amount",amountMinor:1,currency:"TRY"}; prior.combinationPolicy={kind:"benefit_classes",benefitClasses:["gift"]}; const combined=structuredClone(manual); combined.combinationPolicy={kind:"benefit_classes",benefitClasses:["fixed_amount"]}; updateManualRule(combined);
    psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${priorId}','${STORE}','Gift remaining-capacity predecessor','active',1,'${JSON.stringify(prior)}'::jsonb,'2026-01-01','2026-01-01')`);
    const remainingCapacity=evaluate(box,{cartLines:oneGiftLine,shippingBeforeDiscountMinor:0}); assertGiftRejected(remainingCapacity); assert.equal(remainingCapacity.discountTotalMinor,1); assert.deepEqual(remainingCapacity.lineEffects,[{promotionId:priorId,lineId:chosen,discountMinor:1,giftQuantity:0}]);
    psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}' AND id='${priorId}'; UPDATE saas.product_variants SET cost_cents=0 WHERE store_id='${STORE}' AND id='${LINE}'`);
    const exactCaps=structuredClone(manual); exactCaps.limits.orderMaximumMinor=200; exactCaps.limits.budgetMinor=200; exactCaps.marginPolicy={kind:"floor_at_cost"}; updateManualRule(exactCaps); const exactFull=evaluate(box,{cartLines:oneGiftLine,shippingBeforeDiscountMinor:0}); assert.deepEqual(exactFull.gifts,[{promotionId:id,variantId:LINE,quantity:2,paidMinor:0,autoAdd:false,lineId:chosen}]); assert.deepEqual(exactFull.lineEffects,[{promotionId:id,lineId:chosen,discountMinor:200,giftQuantity:0}]); assert.equal(exactFull.discountTotalMinor,200); parseContract(exactFull);
    const exactPercentage=structuredClone(manual); exactPercentage.marginPolicy={kind:"maximum_percentage",maximumPercentageBps:10000}; updateManualRule(exactPercentage); const percentageFull=evaluate(box,{cartLines:oneGiftLine,shippingBeforeDiscountMinor:0}); assert.deepEqual(percentageFull.gifts,[{promotionId:id,variantId:LINE,quantity:2,paidMinor:0,autoAdd:false,lineId:chosen}]); assert.equal(percentageFull.discountTotalMinor,200); parseContract(percentageFull);
    const smallerGiftId="73000000-0000-4000-8000-000000000131", smallerGift=structuredClone(manual); smallerGift.benefit.quantity=1; smallerGift.priority=100; updateManualRule(manual); psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${smallerGiftId}','${STORE}','Smaller manual gift','active',1,'${JSON.stringify(smallerGift)}'::jsonb,'2026-01-01','2026-01-01')`);
    const rankedGift=evaluate(box,{cartLines:oneGiftLine,shippingBeforeDiscountMinor:0}); assert.deepEqual(rankedGift.gifts,[{promotionId:id,variantId:LINE,quantity:2,paidMinor:0,autoAdd:false,lineId:chosen}]); assert.equal(rankedGift.discountTotalMinor,200); assert.equal(rankedGift.appliedPromotions.some((item)=>item.promotionId===smallerGiftId),false); assert.equal(rankedGift.rejectedPromotions.some((item)=>item.promotionId===smallerGiftId),true); parseContract(rankedGift); psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}' AND id='${smallerGiftId}'`);
    const insufficient=evaluate(box,{cartLines:[{...context().cartLines[0],quantity:1}],shippingBeforeDiscountMinor:0});
    assert.deepEqual(insufficient.gifts,[]); assert.equal(insufficient.appliedPromotions.some((item)=>item.promotionId===id),false); assert.equal(insufficient.rejectedPromotions.some((item)=>item.promotionId===id&&item.reason==="conditions_not_met"),true); parseContract(insufficient);
    psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}' AND id='${id}'; ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET stock_tracking=false,stock_quantity=0,cost_cents=40 WHERE store_id='${STORE}' AND id='${LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
  });
  scenario("evaluator output has separated shipping and reconciled line effects", () => { activate(box,SHIPPING); const value=evaluate(box,{cartLines:[{...context().cartLines[0],quantity:1}]}); assert.equal(value.shippingDiscountTotalMinor,40); assert.equal(value.lineDiscountTotalMinor,0); assert.equal(value.discountTotalMinor,40); assert.equal(value.grandTotalMinor,100); assert.equal(value.eligiblePromotionIds.length,1); assert.equal(value.shippingEffects.length,1); });
  scenario("down migration refuses without emergency setting", () => assert.notEqual(psql(box, readFileSync(path.join(SQL, "202609050126_promotions_studio.down.sql"), "utf8"), DB, true).status, 0));
  scenario("emergency down refuses a gross hosted V2 session even without a promotion reservation", () => {
    assert.equal(Number(scalar(box,`SELECT count(*) FROM saas.storefront_hosted_checkout_sessions WHERE evaluator_authority_digest IS NOT NULL AND promotion_reservation_group_id IS NULL`))>0,true);
    assert.equal(Number(scalar(box,`SELECT count(*) FROM saas.storefront_checkout_operations WHERE (result_payload->'receipt' ? 'promotionStatus') IS TRUE`))>0,true);
    psql(box, `TRUNCATE saas.order_discount_allocations,saas.order_promotion_snapshots,saas.promotion_redemptions,saas.promotion_usage_reservations,saas.promotion_audit_events,saas.promotion_operations,saas.promotion_codes,saas.promotion_code_batches,saas.promotion_targets,saas.promotion_versions,saas.promotions CASCADE`);
    const down=readFileSync(path.join(SQL,"202609050126_promotions_studio.down.sql"),"utf8").replace("BEGIN;","BEGIN; SET LOCAL saas.promotions_studio_emergency_drop = 'approved-pre-restore';"),result=psql(box,down,DB,true);
    assert.notEqual(result.status,0); assert.match(result.stderr,/PROMOTIONS_STUDIO_DATA_BEARING_DOWN_REFUSED/);
  });
  scenario("allowed-empty emergency down removes every migration-126 promotion object", () => {
    psql(box, `CREATE TEMP TABLE hosted_v2_cleanup_ids AS SELECT payment_attempt_id FROM saas.storefront_hosted_checkout_sessions WHERE evaluator_authority_digest IS NOT NULL;
      ALTER TABLE saas.storefront_checkout_operations DISABLE TRIGGER ALL;
      DELETE FROM saas.storefront_checkout_operations WHERE (result_payload->'receipt' ? 'promotionStatus') IS TRUE;
      ALTER TABLE saas.storefront_checkout_operations ENABLE TRIGGER ALL;
      ALTER TABLE saas.storefront_hosted_checkout_operations DISABLE TRIGGER ALL;
      DELETE FROM saas.storefront_hosted_checkout_operations operation USING saas.storefront_hosted_checkout_sessions session WHERE session.evaluator_authority_digest IS NOT NULL AND operation.store_id=session.store_id AND operation.session_id=session.id;
      ALTER TABLE saas.storefront_hosted_checkout_operations ENABLE TRIGGER ALL;
      ALTER TABLE saas.checkout_inventory_reservations DISABLE TRIGGER ALL;
      DELETE FROM saas.checkout_inventory_reservations reservation USING saas.storefront_hosted_checkout_sessions session WHERE session.evaluator_authority_digest IS NOT NULL AND reservation.store_id=session.store_id AND reservation.storefront_hosted_session_id=session.id;
      ALTER TABLE saas.checkout_inventory_reservations ENABLE TRIGGER ALL;
      ALTER TABLE saas.payment_callback_bindings DISABLE TRIGGER ALL;
      DELETE FROM saas.payment_callback_bindings binding USING hosted_v2_cleanup_ids cleanup WHERE binding.attempt_id=cleanup.payment_attempt_id;
      ALTER TABLE saas.payment_callback_bindings ENABLE TRIGGER ALL;
      ALTER TABLE saas.payment_attempt_events DISABLE TRIGGER ALL;
      DELETE FROM saas.payment_attempt_events event USING hosted_v2_cleanup_ids cleanup WHERE event.attempt_id=cleanup.payment_attempt_id;
      ALTER TABLE saas.payment_attempt_events ENABLE TRIGGER ALL;
      ALTER TABLE saas.payment_attempt_operations DISABLE TRIGGER ALL;
      DELETE FROM saas.payment_attempt_operations operation USING hosted_v2_cleanup_ids cleanup WHERE operation.attempt_id=cleanup.payment_attempt_id;
      ALTER TABLE saas.payment_attempt_operations ENABLE TRIGGER ALL;
      DELETE FROM saas.analytics_delivery_outbox outbox USING hosted_v2_cleanup_ids cleanup WHERE outbox.payment_attempt_id=cleanup.payment_attempt_id;
      ALTER TABLE saas.storefront_hosted_checkout_sessions DISABLE TRIGGER ALL;
      DELETE FROM saas.storefront_hosted_checkout_sessions WHERE evaluator_authority_digest IS NOT NULL;
      ALTER TABLE saas.storefront_hosted_checkout_sessions ENABLE TRIGGER ALL;
      ALTER TABLE saas.payment_attempts DISABLE TRIGGER ALL;
      DELETE FROM saas.payment_attempts attempt USING hosted_v2_cleanup_ids cleanup WHERE attempt.id=cleanup.payment_attempt_id;
      ALTER TABLE saas.payment_attempts ENABLE TRIGGER ALL;
      TRUNCATE saas.order_discount_allocations,saas.order_promotion_snapshots,saas.promotion_redemptions,saas.promotion_usage_reservations,saas.promotion_audit_events,saas.promotion_operations,saas.promotion_codes,saas.promotion_code_batches,saas.promotion_targets,saas.promotion_versions,saas.promotions CASCADE`);
    const down = readFileSync(path.join(SQL, "202609050126_promotions_studio.down.sql"), "utf8").replace("BEGIN;", "BEGIN; SET LOCAL saas.promotions_studio_emergency_drop = 'approved-pre-restore';");
    const result=psql(box, down, DB, true);
    if (result.status!==0) throw new Error(result.stderr);
    assert.equal(scalar(box, "SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'promotion_%'"), "0");
    assert.equal(scalar(box, "SELECT count(*) FROM pg_catalog.pg_class WHERE relnamespace='saas'::regnamespace AND relname IN ('promotions','promotion_versions','promotion_targets','promotion_codes','promotion_code_batches','promotion_usage_reservations','promotion_redemptions','promotion_audit_events','promotion_operations','order_promotion_snapshots','order_discount_allocations')"), "0");
    apply(box, "202609050126_promotions_studio.up.sql");
    seedPromotions(box);
  });
  scenario("migration is replay-safe", () => apply(box, "202609050126_promotions_studio.up.sql"));
  scenario("assertions replay safely", () => apply(box, "202609050126_promotions_studio_assertions.sql"));
  scenario("rule validation rejects duplicate nested collections and unordered tiers", () => { const id="50000000-0000-4000-8000-000000000126", second="50000000-0000-4000-8000-000000000127"; const duplicateTarget=validRuleDocument(); duplicateTarget.targets={mode:"selected",include:[{kind:"product",id},{kind:"product",id}],exclude:[]}; const duplicateAudience=validRuleDocument(); duplicateAudience.audience={mode:"customer_tags",referenceIds:[id,id]}; const duplicateCodes=validRuleDocument(); duplicateCodes.trigger={kind:"code",codes:["SAVE","SAVE"]}; const duplicatePayment=validRuleDocument(); duplicatePayment.conditions={...duplicatePayment.conditions,paymentMethodIds:[id,id]}; const duplicateShipping=validRuleDocument(); duplicateShipping.conditions={...duplicateShipping.conditions,shippingMethodIds:[id,id]}; const duplicateChannels=validRuleDocument(); duplicateChannels.conditions={...duplicateChannels.conditions,salesChannels:["storefront","storefront"]}; const malformedChannel=validRuleDocument(); malformedChannel.conditions={...malformedChannel.conditions,salesChannels:["bad\nchannel"]}; const duplicateCombination=validRuleDocument(); duplicateCombination.combinationPolicy={kind:"benefit_classes",benefitClasses:["percentage","percentage"]}; const unorderedTiers=validRuleDocument(); unorderedTiers.benefit={kind:"quantity_tiers",tiers:[{minimumQuantity:3,percentageBps:1000},{minimumQuantity:2,percentageBps:2000}]}; for (const value of [duplicateTarget,duplicateAudience,duplicateCodes,duplicatePayment,duplicateShipping,duplicateChannels,malformedChannel,duplicateCombination,unorderedTiers]) assert.equal(validates(box,value),"f"); });
  scenario("legacy code collisions remain read-only while independent safe adoption continues", () => { const existing="60000000-0000-4000-8000-000000000126", legacyA="60000000-0000-4000-8000-000000000127", legacyB="60000000-0000-4000-8000-000000000128", legacyExisting="60000000-0000-4000-8000-000000000129", legacySafe="60000000-0000-4000-8000-000000000130"; psql(box, `INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${existing}','${STORE}','existing','draft',1,'${rule({kind:"percentage",percentageBps:1000})}'::jsonb,'2026-01-01','2026-01-01'); INSERT INTO saas.promotion_codes(id,store_id,promotion_id,code,status,created_at) VALUES('60000000-0000-4000-8000-000000000131','${STORE}','${existing}','EXISTING','active','2026-01-01');`); const record=(id,name,config)=>`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES('${id}','${STORE}','discount','${name}','${JSON.stringify(config).replaceAll("'", "''")}'::jsonb,'active',1,'2026-01-01','2026-01-01');`; psql(box, record(legacyA,"duplicate a",{discountType:"percent",value:"10",code:"DUPLICATE"})+record(legacyB,"duplicate b",{discountType:"percent",value:"10",code:"duplicate"})+record(legacyExisting,"existing code",{discountType:"fixed",value:"50",code:"EXISTING"})+record(legacySafe,"safe",{discountType:"fixed",value:"50"})); assert.equal(scalar(box,`SELECT saas.promotion_adopt_legacy_discounts_v1('${STORE}','2026-09-05T00:00:00Z')`),"1"); assert.equal(scalar(box,`SELECT count(*) FROM saas.promotions WHERE store_id='${STORE}' AND legacy_record_id IS NOT NULL`),"1"); assert.equal(scalar(box,`SELECT saas.promotion_adopt_legacy_discounts_v1('${STORE}','2026-09-05T00:00:00Z')`),"0"); assert.equal(scalar(box,`SELECT count(*) FROM saas.merchant_admin_records WHERE store_id='${STORE}' AND record_kind='discount'`),"4"); });
  scenario("canonical context rejects spoofing and resolves catalog price cost currency and price lists", () => {
    activate(box,PERCENT);
    assert.equal(evaluate(box,{storeId:"20000000-0000-4000-8000-000000000126"}).discountTotalMinor,0);
    assert.equal(evaluate(box,{cartLines:[context().cartLines[0],context().cartLines[0]]}).discountTotalMinor,0);
    const list="61000000-0000-4000-8000-000000000126", ruleId="62000000-0000-4000-8000-000000000126";
    psql(box,`INSERT INTO saas.price_lists(id,store_id,name,status,version,activated_at,created_at,updated_at) VALUES('${list}','${STORE}','Promotion authoritative price','active',1,'2026-09-01','2026-01-01','2026-09-01'); INSERT INTO saas.price_list_items(store_id,price_list_id,variant_id,price_cents,created_at) VALUES('${STORE}','${list}','${LINE}',80,'2026-01-01'); INSERT INTO saas.price_list_rules(id,store_id,price_list_id,channel,customer_tag_id,starts_at,ends_at,priority,created_at) VALUES('${ruleId}','${STORE}','${list}','storefront',NULL,'2026-09-01',NULL,100,'2026-01-01')`);
    const hostileA={...context().cartLines[0],unitPriceMinor:1,unitCostMinor:7999999999,currency:"JPY",categoryIds:[OTHER_PRODUCT],brandId:OTHER_PRODUCT,collectionIds:[OTHER_PRODUCT]};
    const hostileB={...context().cartLines[0],unitPriceMinor:2000000000,unitCostMinor:null,currency:"KWD",categoryIds:[],brandId:null,collectionIds:[]};
    const left=evaluate(box,{cartLines:[hostileA]}), right=evaluate(box,{cartLines:[hostileB]});
    assert.equal(JSON.stringify(left),JSON.stringify(right));
    assert.deepEqual({subtotal:left.subtotalBeforeDiscountMinor,discount:left.discountTotalMinor,currency:left.currency},{subtotal:240,discount:24,currency:"TRY"});
    psql(box,`DELETE FROM saas.price_list_rules WHERE store_id='${STORE}' AND price_list_id='${list}'; DELETE FROM saas.price_list_items WHERE store_id='${STORE}' AND price_list_id='${list}'; DELETE FROM saas.price_lists WHERE store_id='${STORE}' AND id='${list}'`);
    const inactive="50000000-0000-4000-8000-000000000236";
    psql(box,`INSERT INTO saas.products(id,store_id,slug,title,status,currency,archived_at,created_at,updated_at) VALUES('${inactive}','${STORE}','inactive-authority-line','inactive authority line','archived','TRY','2026-09-01','2026-01-01','2026-09-01'); ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,archived_at,created_at,updated_at) VALUES('${inactive}','${inactive}','${STORE}','inactive',100,40,false,0,'archived','2026-09-01','2026-01-01','2026-09-01'); ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
    const invalidLines=[
      {...context().cartLines[0],lineId:"50000000-0000-4000-8000-000000000237",productId:OTHER_PRODUCT,variantId:OTHER_PRODUCT},
      {...context().cartLines[0],lineId:"50000000-0000-4000-8000-000000000238",productId:LINE,variantId:OTHER_PRODUCT},
      {...context().cartLines[0],lineId:"50000000-0000-4000-8000-000000000239",productId:inactive,variantId:inactive},
    ];
    for (const invalidLine of invalidLines) {
      const invalid=evaluate(box,{cartLines:[context().cartLines[0],invalidLine]}); assert.equal(invalid.merchantExplanation,"promotion_context_unavailable"); assert.deepEqual(invalid.eligiblePromotionIds,[]); assert.equal(invalid.subtotalBeforeDiscountMinor,0);
    }
    const expensive="50000000-0000-4000-8000-000000000240";
    psql(box,`INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES('${expensive}','${STORE}','canonical-overflow-line','canonical overflow line','active','TRY','2026-01-01','2026-01-01'); ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES('${expensive}','${expensive}','${STORE}','expensive',8000000000,0,false,0,'active','2026-01-01','2026-01-01'); ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
    const canonicalOverflow=evaluate(box,{cartLines:[{...context().cartLines[0],lineId:expensive,productId:expensive,variantId:expensive,quantity:1,unitPriceMinor:1,unitCostMinor:0}],shippingBeforeDiscountMinor:1}); assert.equal(canonicalOverflow.merchantExplanation,"promotion_context_unavailable"); assert.deepEqual(canonicalOverflow.eligiblePromotionIds,[]);
  });
  scenario("schedule starts inclusively and ends exclusively", () => { const id="70000000-0000-4000-8000-000000000126", document=validRuleDocument(); document.schedule={timezone:"Europe/Istanbul",startsAt:"2026-09-05T00:00:00.000Z",endsAt:"2026-09-05T00:00:01.000Z"}; psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','scheduled edge','active',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01');`); activate(box,id); assert.equal(evaluate(box).discountTotalMinor,30); assert.equal(JSON.parse(scalar(box,`SELECT saas.promotion_evaluate_v1('${STORE}','${JSON.stringify(context()).replaceAll("'", "''")}'::jsonb,'2026-09-05T00:00:01Z')`)).discountTotalMinor,0); });
  scenario("code candidates need an active normalized code owned by their promotion", () => { const id="70000000-0000-4000-8000-000000000127", document=validRuleDocument(); document.trigger={kind:"code",codes:["SAVE"]}; psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','code','active',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01'); INSERT INTO saas.promotion_codes(id,store_id,promotion_id,code,status,created_at) VALUES('70000000-0000-4000-8000-000000000128','${STORE}','${id}','SAVE','active','2026-01-01');`); activate(box,id); assert.equal(evaluate(box,{submittedCodes:["SAVE"]}).discountTotalMinor,30); psql(box,`UPDATE saas.promotion_codes SET status='paused' WHERE store_id='${STORE}' AND promotion_id='${id}'`); assert.equal(evaluate(box,{submittedCodes:["SAVE"]}).discountTotalMinor,0); });
  scenario("code facts choose one stable promotion code regardless submitted-code order", () => { const id="70000000-0000-4000-8000-000000000221", document=validRuleDocument(); document.trigger={kind:"code",codes:["ALPHA","BETA"]}; psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','two codes','active',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01'); INSERT INTO saas.promotion_codes(id,store_id,promotion_id,code,status,created_at) VALUES('70000000-0000-4000-8000-000000000222','${STORE}','${id}','ALPHA','active','2026-01-01'),('70000000-0000-4000-8000-000000000223','${STORE}','${id}','BETA','active','2026-01-01');`); activate(box,id); const forward=evaluate(box,{submittedCodes:["ALPHA","BETA"]}), backward=evaluate(box,{submittedCodes:["BETA","ALPHA"]}); assert.equal(JSON.stringify(forward),JSON.stringify(backward)); assert.equal(forward.appliedPromotions[0].normalizedCode,"ALPHA"); });
  scenario("conditions and selected product targets gate eligibility", () => { const id="70000000-0000-4000-8000-000000000129", document=validRuleDocument(); document.targets={mode:"selected",include:[{kind:"product",id:LINE}],exclude:[]}; document.conditions={minimumBasketMinor:301,minimumQuantity:4,minimumProductQuantity:4,paymentMethodIds:[PAYMENT_METHOD],shippingMethodIds:[LINE],salesChannels:["quick_order"]}; psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','conditions','active',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01');`); activate(box,id); assert.equal(evaluate(box,{paymentMethodId:PAYMENT_METHOD,shippingMethodId:LINE,salesChannel:"quick_order"}).discountTotalMinor,0); assert.equal(evaluate(box,{cartLines:[{...context().cartLines[0],quantity:4}],paymentMethodId:PAYMENT_METHOD,shippingMethodId:LINE,salesChannel:"quick_order"}).discountTotalMinor,40); });
  scenario("audiences do not apply until their persisted customer facts match", () => { const id="70000000-0000-4000-8000-000000000130", document=validRuleDocument(); document.audience={mode:"customer_segments",referenceIds:[LINE]}; psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','audience','active',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01');`); activate(box,id); assert.equal(evaluate(box).discountTotalMinor,0); assert.equal(evaluate(box,{customerId:LINE,customerSegmentIds:[LINE]}).discountTotalMinor,30); });
  scenario("every audience mode is bounded to its persisted authority", () => { const cases=[["70000000-0000-4000-8000-000000000141",{mode:"first_paid_order"},{customerId:LINE,paidOrderCount:0}],["70000000-0000-4000-8000-000000000142",{mode:"customer_tags",referenceIds:[LINE]},{customerId:LINE,customerTagIds:[LINE]}],["70000000-0000-4000-8000-000000000143",{mode:"masked_customers",referenceIds:[LINE]},{customerId:LINE}]]; for (const [id,audience,facts] of cases) { const document=validRuleDocument(); document.audience=audience; psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','audience','active',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01');`); activate(box,id); assert.equal(evaluate(box,facts).discountTotalMinor,30); } });
  scenario("category brand collection and exclusion targets are evaluated from persisted catalog relations", () => { const refs=[["category",CATEGORY],["brand",BRAND],["collection",COLLECTION]]; for (const [kind,id] of refs) { const promotion=`70000000-0000-4000-8000-00000000015${refs.indexOf(refs.find((entry)=>entry[0]===kind))+1}`, document=validRuleDocument(); document.targets={mode:"selected",include:[{kind,id}],exclude:[]}; psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${promotion}','${STORE}','target','active',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01');`); activate(box,promotion); assert.equal(evaluate(box).discountTotalMinor,30); } const excluded="70000000-0000-4000-8000-000000000155", excludedRule=validRuleDocument(); excludedRule.targets={mode:"all",include:[],exclude:[{kind:"product",id:LINE}]}; psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${excluded}','${STORE}','excluded','active',1,'${JSON.stringify(excludedRule)}','2026-01-01','2026-01-01');`); activate(box,excluded); assert.equal(evaluate(box).discountTotalMinor,0); });
  scenario("limits include committed and unexpired reserved use and budget", () => {
    const id="70000000-0000-4000-8000-000000000131", reservation="70000000-0000-4000-8000-000000000132", document=validRuleDocument();
    document.limits={totalUsage:1,perCustomerUsage:null,budgetMinor:29,orderMaximumMinor:null};
    const resultFixture=reservationOperationResult(reservation,[{promotionId:id,reservationId:reservation,discountMinor:29}],"reserved",{expiresAt:"2026-09-05T00:15:00.000Z"});
    assert.equal(scalar(box,`SELECT saas.promotion_operation_result_valid('reserve','${resultFixture}'::jsonb)`),"t",scalar(box,`WITH value AS (SELECT '${resultFixture}'::jsonb result), member AS (SELECT item FROM value CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(result->'reservations') item) SELECT pg_catalog.jsonb_build_object('keys',saas.promotion_json_keys(result,ARRAY['schemaVersion','reservationGroupId','status','currency','discountTotalMinor','expiresAt','evaluatorFingerprint','reservations'],ARRAY['schemaVersion','reservationGroupId','status','currency','discountTotalMinor','expiresAt','evaluatorFingerprint','reservations']),'schema',saas.promotion_json_integer(result->'schemaVersion',1,1),'group',saas.promotion_json_uuid(result->'reservationGroupId'),'status',result->>'status'='reserved','currency',result->>'currency' ~ '^[A-Z]{3}$','total',saas.promotion_json_integer(result->'discountTotalMinor',0,8000000000),'expires',saas.promotion_json_utc_timestamp(result->'expiresAt'),'fingerprint',result->>'evaluatorFingerprint' ~ '^[a-f0-9]{64}$','arrayType',pg_catalog.jsonb_typeof(result->'reservations'),'arrayLength',pg_catalog.jsonb_array_length(result->'reservations'),'memberKeys',saas.promotion_json_keys(item,ARRAY['promotionId','reservationId','promotionVersion','normalizedCode','discountMinor'],ARRAY['promotionId','reservationId','promotionVersion','normalizedCode','discountMinor']),'promotion',saas.promotion_json_uuid(item->'promotionId'),'reservation',saas.promotion_json_uuid(item->'reservationId'),'version',saas.promotion_json_integer(item->'promotionVersion',1,9007199254740991),'codeType',pg_catalog.jsonb_typeof(item->'normalizedCode'),'codeNull',item->'normalizedCode'='null'::jsonb,'discount',saas.promotion_json_integer(item->'discountMinor',0,8000000000)) FROM value,member`));
    psql(box,`BEGIN; INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','limited','active',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01');
      INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES('${id}','${STORE}','${id}',1,'${JSON.stringify(document)}','2026-01-01');
      INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${reservation}','${STORE}','${reservation}','reserve',repeat('a',64),'reservation_group','${reservation}','${resultFixture}'::jsonb,'2026-09-05T00:00:00.000Z');
      INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,reservation_group_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES('${reservation}','${STORE}','${id}',1,'${reservation}','${reservation}',repeat('a',64),'offline_checkout','${reservation}',29,29,'TRY','${frozenReservationSnapshot({promotionId:id,promotionName:"limited",ruleDocument:document,discountMinor:29,lineId:reservation})}'::jsonb,repeat('b',64),'reserved','2026-09-05T00:15:00.000Z','2026-09-05T00:00:00.000Z','2026-09-05T00:00:00.000Z'); COMMIT;`);
    activate(box,id); assert.equal(evaluate(box).discountTotalMinor,0);
    const customerBound = "70000000-0000-4000-8000-000000000232", customerRule = validRuleDocument(); customerRule.limits.perCustomerUsage = 1;
    psql(box, `INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${customerBound}','${STORE}','customer identity required','active',1,'${JSON.stringify(customerRule)}','2026-01-01','2026-01-01')`);
    activate(box, customerBound);
    const anonymous = evaluate(box);
    assert.equal(anonymous.discountTotalMinor, 0);
    assert.deepEqual(anonymous.rejectedPromotions, [{ promotionId: customerBound, reason: "customer_identity_required" }]);
    assert.equal(evaluate(box, { customerId: LINE }).discountTotalMinor, 30);
    const archivedCustomer="50000000-0000-4000-8000-000000000230", foreignCustomer="50000000-0000-4000-8000-000000000231", randomCustomer="50000000-0000-4000-8000-000000000232";
    psql(box,`INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,archived_at,created_at,updated_at) VALUES('${archivedCustomer}','${STORE}','archived','Archived','Customer','archived-promotion@test.invalid','2026-08-01','2026-01-01','2026-08-01'),('${foreignCustomer}','${OTHER_STORE}','active','Foreign','Customer','foreign-promotion@test.invalid',NULL,'2026-01-01','2026-01-01')`);
    for (const customerId of [archivedCustomer,foreignCustomer,randomCustomer]) {
      assert.equal(scalar(box,`SELECT saas.promotion_evaluator_context_valid('${STORE}','${JSON.stringify(context({customerId}))}'::jsonb)`),"f");
      assert.equal(evaluate(box,{customerId}).discountTotalMinor,0);
    }
    const marginPromotion="70000000-0000-4000-8000-000000000233", marginProducts=["50000000-0000-4000-8000-000000000233","50000000-0000-4000-8000-000000000234","50000000-0000-4000-8000-000000000235"], marginRule=JSON.parse(rule({kind:"fixed_amount",amountMinor:200,currency:"TRY"})); marginRule.marginPolicy={kind:"floor_at_cost"};
    psql(box,`INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES('${marginProducts[0]}','${STORE}','margin-low','margin low','active','TRY','2026-01-01','2026-01-01'),('${marginProducts[1]}','${STORE}','margin-high','margin high','active','TRY','2026-01-01','2026-01-01'),('${marginProducts[2]}','${STORE}','margin-unknown','margin unknown','active','TRY','2026-01-01','2026-01-01'); ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES('${marginProducts[0]}','${marginProducts[0]}','${STORE}','low',100,99,false,0,'active','2026-01-01','2026-01-01'),('${marginProducts[1]}','${marginProducts[1]}','${STORE}','high',100,0,false,0,'active','2026-01-01','2026-01-01'),('${marginProducts[2]}','${marginProducts[2]}','${STORE}','unknown',100,NULL,false,0,'active','2026-01-01','2026-01-01'); ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile; INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${marginPromotion}','${STORE}','per-line margin','active',1,'${JSON.stringify(marginRule)}','2026-01-01','2026-01-01')`);
    activate(box,marginPromotion);
    const marginLines=marginProducts.map((productId,position)=>({lineId:productId,position,productId,variantId:productId,quantity:1,unitPriceMinor:1,unitCostMinor:0,currency:"USD",categoryIds:[],brandId:null,collectionIds:[]})), marginValue=evaluate(box,{cartLines:marginLines.slice(0,2),shippingBeforeDiscountMinor:0});
    assert.equal(marginValue.discountTotalMinor,101); assert.deepEqual(marginValue.lineEffects.map((effect)=>[effect.lineId,effect.discountMinor]),[[marginProducts[0],1],[marginProducts[1],100]]); assert.equal(marginValue.lineEffects.some((effect)=>effect.lineId===marginProducts[2]),false); parseContract(marginValue);
    const unknownCost=evaluate(box,{cartLines:marginLines,shippingBeforeDiscountMinor:0}); assert.equal(unknownCost.discountTotalMinor,0); assert.deepEqual(unknownCost.lineEffects,[]); assert.deepEqual(unknownCost.rejectedPromotions,[{promotionId:marginPromotion,reason:"margin_unknown_cost"}]); parseContract(unknownCost);
  });
  scenario("competing non-combinable promotions use saving then priority then stable identifiers", () => { const first="70000000-0000-4000-8000-000000000133", second="70000000-0000-4000-8000-000000000134", one=validRuleDocument(), two=validRuleDocument(); one.priority=1; two.priority=2; psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${first}','${STORE}','first','active',1,'${JSON.stringify(one)}','2026-01-01','2026-01-01'),('${second}','${STORE}','second','active',1,'${JSON.stringify(two)}','2026-01-01','2026-01-01');`); activate(box,first); psql(box,`UPDATE saas.promotions SET status='active' WHERE store_id='${STORE}' AND id='${second}'`); const value=evaluate(box); assert.equal(value.appliedPromotions.length,1); assert.equal(value.appliedPromotions[0].promotionId,second); });
  scenario("non-combinable candidates choose larger customer saving before priority", () => { const smaller="70000000-0000-4000-8000-000000000171", larger="70000000-0000-4000-8000-000000000172", one=validRuleDocument(), two=validRuleDocument(); one.priority=100; two.priority=0; one.benefit={kind:"percentage",percentageBps:1000}; two.benefit={kind:"percentage",percentageBps:2000}; psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${smaller}','${STORE}','smaller','active',1,'${JSON.stringify(one)}','2026-01-01','2026-01-01'),('${larger}','${STORE}','larger','active',1,'${JSON.stringify(two)}','2026-01-01','2026-01-01');`); activate(box,smaller); psql(box,`UPDATE saas.promotions SET status='active' WHERE store_id='${STORE}' AND id='${larger}'`); assert.equal(evaluate(box).appliedPromotions[0].promotionId,larger); });
  scenario("shipping-only and explicit benefit-class policies require mutual compatibility", () => {
    const percent="70000000-0000-4000-8000-000000000156", shipping="70000000-0000-4000-8000-000000000157", explicit="70000000-0000-4000-8000-000000000158", first=validRuleDocument(), second=JSON.parse(rule({kind:"free_shipping"})), third=validRuleDocument();
    first.combinationPolicy={kind:"shipping_only"}; second.combinationPolicy={kind:"shipping_only"}; third.combinationPolicy={kind:"benefit_classes",benefitClasses:["percentage"]};
    const encoded=(value)=>JSON.stringify(value).replaceAll("'","''");
    assert.equal(scalar(box,`SELECT saas.promotion_combination_compatible('${encoded(first)}'::jsonb,'${encoded(second)}'::jsonb)||':'||saas.promotion_combination_compatible('${encoded(second)}'::jsonb,'${encoded(first)}'::jsonb)`),"true:true");
    assert.equal(scalar(box,`SELECT saas.promotion_combination_compatible('${encoded(second)}'::jsonb,'${encoded(third)}'::jsonb)||':'||saas.promotion_combination_compatible('${encoded(third)}'::jsonb,'${encoded(second)}'::jsonb)`),"false:false");
    psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${percent}','${STORE}','percent','active',1,'${JSON.stringify(first)}','2026-01-01','2026-01-01'),('${shipping}','${STORE}','shipping','active',1,'${JSON.stringify(second)}','2026-01-01','2026-01-01'),('${explicit}','${STORE}','explicit','active',1,'${JSON.stringify(third)}','2026-01-01','2026-01-01');`);
    activate(box,percent); psql(box,`UPDATE saas.promotions SET status='active' WHERE store_id='${STORE}' AND id IN ('${shipping}','${explicit}')`); const value=evaluate(box); assert.equal(value.shippingDiscountTotalMinor,40); assert.equal(value.appliedPromotions.length,2); assert.deepEqual(value.appliedPromotions.map((promotion)=>promotion.promotionId),[percent,shipping]);
  });
  scenario("all three X/Y reward strategies use the matching deterministic reward unit", () => { const cases=[["same_product_cheapest",{}],["selected_products_cheapest",{productIds:[LINE]}],["specific_variant",{variantId:LINE}]]; for (const [strategy,details] of cases) { const id=`70000000-0000-4000-8000-00000000016${cases.indexOf(cases.find((entry)=>entry[0]===strategy))+1}`, document=JSON.parse(rule({kind:"buy_x_get_y",buyQuantity:2,receiveQuantity:1,discountPercentageBps:10000,reward:{strategy,...details}})); psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','xy','active',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01');`); activate(box,id); assert.equal(evaluate(box).discountTotalMinor,100); } });
  scenario("result keeps exact allocation and reconciliation when cart input is reordered", () => { activate(box,PERCENT); const another="50000000-0000-4000-8000-000000000127", lines=[{...context().cartLines[0],position:1},{lineId:another,position:0,productId:another,variantId:another,quantity:1,unitPriceMinor:101,unitCostMinor:20,currency:"TRY",categoryIds:[],brandId:null,collectionIds:[]}]; const left=evaluate(box,{cartLines:lines}); const right=evaluate(box,{cartLines:[...lines].reverse()}); assert.equal(JSON.stringify(left),JSON.stringify(right)); assert.equal(left.grandTotalMinor,left.subtotalBeforeDiscountMinor-left.lineDiscountTotalMinor+left.shippingBeforeDiscountMinor-left.shippingDiscountTotalMinor); });
  scenario("cross-store catalog references cannot make a target match", () => { const id="70000000-0000-4000-8000-000000000170", document=validRuleDocument(); document.targets={mode:"selected",include:[{kind:"product",id:OTHER_PRODUCT}],exclude:[]}; psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','foreign target','active',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01');`); activate(box,id); assert.equal(evaluate(box,{cartLines:[{...context().cartLines[0],productId:OTHER_PRODUCT,variantId:OTHER_PRODUCT}]}).discountTotalMinor,0); });
  scenario("a 1,600-product catalog fixture preserves the authoritative evaluator result", () => { const baselineProductCount=Number(scalar(box,`SELECT count(*) FROM saas.products WHERE store_id='${STORE}'`)); psql(box,`INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) SELECT ('30000000-0000-4000-8000-'||lpad(series::text,12,'0'))::uuid,'${STORE}','promotion-fixture-'||series,'Promotion fixture '||series,'active','TRY','2026-01-01','2026-01-01' FROM pg_catalog.generate_series(1,1600) series; ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,created_at,updated_at) SELECT ('30000000-0000-4000-8000-'||lpad(series::text,12,'0'))::uuid,('30000000-0000-4000-8000-'||lpad(series::text,12,'0'))::uuid,'${STORE}','Promotion fixture variant '||series,100,40,false,0,'active','2026-01-01','2026-01-01' FROM pg_catalog.generate_series(1,1600) series; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;`); activate(box,PERCENT); catalogFixtureProductBaseline=baselineProductCount; const value=evaluate(box); assert.equal(Number(scalar(box,`SELECT count(*) FROM saas.products WHERE store_id='${STORE}'`)),catalogFixtureProductBaseline+1600); assert.equal(value.discountTotalMinor,30,JSON.stringify(value)); });
  scenario("same-product X/Y forms groups per product and attributes rewards to that product", () => {
    const cheap="50000000-0000-4000-8000-000000000180", expensive="50000000-0000-4000-8000-000000000181", id="70000000-0000-4000-8000-000000000180", document=JSON.parse(rule({kind:"buy_x_get_y",buyQuantity:2,receiveQuantity:1,discountPercentageBps:10000,reward:{strategy:"same_product_cheapest"}}));
    psql(box,`INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES('${cheap}','${STORE}','xy-cheap','X/Y cheap','active','TRY','2026-01-01','2026-01-01'),('${expensive}','${STORE}','xy-expensive','X/Y expensive','active','TRY','2026-01-01','2026-01-01'); ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES('${cheap}','${cheap}','${STORE}','cheap',50,10,false,0,'active','2026-01-01','2026-01-01'),('${expensive}','${expensive}','${STORE}','expensive',200,10,false,0,'active','2026-01-01','2026-01-01'); ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile; INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','multi xy','active',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01');`);
    activate(box,id);
    const line=(productId,position,quantity,price)=>({lineId:productId,position,productId,variantId:productId,quantity,unitPriceMinor:price,unitCostMinor:10,currency:"TRY",categoryIds:[],brandId:null,collectionIds:[]});
    const requestedLines=[line(cheap,0,2,50),line(expensive,1,4,200)], value=evaluate(box,{cartLines:requestedLines});
    assert.equal(value.discountTotalMinor,200,JSON.stringify(value)); assert.deepEqual(value.lineEffects,[{promotionId:id,lineId:expensive,discountMinor:200,giftQuantity:0}]); parseContract(value);
    const pooledOnly=evaluate(box,{cartLines:[line(cheap,0,1,50),line(expensive,1,2,200)]}); assert.equal(pooledOnly.discountTotalMinor,0); assert.deepEqual(pooledOnly.lineEffects,[]); parseContract(pooledOnly);
  });
  scenario("abandoned-cart audiences require a current same-store durable episode", () => { const id="70000000-0000-4000-8000-000000000181", cart="80000000-0000-4000-8000-000000000181", old="80000000-0000-4000-8000-000000000182", future="80000000-0000-4000-8000-000000000183", futureDigest=createHash("sha256").update("abandoned-cart-future-181").digest("hex"), document=validRuleDocument(); document.audience={mode:"abandoned_cart"}; psql(box,`INSERT INTO saas.abandoned_carts(id,store_id,public_cart_digest,status,currency,subtotal_cents,discount_cents,total_cents,checkout_started_at,last_activity_at,abandoned_at,created_at,updated_at) VALUES('${cart}','${STORE}',repeat('a',64),'abandoned','TRY',0,0,0,'2026-08-30','2026-08-30','2026-09-01','2026-08-30','2026-09-01'),('${old}','${STORE}',repeat('b',64),'abandoned','TRY',0,0,0,'2026-06-01','2026-06-01','2026-06-02','2026-06-01','2026-06-02'),('${future}','${STORE}','${futureDigest}','abandoned','TRY',0,0,0,'2026-09-06','2026-09-06','2026-09-06','2026-09-06','2026-09-06'); INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','cart audience','active',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01');`); activate(box,id); assert.equal(evaluate(box,{abandonedCart:{id:cart}}).discountTotalMinor,30); assert.equal(evaluate(box,{abandonedCart:{id:old}}).discountTotalMinor,0); assert.equal(evaluate(box,{abandonedCart:{id:future}}).discountTotalMinor,0); assert.equal(evaluate(box,{abandonedCart:{id:OTHER_PRODUCT}}).discountTotalMinor,0); });
  scenario("created-at then UUID independently break equal-saving equal-priority ties", () => { const early="70000000-0000-4000-8000-000000000190", late="70000000-0000-4000-8000-000000000191", low="70000000-0000-4000-8000-000000000192", high="70000000-0000-4000-8000-000000000193", document=validRuleDocument(); psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${early}','${STORE}','early','active',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01'),('${late}','${STORE}','late','active',1,'${JSON.stringify(document)}','2026-01-02','2026-01-02'),('${low}','${STORE}','low','active',1,'${JSON.stringify(document)}','2026-01-03','2026-01-03'),('${high}','${STORE}','high','active',1,'${JSON.stringify(document)}','2026-01-03','2026-01-03');`); activate(box,early); psql(box,`UPDATE saas.promotions SET status='active' WHERE id='${late}'`); assert.equal(evaluate(box).appliedPromotions[0].promotionId,early); activate(box,low); psql(box,`UPDATE saas.promotions SET status='active' WHERE id='${high}'`); assert.equal(evaluate(box).appliedPromotions[0].promotionId,low); });
  scenario("selected-products and specific-variant X/Y allocate only their multi-group rewarded lines", () => { const a="50000000-0000-4000-8000-000000000190", b="50000000-0000-4000-8000-000000000191", selected="70000000-0000-4000-8000-000000000194", specific="70000000-0000-4000-8000-000000000195", lines=[{lineId:a,position:0,productId:a,variantId:a,quantity:2,unitPriceMinor:60,unitCostMinor:10,currency:"TRY",categoryIds:[],brandId:null,collectionIds:[]},{lineId:b,position:1,productId:b,variantId:b,quantity:4,unitPriceMinor:150,unitCostMinor:10,currency:"TRY",categoryIds:[],brandId:null,collectionIds:[]}], selectedRule=JSON.parse(rule({kind:"buy_x_get_y",buyQuantity:2,receiveQuantity:1,discountPercentageBps:10000,reward:{strategy:"selected_products_cheapest",productIds:[a]}})), specificRule=JSON.parse(rule({kind:"buy_x_get_y",buyQuantity:2,receiveQuantity:1,discountPercentageBps:10000,reward:{strategy:"specific_variant",variantId:a}})); psql(box,`INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES('${a}','${STORE}','xy-select-a','a','active','TRY','2026-01-01','2026-01-01'),('${b}','${STORE}','xy-select-b','b','active','TRY','2026-01-01','2026-01-01'); ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES('${a}','${a}','${STORE}','a',60,10,false,0,'active','2026-01-01','2026-01-01'),('${b}','${b}','${STORE}','b',150,10,false,0,'active','2026-01-01','2026-01-01'); ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile; INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${selected}','${STORE}','selected xy','active',1,'${JSON.stringify(selectedRule)}','2026-01-01','2026-01-01'),('${specific}','${STORE}','specific xy','active',1,'${JSON.stringify(specificRule)}','2026-01-01','2026-01-01');`); for(const id of [selected,specific]) { activate(box,id); const value=evaluate(box,{cartLines:lines}); assert.equal(value.discountTotalMinor,120); assert.deepEqual(value.lineEffects,[{promotionId:id,lineId:a,discountMinor:120,giftQuantity:0}]); parseContract(value); } });
  scenario("usage budget and money caps count durable holds and never exceed payable value", () => {
    const id="70000000-0000-4000-8000-000000000196", held="70000000-0000-4000-8000-000000000197", expired="70000000-0000-4000-8000-000000000198", document=validRuleDocument();
    document.benefit={kind:"fixed_amount",amountMinor:500,currency:"TRY"}; document.limits={totalUsage:3,perCustomerUsage:2,budgetMinor:80,orderMaximumMinor:70}; document.marginPolicy={kind:"floor_at_cost"};
    psql(box,`BEGIN; INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','capped','active',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01');
      INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES('${id}','${STORE}','${id}',1,'${JSON.stringify(document)}','2026-01-01');
      INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES
        ('${held}','${STORE}','${held}','reserve',repeat('c',64),'reservation_group','${held}','${reservationOperationResult(held,[{promotionId:id,reservationId:held,discountMinor:30}],"reserved",{expiresAt:"2026-09-05T00:15:00.000Z"})}'::jsonb,'2026-09-05T00:00:00.000Z'),
        ('${expired}','${STORE}','${expired}','reserve',repeat('d',64),'reservation_group','${expired}','${reservationOperationResult(expired,[{promotionId:id,reservationId:expired,discountMinor:999}],"reserved",{expiresAt:"2026-09-01T00:00:00.000Z"})}'::jsonb,'2026-08-31T23:45:00.000Z');
      INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,reservation_group_id,customer_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES
        ('${held}','${STORE}','${id}',1,'${held}','${LINE}','${held}',repeat('c',64),'offline_checkout','${held}',30,30,'TRY','${frozenReservationSnapshot({promotionId:id,promotionName:"capped",ruleDocument:document,discountMinor:30,lineId:held})}'::jsonb,repeat('b',64),'reserved','2026-09-05T00:15:00.000Z','2026-09-05T00:00:00.000Z','2026-09-05T00:00:00.000Z'),
        ('${expired}','${STORE}','${id}',1,'${expired}','${LINE}','${expired}',repeat('d',64),'offline_checkout','${expired}',999,999,'TRY','${frozenReservationSnapshot({promotionId:id,promotionName:"capped",ruleDocument:document,discountMinor:999,evaluatedAt:"2026-08-31T23:45:00.000Z",lineId:expired})}'::jsonb,repeat('b',64),'reserved','2026-09-01T00:00:00.000Z','2026-08-31T23:45:00.000Z','2026-08-31T23:45:00.000Z'); COMMIT;`);
    activate(box,id); const value=evaluate(box,{customerId:LINE}); assert.equal(value.discountTotalMinor,50); assert.equal(value.grandTotalMinor>=0,true); parseContract(value);
  });
  scenario("safe rejection never names an inaccessible audience and progress output stays bounded", () => { const publicId="70000000-0000-4000-8000-000000000199", hiddenId="70000000-0000-4000-8000-000000000200", publicRule=validRuleDocument(), hiddenRule=validRuleDocument(); publicRule.combinationPolicy={kind:"none"}; hiddenRule.audience={mode:"masked_customers",referenceIds:[LINE]}; psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${publicId}','${STORE}','public','active',1,'${JSON.stringify(publicRule)}','2026-01-01','2026-01-01'),('${hiddenId}','${STORE}','private','active',1,'${JSON.stringify(hiddenRule)}','2026-01-02','2026-01-02');`); activate(box,publicId); psql(box,`UPDATE saas.promotions SET status='active' WHERE id='${hiddenId}'`); const value=evaluate(box); assert.equal(value.rejectedPromotions.some((entry)=>entry.promotionId===hiddenId),false); assert.equal(value.progressMessages.length<=2,true); parseContract(value); });
  scenario("context rejects oversized facts invalid time unknown channels identities and money overflow", () => {
    const ids=Array.from({length:101},(_,index)=>`00000000-0000-4000-8000-${String(index).padStart(12,"0")}`);
    const cases=[
      {...context(),customerSegmentIds:ids,cartLines:[{...context().cartLines[0],categoryIds:ids,collectionIds:ids}]},
      {...context(),storeLocalTime:"2026-02-30T00:00:00.000Z"},
      {...context(),salesChannel:"marketplace"},
      {...context(),customerId:OTHER_PRODUCT},
      {...context(),cartLines:[{...context().cartLines[0],quantity:1,unitPriceMinor:8000000000}],shippingBeforeDiscountMinor:1},
    ];
    for (const invalid of cases) assert.equal(scalar(box,`SELECT saas.promotion_evaluator_context_valid('${STORE}','${JSON.stringify(invalid)}'::jsonb)`),"f");
    assert.equal(scalar(box,`SELECT saas.promotion_evaluator_context_valid('${STORE}','${JSON.stringify({...context(),cartLines:[{...context().cartLines[0],quantity:1,unitPriceMinor:8000000000}],shippingBeforeDiscountMinor:0})}'::jsonb)`),"t");
  });
  scenario("bundle price charges the remainder at full price and applies only complete bundles", () => { const id="70000000-0000-4000-8000-000000000216", document=JSON.parse(rule(bundleBenefit())); psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','complete bundles','active',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01'); UPDATE saas.products SET status='active' WHERE id='${BUNDLE_LINE}';`); activate(box,id); const value=evaluate(box,{cartLines:bundleCart(4)}); assert.equal(value.lineDiscountTotalMinor,100); assert.equal(value.grandTotalMinor,340); parseContract(value); psql(box,`UPDATE saas.products SET status='draft' WHERE id='${BUNDLE_LINE}'`); });
  scenario("bundle composition never pools missing items and uses consumed-unit caps in ranking allocation and projection", () => {
    const id="71000000-0000-4000-8000-000000000126", competitor="71000000-0000-4000-8000-000000000127";
    const floor=JSON.parse(rule(bundleBenefit(260))); floor.marginPolicy={kind:"floor_at_cost"};
    const tier=JSON.parse(rule({kind:"quantity_tiers",tiers:[{minimumQuantity:1,percentageBps:800}]}));
    psql(box,`UPDATE saas.products SET status='active' WHERE store_id='${STORE}' AND id='${BUNDLE_LINE}'; ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET cost_cents=90 WHERE store_id='${STORE}' AND id='${LINE}'; UPDATE saas.product_variants SET price_cents=0,cost_cents=0 WHERE store_id='${STORE}' AND id='${BUNDLE_LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile; INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','consumed bundle','active',1,'${JSON.stringify(floor)}','2026-01-01','2026-01-01'),('${competitor}','${STORE}','bundle rank control','paused',1,'${JSON.stringify(tier)}','2026-01-01','2026-01-01')`);
    activate(box,id);
    const missing=evaluate(box,{cartLines:[{...context().cartLines[0],quantity:100}]});
    assert.equal(missing.discountTotalMinor,0); assert.equal(missing.appliedPromotions.some((item)=>item.promotionId===id),false);
    psql(box,`UPDATE saas.promotions SET status='active' WHERE store_id='${STORE}' AND id='${competitor}'`);
    const floorRank=evaluate(box,{cartLines:bundleCart(4),shippingBeforeDiscountMinor:0});
    assert.equal(floorRank.appliedPromotions[0].promotionId,competitor); assert.equal(floorRank.discountTotalMinor,32); parseContract(floorRank);
    psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}' AND id='${competitor}'`);
    const floorValue=evaluate(box,{cartLines:bundleCart(4),shippingBeforeDiscountMinor:0});
    assert.equal(floorValue.discountTotalMinor,30); assert.equal(floorValue.lineEffects.reduce((sum,item)=>sum+item.discountMinor,0),30); parseContract(floorValue);

    const maximum=structuredClone(floor); maximum.marginPolicy={kind:"maximum_percentage",maximumPercentageBps:1000};
    psql(box,`UPDATE saas.promotions SET rule_document='${JSON.stringify(maximum)}'::jsonb WHERE store_id='${STORE}' AND id='${id}'; UPDATE saas.promotions SET status='active',rule_document=pg_catalog.jsonb_set(rule_document,'{benefit,tiers,0,percentageBps}','900'::jsonb) WHERE store_id='${STORE}' AND id='${competitor}'`);
    const maximumRank=evaluate(box,{cartLines:bundleCart(4),shippingBeforeDiscountMinor:0});
    assert.equal(maximumRank.appliedPromotions[0].promotionId,competitor); assert.equal(maximumRank.discountTotalMinor,36); parseContract(maximumRank);
    psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}' AND id='${competitor}'`);
    assert.equal(evaluate(box,{cartLines:bundleCart(4),shippingBeforeDiscountMinor:0}).discountTotalMinor,30);

    const warn=JSON.parse(rule(bundleBenefit(200)));
    psql(box,`UPDATE saas.promotions SET rule_document='${JSON.stringify(warn)}'::jsonb WHERE store_id='${STORE}' AND id='${id}'`);
    const repeatedCart=bundleCart(7); repeatedCart[1]={...repeatedCart[1],quantity:2};
    const repeated=evaluate(box,{cartLines:repeatedCart,shippingBeforeDiscountMinor:0});
    assert.equal(repeated.discountTotalMinor,200); assert.equal(repeated.grandTotalMinor,500); parseContract(repeated);
    const split=[{...context().cartLines[0],lineId:"72000000-0000-4000-8000-000000000126",position:0,quantity:1},{...context().cartLines[0],lineId:"72000000-0000-4000-8000-000000000127",position:1,quantity:2},{lineId:BUNDLE_LINE,position:2,productId:BUNDLE_LINE,variantId:BUNDLE_LINE,quantity:1,unitPriceMinor:0,unitCostMinor:0,currency:"TRY",categoryIds:[],brandId:null,collectionIds:[]}];
    const splitValue=evaluate(box,{cartLines:split,shippingBeforeDiscountMinor:0});
    assert.equal(splitValue.discountTotalMinor,100); assert.equal(splitValue.lineEffects.reduce((sum,item)=>sum+item.discountMinor,0),100); parseContract(splitValue);
    const reordered=structuredClone(warn); reordered.benefit.items.reverse(); reordered.targets.include.reverse();
    assert.equal(scalar(box,`SELECT saas.promotion_operation_fingerprint_v2('create','${STORE}',pg_catalog.jsonb_build_object('name','Bundle canonical','ruleDocument','${JSON.stringify(warn)}'::jsonb))=saas.promotion_operation_fingerprint_v2('create','${STORE}',pg_catalog.jsonb_build_object('name','Bundle canonical','ruleDocument','${JSON.stringify(reordered)}'::jsonb))`),"t");

    const weighted=JSON.parse(rule({kind:"bundle_price",items:[{variantId:LINE,quantity:2},{variantId:BUNDLE_LINE,quantity:3}],bundlePriceMinor:310,currency:"TRY"}));
    psql(box,`ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET price_cents=50,cost_cents=45 WHERE store_id='${STORE}' AND id='${BUNDLE_LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
    const margin=checkProjection(box,"promotion_margin_check_v1","analyst",weighted);
    assert.equal(margin.outcome,"checked"); assert.equal(margin.result.summary.atRiskVariantCount,2);
    psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}' AND id IN ('${id}','${competitor}'); UPDATE saas.products SET status='draft' WHERE store_id='${STORE}' AND id='${BUNDLE_LINE}'; ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; UPDATE saas.product_variants SET cost_cents=40 WHERE store_id='${STORE}' AND id='${LINE}'; UPDATE saas.product_variants SET price_cents=0,cost_cents=0 WHERE store_id='${STORE}' AND id='${BUNDLE_LINE}'; ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
  });
  scenario("compatible full campaigns and X/Y never divide by zero or exceed remaining line value", () => {
    const percent="70000000-0000-4000-8000-000000000211", xy="70000000-0000-4000-8000-000000000212", secondPercent="70000000-0000-4000-8000-000000000217";
    const full=validRuleDocument(), reward=JSON.parse(rule({kind:"buy_x_get_y",buyQuantity:2,receiveQuantity:1,discountPercentageBps:10000,reward:{strategy:"same_product_cheapest"}})), anotherFull=validRuleDocument();
    full.benefit={kind:"percentage",percentageBps:10000}; full.combinationPolicy={kind:"benefit_classes",benefitClasses:["percentage","buy_x_get_y"]};
    reward.combinationPolicy={kind:"benefit_classes",benefitClasses:["percentage","buy_x_get_y"]};
    anotherFull.benefit={kind:"percentage",percentageBps:10000}; anotherFull.combinationPolicy={kind:"benefit_classes",benefitClasses:["percentage"]};
    psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${percent}','${STORE}','full','active',1,'${JSON.stringify(full)}','2026-01-01','2026-01-01'),('${xy}','${STORE}','xy','active',1,'${JSON.stringify(reward)}','2026-01-01','2026-01-01'),('${secondPercent}','${STORE}','second full','paused',1,'${JSON.stringify(anotherFull)}','2026-01-02','2026-01-02');`);
    activate(box,percent); psql(box,`UPDATE saas.promotions SET status='active' WHERE id='${xy}'`);
    const xyValue=evaluate(box); assert.equal(xyValue.lineDiscountTotalMinor,300); assert.equal(xyValue.grandTotalMinor,40); assert.equal(xyValue.lineEffects.every((effect)=>effect.discountMinor>=0),true); parseContract(xyValue);
    psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'; UPDATE saas.promotions SET status='active' WHERE id IN ('${percent}','${secondPercent}'); UPDATE saas.promotions SET rule_document=pg_catalog.jsonb_set(rule_document,'{combinationPolicy}','{"kind":"benefit_classes","benefitClasses":["percentage"]}'::jsonb) WHERE id='${percent}'`);
    const twoLines=[{...context().cartLines[0],lineId:"50000000-0000-4000-8000-000000000217",position:0,quantity:1},{...context().cartLines[0],lineId:"50000000-0000-4000-8000-000000000218",position:1,quantity:1}];
    const fullValue=evaluate(box,{cartLines:twoLines,shippingBeforeDiscountMinor:0});
    assert.equal(fullValue.lineDiscountTotalMinor,200); assert.equal(fullValue.grandTotalMinor,0); assert.equal(fullValue.appliedPromotions.length,1); assert.equal(fullValue.rejectedPromotions.length,1); parseContract(fullValue);
  });
  scenario("non-combinable complex benefits rank by their fully capped customer saving", () => { const bundle="70000000-0000-4000-8000-000000000213", tier="70000000-0000-4000-8000-000000000214", capped=JSON.parse(rule(bundleBenefit(0))), better=JSON.parse(rule({kind:"quantity_tiers",tiers:[{minimumQuantity:2,percentageBps:1000}]})); capped.priority=100; capped.limits={totalUsage:null,perCustomerUsage:null,budgetMinor:10,orderMaximumMinor:null}; psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${bundle}','${STORE}','capped bundle','active',1,'${JSON.stringify(capped)}','2026-01-01','2026-01-01'),('${tier}','${STORE}','tier','active',1,'${JSON.stringify(better)}','2026-01-01','2026-01-01'); UPDATE saas.products SET status='active' WHERE id='${BUNDLE_LINE}';`); activate(box,bundle); psql(box,`UPDATE saas.promotions SET status='active' WHERE id='${tier}'`); const value=evaluate(box,{cartLines:bundleCart(4)}); assert.equal(value.appliedPromotions[0].promotionId,tier); assert.equal(value.discountTotalMinor,40); parseContract(value); psql(box,`UPDATE saas.products SET status='draft' WHERE id='${BUNDLE_LINE}'`); });
  scenario("bundle ranking uses only complete-bundle value before choosing a non-combinable winner", () => { const bundle="70000000-0000-4000-8000-000000000219", tier="70000000-0000-4000-8000-000000000220", bundleRule=JSON.parse(rule(bundleBenefit(0))), tierRule=JSON.parse(rule({kind:"quantity_tiers",tiers:[{minimumQuantity:2,percentageBps:9000}]})); psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${bundle}','${STORE}','bundle rank','active',1,'${JSON.stringify(bundleRule)}','2026-01-01','2026-01-01'),('${tier}','${STORE}','tier rank','active',1,'${JSON.stringify(tierRule)}','2026-01-01','2026-01-01'); UPDATE saas.products SET status='active' WHERE id='${BUNDLE_LINE}';`); activate(box,bundle); psql(box,`UPDATE saas.promotions SET status='active' WHERE id='${tier}'`); const value=evaluate(box,{cartLines:bundleCart(4)}); assert.equal(value.appliedPromotions[0].promotionId,tier); assert.equal(value.discountTotalMinor,360); psql(box,`UPDATE saas.products SET status='draft' WHERE id='${BUNDLE_LINE}'`); });
  scenario("proportional allocation is exact and never leaves a remainder on a zero-payable line", () => {
    const productIds=["50000000-0000-4000-8000-000000000213","50000000-0000-4000-8000-000000000214","50000000-0000-4000-8000-000000000215"], id="70000000-0000-4000-8000-000000000215", fixed=JSON.parse(rule({kind:"fixed_amount",amountMinor:1,currency:"TRY"}));
    psql(box,`INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES('${productIds[0]}','${STORE}','allocation-one','one','active','TRY','2026-01-01','2026-01-01'),('${productIds[1]}','${STORE}','allocation-two','two','active','TRY','2026-01-01','2026-01-01'),('${productIds[2]}','${STORE}','allocation-zero','zero','active','TRY','2026-01-01','2026-01-01'); ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES('${productIds[0]}','${productIds[0]}','${STORE}','one',1,0,false,0,'active','2026-01-01','2026-01-01'),('${productIds[1]}','${productIds[1]}','${STORE}','two',1,0,false,0,'active','2026-01-01','2026-01-01'),('${productIds[2]}','${productIds[2]}','${STORE}','zero',0,0,false,0,'active','2026-01-01','2026-01-01'); ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile; INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','unit allocation','active',1,'${JSON.stringify(fixed)}','2026-01-01','2026-01-01')`);
    const lines=productIds.map((productId,position)=>({lineId:productId,position,productId,variantId:productId,quantity:1,unitPriceMinor:1,unitCostMinor:1,currency:"JPY",categoryIds:[],brandId:null,collectionIds:[]}));
    activate(box,id); const value=evaluate(box,{cartLines:lines,shippingBeforeDiscountMinor:0});
    assert.equal(value.subtotalBeforeDiscountMinor,2); assert.equal(value.lineDiscountTotalMinor,1); assert.equal(value.lineEffects.length,1); assert.equal(value.lineEffects[0].lineId,productIds[1]);
    const discounts=Object.fromEntries(productIds.map((lineId)=>[lineId,value.lineEffects.filter((effect)=>effect.lineId===lineId).reduce((sum,effect)=>sum+effect.discountMinor,0)]));
    assert.equal(discounts[productIds[0]]<=1 && discounts[productIds[1]]<=1 && discounts[productIds[2]]===0,true); parseContract(value);
  });
  scenario("selected persisted catalog and audience facts stay bounded from 1 to 100 promotions at 20 distinct lines", antiFanoutProof);
  scenario("gift variant validity stays set-wise from 1 to 100 promotions", giftFanoutProof);
  scenario("the PostgreSQL payload is accepted by the Task 1 evaluator contract", () => { activate(box,PERCENT); parseContract(evaluate(box)); });
  scenario("harness used no external connection", () => assert.equal(process.env.DATABASE_URL, undefined));
  scenario("reservation authority facts and same-store composite constraints are frozen in schema", () => {
    const typedReservationResult = reservationOperationResult("93000000-0000-4000-8000-000000000126", [{promotionId:PERCENT,reservationId:"93100000-0000-4000-8000-000000000126",discountMinor:10}]);
    const typedRedemptionResult = redemptionOperationResult("93000000-0000-4000-8000-000000000126", "93200000-0000-4000-8000-000000000126", "70000000-0000-4000-8000-000000000126", [{promotionId:PERCENT,reservationId:"93100000-0000-4000-8000-000000000126",redemptionId:"93300000-0000-4000-8000-000000000126",discountMinor:10}]);
    assert.equal(scalar(box, `SELECT saas.promotion_operation_result_valid('reserve','${typedReservationResult}'::jsonb)`), "t");
    assert.equal(scalar(box, `SELECT saas.promotion_operation_result_valid('reserve',pg_catalog.jsonb_set('${typedReservationResult}'::jsonb,'{evaluatorFingerprint}',pg_catalog.to_jsonb(repeat('1',64)::numeric)))`), "f");
    assert.equal(scalar(box, `SELECT saas.promotion_operation_result_valid('commit','${typedRedemptionResult}'::jsonb)`), "t");
    assert.equal(scalar(box, `SELECT saas.promotion_operation_result_valid('commit',pg_catalog.jsonb_set('${typedRedemptionResult}'::jsonb,'{evaluatorFingerprint}',pg_catalog.to_jsonb(repeat('1',64)::numeric)))`), "f");
    assert.equal(scalar(box, `SELECT pg_catalog.string_agg(column_name,',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='saas' AND table_name='promotion_usage_reservations' AND column_name IN ('promotion_version','normalized_code','reservation_group_id','currency','discount_minor','evaluator_snapshot','evaluator_fingerprint','operation_fingerprint','source_kind')`), "promotion_version,normalized_code,reservation_group_id,operation_fingerprint,source_kind,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint");
    assert.equal(scalar(box, `SELECT pg_catalog.string_agg(column_name,',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='saas' AND table_name='promotion_redemptions' AND column_name IN ('reservation_group_id','redemption_group_id')`), "reservation_group_id,redemption_group_id");
    assert.equal(scalar(box, `SELECT pg_catalog.string_agg(column_name,',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='saas' AND table_name='promotion_operations' AND column_name IN ('result_entity_kind','result_entity_id','result_payload')`), "result_entity_kind,result_entity_id,result_payload");
    const constraints = "'promotion_code_batches_operation_store_fk','promotion_codes_batch_store_fk','promotion_usage_reservations_version_store_fk','promotion_usage_reservations_code_store_fk','promotion_usage_reservations_operation_store_fk','promotion_usage_reservations_customer_store_fk','promotion_redemptions_version_store_fk','promotion_redemptions_code_store_fk','promotion_redemptions_reservation_store_fk','promotion_redemptions_operation_store_fk','promotion_redemptions_customer_store_fk','promotion_redemptions_order_store_fk','order_promotion_snapshots_order_store_fk','order_promotion_snapshots_version_store_fk','order_promotion_snapshots_redemption_store_fk','order_discount_allocations_snapshot_store_fk','order_discount_allocations_order_store_fk','order_discount_allocations_line_store_fk'";
    assert.equal(scalar(box, `SELECT count(*)||':'||count(*) FILTER (WHERE convalidated) FROM pg_catalog.pg_constraint WHERE connamespace='saas'::regnamespace AND conname IN (${constraints})`), "18:18");
    assert.equal(scalar(box,`SELECT pg_catalog.pg_get_constraintdef(oid) FROM pg_catalog.pg_constraint WHERE conrelid='saas.order_promotion_snapshots'::regclass AND conname='order_promotion_snapshots_redemption_store_fk'`),"FOREIGN KEY (store_id, redemption_id) REFERENCES saas.promotion_redemptions(store_id, id)");
    assert.equal(scalar(box, `SELECT count(*) FROM pg_catalog.pg_constraint constraint_row JOIN pg_catalog.pg_class relation ON relation.oid=constraint_row.conrelid WHERE relation.relnamespace='saas'::regnamespace AND relation.relname IN ('promotions','promotion_versions','promotion_targets','promotion_codes','promotion_code_batches','promotion_usage_reservations','promotion_redemptions','promotion_audit_events','promotion_operations','order_promotion_snapshots','order_discount_allocations') AND constraint_row.contype='f' AND NOT constraint_row.convalidated`), "0");
    assert.equal(scalar(box, `SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid IN ('saas.promotion_usage_reservations'::regclass,'saas.promotion_redemptions'::regclass) AND conname IN ('promotion_usage_reservations_code_store_fk','promotion_redemptions_code_store_fk') AND pg_catalog.pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (store_id, promotion_id, code_id, normalized_code)%'`),"2");
    assert.equal(scalar(box, `SELECT is_nullable FROM information_schema.columns WHERE table_schema='saas' AND table_name='promotion_redemptions' AND column_name='order_id'`),"NO");
    assert.equal(scalar(box, `SELECT count(*) FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND ((tgrelid='saas.promotion_usage_reservations'::regclass AND tgname='promotion_usage_reservations_insert_binding') OR (tgrelid='saas.promotion_redemptions'::regclass AND tgname='promotion_redemptions_insert_binding'))`),"2");
    assert.equal(scalar(box, `SELECT count(*) FROM pg_catalog.pg_trigger trigger_row JOIN pg_catalog.pg_constraint constraint_row ON constraint_row.oid=trigger_row.tgconstraint WHERE trigger_row.tgrelid='saas.promotion_operations'::regclass AND trigger_row.tgname='promotion_operations_group_complete' AND NOT trigger_row.tgisinternal AND trigger_row.tgenabled='O' AND constraint_row.contype='t' AND constraint_row.condeferrable AND constraint_row.condeferred`),"1");
  });
  scenario("app and workflow grants expose only merchant RPCs and bounded expiry", () => {
    assert.equal(scalar(box, "SELECT pg_catalog.has_function_privilege('celebix_saas_app','saas.promotion_recover_operation_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)'::regprocedure,'EXECUTE')"), "t");
    assert.equal(scalar(box, "SELECT pg_catalog.has_function_privilege('celebix_saas_workflow','saas.promotion_expire_due_reservations_v1(timestamp with time zone,integer)'::regprocedure,'EXECUTE')"), "t");
    assert.equal(scalar(box, "SELECT count(*) FROM pg_catalog.pg_proc proc WHERE proc.pronamespace='saas'::regnamespace AND proc.proname LIKE 'promotion_%' AND pg_catalog.has_function_privilege('celebix_saas_workflow',proc.oid,'EXECUTE')"), "1");
    assert.equal(scalar(box, "SELECT pg_catalog.string_agg(DISTINCT proc.proname,',' ORDER BY proc.proname) FROM pg_catalog.pg_proc proc WHERE proc.pronamespace='saas'::regnamespace AND proc.proname LIKE 'promotion_%' AND pg_catalog.has_function_privilege('celebix_saas_app',proc.oid,'EXECUTE')"), "promotion_analytics_v1,promotion_analytics_v2,promotion_code_batch_list_v1,promotion_code_batch_status_v1,promotion_codes_csv_v1,promotion_conflicts_v1,promotion_create_code_batch_v1,promotion_create_v1,promotion_detail_v1,promotion_duplicate_v1,promotion_legacy_list_v1,promotion_legacy_resolve_v1,promotion_lifecycle_v1,promotion_list_v1,promotion_margin_check_v1,promotion_overview_v1,promotion_picker_list_v1,promotion_picker_resolve_v1,promotion_recover_operation_v1,promotion_simulate_v1,promotion_store_timezone_v1,promotion_storefront_origin_v1,promotion_update_v1");
    assert.equal(appScalar(box, `SELECT outcome||':'||(result_payload->>'timezone') FROM saas.promotion_store_timezone_v1(${authorityArguments("analyst")})`), "listed:Europe/Istanbul");
    assert.equal(appScalar(box, `SELECT outcome||':'||(result_payload->>'origin') FROM saas.promotion_storefront_origin_v1(${authorityArguments("analyst")})`), `listed:https://${STOREFRONT_HOST}`);
    assert.equal(scalar(box,"SELECT pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.public_promotion_compiled_read_v1(text,timestamp with time zone,text,text)'::regprocedure,'EXECUTE')"),"t");
    assert.equal(scalar(box,"SELECT pg_catalog.has_function_privilege('celebix_saas_app','saas.public_promotion_compiled_read_v1(text,timestamp with time zone,text,text)'::regprocedure,'EXECUTE')"),"f");
    const compiled=JSON.parse(scalar(box,`SET ROLE celebix_saas_host_resolver; SELECT result_payload FROM saas.public_promotion_compiled_read_v1('${STOREFRONT_HOST}','2026-09-05T00:00:00.000Z','TRY','storefront'); RESET ROLE`));
    assert.equal(compiled.schemaVersion,1); assert.equal(compiled.storeId,STORE); assert.equal(compiled.currency,"TRY"); assert.equal(compiled.salesChannel,"storefront"); assert.equal(compiled.definitions.length<=100,true); assert.deepEqual([...compiled.definitions].sort((left,right)=>left.id.localeCompare(right)),compiled.definitions);
    for (const definition of compiled.definitions) { assert.equal(validates(box,definition.ruleDocument),"t"); assert.equal(scalar(box,`SELECT status FROM saas.promotions WHERE store_id='${STORE}' AND id='${definition.id}'`),"active"); }
    assert.equal(scalar(box, "SELECT pg_catalog.has_function_privilege('public','saas.promotion_store_timezone_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)'::regprocedure,'EXECUTE')"), "f");
    assert.equal(scalar(box,"SELECT pg_catalog.has_function_privilege('celebix_saas_app','saas.promotion_picker_source_v1(uuid,text)'::regprocedure,'EXECUTE')"),"f");
    for (const role of ["celebix_saas_identity","celebix_saas_host_resolver"]) assert.equal(scalar(box, `SELECT count(*) FROM pg_catalog.pg_proc proc WHERE proc.pronamespace='saas'::regnamespace AND proc.proname LIKE 'promotion_%' AND pg_catalog.has_function_privilege('${role}',proc.oid,'EXECUTE')`), "0", role);
    const settlementSignatures = ["promotion_reserve_v1(uuid,uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,timestamp with time zone)","promotion_release_reservation_v1(uuid,uuid,uuid,timestamp with time zone)","promotion_commit_reservation_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,timestamp with time zone)","promotion_expire_due_reservations_v1(timestamp with time zone,integer)"];
    for (const role of ["celebix_saas_app","celebix_saas_identity","celebix_saas_host_resolver"]) for (const signature of settlementSignatures) assert.equal(scalar(box, `SELECT pg_catalog.has_function_privilege('${role}','saas.${signature}'::regprocedure,'EXECUTE')`), "f", `${role}:${signature}`);
    for (const signature of settlementSignatures) assert.equal(scalar(box, `SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_proc proc CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(proc.proacl,pg_catalog.acldefault('f',proc.proowner))) acl WHERE proc.oid='saas.${signature}'::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE')`), "f", `PUBLIC:${signature}`);
    assert.equal(scalar(box, `WITH promotion_tables AS (SELECT oid,relacl FROM pg_catalog.pg_class WHERE relnamespace='saas'::regnamespace AND relname IN ('promotions','promotion_versions','promotion_targets','promotion_codes','promotion_code_batches','promotion_usage_reservations','promotion_redemptions','promotion_audit_events','promotion_operations','order_promotion_snapshots','order_discount_allocations')), named_roles(role_name) AS (VALUES('celebix_saas_app'),('celebix_saas_workflow'),('celebix_saas_identity'),('celebix_saas_host_resolver')), privileges(privilege_name) AS (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) SELECT (SELECT count(*) FROM promotion_tables table_row CROSS JOIN named_roles role_row CROSS JOIN privileges privilege_row WHERE pg_catalog.has_table_privilege(role_row.role_name,table_row.oid,privilege_row.privilege_name))+(SELECT count(*) FROM promotion_tables table_row CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(table_row.relacl,'{}'::aclitem[])) acl WHERE acl.grantee=0)`), "0");
    assert.equal(scalar(box, "SET ROLE celebix_saas_workflow; SELECT saas.promotion_expire_due_reservations_v1('2026-09-05T00:00:00Z',100); RESET ROLE"), "1");
  });
  scenario("store owner and admin mutate through the actual app-role RPC", () => {
    const fixtures = [
      ["store_owner","90000000-0000-4000-8000-000000000126","91000000-0000-4000-8000-000000000126","Owner promotion"],
      ["admin","90000000-0000-4000-8000-000000000127","91000000-0000-4000-8000-000000000127","Admin promotion"],
    ];
    for (const [role,promotionId,operationId,name] of fixtures) assert.equal(appScalar(box,createCall(box,role,promotionId,operationId,name)),`created:${promotionId}`);
  });
  scenario("optimistic mutation inputs reject null and out-of-safe-range versions without mutation", () => {
    const promotion = "90000000-0000-4000-8000-000000000126", document = validRuleDocument(), encodedRule = JSON.stringify(document).replaceAll("'", "''");
    const update = (operation, expectedVersion) => {
      const fingerprint = scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('update','${STORE}',pg_catalog.jsonb_build_object('id','${promotion}'::uuid,'expectedVersion',${expectedVersion},'name','Owner promotion','ruleDocument','${encodedRule}'::jsonb))`);
      return appScalar(box, `SELECT outcome FROM saas.promotion_update_v1(${authorityArguments("store_owner")},'${operation}','${fingerprint}','${promotion}',${expectedVersion},'Owner promotion','${encodedRule}'::jsonb)`);
    };
    assert.equal(update("91000000-0000-4000-8000-000000000140", "NULL::bigint"), "invalid_input");
    assert.equal(update("91000000-0000-4000-8000-000000000141", "0::bigint"), "invalid_input");
    assert.equal(update("91000000-0000-4000-8000-000000000142", "9007199254740992::bigint"), "invalid_input");
    const lifecycleFingerprint = scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('lifecycle','${STORE}',pg_catalog.jsonb_build_object('id','${promotion}'::uuid,'expectedVersion',NULL::bigint,'nextStatus','paused'))`);
    assert.equal(appScalar(box, `SELECT outcome FROM saas.promotion_lifecycle_v1(${authorityArguments("store_owner")},'91000000-0000-4000-8000-000000000143','${lifecycleFingerprint}','${promotion}',NULL,'paused')`), "invalid_input");
    assert.equal(appScalar(box, `SELECT outcome FROM saas.promotion_lifecycle_v1(${authorityArguments("store_owner")},'91000000-0000-4000-8000-000000000144',repeat('a',64),'${promotion}',1,NULL)`), "invalid_input");
    const batchFingerprint = scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('code_batch','${STORE}',pg_catalog.jsonb_build_object('promotionId','${promotion}'::uuid,'count',NULL::integer,'prefix','SAFE'))`);
    assert.equal(appScalar(box, `SELECT outcome FROM saas.promotion_create_code_batch_v1(${authorityArguments("store_owner")},'91000000-0000-4000-8000-000000000145','${batchFingerprint}','92000000-0000-4000-8000-000000000145','${promotion}',NULL,'SAFE')`), "invalid_input");
    const invalidPrefixFingerprint = scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('code_batch','${STORE}',pg_catalog.jsonb_build_object('promotionId','${promotion}'::uuid,'count',1,'prefix','-FORMULA'))`);
    assert.equal(appScalar(box, `SELECT outcome FROM saas.promotion_create_code_batch_v1(${authorityArguments("store_owner")},'91000000-0000-4000-8000-000000000151','${invalidPrefixFingerprint}','92000000-0000-4000-8000-000000000151','${promotion}',1,'-FORMULA')`), "invalid_input");
    const before = scalar(box, `SELECT (SELECT count(*) FROM saas.promotions)||':'||(SELECT count(*) FROM saas.promotion_versions)||':'||(SELECT count(*) FROM saas.promotion_audit_events)||':'||(SELECT count(*) FROM saas.promotion_operations)`);
    const invalidCreate = createCall(box,"store_owner","90000000-0000-4000-8000-000000000146","91000000-0000-4000-8000-000000000146","Infinite create").replace("'2026-09-05T00:00:00Z'","'infinity'");
    assert.equal(appScalar(box,invalidCreate),"invalid_input:");
    assert.equal(appScalar(box,updateCall(box,"store_owner",promotion,"91000000-0000-4000-8000-000000000147",1,"Infinite update",document,"-infinity")),"invalid_input:");
    assert.equal(appScalar(box,lifecycleCall(box,"store_owner",promotion,"91000000-0000-4000-8000-000000000148",1,"archived","infinity")),"invalid_input:");
    assert.equal(appScalar(box,duplicateCall(box,"store_owner","90000000-0000-4000-8000-000000000149",promotion,"91000000-0000-4000-8000-000000000149",1,"Infinite duplicate",[],"-infinity")),"invalid_input:");
    const simulated=JSON.parse(simulateSelected(box,"analyst",{id:"90000000-0000-4000-8000-000000000150",expectedVersion:null,name:"Infinite simulation",ruleDocument:document},{},"infinity"));
    assert.equal(simulated.outcome,"invalid_input");
    const evaluated=JSON.parse(scalar(box,`SELECT saas.promotion_evaluate_v1('${STORE}','${JSON.stringify(context()).replaceAll("'","''")}'::jsonb,'-infinity')`));
    assert.equal(evaluated.merchantExplanation,"promotion_context_unavailable");
    assert.equal(scalar(box,"SELECT saas.promotion_safe_timestamptz('infinity') IS NULL AND saas.promotion_safe_timestamptz('-infinity') IS NULL"),"t");
    assert.equal(scalar(box, `SELECT (SELECT count(*) FROM saas.promotions)||':'||(SELECT count(*) FROM saas.promotion_versions)||':'||(SELECT count(*) FROM saas.promotion_audit_events)||':'||(SELECT count(*) FROM saas.promotion_operations)`),before);
    assert.equal(scalar(box, `SELECT version FROM saas.promotions WHERE store_id='${STORE}' AND id='${promotion}'`), "1");
  });
  scenario("editor and analyst read and simulate through actual app-role RPCs", () => {
    const payload = JSON.stringify(context()).replaceAll("'", "''");
    for (const role of ["editor","analyst"]) {
      assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_list_v1(${authorityArguments(role)},NULL,ARRAY[]::text[],10)`),"listed");
      assert.equal(appScalar(box,`SELECT outcome||':'||(result_payload->>'mutated') FROM saas.promotion_simulate_v1(${authorityArguments(role)},'${payload}'::jsonb)`),"simulated:false");
    }
    const legacyRows = [["89000000-0000-4000-8000-000000000001","2026-09-01","draft"],["89000000-0000-4000-8000-000000000002","2026-09-02","draft"],["89000000-0000-4000-8000-000000000003","2026-09-03","paused"]];
    for (const [id,updatedAt,status] of legacyRows) psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','LEGACY-COMPAT ${id.slice(-1)}','${status}',1,'${JSON.stringify(validRuleDocument())}'::jsonb,'2026-01-01','${updatedAt}')`);
    const legacyList=JSON.parse(appScalar(box,`SELECT result_payload FROM saas.promotion_list_v1(${authorityArguments("analyst")},'LEGACY-COMPAT',ARRAY['draft']::text[],2)`));
    assert.deepEqual(Object.keys(legacyList),["items"]); assert.deepEqual(legacyList.items.map((item)=>item.id),[legacyRows[1][0],legacyRows[0][0]]);
    assert.deepEqual(Object.keys(legacyList.items[0]).sort(),["createdAt","id","name","ruleDocument","status","updatedAt","version"].sort()); assert.equal(legacyList.items[0].status,"draft");
    const pickerAuthorities = [
      ["product",LINE,"Promotion line"],["variant",LINE,"Promotion line • Promotion variant"],["category",CATEGORY,"Promotion category"],
      ["brand",BRAND,"Promotion brand"],["collection",COLLECTION,"Promotion collection"],["customer_segment",LINE,"Promotion segment"],
      ["customer_tag",LINE,"Promotion tag"],["masked_customer",LINE,"Maskeli müşteri ••••0126"],["abandoned_cart","80000000-0000-4000-8000-000000000181","Terk edilmiş sepet ••••0181"],["payment_method",PAYMENT_METHOD,"Promotion payment"],
      ["shipping_method",LINE,"Standart kargo"],
    ];
    for (const [kind,id,label] of pickerAuthorities) {
      const response=pickerList(box,"analyst",kind,label,50); assert.equal(response.outcome,"listed");
      assert.deepEqual(response.result.items,[{kind,id,label,status:"active"}]); assert.equal(response.result.hasMore,false); assert.equal(response.result.cursorAnchor,null);
      assert.deepEqual(Object.keys(response.result.items[0]).sort(),["id","kind","label","status"]);
    }
    const pickerAlpha="5f000000-0000-4000-8000-000000000001", pickerBeta="5f000000-0000-4000-8000-000000000002", pickerHidden="5f000000-0000-4000-8000-000000000003", pickerLiteral="5f000000-0000-4000-8000-000000000004", pickerTieA="5f000000-0000-4000-8000-000000000005", pickerTieB="5f000000-0000-4000-8000-000000000006", pickerShippingInactive="5f000000-0000-4000-8000-000000000007", pickerShippingForeign="5f000000-0000-4000-8000-000000000008";
    psql(box,`INSERT INTO saas.products(id,store_id,slug,title,status,currency,archived_at,created_at,updated_at) VALUES('${pickerAlpha}','${STORE}','picker-b-alpha','PICKER-B Alpha','active','TRY',NULL,'2026-01-01','2026-01-01'),('${pickerBeta}','${STORE}','picker-b-beta','PICKER-B Beta','active','TRY',NULL,'2026-01-01','2026-01-01'),('${pickerHidden}','${STORE}','picker-b-hidden','PICKER-B Hidden','archived','TRY','2026-01-02','2026-01-01','2026-01-02'),('${pickerLiteral}','${STORE}','picker-b-literal','PICKER%_ literal','active','TRY',NULL,'2026-01-01','2026-01-01'),('${pickerTieB}','${STORE}','picker-tie-b','picker-tie same','active','TRY',NULL,'2026-01-01','2026-01-01'),('${pickerTieA}','${STORE}','picker-tie-a','PICKER-TIE SAME','active','TRY',NULL,'2026-01-01','2026-01-01');
      INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,archived_at,created_at,updated_at) VALUES('${pickerShippingInactive}','${STORE}','shipping_setting','PICKER shipping unavailable','{"regions":["TR"],"estimatedDays":3}'::jsonb,'archived',1,'2026-01-02','2026-01-01','2026-01-02'),('${pickerShippingForeign}','${OTHER_STORE}','shipping_setting','PICKER shipping foreign','{"regions":["TR"],"estimatedDays":3}'::jsonb,'active',1,NULL,'2026-01-01','2026-01-01')`);
    const pickerFirst=pickerList(box,"editor","product","PICKER-B",1); assert.deepEqual(pickerFirst.result.items,[{kind:"product",id:pickerAlpha,label:"PICKER-B Alpha",status:"active"}]); assert.deepEqual(pickerFirst.result.cursorAnchor,{id:pickerAlpha,sortKey:"picker-b alpha"}); assert.equal(pickerFirst.result.hasMore,true);
    const pickerSecond=pickerList(box,"editor","product","PICKER-B",1,pickerFirst.result.cursorAnchor); assert.deepEqual(pickerSecond.result.items,[{kind:"product",id:pickerBeta,label:"PICKER-B Beta",status:"active"}]); assert.equal(pickerSecond.result.hasMore,false); assert.equal(pickerSecond.result.cursorAnchor,null);
    const tieFirst=pickerList(box,"analyst","product","picker-tie same",1); assert.equal(tieFirst.result.items[0].id,pickerTieA); assert.deepEqual(tieFirst.result.cursorAnchor,{id:pickerTieA,sortKey:"picker-tie same"});
    const tieSecond=pickerList(box,"analyst","product","picker-tie same",1,tieFirst.result.cursorAnchor); assert.equal(tieSecond.result.items[0].id,pickerTieB); assert.equal(tieSecond.result.hasMore,false);
    assert.deepEqual(pickerList(box,"analyst","product","%_",50).result.items,[{kind:"product",id:pickerLiteral,label:"PICKER%_ literal",status:"active"}]);
    const resolved=pickerResolve(box,"analyst","product",[LINE,pickerHidden]); assert.equal(resolved.outcome,"resolved"); assert.deepEqual(Object.fromEntries(resolved.result.items.map((item)=>[item.id,item.status])),{[pickerHidden]:"unavailable",[LINE]:"active"});
    const missing="ff000000-0000-4000-8000-000000000001"; assert.deepEqual(pickerResolve(box,"analyst","product",[LINE,OTHER_PRODUCT,missing]).result.items,[{kind:"product",id:LINE,label:"Promotion line",status:"active"}]);
    const shippingResolved=pickerResolve(box,"analyst","shipping_method",[LINE,pickerShippingInactive,pickerShippingForeign,missing]); assert.deepEqual(Object.fromEntries(shippingResolved.result.items.map((item)=>[item.id,item.status])),{[pickerShippingInactive]:"unavailable",[LINE]:"active"}); assert.deepEqual(pickerList(box,"analyst","shipping_method","PICKER shipping",50).result.items,[]);
    for (const ids of [[],[LINE,LINE],[pickerHidden,LINE],Array.from({length:501},(_,index)=>`f1000000-0000-4000-8000-${String(index).padStart(12,"0")}`)]) assert.equal(pickerResolve(box,"analyst","product",ids).outcome,"invalid_input");
    assert.equal(pickerList(box,"revoked","product",null,50).outcome,"membership_denied"); assert.equal(pickerList(box,"analyst","product",null,51).outcome,"invalid_input");
  });
  scenario("editor manages drafts while publish export and every analyst mutation remain denied", () => {
    const promotion="90000000-0000-4000-8000-000000000828", document=validRuleDocument();
    assert.equal(appScalar(box,createCall(box,"editor",promotion,"91000000-0000-4000-8000-000000000828","Editor draft")),`created:${promotion}`);
    assert.equal(appScalar(box,updateCall(box,"editor",promotion,"91000000-0000-4000-8000-000000000829",1,"Editor updated draft",document)),`updated:${promotion}`);
    assert.equal(appScalar(box,lifecycleCall(box,"editor",promotion,"91000000-0000-4000-8000-000000000830",2,"active")),"membership_denied:");
    assert.equal(appScalar(box,lifecycleCall(box,"store_owner",promotion,"91000000-0000-4000-8000-000000000831",2,"active")),`updated:${promotion}`);
    assert.equal(appScalar(box,updateCall(box,"editor",promotion,"91000000-0000-4000-8000-000000000832",3,"Editor cannot edit live",document)),"membership_denied:");
    for (const role of ["editor","analyst"]) {
      const offset = role === "editor" ? "833" : "834";
      if (role === "analyst") assert.equal(appScalar(box,createCall(box,role,`90000000-0000-4000-8000-000000000${offset}`,`91000000-0000-4000-8000-000000000${offset}`,`${role} denied`)),"membership_denied:");
      assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_codes_csv_v1(${authorityArguments(role)},'90000000-0000-4000-8000-000000000999')`),"membership_denied");
      assert.equal(createBatch(box,{role,operationId:`91000000-0000-4000-8000-000000000${offset}`,batchId:`92000000-0000-4000-8000-000000000${offset}`,promotionId:promotion,count:1,prefix:"ROLE",codeLength:20,perCustomerUsage:1}).outcome,"membership_denied");
      assert.equal(statusBatch(box,{role,operationId:`93000000-0000-4000-8000-000000000${offset}`,batchId:`92000000-0000-4000-8000-000000000${offset}`,expectedVersion:1,nextStatus:"paused"}).outcome,"membership_denied");
    }
  });
  scenario("disabled feature and inactive revoked or mismatched authority are rejected", () => {
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_list_v1(${authorityArguments("other",OTHER_STORE,DISABLED_PLAN)},NULL,ARRAY[]::text[],10)`),"feature_not_enabled");
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_list_v1(${authorityArguments("revoked")},NULL,ARRAY[]::text[],10)`),"membership_denied");
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_list_v1('${STORE}','${ACTORS.store_owner.principal}','${ACTORS.admin.membership}','${PLAN}','promotion_test',1,'2026-09-05T00:00:00Z',NULL,ARRAY[]::text[],10)`),"membership_denied");
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_list_v1('${STORE}','${ACTORS.store_owner.principal}','${ACTORS.store_owner.membership}','${DISABLED_PLAN}','promotion_disabled',1,'2026-09-05T00:00:00Z',NULL,ARRAY[]::text[],10)`),"durable_authority_invalid");
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_list_v1('${INACTIVE_STORE}','${ACTORS.store_owner.principal}','${ACTORS.store_owner.membership}','${PLAN}','promotion_test',1,'2026-09-05T00:00:00Z',NULL,ARRAY[]::text[],10)`),"store_inactive");
    psql(box,`UPDATE saas.subscriptions SET status='inactive',updated_at='2026-09-05' WHERE store_id='${STORE}'`);
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_list_v1(${authorityArguments("store_owner")},NULL,ARRAY[]::text[],10)`),"durable_authority_invalid");
    psql(box,`UPDATE saas.subscriptions SET status='active',updated_at='2026-09-05T00:00:01Z' WHERE store_id='${STORE}'; ALTER TABLE saas.plans DISABLE TRIGGER plan_versions_immutable; UPDATE saas.plans SET status='inactive',updated_at='2026-09-05' WHERE id='${PLAN}'; ALTER TABLE saas.plans ENABLE TRIGGER plan_versions_immutable`);
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_list_v1(${authorityArguments("store_owner")},NULL,ARRAY[]::text[],10)`),"durable_authority_invalid");
    psql(box,`ALTER TABLE saas.plans DISABLE TRIGGER plan_versions_immutable; UPDATE saas.plans SET status='active',updated_at='2026-09-05T00:00:01Z' WHERE id='${PLAN}'; ALTER TABLE saas.plans ENABLE TRIGGER plan_versions_immutable`);
  });
  scenario("cross-tenant promotion identity remains indistinguishable from not found", () => {
    const promotionId = "90000000-0000-4000-8000-000000000130";
    psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${promotionId}','${OTHER_STORE}','Other private promotion','draft',1,'${JSON.stringify(validRuleDocument())}'::jsonb,'2026-01-01','2026-01-01')`);
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_detail_v1(${authorityArguments("store_owner")},'${promotionId}')`),"not_found");
  });
  scenario("canonical semantic fingerprints bind kind and store while normalizing only set-like arrays", () => {
    assert.equal(scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('create','${STORE}','{"ruleDocument":{},"name":"Golden"}'::jsonb)`), "b2037d9eb0b7aa1b1de7486ba633a09018e7fcbabc929187345c049eb5fe7d4c");
    const escaped = JSON.stringify({name:'Çifte "İndirim" \\ VIP',ruleDocument:{}}).replaceAll("'","''");
    assert.equal(scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('create','${STORE}','${escaped}'::jsonb)`), "15d72b2906fa2a7e80ac66711d2e7677147a038a30ed5fd667cb2ef2145dbd89");
    assert.equal(scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('update','${STORE}','{"minimum":0,"maximum":9007199254740991,"enabled":true,"none":null}'::jsonb)`), "fdccfdaa3a4e9cb1aa27bdfd776a08df69e3cb25ceb39b34907e13489f53371b");
    const forward = '{"referenceIds":["a","b"],"tiers":[{"minimumQuantity":2},{"minimumQuantity":1}]}';
    const reversedSet = '{"tiers":[{"minimumQuantity":2},{"minimumQuantity":1}],"referenceIds":["b","a"]}';
    const reversedOrder = '{"referenceIds":["a","b"],"tiers":[{"minimumQuantity":1},{"minimumQuantity":2}]}';
    assert.equal(scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('update','${STORE}','${forward}'::jsonb)`), "152fc76c86a4ecde9ab38543ebc35d0797aafb918a0e841ea44d2eb137d7c30d");
    assert.equal(scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('update','${STORE}','${forward}'::jsonb)=saas.promotion_operation_fingerprint_v2('update','${STORE}','${reversedSet}'::jsonb)`), "t");
    assert.equal(scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('update','${STORE}','${forward}'::jsonb)<>saas.promotion_operation_fingerprint_v2('update','${STORE}','${reversedOrder}'::jsonb)`), "t");
    assert.equal(scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('update','${STORE}','${forward}'::jsonb)<>saas.promotion_operation_fingerprint_v2('update','${OTHER_STORE}','${forward}'::jsonb)`), "t");
    assert.equal(scalar(box, `SELECT COALESCE(saas.promotion_operation_fingerprint_v2('update','${STORE}','{"value":9007199254740992}'::jsonb),'rejected')`), "rejected");
    assert.equal(scalar(box, `SELECT COALESCE(saas.promotion_operation_fingerprint_v2('update','${STORE}','{"value":1.5}'::jsonb),'rejected')`), "rejected");
    assert.equal(scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('update','${STORE}','{"value":1.0}'::jsonb)=saas.promotion_operation_fingerprint_v2('update','${STORE}','{"value":1}'::jsonb)`),"t");
    assert.equal(scalar(box, `SELECT COALESCE(saas.promotion_operation_fingerprint_v2('update','${STORE}',NULL),'rejected')`), "rejected");
    assert.equal(scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('update','${STORE}','{"value":null}'::jsonb)<>saas.promotion_operation_fingerprint_v2('update','${STORE}','{"value":"null"}'::jsonb)`),"t");
    assert.equal(scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('update','${STORE}','{"value":0}'::jsonb)<>saas.promotion_operation_fingerprint_v2('update','${STORE}','{"value":"0"}'::jsonb)`),"t");
    assert.equal(scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('update','${STORE}','{}'::jsonb)<>saas.promotion_operation_fingerprint_v2('update','${STORE}','{"value":null}'::jsonb)`),"t");
    assert.equal(scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('commit','${STORE}','{"reservationGroupId":"93000000-0000-4000-8000-000000000126","orderId":"70000000-0000-4000-8000-000000000126"}'::jsonb)`), "db3e3093c75ef823c3a57f1b4f4354d0ff61489e6d58f3682840f4dcc7ee8522");
    assert.equal(scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('release','${STORE}','{"reservationGroupId":"93000000-0000-4000-8000-000000000126","reason":"payment_failed"}'::jsonb)`), "b2c3770bf809a02a485d5e98b9e0a1b98624f5e839d3d706d12695caa98d8355");
    assert.equal(scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('expire','${STORE}','{"reservationGroupId":"93000000-0000-4000-8000-000000000126","expiresAt":"2026-09-05T00:15:00.000Z"}'::jsonb)`), "a1a41aae337febc33997827650d35ee8df5678f8056491baf60fcadef044d071");
  });
  scenario("a contract-valid projection above the legacy 64 KiB boundary creates and replays exactly", () => {
    const promotion="90000000-0000-4000-8000-000000000139", replayCandidate="90000000-0000-4000-8000-000000000140", operation="91000000-0000-4000-8000-000000000139", name="Large valid code campaign";
    const document=validRuleDocument(); document.trigger={kind:"code",codes:Array.from({length:10000},(_,index)=>`C${String(index).padStart(5,"0")}${createHash("sha256").update(String(index)).digest("hex").slice(0,8).toUpperCase()}`)};
    const encoded=JSON.stringify(document).replaceAll("'","''"), documentBytes=Number(scalar(box,`SELECT pg_catalog.pg_column_size('${encoded}'::jsonb)`));
    assert.equal(documentBytes>65536 && documentBytes<=262144,true,String(documentBytes));
    assert.equal(scalar(box,`SELECT saas.promotion_rule_document_valid('${encoded}'::jsonb)`),"t");
    assert.equal(appScalar(box,createCall(box,"store_owner",promotion,operation,name,document)),`created:${promotion}`);
    assert.equal(Number(scalar(box,`SELECT pg_catalog.octet_length(result_payload::text) FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_id='${operation}'`))>65536,true);
    const fingerprint=semanticCreateFingerprint(box,name,document);
    assert.equal(appScalar(box,`SELECT outcome||':'||(result_payload->>'id') FROM saas.promotion_recover_operation_v1(${authorityArguments("store_owner")},'${operation}','create','${fingerprint}')`),`operation_replayed:${promotion}`);
    assert.equal(appScalar(box,createCall(box,"store_owner",replayCandidate,operation,name,document)),`operation_replayed:${promotion}`);
    const oversized=validRuleDocument(); oversized.trigger={kind:"code",codes:Array.from({length:10000},(_,index)=>`C${String(index).padStart(5,"0")}${createHash("sha256").update(`oversized:${index}`).digest("hex").slice(0,24).toUpperCase()}`)};
    const oversizedEncoded=JSON.stringify(oversized).replaceAll("'","''");
    assert.equal(Number(scalar(box,`SELECT pg_catalog.pg_column_size('${oversizedEncoded}'::jsonb)`))>262144,true);
    assert.equal(scalar(box,`SELECT saas.promotion_rule_document_valid('${oversizedEncoded}'::jsonb)`),"f");
  });
  scenario("maximum duplicate request fingerprints ten thousand 64-character codes but cannot persist an oversized rule", () => {
    const source="90000000-0000-4000-8000-000000000139", destination="90000000-0000-4000-8000-000000000159", operation="91000000-0000-4000-8000-000000000159", name="Maximum duplicate fingerprint";
    const generated=`WITH generated AS MATERIALIZED (
      SELECT pg_catalog.array_agg('C'||pg_catalog.lpad(code_ordinal::text,5,'0')||pg_catalog.repeat('A',58) ORDER BY code_ordinal) AS codes
      FROM pg_catalog.generate_series(1,10000) code_ordinal
    ), duplicate_payload AS MATERIALIZED (
      SELECT pg_catalog.jsonb_build_object('sourcePromotionId','${source}'::uuid,'expectedVersion',1,'name','${name}','codes',pg_catalog.to_jsonb(codes)) AS payload,codes
      FROM generated
    )`;
    const facts=JSON.parse(scalar(box,`${generated}
      SELECT pg_catalog.jsonb_build_object(
        'payloadBytes',pg_catalog.pg_column_size(payload),
        'fingerprint',saas.promotion_operation_fingerprint_v2('duplicate','${STORE}',payload),
        'deterministic',saas.promotion_operation_fingerprint_v2('duplicate','${STORE}',payload)=saas.promotion_operation_fingerprint_v2('duplicate','${STORE}',payload),
        'minimumCodeLength',(SELECT min(pg_catalog.length(code)) FROM pg_catalog.unnest(codes) code),
        'maximumCodeLength',(SELECT max(pg_catalog.length(code)) FROM pg_catalog.unnest(codes) code),
        'uniqueCodeCount',(SELECT count(DISTINCT code) FROM pg_catalog.unnest(codes) code)
      ) FROM duplicate_payload`));
    assert.equal(facts.payloadBytes>327680 && facts.payloadBytes<=786432,true,String(facts.payloadBytes));
    assert.deepEqual(facts,{...facts,fingerprint:"fc3666b889d56fb945ce66f982f8f3d7bc4097df402bb712a52283a0a5079129",deterministic:true,minimumCodeLength:64,maximumCodeLength:64,uniqueCodeCount:10000});
    const rejected=JSON.parse(appScalar(box,`${generated}
      SELECT pg_catalog.jsonb_build_object('outcome',result.outcome,'result',result.result_payload)
      FROM duplicate_payload
      CROSS JOIN LATERAL saas.promotion_duplicate_v1(${authorityArguments("store_owner")},'${operation}','${facts.fingerprint}','${destination}','${source}',1,'${name}',codes) result`));
    assert.deepEqual(rejected,{outcome:"invalid_reference",result:null});
    assert.equal(scalar(box,`SELECT (SELECT count(*) FROM saas.promotions WHERE store_id='${STORE}' AND id='${destination}')::text||':'||(SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_id='${operation}')::text`),"0:0");
  });
  scenario("semantic create fingerprint ignores generated IDs and replays the exact result", () => {
    const first = "90000000-0000-4000-8000-000000000131", second = "90000000-0000-4000-8000-000000000132", operation = "91000000-0000-4000-8000-000000000131", name = "Semantic replay";
    assert.equal(scalar(box,`SELECT ${semanticCreateFingerprintExpression(name)}=saas.promotion_operation_fingerprint_v2('create','${STORE}','{"ruleDocument":${JSON.stringify(validRuleDocument())},"name":"${name}"}'::jsonb)`),"t");
    assert.equal(appScalar(box,createCall(box,"store_owner",first,operation,name)),`created:${first}`);
    assert.equal(appScalar(box,createCall(box,"store_owner",second,operation,name)),`operation_replayed:${first}`);
    assert.equal(scalar(box,`SELECT count(*) FROM saas.promotions WHERE store_id='${STORE}' AND id IN ('${first}','${second}')`),"1");
  });
  scenario("same operation with a changed semantic fingerprint is rejected", () => {
    const first = "90000000-0000-4000-8000-000000000133", operation = "91000000-0000-4000-8000-000000000133";
    assert.equal(appScalar(box,createCall(box,"admin",first,operation,"Fingerprint original")),`created:${first}`);
    assert.equal(appScalar(box,createCall(box,"admin","90000000-0000-4000-8000-000000000134",operation,"Fingerprint changed")),"operation_mismatch:");
  });
  scenario("authorized operation recovery is exact and missing mismatch or corrupt results fail safe", () => {
    const operation = "91000000-0000-4000-8000-000000000131", fingerprint = semanticCreateFingerprint(box,"Semantic replay");
    assert.equal(appScalar(box,`SELECT outcome||':'||COALESCE(result_payload->>'id','') FROM saas.promotion_recover_operation_v1(${authorityArguments("store_owner")},'${operation}','create','${fingerprint}')`),"operation_replayed:90000000-0000-4000-8000-000000000131");
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_recover_operation_v1(${authorityArguments("store_owner")},'91000000-0000-4000-8000-000000000199','create','${fingerprint}')`),"not_found");
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_recover_operation_v1(${authorityArguments("store_owner")},'${operation}','create',repeat('f',64))`),"operation_mismatch");
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_recover_operation_v1(${authorityArguments("store_owner")},'${operation}','reserve','${fingerprint}')`),"invalid_input");
    assert.equal(scalar(box,`SELECT pg_catalog.concat_ws(',',saas.promotion_operation_recovery_action('create'),saas.promotion_operation_recovery_action('update'),saas.promotion_operation_recovery_action('lifecycle'),saas.promotion_operation_recovery_action('archive'),saas.promotion_operation_recovery_action('duplicate'),saas.promotion_operation_recovery_action('code_batch'),saas.promotion_operation_recovery_action('code_batch_status'),COALESCE(saas.promotion_operation_recovery_action('reserve'),'denied'))`),"promotions.manage_draft,promotions.manage_draft,promotions.publish,promotions.archive,promotions.manage_draft,promotions.publish,promotions.publish,denied");
    assert.notEqual(psql(box,`INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('91000000-0000-4000-8000-000000000197','${STORE}','91000000-0000-4000-8000-000000000197','create',repeat('d',64),'promotion','90000000-0000-4000-8000-000000000127',saas.promotion_projection('${STORE}','90000000-0000-4000-8000-000000000126'),'2026-09-05')`,DB,true).status,0);
    psql(box,`INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('91000000-0000-4000-8000-000000000196','${STORE}','91000000-0000-4000-8000-000000000196','create',repeat('c',64),'promotion','90000000-0000-4000-8000-000000000130',saas.promotion_projection('${OTHER_STORE}','90000000-0000-4000-8000-000000000130'),'2026-09-05')`);
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_recover_operation_v1(${authorityArguments("store_owner")},'91000000-0000-4000-8000-000000000196','create',repeat('c',64))`),"operation_result_invalid");
    const corrupt = (suffix,payload) => scalar(box,`BEGIN; ALTER TABLE saas.promotion_operations DROP CONSTRAINT promotion_operations_result_payload_check; ALTER TABLE saas.promotion_operations DROP CONSTRAINT promotion_operations_result_contract_check; ALTER TABLE saas.promotion_operations DROP CONSTRAINT promotion_operations_result_entity_check; INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('91000000-0000-4000-8000-${suffix}','${STORE}','91000000-0000-4000-8000-${suffix}','create',repeat('b',64),'promotion','90000000-0000-4000-8000-000000000126',${payload},'2026-09-05'); SET LOCAL ROLE celebix_saas_app; SELECT outcome FROM saas.promotion_recover_operation_v1(${authorityArguments("store_owner")},'91000000-0000-4000-8000-${suffix}','create',repeat('b',64)); ROLLBACK`);
    assert.equal(corrupt("000000000198","'{}'::jsonb"),"operation_result_invalid");
    assert.equal(corrupt("000000000195","'null'::jsonb"),"operation_result_invalid");
    assert.equal(corrupt("000000000194","'[]'::jsonb"),"operation_result_invalid");
    assert.equal(corrupt("000000000193","pg_catalog.jsonb_build_object('data',repeat('x',340000))"),"operation_result_invalid");
    assert.equal(corrupt("000000000192",`saas.promotion_projection('${STORE}','90000000-0000-4000-8000-000000000126')||'{"createdAt":"2026-02-30T00:00:00.000Z"}'::jsonb`),"operation_result_invalid");
    assert.equal(corrupt("000000000191",`saas.promotion_projection('${STORE}','90000000-0000-4000-8000-000000000126')||'{"createdAt":"2026-09-06T00:00:00.000Z","updatedAt":"2026-09-05T00:00:00.000Z"}'::jsonb`),"operation_result_invalid");
    assert.equal(corrupt("000000000190",`saas.promotion_projection('${STORE}','90000000-0000-4000-8000-000000000126')||'{"version":9007199254740992}'::jsonb`),"operation_result_invalid");
  });
  scenario("operation recovery permits draft editors and rejects read-only analysts", () => {
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_recover_operation_v1(${authorityArguments("editor")},'91000000-0000-4000-8000-000000000131','create','${semanticCreateFingerprint(box,"Semantic replay")}')`),"operation_replayed");
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_recover_operation_v1(${authorityArguments("analyst")},'91000000-0000-4000-8000-000000000131','create','${semanticCreateFingerprint(box,"Semantic replay")}')`),"membership_denied");
  });
  scenario("CRUD materializes exact current targets direct codes and authoritative shipping references", () => {
    const promotion = "a1000000-0000-4000-8000-000000000001", operation = "a2000000-0000-4000-8000-000000000001";
    const document = validRuleDocument();
    document.benefit = { kind: "gift", giftVariantId: LINE, quantity: 1, autoAdd: true };
    document.targets = { mode: "selected", include: [
      { kind: "product", id: LINE }, { kind: "variant", id: LINE }, { kind: "category", id: CATEGORY },
      { kind: "brand", id: BRAND }, { kind: "collection", id: COLLECTION },
    ], exclude: [] };
    document.audience = { mode: "customer_tags", referenceIds: [LINE] };
    document.trigger = { kind: "code", codes: ["DIRECT10", "DIRECT20"] };
    document.conditions = { ...document.conditions, paymentMethodIds: [PAYMENT_METHOD], shippingMethodIds: [LINE] };
    assert.equal(appScalar(box, createCall(box, "store_owner", promotion, operation, "Materialized definition", document)), `created:${promotion}`);
    assert.equal(scalar(box, `SELECT count(*)||':'||count(DISTINCT target_kind||':'||target_id::text||':'||inclusion) FROM saas.promotion_targets WHERE store_id='${STORE}' AND promotion_id='${promotion}'`), "5:5");
    assert.equal(scalar(box, `SELECT pg_catalog.string_agg(code||':'||status,',' ORDER BY code) FROM saas.promotion_codes WHERE store_id='${STORE}' AND promotion_id='${promotion}' AND batch_id IS NULL`), "DIRECT10:active,DIRECT20:active");
    assert.equal(scalar(box, `SELECT count(*)||':'||max(version) FROM saas.promotion_versions WHERE store_id='${STORE}' AND promotion_id='${promotion}'`), "1:1");
  });
  scenario("CRUD rejects stale foreign and cross-tenant references atomically", () => {
    const missing = "a3000000-0000-4000-8000-000000000099";
    const inactiveShipping = "a3000000-0000-4000-8000-000000000097", foreignShipping = "a3000000-0000-4000-8000-000000000098";
    psql(box,`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,archived_at,created_at,updated_at) VALUES('${inactiveShipping}','${STORE}','shipping_setting','Inactive shipping','{"regions":["TR"],"estimatedDays":3}'::jsonb,'archived',1,'2026-01-02','2026-01-01','2026-01-02'),('${foreignShipping}','${OTHER_STORE}','shipping_setting','Foreign shipping','{"regions":["TR"],"estimatedDays":3}'::jsonb,'active',1,NULL,'2026-01-01','2026-01-01')`);
    const cases = [
      (document) => { document.targets = { mode: "selected", include: [{ kind: "product", id: OTHER_PRODUCT }], exclude: [] }; },
      (document) => { document.targets = { mode: "selected", include: [{ kind: "category", id: missing }], exclude: [] }; },
      (document) => { document.targets = { mode: "selected", include: [{ kind: "brand", id: missing }], exclude: [] }; },
      (document) => { document.audience = { mode: "customer_segments", referenceIds: [missing] }; },
      (document) => { document.audience = { mode: "masked_customers", referenceIds: [missing] }; },
      (document) => { document.benefit = { kind: "gift", giftVariantId: OTHER_PRODUCT, quantity: 1, autoAdd: true }; },
      (document) => { document.benefit = { kind: "buy_x_get_y", buyQuantity: 1, receiveQuantity: 1, discountPercentageBps: 10000, reward: { strategy: "selected_products_cheapest", productIds: [missing] } }; },
      (document) => { document.conditions = { ...document.conditions, paymentMethodIds: [DISABLED_PAYMENT_METHOD] }; },
      (document) => { document.conditions = { ...document.conditions, shippingMethodIds: [missing] }; },
      (document) => { document.conditions = { ...document.conditions, shippingMethodIds: [inactiveShipping] }; },
      (document) => { document.conditions = { ...document.conditions, shippingMethodIds: [foreignShipping] }; },
    ];
    for (const [index, mutate] of cases.entries()) {
      const suffix = String(10 + index).padStart(12, "0"), promotion = `a1000000-0000-4000-8000-${suffix}`, operation = `a2000000-0000-4000-8000-${suffix}`, document = validRuleDocument();
      mutate(document);
      assert.equal(appScalar(box, createCall(box, "store_owner", promotion, operation, `Invalid reference ${index}`, document)), "invalid_reference:");
      assert.equal(scalar(box, `SELECT (SELECT count(*) FROM saas.promotions WHERE store_id='${STORE}' AND id='${promotion}')+(SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_id='${operation}')+(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id='${STORE}' AND id='${operation}')`), "0");
    }
  });
  scenario("update preserves creation identity and appends one current version audit and operation", () => {
    const promotion = "a1000000-0000-4000-8000-000000000001", operation = promotion, document = validRuleDocument();
    document.targets = { mode: "selected", include: [{ kind: "product", id: LINE }, { kind: "category", id: CATEGORY }], exclude: [{ kind: "brand", id: BRAND }] };
    document.trigger = { kind: "code", codes: ["DIRECT20", "DIRECT30"] };
    const createdAt = scalar(box, `SELECT created_at::text FROM saas.promotions WHERE store_id='${STORE}' AND id='${promotion}'`);
    const retainedTarget = scalar(box, `SELECT id FROM saas.promotion_targets WHERE store_id='${STORE}' AND promotion_id='${promotion}' AND target_kind='product' AND target_id='${LINE}' AND inclusion='include'`);
    assert.equal(appScalar(box, updateCall(box, "admin", promotion, operation, 1, "Materialized update", document, "2026-09-05T00:00:01Z")), `updated:${promotion}`);
    assert.equal(scalar(box, `SELECT created_at::text||':'||version FROM saas.promotions WHERE store_id='${STORE}' AND id='${promotion}'`), `${createdAt}:2`);
    assert.equal(scalar(box, `SELECT count(*)||':'||max(version_row.version)||':'||bool_and(version_row.rule_document=promotion.rule_document) FILTER (WHERE version_row.version=promotion.version) FROM saas.promotion_versions version_row JOIN saas.promotions promotion ON promotion.store_id=version_row.store_id AND promotion.id=version_row.promotion_id WHERE version_row.store_id='${STORE}' AND version_row.promotion_id='${promotion}'`), "2:2:true");
    assert.equal(scalar(box, `SELECT id FROM saas.promotion_targets WHERE store_id='${STORE}' AND promotion_id='${promotion}' AND target_kind='product' AND target_id='${LINE}' AND inclusion='include'`), retainedTarget);
    assert.equal(scalar(box, `SELECT pg_catalog.string_agg(code||':'||status,',' ORDER BY code) FROM saas.promotion_codes WHERE store_id='${STORE}' AND promotion_id='${promotion}' AND batch_id IS NULL`), "DIRECT10:revoked,DIRECT20:active,DIRECT30:active");
    assert.equal(scalar(box, `SELECT count(*) FROM saas.promotion_audit_events WHERE store_id='${STORE}' AND promotion_id='${promotion}'`), "2");
    assert.equal(appScalar(box, updateCall(box, "admin", promotion, operation, 1, "Materialized update", document, "2026-09-05T00:00:01Z")), `operation_replayed:${promotion}`);
    assert.equal(scalar(box, `SELECT count(*)||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id='${STORE}' AND promotion_id='${promotion}') FROM saas.promotion_versions WHERE store_id='${STORE}' AND promotion_id='${promotion}'`), "2:2");
  });
  scenario("update conflicts invalid references and revoked direct-code reuse mutate nothing", () => {
    const promotion = "a1000000-0000-4000-8000-000000000001", baseline = scalar(box, `SELECT version||':'||(SELECT count(*) FROM saas.promotion_versions WHERE store_id=p.store_id AND promotion_id=p.id)||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id=p.store_id AND promotion_id=p.id) FROM saas.promotions p WHERE store_id='${STORE}' AND id='${promotion}'`);
    const current = validRuleDocument(); current.trigger = { kind: "code", codes: ["DIRECT20", "DIRECT30"] };
    assert.equal(appScalar(box, updateCall(box, "store_owner", promotion, "a2000000-0000-4000-8000-000000000003", 1, "Stale update", current)), `version_conflict:${promotion}`);
    const invalid = structuredClone(current); invalid.targets = { mode: "selected", include: [{ kind: "product", id: OTHER_PRODUCT }], exclude: [] };
    assert.equal(appScalar(box, updateCall(box, "store_owner", promotion, "a2000000-0000-4000-8000-000000000004", 2, "Invalid update", invalid)), "invalid_reference:");
    const revoked = structuredClone(current); revoked.trigger = { kind: "code", codes: ["DIRECT10", "DIRECT20"] };
    assert.equal(appScalar(box, updateCall(box, "store_owner", promotion, "a2000000-0000-4000-8000-000000000005", 2, "Revoked reuse", revoked)), "code_conflict:");
    assert.equal(scalar(box, `SELECT version||':'||(SELECT count(*) FROM saas.promotion_versions WHERE store_id=p.store_id AND promotion_id=p.id)||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id=p.store_id AND promotion_id=p.id) FROM saas.promotions p WHERE store_id='${STORE}' AND id='${promotion}'`), baseline);
  });
  scenario("lifecycle uses an explicit matrix and every successful transition appends immutable history", () => {
    assert.equal(scalar(box, `WITH states(value) AS (VALUES('draft'),('scheduled'),('active'),('paused'),('archived')) SELECT pg_catalog.string_agg(source.value||'>'||target.value,',' ORDER BY source.value,target.value) FROM states source CROSS JOIN states target WHERE saas.promotion_lifecycle_transition_valid(source.value,target.value)`), "active>archived,active>paused,draft>active,draft>archived,draft>scheduled,paused>active,paused>archived,paused>scheduled,scheduled>active,scheduled>archived,scheduled>paused");
    const promotion = "a1000000-0000-4000-8000-000000000030", operation = "a2000000-0000-4000-8000-000000000030", document = validRuleDocument();
    assert.equal(appScalar(box, createCall(box, "store_owner", promotion, operation, "Lifecycle exact", document)), `created:${promotion}`);
    const transitions = [["active",1,promotion],["paused",2,"a2000000-0000-4000-8000-000000000032"],["active",3,"a2000000-0000-4000-8000-000000000033"],["archived",4,"a2000000-0000-4000-8000-000000000034"]];
    for (const [status, version, operationId] of transitions) assert.equal(appScalar(box, lifecycleCall(box, "store_owner", promotion, operationId, version, status, `2026-09-05T00:00:0${version}Z`)), `updated:${promotion}`);
    assert.equal(scalar(box, `SELECT status||':'||version||':'||(SELECT count(*) FROM saas.promotion_versions WHERE store_id=p.store_id AND promotion_id=p.id)||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id=p.store_id AND promotion_id=p.id) FROM saas.promotions p WHERE store_id='${STORE}' AND id='${promotion}'`), "archived:5:5:5");
    assert.equal(appScalar(box, lifecycleCall(box, "store_owner", promotion, "a2000000-0000-4000-8000-000000000035", 5, "active", "2026-09-05T00:00:05Z")), "invalid_transition:");
    assert.equal(scalar(box, `SELECT count(*) FROM saas.promotion_versions WHERE store_id='${STORE}' AND promotion_id='${promotion}'`), "5");
  });
  scenario("publish validation is time-exact and due scheduled campaigns evaluate without status writes", () => {
    const promotion = "a1000000-0000-4000-8000-000000000040", createOperation = "a2000000-0000-4000-8000-000000000040", scheduleOperation = "a2000000-0000-4000-8000-000000000041", document = validRuleDocument();
    document.schedule = { timezone: "Europe/Istanbul", startsAt: "2026-09-05T00:00:01.000Z", endsAt: "2026-09-05T00:00:02.000Z" };
    assert.equal(appScalar(box, createCall(box, "store_owner", promotion, createOperation, "Due scheduled", document)), `created:${promotion}`);
    assert.equal(appScalar(box, lifecycleCall(box, "store_owner", promotion, scheduleOperation, 1, "scheduled")), `updated:${promotion}`);
    psql(box, `UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}' AND id<>'${promotion}'`);
    const before = scalar(box, `SELECT status||':'||version||':'||updated_at::text FROM saas.promotions WHERE store_id='${STORE}' AND id='${promotion}'`);
    const encodedContext = JSON.stringify(context()).replaceAll("'", "''");
    assert.equal(JSON.parse(scalar(box, `SELECT saas.promotion_evaluate_v1('${STORE}','${encodedContext}'::jsonb,'2026-09-05T00:00:00.999Z')`)).discountTotalMinor, 0);
    assert.equal(JSON.parse(scalar(box, `SELECT saas.promotion_evaluate_v1('${STORE}','${encodedContext}'::jsonb,'2026-09-05T00:00:01Z')`)).discountTotalMinor, 30);
    assert.equal(JSON.parse(scalar(box, `SELECT saas.promotion_evaluate_v1('${STORE}','${encodedContext}'::jsonb,'2026-09-05T00:00:02Z')`)).discountTotalMinor, 0);
    assert.equal(scalar(box, `SELECT status||':'||version||':'||updated_at::text FROM saas.promotions WHERE store_id='${STORE}' AND id='${promotion}'`), before);
    const futureActive = "a1000000-0000-4000-8000-000000000041", futureOperation = "a2000000-0000-4000-8000-000000000042";
    assert.equal(appScalar(box, createCall(box, "store_owner", futureActive, futureOperation, "Future active rejected", document)), `created:${futureActive}`);
    assert.equal(appScalar(box, lifecycleCall(box, "store_owner", futureActive, "a2000000-0000-4000-8000-000000000043", 1, "active")), "invalid_transition:");
  });
  await asyncScenario("concurrent publication enforces the one-hundred active-or-scheduled store cap", async () => {
    const left="b2000000-0000-4000-8000-000000000001", right="b2000000-0000-4000-8000-000000000002", leftOperation="b3000000-0000-4000-8000-000000000001", rightOperation="b3000000-0000-4000-8000-000000000002", document=validRuleDocument(), encoded=JSON.stringify(document);
    psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'; INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) SELECT ('b1000000-0000-4000-8000-'||lpad(series::text,12,'0'))::uuid,'${STORE}','published cap '||series,'active',1,'${encoded}'::jsonb,'2026-01-01','2026-01-01' FROM pg_catalog.generate_series(1,99) series; INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${left}','${STORE}','published cap left','draft',1,'${encoded}'::jsonb,'2026-01-01','2026-01-01'),('${right}','${STORE}','published cap right','draft',1,'${encoded}'::jsonb,'2026-01-01','2026-01-01'); INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES('${left}','${STORE}','${left}',1,'${encoded}'::jsonb,'2026-01-01'),('${right}','${STORE}','${right}',1,'${encoded}'::jsonb,'2026-01-01')`);
    const [leftResult,rightResult]=await Promise.all([
      psqlAsync(box,`SET ROLE celebix_saas_app; ${lifecycleCall(box,"store_owner",left,leftOperation,1,"active")}; RESET ROLE`),
      psqlAsync(box,`SET ROLE celebix_saas_app; ${lifecycleCall(box,"store_owner",right,rightOperation,1,"active")}; RESET ROLE`),
    ]);
    assert.equal(leftResult.status,0,leftResult.stderr); assert.equal(rightResult.status,0,rightResult.stderr);
    const outcomes=[leftResult.stdout.trim(),rightResult.stdout.trim()].sort();
    assert.equal(outcomes.some((outcome)=>outcome==="promotion_limit_reached:"),true,JSON.stringify(outcomes));
    assert.equal(outcomes.some((outcome)=>outcome===`updated:${left}`||outcome===`updated:${right}`),true,JSON.stringify(outcomes));
    assert.equal(scalar(box,`SELECT count(*) FROM saas.promotions WHERE store_id='${STORE}' AND status IN ('active','scheduled')`),"100");
    const value=evaluate(box); assert.equal(value.merchantExplanation,"evaluated"); assert.equal(value.eligiblePromotionIds.length,100); parseContract(value);
    psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}' AND (id::text LIKE 'b1000000-%' OR id IN ('${left}','${right}'))`);
  });
  scenario("publish rechecks mutable reference authority and archived facts cease eligibility", () => {
    const promotion = "a1000000-0000-4000-8000-000000000050", operation = "a2000000-0000-4000-8000-000000000050", document = validRuleDocument();
    document.targets = { mode: "selected", include: [{ kind: "category", id: CATEGORY }], exclude: [] };
    document.audience = { mode: "customer_tags", referenceIds: [LINE] };
    document.conditions = { ...document.conditions, paymentMethodIds: [PAYMENT_METHOD], shippingMethodIds: [LINE] };
    assert.equal(appScalar(box, createCall(box, "store_owner", promotion, operation, "Reference recheck", document)), `created:${promotion}`);
    psql(box, `UPDATE saas.customer_tags SET archived_at='2026-09-05',updated_at='2026-09-05' WHERE store_id='${STORE}' AND id='${LINE}'`);
    assert.equal(appScalar(box, lifecycleCall(box, "store_owner", promotion, "a2000000-0000-4000-8000-000000000051", 1, "active")), "invalid_reference:");
    psql(box, `UPDATE saas.customer_tags SET archived_at=NULL,updated_at='2026-09-05T00:00:01Z' WHERE store_id='${STORE}' AND id='${LINE}'`);
    assert.equal(appScalar(box, lifecycleCall(box, "store_owner", promotion, "a2000000-0000-4000-8000-000000000052", 1, "active", "2026-09-05T00:00:01Z")), `updated:${promotion}`);
    psql(box, `UPDATE saas.promotions SET status=CASE WHEN id='${promotion}' THEN status ELSE 'paused' END WHERE store_id='${STORE}'`);
    assert.equal(evaluate(box, { customerId: LINE, paymentMethodId: PAYMENT_METHOD, shippingMethodId: LINE }).discountTotalMinor, 30);
    psql(box, `ALTER TABLE saas.catalog_categories DISABLE TRIGGER catalog_categories_tree_guard; UPDATE saas.catalog_categories SET status='archived',archived_at='2026-09-05',updated_at='2026-09-05' WHERE store_id='${STORE}' AND id='${CATEGORY}'; ALTER TABLE saas.catalog_categories ENABLE TRIGGER catalog_categories_tree_guard`);
    assert.equal(evaluate(box, { customerId: LINE, paymentMethodId: PAYMENT_METHOD, shippingMethodId: LINE }).discountTotalMinor, 0);
    psql(box, `ALTER TABLE saas.catalog_categories DISABLE TRIGGER catalog_categories_tree_guard; UPDATE saas.catalog_categories SET status='active',archived_at=NULL,updated_at='2026-09-05T00:00:01Z' WHERE store_id='${STORE}' AND id='${CATEGORY}'; ALTER TABLE saas.catalog_categories ENABLE TRIGGER catalog_categories_tree_guard; UPDATE saas.payment_methods SET state='disabled',updated_at='2026-09-05' WHERE store_id='${STORE}' AND id='${PAYMENT_METHOD}'`);
    assert.equal(evaluate(box, { customerId: LINE, paymentMethodId: PAYMENT_METHOD, shippingMethodId: LINE }).discountTotalMinor, 0);
    psql(box, `UPDATE saas.payment_methods SET state='active',updated_at='2026-09-05T00:00:01Z' WHERE store_id='${STORE}' AND id='${PAYMENT_METHOD}'`);
  });
  scenario("duplicate creates a clean draft and requires caller replacement codes", () => {
    const source = "a1000000-0000-4000-8000-000000000001", destination = "a1000000-0000-4000-8000-000000000060", operation = "a2000000-0000-4000-8000-000000000060";
    assert.equal(appScalar(box, duplicateCall(box, "admin", destination, source, operation, 2, "Clean code copy", ["COPY10", "COPY20"])), `created:${destination}`);
    assert.equal(scalar(box, `SELECT status||':'||version||':'||(legacy_record_id IS NULL)::text FROM saas.promotions WHERE store_id='${STORE}' AND id='${destination}'`), "draft:1:true");
    assert.equal(scalar(box, `SELECT count(*)||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id='${STORE}' AND promotion_id='${destination}')||':'||(SELECT count(*) FROM saas.promotion_codes WHERE store_id='${STORE}' AND promotion_id='${destination}' AND batch_id IS NULL) FROM saas.promotion_versions WHERE store_id='${STORE}' AND promotion_id='${destination}'`), "1:1:2");
    assert.equal(scalar(box, `SELECT count(*) FROM saas.promotion_codes WHERE store_id='${STORE}' AND promotion_id='${destination}' AND code IN ('DIRECT10','DIRECT20','DIRECT30')`), "0");
    assert.equal(appScalar(box, duplicateCall(box, "admin", "a1000000-0000-4000-8000-000000000061", source, operation, 2, "Clean code copy", ["COPY20", "COPY10"])), `operation_replayed:${destination}`);
    assert.equal(appScalar(box, duplicateCall(box, "admin", "a1000000-0000-4000-8000-000000000062", source, "a2000000-0000-4000-8000-000000000061", 2, "Missing codes", [])), "invalid_input:");
    const actor=authority("admin"), nestedDestination="a1000000-0000-4000-8000-000000000064", nestedOperation="a2000000-0000-4000-8000-000000000064";
    const nestedFingerprint=scalar(box,`SELECT saas.promotion_operation_fingerprint_v2('duplicate','${STORE}',pg_catalog.jsonb_build_object('sourcePromotionId','${source}'::uuid,'expectedVersion',2,'name','Nested codes','codes',pg_catalog.to_jsonb(ARRAY[['NESTED10','NESTED20']]::text[])))`);
    assert.equal(appScalar(box,`SELECT outcome||':'||COALESCE(result_payload->>'id','') FROM saas.promotion_duplicate_v1('${actor.store}','${actor.principal}','${actor.membership}','${actor.plan}','${actor.planCode}',${actor.planVersion},'2026-09-05T00:00:00Z','${nestedOperation}','${nestedFingerprint}','${nestedDestination}','${source}',2,'Nested codes',ARRAY[['NESTED10','NESTED20']]::text[])`),"invalid_input:");
    assert.equal(scalar(box,`SELECT (SELECT count(*) FROM saas.promotions WHERE store_id='${STORE}' AND id='${nestedDestination}')+(SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_id='${nestedOperation}')`),"0");
    assert.equal(scalar(box, `SELECT count(*) FROM saas.promotions WHERE store_id='${STORE}' AND id IN ('a1000000-0000-4000-8000-000000000061','a1000000-0000-4000-8000-000000000062')`), "0");
    const archivedSource = "a1000000-0000-4000-8000-000000000030", archivedCopy = "a1000000-0000-4000-8000-000000000063", archivedOperation = "a2000000-0000-4000-8000-000000000063";
    psql(box,`UPDATE saas.promotions SET status='archived' WHERE store_id='${STORE}' AND id='${archivedSource}'`);
    assert.equal(appScalar(box, duplicateCall(box, "admin", archivedCopy, archivedSource, archivedOperation, 5, "Archived clean copy")), `created:${archivedCopy}`);
    assert.equal(scalar(box, `SELECT status||':'||version FROM saas.promotions WHERE store_id='${STORE}' AND id='${archivedSource}'`), "archived:5");
    assert.equal(scalar(box, `SELECT status||':'||version||':'||(SELECT count(*) FROM saas.promotion_versions WHERE store_id=p.store_id AND promotion_id=p.id)||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id=p.store_id AND promotion_id=p.id) FROM saas.promotions p WHERE store_id='${STORE}' AND id='${archivedCopy}'`), "draft:1:1:1");
  });
  await asyncScenario("concurrent expected-version updates produce exactly one new immutable version", async () => {
    const promotion = "a1000000-0000-4000-8000-000000000070", createOperation = "a2000000-0000-4000-8000-000000000070", document = validRuleDocument();
    assert.equal(appScalar(box, createCall(box, "store_owner", promotion, createOperation, "Concurrent update", document)), `created:${promotion}`);
    const blocker = openPsqlSession(box);
    try {
      blocker.write(`BEGIN; SELECT 1 FROM saas.promotions WHERE store_id='${STORE}' AND id='${promotion}' FOR UPDATE; SELECT 'PROMOTION_UPDATE_BARRIER';\n`);
      await blocker.waitFor(/PROMOTION_UPDATE_BARRIER/);
      const first = psqlAsync(box, `SET application_name='promotion_update_race_1'; SET ROLE celebix_saas_app; ${updateCall(box, "admin", promotion, "a2000000-0000-4000-8000-000000000071", 1, "Concurrent winner A", document)}; RESET ROLE`);
      const second = psqlAsync(box, `SET application_name='promotion_update_race_2'; SET ROLE celebix_saas_app; ${updateCall(box, "admin", promotion, "a2000000-0000-4000-8000-000000000072", 1, "Concurrent winner B", document)}; RESET ROLE`);
      await waitForScalar(box, "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name LIKE 'promotion_update_race_%' AND wait_event_type='Lock'", "2");
      blocker.end("COMMIT;\n");
      const [blocked, one, two] = await Promise.all([blocker.completion, first, second]);
      assert.equal(blocked.status, 0, blocked.stderr); assert.equal(one.status, 0, one.stderr); assert.equal(two.status, 0, two.stderr);
      const outcomes = [one.stdout.trim(), two.stdout.trim()];
      assert.equal(outcomes.filter((value) => value.startsWith("updated:")).length, 1, JSON.stringify(outcomes));
      assert.equal(outcomes.filter((value) => value.startsWith("version_conflict:")).length, 1, JSON.stringify(outcomes));
      assert.equal(scalar(box, `SELECT version||':'||(SELECT count(*) FROM saas.promotion_versions WHERE store_id=p.store_id AND promotion_id=p.id)||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id=p.store_id AND promotion_id=p.id) FROM saas.promotions p WHERE store_id='${STORE}' AND id='${promotion}'`), "2:2:2");
    } finally {
      if (!blocker.child.killed && blocker.child.exitCode === null) blocker.end("ROLLBACK;\n");
    }
  });
  await asyncScenario("catalog-before-promotion lock order cannot deadlock checkout with update", async () => {
    const promotion = "a1000000-0000-4000-8000-000000000073", createOperation = "a2000000-0000-4000-8000-000000000073", updateOperation = "a2000000-0000-4000-8000-000000000074";
    const initial = validRuleDocument(), targeted = validRuleDocument();
    targeted.targets = { mode: "selected", include: [{ kind: "variant", id: LINE }], exclude: [] };
    assert.equal(appScalar(box, createCall(box, "store_owner", promotion, createOperation, "Lock order", initial)), `created:${promotion}`);
    const checkout = openPsqlSession(box);
    try {
      checkout.write(`BEGIN; SET LOCAL deadlock_timeout='100ms'; SELECT 1 FROM saas.product_variants WHERE store_id='${STORE}' AND id='${LINE}' FOR UPDATE; SELECT 'CHECKOUT_VARIANT_BARRIER';\n`);
      await checkout.waitFor(/CHECKOUT_VARIANT_BARRIER/);
      const pending = psqlAsync(box, `SET application_name='promotion_refs_before_row'; SET deadlock_timeout='100ms'; SET ROLE celebix_saas_app; ${updateCall(box, "admin", promotion, updateOperation, 1, "Lock order updated", targeted)}; RESET ROLE`);
      await waitForScalar(box, "SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name='promotion_refs_before_row' AND wait_event_type='Lock')", "t");
      checkout.end(`SELECT 1 FROM saas.promotions WHERE store_id='${STORE}' AND id='${promotion}' FOR UPDATE; COMMIT;\n`);
      const [checkoutResult, updateResult] = await Promise.all([checkout.completion, pending]);
      assert.equal(checkoutResult.status, 0, checkoutResult.stderr);
      assert.equal(updateResult.status, 0, updateResult.stderr);
      assert.equal(updateResult.stdout.trim(), `updated:${promotion}`);
      assert.equal(scalar(box, `SELECT version||':'||(rule_document->'targets'->'include'->0->>'kind') FROM saas.promotions WHERE store_id='${STORE}' AND id='${promotion}'`), "2:variant");
    } finally {
      if (!checkout.child.killed && checkout.child.exitCode === null) checkout.end("ROLLBACK;\n");
    }
  });
  scenario("keyset list is compact microsecond-stable and excludes later inserts", () => {
    const fixtures = [
      ["a1000000-0000-4000-8000-000000000081", "KEYSET-B newest", "2026-09-04T00:00:00.000004Z"],
      ["a1000000-0000-4000-8000-000000000082", "KEYSET-B second", "2026-09-04T00:00:00.000003Z"],
      ["a1000000-0000-4000-8000-000000000083", "KEYSET-B third", "2026-09-04T00:00:00.000002Z"],
      ["a1000000-0000-4000-8000-000000000084", "KEYSET-B oldest", "2026-09-04T00:00:00.000001Z"],
    ];
    for (const [id, name, createdAt] of fixtures) psql(box, `INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','${name}','draft',1,'${JSON.stringify(validRuleDocument())}'::jsonb,'${createdAt}','${createdAt}'); INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES('${id}','${STORE}','${id}',1,'${JSON.stringify(validRuleDocument())}'::jsonb,'${createdAt}')`);
    const first = listPage(box, "analyst", { search: "KEYSET-B", limit: 2 });
    assert.deepEqual(first.items.map((item) => item.id), fixtures.slice(0, 2).map(([id]) => id));
    assert.equal(first.hasMore, true); assert.equal(first.snapshotAt, "2026-09-05T00:00:00.000000Z");
    assert.deepEqual(first.cursorAnchor, { createdAt: "2026-09-04T00:00:00.000003Z", id: fixtures[1][0] });
    assert.equal(Object.hasOwn(first.items[0], "ruleDocument"), false); assert.equal(Object.hasOwn(first.items[0], "targets"), false);
    psql(box, `INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('a1000000-0000-4000-8000-000000000085','${STORE}','KEYSET-B later','draft',1,'${JSON.stringify(validRuleDocument())}'::jsonb,'2026-09-05T00:00:00.000001Z','2026-09-05T00:00:00.000001Z'); UPDATE saas.promotions SET updated_at='2026-09-06' WHERE store_id='${STORE}' AND id='${fixtures[0][0]}'`);
    const second = listPage(box, "analyst", { search: "KEYSET-B", limit: 2 }, { snapshotAt: first.snapshotAt, ...first.cursorAnchor }, "2026-09-06T00:00:00Z");
    assert.deepEqual(second.items.map((item) => item.id), fixtures.slice(2).map(([id]) => id));
    assert.equal(second.hasMore, false); assert.equal(second.cursorAnchor, null); assert.equal(second.snapshotAt, first.snapshotAt);
    assert.equal([...first.items, ...second.items].some((item) => item.id === "a1000000-0000-4000-8000-000000000085"), false);
  });
  scenario("list filters effective state and schedule dimensions and treats search metacharacters literally", () => {
    const records = [
      ["a1000000-0000-4000-8000-000000000091", "STATUS-B scheduled", "scheduled", { startsAt: "2026-09-06T00:00:00.000Z", endsAt: "2026-09-07T00:00:00.000Z" }, {}],
      ["a1000000-0000-4000-8000-000000000092", "STATUS-B due", "scheduled", { startsAt: "2026-09-04T00:00:00.000Z", endsAt: "2026-09-06T00:00:00.000Z" }, {}],
      ["a1000000-0000-4000-8000-000000000093", "STATUS-B ended", "active", { startsAt: "2026-09-01T00:00:00.000Z", endsAt: "2026-09-05T00:00:00.000Z" }, {}],
      ["a1000000-0000-4000-8000-000000000094", "STATUS-B usage", "active", {}, { totalUsage: 0 }],
      ["a1000000-0000-4000-8000-000000000095", "STATUS-B budget", "active", {}, { budgetMinor: 0 }],
      ["a1000000-0000-4000-8000-000000000096", "LITERAL%_ONLY", "draft", {}, {}],
      ["a1000000-0000-4000-8000-000000000097", "LITERAL ordinary", "draft", {}, {}],
    ];
    for (const [id, name, status, schedule, limits] of records) { const document = validRuleDocument(); document.schedule = { timezone: "Europe/Istanbul", ...schedule }; document.limits = { ...document.limits, ...limits }; psql(box, `INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','${name}','${status}',1,'${JSON.stringify(document)}','2026-09-03','2026-09-03')`); }
    psql(box, `INSERT INTO saas.promotion_codes(id,store_id,promotion_id,batch_id,code,status,created_at) VALUES('a4000000-0000-4000-8000-000000000097','${STORE}','a1000000-0000-4000-8000-000000000097',NULL,'COUPONFIND','active','2026-09-03')`);
    const statuses = listPage(box, "editor", { search: "STATUS-B", limit: 20 });
    assert.deepEqual(Object.fromEntries(statuses.items.map((item) => [item.name, item.effectiveStatus])), { "STATUS-B budget": "budget_exhausted", "STATUS-B usage": "usage_exhausted", "STATUS-B ended": "ended", "STATUS-B due": "active", "STATUS-B scheduled": "scheduled" });
    assert.deepEqual(listPage(box, "editor", { search: "STATUS-B", effectiveStatuses: ["active", "ended"], limit: 20 }).items.map((item) => item.name), ["STATUS-B ended", "STATUS-B due"]);
    assert.deepEqual(listPage(box, "editor", { search: "STATUS-B", scheduleFrom: "2026-09-05T12:00:00Z", scheduleTo: "2026-09-06T12:00:00Z", limit: 20 }).items.map((item) => item.name), ["STATUS-B budget", "STATUS-B usage", "STATUS-B due", "STATUS-B scheduled"]);
    assert.deepEqual(listPage(box, "editor", { search: "%_", limit: 20 }).items.map((item) => item.name), ["LITERAL%_ONLY"]);
    assert.deepEqual(listPage(box, "editor", { search: "COUPONFIND", limit: 20 }).items.map((item) => item.name), ["LITERAL ordinary"]);
  });
  scenario("list rejects partial or future cursors and selected-draft simulation uses the shared evaluator without mutation", () => {
    const invalidCursor = appScalar(box, `SELECT outcome FROM saas.promotion_list_v1(${authorityArguments("analyst")},NULL,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],NULL,NULL,2,'2026-09-05T00:00:00Z',NULL,NULL)`);
    assert.equal(invalidCursor, "invalid_input");
    const futureCursor = appScalar(box, `SELECT outcome FROM saas.promotion_list_v1(${authorityArguments("analyst")},NULL,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],NULL,NULL,2,'2026-09-06T00:00:00Z','2026-09-04T00:00:00Z','a1000000-0000-4000-8000-000000000081')`);
    assert.equal(futureCursor, "invalid_input");
    const actor = authority("analyst"), prefix = (now) => `'${actor.store}','${actor.principal}','${actor.membership}','${actor.plan}','${actor.planCode}',${actor.planVersion},'${now}'`;
    const closedInputCases = [
      `SELECT outcome FROM saas.promotion_list_v1(${authorityArguments("analyst")},NULL,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],NULL,NULL,NULL,NULL,NULL,NULL)`,
      `SELECT outcome FROM saas.promotion_list_v1(${authorityArguments("analyst")},NULL,ARRAY[['draft','active']]::text[],ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],NULL,NULL,2,NULL,NULL,NULL)`,
      `SELECT outcome FROM saas.promotion_list_v1(${authorityArguments("analyst")},NULL,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],'-infinity','2026-09-06T00:00:00Z',2,NULL,NULL,NULL)`,
      `SELECT outcome FROM saas.promotion_list_v1(${authorityArguments("analyst")},NULL,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],NULL,NULL,2,'-infinity','-infinity','a1000000-0000-4000-8000-000000000081')`,
      `SELECT outcome FROM saas.promotion_list_v1(${prefix("infinity")},NULL,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],NULL,NULL,2,NULL,NULL,NULL)`,
    ];
    for (const query of closedInputCases) assert.equal(appScalar(box, query), "invalid_input");
    const authorityValue=authority("analyst");
    for (const invalidContext of ["NULL::jsonb","'1'::jsonb","'null'::jsonb"]) {
      assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_simulate_v1('${authorityValue.store}','${authorityValue.principal}','${authorityValue.membership}','${authorityValue.plan}','${authorityValue.planCode}',${authorityValue.planVersion},'2026-09-05T00:00:00Z',${invalidContext})`),"invalid_input");
      const direct=JSON.parse(scalar(box,`SELECT saas.promotion_evaluate_v1('${STORE}',${invalidContext},'2026-09-05T00:00:00Z')`)); assert.equal(direct.merchantExplanation,"promotion_context_unavailable"); assert.deepEqual(direct.eligiblePromotionIds,[]);
    }
    psql(box, `UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'`);
    const document = validRuleDocument(); document.benefit = { kind: "percentage", percentageBps: 2000 }; document.trigger = { kind: "code", codes: ["SIMCODE"] };
    const selected = { id: "a1000000-0000-4000-8000-000000000081", expectedVersion: 1, name: "Selected draft override", ruleDocument: document };
    const countsBefore = scalar(box, `SELECT (SELECT count(*) FROM saas.promotion_operations)||':'||(SELECT count(*) FROM saas.promotion_audit_events)||':'||(SELECT count(*) FROM saas.promotion_usage_reservations)||':'||(SELECT count(*) FROM saas.promotion_redemptions)||':'||(SELECT count(*) FROM saas.promotion_targets)||':'||(SELECT count(*) FROM saas.promotion_codes)`);
    const first = simulateSelected(box, "analyst", selected, { submittedCodes: ["SIMCODE"] });
    const second = simulateSelected(box, "analyst", selected, { submittedCodes: ["SIMCODE"] });
    assert.equal(first, second);
    const parsed = JSON.parse(first); assert.equal(parsed.outcome, "simulated"); assert.equal(parsed.result.mutated, false); assert.equal(parsed.result.evaluation.discountTotalMinor, 60); assert.equal(parsed.result.evaluation.appliedPromotions.length, 1); assert.equal(parsed.result.evaluation.appliedPromotions[0].promotionId, selected.id);
    assert.equal(scalar(box, `SELECT (SELECT count(*) FROM saas.promotion_operations)||':'||(SELECT count(*) FROM saas.promotion_audit_events)||':'||(SELECT count(*) FROM saas.promotion_usage_reservations)||':'||(SELECT count(*) FROM saas.promotion_redemptions)||':'||(SELECT count(*) FROM saas.promotion_targets)||':'||(SELECT count(*) FROM saas.promotion_codes)`), countsBefore);
    const ownDirectId="a4000000-0000-4000-8000-000000000081", ownDirect=structuredClone(document); ownDirect.trigger.codes=["OWNACTIVE"];
    psql(box,`INSERT INTO saas.promotion_codes(id,store_id,promotion_id,batch_id,code,status,created_at) VALUES('${ownDirectId}','${STORE}','${selected.id}',NULL,'OWNACTIVE','active','2026-09-05T00:00:00.000Z')`);
    assert.equal(JSON.parse(simulateSelected(box,"analyst",{...selected,ruleDocument:ownDirect},{submittedCodes:["OWNACTIVE"]})).result.evaluation.discountTotalMinor,60);
    psql(box,`UPDATE saas.promotion_codes SET status='revoked' WHERE store_id='${STORE}' AND id='${ownDirectId}'`);
    assert.equal(JSON.parse(simulateSelected(box,"analyst",{...selected,ruleDocument:ownDirect},{submittedCodes:["OWNACTIVE"]})).result.evaluation.discountTotalMinor,0);
    const foreignDirect=structuredClone(document); foreignDirect.trigger.codes=["ALPHA"];
    assert.equal(JSON.parse(simulateSelected(box,"analyst",{...selected,ruleDocument:foreignDirect},{submittedCodes:["ALPHA"]})).result.evaluation.discountTotalMinor,0);
    assert.equal(JSON.parse(simulateSelected(box, "analyst", { ...selected, expectedVersion: 999 }, { submittedCodes: ["SIMCODE"] })).outcome, "version_conflict");
    assert.equal(JSON.parse(simulateSelected(box, "analyst", { id: "a1000000-0000-4000-8000-000000000099", expectedVersion: null, name: "New simulator", ruleDocument: document }, { submittedCodes: ["SIMCODE"] })).result.evaluation.discountTotalMinor, 60);
    assert.equal(JSON.parse(simulateSelected(box, "analyst", { ...selected, id: "90000000-0000-4000-8000-000000000130" }, { submittedCodes: ["SIMCODE"] })).outcome, "not_found");
  });
  scenario("promotion creation time is immutable and equal-microsecond keysets use the id tie-breaker", () => {
    const high = "a1000000-0000-4000-8000-000000000088", low = "a1000000-0000-4000-8000-000000000087", createdAt = "2026-09-04T12:00:00.123456Z";
    for (const [id, name] of [[low, "TIE-B low"], [high, "TIE-B high"]]) psql(box, `INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','${name}','draft',1,'${JSON.stringify(validRuleDocument())}'::jsonb,'${createdAt}','${createdAt}')`);
    assert.notEqual(psql(box, `UPDATE saas.promotions SET created_at='2026-09-04T12:00:00.123455Z' WHERE store_id='${STORE}' AND id='${high}'`, DB, true).status, 0);
    const page = listPage(box, "analyst", { search: "TIE-B", limit: 1 });
    assert.deepEqual(page.items.map((item) => item.id), [high]); assert.equal(page.hasMore, true);
    assert.deepEqual(page.cursorAnchor, { createdAt, id: high });
    const tail = listPage(box, "analyst", { search: "TIE-B", limit: 1 }, { snapshotAt: page.snapshotAt, ...page.cursorAnchor });
    assert.deepEqual(tail.items.map((item) => item.id), [low]); assert.equal(tail.hasMore, false); assert.equal(tail.cursorAnchor, null);
    assert.deepEqual(listPage(box, "analyst", { search: "TIE-B absent", limit: 1 }).items, []);
    assert.equal(listPage(box, "analyst", { search: "TIE-B high", limit: 1 }).hasMore, false);
  });
  scenario("list filter dimensions are individually exact AND-composed and compact", () => {
    const automatic = "a1000000-0000-4000-8000-000000000110", coded = "a1000000-0000-4000-8000-000000000111";
    const automaticRule = validRuleDocument(); automaticRule.conditions.minimumBasketMinor = 100000;
    const codeRule = validRuleDocument(); codeRule.trigger = { kind: "code", codes: ["FILTERCODE"] }; codeRule.benefit = { kind: "fixed_amount", amountMinor: 25, currency: "TRY" }; codeRule.audience = { mode: "customer_tags", referenceIds: [LINE] };
    for (const [id, name, document] of [[automatic, "FILTER-B automatic", automaticRule], [coded, "FILTER-B coded", codeRule]]) psql(box, `INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','${name}','draft',1,'${JSON.stringify(document)}'::jsonb,'2026-09-04','2026-09-04')`);
    psql(box, `INSERT INTO saas.promotion_codes(id,store_id,promotion_id,code,status,created_at) VALUES('a4000000-0000-4000-8000-000000000111','${STORE}','${coded}','FILTERCODE','active','2026-09-04'),('a4000000-0000-4000-8000-000000000112','${OTHER_STORE}','90000000-0000-4000-8000-000000000130','FOREIGNFILTER','active','2026-09-04')`);
    assert.deepEqual(listPage(box, "analyst", { search: "FILTER-B", triggerKinds: ["code"], limit: 20 }).items.map((item) => item.id), [coded]);
    assert.deepEqual(listPage(box, "analyst", { search: "FILTER-B", benefitKinds: ["fixed_amount"], limit: 20 }).items.map((item) => item.id), [coded]);
    assert.deepEqual(listPage(box, "analyst", { search: "FILTER-B", audienceModes: ["customer_tags"], limit: 20 }).items.map((item) => item.id), [coded]);
    assert.deepEqual(listPage(box, "analyst", { search: "FILTER-B", triggerKinds: ["code"], benefitKinds: ["percentage"], limit: 20 }).items, []);
    assert.deepEqual(listPage(box, "analyst", { search: "FOREIGNFILTER", limit: 20 }).items, []);
    psql(box, `UPDATE saas.promotion_codes SET status='revoked' WHERE store_id='${STORE}' AND code='FILTERCODE'`);
    assert.deepEqual(listPage(box, "analyst", { search: "FILTERCODE", limit: 20 }).items, []);
    const item = listPage(box, "analyst", { search: "FILTER-B coded", limit: 1 }).items[0];
    assert.deepEqual(Object.keys(item).sort(), ["activeCodeCount","audienceMode","benefitKind","createdAt","effectiveStatus","endsAt","financials","humanMechanic","id","name","startsAt","status","triggerKind","updatedAt","usage","version"].sort());
    assert.equal(item.activeCodeCount, 0);
    assert.deepEqual(item.financials, []);
    assert.equal(listPage(box, "analyst", { search: "FILTER-B automatic", limit: 1 }).items[0].humanMechanic, "1.000 TL üzeri %10 indirim");
    const selectedRule = validRuleDocument(); selectedRule.targets = { mode: "selected", include: [{ kind: "category", id: CATEGORY }], exclude: [] }; selectedRule.benefit.percentageBps = 2000;
    const freeRule = validRuleDocument(); freeRule.benefit = { kind: "buy_x_get_y", buyQuantity: 2, receiveQuantity: 1, discountPercentageBps: 10000, reward: { strategy: "same_product_cheapest" } };
    const partialRule = structuredClone(freeRule); partialRule.benefit.discountPercentageBps = 2500;
    for (const [id, name, document] of [["a1000000-0000-4000-8000-000000000112","FILTER-B selected mechanic",selectedRule],["a1000000-0000-4000-8000-000000000113","FILTER-B free mechanic",freeRule],["a1000000-0000-4000-8000-000000000114","FILTER-B partial mechanic",partialRule]]) psql(box, `INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','${name}','draft',1,'${JSON.stringify(document)}'::jsonb,'2026-09-04','2026-09-04')`);
    assert.equal(listPage(box, "analyst", { search: "FILTER-B selected mechanic", limit: 1 }).items[0].humanMechanic, "seçili kategoride %20 indirim");
    assert.equal(listPage(box, "analyst", { search: "FILTER-B free mechanic", limit: 1 }).items[0].humanMechanic, "2 al, 1 bedava");
    assert.equal(listPage(box, "analyst", { search: "FILTER-B partial mechanic", limit: 1 }).items[0].humanMechanic, "2 al, 1 üründe %25 indirim");
    assert.equal(JSON.stringify(item).length < 2048, true);
  });
  scenario("direct-code synchronization preserves retained ids batch rows and fails atomically", () => {
    const promotion = "a1000000-0000-4000-8000-000000000001", retainedId = scalar(box, `SELECT id FROM saas.promotion_codes WHERE store_id='${STORE}' AND promotion_id='${promotion}' AND code='DIRECT20'`);
    const other = "a1000000-0000-4000-8000-000000000120", otherOperation = "a2000000-0000-4000-8000-000000000120", otherRule = validRuleDocument(); otherRule.trigger = { kind: "code", codes: ["COLLISION"] };
    assert.equal(appScalar(box, createCall(box, "store_owner", other, otherOperation, "Collision owner", otherRule)), `created:${other}`);
    const batch = "a5000000-0000-4000-8000-000000000120", batchOperation = "a6000000-0000-4000-8000-000000000120";
    const batchFingerprint = scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('code_batch','${STORE}',pg_catalog.jsonb_build_object('promotionId','${promotion}'::uuid,'count',1,'prefix','BATCH'))`);
    assert.equal(appScalar(box, `SELECT outcome FROM saas.promotion_create_code_batch_v1(${authorityArguments("store_owner")},'${batchOperation}','${batchFingerprint}','${batch}','${promotion}',1,'BATCH')`), "created");
    const batchCode = scalar(box, `SELECT id FROM saas.promotion_codes WHERE store_id='${STORE}' AND batch_id='${batch}'`);
    const automatic = validRuleDocument();
    assert.equal(appScalar(box, updateCall(box, "store_owner", promotion, "a2000000-0000-4000-8000-000000000121", 2, "Automatic blocked", automatic)), "active_code_batches:");
    const codeList=()=>listPage(box,"analyst",{search:"Materialized update",limit:1}).items[0].activeCodeCount;
    assert.equal(codeList(),3);
    const holdOperation="a7000000-0000-4000-8000-000000000120", hold="a7000000-0000-4000-8000-000000000121";
    psql(box,`BEGIN; INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${holdOperation}','${STORE}','${holdOperation}','reserve',repeat('7',64),'reservation_group','${holdOperation}','${reservationOperationResult(holdOperation,[{promotionId:promotion,reservationId:hold,promotionVersion:2,normalizedCode:"DIRECT20",discountMinor:1}],"reserved",{expiresAt:"2026-09-05T00:15:00.000Z"})}'::jsonb,'2026-09-05T00:00:00.000Z'); INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,code_id,normalized_code,reservation_group_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_uses,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES('${hold}','${STORE}','${promotion}',2,'${retainedId}','DIRECT20','${holdOperation}','${holdOperation}',repeat('7',64),'offline_checkout','${holdOperation}',1,1,1,'TRY','${frozenReservationSnapshotFor(box,{promotionId:promotion,promotionVersion:2,normalizedCode:"DIRECT20",discountMinor:1,lineId:hold})}'::jsonb,repeat('b',64),'reserved','2026-09-05T00:15:00.000Z','2026-09-05T00:00:00.000Z','2026-09-05T00:00:00.000Z'); COMMIT;`);
    assert.equal(codeList(),3); assert.notEqual(psql(box,`UPDATE saas.promotion_usage_reservations SET status='committed',updated_at='2026-09-05T00:00:01.000Z' WHERE store_id='${STORE}' AND id='${hold}'`,DB,true).status,0); assert.equal(codeList(),3);
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_code_batch_status_v1(${authorityArguments("store_owner")},'${batch}','paused')`),"updated"); assert.equal(codeList(),2); assert.equal(scalar(box,`SELECT status FROM saas.promotion_codes WHERE store_id='${STORE}' AND id='${batchCode}'`),"paused");
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_code_batch_status_v1(${authorityArguments("store_owner")},'${batch}','active')`),"updated"); assert.equal(codeList(),3);
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_code_batch_status_v1(${authorityArguments("store_owner")},'${batch}','revoked')`),"updated"); assert.equal(codeList(),2);
    assert.equal(appScalar(box, updateCall(box, "store_owner", promotion, "a2000000-0000-4000-8000-000000000122", 2, "Automatic accepted", automatic)), `updated:${promotion}`);
    assert.equal(scalar(box, `SELECT status FROM saas.promotion_codes WHERE store_id='${STORE}' AND id='${batchCode}'`), "revoked"); assert.equal(listPage(box,"analyst",{search:"Automatic accepted",limit:1}).items[0].activeCodeCount,0);
    assert.equal(scalar(box, `SELECT count(*) FROM saas.promotion_codes WHERE store_id='${STORE}' AND promotion_id='${promotion}' AND batch_id IS NULL AND status='active'`), "0");
    const impossibleStray="a4000000-0000-4000-8000-000000000121";
    psql(box,`INSERT INTO saas.promotion_codes(id,store_id,promotion_id,batch_id,code,status,created_at) VALUES('${impossibleStray}','${STORE}','${promotion}',NULL,'AUTOMATICSTRAY','active','2026-09-05')`);
    assert.equal(listPage(box,"analyst",{search:"Automatic accepted",limit:1}).items[0].activeCodeCount,0);
    psql(box,`DELETE FROM saas.promotion_codes WHERE store_id='${STORE}' AND id='${impossibleStray}'`);
    const collision = validRuleDocument(); collision.trigger = { kind: "code", codes: ["COLLISION"] };
    const before = scalar(box, `SELECT version||':'||(SELECT count(*) FROM saas.promotion_targets WHERE store_id=p.store_id AND promotion_id=p.id)||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id=p.store_id AND promotion_id=p.id) FROM saas.promotions p WHERE store_id='${STORE}' AND id='${promotion}'`);
    assert.equal(appScalar(box, updateCall(box, "store_owner", promotion, "a2000000-0000-4000-8000-000000000123", 3, "Collision rejected", collision)), "code_conflict:");
    assert.equal(scalar(box, `SELECT version||':'||(SELECT count(*) FROM saas.promotion_targets WHERE store_id=p.store_id AND promotion_id=p.id)||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id=p.store_id AND promotion_id=p.id) FROM saas.promotions p WHERE store_id='${STORE}' AND id='${promotion}'`), before);
    assert.equal(retainedId.length > 0, true);
  });
  scenario("lifecycle time and exhaustion guards reject illegal activation with zero deltas", () => {
    const future = "a1000000-0000-4000-8000-000000000130", document = validRuleDocument(); document.schedule = { timezone: "Europe/Istanbul", startsAt: "2026-09-06T00:00:00.000Z", endsAt: "2026-09-07T00:00:00.000Z" };
    assert.equal(appScalar(box, createCall(box, "store_owner", future, "a2000000-0000-4000-8000-000000000130", "Lifecycle guards", document)), `created:${future}`);
    assert.equal(appScalar(box, lifecycleCall(box, "store_owner", future, "a2000000-0000-4000-8000-000000000131", 1, "scheduled")), `updated:${future}`);
    const dueEdit = validRuleDocument();
    assert.equal(appScalar(box, updateCall(box, "store_owner", future, "a2000000-0000-4000-8000-000000000139", 2, "Scheduled cannot drift", dueEdit)), "invalid_transition:");
    assert.equal(appScalar(box, lifecycleCall(box, "store_owner", future, "a2000000-0000-4000-8000-000000000132", 2, "active")), "invalid_transition:");
    assert.equal(appScalar(box, lifecycleCall(box, "store_owner", future, "a2000000-0000-4000-8000-000000000133", 2, "paused")), `updated:${future}`);
    assert.equal(appScalar(box, lifecycleCall(box, "store_owner", future, "a2000000-0000-4000-8000-000000000134", 3, "scheduled")), `updated:${future}`);
    const replayCount = scalar(box, `SELECT version||':'||(SELECT count(*) FROM saas.promotion_versions WHERE store_id=p.store_id AND promotion_id=p.id)||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id=p.store_id AND promotion_id=p.id) FROM saas.promotions p WHERE store_id='${STORE}' AND id='${future}'`);
    assert.equal(appScalar(box, lifecycleCall(box, "store_owner", future, "a2000000-0000-4000-8000-000000000134", 3, "scheduled")), `operation_replayed:${future}`);
    assert.equal(scalar(box, `SELECT version||':'||(SELECT count(*) FROM saas.promotion_versions WHERE store_id=p.store_id AND promotion_id=p.id)||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id=p.store_id AND promotion_id=p.id) FROM saas.promotions p WHERE store_id='${STORE}' AND id='${future}'`), replayCount);
    const exhausted = "a1000000-0000-4000-8000-000000000135", exhaustedRule = validRuleDocument(); exhaustedRule.limits.totalUsage = 0;
    assert.equal(appScalar(box, createCall(box, "store_owner", exhausted, "a2000000-0000-4000-8000-000000000135", "Exhausted activation", exhaustedRule)), `created:${exhausted}`);
    const exhaustedOperation="a2000000-0000-4000-8000-000000000136", exhaustedBefore=scalar(box,`SELECT version||':'||(SELECT count(*) FROM saas.promotion_versions WHERE store_id=p.store_id AND promotion_id=p.id)||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id=p.store_id AND promotion_id=p.id) FROM saas.promotions p WHERE store_id='${STORE}' AND id='${exhausted}'`), exhaustedActor=authority("store_owner");
    const exhaustedFingerprint=scalar(box,`SELECT saas.promotion_operation_fingerprint_v2('lifecycle','${STORE}',pg_catalog.jsonb_build_object('id','${exhausted}'::uuid,'expectedVersion',1,'nextStatus','active'))`);
    const exhaustedResponse=JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_lifecycle_v1('${exhaustedActor.store}','${exhaustedActor.principal}','${exhaustedActor.membership}','${exhaustedActor.plan}','${exhaustedActor.planCode}',${exhaustedActor.planVersion},'2026-09-05T00:00:00Z','${exhaustedOperation}','${exhaustedFingerprint}','${exhausted}',1,'active')`));
    assert.deepEqual(exhaustedResponse,{outcome:"publish_blocked",result:{blocking:true,findings:[{code:"usage_limit_zero",severity:"blocking",relatedPromotionId:null,relatedPromotionName:null}]}});
    assert.equal(scalar(box,`SELECT version||':'||(SELECT count(*) FROM saas.promotion_versions WHERE store_id=p.store_id AND promotion_id=p.id)||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id=p.store_id AND promotion_id=p.id) FROM saas.promotions p WHERE store_id='${STORE}' AND id='${exhausted}'`),exhaustedBefore);
    assert.equal(scalar(box,`SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_id='${exhaustedOperation}'`),"0");
    const active = "a1000000-0000-4000-8000-000000000137", activeRule = validRuleDocument();
    assert.equal(appScalar(box, createCall(box, "store_owner", active, "a2000000-0000-4000-8000-000000000137", "Active edit guard", activeRule)), `created:${active}`);
    assert.equal(appScalar(box, lifecycleCall(box, "store_owner", active, "a2000000-0000-4000-8000-000000000138", 1, "active")), `updated:${active}`);
    assert.equal(appScalar(box, updateCall(box, "store_owner", active, "a2000000-0000-4000-8000-000000000140", 2, "Future active invalid", document)), "invalid_transition:");
    const endedEdit = structuredClone(activeRule); endedEdit.schedule = { timezone: "Europe/Istanbul", startsAt: "2026-09-01T00:00:00.000Z", endsAt: "2026-09-05T00:00:00.000Z" };
    assert.equal(appScalar(box, updateCall(box, "store_owner", active, "a2000000-0000-4000-8000-000000000141", 2, "Ended active invalid", endedEdit)), "invalid_transition:");
    const exhaustedEdit = structuredClone(activeRule); exhaustedEdit.limits.totalUsage = 0;
    assert.equal(appScalar(box, updateCall(box, "store_owner", active, "a2000000-0000-4000-8000-000000000142", 2, "Exhausted active invalid", exhaustedEdit)), "invalid_transition:");
  });
  scenario("selected simulation preserves schedule and reference safety and mutates no durable relation", () => {
    psql(box, `UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}'`);
    const future = validRuleDocument(); future.schedule = { timezone: "Europe/Istanbul", startsAt: "2026-09-06T00:00:00.000Z", endsAt: "2026-09-07T00:00:00.000Z" };
    const ended = validRuleDocument(); ended.schedule = { timezone: "Europe/Istanbul", startsAt: "2026-09-01T00:00:00.000Z", endsAt: "2026-09-05T00:00:00.000Z" };
    const invalidGift = validRuleDocument(); invalidGift.benefit = { kind: "gift", giftVariantId: OTHER_PRODUCT, quantity: 1, autoAdd: true };
    for (const [suffix, document] of [["140", future], ["141", ended]]) {
      const response = JSON.parse(simulateSelected(box, "analyst", { id: `a1000000-0000-4000-8000-000000000${suffix}`, expectedVersion: null, name: "Scheduled simulator", ruleDocument: document }));
      assert.equal(response.result.evaluation.discountTotalMinor, 0);
    }
    assert.equal(JSON.parse(simulateSelected(box, "analyst", { id: "a1000000-0000-4000-8000-000000000142", expectedVersion: null, name: "Invalid gift", ruleDocument: invalidGift })).outcome, "invalid_reference");
    const before = scalar(box, `SELECT (SELECT count(*) FROM saas.promotions)||':'||(SELECT count(*) FROM saas.promotion_versions)||':'||(SELECT count(*) FROM saas.promotion_operations)||':'||(SELECT count(*) FROM saas.promotion_audit_events)||':'||(SELECT count(*) FROM saas.promotion_usage_reservations)||':'||(SELECT count(*) FROM saas.promotion_redemptions)||':'||(SELECT count(*) FROM saas.order_promotion_snapshots)||':'||(SELECT count(*) FROM saas.order_discount_allocations)||':'||(SELECT count(*) FROM saas.orders)||':'||(SELECT count(*) FROM saas.product_variants)`);
    simulateSelected(box, "analyst", { id: "a1000000-0000-4000-8000-000000000143", expectedVersion: null, name: "No writes", ruleDocument: validRuleDocument() });
    assert.equal(scalar(box, `SELECT (SELECT count(*) FROM saas.promotions)||':'||(SELECT count(*) FROM saas.promotion_versions)||':'||(SELECT count(*) FROM saas.promotion_operations)||':'||(SELECT count(*) FROM saas.promotion_audit_events)||':'||(SELECT count(*) FROM saas.promotion_usage_reservations)||':'||(SELECT count(*) FROM saas.promotion_redemptions)||':'||(SELECT count(*) FROM saas.order_promotion_snapshots)||':'||(SELECT count(*) FROM saas.order_discount_allocations)||':'||(SELECT count(*) FROM saas.orders)||':'||(SELECT count(*) FROM saas.product_variants)`), before);
  });
  scenario("one reservation group operation represents multiple promotion holds exactly", () => {
    const operation = "92000000-0000-4000-8000-000000000179", group = "92000000-0000-4000-8000-000000000180", firstReservation = "93000000-0000-4000-8000-000000000180", secondReservation = "93000000-0000-4000-8000-000000000181";
    const firstPromotion = "90000000-0000-4000-8000-000000000126", secondPromotion = "90000000-0000-4000-8000-000000000127";
    const expiresAt="2026-09-05T00:15:00.000Z", firstSnapshot=frozenReservationSnapshotFor(box,{promotionId:firstPromotion,discountMinor:10,lineId:firstReservation}), secondSnapshot=frozenReservationSnapshotFor(box,{promotionId:secondPromotion,discountMinor:20,lineId:secondReservation});
    psql(box, `BEGIN; INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at)
      VALUES('${operation}','${STORE}','${operation}','reserve',repeat('9',64),'reservation_group','${group}','${reservationOperationResult(group,[{promotionId:firstPromotion,reservationId:firstReservation,discountMinor:10},{promotionId:secondPromotion,reservationId:secondReservation,discountMinor:20}],"reserved",{expiresAt})}'::jsonb,'2026-09-05T00:00:00.000Z');
      INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,code_id,normalized_code,reservation_group_id,customer_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_uses,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES
      ('${firstReservation}','${STORE}','${firstPromotion}',1,NULL,NULL,'${group}',NULL,'${operation}',repeat('9',64),'offline_checkout','${group}',1,10,10,'TRY','${firstSnapshot}'::jsonb,repeat('b',64),'reserved','${expiresAt}','2026-09-05T00:00:00.000Z','2026-09-05T00:00:00.000Z'),
      ('${secondReservation}','${STORE}','${secondPromotion}',1,NULL,NULL,'${group}',NULL,'${operation}',repeat('9',64),'offline_checkout','${group}',1,20,20,'TRY','${secondSnapshot}'::jsonb,repeat('b',64),'reserved','${expiresAt}','2026-09-05T00:00:00.000Z','2026-09-05T00:00:00.000Z'); COMMIT;`);
    assert.equal(scalar(box, `SELECT count(*)||':'||sum(discount_minor) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND reservation_group_id='${group}'`), "2:30");
    assert.equal(scalar(box, `SELECT count(DISTINCT evaluator_fingerprint)||':'||min(evaluator_fingerprint) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND reservation_group_id='${group}'`), `1:${"b".repeat(64)}`);
    assert.equal(scalar(box, `SELECT result_entity_kind||':'||result_entity_id FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_id='${operation}'`), `reservation_group:${group}`);
    assert.equal(scalar(box, `SELECT saas.promotion_operation_result_valid('reserve',result_payload) FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_id='${operation}'`), "t");
    assert.equal(scalar(box, `SELECT saas.promotion_operation_result_valid('reserve','${reservationOperationResult(group,[{promotionId:firstPromotion,reservationId:firstReservation,discountMinor:10},{promotionId:firstPromotion,reservationId:secondReservation,discountMinor:20}])}'::jsonb)`), "f");
    const incompleteOperation="92000000-0000-4000-8000-000000000175", incompleteGroup="92000000-0000-4000-8000-000000000176", incompleteFirst="93000000-0000-4000-8000-000000000182", incompleteSecond="93000000-0000-4000-8000-000000000183";
    const incompleteReserveResult=psql(box,`BEGIN;
      INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${incompleteOperation}','${STORE}','${incompleteOperation}','reserve',repeat('5',64),'reservation_group','${incompleteGroup}','${reservationOperationResult(incompleteGroup,[{promotionId:firstPromotion,reservationId:incompleteFirst,discountMinor:10},{promotionId:secondPromotion,reservationId:incompleteSecond,discountMinor:20}],"reserved",{expiresAt})}'::jsonb,'2026-09-05T00:00:00.000Z');
      INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,reservation_group_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES('${incompleteFirst}','${STORE}','${firstPromotion}',1,'${incompleteGroup}','${incompleteOperation}',repeat('5',64),'offline_checkout','${incompleteGroup}',10,10,'TRY','${frozenReservationSnapshotFor(box,{promotionId:firstPromotion,discountMinor:10,lineId:incompleteFirst})}'::jsonb,repeat('b',64),'reserved','${expiresAt}','2026-09-05T00:00:00.000Z','2026-09-05T00:00:00.000Z');
      SELECT 'INCOMPLETE_RESERVE_ROW_INSERTED'; COMMIT;`,DB,true);
    assert.notEqual(incompleteReserveResult.status,0); assert.match(incompleteReserveResult.stderr,/promotion reservation group is incomplete/);
    assert.match(incompleteReserveResult.stdout,/INCOMPLETE_RESERVE_ROW_INSERTED/);
    assert.equal(scalar(box,`SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_id='${incompleteOperation}'`),"0");

    const incompleteCommit="92000000-0000-4000-8000-000000000181", incompleteRedemptionGroup="92000000-0000-4000-8000-000000000182", incompleteOrder="97000000-0000-4000-8000-000000000180", incompleteFirstRedemption="97000000-0000-4000-8000-000000000181", incompleteSecondRedemption="97000000-0000-4000-8000-000000000182";
    const incompleteRedemptionResult=psql(box,`BEGIN;
      INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at) VALUES('${incompleteOrder}','${STORE}','PROMO-INCOMPLETE','storefront','Promotion','promotion-incomplete@test.invalid','TRY',100,0,0,100,'pending','pending','{}','2026-09-05','2026-09-05');
      UPDATE saas.promotion_usage_reservations SET status='committed',updated_at='2026-09-05T00:00:01Z' WHERE store_id='${STORE}' AND reservation_group_id='${group}';
      INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${incompleteCommit}','${STORE}','${incompleteCommit}','commit',repeat('4',64),'redemption_group','${incompleteRedemptionGroup}','${redemptionOperationResult(group,incompleteRedemptionGroup,incompleteOrder,[{promotionId:firstPromotion,reservationId:firstReservation,redemptionId:incompleteFirstRedemption,discountMinor:10},{promotionId:secondPromotion,reservationId:secondReservation,redemptionId:incompleteSecondRedemption,discountMinor:20}])}'::jsonb,'2026-09-05');
      INSERT INTO saas.promotion_redemptions(id,store_id,promotion_id,reservation_id,reservation_group_id,redemption_group_id,operation_id,operation_fingerprint,promotion_version,code_id,normalized_code,order_id,customer_id,discount_minor,currency,evaluator_fingerprint,created_at) VALUES('${incompleteFirstRedemption}','${STORE}','${firstPromotion}','${firstReservation}','${group}','${incompleteRedemptionGroup}','${incompleteCommit}',repeat('4',64),1,NULL,NULL,'${incompleteOrder}',NULL,10,'TRY',repeat('b',64),'2026-09-05');
      SELECT 'INCOMPLETE_REDEMPTION_ROW_INSERTED'; COMMIT;`,DB,true);
    assert.notEqual(incompleteRedemptionResult.status,0); assert.match(incompleteRedemptionResult.stderr,/promotion committed group ledger incomplete/);
    assert.match(incompleteRedemptionResult.stdout,/INCOMPLETE_REDEMPTION_ROW_INSERTED/);
    assert.equal(scalar(box,`SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_id='${incompleteCommit}'`),"0");
    assert.notEqual(psql(box, `INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('92000000-0000-4000-8000-000000000177','${STORE}','92000000-0000-4000-8000-000000000177','reserve',repeat('7',64),'reservation_group','${group}','${reservationOperationResult(group,[{promotionId:firstPromotion,reservationId:"93000000-0000-4000-8000-000000000177",discountMinor:1}])}'::jsonb,'2026-09-05')`,DB,true).status,0);
    const releaseOperation = "92000000-0000-4000-8000-000000000178";
    const releaseFingerprint = settlementFingerprint(box,"release",{reservationGroupId:group});
    psql(box, `BEGIN; UPDATE saas.promotion_usage_reservations SET status='released',updated_at='2026-09-05T00:00:02.000Z' WHERE store_id='${STORE}' AND reservation_group_id='${group}'; INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${releaseOperation}','${STORE}','${releaseOperation}','release','${releaseFingerprint}','reservation_group','${group}','${reservationOperationResult(group,[{promotionId:firstPromotion,reservationId:firstReservation,discountMinor:10},{promotionId:secondPromotion,reservationId:secondReservation,discountMinor:20}],"released",{expiresAt})}'::jsonb,'2026-09-05T00:00:02.000Z'); COMMIT;`);
    assert.notEqual(psql(box, `INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,reservation_group_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES('93000000-0000-4000-8000-000000000178','${STORE}','90000000-0000-4000-8000-000000000131',1,'${group}','${releaseOperation}',repeat('6',64),'hosted_checkout','checkout:wrong-kind',1,1,'TRY','{}',repeat('b',64),'reserved','2026-09-06','2026-09-05','2026-09-05')`,DB,true).status,0);
    assert.notEqual(psql(box, `INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,reservation_group_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES('93000000-0000-4000-8000-000000000179','${STORE}','90000000-0000-4000-8000-000000000131',1,'${group}','${operation}',repeat('8',64),'hosted_checkout','checkout:wrong-fingerprint',1,1,'TRY','{}',repeat('b',64),'reserved','2026-09-06','2026-09-05','2026-09-05')`,DB,true).status,0);
  });
  scenario("reservation facts are immutable and terminal transitions cannot reopen", () => {
    const promotion = "90000000-0000-4000-8000-000000000126", operation = "92000000-0000-4000-8000-000000000126", reservation = "93000000-0000-4000-8000-000000000126";
    psql(box,`BEGIN; INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${operation}','${STORE}','${operation}','reserve',repeat('a',64),'reservation_group','${operation}','${reservationOperationResult(operation,[{promotionId:promotion,reservationId:reservation,discountMinor:30}],"reserved",{expiresAt:"2026-09-05T00:15:00.000Z"})}'::jsonb,'2026-09-05T00:00:00.000Z'); INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,code_id,normalized_code,reservation_group_id,customer_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_uses,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES('${reservation}','${STORE}','${promotion}',1,NULL,NULL,'${operation}','${LINE}','${operation}',repeat('a',64),'offline_checkout','${operation}',1,30,30,'TRY','${frozenReservationSnapshotFor(box,{promotionId:promotion,discountMinor:30,lineId:reservation})}'::jsonb,repeat('b',64),'reserved','2026-09-05T00:15:00.000Z','2026-09-05T00:00:00.000Z','2026-09-05T00:00:00.000Z'); COMMIT;`);
    assert.notEqual(psql(box,`UPDATE saas.promotion_usage_reservations SET discount_minor=31 WHERE store_id='${STORE}' AND id='${reservation}'`,DB,true).status,0);
    assert.notEqual(psql(box,`UPDATE saas.promotion_usage_reservations SET evaluator_snapshot='{}'::jsonb WHERE store_id='${STORE}' AND id='${reservation}'`,DB,true).status,0);

    const batchOperation="92000000-0000-4000-8000-000000000127", batch="93000000-0000-4000-8000-000000000127", code="93000000-0000-4000-8000-000000000128", normalizedCode="B0000000000000000", foreignCustomer="96000000-0000-4000-8000-000000000126";
    psql(box,`INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${batchOperation}','${STORE}','${batchOperation}','code_batch',repeat('1',64),'code_batch','${batch}',pg_catalog.jsonb_build_object('id','${batch}','promotionId','${promotion}','version',1,'status','active','count',1,'prefix','B','codeLength',17,'perCustomerUsage',1,'expiresAt',NULL,'createdAt','2026-09-05T00:00:00.000Z','updatedAt','2026-09-05T00:00:00.000Z'),'2026-09-05');
      INSERT INTO saas.promotion_code_batches(id,store_id,promotion_id,status,requested_count,operation_id,created_at,version,prefix,code_length,per_customer_usage,expires_at,updated_at) VALUES('${batch}','${STORE}','${promotion}','active',1,'${batchOperation}','2026-09-05',1,'B',17,1,NULL,'2026-09-05');
      INSERT INTO saas.promotion_codes(id,store_id,promotion_id,batch_id,code,status,created_at) VALUES('${code}','${STORE}','${promotion}','${batch}','${normalizedCode}','active','2026-09-05');
      INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,created_at,updated_at) VALUES('${foreignCustomer}','${OTHER_STORE}','active','Foreign','Customer','foreign-binding@test.invalid','2026-09-05','2026-09-05')`);
    assert.notEqual(psql(box,`INSERT INTO saas.promotion_codes(id,store_id,promotion_id,batch_id,code,status,created_at) VALUES('93000000-0000-4000-8000-000000000129','${STORE}','90000000-0000-4000-8000-000000000127','${batch}','CROSSPROMO','active','2026-09-05')`,DB,true).status,0);

    const crossCodeOperation="92000000-0000-4000-8000-000000000128", crossCodeReservation="93000000-0000-4000-8000-000000000130";
    assert.notEqual(psql(box,`BEGIN; INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${crossCodeOperation}','${STORE}','${crossCodeOperation}','reserve',repeat('2',64),'reservation_group','${crossCodeOperation}','${reservationOperationResult(crossCodeOperation,[{promotionId:"90000000-0000-4000-8000-000000000127",reservationId:crossCodeReservation,normalizedCode,discountMinor:1}],"reserved",{expiresAt:"2026-09-05T00:15:00.000Z"})}'::jsonb,'2026-09-05T00:00:00.000Z'); INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,code_id,normalized_code,reservation_group_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES('${crossCodeReservation}','${STORE}','90000000-0000-4000-8000-000000000127',1,'${code}','${normalizedCode}','${crossCodeOperation}','${crossCodeOperation}',repeat('2',64),'hosted_checkout','checkout:cross-code',1,1,'TRY','${frozenReservationSnapshot({promotionId:"90000000-0000-4000-8000-000000000127",normalizedCode,discountMinor:1,lineId:crossCodeReservation})}'::jsonb,repeat('b',64),'reserved','2026-09-05T00:15:00.000Z','2026-09-05T00:00:00.000Z','2026-09-05T00:00:00.000Z'); COMMIT;`,DB,true).status,0);

    const crossCustomerOperation="92000000-0000-4000-8000-000000000129", crossCustomerReservation="93000000-0000-4000-8000-000000000131";
    assert.notEqual(psql(box,`BEGIN; INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${crossCustomerOperation}','${STORE}','${crossCustomerOperation}','reserve',repeat('4',64),'reservation_group','${crossCustomerOperation}','${reservationOperationResult(crossCustomerOperation,[{promotionId:promotion,reservationId:crossCustomerReservation,discountMinor:1}],"reserved",{expiresAt:"2026-09-05T00:15:00.000Z"})}'::jsonb,'2026-09-05T00:00:00.000Z'); INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,reservation_group_id,customer_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES('${crossCustomerReservation}','${STORE}','${promotion}',1,'${crossCustomerOperation}','${foreignCustomer}','${crossCustomerOperation}',repeat('4',64),'hosted_checkout','checkout:cross-customer',1,1,'TRY','${frozenReservationSnapshot({promotionId:promotion,discountMinor:1,lineId:crossCustomerReservation})}'::jsonb,repeat('b',64),'reserved','2026-09-05T00:15:00.000Z','2026-09-05T00:00:00.000Z','2026-09-05T00:00:00.000Z'); COMMIT;`,DB,true).status,0);

    const foreignOrder="97000000-0000-4000-8000-000000000126", firstOrder="97000000-0000-4000-8000-000000000127", secondOrder="97000000-0000-4000-8000-000000000128", firstLine="97000000-0000-4000-8000-000000000129", snapshot="97000000-0000-4000-8000-000000000130", crossOrderGroup="97000000-0000-4000-8000-000000000134", crossOrderRedemption="97000000-0000-4000-8000-000000000132", redemptionGroup="97000000-0000-4000-8000-000000000135", redemption="97000000-0000-4000-8000-000000000136";
    const orderValues=(id,store,number)=>`('${id}','${store}','${number}','storefront','Promotion','promotion-order@test.invalid','TRY',100,0,0,100,'pending','pending','{}','2026-09-05','2026-09-05')`;
    psql(box,`INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at) VALUES ${orderValues(foreignOrder,OTHER_STORE,"PROMO-OTHER")},${orderValues(firstOrder,STORE,"PROMO-FIRST")},${orderValues(secondOrder,STORE,"PROMO-SECOND")};
      INSERT INTO saas.order_items(id,store_id,order_id,position,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at) VALUES('${firstLine}','${STORE}','${firstOrder}',0,'Promotion item',100,1,0,100,'2026-09-05')`);
    assert.notEqual(psql(box,`UPDATE saas.promotion_usage_reservations SET status='committed',updated_at='2026-09-05T00:00:01Z' WHERE store_id='${STORE}' AND id='${reservation}'`,DB,true).status,0);
    assert.equal(scalar(box,`SELECT status FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND id='${reservation}'`),"reserved");
    assert.notEqual(psql(box,`INSERT INTO saas.order_promotion_snapshots(id,store_id,order_id,promotion_id,promotion_version,normalized_code,currency,discount_minor,evaluator_fingerprint,snapshot,created_at) VALUES('${snapshot}','${STORE}','${secondOrder}','${promotion}',1,NULL,'TRY',1,repeat('6',64),'{}','2026-09-05')`,DB,true).status,0);
    assert.notEqual(psql(box,`INSERT INTO saas.order_promotion_snapshots(id,store_id,order_id,promotion_id,promotion_version,normalized_code,currency,discount_minor,evaluator_fingerprint,snapshot,created_at) VALUES('97000000-0000-4000-8000-000000000131','${STORE}','${foreignOrder}','${promotion}',1,NULL,'TRY',1,repeat('7',64),'{}','2026-09-05')`,DB,true).status,0);
    assert.notEqual(psql(box,`BEGIN; INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${crossOrderGroup}','${STORE}','${crossOrderGroup}','commit',repeat('7',64),'redemption_group','${crossOrderGroup}','${redemptionOperationResult(operation,crossOrderGroup,foreignOrder,[{promotionId:promotion,reservationId:reservation,redemptionId:crossOrderRedemption,discountMinor:30}])}'::jsonb,'2026-09-05'); INSERT INTO saas.promotion_redemptions(id,store_id,promotion_id,reservation_id,reservation_group_id,redemption_group_id,operation_id,operation_fingerprint,promotion_version,code_id,normalized_code,order_id,customer_id,discount_minor,currency,evaluator_fingerprint,created_at) VALUES('${crossOrderRedemption}','${STORE}','${promotion}','${reservation}','${operation}','${crossOrderGroup}','${crossOrderGroup}',repeat('7',64),1,NULL,NULL,'${foreignOrder}','${LINE}',30,'TRY',repeat('b',64),'2026-09-05'); COMMIT;`,DB,true).status,0);
    assert.notEqual(psql(box,`INSERT INTO saas.order_discount_allocations(id,store_id,order_id,snapshot_id,line_id,line_position,discount_minor,created_at) VALUES('97000000-0000-4000-8000-000000000133','${STORE}','${secondOrder}','${snapshot}','${firstLine}',0,1,'2026-09-05')`,DB,true).status,0);
    const commitOperationInsert=`INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${redemptionGroup}','${STORE}','${redemptionGroup}','commit',repeat('8',64),'redemption_group','${redemptionGroup}','${redemptionOperationResult(operation,redemptionGroup,secondOrder,[{promotionId:promotion,reservationId:reservation,redemptionId:redemption,discountMinor:30}])}'::jsonb,'2026-09-05')`;
    const redemptionInsert=(overrides={})=>`INSERT INTO saas.promotion_redemptions(id,store_id,promotion_id,reservation_id,reservation_group_id,redemption_group_id,operation_id,operation_fingerprint,promotion_version,code_id,normalized_code,order_id,customer_id,discount_minor,currency,evaluator_fingerprint,created_at) VALUES('${redemption}','${STORE}','${promotion}','${reservation}','${operation}','${redemptionGroup}','${redemptionGroup}',repeat('8',64),${overrides.promotionVersion ?? 1},NULL,NULL,'${secondOrder}','${overrides.customerId ?? LINE}',${overrides.discountMinor ?? 30},'${overrides.currency ?? "TRY"}',repeat('${overrides.evaluatorCharacter ?? "b"}',64),'2026-09-05')`;
    for (const forged of [{promotionVersion:2},{customerId:foreignCustomer},{discountMinor:31},{currency:"USD"},{evaluatorCharacter:"c"}]) assert.notEqual(psql(box,`BEGIN; ${commitOperationInsert}; ${redemptionInsert(forged)}; COMMIT;`,DB,true).status,0);
    assert.notEqual(psql(box,`BEGIN; ${commitOperationInsert}; ${redemptionInsert()}; COMMIT;`,DB,true).status,0);
    assert.equal(scalar(box,`SELECT count(*) FROM saas.promotion_redemptions WHERE store_id='${STORE}' AND id='${redemption}'`),"0");
    assert.notEqual(psql(box,`INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('97000000-0000-4000-8000-000000000137','${STORE}','97000000-0000-4000-8000-000000000137','commit',repeat('9',64),'redemption_group','${redemptionGroup}','${redemptionOperationResult(operation,redemptionGroup,secondOrder,[{promotionId:promotion,reservationId:reservation,redemptionId:"97000000-0000-4000-8000-000000000137",discountMinor:30}])}'::jsonb,'2026-09-05')`,DB,true).status,0);
    assert.notEqual(psql(box,`UPDATE saas.promotion_usage_reservations SET status='released',updated_at='2026-09-05T00:00:02Z' WHERE store_id='${STORE}' AND id='${reservation}'`,DB,true).status,0);
  });
  scenario("operation audit and evaluator payload bounds reject oversized persistence", () => {
    assert.notEqual(psql(box,`INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('92000000-0000-4000-8000-000000000190','${STORE}','92000000-0000-4000-8000-000000000190','create',repeat('c',64),'promotion','90000000-0000-4000-8000-000000000126',pg_catalog.jsonb_build_object('data',repeat('x',340000)),'2026-09-05')`,DB,true).status,0);
    assert.notEqual(psql(box,`INSERT INTO saas.promotion_audit_events(id,store_id,promotion_id,event_kind,payload,created_at) VALUES('92000000-0000-4000-8000-000000000191','${STORE}','90000000-0000-4000-8000-000000000126','bounded',pg_catalog.jsonb_build_object('data',repeat('x',40000)),'2026-09-05')`,DB,true).status,0);
    assert.notEqual(psql(box,`BEGIN; INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('92000000-0000-4000-8000-000000000192','${STORE}','92000000-0000-4000-8000-000000000192','reserve',repeat('d',64),'reservation_group','92000000-0000-4000-8000-000000000192','${reservationOperationResult("92000000-0000-4000-8000-000000000192",[{promotionId:"90000000-0000-4000-8000-000000000126",reservationId:"93000000-0000-4000-8000-000000000192",discountMinor:1}])}'::jsonb,'2026-09-05'); INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,reservation_group_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_uses,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES('93000000-0000-4000-8000-000000000192','${STORE}','90000000-0000-4000-8000-000000000126',1,'92000000-0000-4000-8000-000000000192','92000000-0000-4000-8000-000000000192',repeat('d',64),'hosted_checkout','checkout:oversized',1,1,1,'TRY',pg_catalog.jsonb_build_object('data',repeat('x',270000)),repeat('b',64),'reserved','2026-09-06T00:00:00Z','2026-09-05','2026-09-05'); COMMIT;`,DB,true).status,0);
  });
  scenario("new and legacy batch creation freeze bounds entropy exact results and recovery", () => {
    const document = validRuleDocument();
    document.trigger = { kind: "code", codes: ["DIRECTREUSE"] };
    document.schedule.startsAt = "2026-09-04T00:00:00.000Z";
    document.schedule.endsAt = "2026-09-05T02:00:00.000Z";
    assert.equal(appScalar(box, createCall(box, "store_owner", BATCH_PROMOTION, "b2000000-0000-4000-8000-000000000126", "Slice C code batches", document)), `created:${BATCH_PROMOTION}`);
    const created = createBatch(box, { operationId: PRIMARY_BATCH_OPERATION, batchId: PRIMARY_BATCH, promotionId: BATCH_PROMOTION, count: 3, prefix: "SAFE_", codeLength: 21, perCustomerUsage: 2, expiresAt: "2026-09-05T01:00:00.000Z" });
    assert.equal(created.outcome, "created");
    assert.deepEqual(Object.keys(created.result).sort(), ["codeLength","count","createdAt","expiresAt","id","perCustomerUsage","prefix","promotionId","status","updatedAt","version"].sort());
    assert.deepEqual(created.result, { id: PRIMARY_BATCH, promotionId: BATCH_PROMOTION, version: 1, status: "active", count: 3, prefix: "SAFE_", codeLength: 21, perCustomerUsage: 2, expiresAt: "2026-09-05T01:00:00.000Z", createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" });
    assert.equal(scalar(box,`SELECT saas.promotion_operation_result_valid('code_batch',pg_catalog.jsonb_set('${JSON.stringify(created.result)}'::jsonb,'{expiresAt}',pg_catalog.to_jsonb('2026-09-05T00:00:00.000Z'::text)))`),"f");
    assert.equal(scalar(box, `SELECT count(*)||':'||count(DISTINCT code)||':'||count(*) FILTER (WHERE code~'^SAFE_[A-F0-9]{16}$' AND pg_catalog.char_length(code)=21 AND status='active') FROM saas.promotion_codes WHERE store_id='${STORE}' AND batch_id='${PRIMARY_BATCH}'`), "3:3:3");
    const replay = createBatch(box, { operationId: PRIMARY_BATCH_OPERATION, batchId: "b3000000-0000-4000-8000-000000000199", promotionId: BATCH_PROMOTION, count: 3, prefix: "SAFE_", codeLength: 21, perCustomerUsage: 2, expiresAt: "2026-09-05T01:00:00.000Z" });
    assert.equal(replay.outcome, "operation_replayed"); assert.deepEqual(replay.result, created.result);
    const expiredReplay = createBatch(box, { operationId: PRIMARY_BATCH_OPERATION, batchId: PRIMARY_BATCH, promotionId: BATCH_PROMOTION, count: 3, prefix: "SAFE_", codeLength: 21, perCustomerUsage: 2, expiresAt: "2026-09-05T01:00:00.000Z", now: "2026-09-05T01:00:00.000Z" });
    assert.equal(expiredReplay.outcome, "operation_replayed"); assert.deepEqual(expiredReplay.result, created.result);
    const changed = createBatch(box, { operationId: PRIMARY_BATCH_OPERATION, batchId: PRIMARY_BATCH, promotionId: BATCH_PROMOTION, count: 4, prefix: "SAFE_", codeLength: 21, perCustomerUsage: 2, expiresAt: "2026-09-05T01:00:00.000Z" });
    assert.equal(changed.outcome, "operation_mismatch"); assert.equal(changed.result, null);
    const expiredChanged = createBatch(box, { operationId: PRIMARY_BATCH_OPERATION, batchId: PRIMARY_BATCH, promotionId: BATCH_PROMOTION, count: 4, prefix: "SAFE_", codeLength: 21, perCustomerUsage: 2, expiresAt: "2026-09-05T01:00:00.000Z", now: "2026-09-05T01:00:00.000Z" });
    assert.equal(expiredChanged.outcome, "operation_mismatch"); assert.equal(expiredChanged.result, null);
    const recovered = JSON.parse(appScalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_recover_operation_v1(${authorityArguments("store_owner")},'${PRIMARY_BATCH_OPERATION}','code_batch','${batchCreateFingerprint(box,{promotionId:BATCH_PROMOTION,count:3,prefix:"SAFE_",codeLength:21,perCustomerUsage:2,expiresAt:"2026-09-05T01:00:00.000Z"})}')`));
    assert.equal(recovered.outcome, "operation_replayed"); assert.deepEqual(recovered.result, created.result);
    const corruptCreatedResult={...created.result,updatedAt:"2026-09-05T00:00:00.001Z"}; psql(box,`BEGIN; SET LOCAL session_replication_role='replica'; UPDATE saas.promotion_operations SET result_payload='${JSON.stringify(corruptCreatedResult)}'::jsonb WHERE store_id='${STORE}' AND operation_id='${PRIMARY_BATCH_OPERATION}'; COMMIT`);
    assert.equal(createBatch(box,{operationId:PRIMARY_BATCH_OPERATION,batchId:PRIMARY_BATCH,promotionId:BATCH_PROMOTION,count:3,prefix:"SAFE_",codeLength:21,perCustomerUsage:2,expiresAt:"2026-09-05T01:00:00.000Z"}).outcome,"operation_result_invalid");
    assert.equal(JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_recover_operation_v1(${authorityArguments("store_owner")},'${PRIMARY_BATCH_OPERATION}','code_batch','${batchCreateFingerprint(box,{promotionId:BATCH_PROMOTION,count:3,prefix:"SAFE_",codeLength:21,perCustomerUsage:2,expiresAt:"2026-09-05T01:00:00.000Z"})}')`)).outcome,"operation_result_invalid");
    psql(box,`BEGIN; SET LOCAL session_replication_role='replica'; UPDATE saas.promotion_operations SET result_payload='${JSON.stringify(created.result)}'::jsonb WHERE store_id='${STORE}' AND operation_id='${PRIMARY_BATCH_OPERATION}'; COMMIT`);

    const max = createBatch(box, { operationId: "b4000000-0000-4000-8000-000000000127", batchId: MAX_BATCH, promotionId: BATCH_PROMOTION, count: 10000, prefix: "MAX_", codeLength: 20, perCustomerUsage: 1000000 });
    assert.equal(max.outcome, "created");
    assert.equal(scalar(box, `SELECT count(*)||':'||count(DISTINCT code)||':'||count(*) FILTER (WHERE code~'^MAX_[A-F0-9]{16}$') FROM saas.promotion_codes WHERE store_id='${STORE}' AND batch_id='${MAX_BATCH}'`), "10000:10000:10000");
    const endBoundary = createBatch(box, { operationId: "b4000000-0000-4000-8000-000000000128", batchId: "b3000000-0000-4000-8000-000000000129", promotionId: BATCH_PROMOTION, count: 1, prefix: "END", codeLength: 19, perCustomerUsage: 1, expiresAt: "2026-09-05T02:00:00.000Z" });
    assert.equal(endBoundary.outcome, "created");

    const oldFingerprint = scalar(box, `SELECT saas.promotion_operation_fingerprint_v2('code_batch','${STORE}',pg_catalog.jsonb_build_object('promotionId','${BATCH_PROMOTION}'::uuid,'count',1,'prefix','OLD'))`);
    const old = JSON.parse(appScalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_create_code_batch_v1(${authorityArguments("store_owner")},'b4000000-0000-4000-8000-000000000129','${oldFingerprint}','${OLD_BATCH}','${BATCH_PROMOTION}',1,'OLD')`));
    assert.equal(old.outcome, "created"); assert.deepEqual(Object.keys(old.result).sort(), ["count","createdAt","id","promotionId","status"].sort());
    assert.equal(scalar(box, `SELECT count(*) FILTER (WHERE pg_catalog.char_length(code)=23 AND code~'^OLD[A-F0-9]{20}$') FROM saas.promotion_codes WHERE store_id='${STORE}' AND batch_id='${OLD_BATCH}'`), "1");
    const oldFullFingerprint=batchCreateFingerprint(box,{promotionId:BATCH_PROMOTION,count:1,prefix:"OLD",codeLength:23,perCustomerUsage:1});
    const oldToNew=createBatch(box,{operationId:"b4000000-0000-4000-8000-000000000129",batchId:OLD_BATCH,promotionId:BATCH_PROMOTION,count:1,prefix:"OLD",codeLength:23,perCustomerUsage:1,fingerprint:oldFullFingerprint});
    assert.equal(oldToNew.outcome,"operation_replayed"); assert.equal(oldToNew.result.id,OLD_BATCH); assert.equal(oldToNew.result.codeLength,23);
    assert.equal(JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_recover_operation_v1(${authorityArguments("store_owner")},'b4000000-0000-4000-8000-000000000129','code_batch','${oldFullFingerprint}')`)).outcome,"operation_replayed");

    const newDefaultBatch="b3000000-0000-4000-8000-000000000130", newDefaultOperation="b4000000-0000-4000-8000-000000000130", newLegacyFingerprint=scalar(box,`SELECT saas.promotion_operation_fingerprint_v2('code_batch','${STORE}',pg_catalog.jsonb_build_object('promotionId','${BATCH_PROMOTION}'::uuid,'count',1,'prefix','NEW'))`);
    const newDefault=createBatch(box,{operationId:newDefaultOperation,batchId:newDefaultBatch,promotionId:BATCH_PROMOTION,count:1,prefix:"NEW",codeLength:23,perCustomerUsage:1});
    assert.equal(newDefault.outcome,"created");
    const newToOld=JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_create_code_batch_v1(${authorityArguments("store_owner")},'${newDefaultOperation}','${newLegacyFingerprint}','${newDefaultBatch}','${BATCH_PROMOTION}',1,'NEW')`));
    assert.deepEqual(newToOld,{outcome:"operation_replayed",result:{id:newDefaultBatch,promotionId:BATCH_PROMOTION,status:"active",count:1,createdAt:newDefault.result.createdAt}});
    assert.equal(JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_recover_operation_v1(${authorityArguments("store_owner")},'${newDefaultOperation}','code_batch','${newLegacyFingerprint}')`)).outcome,"operation_replayed");
    assert.equal(createBatch(box,{operationId:newDefaultOperation,batchId:newDefaultBatch,promotionId:BATCH_PROMOTION,count:2,prefix:"NEW",codeLength:23,perCustomerUsage:1}).outcome,"operation_mismatch");
    const primaryLegacyFingerprint=scalar(box,`SELECT saas.promotion_operation_fingerprint_v2('code_batch','${STORE}',pg_catalog.jsonb_build_object('promotionId','${BATCH_PROMOTION}'::uuid,'count',3,'prefix','SAFE_'))`);
    assert.equal(JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_recover_operation_v1(${authorityArguments("store_owner")},'${PRIMARY_BATCH_OPERATION}','code_batch','${primaryLegacyFingerprint}')`)).outcome,"operation_mismatch");

    const invalids = [
      { count:0,prefix:"",codeLength:16,perCustomerUsage:1 },
      { count:10001,prefix:"",codeLength:16,perCustomerUsage:1 },
      { count:1,prefix:"_BAD",codeLength:20,perCustomerUsage:1 },
      { count:1,prefix:"AAAAAAAAAAAAAAAAAAAAA",codeLength:40,perCustomerUsage:1 },
      { count:1,prefix:"",codeLength:15,perCustomerUsage:1 },
      { count:1,prefix:"SAFE_",codeLength:20,perCustomerUsage:1 },
      { count:1,prefix:"",codeLength:16,perCustomerUsage:0 },
      { count:1,prefix:"",codeLength:16,perCustomerUsage:1000001 },
      { count:1,prefix:"",codeLength:16,perCustomerUsage:1,expiresAt:"2026-09-05T00:00:00.000Z" },
      { count:1,prefix:"",codeLength:16,perCustomerUsage:1,expiresAt:"2026-09-05T02:00:00.001Z" },
    ];
    invalids.forEach((invalid,index) => assert.equal(createBatch(box, { operationId:`b4000000-0000-4000-8000-${String(200+index).padStart(12,"0")}`,batchId:`b3000000-0000-4000-8000-${String(200+index).padStart(12,"0")}`,promotionId:BATCH_PROMOTION,...invalid }).outcome,"invalid_input"));
    assert.equal(createBatch(box, { operationId:"b4000000-0000-4000-8000-000000000220",batchId:"b3000000-0000-4000-8000-000000000220",promotionId:BATCH_PROMOTION,count:1,prefix:"",codeLength:16,perCustomerUsage:1,now:"2026-09-05T00:00:00.001001Z" }).outcome,"invalid_input");
    assert.equal(scalar(box, `SELECT count(*) FROM saas.promotion_code_batches WHERE store_id='${STORE}' AND id::text LIKE 'b3000000-0000-4000-8000-0000000002%'`), "0");
    const invalidTimes=[["infinity","infinity",null],["2026-09-05T00:00:00.000Z","infinity",null],["2026-09-05T00:00:00.000Z","2026-09-05T00:00:00.000Z","infinity"],["2026-09-05T00:00:00.000Z","2026-09-05T00:00:00.000Z","-infinity"],["2026-09-05T00:00:00.000Z","2026-09-05T00:00:00.000Z","2026-09-05T00:00:00.000Z"]];
    invalidTimes.forEach(([createdAt,updatedAt,expiresAt],index)=>{
      const suffix=String(230+index).padStart(12,"0"),expires=expiresAt===null?"NULL":`'${expiresAt}'`;
      const rejected=psql(box,`BEGIN; SET CONSTRAINTS ALL DEFERRED; INSERT INTO saas.promotion_code_batches(id,store_id,promotion_id,status,requested_count,operation_id,created_at,version,prefix,code_length,per_customer_usage,expires_at,updated_at) VALUES('b3000000-0000-4000-8000-${suffix}','${STORE}','${BATCH_PROMOTION}','active',1,'b4000000-0000-4000-8000-${suffix}','${createdAt}',1,'T',17,1,${expires},'${updatedAt}'); ROLLBACK`,DB,true);
      assert.notEqual(rejected.status,0); assert.match(rejected.stderr,/promotion_code_batches_time_check/);
    });
  });
  scenario("batch list CSV and evaluator separate used held remaining from reusable direct codes", () => {
    const codes = JSON.parse(scalar(box, `SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'code',code) ORDER BY pg_catalog.convert_to(code,'UTF8'),id) FROM saas.promotion_codes WHERE store_id='${STORE}' AND batch_id='${PRIMARY_BATCH}'`));
    const [used,held,remaining] = codes;
    const secondCustomer = "b6000000-0000-4000-8000-000000000126";
    psql(box, `INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,created_at,updated_at) VALUES('${secondCustomer}','${STORE}','active','Second','Batch','second-batch@test.invalid','2026-09-05','2026-09-05')`);
    insertReservationFixture(box, { operationId:"c1000000-0000-4000-8000-000000000126",reservationId:"c2000000-0000-4000-8000-000000000126",promotionId:BATCH_PROMOTION,codeId:used.id,normalizedCode:used.code,customerId:LINE,fingerprintCharacter:"1",sourceReference:"c5000000-0000-4000-8000-000000000126" });
    commitReservationFixture(box, { reservationOperationId:"c1000000-0000-4000-8000-000000000126",reservationId:"c2000000-0000-4000-8000-000000000126",redemptionOperationId:"c3000000-0000-4000-8000-000000000126",redemptionId:"c4000000-0000-4000-8000-000000000126",orderId:"c5000000-0000-4000-8000-000000000126",promotionId:BATCH_PROMOTION,codeId:used.id,normalizedCode:used.code,customerId:LINE });
    insertReservationFixture(box, { operationId:"c1000000-0000-4000-8000-000000000127",reservationId:"c2000000-0000-4000-8000-000000000127",promotionId:BATCH_PROMOTION,codeId:held.id,normalizedCode:held.code,customerId:LINE,fingerprintCharacter:"2" });
    const directId = scalar(box, `SELECT id FROM saas.promotion_codes WHERE store_id='${STORE}' AND promotion_id='${BATCH_PROMOTION}' AND batch_id IS NULL AND code='DIRECTREUSE'`);
    insertReservationFixture(box, { operationId:"c1000000-0000-4000-8000-000000000128",reservationId:"c2000000-0000-4000-8000-000000000128",promotionId:BATCH_PROMOTION,codeId:directId,normalizedCode:"DIRECTREUSE",customerId:LINE,fingerprintCharacter:"3" });

    const listed = batchList(box,"analyst",BATCH_PROMOTION);
    assert.equal(listed.outcome,"listed"); assert.match(listed.result.snapshotAt,/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/);
    const primary = listed.result.items.find((item)=>item.id===PRIMARY_BATCH);
    assert.deepEqual({used:primary.used,held:primary.held,remaining:primary.remaining},{used:1,held:1,remaining:1});
    assert.equal(primary.used+primary.held+primary.remaining<=primary.count,true);
    assert.deepEqual(Object.keys(primary).sort(),["codeLength","count","createdAt","expiresAt","held","id","perCustomerUsage","prefix","promotionId","remaining","status","updatedAt","used","version"].sort());
    assert.equal(batchList(box,"editor",BATCH_PROMOTION).outcome,"listed");
    const exported = JSON.parse(appScalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_codes_csv_v1(${authorityArguments("store_owner")},'${PRIMARY_BATCH}')`));
    assert.equal(exported.outcome,"exported"); assert.equal(exported.result.rows.length,3);
    assert.deepEqual(exported.result.rows.map((row)=>row.code),codes.map((row)=>row.code));
    assert.equal(exported.result.rows.every((row)=>Object.keys(row).sort().join(",")==="code,status" && /^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(row.code)),true);
    assert.equal(JSON.stringify(exported).includes(LINE),false);
    assert.equal(JSON.parse(appScalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_codes_csv_v1(${authorityArguments("analyst")},'${PRIMARY_BATCH}')`)).outcome,"membership_denied");

    const paged = []; let cursor = null; let snapshot = null;
    for (;;) {
      const page = batchList(box,"analyst",BATCH_PROMOTION,1,cursor);
      assert.equal(page.outcome,"listed"); snapshot ??= page.result.snapshotAt; assert.equal(page.result.snapshotAt,snapshot);
      paged.push(...page.result.items.map((item)=>item.id));
      if (!page.result.hasMore) { assert.equal(page.result.cursorAnchor,null); break; }
      assert.notEqual(page.result.cursorAnchor,null); cursor={snapshotAt:page.result.snapshotAt,...page.result.cursorAnchor};
    }
    assert.equal(new Set(paged).size,paged.length); assert.deepEqual(paged,listed.result.items.map((item)=>item.id));
    assert.equal(appScalar(box, `SELECT outcome FROM saas.promotion_code_batch_list_v1(${authorityArguments("analyst")},'${BATCH_PROMOTION}',1,'2026-09-05T00:00:10.000Z',NULL,NULL)`),"invalid_input");
    assert.equal(appScalar(box, `SELECT outcome FROM saas.promotion_code_batch_list_v1(${authorityArguments("analyst",STORE,PLAN,"2026-09-05T00:00:10.001001Z")},'${BATCH_PROMOTION}',1,NULL,NULL,NULL)`),"invalid_input");

    activate(box,BATCH_PROMOTION);
    assert.equal(evaluate(box,{submittedCodes:[used.code],customerId:secondCustomer}).discountTotalMinor,0);
    assert.equal(evaluate(box,{submittedCodes:[held.code],customerId:secondCustomer}).discountTotalMinor,0);
    assert.equal(evaluate(box,{submittedCodes:[remaining.code],customerId:null}).discountTotalMinor,0);
    assert.equal(evaluate(box,{submittedCodes:[remaining.code],customerId:LINE}).discountTotalMinor,0);
    assert.equal(evaluate(box,{submittedCodes:[remaining.code],customerId:secondCustomer}).discountTotalMinor,30);
    assert.equal(evaluate(box,{submittedCodes:[remaining.code],customerId:OTHER_PRODUCT}).discountTotalMinor,0);
    assert.equal(evaluate(box,{submittedCodes:["DIRECTREUSE"],customerId:LINE}).discountTotalMinor,30);
    assert.equal(evaluate(box,{submittedCodes:["DIRECTREUSE"],customerId:null}).discountTotalMinor,30);
    assert.equal(evaluate(box,{submittedCodes:[remaining.code],customerId:secondCustomer},"2026-09-05T01:00:00.000Z").discountTotalMinor,0);

    const proposed = structuredClone(JSON.parse(scalar(box, `SELECT rule_document FROM saas.promotions WHERE store_id='${STORE}' AND id='${BATCH_PROMOTION}'`)));
    proposed.trigger.codes=[used.code];
    assert.equal(JSON.parse(simulateSelected(box,"analyst",{id:BATCH_PROMOTION,expectedVersion:1,name:"Slice C code batches",ruleDocument:proposed},{submittedCodes:[used.code],customerId:secondCustomer})).result.evaluation.discountTotalMinor,0);
    proposed.trigger.codes=["SYNTHETIC"];
    assert.equal(JSON.parse(simulateSelected(box,"analyst",{id:BATCH_PROMOTION,expectedVersion:1,name:"Slice C code batches",ruleDocument:proposed},{submittedCodes:[remaining.code],customerId:secondCustomer})).result.evaluation.discountTotalMinor,30);
    assert.equal(JSON.parse(simulateSelected(box,"analyst",{id:BATCH_PROMOTION,expectedVersion:1,name:"Slice C code batches",ruleDocument:proposed},{submittedCodes:["SYNTHETIC"],customerId:null})).result.evaluation.discountTotalMinor,30);
    proposed.trigger.codes=[remaining.code];
    assert.equal(JSON.parse(simulateSelected(box,"analyst",{id:BATCH_PROMOTION,expectedVersion:1,name:"Slice C code batches",ruleDocument:proposed},{submittedCodes:[remaining.code],customerId:null})).result.evaluation.discountTotalMinor,0);
    const foreignBatchRule=validRuleDocument(); foreignBatchRule.trigger={kind:"code",codes:[remaining.code]}; psql(box,`UPDATE saas.promotions SET status='paused' WHERE store_id='${STORE}' AND id='${BATCH_PROMOTION}'`);
    assert.equal(JSON.parse(simulateSelected(box,"analyst",{id:"a1000000-0000-4000-8000-000000000081",expectedVersion:1,name:"Foreign batch owner simulation",ruleDocument:foreignBatchRule},{submittedCodes:[remaining.code],customerId:secondCustomer})).result.evaluation.discountTotalMinor,0);
    psql(box,`UPDATE saas.promotions SET status='active' WHERE store_id='${STORE}' AND id='${BATCH_PROMOTION}'`);
  });
  scenario("batch status ledger enforces terminal children and fails closed on corruption", () => {
    const permanentlyRevoked = scalar(box, `SELECT id FROM saas.promotion_codes WHERE store_id='${STORE}' AND batch_id='${PRIMARY_BATCH}' ORDER BY id LIMIT 1`);
    psql(box, `UPDATE saas.promotion_codes SET status='revoked' WHERE store_id='${STORE}' AND id='${permanentlyRevoked}'`);
    const paused = statusBatch(box,{operationId:"b5000000-0000-4000-8000-000000000126",batchId:PRIMARY_BATCH,expectedVersion:1,nextStatus:"paused",now:"2026-09-05T00:00:11.000Z"});
    assert.equal(paused.outcome,"updated"); assert.equal(paused.result.version,2); assert.equal(paused.result.status,"paused");
    assert.equal(scalar(box, `SELECT count(*) FILTER (WHERE status='paused')||':'||count(*) FILTER (WHERE status='revoked') FROM saas.promotion_codes WHERE store_id='${STORE}' AND batch_id='${PRIMARY_BATCH}'`),"2:1");
    assert.deepEqual(statusBatch(box,{operationId:"b5000000-0000-4000-8000-000000000126",batchId:PRIMARY_BATCH,expectedVersion:1,nextStatus:"paused",now:"2026-09-05T00:00:11.000Z"}),{outcome:"operation_replayed",result:paused.result});
    assert.equal(statusBatch(box,{operationId:"b5000000-0000-4000-8000-000000000127",batchId:PRIMARY_BATCH,expectedVersion:2,nextStatus:"active",now:"2026-09-05T00:00:10.000Z"}).outcome,"invalid_input");
    assert.equal(statusBatch(box,{operationId:"b5000000-0000-4000-8000-000000000128",batchId:PRIMARY_BATCH,expectedVersion:2,nextStatus:"paused",now:"2026-09-05T00:00:12.000Z"}).outcome,"invalid_transition");
    const active = statusBatch(box,{operationId:"b5000000-0000-4000-8000-000000000129",batchId:PRIMARY_BATCH,expectedVersion:2,nextStatus:"active",now:"2026-09-05T00:00:12.000Z"});
    assert.equal(active.outcome,"updated"); assert.equal(active.result.version,3); assert.equal(scalar(box, `SELECT count(*) FILTER (WHERE status='active')||':'||count(*) FILTER (WHERE status='revoked') FROM saas.promotion_codes WHERE store_id='${STORE}' AND batch_id='${PRIMARY_BATCH}'`),"2:1");
    const legacyPaused = JSON.parse(appScalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_code_batch_status_v1(${authorityArguments("store_owner",STORE,PLAN,"2026-09-05T00:00:13.123456Z")},'${PRIMARY_BATCH}','paused')`));
    assert.deepEqual(legacyPaused,{outcome:"updated",result:{id:PRIMARY_BATCH,status:"paused"}});
    assert.equal(scalar(box, `SELECT pg_catalog.to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM saas.promotion_code_batches WHERE store_id='${STORE}' AND id='${PRIMARY_BATCH}'`),"2026-09-05T00:00:13.123Z");
    const legacySameStateBefore=scalar(box,`SELECT version||':'||updated_at::text||':'||(SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id='${STORE}') FROM saas.promotion_code_batches WHERE store_id='${STORE}' AND id='${PRIMARY_BATCH}'`);
    const legacyPausedRetry = JSON.parse(appScalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_code_batch_status_v1(${authorityArguments("store_owner",STORE,PLAN,"2026-09-05T00:00:13.999999Z")},'${PRIMARY_BATCH}','paused')`));
    assert.deepEqual(legacyPausedRetry,{outcome:"updated",result:{id:PRIMARY_BATCH,status:"paused"}});
    assert.equal(scalar(box,`SELECT version||':'||updated_at::text||':'||(SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id='${STORE}') FROM saas.promotion_code_batches WHERE store_id='${STORE}' AND id='${PRIMARY_BATCH}'`),legacySameStateBefore);
    assert.equal(JSON.parse(appScalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_code_batch_status_v1(${authorityArguments("store_owner",STORE,PLAN,"2026-09-05T00:00:14.000Z")},'${PRIMARY_BATCH}','active')`)).outcome,"updated");
    const revoked = statusBatch(box,{operationId:"b5000000-0000-4000-8000-000000000130",batchId:PRIMARY_BATCH,expectedVersion:5,nextStatus:"revoked",now:"2026-09-05T00:00:15.000Z"});
    assert.equal(revoked.outcome,"updated"); assert.equal(revoked.result.version,6); assert.equal(scalar(box, `SELECT count(*) FILTER (WHERE status='revoked') FROM saas.promotion_codes WHERE store_id='${STORE}' AND batch_id='${PRIMARY_BATCH}'`),"3");
    const legacyRevokedBefore=scalar(box,`SELECT version||':'||updated_at::text||':'||(SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id='${STORE}') FROM saas.promotion_code_batches WHERE store_id='${STORE}' AND id='${PRIMARY_BATCH}'`);
    assert.deepEqual(JSON.parse(appScalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_code_batch_status_v1(${authorityArguments("store_owner",STORE,PLAN,"2026-09-05T00:00:15.999999Z")},'${PRIMARY_BATCH}','revoked')`)),{outcome:"updated",result:{id:PRIMARY_BATCH,status:"revoked"}});
    assert.equal(scalar(box,`SELECT version||':'||updated_at::text||':'||(SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id='${STORE}') FROM saas.promotion_code_batches WHERE store_id='${STORE}' AND id='${PRIMARY_BATCH}'`),legacyRevokedBefore);
    assert.equal(JSON.parse(appScalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_code_batch_status_v1(${authorityArguments("store_owner",STORE,PLAN,"2026-09-05T00:00:16.000Z")},'${PRIMARY_BATCH}','active')`)).outcome,"invalid_transition");
    assert.deepEqual(statusBatch(box,{operationId:"b5000000-0000-4000-8000-000000000126",batchId:PRIMARY_BATCH,expectedVersion:1,nextStatus:"paused",now:"2026-09-05T00:00:16.000Z"}),{outcome:"operation_replayed",result:paused.result});
    const pauseFingerprint=scalar(box,`SELECT saas.promotion_operation_fingerprint_v2('code_batch_status','${STORE}',pg_catalog.jsonb_build_object('batchId','${PRIMARY_BATCH}'::uuid,'expectedVersion',1,'nextStatus','paused'))`), corruptPausedResult={...paused.result,updatedAt:"2026-09-05T00:00:11.001Z"};
    psql(box,`BEGIN; SET LOCAL session_replication_role='replica'; UPDATE saas.promotion_operations SET result_payload='${JSON.stringify(corruptPausedResult)}'::jsonb WHERE store_id='${STORE}' AND operation_id='b5000000-0000-4000-8000-000000000126'; COMMIT`);
    assert.equal(statusBatch(box,{operationId:"b5000000-0000-4000-8000-000000000126",batchId:PRIMARY_BATCH,expectedVersion:1,nextStatus:"paused",now:"2026-09-05T00:00:16.000Z",fingerprint:pauseFingerprint}).outcome,"operation_result_invalid");
    assert.equal(JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_recover_operation_v1(${authorityArguments("store_owner",STORE,PLAN,"2026-09-05T00:00:16.000Z")},'b5000000-0000-4000-8000-000000000126','code_batch_status','${pauseFingerprint}')`)).outcome,"operation_result_invalid");
    psql(box,`BEGIN; SET LOCAL session_replication_role='replica'; UPDATE saas.promotion_operations SET result_payload='${JSON.stringify(paused.result)}'::jsonb WHERE store_id='${STORE}' AND operation_id='b5000000-0000-4000-8000-000000000126'; COMMIT`);
    psql(box,`UPDATE saas.promotion_code_batches SET updated_at='2026-09-05T00:00:10.000Z' WHERE store_id='${STORE}' AND id='${PRIMARY_BATCH}'`);
    assert.equal(statusBatch(box,{operationId:"b5000000-0000-4000-8000-000000000126",batchId:PRIMARY_BATCH,expectedVersion:1,nextStatus:"paused",now:"2026-09-05T00:00:16.000Z",fingerprint:pauseFingerprint}).outcome,"operation_result_invalid");
    assert.equal(JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_recover_operation_v1(${authorityArguments("store_owner",STORE,PLAN,"2026-09-05T00:00:16.000Z")},'b5000000-0000-4000-8000-000000000126','code_batch_status','${pauseFingerprint}')`)).outcome,"operation_result_invalid");
    psql(box,`UPDATE saas.promotion_code_batches SET updated_at='${revoked.result.updatedAt}' WHERE store_id='${STORE}' AND id='${PRIMARY_BATCH}'`);
    assert.deepEqual(statusBatch(box,{operationId:"b5000000-0000-4000-8000-000000000126",batchId:PRIMARY_BATCH,expectedVersion:1,nextStatus:"paused",now:"2026-09-05T00:00:16.000Z",fingerprint:pauseFingerprint}),{outcome:"operation_replayed",result:paused.result});
    const createFingerprint=batchCreateFingerprint(box,{promotionId:BATCH_PROMOTION,count:3,prefix:"SAFE_",codeLength:21,perCustomerUsage:2,expiresAt:"2026-09-05T01:00:00.000Z"});
    assert.equal(JSON.parse(appScalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_recover_operation_v1(${authorityArguments("store_owner",STORE,PLAN,"2026-09-05T00:00:16.000Z")},'${PRIMARY_BATCH_OPERATION}','code_batch','${createFingerprint}')`)).outcome,"operation_replayed");

    const corruptBatch="b3000000-0000-4000-8000-000000000129", corruptOperation="b4000000-0000-4000-8000-000000000128";
    const corruptCode=scalar(box,`SELECT id FROM saas.promotion_codes WHERE store_id='${STORE}' AND batch_id='${corruptBatch}'`);
    psql(box,`UPDATE saas.promotion_codes SET status='paused' WHERE store_id='${STORE}' AND id='${corruptCode}'`);
    const before=scalar(box,`SELECT version||':'||status||':'||(SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id='${STORE}') FROM saas.promotion_code_batches WHERE store_id='${STORE}' AND id='${corruptBatch}'`);
    assert.equal(statusBatch(box,{operationId:"b5000000-0000-4000-8000-000000000132",batchId:corruptBatch,expectedVersion:9007199254740991,nextStatus:"paused",now:"2026-09-05T00:00:17.000Z"}).outcome,"projection_unavailable");
    assert.equal(statusBatch(box,{operationId:"b5000000-0000-4000-8000-000000000133",batchId:corruptBatch,expectedVersion:1,nextStatus:"active",now:"2026-09-05T00:00:17.000Z"}).outcome,"projection_unavailable");
    assert.equal(statusBatch(box,{operationId:"b5000000-0000-4000-8000-000000000131",batchId:corruptBatch,expectedVersion:1,nextStatus:"paused",now:"2026-09-05T00:00:17.000Z"}).outcome,"projection_unavailable");
    assert.equal(JSON.parse(appScalar(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_code_batch_status_v1(${authorityArguments("store_owner",STORE,PLAN,"2026-09-05T00:00:17.000Z")},'${corruptBatch}','active')`)).outcome,"projection_unavailable");
    assert.equal(scalar(box,`SELECT version||':'||status||':'||(SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id='${STORE}') FROM saas.promotion_code_batches WHERE store_id='${STORE}' AND id='${corruptBatch}'`),before);
    assert.equal(batchList(box,"analyst",BATCH_PROMOTION).outcome,"projection_unavailable");
    assert.equal(JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_codes_csv_v1(${authorityArguments("store_owner")},'${corruptBatch}')`)).outcome,"projection_unavailable");
    const corruptFingerprint=batchCreateFingerprint(box,{promotionId:BATCH_PROMOTION,count:1,prefix:"END",codeLength:19,perCustomerUsage:1,expiresAt:"2026-09-05T02:00:00.000Z"});
    assert.equal(createBatch(box,{operationId:corruptOperation,batchId:corruptBatch,promotionId:BATCH_PROMOTION,count:1,prefix:"END",codeLength:19,perCustomerUsage:1,expiresAt:"2026-09-05T02:00:00.000Z",fingerprint:corruptFingerprint}).outcome,"operation_result_invalid");
    psql(box,`UPDATE saas.promotion_codes SET status='active' WHERE store_id='${STORE}' AND id='${corruptCode}'`);
    const corruptValue=scalar(box,`SELECT code FROM saas.promotion_codes WHERE store_id='${STORE}' AND id='${corruptCode}'`);
    psql(box,`UPDATE saas.promotion_code_batches SET requested_count=2 WHERE store_id='${STORE}' AND id='${corruptBatch}'`);
    const corruptEvaluation=evaluate(box,{submittedCodes:[corruptValue],customerId:LINE},"2026-09-05T00:00:17.000Z");
    assert.equal(corruptEvaluation.discountTotalMinor,0); assert.equal(corruptEvaluation.appliedPromotions.some((item)=>item.promotionId===BATCH_PROMOTION),false);
    const corruptSelected=JSON.parse(scalar(box,`SELECT saas.promotion_evaluate_internal_v1('${STORE}','${JSON.stringify(context({submittedCodes:[corruptValue],customerId:LINE})).replaceAll("'","''")}'::jsonb,'2026-09-05T00:00:17.000Z',pg_catalog.jsonb_build_object('id','${BATCH_PROMOTION}'::uuid,'expectedVersion',1,'name','Corrupt batch cannot synthesize','ruleDocument',pg_catalog.jsonb_set((SELECT rule_document FROM saas.promotions WHERE store_id='${STORE}' AND id='${BATCH_PROMOTION}'),'{trigger,codes}',pg_catalog.jsonb_build_array('${corruptValue}'))))`));
    assert.equal(corruptSelected.discountTotalMinor,0); assert.equal(corruptSelected.appliedPromotions.some((item)=>item.promotionId===BATCH_PROMOTION),false);
    psql(box,`UPDATE saas.promotion_code_batches SET requested_count=1 WHERE store_id='${STORE}' AND id='${corruptBatch}'`);
    psql(box,`UPDATE saas.promotion_code_batches SET per_customer_usage=3 WHERE store_id='${STORE}' AND id='${PRIMARY_BATCH}'`);
    assert.equal(createBatch(box,{operationId:PRIMARY_BATCH_OPERATION,batchId:PRIMARY_BATCH,promotionId:BATCH_PROMOTION,count:3,prefix:"SAFE_",codeLength:21,perCustomerUsage:2,expiresAt:"2026-09-05T01:00:00.000Z",fingerprint:createFingerprint}).outcome,"operation_result_invalid");
    psql(box,`UPDATE saas.promotion_code_batches SET per_customer_usage=2 WHERE store_id='${STORE}' AND id='${PRIMARY_BATCH}'`);
    assert.equal(scalar(box,`SELECT saas.promotion_code_batch_result_matches_v1('${STORE}','${PRIMARY_BATCH_OPERATION}','code_batch','{"id":"bad"}'::jsonb)`),"f");

    const oldFingerprint=scalar(box,`SELECT saas.promotion_operation_fingerprint_v2('code_batch','${STORE}',pg_catalog.jsonb_build_object('promotionId','${BATCH_PROMOTION}'::uuid,'count',1,'prefix','OLD'))`);
    psql(box,`DELETE FROM saas.promotion_codes WHERE store_id='${STORE}' AND batch_id='${OLD_BATCH}'; DELETE FROM saas.promotion_code_batches WHERE store_id='${STORE}' AND id='${OLD_BATCH}'`);
    const missing=JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_create_code_batch_v1(${authorityArguments("store_owner")},'b4000000-0000-4000-8000-000000000129','${oldFingerprint}','${OLD_BATCH}','${BATCH_PROMOTION}',1,'OLD')`));
    assert.deepEqual(missing,{outcome:"operation_result_invalid",result:null});
  });
  scenario("archive terminally revokes code domains while retaining exports holds and historical replay", () => {
    const promotion="d1000000-0000-4000-8000-000000000126", createOperation="d2000000-0000-4000-8000-000000000126", batch="d3000000-0000-4000-8000-000000000126", batchOperation="d4000000-0000-4000-8000-000000000126";
    const document=validRuleDocument(); document.trigger={kind:"code",codes:["ARCHDIRECT"]};
    assert.equal(appScalar(box,createCall(box,"store_owner",promotion,createOperation,"Archived code history",document)),`created:${promotion}`);
    const created=createBatch(box,{operationId:batchOperation,batchId:batch,promotionId:promotion,count:2,prefix:"ARCH_",codeLength:21,perCustomerUsage:1,expiresAt:"2026-09-06T00:00:00.000Z"});
    assert.equal(created.outcome,"created");
    const code=JSON.parse(scalar(box,`SELECT pg_catalog.jsonb_build_object('id',id,'code',code) FROM saas.promotion_codes WHERE store_id='${STORE}' AND batch_id='${batch}' ORDER BY id LIMIT 1`));
    insertReservationFixture(box,{operationId:"d5000000-0000-4000-8000-000000000126",reservationId:"d6000000-0000-4000-8000-000000000126",promotionId:promotion,codeId:code.id,normalizedCode:code.code,customerId:LINE,fingerprintCharacter:"4"});
    assert.equal(appScalar(box,lifecycleCall(box,"store_owner",promotion,"d7000000-0000-4000-8000-000000000126",1,"archived","2026-09-05T00:00:20.123456Z")),`updated:${promotion}`);
    assert.equal(scalar(box,`SELECT status||':'||version||':'||pg_catalog.to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM saas.promotion_code_batches WHERE store_id='${STORE}' AND id='${batch}'`),"revoked:2:2026-09-05T00:00:20.123Z");
    assert.equal(scalar(box,`SELECT count(*) FILTER (WHERE status='revoked')||':'||count(*) FROM saas.promotion_codes WHERE store_id='${STORE}' AND promotion_id='${promotion}'`),"3:3");
    assert.equal(scalar(box,`SELECT status FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND id='d6000000-0000-4000-8000-000000000126'`),"reserved");
    const archivedList=batchList(box,"analyst",promotion,100,null,"2026-09-05T00:00:30.000Z");
    assert.equal(archivedList.outcome,"listed"); assert.deepEqual({status:archivedList.result.items[0].status,held:archivedList.result.items[0].held,remaining:archivedList.result.items[0].remaining},{status:"revoked",held:1,remaining:0});
    const csv=JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_codes_csv_v1(${authorityArguments("store_owner",STORE,PLAN,"2026-09-05T00:00:30.000Z")},'${batch}')`));
    assert.equal(csv.outcome,"exported"); assert.equal(csv.result.rows.length,2); assert.equal(csv.result.rows.every((row)=>row.status==="revoked"),true);
    assert.equal(listPage(box,"analyst",{search:"Archived code history",limit:1},null,"2026-09-05T00:00:30.000Z").items[0].activeCodeCount,0);
    assert.equal(createBatch(box,{operationId:"d4000000-0000-4000-8000-000000000127",batchId:"d3000000-0000-4000-8000-000000000127",promotionId:promotion,count:1,prefix:"NO",codeLength:18,perCustomerUsage:1,now:"2026-09-05T00:00:30.000Z"}).outcome,"not_found");
    assert.equal(statusBatch(box,{operationId:"d8000000-0000-4000-8000-000000000126",batchId:batch,expectedVersion:2,nextStatus:"active",now:"2026-09-05T00:00:30.000Z"}).outcome,"invalid_transition");
    const replay=createBatch(box,{operationId:batchOperation,batchId:batch,promotionId:promotion,count:2,prefix:"ARCH_",codeLength:21,perCustomerUsage:1,expiresAt:"2026-09-06T00:00:00.000Z",now:"2026-09-05T00:00:30.000Z"});
    assert.equal(replay.outcome,"operation_replayed"); assert.deepEqual(replay.result,created.result);
  });
  await asyncScenario("batch UUID code-domain and direct-code races serialize without leaks or partial rows", async () => {
    const retriedBatch="e3000000-0000-4000-8000-000000000120", retriedOperation="e4000000-0000-4000-8000-000000000120";
    psql(box,`CREATE SEQUENCE saas.promotion_codes_slice_c_retry_sequence;
      CREATE FUNCTION saas.promotion_codes_slice_c_retry_once() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
      BEGIN
        IF NEW.batch_id='${retriedBatch}'::uuid AND pg_catalog.nextval('saas.promotion_codes_slice_c_retry_sequence')=1 THEN NEW.code='DIRECTREUSE'; END IF;
        RETURN NEW;
      END $fn$;
      CREATE TRIGGER promotion_codes_slice_c_retry_once BEFORE INSERT ON saas.promotion_codes FOR EACH ROW EXECUTE FUNCTION saas.promotion_codes_slice_c_retry_once()`);
    const retried=createBatch(box,{operationId:retriedOperation,batchId:retriedBatch,promotionId:BATCH_PROMOTION,count:1,prefix:"RETRY",codeLength:21,perCustomerUsage:1,now:"2026-09-05T00:00:30.000Z"});
    assert.equal(retried.outcome,"created");
    assert.equal(scalar(box,`SELECT last_value||':'||(SELECT count(*) FROM saas.promotion_codes WHERE store_id='${STORE}' AND batch_id='${retriedBatch}' AND code~'^RETRY[A-F0-9]{16}$') FROM saas.promotion_codes_slice_c_retry_sequence`),"2:1");
    psql(box,`DROP TRIGGER promotion_codes_slice_c_retry_once ON saas.promotion_codes; DROP FUNCTION saas.promotion_codes_slice_c_retry_once(); DROP SEQUENCE saas.promotion_codes_slice_c_retry_sequence`);

    const failedBatch="e3000000-0000-4000-8000-000000000126", failedOperation="e4000000-0000-4000-8000-000000000126";
    psql(box,`CREATE UNIQUE INDEX promotion_codes_slice_c_unrelated_unique ON saas.promotion_codes((1)) WHERE batch_id='${failedBatch}'`);
    const failedFingerprint=batchCreateFingerprint(box,{promotionId:BATCH_PROMOTION,count:2,prefix:"FAIL",codeLength:20,perCustomerUsage:1});
    const failed=psql(box,`SET ROLE celebix_saas_app; SELECT outcome FROM saas.promotion_create_code_batch_v1(${authorityArguments("store_owner",STORE,PLAN,"2026-09-05T00:00:31.000Z")},'${failedOperation}','${failedFingerprint}','${failedBatch}','${BATCH_PROMOTION}',2,'FAIL',20,1,NULL);`,DB,true);
    assert.notEqual(failed.status,0); assert.match(failed.stderr,/promotion_codes_slice_c_unrelated_unique/);
    psql(box,`DROP INDEX saas.promotion_codes_slice_c_unrelated_unique`);
    assert.equal(scalar(box,`SELECT (SELECT count(*) FROM saas.promotion_code_batches WHERE id='${failedBatch}')||':'||(SELECT count(*) FROM saas.promotion_codes WHERE batch_id='${failedBatch}')||':'||(SELECT count(*) FROM saas.promotion_operations WHERE operation_id='${failedOperation}')`),"0:0:0");

    const failedBatchRow="e3000000-0000-4000-8000-000000000125", failedBatchRowOperation="e4000000-0000-4000-8000-000000000125";
    psql(box,`CREATE UNIQUE INDEX promotion_code_batches_slice_c_unrelated_unique ON saas.promotion_code_batches(store_id) WHERE prefix IN ('RETRY','ROWFAIL')`);
    const failedBatchRowFingerprint=batchCreateFingerprint(box,{promotionId:BATCH_PROMOTION,count:1,prefix:"ROWFAIL",codeLength:23,perCustomerUsage:1});
    const failedBatchInsert=psql(box,`SET ROLE celebix_saas_app; SELECT outcome FROM saas.promotion_create_code_batch_v1(${authorityArguments("store_owner",STORE,PLAN,"2026-09-05T00:00:31.000Z")},'${failedBatchRowOperation}','${failedBatchRowFingerprint}','${failedBatchRow}','${BATCH_PROMOTION}',1,'ROWFAIL',23,1,NULL);`,DB,true);
    assert.notEqual(failedBatchInsert.status,0); assert.match(failedBatchInsert.stderr,/promotion_code_batches_slice_c_unrelated_unique/);
    psql(box,`DROP INDEX saas.promotion_code_batches_slice_c_unrelated_unique`);
    assert.equal(scalar(box,`SELECT (SELECT count(*) FROM saas.promotion_code_batches WHERE id='${failedBatchRow}')||':'||(SELECT count(*) FROM saas.promotion_codes WHERE batch_id='${failedBatchRow}')||':'||(SELECT count(*) FROM saas.promotion_operations WHERE operation_id='${failedBatchRowOperation}')||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE id='${failedBatchRowOperation}')`),"0:0:0:0");

    const racedDocument=JSON.parse(scalar(box,`SELECT rule_document FROM saas.promotions WHERE store_id='${STORE}' AND id='${BATCH_PROMOTION}'`)); racedDocument.trigger.codes=["DIRECTRACE"];
    const updateSource=`SET application_name='slice_c_direct_race'; SET ROLE celebix_saas_app; ${updateCall(box,"store_owner",BATCH_PROMOTION,"e4000000-0000-4000-8000-000000000127",1,"Slice C direct race",racedDocument,"2026-09-05T00:00:31.000Z")}; RESET ROLE`;
    const racedBatch="e3000000-0000-4000-8000-000000000127", racedOperation="e4000000-0000-4000-8000-000000000128", racedFingerprint=batchCreateFingerprint(box,{promotionId:BATCH_PROMOTION,count:2,prefix:"RACE",codeLength:20,perCustomerUsage:1});
    const batchSource=`SET application_name='slice_c_batch_race'; SET ROLE celebix_saas_app; SELECT outcome FROM saas.promotion_create_code_batch_v1(${authorityArguments("store_owner",STORE,PLAN,"2026-09-05T00:00:31.000Z")},'${racedOperation}','${racedFingerprint}','${racedBatch}','${BATCH_PROMOTION}',2,'RACE',20,1,NULL); RESET ROLE`;
    const [updated,batched]=await Promise.all([psqlAsync(box,updateSource),psqlAsync(box,batchSource)]);
    assert.equal(updated.status,0,updated.stderr); assert.equal(batched.status,0,batched.stderr);
    assert.match(updated.stdout,/updated:/); assert.equal(batched.stdout.trim(),"created");
    assert.equal(scalar(box,`SELECT (SELECT count(*) FROM saas.promotion_codes WHERE store_id='${STORE}' AND promotion_id='${BATCH_PROMOTION}' AND batch_id IS NULL AND code='DIRECTRACE' AND status='active')||':'||(SELECT count(*) FROM saas.promotion_codes WHERE store_id='${STORE}' AND batch_id='${racedBatch}')`),"1:2");

    const legacyRaceBatch="e3000000-0000-4000-8000-000000000133";
    assert.equal(createBatch(box,{operationId:"e4000000-0000-4000-8000-000000000133",batchId:legacyRaceBatch,promotionId:BATCH_PROMOTION,count:1,prefix:"STATE",codeLength:21,perCustomerUsage:1,now:"2026-09-05T00:00:31.100Z"}).outcome,"created");
    assert.equal(statusBatch(box,{operationId:"e5000000-0000-4000-8000-000000000133",batchId:legacyRaceBatch,expectedVersion:1,nextStatus:"paused",now:"2026-09-05T00:00:31.200Z"}).outcome,"updated");
    const legacyRaceBefore=JSON.parse(scalar(box,`SELECT pg_catalog.jsonb_build_object('version',batch.version,'operations',(SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}'),'audits',(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id='${STORE}')) FROM saas.promotion_code_batches batch WHERE store_id='${STORE}' AND id='${legacyRaceBatch}'`));
    const legacyRaceBlocker=openPsqlSession(box);
    try {
      legacyRaceBlocker.write(`BEGIN; SELECT 1 FROM saas.promotion_code_batches WHERE store_id='${STORE}' AND id='${legacyRaceBatch}' FOR UPDATE; SELECT 'SLICE_C_LEGACY_STATUS_BARRIER';\n`);
      await legacyRaceBlocker.waitFor(/SLICE_C_LEGACY_STATUS_BARRIER/);
      const legacyRaceFingerprint=scalar(box,`SELECT saas.promotion_operation_fingerprint_v2('code_batch_status','${STORE}',pg_catalog.jsonb_build_object('batchId','${legacyRaceBatch}'::uuid,'expectedVersion',2,'nextStatus','revoked'))`);
      const revokePending=psqlAsync(box,`SET application_name='slice_c_legacy_status_revoke'; SET ROLE celebix_saas_app; SELECT outcome FROM saas.promotion_code_batch_status_v1(${authorityArguments("store_owner",STORE,PLAN,"2026-09-05T00:00:31.300Z")},'e5000000-0000-4000-8000-000000000134','${legacyRaceFingerprint}','${legacyRaceBatch}',2,'revoked'); RESET ROLE`);
      await waitForScalar(box,`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name='slice_c_legacy_status_revoke' AND wait_event_type='Lock')`,"t");
      const sameStatePending=psqlAsync(box,`SET application_name='slice_c_legacy_status_same'; SET ROLE celebix_saas_app; SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_code_batch_status_v1(${authorityArguments("store_owner",STORE,PLAN,"2026-09-05T00:00:31.400Z")},'${legacyRaceBatch}','paused'); RESET ROLE`);
      await waitForScalar(box,`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name='slice_c_legacy_status_same' AND wait_event_type='Lock')`,"t");
      legacyRaceBlocker.end("COMMIT;\n");
      const [blocked,revokeResult,sameStateResult]=await Promise.all([legacyRaceBlocker.completion,revokePending,sameStatePending]);
      assert.equal(blocked.status,0,blocked.stderr); assert.equal(revokeResult.status,0,revokeResult.stderr); assert.equal(sameStateResult.status,0,sameStateResult.stderr);
      assert.equal(revokeResult.stdout.trim(),"updated");
      assert.deepEqual(JSON.parse(sameStateResult.stdout.trim()),{outcome:"invalid_transition",result:null});
    } finally { if (!legacyRaceBlocker.child.killed && legacyRaceBlocker.child.exitCode===null) legacyRaceBlocker.end("ROLLBACK;\n"); }
    const legacyRaceAfter=JSON.parse(scalar(box,`SELECT pg_catalog.jsonb_build_object('version',batch.version,'operations',(SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}'),'audits',(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id='${STORE}'),'revokedChildren',(SELECT count(*) FROM saas.promotion_codes WHERE store_id='${STORE}' AND batch_id='${legacyRaceBatch}' AND status='revoked')) FROM saas.promotion_code_batches batch WHERE store_id='${STORE}' AND id='${legacyRaceBatch}'`));
    assert.deepEqual(legacyRaceAfter,{version:legacyRaceBefore.version+1,operations:legacyRaceBefore.operations+1,audits:legacyRaceBefore.audits+1,revokedChildren:1});
    const authorityRaceBefore=scalar(box,`SELECT version||':'||status||':'||(SELECT pg_catalog.string_agg(status,',' ORDER BY id) FROM saas.promotion_codes WHERE store_id='${STORE}' AND batch_id='${legacyRaceBatch}')||':'||(SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id='${STORE}') FROM saas.promotion_code_batches WHERE store_id='${STORE}' AND id='${legacyRaceBatch}'`), authorityRaceBlocker=openPsqlSession(box);
    try {
      authorityRaceBlocker.write(`BEGIN; SELECT 1 FROM saas.promotion_code_batches WHERE store_id='${STORE}' AND id='${legacyRaceBatch}' FOR UPDATE; SELECT 'SLICE_C_LEGACY_AUTHORITY_BARRIER';\n`);
      await authorityRaceBlocker.waitFor(/SLICE_C_LEGACY_AUTHORITY_BARRIER/);
      const authorityPending=psqlAsync(box,`SET application_name='slice_c_legacy_status_authority'; SET ROLE celebix_saas_app; SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_code_batch_status_v1(${authorityArguments("waiting",STORE,PLAN,"2026-09-05T00:00:31.500Z")},'${legacyRaceBatch}','revoked'); RESET ROLE`);
      await waitForScalar(box,`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name='slice_c_legacy_status_authority' AND wait_event_type='Lock')`,"t");
      psql(box,`UPDATE saas.memberships SET status='revoked',updated_at='2026-09-05T00:00:31.500Z' WHERE id='${ACTORS.waiting.membership}'`);
      authorityRaceBlocker.end("COMMIT;\n");
      const [blocked,authorityResult]=await Promise.all([authorityRaceBlocker.completion,authorityPending]);
      assert.equal(blocked.status,0,blocked.stderr); assert.equal(authorityResult.status,0,authorityResult.stderr);
      assert.deepEqual(JSON.parse(authorityResult.stdout.trim()),{outcome:"membership_denied",result:null});
    } finally { if (!authorityRaceBlocker.child.killed && authorityRaceBlocker.child.exitCode===null) authorityRaceBlocker.end("ROLLBACK;\n"); }
    assert.equal(scalar(box,`SELECT version||':'||status||':'||(SELECT pg_catalog.string_agg(status,',' ORDER BY id) FROM saas.promotion_codes WHERE store_id='${STORE}' AND batch_id='${legacyRaceBatch}')||':'||(SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}')||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id='${STORE}') FROM saas.promotion_code_batches WHERE store_id='${STORE}' AND id='${legacyRaceBatch}'`),authorityRaceBefore);
    psql(box,`UPDATE saas.memberships SET status='active',updated_at='2026-09-05T00:00:31.501Z' WHERE id='${ACTORS.waiting.membership}'`);

    psql(box,`ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable; UPDATE saas.plan_features SET enabled=true WHERE plan_id='${DISABLED_PLAN}' AND feature_key='promotions'; ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable;`);
    const otherPromotion="e1000000-0000-4000-8000-000000000126", otherRule=validRuleDocument(); otherRule.trigger={kind:"code",codes:["OTHERDIRECT"]};
    psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${otherPromotion}','${OTHER_STORE}','Other batch UUID','draft',1,'${JSON.stringify(otherRule)}','2026-09-05T00:00:31.000Z','2026-09-05T00:00:31.000Z'); INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES('e2000000-0000-4000-8000-000000000126','${OTHER_STORE}','${otherPromotion}',1,'${JSON.stringify(otherRule)}','2026-09-05T00:00:31.000Z'); INSERT INTO saas.promotion_codes(id,store_id,promotion_id,code,status,created_at) VALUES('e2000000-0000-4000-8000-000000000127','${OTHER_STORE}','${otherPromotion}','OTHERDIRECT','active','2026-09-05T00:00:31.000Z')`);
    const sharedBatch="e3000000-0000-4000-8000-000000000128", mainOperation="e4000000-0000-4000-8000-000000000129", otherOperation="e4000000-0000-4000-8000-000000000130";
    const mainFingerprint=batchCreateFingerprint(box,{promotionId:BATCH_PROMOTION,count:1,prefix:"GLOBAL",codeLength:22,perCustomerUsage:1});
    const otherFingerprint=scalar(box,`SELECT saas.promotion_operation_fingerprint_v2('code_batch','${OTHER_STORE}',pg_catalog.jsonb_build_object('promotionId','${otherPromotion}'::uuid,'count',1,'prefix','GLOBAL','codeLength',22,'perCustomerUsage',1,'expiresAt',NULL))`);
    const mainCall=psqlAsync(box,`SET application_name='slice_c_global_main'; SET ROLE celebix_saas_app; SELECT outcome FROM saas.promotion_create_code_batch_v1(${authorityArguments("store_owner",STORE,PLAN,"2026-09-05T00:00:32.000Z")},'${mainOperation}','${mainFingerprint}','${sharedBatch}','${BATCH_PROMOTION}',1,'GLOBAL',22,1,NULL); RESET ROLE`);
    const otherCall=psqlAsync(box,`SET application_name='slice_c_global_other'; SET ROLE celebix_saas_app; SELECT outcome FROM saas.promotion_create_code_batch_v1(${authorityArguments("other",OTHER_STORE,DISABLED_PLAN,"2026-09-05T00:00:32.000Z")},'${otherOperation}','${otherFingerprint}','${sharedBatch}','${otherPromotion}',1,'GLOBAL',22,1,NULL); RESET ROLE`);
    const globalResults=await Promise.all([mainCall,otherCall]);
    globalResults.forEach((result)=>assert.equal(result.status,0,result.stderr));
    assert.deepEqual(globalResults.map((result)=>result.stdout.trim()).sort(),["code_conflict","created"]);
    assert.equal(scalar(box,`SELECT (SELECT count(*) FROM saas.promotion_code_batches WHERE id='${sharedBatch}')||':'||(SELECT count(*) FROM saas.promotion_operations WHERE operation_id IN ('${mainOperation}','${otherOperation}'))`),"1:1");
  });
  scenario("batch reads and mutations hide cross-store identities and preserve zero mutation", () => {
    const operation="e4000000-0000-4000-8000-000000000140", batch="e3000000-0000-4000-8000-000000000140";
    const before=scalar(box,`SELECT (SELECT count(*) FROM saas.promotion_operations WHERE store_id='${OTHER_STORE}')||':'||(SELECT version||':'||status FROM saas.promotion_code_batches WHERE store_id='${STORE}' AND id='${PRIMARY_BATCH}')`);
    assert.equal(batchList(box,"other",BATCH_PROMOTION,10,null,"2026-09-05T00:00:33.000Z",OTHER_STORE,DISABLED_PLAN).outcome,"not_found");
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_codes_csv_v1(${authorityArguments("other",OTHER_STORE,DISABLED_PLAN,"2026-09-05T00:00:33.000Z")},'${PRIMARY_BATCH}')`),"not_found");
    assert.equal(statusBatch(box,{role:"other",operationId:operation,batchId:PRIMARY_BATCH,expectedVersion:6,nextStatus:"paused",now:"2026-09-05T00:00:33.000Z",store:OTHER_STORE,plan:DISABLED_PLAN}).outcome,"not_found");
    assert.equal(createBatch(box,{role:"other",operationId:"e4000000-0000-4000-8000-000000000141",batchId:batch,promotionId:BATCH_PROMOTION,count:1,prefix:"HIDE",codeLength:20,perCustomerUsage:1,now:"2026-09-05T00:00:33.000Z",store:OTHER_STORE,plan:DISABLED_PLAN}).outcome,"not_found");
    assert.equal(scalar(box,`SELECT (SELECT count(*) FROM saas.promotion_operations WHERE store_id='${OTHER_STORE}')||':'||(SELECT version||':'||status FROM saas.promotion_code_batches WHERE store_id='${STORE}' AND id='${PRIMARY_BATCH}')`),before);
    assert.equal(scalar(box,`SELECT count(*) FROM saas.promotion_code_batches WHERE id='${batch}'`),"0");
  });
  scenario("legacy classifier reasons and millisecond keyset projection are exact and bounded", () => {
    const rows=[
      ["f1000000-0000-4000-8000-000000000126","Legacy eligible",{discountType:"percent",value:1.0}],
      ["f1000000-0000-4000-8000-000000000127","Legacy unsupported",{discountType:"bogus",value:1}],
      ["f1000000-0000-4000-8000-000000000128","Legacy bad value",{discountType:"percent",value:"1e100000"}],
      ["f1000000-0000-4000-8000-000000000129","Legacy bad minimum",{discountType:"fixed",value:1,minimumOrderCents:1.5}],
      ["f1000000-0000-4000-8000-000000000130","Legacy bad usage",{discountType:"fixed",value:1,usageLimit:1000000001}],
      ["f1000000-0000-4000-8000-000000000131","Legacy bad code",{discountType:"fixed",value:1,code:"=FORMULA"}],
      ["f1000000-0000-4000-8000-000000000132","Legacy conflict",{discountType:"fixed",value:1,code:"DIRECTRACE"}],
      ["f1000000-0000-4000-8000-000000000133","Legacy invalid record",{discountType:"percent"}],
      ["f1000000-0000-4000-8000-000000000134","Legacy trailing percent",{discountType:"percent",value:"12.340"}],
      ["f1000000-0000-4000-8000-000000000135","Legacy sub-bps percent",{discountType:"percent",value:"12.345"}],
      ["f1000000-0000-4000-8000-000000000136","Legacy string minimum",{discountType:"fixed",value:1,minimumOrderCents:"1.0"}],
      ["f1000000-0000-4000-8000-000000000137","Legacy string usage",{discountType:"fixed",value:1,usageLimit:"1"}],
      ["f1000000-0000-4000-8000-000000000141","Legacy archived status",{discountType:"fixed",value:1,code:"ARCHIVEDRESERVED"}],
      ["f1000000-0000-4000-8000-000000000142","Legacy archived sibling conflict",{discountType:"fixed",value:1,code:"ARCHIVEDRESERVED"}],
    ];
    psql(box,`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES ${rows.map(([id,name,config],index)=>`('${id}','${STORE}','discount','${name}','${JSON.stringify(config)}'::jsonb,'active',1,'2026-09-04T12:00:00.123${String(100+index).padStart(3,"0")}Z','2026-09-04T12:00:00.123${String(100+index).padStart(3,"0")}Z')`).join(",")}; UPDATE saas.merchant_admin_records SET status='archived',archived_at=updated_at WHERE store_id='${STORE}' AND id='f1000000-0000-4000-8000-000000000141'`);
    psql(box,`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES
      ('f1000000-0000-4000-8000-000000000138','${STORE}','discount','Legacy positive infinity','{"discountType":"fixed","value":1}'::jsonb,'active',1,'infinity','infinity'),
      ('f1000000-0000-4000-8000-000000000139','${STORE}','discount','Legacy negative infinity','{"discountType":"fixed","value":1}'::jsonb,'active',1,'-infinity','-infinity')`);
    assert.equal(scalar(box,`SELECT saas.promotion_adopt_legacy_discounts_v1('${STORE}','2026-09-05T00:00:40.000Z')`),"2");
    assert.equal(scalar(box,`SELECT count(*) FROM saas.promotions WHERE store_id='${STORE}' AND legacy_record_id='f1000000-0000-4000-8000-000000000126'`),"1");
    psql(box,`UPDATE saas.merchant_admin_records SET status='archived',archived_at='2026-09-05T00:00:40.000Z',updated_at='2026-09-05T00:00:40.000Z' WHERE store_id='${STORE}' AND id='f1000000-0000-4000-8000-000000000126'`);
    const expectedReasons={
      "f1000000-0000-4000-8000-000000000126":"adopted",
      "f1000000-0000-4000-8000-000000000127":"unsupported_discount_type",
      "f1000000-0000-4000-8000-000000000128":"invalid_value",
      "f1000000-0000-4000-8000-000000000129":"invalid_minimum_order",
      "f1000000-0000-4000-8000-000000000130":"invalid_usage_limit",
      "f1000000-0000-4000-8000-000000000131":"invalid_code",
      "f1000000-0000-4000-8000-000000000132":"code_conflict",
      "f1000000-0000-4000-8000-000000000133":"invalid_legacy_record",
      "f1000000-0000-4000-8000-000000000134":"adopted",
      "f1000000-0000-4000-8000-000000000135":"invalid_value",
      "f1000000-0000-4000-8000-000000000136":"invalid_minimum_order",
      "f1000000-0000-4000-8000-000000000137":"invalid_usage_limit",
      "f1000000-0000-4000-8000-000000000138":"invalid_legacy_record",
      "f1000000-0000-4000-8000-000000000139":"invalid_legacy_record",
      "f1000000-0000-4000-8000-000000000141":"invalid_legacy_record",
      "f1000000-0000-4000-8000-000000000142":"code_conflict",
    };
    assert.equal(scalar(box,`SELECT rule_document->'benefit'->>'percentageBps' FROM saas.promotions WHERE store_id='${STORE}' AND legacy_record_id='f1000000-0000-4000-8000-000000000134'`),"1234");
    assert.equal(scalar(box,`SELECT count(*) FROM saas.promotions WHERE store_id='${STORE}' AND legacy_record_id IN ('f1000000-0000-4000-8000-000000000138','f1000000-0000-4000-8000-000000000139')`),"0");
    const snapshotRecord="f1000000-0000-4000-8000-000000000190", postSnapshotRecord="f1000000-0000-4000-8000-000000000180";
    psql(box,`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES('${snapshotRecord}','${STORE}','discount','Legacy snapshot anchor','{"discountType":"percent"}'::jsonb,'active',1,'2026-09-05T00:00:40.000Z','2026-09-05T00:00:40.000Z')`);
    const snapshotPage=JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_legacy_list_v1(${authorityArguments("analyst",STORE,PLAN,"2026-09-05T00:00:40.000Z")},1,NULL,NULL,NULL)`)); assert.equal(snapshotPage.outcome,"listed"); assert.deepEqual(snapshotPage.result.items.map((item)=>item.legacyRecordId),[snapshotRecord]);
    psql(box,`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES('${postSnapshotRecord}','${STORE}','discount','Legacy post snapshot','{"discountType":"percent"}'::jsonb,'active',1,'2026-09-05T00:00:40.000500Z','2026-09-05T00:00:40.000500Z')`);
    const afterSnapshot=JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_legacy_list_v1(${authorityArguments("analyst",STORE,PLAN,"2026-09-05T00:00:41.000Z")},100,'${snapshotPage.result.snapshotAt}','${snapshotPage.result.cursorAnchor.createdAt}','${snapshotPage.result.cursorAnchor.id}')`)); assert.equal(afterSnapshot.outcome,"listed"); assert.equal(afterSnapshot.result.items.some((item)=>item.legacyRecordId===postSnapshotRecord),false);
    const all=[]; let cursor=null; let snapshot=null;
    for (;;) {
      const values=cursor===null?"NULL::timestamptz,NULL::timestamptz,NULL::uuid":`'${cursor.snapshotAt}'::timestamptz,'${cursor.createdAt}'::timestamptz,'${cursor.id}'::uuid`;
      const page=JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_legacy_list_v1(${authorityArguments("analyst",STORE,PLAN,"2026-09-05T00:00:40.000Z")},2,${values})`));
      assert.equal(page.outcome,"listed"); snapshot??=page.result.snapshotAt; assert.equal(page.result.snapshotAt,snapshot); all.push(...page.result.items);
      if (!page.result.hasMore) { assert.equal(page.result.cursorAnchor,null); break; }
      cursor={snapshotAt:page.result.snapshotAt,...page.result.cursorAnchor};
    }
    const selected=all.filter((item)=>item.legacyRecordId in expectedReasons);
    assert.equal(selected.length,Object.keys(expectedReasons).length); assert.equal(new Set(selected.map((item)=>item.legacyRecordId)).size,Object.keys(expectedReasons).length);
    for (const item of selected) { assert.deepEqual(Object.keys(item).sort(),["legacyRecordId","promotionId","reason"].sort()); assert.equal(item.reason,expectedReasons[item.legacyRecordId]); assert.equal(item.reason==="adopted",item.promotionId!==null); }
    const adoptedResolution=JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_legacy_resolve_v1(${authorityArguments("analyst",STORE,PLAN,"2026-09-05T00:00:40.000Z")},'f1000000-0000-4000-8000-000000000134')`));
    assert.equal(adoptedResolution.outcome,"resolved"); assert.equal(adoptedResolution.result.legacyRecordId,"f1000000-0000-4000-8000-000000000134"); assert.equal(adoptedResolution.result.reason,"adopted"); assert.notEqual(adoptedResolution.result.promotionId,null);
    assert.deepEqual(JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_legacy_resolve_v1(${authorityArguments("analyst",STORE,PLAN,"2026-09-05T00:00:40.000Z")},'f1000000-0000-4000-8000-000000000131')`)),{outcome:"resolved",result:{legacyRecordId:"f1000000-0000-4000-8000-000000000131",promotionId:null,reason:"invalid_code"}});
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_legacy_resolve_v1(${authorityArguments("analyst",STORE,PLAN,"2026-09-05T00:00:40.000Z")},'${LEGACY_INVALID}')`),"not_found");
    const old=JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_legacy_list_v1(${authorityArguments("analyst",STORE,PLAN,"2026-09-05T00:00:40.000Z")})`));
    assert.equal(old.outcome,"listed"); assert.deepEqual(Object.keys(old.result),["items"]); assert.equal(old.result.items.every((item)=>item.reason in {adopted:1,unsupported_discount_type:1,invalid_value:1,invalid_minimum_order:1,invalid_usage_limit:1,invalid_code:1,code_conflict:1,invalid_legacy_record:1}),true);
    const archivedAdopted=old.result.items.find((item)=>item.legacyRecordId==="f1000000-0000-4000-8000-000000000126");
    assert.equal(archivedAdopted.reason,"adopted"); assert.notEqual(archivedAdopted.promotionId,null);
    assert.deepEqual(old.result.items.find((item)=>item.legacyRecordId==="f1000000-0000-4000-8000-000000000141"),{legacyRecordId:"f1000000-0000-4000-8000-000000000141",promotionId:null,reason:"invalid_legacy_record"});
    const currentLegacyCount=Number(scalar(box,`SELECT count(*) FROM saas.merchant_admin_records WHERE store_id='${STORE}' AND record_kind='discount'`)), fillCount=100-currentLegacyCount; assert.equal(fillCount>=0,true);
    if (fillCount>0) psql(box,`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) SELECT ('f2000000-0000-4000-8000-'||pg_catalog.lpad(series::text,12,'0'))::uuid,'${STORE}','discount','Legacy bounded '||series,'{"discountType":"percent"}'::jsonb,'active',1,'2026-09-04T12:00:02.000Z','2026-09-04T12:00:02.000Z' FROM pg_catalog.generate_series(1,${fillCount}) series`);
    const exactlyBounded=JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_legacy_list_v1(${authorityArguments("analyst",STORE,PLAN,"2026-09-05T00:00:40.000Z")})`)); assert.equal(exactlyBounded.outcome,"listed"); assert.equal(exactlyBounded.result.items.length,100);
    psql(box,`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES('f3000000-0000-4000-8000-000000000101','${STORE}','discount','Legacy bounded overflow','{"discountType":"percent"}'::jsonb,'active',1,'2026-09-04T12:00:03.000Z','2026-09-04T12:00:03.000Z')`);
    assert.deepEqual(JSON.parse(appScalar(box,`SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_legacy_list_v1(${authorityArguments("analyst",STORE,PLAN,"2026-09-05T00:00:40.000Z")})`)),{outcome:"projection_unavailable",result:null});
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_legacy_list_v1(${authorityArguments("analyst",STORE,PLAN,"2026-09-05T00:00:40.000Z")},2,'2026-09-05T00:00:40.000Z',NULL,NULL)`),"invalid_input");
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_legacy_list_v1(${authorityArguments("analyst",STORE,PLAN,"2026-09-05T00:00:40.000001Z")},2,NULL,NULL,NULL)`),"invalid_input");
    assert.equal(scalar(box,`SELECT saas.promotion_adopt_legacy_discounts_v1('${STORE}','2026-09-05T00:00:41.000Z')`),"0");
  });
  await asyncScenario("legacy adoption rereads each locked row and cannot adopt stale configuration", async () => {
    const record="f1000000-0000-4000-8000-000000000140";
    psql(box,`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES('${record}','${STORE}','discount','Legacy row race','{"discountType":"percent","value":5}'::jsonb,'active',1,'2026-09-04T12:00:01.000Z','2026-09-04T12:00:01.000Z')`);
    const blocker=openPsqlSession(box);
    try {
      blocker.write(`BEGIN; UPDATE saas.merchant_admin_records SET config='{"discountType":"percent","value":"bad"}'::jsonb,version=version+1,updated_at='2026-09-05T00:00:42.000Z' WHERE id='${record}'; SELECT 'LEGACY_ROW_LOCKED';\n`);
      await blocker.waitFor(/LEGACY_ROW_LOCKED/);
      const pending=psqlAsync(box,`SET application_name='slice_c_legacy_reread'; SELECT saas.promotion_adopt_legacy_discounts_v1('${STORE}','2026-09-05T00:00:42.000Z')`);
      await waitForScalar(box,`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name='slice_c_legacy_reread' AND wait_event_type='Lock')`,"t");
      blocker.end("COMMIT;\n");
      const [blocked,result]=await Promise.all([blocker.completion,pending]);
      assert.equal(blocked.status,0,blocked.stderr); assert.equal(result.status,0,result.stderr); assert.equal(result.stdout.trim(),"0");
      assert.equal(scalar(box,`SELECT count(*) FROM saas.promotions WHERE store_id='${STORE}' AND legacy_record_id='${record}'`),"0");
      assert.equal(scalar(box,`SELECT saas.promotion_legacy_review_reason_v1('${STORE}','${record}',name,config) FROM saas.merchant_admin_records WHERE id='${record}'`),"invalid_value");
    } finally { if (!blocker.child.killed && blocker.child.exitCode===null) blocker.end("ROLLBACK;\n"); }

    const deterministicPromotionId=(legacyRecordId)=>{ const digest=createHash("sha256").update(`promotion-legacy-v1:${STORE}:${legacyRecordId}`).digest("hex"); return `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`; };
    const collideWithLegacy=async ({label,recordId,promotionId,operationId,code,mutationSource})=>{
      assert.notEqual(promotionId,recordId);
      psql(box,`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES('${recordId}','${STORE}','discount','Legacy ${label}','${JSON.stringify({discountType:"fixed",value:1,code})}'::jsonb,'active',1,'2026-09-04T12:00:04.000Z','2026-09-04T12:00:04.000Z')`);
      const creationBlocker=openPsqlSession(box);
      try {
        creationBlocker.write(`BEGIN; SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-create:${STORE}',0)); SELECT 'SLICE_C_PROMOTION_CREATE_BARRIER';\n`);
        await creationBlocker.waitFor(/SLICE_C_PROMOTION_CREATE_BARRIER/);
        const mutationPending=psqlAsync(box,`SET application_name='slice_c_${label}_mutation'; SET ROLE celebix_saas_app; ${mutationSource}; RESET ROLE`);
        await waitForScalar(box,`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name='slice_c_${label}_mutation' AND wait_event_type='Lock' AND wait_event='advisory')`,"t");
        const adoptionPending=psqlAsync(box,`SET application_name='slice_c_${label}_adoption'; SELECT saas.promotion_adopt_legacy_discounts_v1('${STORE}','2026-09-05T00:00:43.000Z')`);
        await waitForScalar(box,`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name='slice_c_${label}_adoption' AND wait_event_type='Lock' AND wait_event='advisory')`,"t");
        creationBlocker.end("COMMIT;\n");
        const [blocked,mutationResult,adoptionResult]=await Promise.all([creationBlocker.completion,mutationPending,adoptionPending]);
        assert.equal(blocked.status,0,blocked.stderr); assert.equal(mutationResult.status,0,mutationResult.stderr); assert.equal(adoptionResult.status,0,adoptionResult.stderr);
        assert.equal(mutationResult.stdout.trim(),`created:${promotionId}`); assert.equal(adoptionResult.stdout.trim(),"0");
      } finally { if (!creationBlocker.child.killed && creationBlocker.child.exitCode===null) creationBlocker.end("ROLLBACK;\n"); }
      assert.equal(scalar(box,`SELECT (SELECT count(*) FROM saas.promotions WHERE store_id='${STORE}' AND id='${promotionId}' AND legacy_record_id IS NULL)||':'||(SELECT count(*) FROM saas.promotion_codes WHERE store_id='${STORE}' AND promotion_id='${promotionId}' AND code='${code}' AND status='active')||':'||(SELECT count(*) FROM saas.promotion_versions WHERE store_id='${STORE}' AND promotion_id='${promotionId}')||':'||(SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_id='${operationId}')||':'||(SELECT count(*) FROM saas.promotion_audit_events WHERE store_id='${STORE}' AND promotion_id='${promotionId}')||':'||(SELECT count(*) FROM saas.merchant_admin_records WHERE store_id='${STORE}' AND id='${recordId}')`),"1:1:1:1:1:1");
      assert.equal(scalar(box,`SELECT saas.promotion_legacy_review_reason_v1('${STORE}','${recordId}',name,config) FROM saas.merchant_admin_records WHERE id='${recordId}'`),"code_conflict");
    };
    const createLegacyRecord="f1000000-0000-4000-8000-000000000150", createCollision=deterministicPromotionId(createLegacyRecord), createCollisionOperation="f4000000-0000-4000-8000-000000000150", createCollisionRule=validRuleDocument(); createCollisionRule.trigger={kind:"code",codes:["CREATELOCK"]};
    await collideWithLegacy({label:"legacy_create",recordId:createLegacyRecord,promotionId:createCollision,operationId:createCollisionOperation,code:"CREATELOCK",mutationSource:createCall(box,"admin",createCollision,createCollisionOperation,"Legacy create winner",createCollisionRule)});
    const duplicateLegacyRecord="f1000000-0000-4000-8000-000000000151", duplicateCollision=deterministicPromotionId(duplicateLegacyRecord), duplicateCollisionOperation="f4000000-0000-4000-8000-000000000151";
    await collideWithLegacy({label:"legacy_duplicate",recordId:duplicateLegacyRecord,promotionId:duplicateCollision,operationId:duplicateCollisionOperation,code:"DUPLOCK",mutationSource:duplicateCall(box,"admin",duplicateCollision,createCollision,duplicateCollisionOperation,1,"Legacy duplicate winner",["DUPLOCK"])});
  });
  await asyncScenario("concurrent semantic create performs exactly one mutation", async () => {
    const operation = "94000000-0000-4000-8000-000000000126", first = "95000000-0000-4000-8000-000000000126", second = "95000000-0000-4000-8000-000000000127", name = "Concurrent exact once";
    const blocker = openPsqlSession(box);
    try {
      blocker.write(`BEGIN; SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-operation:${STORE}:${operation}',0)); SELECT 'PROMOTION_CONCURRENCY_BARRIER';\n`);
      await blocker.waitFor(/PROMOTION_CONCURRENCY_BARRIER/);
      const calls = [first,second].map((id,index) => psqlAsync(box,`SET application_name='promotion_exact_once_${index+1}'; SET ROLE celebix_saas_app; ${createCall(box,"admin",id,operation,name)}; RESET ROLE`));
      await waitForScalar(box,"SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name LIKE 'promotion_exact_once_%' AND wait_event_type='Lock' AND wait_event='advisory'","2");
      blocker.end("COMMIT;\n");
      const [blocked,...results] = await Promise.all([blocker.completion,...calls]);
      assert.equal(blocked.status,0,blocked.stderr);
      for (const result of results) assert.equal(result.status,0,result.stderr);
      const outcomes = results.map((result) => result.stdout.trim());
      assert.equal(outcomes.filter((value) => value.startsWith("created:")).length,1,JSON.stringify(outcomes));
      assert.equal(outcomes.filter((value) => value.startsWith("operation_replayed:")).length,1,JSON.stringify(outcomes));
      assert.equal(new Set(outcomes.map((value) => value.split(":")[1])).size,1,JSON.stringify(outcomes));
      assert.equal(scalar(box,`SELECT count(*) FROM saas.promotions WHERE store_id='${STORE}' AND name='${name}'`),"1");
      assert.equal(scalar(box,`SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_id='${operation}'`),"1");
    } finally {
      if (!blocker.child.killed && blocker.child.exitCode === null) blocker.end("ROLLBACK;\n");
    }
  });
  await asyncScenario("authority is rechecked after waiting for the operation lock", async () => {
    const operation = "94000000-0000-4000-8000-000000000127", promotion = "95000000-0000-4000-8000-000000000128", name = "Revoked while waiting";
    const blocker = openPsqlSession(box);
    try {
      blocker.write(`BEGIN; SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-operation:${STORE}:${operation}',0)); SELECT 'PROMOTION_LOCKED';\n`);
      await blocker.waitFor(/PROMOTION_LOCKED/);
      const pending = psqlAsync(box,`SET application_name='promotion_authority_recheck'; SET ROLE celebix_saas_app; ${createCall(box,"waiting",promotion,operation,name)}; RESET ROLE`);
      await waitForScalar(box,"SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name='promotion_authority_recheck' AND wait_event_type='Lock' AND wait_event='advisory')","t");
      psql(box,`UPDATE saas.memberships SET status='revoked',updated_at='2026-09-05' WHERE id='${ACTORS.waiting.membership}'`);
      blocker.end("COMMIT;\n");
      const [blocked,result] = await Promise.all([blocker.completion,pending]);
      assert.equal(blocked.status,0,blocked.stderr); assert.equal(result.status,0,result.stderr);
      assert.equal(result.stdout.trim(),"membership_denied:");
      assert.equal(scalar(box,`SELECT count(*) FROM saas.promotions WHERE store_id='${STORE}' AND id='${promotion}'`),"0");
    } finally {
      if (!blocker.child.killed && blocker.child.exitCode === null) blocker.end("ROLLBACK;\n");
    }
    psql(box,`UPDATE saas.memberships SET status='active',updated_at='2026-09-05T00:00:01Z' WHERE id='${ACTORS.waiting.membership}'`);
    const recoveryOperation="91000000-0000-4000-8000-000000000131", recoveryFingerprint=semanticCreateFingerprint(box,"Semantic replay"), recoveryBlocker=openPsqlSession(box);
    try {
      recoveryBlocker.write(`BEGIN; SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-operation:${STORE}:${recoveryOperation}',0)); SELECT 'PROMOTION_RECOVERY_LOCKED';\n`);
      await recoveryBlocker.waitFor(/PROMOTION_RECOVERY_LOCKED/);
      const recoveryPending=psqlAsync(box,`SET application_name='promotion_recovery_authority_recheck'; SET ROLE celebix_saas_app; SELECT outcome FROM saas.promotion_recover_operation_v1(${authorityArguments("waiting")},'${recoveryOperation}','create','${recoveryFingerprint}'); RESET ROLE`);
      await waitForScalar(box,"SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name='promotion_recovery_authority_recheck' AND wait_event_type='Lock' AND wait_event='advisory')","t");
      psql(box,`UPDATE saas.memberships SET status='revoked',updated_at='2026-09-05T00:00:02Z' WHERE id='${ACTORS.waiting.membership}'`);
      recoveryBlocker.end("COMMIT;\n");
      const [recoveryBlocked,recoveryResult]=await Promise.all([recoveryBlocker.completion,recoveryPending]);
      assert.equal(recoveryBlocked.status,0,recoveryBlocked.stderr); assert.equal(recoveryResult.status,0,recoveryResult.stderr);
      assert.equal(recoveryResult.stdout.trim(),"membership_denied");
    } finally {
      if (!recoveryBlocker.child.killed && recoveryBlocker.child.exitCode === null) recoveryBlocker.end("ROLLBACK;\n");
    }
  });
  scenario("Slice D settlement inputs feature gates and frozen snapshot nulls fail closed", () => {
    const promotion="da000000-0000-4000-8000-000000000001", document=validRuleDocument(), lineId="dd000000-0000-4000-8000-000000000001", operation="db000000-0000-4000-8000-000000000001";
    seedSettlementPromotion(box,{id:promotion,name:"Settlement gates",document});
    const valid=JSON.parse(frozenReservationSnapshotFor(box,{promotionId:promotion,discountMinor:30,lineId,quantity:3,grossUnitMinor:100}));
    assert.equal(scalar(box,`SELECT saas.promotion_order_snapshot_valid_v1('${JSON.stringify(valid)}'::jsonb)`),"t");
    const nullCurrency=structuredClone(valid); nullCurrency.currency=null;
    const nullKind=structuredClone(valid); nullKind.discountLines[0].capturedRanges[0].kind=null;
    for (const invalid of [nullCurrency,nullKind]) assert.equal(scalar(box,`SELECT saas.promotion_order_snapshot_valid_v1('${JSON.stringify(invalid)}'::jsonb)`),"f");
    const nearBoundary=boundaryOrderSnapshot(60), postgresTextOversized=boundaryOrderSnapshot(61);
    assert.equal(Buffer.byteLength(JSON.stringify(nearBoundary)),118606);
    assert.equal(Buffer.byteLength(JSON.stringify(postgresTextOversized)),120546);
    assert.equal(scalar(box,`SELECT pg_catalog.octet_length('${JSON.stringify(nearBoundary)}'::jsonb::text)||':'||saas.promotion_order_snapshot_valid_v1('${JSON.stringify(nearBoundary)}'::jsonb)`),"130776:true");
    assert.equal(scalar(box,`SELECT pg_catalog.octet_length('${JSON.stringify(postgresTextOversized)}'::jsonb::text)||':'||saas.promotion_order_snapshot_valid_v1('${JSON.stringify(postgresTextOversized)}'::jsonb)`),"132916:false");
    const escaped={...valid,promotionName:'Çifte "İndirim" \\ VIP 😀'};
    const escapedJson=JSON.stringify(escaped).replaceAll("'","''");
    assert.equal(scalar(box,`SELECT pg_catalog.octet_length('${escapedJson}'::jsonb::text)||':'||saas.promotion_order_snapshot_valid_v1('${escapedJson}'::jsonb)`),"626:true");
    assert.equal(scalar(box,`SELECT outcome FROM saas.promotion_reserve_group_v1('${STORE}','${operation}',repeat('a',64),NULL,'source','${JSON.stringify(settlementContext(lineId))}'::jsonb,'2026-09-05T01:00:00.000Z')`),"invalid_input");
    assert.equal(reserveGroup(box,{operationId:"db000000-0000-4000-8000-000000000009",sourceKind:"hosted_checkout",sourceReference:"not-a-uuid",evaluatorContext:settlementContext("dd000000-0000-4000-8000-000000000009"),now:"2026-09-05T01:00:00.000Z"}).outcome,"promotion_context_unavailable");
    assert.equal(reserveGroup(box,{operationId:"db000000-0000-4000-8000-000000000010",sourceKind:"hosted_checkout",sourceReference:"dc000000-0000-4000-8000-000000000010",evaluatorContext:settlementContext("dd000000-0000-4000-8000-000000000010"),now:"2026-09-05T01:00:00.000Z"}).outcome,"promotion_context_unavailable");
    const before=scalar(box,`SELECT count(*)||':'||(SELECT count(*) FROM saas.promotion_usage_reservations) FROM saas.promotion_operations`);
    psql(box,`ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable; UPDATE saas.plan_features SET enabled=false WHERE plan_id='${PLAN}' AND feature_key='promotions'; ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable`);
    assert.equal(reserveGroup(box,{operationId:operation,sourceReference:"dc000000-0000-4000-8000-000000000001",evaluatorContext:settlementContext(lineId),now:"2026-09-05T01:00:00.000Z"}).outcome,"feature_unavailable");
    psql(box,`ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable; UPDATE saas.plan_features SET enabled=true WHERE plan_id='${PLAN}' AND feature_key='promotions'; ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable`);
    assert.equal(scalar(box,"SET ROLE celebix_saas_workflow; SELECT saas.promotion_expire_due_reservations_v1('2026-09-05T01:00:00.000Z',NULL); RESET ROLE"),"0");
    assert.equal(scalar(box,`SELECT count(*)||':'||(SELECT count(*) FROM saas.promotion_usage_reservations) FROM saas.promotion_operations`),before);
  });
  scenario("reserve freezes one materialized evaluation and replays while source identity stays unique", () => {
    const promotion="da000000-0000-4000-8000-000000000002", operation="db000000-0000-4000-8000-000000000002", otherOperation="db000000-0000-4000-8000-000000000003", source="dc000000-0000-4000-8000-000000000002", lineId="dd000000-0000-4000-8000-000000000002", document=validRuleDocument();
    seedSettlementPromotion(box,{id:promotion,name:"Frozen materialization",document});
    const hostile={...settlementContext(lineId),cartLines:[{...settlementContext(lineId).cartLines[0],unitPriceMinor:1,unitCostMinor:999999,currency:"USD"}]};
    const reserved=reserveGroup(box,{operationId:operation,sourceReference:source,evaluatorContext:hostile,now:"2026-09-05T01:01:00.000Z"});
    assert.equal(reserved.outcome,"reserved",JSON.stringify(reserved)); assert.equal(reserved.result.discountTotalMinor,30); assert.equal(reserved.result.expiresAt,"2026-09-05T01:16:00.000Z"); assert.equal(reserved.result.reservations.length,1);
    const snapshot=JSON.parse(scalar(box,`SELECT evaluator_snapshot FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND reservation_group_id='${reserved.result.reservationGroupId}'`));
    assert.deepEqual({name:snapshot.promotionName,gross:snapshot.discountLines[0].capturedRanges[0].grossUnitMinor,benefit:snapshot.benefit},{name:"Frozen materialization",gross:100,benefit:document.benefit});
    assert.deepEqual(reserveGroup(box,{operationId:operation,sourceReference:source,evaluatorContext:hostile,now:"2026-09-05T01:02:00.000Z"}),{outcome:"operation_replayed",result:reserved.result});
    const reserveFingerprint=settlementFingerprint(box,"reserve",{sourceKind:"offline_checkout",sourceReference:source,evaluatorContext:hostile});
    assert.deepEqual(recoverSettlement(box,{operationId:operation,kind:"reserve",fingerprint:reserveFingerprint,now:"2026-09-05T01:02:00.000Z"}),{outcome:"recovered",result:reserved.result});
    assert.equal(reserveGroup(box,{operationId:operation,sourceReference:source,evaluatorContext:hostile,now:"2026-09-05T01:02:00.000Z",fingerprint:"f".repeat(64)}).outcome,"idempotency_mismatch");
    assert.equal(reserveGroup(box,{operationId:otherOperation,sourceReference:source,evaluatorContext:hostile,now:"2026-09-05T01:02:00.000Z"}).outcome,"source_conflict");
    assert.equal(scalar(box,`SELECT count(*)||':'||(SELECT count(*) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND reservation_group_id='${reserved.result.reservationGroupId}') FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_id IN ('${operation}','${otherOperation}')`),"1:1");
    const forged=structuredClone(snapshot); forged.benefit={kind:"percentage",percentageBps:2000};
    assert.equal(scalar(box,`SELECT saas.promotion_order_snapshot_valid_v1('${JSON.stringify(forged)}'::jsonb)`),"t");
    const forgedOperation="db000000-0000-4000-8000-000000000004", forgedReservation="de000000-0000-4000-8000-000000000004", forgedGroup="df000000-0000-4000-8000-000000000004", expiresAt="2026-09-05T01:17:00.000Z";
    const rejected=psql(box,`BEGIN; INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${forgedOperation}','${STORE}','${forgedOperation}','reserve',repeat('4',64),'reservation_group','${forgedGroup}','${reservationOperationResult(forgedGroup,[{promotionId:promotion,reservationId:forgedReservation,discountMinor:30}],"reserved",{expiresAt})}'::jsonb,'2026-09-05T01:02:00.000Z'); INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,reservation_group_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES('${forgedReservation}','${STORE}','${promotion}',1,'${forgedGroup}','${forgedOperation}',repeat('4',64),'offline_checkout','${forgedGroup}',30,30,'TRY','${JSON.stringify(forged)}'::jsonb,repeat('b',64),'reserved','${expiresAt}','2026-09-05T01:02:00.000Z','2026-09-05T01:02:00.000Z'); COMMIT`,DB,true);
    assert.notEqual(rejected.status,0); assert.equal(scalar(box,`SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_id='${forgedOperation}'`),"0");
  });
  await asyncScenario("reserve keeps one coherent catalog snapshot across a controlled concurrent price update", async () => {
    const promotion="da000000-0000-4000-8000-000000000005", operationId="db000000-0000-4000-8000-000000000005", sourceReference="dc000000-0000-4000-8000-000000000005", lineId="dd000000-0000-4000-8000-000000000005", evaluatorContext=settlementContext(lineId), barrierKey="slice-d-catalog-materialization";
    seedSettlementPromotion(box,{id:promotion,name:"Catalog snapshot race"});
    psql(box,`CREATE FUNCTION saas.slice_d_catalog_materialization_barrier() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN IF NEW.source_reference='${sourceReference}' THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('${barrierKey}',0)); END IF; RETURN NEW; END $fn$; CREATE TRIGGER slice_d_catalog_materialization_barrier BEFORE INSERT ON saas.promotion_usage_reservations FOR EACH ROW EXECUTE FUNCTION saas.slice_d_catalog_materialization_barrier()`);
    const blocker=openPsqlSession(box);
    try {
      blocker.write(`BEGIN; SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('${barrierKey}',0)); SELECT 'CATALOG_MATERIALIZATION_LOCKED';\n`); await blocker.waitFor(/CATALOG_MATERIALIZATION_LOCKED/);
      const pending=psqlAsync(box,`SET application_name='slice_d_catalog_materialization'; ${reserveGroupCall(box,{operationId,sourceReference,evaluatorContext,now:"2026-09-05T01:03:00.000Z"})}`);
      await waitForScalar(box,"SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name='slice_d_catalog_materialization' AND wait_event_type='Lock' AND wait_event='advisory')","t");
      psql(box,`UPDATE saas.product_variants SET price_cents=200,updated_at='2026-09-05T01:03:00.001Z' WHERE store_id='${STORE}' AND id='${LINE}'`);
      blocker.end("COMMIT;\n"); const [blocked,result]=await Promise.all([blocker.completion,pending]); assert.equal(blocked.status,0,blocked.stderr); assert.equal(result.status,0,result.stderr);
      const held=JSON.parse(result.stdout.trim()); assert.equal(held.outcome,"reserved",JSON.stringify(held)); assert.equal(held.result.discountTotalMinor,30);
      const snapshot=JSON.parse(scalar(box,`SELECT evaluator_snapshot FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND reservation_group_id='${held.result.reservationGroupId}'`));
      assert.deepEqual({gross:snapshot.discountLines[0].capturedRanges[0].grossUnitMinor,discount:snapshot.discountTotalMinor,currentCatalog:Number(scalar(box,`SELECT price_cents FROM saas.product_variants WHERE store_id='${STORE}' AND id='${LINE}'`))},{gross:100,discount:30,currentCatalog:200});
      const later=reserveGroup(box,{operationId:"db000000-0000-4000-8000-000000000006",sourceReference:"dc000000-0000-4000-8000-000000000006",evaluatorContext:settlementContext("dd000000-0000-4000-8000-000000000006"),now:"2026-09-05T01:03:01.000Z"}); assert.equal(later.outcome,"reserved",JSON.stringify(later)); assert.equal(later.result.discountTotalMinor,60);
      const laterSnapshot=JSON.parse(scalar(box,`SELECT evaluator_snapshot FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND reservation_group_id='${later.result.reservationGroupId}'`)); assert.deepEqual({gross:laterSnapshot.discountLines[0].capturedRanges[0].grossUnitMinor,discount:laterSnapshot.discountTotalMinor},{gross:200,discount:60});
    } finally {
      if (!blocker.child.killed && blocker.child.exitCode===null) blocker.end("ROLLBACK;\n");
      psql(box,`DROP TRIGGER IF EXISTS slice_d_catalog_materialization_barrier ON saas.promotion_usage_reservations; DROP FUNCTION IF EXISTS saas.slice_d_catalog_materialization_barrier(); UPDATE saas.product_variants SET price_cents=100,updated_at='2026-09-05T01:03:01.000Z' WHERE store_id='${STORE}' AND id='${LINE}'`);
    }
  });
  scenario("direct codes remain reusable while batch codes are customer-bound single-use holds", () => {
    const promotion="da000000-0000-4000-8000-000000000003", directCodeId="de000000-0000-4000-8000-000000000003", document=validRuleDocument(); document.trigger={kind:"code",codes:["DIRECTD"]};
    seedSettlementPromotion(box,{id:promotion,name:"Settlement codes",document});
    psql(box,`INSERT INTO saas.promotion_codes(id,store_id,promotion_id,code,status,created_at) VALUES('${directCodeId}','${STORE}','${promotion}','DIRECTD','active','2026-09-05T00:00:00.000Z')`);
    for (const suffix of [1,2]) {
      const value=reserveGroup(box,{operationId:`db000000-0000-4000-8001-${String(suffix).padStart(12,"0")}`,sourceReference:`dc000000-0000-4000-8001-${String(suffix).padStart(12,"0")}`,evaluatorContext:settlementContext(`dd000000-0000-4000-8001-${String(suffix).padStart(12,"0")}`,{submittedCodes:["DIRECTD"]}),now:"2026-09-05T01:10:00.000Z"});
      assert.equal(value.outcome,"reserved",JSON.stringify(value));
    }
    const batch=createBatch(box,{operationId:"db000000-0000-4000-8000-000000000030",batchId:"df000000-0000-4000-8000-000000000030",promotionId:promotion,count:1,prefix:"BD",codeLength:18,perCustomerUsage:1,expiresAt:"2026-09-05T02:00:00.000Z",now:"2026-09-05T01:10:00.000Z"}); assert.equal(batch.outcome,"created",JSON.stringify(batch));
    const batchCode=scalar(box,`SELECT code FROM saas.promotion_codes WHERE store_id='${STORE}' AND batch_id='${batch.result.id}'`);
    const anonymous=reserveGroup(box,{operationId:"db000000-0000-4000-8000-000000000031",sourceReference:"dc000000-0000-4000-8000-000000000031",evaluatorContext:settlementContext("dd000000-0000-4000-8000-000000000031",{submittedCodes:[batchCode]}),now:"2026-09-05T01:10:01.000Z"}); assert.equal(anonymous.outcome,"conditions_not_met");
    const options={operationId:"db000000-0000-4000-8000-000000000032",sourceReference:"dc000000-0000-4000-8000-000000000032",evaluatorContext:settlementContext("dd000000-0000-4000-8000-000000000032",{submittedCodes:[batchCode],customerId:LINE}),now:"2026-09-05T01:10:01.000Z"};
    const first=reserveGroup(box,options); assert.equal(first.outcome,"reserved",JSON.stringify(first));
    const held=reserveGroup(box,{...options,operationId:"db000000-0000-4000-8000-000000000033",sourceReference:"dc000000-0000-4000-8000-000000000033"}); assert.equal(held.outcome,"conditions_not_met");
    assert.equal(releaseGroup(box,{operationId:"db000000-0000-4000-8000-000000000034",reservationGroupId:first.result.reservationGroupId,now:"2026-09-05T01:10:02.000Z"}).outcome,"released");
    const afterRelease=reserveGroup(box,{...options,operationId:"db000000-0000-4000-8000-000000000035",sourceReference:"dc000000-0000-4000-8000-000000000035"}); assert.equal(afterRelease.outcome,"reserved",JSON.stringify(afterRelease));
  });
  await asyncScenario("concurrent reserve serializes total customer budget and source last-use boundaries", async () => {
    const cases=[
      ["total",{totalUsage:1,perCustomerUsage:null,budgetMinor:null,orderMaximumMinor:null},null],
      ["customer",{totalUsage:null,perCustomerUsage:1,budgetMinor:null,orderMaximumMinor:null},LINE],
      ["budget",{totalUsage:null,perCustomerUsage:null,budgetMinor:30,orderMaximumMinor:null},null],
    ];
    for (const [label,limits,customerId] of cases) {
      const index=cases.findIndex((entry)=>entry[0]===label)+1, promotion=`da000000-0000-4000-8002-${String(index).padStart(12,"0")}`, document=validRuleDocument(); document.limits=limits;
      seedSettlementPromotion(box,{id:promotion,name:`Race ${label}`,document});
      const calls=[1,2].map((side)=>{ const source=`dc000000-0000-4000-82${index}${side}-${String(index*10+side).padStart(12,"0")}`, line=`dd000000-0000-4000-82${index}${side}-${String(index*10+side).padStart(12,"0")}`, operation=`db000000-0000-4000-82${index}${side}-${String(index*10+side).padStart(12,"0")}`; return psqlAsync(box,`SET application_name='slice_d_${label}_${side}'; ${reserveGroupCall(box,{operationId:operation,sourceReference:source,evaluatorContext:settlementContext(line,{customerId}),now:"2026-09-05T01:20:00.000Z"})}`); });
      const results=await Promise.all(calls); results.forEach((result)=>assert.equal(result.status,0,result.stderr)); const outcomes=results.map((result)=>JSON.parse(result.stdout.trim()).outcome).sort(); assert.deepEqual(outcomes,["conditions_not_met","reserved"],`${label}:${JSON.stringify(outcomes)}`);
    }
    const promotion="da000000-0000-4000-8002-000000000099"; seedSettlementPromotion(box,{id:promotion,name:"Source race"});
    const source="dc000000-0000-4000-8002-000000000099", calls=[1,2].map((side)=>psqlAsync(box,`${reserveGroupCall(box,{operationId:`db000000-0000-4000-8299-00000000000${side}`,sourceReference:source,evaluatorContext:settlementContext(`dd000000-0000-4000-8299-00000000000${side}`),now:"2026-09-05T01:21:00.000Z"})}`));
    const results=await Promise.all(calls); results.forEach((result)=>assert.equal(result.status,0,result.stderr)); assert.deepEqual(results.map((result)=>JSON.parse(result.stdout.trim()).outcome).sort(),["reserved","source_conflict"]);
  });
  scenario("release transitions a complete group atomically and supports same-transaction checkout cleanup", () => {
    const firstPromotion="da000000-0000-4000-8000-000000000041", secondPromotion="da000000-0000-4000-8000-000000000042", document=validRuleDocument(); document.combinationPolicy={kind:"benefit_classes",benefitClasses:["percentage"]};
    seedSettlementPromotion(box,{id:firstPromotion,name:"Release one",document}); seedSettlementPromotion(box,{id:secondPromotion,name:"Release two",document,pauseOthers:false});
    const evaluatorContext=settlementContext("dd000000-0000-4000-8000-000000000041"), source="dc000000-0000-4000-8000-000000000041", reserveOperation="db000000-0000-4000-8000-000000000041", reserveFingerprint=settlementFingerprint(box,"reserve",{sourceKind:"offline_checkout",sourceReference:source,evaluatorContext});
    const held=reserveGroup(box,{operationId:reserveOperation,sourceReference:source,evaluatorContext,now:"2026-09-05T01:30:00.000Z"}); assert.equal(held.outcome,"reserved",JSON.stringify(held)); assert.equal(held.result.reservations.length,2);
    const releaseOperation="db000000-0000-4000-8000-000000000042", releaseFingerprint=settlementFingerprint(box,"release",{reservationGroupId:held.result.reservationGroupId}), released=releaseGroup(box,{operationId:releaseOperation,reservationGroupId:held.result.reservationGroupId,now:"2026-09-05T01:30:01.000Z",fingerprint:releaseFingerprint}); assert.equal(released.outcome,"released");
    assert.deepEqual(releaseGroup(box,{operationId:releaseOperation,reservationGroupId:held.result.reservationGroupId,now:"2026-09-05T01:31:00.000Z"}),{outcome:"operation_replayed",result:released.result});
    assert.deepEqual(recoverSettlement(box,{operationId:releaseOperation,kind:"release",fingerprint:releaseFingerprint,now:"2026-09-05T01:31:00.000Z"}),{outcome:"recovered",result:released.result});
    assert.deepEqual(recoverSettlement(box,{operationId:reserveOperation,kind:"reserve",fingerprint:reserveFingerprint,now:"2026-09-05T01:31:00.000Z"}),{outcome:"recovered",result:held.result});
    psql(box,`ALTER TABLE saas.promotion_operations DISABLE TRIGGER promotion_operations_immutable; UPDATE saas.promotion_operations SET fingerprint=repeat('f',64) WHERE store_id='${STORE}' AND operation_id='${releaseOperation}'; ALTER TABLE saas.promotion_operations ENABLE TRIGGER promotion_operations_immutable`);
    assert.equal(recoverSettlement(box,{operationId:releaseOperation,kind:"release",fingerprint:"f".repeat(64),now:"2026-09-05T01:31:00.000Z"}).outcome,"operation_result_invalid");
    assert.equal(recoverSettlement(box,{operationId:reserveOperation,kind:"reserve",fingerprint:reserveFingerprint,now:"2026-09-05T01:31:00.000Z"}).outcome,"operation_result_invalid");
    psql(box,`ALTER TABLE saas.promotion_operations DISABLE TRIGGER promotion_operations_immutable; UPDATE saas.promotion_operations SET fingerprint='${releaseFingerprint}',created_at='2026-09-05T01:30:02.000Z' WHERE store_id='${STORE}' AND operation_id='${releaseOperation}'; ALTER TABLE saas.promotion_operations ENABLE TRIGGER promotion_operations_immutable`);
    assert.equal(recoverSettlement(box,{operationId:releaseOperation,kind:"release",fingerprint:releaseFingerprint,now:"2026-09-05T01:31:00.000Z"}).outcome,"operation_result_invalid");
    psql(box,`ALTER TABLE saas.promotion_operations DISABLE TRIGGER promotion_operations_immutable; UPDATE saas.promotion_operations SET created_at='2026-09-05T01:30:01.000Z' WHERE store_id='${STORE}' AND operation_id='${releaseOperation}'; ALTER TABLE saas.promotion_operations ENABLE TRIGGER promotion_operations_immutable`);
    assert.equal(recoverSettlement(box,{operationId:reserveOperation,kind:"reserve",fingerprint:reserveFingerprint,now:"2026-09-05T01:31:00.000Z"}).outcome,"recovered");
    assert.equal(releaseGroup(box,{operationId:"db000000-0000-4000-8000-000000000043",reservationGroupId:held.result.reservationGroupId,now:"2026-09-05T01:31:00.000Z"}).outcome,"invalid_transition");
    assert.equal(scalar(box,`SELECT count(DISTINCT status)||':'||min(status)||':'||count(*) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND reservation_group_id='${held.result.reservationGroupId}'`),"1:released:2");
    const txSource="dc000000-0000-4000-8000-000000000044", txContext=settlementContext("dd000000-0000-4000-8000-000000000044"), txReserve="db000000-0000-4000-8000-000000000044", txFingerprint=settlementFingerprint(box,"reserve",{sourceKind:"offline_checkout",sourceReference:txSource,evaluatorContext:txContext});
    psql(box,`BEGIN; DO $do$ DECLARE v_result jsonb; v_group uuid; v_outcome text; v_fingerprint text; BEGIN SELECT outcome,result_payload INTO v_outcome,v_result FROM saas.promotion_reserve_group_v1('${STORE}','${txReserve}','${txFingerprint}','offline_checkout','${txSource}','${JSON.stringify(txContext)}'::jsonb,'2026-09-05T01:32:00.000Z'); IF v_outcome<>'reserved' THEN RAISE EXCEPTION 'same tx reserve failed %',v_outcome; END IF; v_group:=(v_result->>'reservationGroupId')::uuid; v_fingerprint:=saas.promotion_operation_fingerprint_v2('release','${STORE}',pg_catalog.jsonb_build_object('reservationGroupId',v_group)); SELECT outcome INTO v_outcome FROM saas.promotion_release_reservation_group_v1('${STORE}','db000000-0000-4000-8000-000000000045',v_fingerprint,v_group,'2026-09-05T01:32:01.000Z'); IF v_outcome<>'released' THEN RAISE EXCEPTION 'same tx release failed %',v_outcome; END IF; END $do$; COMMIT`);
    assert.equal(scalar(box,`SELECT min(status)||':'||count(*) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND source_reference='${txSource}'`),"released:2");
  });
  await asyncScenario("expiry is group-bounded skip-locked and writes one canonical terminal ledger", async () => {
    scalar(box,"SET ROLE celebix_saas_workflow; SELECT saas.promotion_expire_due_reservations_v1('2026-09-05T01:59:59.999Z',500); RESET ROLE");
    const promotion="da000000-0000-4000-8000-000000000051"; seedSettlementPromotion(box,{id:promotion,name:"Expiry worker"});
    const groups=[1,2].map((index)=>reserveGroup(box,{operationId:`db000000-0000-4000-8051-00000000000${index}`,sourceReference:`dc000000-0000-4000-8051-00000000000${index}`,evaluatorContext:settlementContext(`dd000000-0000-4000-8051-00000000000${index}`),now:"2026-09-05T02:00:00.000Z"})); groups.forEach((value)=>assert.equal(value.outcome,"reserved",JSON.stringify(value)));
    assert.equal(scalar(box,"SET ROLE celebix_saas_workflow; SELECT saas.promotion_expire_due_reservations_v1('2026-09-05T02:14:59.999Z',500); RESET ROLE"),"0");
    const blocker=openPsqlSession(box);
    try {
      blocker.write(`BEGIN; SELECT 1 FROM saas.promotion_operations WHERE store_id='${STORE}' AND result_entity_id='${groups[0].result.reservationGroupId}' FOR UPDATE; SELECT 'EXPIRY_GROUP_LOCKED';\n`); await blocker.waitFor(/EXPIRY_GROUP_LOCKED/);
      assert.equal(scalar(box,"SET ROLE celebix_saas_workflow; SELECT saas.promotion_expire_due_reservations_v1('2026-09-05T02:15:00.000Z',500); RESET ROLE"),"1");
      assert.equal(scalar(box,`SELECT status FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND reservation_group_id='${groups[0].result.reservationGroupId}'`),"reserved");
      blocker.end("COMMIT;\n"); const done=await blocker.completion; assert.equal(done.status,0,done.stderr);
    } finally { if (!blocker.child.killed && blocker.child.exitCode===null) blocker.end("ROLLBACK;\n"); }
    assert.equal(scalar(box,"SET ROLE celebix_saas_workflow; SELECT saas.promotion_expire_due_reservations_v1('2026-09-05T02:15:00.000Z',500); RESET ROLE"),"1");
    assert.equal(scalar(box,"SET ROLE celebix_saas_workflow; SELECT saas.promotion_expire_due_reservations_v1('2026-09-05T02:15:00.000Z',500); RESET ROLE"),"0");
    for (const group of groups) {
      const operation=JSON.parse(scalar(box,`SELECT pg_catalog.jsonb_build_object('id',operation_id,'fingerprint',fingerprint,'result',result_payload) FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_kind='expire' AND result_entity_id='${group.result.reservationGroupId}'`));
      assert.equal(scalar(box,`SELECT count(*)||':'||bool_and(saas.promotion_settlement_operation_result_matches_v1(store_id,operation_id,'expire',result_payload)) FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_kind='expire' AND result_entity_id='${group.result.reservationGroupId}'`),"1:true");
      assert.deepEqual(recoverSettlement(box,{operationId:operation.id,kind:"expire",fingerprint:operation.fingerprint,now:"2026-09-05T02:15:01.000Z"}),{outcome:"recovered",result:operation.result});
    }
  });
  scenario("commit consumes a frozen hold after lifecycle changes and recovery never repeats settlement", () => {
    const promotion="da000000-0000-4000-8000-000000000061", orderId="dc000000-0000-4000-8000-000000000061", wrongOrder="dc000000-0000-4000-8000-000000000062", lineId="dd000000-0000-4000-8000-000000000061", reserveOperation="db000000-0000-4000-8000-000000000061";
    const endingRule=validRuleDocument(); endingRule.schedule={timezone:"Europe/Istanbul",startsAt:"2026-09-05T02:59:00.000Z",endsAt:"2026-09-05T03:00:01.000Z"};
    seedSettlementPromotion(box,{id:promotion,name:"Frozen commit",document:endingRule}); const evaluatorContext=settlementContext(lineId);
    const held=reserveGroup(box,{operationId:reserveOperation,sourceReference:orderId,evaluatorContext,now:"2026-09-05T03:00:00.000Z"}); assert.equal(held.outcome,"reserved",JSON.stringify(held));
    insertSettlementOrder(box,{orderId:wrongOrder,lineId:"dd000000-0000-4000-8000-000000000062",discountMinor:30,createdAt:"2026-09-05T03:00:01.000Z"});
    const wrong=commitGroup(box,{operationId:"db000000-0000-4000-8000-000000000062",reservationGroupId:held.result.reservationGroupId,orderId:wrongOrder,now:"2026-09-05T03:00:02.000Z"}); assert.equal(wrong.outcome,"order_mismatch");
    insertSettlementOrder(box,{orderId,lineId,discountMinor:30,createdAt:"2026-09-05T03:00:01.000Z"});
    const replacementRule=structuredClone(endingRule); replacementRule.benefit={kind:"percentage",percentageBps:2000};
    psql(box,`INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES('da000000-0000-4000-8000-000000000062','${STORE}','${promotion}',2,'${JSON.stringify(replacementRule)}'::jsonb,'2026-09-05T03:00:01.000Z'); UPDATE saas.promotions SET status='archived',name='Changed after hold',version=2,rule_document='${JSON.stringify(replacementRule)}'::jsonb WHERE store_id='${STORE}' AND id='${promotion}'; UPDATE saas.stores SET status='suspended' WHERE id='${STORE}'; UPDATE saas.subscriptions SET status='inactive' WHERE store_id='${STORE}' AND status='active'; ALTER TABLE saas.plans DISABLE TRIGGER plan_versions_immutable; UPDATE saas.plans SET status='inactive' WHERE id='${PLAN}'; ALTER TABLE saas.plans ENABLE TRIGGER plan_versions_immutable; ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable; UPDATE saas.plan_features SET enabled=false WHERE plan_id='${PLAN}' AND feature_key='promotions'; ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable`);
    const operationId="db000000-0000-4000-8000-000000000063", fingerprint=settlementFingerprint(box,"commit",{reservationGroupId:held.result.reservationGroupId,orderId});
    const committed=commitGroup(box,{operationId,reservationGroupId:held.result.reservationGroupId,orderId,now:"2026-09-05T03:00:03.000Z",fingerprint}); assert.equal(committed.outcome,"committed",JSON.stringify(committed));
    assert.deepEqual(commitGroup(box,{operationId,reservationGroupId:held.result.reservationGroupId,orderId,now:"2026-09-05T03:01:00.000Z",fingerprint}),{outcome:"operation_replayed",result:committed.result});
    assert.deepEqual(recoverSettlement(box,{operationId,kind:"commit",fingerprint,now:"2026-09-05T03:01:00.000Z"}),{outcome:"recovered",result:committed.result});
    assert.equal(releaseGroup(box,{operationId:"db000000-0000-4000-8000-000000000064",reservationGroupId:held.result.reservationGroupId,now:"2026-09-05T03:01:00.000Z"}).outcome,"invalid_transition");
    assert.equal(recoverSettlement(box,{operationId,kind:"commit",fingerprint:"f".repeat(64),now:"2026-09-05T03:01:00.000Z"}).outcome,"idempotency_mismatch");
    assert.equal(scalar(box,`SELECT count(*)||':'||(SELECT count(*) FROM saas.order_promotion_snapshots WHERE store_id='${STORE}' AND order_id='${orderId}')||':'||(SELECT count(*) FROM saas.order_discount_allocations WHERE store_id='${STORE}' AND order_id='${orderId}') FROM saas.promotion_redemptions WHERE store_id='${STORE}' AND redemption_group_id='${committed.result.redemptionGroupId}'`),"1:1:1");
    assert.equal(scalar(box,`SELECT bool_and(snapshot.snapshot=reservation.evaluator_snapshot) FROM saas.order_promotion_snapshots snapshot JOIN saas.promotion_redemptions redemption ON redemption.store_id=snapshot.store_id AND redemption.id=snapshot.redemption_id JOIN saas.promotion_usage_reservations reservation ON reservation.store_id=redemption.store_id AND reservation.id=redemption.reservation_id WHERE snapshot.store_id='${STORE}' AND snapshot.order_id='${orderId}'`),"t");
    psql(box,`UPDATE saas.stores SET status='active' WHERE id='${STORE}'; ALTER TABLE saas.plans DISABLE TRIGGER plan_versions_immutable; UPDATE saas.plans SET status='active' WHERE id='${PLAN}'; ALTER TABLE saas.plans ENABLE TRIGGER plan_versions_immutable; UPDATE saas.subscriptions SET status='active' WHERE store_id='${STORE}' AND plan_id='${PLAN}'; ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable; UPDATE saas.plan_features SET enabled=true WHERE plan_id='${PLAN}' AND feature_key='promotions'; ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable; UPDATE saas.promotions SET status='active' WHERE store_id='${STORE}' AND id='${promotion}'`);
  });
  scenario("stacked snapshots are immutable cash attribution and refund caps use every promotion", () => {
    const first="da000000-0000-4000-8000-000000000071", second="da000000-0000-4000-8000-000000000072", document=validRuleDocument(); document.combinationPolicy={kind:"benefit_classes",benefitClasses:["percentage"]};
    seedSettlementPromotion(box,{id:first,name:"Refund one",document}); seedSettlementPromotion(box,{id:second,name:"Refund two",document,pauseOthers:false});
    const orderId="dc000000-0000-4000-8000-000000000071", lineId="dd000000-0000-4000-8000-000000000071", held=reserveGroup(box,{operationId:"db000000-0000-4000-8000-000000000071",sourceReference:orderId,evaluatorContext:settlementContext(lineId),now:"2026-09-05T03:10:00.000Z"}); assert.equal(held.outcome,"reserved",JSON.stringify(held)); assert.equal(held.result.reservations.length,2);
    insertSettlementOrder(box,{orderId,lineId,discountMinor:held.result.discountTotalMinor,createdAt:"2026-09-05T03:10:01.000Z"});
    const operationId="db000000-0000-4000-8000-000000000072", fingerprint=settlementFingerprint(box,"commit",{reservationGroupId:held.result.reservationGroupId,orderId}), committed=commitGroup(box,{operationId,reservationGroupId:held.result.reservationGroupId,orderId,now:"2026-09-05T03:10:02.000Z",fingerprint}); assert.equal(committed.outcome,"committed",JSON.stringify(committed));
    assert.equal(scalar(box,`SELECT saas.promotion_commit_integrity_valid_v1('${STORE}','${committed.result.redemptionGroupId}')`),"t",scalar(box,`SELECT pg_catalog.jsonb_build_object('reservations',(SELECT pg_catalog.jsonb_agg(reservation_row) FROM saas.promotion_usage_reservations reservation_row WHERE reservation_row.store_id='${STORE}' AND reservation_row.reservation_group_id='${held.result.reservationGroupId}'),'redemptions',(SELECT pg_catalog.jsonb_agg(redemption) FROM saas.promotion_redemptions redemption WHERE redemption.store_id='${STORE}' AND redemption.redemption_group_id='${committed.result.redemptionGroupId}'),'snapshots',(SELECT pg_catalog.jsonb_agg(snapshot) FROM saas.order_promotion_snapshots snapshot WHERE snapshot.store_id='${STORE}' AND snapshot.order_id='${orderId}'),'allocations',(SELECT pg_catalog.jsonb_agg(allocation) FROM saas.order_discount_allocations allocation WHERE allocation.store_id='${STORE}' AND allocation.order_id='${orderId}'))`));
    const refund=(previous,current,already,requested)=>scalar(box,`SELECT saas.promotion_captured_unit_refund_minor_v1('${STORE}','${orderId}','${lineId}','${JSON.stringify(previous)}'::jsonb,'${JSON.stringify(current)}'::jsonb,${already},${requested})`);
    assert.equal(refund([],[{startOrdinal:0,quantity:1}],0,1000),"80"); assert.equal(refund([{startOrdinal:0,quantity:1}],[{startOrdinal:1,quantity:1}],80,1000),"80"); assert.equal(refund([{startOrdinal:0,quantity:1}],[{startOrdinal:0,quantity:1}],80,1000),""); assert.equal(refund([],[{startOrdinal:0,quantity:3}],0,1000),"240");
    assert.equal(scalar(box,`SELECT pg_catalog.concat_ws(':',saas.promotion_captured_unit_refund_minor_v1('${STORE}','${orderId}','${lineId}',NULL,'[{"startOrdinal":0,"quantity":1}]'::jsonb,0,1000) IS NULL,saas.promotion_captured_unit_refund_minor_v1('${STORE}','${orderId}','${lineId}','[]'::jsonb,NULL,0,1000) IS NULL,saas.promotion_captured_unit_refund_minor_v1('${STORE}','${orderId}','${lineId}','[]'::jsonb,'[{"startOrdinal":0,"quantity":1}]'::jsonb,NULL,1000) IS NULL,saas.promotion_captured_unit_refund_minor_v1('${STORE}','${orderId}','${lineId}','[]'::jsonb,'[{"startOrdinal":0,"quantity":1}]'::jsonb,0,NULL) IS NULL)`),"t:t:t:t");
    const reservationId=held.result.reservations[0].reservationId, original=scalar(box,`SELECT evaluator_snapshot FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND id='${reservationId}'`);
    psql(box,`ALTER TABLE saas.promotion_usage_reservations DISABLE TRIGGER USER; UPDATE saas.promotion_usage_reservations SET evaluator_snapshot=pg_catalog.jsonb_set(evaluator_snapshot,'{benefit,percentageBps}','2000'::jsonb) WHERE store_id='${STORE}' AND id='${reservationId}'; ALTER TABLE saas.promotion_usage_reservations ENABLE TRIGGER USER`);
    assert.equal(recoverSettlement(box,{operationId,kind:"commit",fingerprint,now:"2026-09-05T03:11:00.000Z"}).outcome,"operation_result_invalid");
    psql(box,`ALTER TABLE saas.promotion_usage_reservations DISABLE TRIGGER USER; UPDATE saas.promotion_usage_reservations SET evaluator_snapshot='${original}'::jsonb WHERE store_id='${STORE}' AND id='${reservationId}'; ALTER TABLE saas.promotion_usage_reservations ENABLE TRIGGER USER`);
    assert.equal(recoverSettlement(box,{operationId,kind:"commit",fingerprint,now:"2026-09-05T03:11:00.000Z"}).outcome,"recovered");
  });
  scenario("manual and auto-add gift settlement bind the exact durable order variant and quantity", () => {
    const manual="da000000-0000-4000-8000-000000000081", manualRule=validRuleDocument(); manualRule.benefit={kind:"gift",giftVariantId:LINE,quantity:1,autoAdd:false};
    seedSettlementPromotion(box,{id:manual,name:"Manual settlement gift",document:manualRule});
    const wrongOrder="dc000000-0000-4000-8000-000000000081", wrongLine="dd000000-0000-4000-8000-000000000081", wrongHeld=reserveGroup(box,{operationId:"db000000-0000-4000-8000-000000000081",sourceReference:wrongOrder,evaluatorContext:settlementContext(wrongLine),now:"2026-09-05T03:20:00.000Z"}); assert.equal(wrongHeld.outcome,"reserved",JSON.stringify(wrongHeld));
    insertSettlementOrder(box,{orderId:wrongOrder,lineId:wrongLine,discountMinor:100,variantId:BUNDLE_LINE,createdAt:"2026-09-05T03:20:01.000Z"});
    assert.equal(commitGroup(box,{operationId:"db000000-0000-4000-8000-000000000082",reservationGroupId:wrongHeld.result.reservationGroupId,orderId:wrongOrder,now:"2026-09-05T03:20:02.000Z"}).outcome,"order_mismatch");
    const goodOrder="dc000000-0000-4000-8000-000000000083", goodLine="dd000000-0000-4000-8000-000000000083", goodHeld=reserveGroup(box,{operationId:"db000000-0000-4000-8000-000000000083",sourceReference:goodOrder,evaluatorContext:settlementContext(goodLine),now:"2026-09-05T03:21:00.000Z"}); assert.equal(goodHeld.outcome,"reserved");
    insertSettlementOrder(box,{orderId:goodOrder,lineId:goodLine,discountMinor:100,variantId:LINE,createdAt:"2026-09-05T03:21:01.000Z"}); assert.equal(commitGroup(box,{operationId:"db000000-0000-4000-8000-000000000084",reservationGroupId:goodHeld.result.reservationGroupId,orderId:goodOrder,now:"2026-09-05T03:21:02.000Z"}).outcome,"committed");
    const automatic="da000000-0000-4000-8000-000000000085", autoRule=validRuleDocument(); autoRule.benefit={kind:"gift",giftVariantId:LINE,quantity:1,autoAdd:true}; seedSettlementPromotion(box,{id:automatic,name:"Automatic settlement gift",document:autoRule});
    const missingOrder="dc000000-0000-4000-8000-000000000085", missingLine="dd000000-0000-4000-8000-000000000085", missing=reserveGroup(box,{operationId:"db000000-0000-4000-8000-000000000085",sourceReference:missingOrder,evaluatorContext:settlementContext(missingLine),now:"2026-09-05T03:22:00.000Z"}); assert.equal(missing.outcome,"reserved",JSON.stringify(missing)); insertSettlementOrder(box,{orderId:missingOrder,lineId:missingLine,discountMinor:0,createdAt:"2026-09-05T03:22:01.000Z"}); assert.equal(commitGroup(box,{operationId:"db000000-0000-4000-8000-000000000086",reservationGroupId:missing.result.reservationGroupId,orderId:missingOrder,now:"2026-09-05T03:22:02.000Z"}).outcome,"order_mismatch");
    const autoOrder="dc000000-0000-4000-8000-000000000087", autoLine="dd000000-0000-4000-8000-000000000087", giftLine="dd000000-0000-4000-8000-000000000088", auto=reserveGroup(box,{operationId:"db000000-0000-4000-8000-000000000087",sourceReference:autoOrder,evaluatorContext:settlementContext(autoLine),now:"2026-09-05T03:23:00.000Z"}); assert.equal(auto.outcome,"reserved"); insertSettlementOrder(box,{orderId:autoOrder,lineId:autoLine,discountMinor:0,createdAt:"2026-09-05T03:23:01.000Z",extraItems:[{id:giftLine,position:1,quantity:1,unitPriceMinor:0,discountMinor:0,variantId:LINE}]}); assert.equal(commitGroup(box,{operationId:"db000000-0000-4000-8000-000000000088",reservationGroupId:auto.result.reservationGroupId,orderId:autoOrder,now:"2026-09-05T03:23:02.000Z"}).outcome,"committed");
  });
  scenario("hosted source identity binds the same-store session and order while tenant lookups stay opaque", () => {
    const promotion="da000000-0000-4000-8000-000000000091", sessionId="de000000-0000-4000-8000-000000000091", foreignSession="de000000-0000-4000-8000-000000000092", boundarySession="de000000-0000-4000-8000-000000000093", terminalSession="de000000-0000-4000-8000-000000000094", otherCustomer="df000000-0000-4000-8000-000000000091", orderId="dc000000-0000-4000-8000-000000000091", wrongOrder="dc000000-0000-4000-8000-000000000092", lineId="dd000000-0000-4000-8000-000000000091";
    seedSettlementPromotion(box,{id:promotion,name:"Hosted source binding"}); psql(box,`INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,created_at,updated_at) VALUES('${otherCustomer}','${STORE}','active','Other','Hosted','other-hosted@test.invalid','2026-09-05T04:00:00.000Z','2026-09-05T04:00:00.000Z')`); insertHostedSession(box,{sessionId,orderId}); insertHostedSession(box,{sessionId:foreignSession,orderId:"dc000000-0000-4000-8000-000000000093",store:OTHER_STORE}); insertHostedSession(box,{sessionId:boundarySession,orderId:"dc000000-0000-4000-8000-000000000094"}); insertHostedSession(box,{sessionId:terminalSession,orderId:"dc000000-0000-4000-8000-000000000095",status:"cancelled",terminalAt:"2026-09-05T04:01:00.000Z"});
    const before=scalar(box,"SELECT (SELECT count(*) FROM saas.promotion_operations)::text||':'||(SELECT count(*) FROM saas.promotion_usage_reservations)::text");
    for (const [operationId,sourceReference] of [["db000000-0000-4000-8000-000000000091","not-a-uuid"],["db000000-0000-4000-8000-000000000092","de000000-0000-4000-8000-000000000099"],["db000000-0000-4000-8000-000000000093",foreignSession]]) {
      assert.equal(reserveGroup(box,{operationId,sourceKind:"hosted_checkout",sourceReference,evaluatorContext:settlementContext(lineId),now:"2026-09-05T04:00:00.000Z"}).outcome,"promotion_context_unavailable");
    }
    assert.equal(reserveGroup(box,{operationId:"db000000-0000-4000-8000-000000000089",sourceKind:"hosted_checkout",sourceReference:boundarySession,evaluatorContext:settlementContext(lineId),now:"2026-09-05T04:15:00.000Z"}).outcome,"promotion_context_unavailable");
    assert.equal(reserveGroup(box,{operationId:"db000000-0000-4000-8000-000000000090",sourceKind:"hosted_checkout",sourceReference:terminalSession,evaluatorContext:settlementContext(lineId),now:"2026-09-05T04:05:00.000Z"}).outcome,"promotion_context_unavailable");
    assert.equal(reserveGroup(box,{operationId:"db000000-0000-4000-8000-000000000107",sourceKind:"hosted_checkout",sourceReference:sessionId,evaluatorContext:settlementContext(lineId),now:"2026-09-05T04:05:00.000Z"}).outcome,"promotion_context_unavailable");
    assert.equal(reserveGroup(box,{operationId:"db000000-0000-4000-8000-000000000108",sourceKind:"hosted_checkout",sourceReference:sessionId,evaluatorContext:settlementContext(lineId,{customerId:otherCustomer}),now:"2026-09-05T04:05:00.000Z"}).outcome,"promotion_context_unavailable");
    assert.equal(scalar(box,"SELECT (SELECT count(*) FROM saas.promotion_operations)::text||':'||(SELECT count(*) FROM saas.promotion_usage_reservations)::text"),before);
    const held=reserveGroup(box,{operationId:"db000000-0000-4000-8000-000000000094",sourceKind:"hosted_checkout",sourceReference:sessionId,evaluatorContext:settlementContext(lineId,{customerId:LINE}),now:"2026-09-05T04:05:00.000Z"}); assert.equal(held.outcome,"reserved",JSON.stringify(held)); assert.equal(held.result.expiresAt,"2026-09-05T04:15:00.000Z"); assert.equal(scalar(box,`SELECT expires_at=hosted.hold_expires_at AND reservation_row.customer_id=hosted.customer_id AND reservation_row.currency=hosted.currency FROM saas.promotion_usage_reservations reservation_row JOIN saas.storefront_hosted_checkout_sessions hosted ON hosted.store_id=reservation_row.store_id AND hosted.id=reservation_row.source_reference::uuid WHERE reservation_row.store_id='${STORE}' AND reservation_row.reservation_group_id='${held.result.reservationGroupId}'`),"t");
    insertSettlementOrder(box,{orderId:wrongOrder,lineId:"dd000000-0000-4000-8000-000000000092",customerId:LINE,discountMinor:30,createdAt:"2026-09-05T04:05:01.000Z"});
    assert.equal(commitGroup(box,{operationId:"db000000-0000-4000-8000-000000000095",reservationGroupId:held.result.reservationGroupId,orderId:wrongOrder,now:"2026-09-05T04:05:02.000Z"}).outcome,"order_mismatch");
    insertSettlementOrder(box,{orderId,lineId,discountMinor:30,createdAt:"2026-09-05T04:05:01.000Z"});
    assert.equal(commitGroup(box,{operationId:"db000000-0000-4000-8000-000000000109",reservationGroupId:held.result.reservationGroupId,orderId,now:"2026-09-05T04:05:02.000Z"}).outcome,"order_mismatch");
    psql(box,`UPDATE saas.orders SET customer_id='${LINE}' WHERE store_id='${STORE}' AND id='${orderId}'`);
    const operationId="db000000-0000-4000-8000-000000000096", fingerprint=settlementFingerprint(box,"commit",{reservationGroupId:held.result.reservationGroupId,orderId}), committed=commitGroup(box,{operationId,reservationGroupId:held.result.reservationGroupId,orderId,now:"2026-09-05T04:05:02.000Z",fingerprint}); assert.equal(committed.outcome,"committed",JSON.stringify(committed));
    assert.equal(releaseGroup(box,{store:OTHER_STORE,operationId:"db000000-0000-4000-8000-000000000097",reservationGroupId:held.result.reservationGroupId,now:"2026-09-05T04:05:03.000Z"}).outcome,"not_found");
    assert.equal(commitGroup(box,{store:OTHER_STORE,operationId:"db000000-0000-4000-8000-000000000098",reservationGroupId:held.result.reservationGroupId,orderId,now:"2026-09-05T04:05:03.000Z"}).outcome,"not_found");
    assert.equal(recoverSettlement(box,{store:OTHER_STORE,operationId,kind:"commit",fingerprint,now:"2026-09-05T04:05:03.000Z"}).outcome,"not_found");
  });
  scenario("commit binds item subtotal and the full frozen free-shipping amount before any settlement write", () => {
    const shippingPromotion="da000000-0000-4000-8000-000000000101", shippingRule=validRuleDocument(); shippingRule.benefit={kind:"free_shipping"}; seedSettlementPromotion(box,{id:shippingPromotion,name:"Frozen full shipping",document:shippingRule});
    const shippingOrder="dc000000-0000-4000-8000-000000000101", shippingLine="dd000000-0000-4000-8000-000000000101", shippingHold=reserveGroup(box,{operationId:"db000000-0000-4000-8000-000000000101",sourceReference:shippingOrder,evaluatorContext:settlementContext(shippingLine,{shippingBeforeDiscountMinor:100}),now:"2026-09-05T04:10:00.000Z"}); assert.equal(shippingHold.outcome,"reserved",JSON.stringify(shippingHold)); assert.equal(shippingHold.result.discountTotalMinor,100);
    insertSettlementOrder(box,{orderId:shippingOrder,lineId:shippingLine,discountMinor:0,orderDiscountMinor:100,shippingMinor:150,createdAt:"2026-09-05T04:10:01.000Z"});
    const rejectedShippingOperation="db000000-0000-4000-8000-000000000102"; assert.equal(commitGroup(box,{operationId:rejectedShippingOperation,reservationGroupId:shippingHold.result.reservationGroupId,orderId:shippingOrder,now:"2026-09-05T04:10:02.000Z"}).outcome,"order_mismatch"); assert.equal(scalar(box,`SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_id='${rejectedShippingOperation}'`),"0");
    psql(box,`UPDATE saas.orders SET shipping_cents=100,total_cents=subtotal_cents WHERE store_id='${STORE}' AND id='${shippingOrder}'`);
    const shippingOperation="db000000-0000-4000-8000-000000000103", shippingFingerprint=settlementFingerprint(box,"commit",{reservationGroupId:shippingHold.result.reservationGroupId,orderId:shippingOrder}), shippingCommit=commitGroup(box,{operationId:shippingOperation,reservationGroupId:shippingHold.result.reservationGroupId,orderId:shippingOrder,now:"2026-09-05T04:10:02.000Z",fingerprint:shippingFingerprint}); assert.equal(shippingCommit.outcome,"committed",JSON.stringify(shippingCommit)); assert.equal(recoverSettlement(box,{operationId:shippingOperation,kind:"commit",fingerprint:shippingFingerprint,now:"2026-09-05T04:10:03.000Z"}).outcome,"recovered");
    const subtotalPromotion="da000000-0000-4000-8000-000000000104"; seedSettlementPromotion(box,{id:subtotalPromotion,name:"Frozen item subtotal"}); const subtotalOrder="dc000000-0000-4000-8000-000000000104", subtotalLine="dd000000-0000-4000-8000-000000000104", subtotalHold=reserveGroup(box,{operationId:"db000000-0000-4000-8000-000000000104",sourceReference:subtotalOrder,evaluatorContext:settlementContext(subtotalLine),now:"2026-09-05T04:11:00.000Z"}); assert.equal(subtotalHold.outcome,"reserved");
    insertSettlementOrder(box,{orderId:subtotalOrder,lineId:subtotalLine,discountMinor:30,subtotalMinor:400,createdAt:"2026-09-05T04:11:01.000Z"}); const rejectedSubtotalOperation="db000000-0000-4000-8000-000000000105"; assert.equal(commitGroup(box,{operationId:rejectedSubtotalOperation,reservationGroupId:subtotalHold.result.reservationGroupId,orderId:subtotalOrder,now:"2026-09-05T04:11:02.000Z"}).outcome,"order_mismatch"); assert.equal(scalar(box,`SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_id='${rejectedSubtotalOperation}'`),"0");
    psql(box,`UPDATE saas.orders SET subtotal_cents=300,total_cents=270 WHERE store_id='${STORE}' AND id='${subtotalOrder}'`); assert.equal(commitGroup(box,{operationId:"db000000-0000-4000-8000-000000000106",reservationGroupId:subtotalHold.result.reservationGroupId,orderId:subtotalOrder,now:"2026-09-05T04:11:02.000Z"}).outcome,"committed");
  });
  scenario("offline checkout reserves and commits the complete frozen graph inside one SQL transaction", () => {
    const promotion="da000000-0000-4000-8000-000000000111", orderId="dc000000-0000-4000-8000-000000000111", lineId="dd000000-0000-4000-8000-000000000111", operationId="db000000-0000-4000-8000-000000000111", evaluatorContext=settlementContext(lineId);
    seedSettlementPromotion(box,{id:promotion,name:"Same transaction commit"}); const reserveFingerprint=settlementFingerprint(box,"reserve",{sourceKind:"offline_checkout",sourceReference:orderId,evaluatorContext});
    const outcome=scalar(box,`BEGIN;
      CREATE TEMP TABLE slice_d_same_tx_hold ON COMMIT DROP AS SELECT * FROM saas.promotion_reserve_group_v1('${STORE}','${operationId}','${reserveFingerprint}','offline_checkout','${orderId}','${JSON.stringify(evaluatorContext)}'::jsonb,'2026-09-05T04:20:00.000Z');
      INSERT INTO saas.orders(id,store_id,order_number,source,customer_id,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at)
      SELECT '${orderId}','${STORE}','SET-SAME-TX','storefront',NULL,'Settlement','settlement@test.invalid','TRY',300,0,(result_payload->>'discountTotalMinor')::bigint,300-(result_payload->>'discountTotalMinor')::bigint,'pending','pending','{}','2026-09-05T04:20:01.000Z','2026-09-05T04:20:01.000Z' FROM slice_d_same_tx_hold WHERE outcome='reserved';
      INSERT INTO saas.order_items(id,store_id,order_id,position,product_id,variant_id,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
      SELECT '${lineId}','${STORE}','${orderId}',0,'${LINE}','${LINE}','Same transaction item',100,3,(result_payload->>'discountTotalMinor')::bigint,300-(result_payload->>'discountTotalMinor')::bigint,'2026-09-05T04:20:01.000Z' FROM slice_d_same_tx_hold WHERE outcome='reserved';
      CREATE TEMP TABLE slice_d_same_tx_commit ON COMMIT DROP AS
      SELECT committed.* FROM slice_d_same_tx_hold held CROSS JOIN LATERAL saas.promotion_commit_reservation_group_v1('${STORE}','db000000-0000-4000-8000-000000000112',saas.promotion_operation_fingerprint_v2('commit','${STORE}',pg_catalog.jsonb_build_object('reservationGroupId',(held.result_payload->>'reservationGroupId')::uuid,'orderId','${orderId}'::uuid)),(held.result_payload->>'reservationGroupId')::uuid,'${orderId}','2026-09-05T04:20:02.000Z') committed;
      SELECT outcome||':'||COALESCE(pg_catalog.jsonb_array_length(result_payload->'redemptions'),0) FROM slice_d_same_tx_commit;
      COMMIT`);
    assert.equal(outcome,"committed:1"); assert.equal(scalar(box,`SELECT min(status)||':'||count(*)||':'||(SELECT count(*) FROM saas.promotion_redemptions WHERE store_id='${STORE}' AND order_id='${orderId}') FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND source_reference='${orderId}'`),"committed:1:1");
  });
  await asyncScenario("duplicate commit callbacks serialize to one redemption graph and one exact replay", async () => {
    const promotion="da000000-0000-4000-8000-000000000121", orderId="dc000000-0000-4000-8000-000000000121", lineId="dd000000-0000-4000-8000-000000000121", held=(()=>{ seedSettlementPromotion(box,{id:promotion,name:"Duplicate callback"}); return reserveGroup(box,{operationId:"db000000-0000-4000-8000-000000000121",sourceReference:orderId,evaluatorContext:settlementContext(lineId),now:"2026-09-05T04:30:00.000Z"}); })(); assert.equal(held.outcome,"reserved",JSON.stringify(held)); insertSettlementOrder(box,{orderId,lineId,discountMinor:30,createdAt:"2026-09-05T04:30:01.000Z"});
    const operationId="db000000-0000-4000-8000-000000000122", fingerprint=settlementFingerprint(box,"commit",{reservationGroupId:held.result.reservationGroupId,orderId}), sql=`SET application_name='slice_d_duplicate_commit'; SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_commit_reservation_group_v1('${STORE}','${operationId}','${fingerprint}','${held.result.reservationGroupId}','${orderId}','2026-09-05T04:30:02.000Z')`, blocker=openPsqlSession(box);
    try {
      blocker.write(`BEGIN; SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-operation:${STORE}:${operationId}',0)); SELECT 'DUPLICATE_COMMIT_LOCKED';\n`); await blocker.waitFor(/DUPLICATE_COMMIT_LOCKED/);
      const pending=[psqlAsync(box,sql),psqlAsync(box,sql)]; await waitForScalar(box,"SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name='slice_d_duplicate_commit' AND wait_event_type='Lock'","2"); blocker.end("COMMIT;\n"); const results=await Promise.all(pending); results.forEach((result)=>assert.equal(result.status,0,result.stderr)); assert.deepEqual(results.map((result)=>JSON.parse(result.stdout.trim()).outcome).sort(),["committed","operation_replayed"]);
      const done=await blocker.completion; assert.equal(done.status,0,done.stderr);
    } finally { if (!blocker.child.killed && blocker.child.exitCode===null) blocker.end("ROLLBACK;\n"); }
    assert.equal(scalar(box,`SELECT count(*)||':'||(SELECT count(*) FROM saas.promotion_redemptions WHERE store_id='${STORE}' AND order_id='${orderId}')||':'||(SELECT count(*) FROM saas.order_promotion_snapshots WHERE store_id='${STORE}' AND order_id='${orderId}') FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_id='${operationId}'`),"1:1:1");
  });
  await asyncScenario("commit and release race on one group with exactly one complete terminal ledger", async () => {
    const promotion="da000000-0000-4000-8000-000000000131", orderId="dc000000-0000-4000-8000-000000000131", lineId="dd000000-0000-4000-8000-000000000131"; seedSettlementPromotion(box,{id:promotion,name:"Commit release race"}); const held=reserveGroup(box,{operationId:"db000000-0000-4000-8000-000000000131",sourceReference:orderId,evaluatorContext:settlementContext(lineId),now:"2026-09-05T04:40:00.000Z"}); assert.equal(held.outcome,"reserved"); insertSettlementOrder(box,{orderId,lineId,discountMinor:30,createdAt:"2026-09-05T04:40:01.000Z"});
    const commitOperation="db000000-0000-4000-8000-000000000132", releaseOperation="db000000-0000-4000-8000-000000000133", commitFingerprint=settlementFingerprint(box,"commit",{reservationGroupId:held.result.reservationGroupId,orderId}), releaseFingerprint=settlementFingerprint(box,"release",{reservationGroupId:held.result.reservationGroupId}), blocker=openPsqlSession(box);
    try {
      blocker.write(`BEGIN; SELECT 1 FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_kind='reserve' AND result_entity_id='${held.result.reservationGroupId}' FOR UPDATE; SELECT 'COMMIT_RELEASE_LOCKED';\n`); await blocker.waitFor(/COMMIT_RELEASE_LOCKED/);
      const pending=[psqlAsync(box,`SET application_name='slice_d_commit_release'; SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_commit_reservation_group_v1('${STORE}','${commitOperation}','${commitFingerprint}','${held.result.reservationGroupId}','${orderId}','2026-09-05T04:40:02.000Z')`),psqlAsync(box,`SET application_name='slice_d_commit_release'; SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_release_reservation_group_v1('${STORE}','${releaseOperation}','${releaseFingerprint}','${held.result.reservationGroupId}','2026-09-05T04:40:02.000Z')`)];
      await waitForScalar(box,"SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name='slice_d_commit_release' AND wait_event_type='Lock'","2"); blocker.end("COMMIT;\n"); const results=await Promise.all(pending); results.forEach((result)=>assert.equal(result.status,0,result.stderr)); const outcomes=results.map((result)=>JSON.parse(result.stdout.trim()).outcome); assert.equal(outcomes.includes("invalid_transition"),true); assert.equal(outcomes.includes("committed")||outcomes.includes("released"),true); const done=await blocker.completion; assert.equal(done.status,0,done.stderr);
    } finally { if (!blocker.child.killed && blocker.child.exitCode===null) blocker.end("ROLLBACK;\n"); }
    assert.equal(scalar(box,`SELECT count(DISTINCT status)||':'||count(*)||':'||(SELECT count(*) FROM saas.promotion_operations operation_row WHERE operation_row.store_id='${STORE}' AND operation_row.operation_kind IN ('commit','release') AND (operation_row.result_entity_id='${held.result.reservationGroupId}' OR operation_row.result_payload->>'reservationGroupId'='${held.result.reservationGroupId}')) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND reservation_group_id='${held.result.reservationGroupId}'`),"1:1:1");
  });
  await asyncScenario("commit and exact-boundary expiry race with one winner and no partial settlement", async () => {
    scalar(box,"SET ROLE celebix_saas_workflow; SELECT saas.promotion_expire_due_reservations_v1('2026-09-05T04:59:59.999Z',500); RESET ROLE"); const promotion="da000000-0000-4000-8000-000000000141", orderId="dc000000-0000-4000-8000-000000000141", lineId="dd000000-0000-4000-8000-000000000141"; seedSettlementPromotion(box,{id:promotion,name:"Commit expiry race"}); const held=reserveGroup(box,{operationId:"db000000-0000-4000-8000-000000000141",sourceReference:orderId,evaluatorContext:settlementContext(lineId),now:"2026-09-05T05:00:00.000Z"}); assert.equal(held.outcome,"reserved"); insertSettlementOrder(box,{orderId,lineId,discountMinor:30,createdAt:"2026-09-05T05:00:01.000Z"});
    const operationId="db000000-0000-4000-8000-000000000142", fingerprint=settlementFingerprint(box,"commit",{reservationGroupId:held.result.reservationGroupId,orderId}), blocker=openPsqlSession(box); let expirePending; let commitPending;
    try {
      blocker.write(`BEGIN; SELECT id FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND reservation_group_id='${held.result.reservationGroupId}' FOR UPDATE; SELECT 'COMMIT_EXPIRY_RESERVATION_LOCKED';\n`); await blocker.waitFor(/COMMIT_EXPIRY_RESERVATION_LOCKED/);
      expirePending=psqlAsync(box,"SET application_name='slice_d_expire_winner'; SET ROLE celebix_saas_workflow; SELECT saas.promotion_expire_due_reservations_v1('2026-09-05T05:15:00.000Z',500); RESET ROLE"); await waitForScalar(box,"SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name='slice_d_expire_winner' AND wait_event_type='Lock'","1");
      commitPending=psqlAsync(box,`SET application_name='slice_d_commit_after_expire'; SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.promotion_commit_reservation_group_v1('${STORE}','${operationId}','${fingerprint}','${held.result.reservationGroupId}','${orderId}','2026-09-05T05:14:59.999Z')`); await waitForScalar(box,"SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name='slice_d_commit_after_expire' AND wait_event_type='Lock'","1");
      blocker.end("COMMIT;\n"); const [expireRun,commitRun,blockerDone]=await Promise.all([expirePending,commitPending,blocker.completion]); assert.equal(expireRun.status,0,expireRun.stderr); assert.equal(commitRun.status,0,commitRun.stderr); assert.equal(blockerDone.status,0,blockerDone.stderr); assert.equal(Number(expireRun.stdout.trim()),1); assert.equal(JSON.parse(commitRun.stdout.trim()).outcome,"invalid_transition");
    } finally { if (!blocker.child.killed && blocker.child.exitCode===null) blocker.end("ROLLBACK;\n"); }
    assert.equal(scalar(box,`SELECT count(DISTINCT status)||':'||min(status)||':'||count(*)||':'||(SELECT count(*) FROM saas.promotion_operations operation_row WHERE operation_row.store_id='${STORE}' AND operation_row.operation_kind IN ('commit','expire') AND (operation_row.result_entity_id='${held.result.reservationGroupId}' OR operation_row.result_payload->>'reservationGroupId'='${held.result.reservationGroupId}'))||':'||(SELECT count(*) FROM saas.promotion_redemptions redemption WHERE redemption.store_id='${STORE}' AND redemption.order_id='${orderId}')||':'||(SELECT count(*) FROM saas.order_promotion_snapshots snapshot WHERE snapshot.store_id='${STORE}' AND snapshot.order_id='${orderId}')||':'||(SELECT count(*) FROM saas.order_discount_allocations allocation WHERE allocation.store_id='${STORE}' AND allocation.order_id='${orderId}') FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND reservation_group_id='${held.result.reservationGroupId}'`),"1:expired:1:1:0:0:0");
    const boundaryOrder="dc000000-0000-4000-8000-000000000143", boundaryLine="dd000000-0000-4000-8000-000000000143", boundary=reserveGroup(box,{operationId:"db000000-0000-4000-8000-000000000143",sourceReference:boundaryOrder,evaluatorContext:settlementContext(boundaryLine),now:"2026-09-05T05:20:00.000Z"}); assert.equal(boundary.outcome,"reserved"); insertSettlementOrder(box,{orderId:boundaryOrder,lineId:boundaryLine,discountMinor:30,createdAt:"2026-09-05T05:20:01.000Z"}); assert.equal(commitGroup(box,{operationId:"db000000-0000-4000-8000-000000000144",reservationGroupId:boundary.result.reservationGroupId,orderId:boundaryOrder,now:"2026-09-05T05:35:00.000Z"}).outcome,"reservation_expired"); assert.equal(scalar(box,"SET ROLE celebix_saas_workflow; SELECT saas.promotion_expire_due_reservations_v1('2026-09-05T05:35:00.000Z',500); RESET ROLE"),"1");
  });
  assert.equal(completed, TOTAL);
  process.stdout.write([`PROMOTIONS_STUDIO_POSTGRESQL16_COMPLETE ${completed}/${TOTAL}`, ""].join(String.fromCharCode(10)));
} finally { stop(box); }
