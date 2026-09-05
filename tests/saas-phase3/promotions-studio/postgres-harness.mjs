import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const DB = "promotions_studio_126";
const TOTAL = 100;
let completed = 0;
let catalogFixtureProductBaseline = 0;
const STORE = "10000000-0000-4000-8000-000000000126";
const PERCENT = "40000000-0000-4000-8000-000000000126";
const FIXED = "40000000-0000-4000-8000-000000000127";
const SHIPPING = "40000000-0000-4000-8000-000000000128";
const TIER = "40000000-0000-4000-8000-000000000129";
const BUNDLE = "40000000-0000-4000-8000-000000000130";
const BUY = "40000000-0000-4000-8000-000000000131";
const GIFT = "40000000-0000-4000-8000-000000000132";
const OTHER_STORE = "20000000-0000-4000-8000-000000000126";
const OTHER_PRODUCT = "50000000-0000-4000-8000-000000000129";
const CATEGORY = "50000000-0000-4000-8000-000000000130";
const BRAND = "50000000-0000-4000-8000-000000000131";
const COLLECTION = "50000000-0000-4000-8000-000000000132";
const PAYMENT_METHOD = "50000000-0000-4000-8000-000000000133";
const DISABLED_PAYMENT_METHOD = "50000000-0000-4000-8000-000000000134";
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
function rule(benefit) { return JSON.stringify({schemaVersion:1,benefit,targets:{mode:"all",include:[],exclude:[]},audience:{mode:"everyone"},trigger:{kind:"automatic"},schedule:{timezone:"Europe/Istanbul"},limits:{totalUsage:null,perCustomerUsage:null,budgetMinor:null,orderMaximumMinor:null},conditions:{minimumBasketMinor:0,minimumQuantity:0,minimumProductQuantity:0},combinationPolicy:{kind:"none"},priority:0,marginPolicy:{kind:"warn"},progressMessagePolicy:{enabled:false}}).replaceAll("'", "''"); }
function validRuleDocument() { return JSON.parse(rule({kind:"percentage",percentageBps:1000})); }
function validates(box, value) { return scalar(box, `SELECT saas.promotion_rule_document_valid('${JSON.stringify(value).replaceAll("'", "''")}'::jsonb)`); }
function seedPromotions(box) {
  const rules = [[PERCENT,{kind:"percentage",percentageBps:1000}],[FIXED,{kind:"fixed_amount",amountMinor:50,currency:"TRY"}],[SHIPPING,{kind:"free_shipping"}],[TIER,{kind:"quantity_tiers",tiers:[{minimumQuantity:2,percentageBps:1000}]}],[BUNDLE,{kind:"bundle_price",bundleQuantity:3,bundlePriceMinor:200,currency:"TRY"}],[BUY,{kind:"buy_x_get_y",buyQuantity:2,receiveQuantity:1,discountPercentageBps:10000,reward:{strategy:"same_product_cheapest"}}],[GIFT,{kind:"gift",giftVariantId:"50000000-0000-4000-8000-000000000126"}]];
  for (const [id, benefit] of rules) psql(box, `INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES ('${id}','${STORE}','${benefit.kind}','paused',1,'${rule(benefit)}'::jsonb,'2026-01-01','2026-01-01');`);
}
function seed(box) {
  psql(box, `INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES ('${STORE}','Promotions Studio','promotions-studio','active','tr','TRY','starter','2026-01-01','2026-01-01');`);
  psql(box, `INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES ('${OTHER_STORE}','Other Promotions Studio','other-promotions-studio','active','tr','TRY','starter','2026-01-01','2026-01-01');
    INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES
      ('${LINE}','${STORE}','promotion-line','Promotion line','active','TRY','2026-01-01','2026-01-01'),
      ('${OTHER_PRODUCT}','${OTHER_STORE}','other-promotion-line','Other promotion line','active','TRY','2026-01-01','2026-01-01');
    ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
    INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES
      ('${LINE}','${LINE}','${STORE}','Promotion variant',100,40,false,0,'active','2026-01-01','2026-01-01'),
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
function authority(role, store = STORE, plan = PLAN) {
  const actor = ACTORS[role];
  return { store, principal: actor.principal, membership: actor.membership, plan, planCode: plan === PLAN ? "promotion_test" : "promotion_disabled", planVersion: 1 };
}
function authorityArguments(role, store = STORE, plan = PLAN) {
  const value = authority(role, store, plan);
  return `'${value.store}','${value.principal}','${value.membership}','${value.plan}','${value.planCode}',${value.planVersion},'2026-09-05T00:00:00Z'`;
}
function appScalar(box, source) { return scalar(box, `SET ROLE celebix_saas_app; ${source}; RESET ROLE`); }
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
function context(overrides = {}) { return {
  storeId: STORE, customerId: null, paidOrderCount: 0, customerSegmentIds: [], customerTagIds: [],
  cartLines: [{ lineId: LINE, position: 0, productId: LINE, variantId: LINE, quantity: 3, unitPriceMinor: 100, unitCostMinor: 40, currency: "TRY", categoryIds: [], brandId: null, collectionIds: [] }],
  shippingMethodId: null, paymentMethodId: null, shippingBeforeDiscountMinor: 40, currency: "TRY",
  storeLocalTime: "2026-09-05T00:00:00.000Z", salesChannel: "storefront", submittedCodes: [], abandonedCart: null, ...overrides,
}; }
function evaluate(box, overrides = {}) { return JSON.parse(scalar(box, `SELECT saas.promotion_evaluate_v1('${STORE}','${JSON.stringify(context(overrides)).replaceAll("'", "''")}'::jsonb,'2026-09-05T00:00:00Z')`)); }
function parseContract(value) { const parser = command(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", "import { parsePromotionEvaluatorResult } from './packages/saas-contracts/src/promotions/index.ts'; const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk); parsePromotionEvaluatorResult(JSON.parse(Buffer.concat(chunks).toString('utf8')));"], JSON.stringify(value), true); assert.equal(parser.status, 0, parser.stderr); }
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
  gift.benefit={kind:"gift",giftVariantId:LINE}; gift.audience={mode:"customer_segments",referenceIds:[LINE]};
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
  assert.deepEqual(hundredPromotions.value.gifts,[{promotionId:first,variantId:LINE,quantity:1,paidMinor:0}]);
  parseContract(hundredPromotions.value);
  process.stdout.write(`PROMOTIONS_GIFT_SETWISE_METRICS ${JSON.stringify({onePromotion:profileSummary(onePromotion),hundredPromotions:profileSummary(hundredPromotions)})}\n`);
}
let box;
try {
  box = start();
  command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-q", "-U", "postgres", "-d", "postgres", "-c", `CREATE DATABASE ${DB}`]);
  for (const migration of migrationsThrough125()) apply(box, migration);
  scenario("migration 126 applies after the accepted additive chain", () => apply(box, "202609050126_promotions_studio.up.sql"));
  apply(box, "202609050126_promotions_studio_assertions.sql");
  seed(box);
  seedAuthority(box);
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
    const gift=validRuleDocument(); gift.benefit={kind:"gift",giftVariantId:LINE};
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

    const giftPromotion="39000000-0000-4000-8000-000000000147", giftCreate="39000000-0000-4000-8000-000000000148", giftPublish="39000000-0000-4000-8000-000000000149", gift=validRuleDocument(); gift.benefit={kind:"gift",giftVariantId:LINE};
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
  scenario("bundle price calculates a bounded saving", () => { activate(box,BUNDLE); assert.equal(discount(box),"100"); });
  scenario("buy X get Y discounts the deterministic cheapest unit", () => { activate(box,BUY); assert.equal(discount(box),"100"); });
  scenario("gift produces zero-paid immutable gift effect", () => { activate(box,GIFT); assert.equal(evaluate(box,{cartLines:[],shippingBeforeDiscountMinor:0}).gifts[0].paidMinor,0); });
  scenario("evaluator output has separated shipping and reconciled line effects", () => { activate(box,SHIPPING); const value=evaluate(box,{cartLines:[{...context().cartLines[0],quantity:1}]}); assert.equal(value.shippingDiscountTotalMinor,40); assert.equal(value.lineDiscountTotalMinor,0); assert.equal(value.discountTotalMinor,40); assert.equal(value.grandTotalMinor,100); assert.equal(value.eligiblePromotionIds.length,1); assert.equal(value.shippingEffects.length,1); });
  scenario("down migration refuses without emergency setting", () => assert.notEqual(psql(box, readFileSync(path.join(SQL, "202609050126_promotions_studio.down.sql"), "utf8"), DB, true).status, 0));
  scenario("allowed-empty emergency down removes every migration-126 promotion object", () => {
    psql(box, `TRUNCATE saas.order_discount_allocations,saas.order_promotion_snapshots,saas.promotion_redemptions,saas.promotion_usage_reservations,saas.promotion_audit_events,saas.promotion_operations,saas.promotion_codes,saas.promotion_code_batches,saas.promotion_targets,saas.promotion_versions,saas.promotions CASCADE`);
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
  scenario("legacy code collisions remain read-only while independent safe adoption continues", () => { const existing="60000000-0000-4000-8000-000000000126", legacyA="60000000-0000-4000-8000-000000000127", legacyB="60000000-0000-4000-8000-000000000128", legacyExisting="60000000-0000-4000-8000-000000000129", legacySafe="60000000-0000-4000-8000-000000000130"; psql(box, `INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${existing}','${STORE}','existing','draft',1,'${rule({kind:"percentage",percentageBps:1000})}'::jsonb,'2026-01-01','2026-01-01'); INSERT INTO saas.promotion_codes(id,store_id,promotion_id,code,status,created_at) VALUES('60000000-0000-4000-8000-000000000131','${STORE}','${existing}','EXISTING','active','2026-01-01');`); const record=(id,name,config)=>`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES('${id}','${STORE}','discount','${name}','${JSON.stringify(config).replaceAll("'", "''")}'::jsonb,'draft',1,'2026-01-01','2026-01-01');`; psql(box, record(legacyA,"duplicate a",{discountType:"percent",value:"10",code:"DUPLICATE"})+record(legacyB,"duplicate b",{discountType:"percent",value:"10",code:"duplicate"})+record(legacyExisting,"existing code",{discountType:"fixed",value:"50",code:"EXISTING"})+record(legacySafe,"safe",{discountType:"fixed",value:"50"})); assert.equal(scalar(box,`SELECT saas.promotion_adopt_legacy_discounts_v1('${STORE}','2026-09-05T00:00:00Z')`),"1"); assert.equal(scalar(box,`SELECT count(*) FROM saas.promotions WHERE store_id='${STORE}' AND legacy_record_id IS NOT NULL`),"1"); assert.equal(scalar(box,`SELECT saas.promotion_adopt_legacy_discounts_v1('${STORE}','2026-09-05T00:00:00Z')`),"0"); assert.equal(scalar(box,`SELECT count(*) FROM saas.merchant_admin_records WHERE store_id='${STORE}' AND record_kind='discount'`),"4"); });
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
    const resultFixture=reservationOperationResult(reservation,[{promotionId:id,reservationId:reservation,discountMinor:29}]);
    assert.equal(scalar(box,`SELECT saas.promotion_operation_result_valid('reserve','${resultFixture}'::jsonb)`),"t",scalar(box,`WITH value AS (SELECT '${resultFixture}'::jsonb result), member AS (SELECT item FROM value CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(result->'reservations') item) SELECT pg_catalog.jsonb_build_object('keys',saas.promotion_json_keys(result,ARRAY['schemaVersion','reservationGroupId','status','currency','discountTotalMinor','expiresAt','evaluatorFingerprint','reservations'],ARRAY['schemaVersion','reservationGroupId','status','currency','discountTotalMinor','expiresAt','evaluatorFingerprint','reservations']),'schema',saas.promotion_json_integer(result->'schemaVersion',1,1),'group',saas.promotion_json_uuid(result->'reservationGroupId'),'status',result->>'status'='reserved','currency',result->>'currency' ~ '^[A-Z]{3}$','total',saas.promotion_json_integer(result->'discountTotalMinor',0,8000000000),'expires',saas.promotion_json_utc_timestamp(result->'expiresAt'),'fingerprint',result->>'evaluatorFingerprint' ~ '^[a-f0-9]{64}$','arrayType',pg_catalog.jsonb_typeof(result->'reservations'),'arrayLength',pg_catalog.jsonb_array_length(result->'reservations'),'memberKeys',saas.promotion_json_keys(item,ARRAY['promotionId','reservationId','promotionVersion','normalizedCode','discountMinor'],ARRAY['promotionId','reservationId','promotionVersion','normalizedCode','discountMinor']),'promotion',saas.promotion_json_uuid(item->'promotionId'),'reservation',saas.promotion_json_uuid(item->'reservationId'),'version',saas.promotion_json_integer(item->'promotionVersion',1,9007199254740991),'codeType',pg_catalog.jsonb_typeof(item->'normalizedCode'),'codeNull',item->'normalizedCode'='null'::jsonb,'discount',saas.promotion_json_integer(item->'discountMinor',0,8000000000)) FROM value,member`));
    psql(box,`BEGIN; INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','limited','active',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01');
      INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES('${id}','${STORE}','${id}',1,'${JSON.stringify(document)}','2026-01-01');
      INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${reservation}','${STORE}','${reservation}','reserve',repeat('a',64),'reservation_group','${reservation}','${reservationOperationResult(reservation,[{promotionId:id,reservationId:reservation,discountMinor:29}])}'::jsonb,'2026-01-01');
      INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,reservation_group_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES('${reservation}','${STORE}','${id}',1,'${reservation}','${reservation}',repeat('a',64),'hosted_checkout','test',29,29,'TRY',pg_catalog.jsonb_build_object('promotionId','${id}','discountMinor',29),repeat('b',64),'reserved','2026-09-06T00:00:00Z','2026-01-01','2026-01-01'); COMMIT;`);
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
  scenario("abandoned-cart audiences require a current same-store durable episode", () => { const id="70000000-0000-4000-8000-000000000181", cart="80000000-0000-4000-8000-000000000181", old="80000000-0000-4000-8000-000000000182", future="80000000-0000-4000-8000-000000000183", document=validRuleDocument(); document.audience={mode:"abandoned_cart"}; psql(box,`INSERT INTO saas.abandoned_carts(id,store_id,public_cart_digest,status,currency,subtotal_cents,discount_cents,total_cents,checkout_started_at,last_activity_at,abandoned_at,created_at,updated_at) VALUES('${cart}','${STORE}',repeat('a',64),'abandoned','TRY',0,0,0,'2026-08-30','2026-08-30','2026-09-01','2026-08-30','2026-09-01'),('${old}','${STORE}',repeat('b',64),'abandoned','TRY',0,0,0,'2026-06-01','2026-06-01','2026-06-02','2026-06-01','2026-06-02'),('${future}','${STORE}',repeat('c',64),'abandoned','TRY',0,0,0,'2026-09-06','2026-09-06','2026-09-06','2026-09-06','2026-09-06'); INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','cart audience','active',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01');`); activate(box,id); assert.equal(evaluate(box,{abandonedCart:{id:cart}}).discountTotalMinor,30); assert.equal(evaluate(box,{abandonedCart:{id:old}}).discountTotalMinor,0); assert.equal(evaluate(box,{abandonedCart:{id:future}}).discountTotalMinor,0); assert.equal(evaluate(box,{abandonedCart:{id:OTHER_PRODUCT}}).discountTotalMinor,0); });
  scenario("created-at then UUID independently break equal-saving equal-priority ties", () => { const early="70000000-0000-4000-8000-000000000190", late="70000000-0000-4000-8000-000000000191", low="70000000-0000-4000-8000-000000000192", high="70000000-0000-4000-8000-000000000193", document=validRuleDocument(); psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${early}','${STORE}','early','active',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01'),('${late}','${STORE}','late','active',1,'${JSON.stringify(document)}','2026-01-02','2026-01-02'),('${low}','${STORE}','low','active',1,'${JSON.stringify(document)}','2026-01-03','2026-01-03'),('${high}','${STORE}','high','active',1,'${JSON.stringify(document)}','2026-01-03','2026-01-03');`); activate(box,early); psql(box,`UPDATE saas.promotions SET status='active' WHERE id='${late}'`); assert.equal(evaluate(box).appliedPromotions[0].promotionId,early); activate(box,low); psql(box,`UPDATE saas.promotions SET status='active' WHERE id='${high}'`); assert.equal(evaluate(box).appliedPromotions[0].promotionId,low); });
  scenario("selected-products and specific-variant X/Y allocate only their multi-group rewarded lines", () => { const a="50000000-0000-4000-8000-000000000190", b="50000000-0000-4000-8000-000000000191", selected="70000000-0000-4000-8000-000000000194", specific="70000000-0000-4000-8000-000000000195", lines=[{lineId:a,position:0,productId:a,variantId:a,quantity:2,unitPriceMinor:60,unitCostMinor:10,currency:"TRY",categoryIds:[],brandId:null,collectionIds:[]},{lineId:b,position:1,productId:b,variantId:b,quantity:4,unitPriceMinor:150,unitCostMinor:10,currency:"TRY",categoryIds:[],brandId:null,collectionIds:[]}], selectedRule=JSON.parse(rule({kind:"buy_x_get_y",buyQuantity:2,receiveQuantity:1,discountPercentageBps:10000,reward:{strategy:"selected_products_cheapest",productIds:[a]}})), specificRule=JSON.parse(rule({kind:"buy_x_get_y",buyQuantity:2,receiveQuantity:1,discountPercentageBps:10000,reward:{strategy:"specific_variant",variantId:a}})); psql(box,`INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES('${a}','${STORE}','xy-select-a','a','active','TRY','2026-01-01','2026-01-01'),('${b}','${STORE}','xy-select-b','b','active','TRY','2026-01-01','2026-01-01'); ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile; INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES('${a}','${a}','${STORE}','a',60,10,false,0,'active','2026-01-01','2026-01-01'),('${b}','${b}','${STORE}','b',150,10,false,0,'active','2026-01-01','2026-01-01'); ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile; INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${selected}','${STORE}','selected xy','active',1,'${JSON.stringify(selectedRule)}','2026-01-01','2026-01-01'),('${specific}','${STORE}','specific xy','active',1,'${JSON.stringify(specificRule)}','2026-01-01','2026-01-01');`); for(const id of [selected,specific]) { activate(box,id); const value=evaluate(box,{cartLines:lines}); assert.equal(value.discountTotalMinor,120); assert.deepEqual(value.lineEffects,[{promotionId:id,lineId:a,discountMinor:120,giftQuantity:0}]); parseContract(value); } });
  scenario("usage budget and money caps count durable holds and never exceed payable value", () => {
    const id="70000000-0000-4000-8000-000000000196", held="70000000-0000-4000-8000-000000000197", expired="70000000-0000-4000-8000-000000000198", document=validRuleDocument();
    document.benefit={kind:"fixed_amount",amountMinor:500,currency:"TRY"}; document.limits={totalUsage:3,perCustomerUsage:2,budgetMinor:80,orderMaximumMinor:70}; document.marginPolicy={kind:"floor_at_cost"};
    psql(box,`BEGIN; INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','capped','active',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01');
      INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES('${id}','${STORE}','${id}',1,'${JSON.stringify(document)}','2026-01-01');
      INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES
        ('${held}','${STORE}','${held}','reserve',repeat('c',64),'reservation_group','${held}','${reservationOperationResult(held,[{promotionId:id,reservationId:held,discountMinor:30}])}'::jsonb,'2026-01-01'),
        ('${expired}','${STORE}','${expired}','reserve',repeat('d',64),'reservation_group','${expired}','${reservationOperationResult(expired,[{promotionId:id,reservationId:expired,discountMinor:999}],"reserved",{expiresAt:"2026-09-01T00:00:00.000Z"})}'::jsonb,'2026-01-01');
      INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,reservation_group_id,customer_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES
        ('${held}','${STORE}','${id}',1,'${held}','${LINE}','${held}',repeat('c',64),'hosted_checkout','held',30,30,'TRY',pg_catalog.jsonb_build_object('promotionId','${id}','discountMinor',30),repeat('b',64),'reserved','2026-09-06T00:00:00Z','2026-01-01','2026-01-01'),
        ('${expired}','${STORE}','${id}',1,'${expired}','${LINE}','${expired}',repeat('d',64),'hosted_checkout','expired',999,999,'TRY',pg_catalog.jsonb_build_object('promotionId','${id}','discountMinor',999),repeat('b',64),'reserved','2026-09-01T00:00:00Z','2026-01-01','2026-01-01'); COMMIT;`);
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
  scenario("bundle price charges the remainder at full price and applies only complete bundles", () => { const id="70000000-0000-4000-8000-000000000216", document=JSON.parse(rule({kind:"bundle_price",bundleQuantity:3,bundlePriceMinor:200,currency:"TRY"})); psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${id}','${STORE}','complete bundles','active',1,'${JSON.stringify(document)}','2026-01-01','2026-01-01');`); activate(box,id); const value=evaluate(box,{cartLines:[{...context().cartLines[0],quantity:4}]}); assert.equal(value.lineDiscountTotalMinor,100); assert.equal(value.grandTotalMinor,340); parseContract(value); });
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
  scenario("non-combinable complex benefits rank by their fully capped customer saving", () => { const bundle="70000000-0000-4000-8000-000000000213", tier="70000000-0000-4000-8000-000000000214", capped=JSON.parse(rule({kind:"bundle_price",bundleQuantity:3,bundlePriceMinor:0,currency:"TRY"})), better=JSON.parse(rule({kind:"quantity_tiers",tiers:[{minimumQuantity:2,percentageBps:1000}]})); capped.priority=100; capped.limits={totalUsage:null,perCustomerUsage:null,budgetMinor:10,orderMaximumMinor:null}; psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${bundle}','${STORE}','capped bundle','active',1,'${JSON.stringify(capped)}','2026-01-01','2026-01-01'),('${tier}','${STORE}','tier','active',1,'${JSON.stringify(better)}','2026-01-01','2026-01-01');`); activate(box,bundle); psql(box,`UPDATE saas.promotions SET status='active' WHERE id='${tier}'`); const value=evaluate(box,{cartLines:[{...context().cartLines[0],quantity:4}]}); assert.equal(value.appliedPromotions[0].promotionId,tier); assert.equal(value.discountTotalMinor,40); parseContract(value); });
  scenario("bundle ranking uses only complete-bundle value before choosing a non-combinable winner", () => { const bundle="70000000-0000-4000-8000-000000000219", tier="70000000-0000-4000-8000-000000000220", bundleRule=JSON.parse(rule({kind:"bundle_price",bundleQuantity:3,bundlePriceMinor:0,currency:"TRY"})), tierRule=JSON.parse(rule({kind:"quantity_tiers",tiers:[{minimumQuantity:2,percentageBps:9000}]})); psql(box,`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES('${bundle}','${STORE}','bundle rank','active',1,'${JSON.stringify(bundleRule)}','2026-01-01','2026-01-01'),('${tier}','${STORE}','tier rank','active',1,'${JSON.stringify(tierRule)}','2026-01-01','2026-01-01');`); activate(box,bundle); psql(box,`UPDATE saas.promotions SET status='active' WHERE id='${tier}'`); const value=evaluate(box,{cartLines:[{...context().cartLines[0],quantity:4}]}); assert.equal(value.appliedPromotions[0].promotionId,tier); assert.equal(value.discountTotalMinor,360); });
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
    const constraints = "'promotion_code_batches_operation_store_fk','promotion_codes_batch_store_fk','promotion_usage_reservations_version_store_fk','promotion_usage_reservations_code_store_fk','promotion_usage_reservations_operation_store_fk','promotion_usage_reservations_customer_store_fk','promotion_redemptions_version_store_fk','promotion_redemptions_code_store_fk','promotion_redemptions_reservation_store_fk','promotion_redemptions_operation_store_fk','promotion_redemptions_customer_store_fk','promotion_redemptions_order_store_fk','order_promotion_snapshots_order_store_fk','order_promotion_snapshots_version_store_fk','order_discount_allocations_snapshot_store_fk','order_discount_allocations_order_store_fk','order_discount_allocations_line_store_fk'";
    assert.equal(scalar(box, `SELECT count(*)||':'||count(*) FILTER (WHERE convalidated) FROM pg_catalog.pg_constraint WHERE connamespace='saas'::regnamespace AND conname IN (${constraints})`), "17:17");
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
    assert.equal(scalar(box, "SELECT pg_catalog.string_agg(DISTINCT proc.proname,',' ORDER BY proc.proname) FROM pg_catalog.pg_proc proc WHERE proc.pronamespace='saas'::regnamespace AND proc.proname LIKE 'promotion_%' AND pg_catalog.has_function_privilege('celebix_saas_app',proc.oid,'EXECUTE')"), "promotion_analytics_v1,promotion_code_batch_status_v1,promotion_codes_csv_v1,promotion_conflicts_v1,promotion_create_code_batch_v1,promotion_create_v1,promotion_detail_v1,promotion_duplicate_v1,promotion_legacy_list_v1,promotion_lifecycle_v1,promotion_list_v1,promotion_margin_check_v1,promotion_picker_list_v1,promotion_picker_resolve_v1,promotion_recover_operation_v1,promotion_simulate_v1,promotion_update_v1");
    assert.equal(scalar(box,"SELECT pg_catalog.has_function_privilege('celebix_saas_app','saas.promotion_picker_source_v1(uuid,text)'::regprocedure,'EXECUTE')"),"f");
    for (const role of ["celebix_saas_identity","celebix_saas_host_resolver"]) assert.equal(scalar(box, `SELECT count(*) FROM pg_catalog.pg_proc proc WHERE proc.pronamespace='saas'::regnamespace AND proc.proname LIKE 'promotion_%' AND pg_catalog.has_function_privilege('${role}',proc.oid,'EXECUTE')`), "0", role);
    const settlementSignatures = ["promotion_reserve_v1(uuid,uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,timestamp with time zone)","promotion_release_reservation_v1(uuid,uuid,uuid,timestamp with time zone)","promotion_commit_reservation_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,timestamp with time zone)","promotion_expire_due_reservations_v1(timestamp with time zone,integer)"];
    for (const role of ["celebix_saas_app","celebix_saas_identity","celebix_saas_host_resolver"]) for (const signature of settlementSignatures) assert.equal(scalar(box, `SELECT pg_catalog.has_function_privilege('${role}','saas.${signature}'::regprocedure,'EXECUTE')`), "f", `${role}:${signature}`);
    for (const signature of settlementSignatures) assert.equal(scalar(box, `SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_proc proc CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(proc.proacl,pg_catalog.acldefault('f',proc.proowner))) acl WHERE proc.oid='saas.${signature}'::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE')`), "f", `PUBLIC:${signature}`);
    assert.equal(scalar(box, `WITH promotion_tables AS (SELECT oid,relacl FROM pg_catalog.pg_class WHERE relnamespace='saas'::regnamespace AND relname IN ('promotions','promotion_versions','promotion_targets','promotion_codes','promotion_code_batches','promotion_usage_reservations','promotion_redemptions','promotion_audit_events','promotion_operations','order_promotion_snapshots','order_discount_allocations')), named_roles(role_name) AS (VALUES('celebix_saas_app'),('celebix_saas_workflow'),('celebix_saas_identity'),('celebix_saas_host_resolver')), privileges(privilege_name) AS (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) SELECT (SELECT count(*) FROM promotion_tables table_row CROSS JOIN named_roles role_row CROSS JOIN privileges privilege_row WHERE pg_catalog.has_table_privilege(role_row.role_name,table_row.oid,privilege_row.privilege_name))+(SELECT count(*) FROM promotion_tables table_row CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(table_row.relacl,'{}'::aclitem[])) acl WHERE acl.grantee=0)`), "0");
    assert.equal(scalar(box, "SET ROLE celebix_saas_workflow; SELECT saas.promotion_expire_due_reservations_v1('2026-09-05T00:00:00Z',100); RESET ROLE"), "0");
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
      ["customer_tag",LINE,"Promotion tag"],["masked_customer",LINE,"Maskeli müşteri ••••0126"],["payment_method",PAYMENT_METHOD,"Promotion payment"],
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
  scenario("editor and analyst receive semantic mutation and export denial", () => {
    for (const role of ["editor","analyst"]) {
      const offset = role === "editor" ? "128" : "129";
      assert.equal(appScalar(box,createCall(box,role,`90000000-0000-4000-8000-000000000${offset}`,`91000000-0000-4000-8000-000000000${offset}`,`${role} denied`)),"membership_denied:");
      assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_codes_csv_v1(${authorityArguments(role)},'90000000-0000-4000-8000-000000000999')`),"membership_denied");
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
    assert.equal(scalar(box,`SELECT pg_catalog.concat_ws(',',saas.promotion_operation_recovery_action('create'),saas.promotion_operation_recovery_action('update'),saas.promotion_operation_recovery_action('lifecycle'),saas.promotion_operation_recovery_action('archive'),saas.promotion_operation_recovery_action('duplicate'),saas.promotion_operation_recovery_action('code_batch'),saas.promotion_operation_recovery_action('code_batch_status'),COALESCE(saas.promotion_operation_recovery_action('reserve'),'denied'))`),"promotions.manage,promotions.manage,promotions.manage,promotions.archive,promotions.manage,promotions.manage,promotions.manage,denied");
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
  scenario("operation recovery rechecks mutation authority for read-only roles", () => {
    assert.equal(appScalar(box,`SELECT outcome FROM saas.promotion_recover_operation_v1(${authorityArguments("editor")},'91000000-0000-4000-8000-000000000131','create','${semanticCreateFingerprint(box,"Semantic replay")}')`),"membership_denied");
  });
  scenario("CRUD materializes exact current targets direct codes and authoritative shipping references", () => {
    const promotion = "a1000000-0000-4000-8000-000000000001", operation = "a2000000-0000-4000-8000-000000000001";
    const document = validRuleDocument();
    document.benefit = { kind: "gift", giftVariantId: LINE };
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
      (document) => { document.benefit = { kind: "gift", giftVariantId: OTHER_PRODUCT }; },
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
    const batch = "a5000000-0000-4000-8000-000000000120", batchOperation = "a6000000-0000-4000-8000-000000000120", batchCode = "a4000000-0000-4000-8000-000000000120";
    psql(box, `INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${batchOperation}','${STORE}','${batchOperation}','code_batch',repeat('1',64),'code_batch','${batch}',pg_catalog.jsonb_build_object('id','${batch}','promotionId','${promotion}','status','active','count',1,'createdAt','2026-09-05T00:00:00.000Z'),'2026-09-05'); INSERT INTO saas.promotion_code_batches(id,store_id,promotion_id,status,requested_count,operation_id,created_at) VALUES('${batch}','${STORE}','${promotion}','active',1,'${batchOperation}','2026-09-05'); INSERT INTO saas.promotion_codes(id,store_id,promotion_id,batch_id,code,status,created_at) VALUES('${batchCode}','${STORE}','${promotion}','${batch}','BATCHKEEP','active','2026-09-05')`);
    const automatic = validRuleDocument();
    assert.equal(appScalar(box, updateCall(box, "store_owner", promotion, "a2000000-0000-4000-8000-000000000121", 2, "Automatic blocked", automatic)), "active_code_batches:");
    const codeList=()=>listPage(box,"analyst",{search:"Materialized update",limit:1}).items[0].activeCodeCount;
    assert.equal(codeList(),3);
    const holdOperation="a7000000-0000-4000-8000-000000000120", hold="a7000000-0000-4000-8000-000000000121";
    psql(box,`BEGIN; INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${holdOperation}','${STORE}','${holdOperation}','reserve',repeat('7',64),'reservation_group','${holdOperation}','${reservationOperationResult(holdOperation,[{promotionId:promotion,reservationId:hold,promotionVersion:2,normalizedCode:"DIRECT20",discountMinor:1}])}'::jsonb,'2026-09-05T00:00:00Z'); INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,code_id,normalized_code,reservation_group_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_uses,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES('${hold}','${STORE}','${promotion}',2,'${retainedId}','DIRECT20','${holdOperation}','${holdOperation}',repeat('7',64),'hosted_checkout','active-code-count',1,1,1,'TRY','{}',repeat('b',64),'reserved','2026-09-06T00:00:00Z','2026-09-05T00:00:00Z','2026-09-05T00:00:00Z'); COMMIT;`);
    assert.equal(codeList(),3); psql(box,`UPDATE saas.promotion_usage_reservations SET status='committed',updated_at='2026-09-05T00:00:01Z' WHERE store_id='${STORE}' AND id='${hold}'`); assert.equal(codeList(),3);
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
    const invalidGift = validRuleDocument(); invalidGift.benefit = { kind: "gift", giftVariantId: OTHER_PRODUCT };
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
    psql(box, `BEGIN; INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at)
      VALUES('${operation}','${STORE}','${operation}','reserve',repeat('9',64),'reservation_group','${group}','${reservationOperationResult(group,[{promotionId:firstPromotion,reservationId:firstReservation,discountMinor:10},{promotionId:secondPromotion,reservationId:secondReservation,discountMinor:20}])}'::jsonb,'2026-09-05');
      INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,code_id,normalized_code,reservation_group_id,customer_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_uses,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES
      ('${firstReservation}','${STORE}','${firstPromotion}',1,NULL,NULL,'${group}',NULL,'${operation}',repeat('9',64),'hosted_checkout','checkout:group',1,10,10,'TRY',pg_catalog.jsonb_build_object('promotionId','${firstPromotion}','discountMinor',10),repeat('b',64),'reserved','2026-09-06T00:00:00Z','2026-09-05','2026-09-05'),
      ('${secondReservation}','${STORE}','${secondPromotion}',1,NULL,NULL,'${group}',NULL,'${operation}',repeat('9',64),'hosted_checkout','checkout:group',1,20,20,'TRY',pg_catalog.jsonb_build_object('promotionId','${secondPromotion}','discountMinor',20),repeat('b',64),'reserved','2026-09-06T00:00:00Z','2026-09-05','2026-09-05'); COMMIT;`);
    assert.equal(scalar(box, `SELECT count(*)||':'||sum(discount_minor) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND reservation_group_id='${group}'`), "2:30");
    assert.equal(scalar(box, `SELECT count(DISTINCT evaluator_fingerprint)||':'||min(evaluator_fingerprint) FROM saas.promotion_usage_reservations WHERE store_id='${STORE}' AND reservation_group_id='${group}'`), `1:${"b".repeat(64)}`);
    assert.equal(scalar(box, `SELECT result_entity_kind||':'||result_entity_id FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_id='${operation}'`), `reservation_group:${group}`);
    assert.equal(scalar(box, `SELECT saas.promotion_operation_result_valid('reserve',result_payload) FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_id='${operation}'`), "t");
    assert.equal(scalar(box, `SELECT saas.promotion_operation_result_valid('reserve','${reservationOperationResult(group,[{promotionId:firstPromotion,reservationId:firstReservation,discountMinor:10},{promotionId:firstPromotion,reservationId:secondReservation,discountMinor:20}])}'::jsonb)`), "f");
    const incompleteOperation="92000000-0000-4000-8000-000000000175", incompleteGroup="92000000-0000-4000-8000-000000000176", incompleteFirst="93000000-0000-4000-8000-000000000182", incompleteSecond="93000000-0000-4000-8000-000000000183";
    const incompleteReserveResult=psql(box,`BEGIN;
      INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${incompleteOperation}','${STORE}','${incompleteOperation}','reserve',repeat('5',64),'reservation_group','${incompleteGroup}','${reservationOperationResult(incompleteGroup,[{promotionId:firstPromotion,reservationId:incompleteFirst,discountMinor:10},{promotionId:secondPromotion,reservationId:incompleteSecond,discountMinor:20}])}'::jsonb,'2026-09-05');
      INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,reservation_group_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES('${incompleteFirst}','${STORE}','${firstPromotion}',1,'${incompleteGroup}','${incompleteOperation}',repeat('5',64),'hosted_checkout','checkout:incomplete',10,10,'TRY','{}',repeat('b',64),'reserved','2026-09-06T00:00:00Z','2026-09-05','2026-09-05');
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
    assert.notEqual(incompleteRedemptionResult.status,0); assert.match(incompleteRedemptionResult.stderr,/promotion redemption group is incomplete/);
    assert.match(incompleteRedemptionResult.stdout,/INCOMPLETE_REDEMPTION_ROW_INSERTED/);
    assert.equal(scalar(box,`SELECT count(*) FROM saas.promotion_operations WHERE store_id='${STORE}' AND operation_id='${incompleteCommit}'`),"0");
    assert.notEqual(psql(box, `INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('92000000-0000-4000-8000-000000000177','${STORE}','92000000-0000-4000-8000-000000000177','reserve',repeat('7',64),'reservation_group','${group}','${reservationOperationResult(group,[{promotionId:firstPromotion,reservationId:"93000000-0000-4000-8000-000000000177",discountMinor:1}])}'::jsonb,'2026-09-05')`,DB,true).status,0);
    const releaseOperation = "92000000-0000-4000-8000-000000000178";
    psql(box, `BEGIN; UPDATE saas.promotion_usage_reservations SET status='released',updated_at='2026-09-05T00:00:02Z' WHERE store_id='${STORE}' AND reservation_group_id='${group}'; INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${releaseOperation}','${STORE}','${releaseOperation}','release',repeat('6',64),'reservation_group','${group}','${reservationOperationResult(group,[{promotionId:firstPromotion,reservationId:firstReservation,discountMinor:10},{promotionId:secondPromotion,reservationId:secondReservation,discountMinor:20}],"released")}'::jsonb,'2026-09-05'); COMMIT;`);
    assert.notEqual(psql(box, `INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,reservation_group_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES('93000000-0000-4000-8000-000000000178','${STORE}','90000000-0000-4000-8000-000000000131',1,'${group}','${releaseOperation}',repeat('6',64),'hosted_checkout','checkout:wrong-kind',1,1,'TRY','{}',repeat('b',64),'reserved','2026-09-06','2026-09-05','2026-09-05')`,DB,true).status,0);
    assert.notEqual(psql(box, `INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,reservation_group_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES('93000000-0000-4000-8000-000000000179','${STORE}','90000000-0000-4000-8000-000000000131',1,'${group}','${operation}',repeat('8',64),'hosted_checkout','checkout:wrong-fingerprint',1,1,'TRY','{}',repeat('b',64),'reserved','2026-09-06','2026-09-05','2026-09-05')`,DB,true).status,0);
  });
  scenario("reservation facts are immutable and terminal transitions cannot reopen", () => {
    const promotion = "90000000-0000-4000-8000-000000000126", operation = "92000000-0000-4000-8000-000000000126", reservation = "93000000-0000-4000-8000-000000000126";
    psql(box,`BEGIN; INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${operation}','${STORE}','${operation}','reserve',repeat('a',64),'reservation_group','${operation}','${reservationOperationResult(operation,[{promotionId:promotion,reservationId:reservation,discountMinor:30}])}'::jsonb,'2026-09-05'); INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,code_id,normalized_code,reservation_group_id,customer_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_uses,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES('${reservation}','${STORE}','${promotion}',1,NULL,NULL,'${operation}','${LINE}','${operation}',repeat('a',64),'hosted_checkout','checkout:test',1,30,30,'TRY','{"promotionId":"${promotion}","discountMinor":30}'::jsonb,repeat('b',64),'reserved','2026-09-06T00:00:00Z','2026-09-05','2026-09-05'); COMMIT;`);
    assert.notEqual(psql(box,`UPDATE saas.promotion_usage_reservations SET discount_minor=31 WHERE store_id='${STORE}' AND id='${reservation}'`,DB,true).status,0);
    assert.notEqual(psql(box,`UPDATE saas.promotion_usage_reservations SET evaluator_snapshot='{}'::jsonb WHERE store_id='${STORE}' AND id='${reservation}'`,DB,true).status,0);

    const batchOperation="92000000-0000-4000-8000-000000000127", batch="93000000-0000-4000-8000-000000000127", code="93000000-0000-4000-8000-000000000128", foreignCustomer="96000000-0000-4000-8000-000000000126";
    psql(box,`INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${batchOperation}','${STORE}','${batchOperation}','code_batch',repeat('1',64),'code_batch','${batch}',pg_catalog.jsonb_build_object('id','${batch}','promotionId','${promotion}','status','active','count',1,'createdAt','2026-09-05T00:00:00.000Z'),'2026-09-05');
      INSERT INTO saas.promotion_code_batches(id,store_id,promotion_id,status,requested_count,operation_id,created_at) VALUES('${batch}','${STORE}','${promotion}','active',1,'${batchOperation}','2026-09-05');
      INSERT INTO saas.promotion_codes(id,store_id,promotion_id,batch_id,code,status,created_at) VALUES('${code}','${STORE}','${promotion}','${batch}','BOUND','active','2026-09-05');
      INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,created_at,updated_at) VALUES('${foreignCustomer}','${OTHER_STORE}','active','Foreign','Customer','foreign-binding@test.invalid','2026-09-05','2026-09-05')`);
    assert.notEqual(psql(box,`INSERT INTO saas.promotion_codes(id,store_id,promotion_id,batch_id,code,status,created_at) VALUES('93000000-0000-4000-8000-000000000129','${STORE}','90000000-0000-4000-8000-000000000127','${batch}','CROSSPROMO','active','2026-09-05')`,DB,true).status,0);

    const crossCodeOperation="92000000-0000-4000-8000-000000000128", crossCodeReservation="93000000-0000-4000-8000-000000000130";
    assert.notEqual(psql(box,`BEGIN; INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${crossCodeOperation}','${STORE}','${crossCodeOperation}','reserve',repeat('2',64),'reservation_group','${crossCodeOperation}','${reservationOperationResult(crossCodeOperation,[{promotionId:"90000000-0000-4000-8000-000000000127",reservationId:crossCodeReservation,normalizedCode:"BOUND",discountMinor:1}])}'::jsonb,'2026-09-05'); INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,code_id,normalized_code,reservation_group_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES('${crossCodeReservation}','${STORE}','90000000-0000-4000-8000-000000000127',1,'${code}','BOUND','${crossCodeOperation}','${crossCodeOperation}',repeat('2',64),'hosted_checkout','checkout:cross-code',1,1,'TRY','{}',repeat('b',64),'reserved','2026-09-06T00:00:00Z','2026-09-05','2026-09-05'); COMMIT;`,DB,true).status,0);

    const crossCustomerOperation="92000000-0000-4000-8000-000000000129", crossCustomerReservation="93000000-0000-4000-8000-000000000131";
    assert.notEqual(psql(box,`BEGIN; INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${crossCustomerOperation}','${STORE}','${crossCustomerOperation}','reserve',repeat('4',64),'reservation_group','${crossCustomerOperation}','${reservationOperationResult(crossCustomerOperation,[{promotionId:promotion,reservationId:crossCustomerReservation,discountMinor:1}])}'::jsonb,'2026-09-05'); INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,reservation_group_id,customer_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES('${crossCustomerReservation}','${STORE}','${promotion}',1,'${crossCustomerOperation}','${foreignCustomer}','${crossCustomerOperation}',repeat('4',64),'hosted_checkout','checkout:cross-customer',1,1,'TRY','{}',repeat('b',64),'reserved','2026-09-06T00:00:00Z','2026-09-05','2026-09-05'); COMMIT;`,DB,true).status,0);

    const foreignOrder="97000000-0000-4000-8000-000000000126", firstOrder="97000000-0000-4000-8000-000000000127", secondOrder="97000000-0000-4000-8000-000000000128", firstLine="97000000-0000-4000-8000-000000000129", snapshot="97000000-0000-4000-8000-000000000130", crossOrderGroup="97000000-0000-4000-8000-000000000134", crossOrderRedemption="97000000-0000-4000-8000-000000000132", redemptionGroup="97000000-0000-4000-8000-000000000135", redemption="97000000-0000-4000-8000-000000000136";
    const orderValues=(id,store,number)=>`('${id}','${store}','${number}','storefront','Promotion','promotion-order@test.invalid','TRY',100,0,0,100,'pending','pending','{}','2026-09-05','2026-09-05')`;
    psql(box,`INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at) VALUES ${orderValues(foreignOrder,OTHER_STORE,"PROMO-OTHER")},${orderValues(firstOrder,STORE,"PROMO-FIRST")},${orderValues(secondOrder,STORE,"PROMO-SECOND")};
      INSERT INTO saas.order_items(id,store_id,order_id,position,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at) VALUES('${firstLine}','${STORE}','${firstOrder}',0,'Promotion item',100,1,0,100,'2026-09-05');
      INSERT INTO saas.order_promotion_snapshots(id,store_id,order_id,promotion_id,promotion_version,normalized_code,currency,discount_minor,evaluator_fingerprint,snapshot,created_at) VALUES('${snapshot}','${STORE}','${secondOrder}','${promotion}',1,NULL,'TRY',1,repeat('6',64),'{}','2026-09-05');
      UPDATE saas.promotion_usage_reservations SET status='committed',updated_at='2026-09-05T00:00:01Z' WHERE store_id='${STORE}' AND id='${reservation}'`);
    assert.notEqual(psql(box,`INSERT INTO saas.order_promotion_snapshots(id,store_id,order_id,promotion_id,promotion_version,normalized_code,currency,discount_minor,evaluator_fingerprint,snapshot,created_at) VALUES('97000000-0000-4000-8000-000000000131','${STORE}','${foreignOrder}','${promotion}',1,NULL,'TRY',1,repeat('7',64),'{}','2026-09-05')`,DB,true).status,0);
    assert.notEqual(psql(box,`BEGIN; INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${crossOrderGroup}','${STORE}','${crossOrderGroup}','commit',repeat('7',64),'redemption_group','${crossOrderGroup}','${redemptionOperationResult(operation,crossOrderGroup,foreignOrder,[{promotionId:promotion,reservationId:reservation,redemptionId:crossOrderRedemption,discountMinor:30}])}'::jsonb,'2026-09-05'); INSERT INTO saas.promotion_redemptions(id,store_id,promotion_id,reservation_id,reservation_group_id,redemption_group_id,operation_id,operation_fingerprint,promotion_version,code_id,normalized_code,order_id,customer_id,discount_minor,currency,evaluator_fingerprint,created_at) VALUES('${crossOrderRedemption}','${STORE}','${promotion}','${reservation}','${operation}','${crossOrderGroup}','${crossOrderGroup}',repeat('7',64),1,NULL,NULL,'${foreignOrder}','${LINE}',30,'TRY',repeat('b',64),'2026-09-05'); COMMIT;`,DB,true).status,0);
    assert.notEqual(psql(box,`INSERT INTO saas.order_discount_allocations(id,store_id,order_id,snapshot_id,line_id,line_position,discount_minor,created_at) VALUES('97000000-0000-4000-8000-000000000133','${STORE}','${secondOrder}','${snapshot}','${firstLine}',0,1,'2026-09-05')`,DB,true).status,0);
    const commitOperationInsert=`INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('${redemptionGroup}','${STORE}','${redemptionGroup}','commit',repeat('8',64),'redemption_group','${redemptionGroup}','${redemptionOperationResult(operation,redemptionGroup,secondOrder,[{promotionId:promotion,reservationId:reservation,redemptionId:redemption,discountMinor:30}])}'::jsonb,'2026-09-05')`;
    const redemptionInsert=(overrides={})=>`INSERT INTO saas.promotion_redemptions(id,store_id,promotion_id,reservation_id,reservation_group_id,redemption_group_id,operation_id,operation_fingerprint,promotion_version,code_id,normalized_code,order_id,customer_id,discount_minor,currency,evaluator_fingerprint,created_at) VALUES('${redemption}','${STORE}','${promotion}','${reservation}','${operation}','${redemptionGroup}','${redemptionGroup}',repeat('8',64),${overrides.promotionVersion ?? 1},NULL,NULL,'${secondOrder}','${overrides.customerId ?? LINE}',${overrides.discountMinor ?? 30},'${overrides.currency ?? "TRY"}',repeat('${overrides.evaluatorCharacter ?? "b"}',64),'2026-09-05')`;
    for (const forged of [{promotionVersion:2},{customerId:foreignCustomer},{discountMinor:31},{currency:"USD"},{evaluatorCharacter:"c"}]) assert.notEqual(psql(box,`BEGIN; ${commitOperationInsert}; ${redemptionInsert(forged)}; COMMIT;`,DB,true).status,0);
    psql(box,`BEGIN; ${commitOperationInsert}; ${redemptionInsert()}; COMMIT;`);
    assert.equal(scalar(box,`SELECT promotion_version||':'||discount_minor||':'||currency||':'||evaluator_fingerprint FROM saas.promotion_redemptions WHERE store_id='${STORE}' AND id='${redemption}'`),`1:30:TRY:${"b".repeat(64)}`);
    const promotionName = scalar(box, `SELECT name FROM saas.promotions WHERE store_id='${STORE}' AND id='${promotion}'`);
    const financialItem = listPage(box, "analyst", { search: promotionName, limit: 100 }).items.find((item) => item.id === promotion);
    assert.deepEqual(financialItem.financials, [{ currency: "TRY", redemptions: 1, discountMinor: 30, revenueMinor: 100 }]);
    assert.deepEqual(financialItem.usage, { used: 1, budgetMinor: 30 });
    assert.notEqual(psql(box,`INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('97000000-0000-4000-8000-000000000137','${STORE}','97000000-0000-4000-8000-000000000137','commit',repeat('9',64),'redemption_group','${redemptionGroup}','${redemptionOperationResult(operation,redemptionGroup,secondOrder,[{promotionId:promotion,reservationId:reservation,redemptionId:"97000000-0000-4000-8000-000000000137",discountMinor:30}])}'::jsonb,'2026-09-05')`,DB,true).status,0);
    assert.notEqual(psql(box,`UPDATE saas.promotion_usage_reservations SET status='released',updated_at='2026-09-05T00:00:02Z' WHERE store_id='${STORE}' AND id='${reservation}'`,DB,true).status,0);
  });
  scenario("operation audit and evaluator payload bounds reject oversized persistence", () => {
    assert.notEqual(psql(box,`INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('92000000-0000-4000-8000-000000000190','${STORE}','92000000-0000-4000-8000-000000000190','create',repeat('c',64),'promotion','90000000-0000-4000-8000-000000000126',pg_catalog.jsonb_build_object('data',repeat('x',340000)),'2026-09-05')`,DB,true).status,0);
    assert.notEqual(psql(box,`INSERT INTO saas.promotion_audit_events(id,store_id,promotion_id,event_kind,payload,created_at) VALUES('92000000-0000-4000-8000-000000000191','${STORE}','90000000-0000-4000-8000-000000000126','bounded',pg_catalog.jsonb_build_object('data',repeat('x',40000)),'2026-09-05')`,DB,true).status,0);
    assert.notEqual(psql(box,`BEGIN; INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at) VALUES('92000000-0000-4000-8000-000000000192','${STORE}','92000000-0000-4000-8000-000000000192','reserve',repeat('d',64),'reservation_group','92000000-0000-4000-8000-000000000192','${reservationOperationResult("92000000-0000-4000-8000-000000000192",[{promotionId:"90000000-0000-4000-8000-000000000126",reservationId:"93000000-0000-4000-8000-000000000192",discountMinor:1}])}'::jsonb,'2026-09-05'); INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,reservation_group_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_uses,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at) VALUES('93000000-0000-4000-8000-000000000192','${STORE}','90000000-0000-4000-8000-000000000126',1,'92000000-0000-4000-8000-000000000192','92000000-0000-4000-8000-000000000192',repeat('d',64),'hosted_checkout','checkout:oversized',1,1,1,'TRY',pg_catalog.jsonb_build_object('data',repeat('x',270000)),repeat('b',64),'reserved','2026-09-06T00:00:00Z','2026-09-05','2026-09-05'); COMMIT;`,DB,true).status,0);
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
  assert.equal(completed, TOTAL);
  process.stdout.write([`PROMOTIONS_STUDIO_POSTGRESQL16_COMPLETE ${completed}/${TOTAL}`, ""].join(String.fromCharCode(10)));
} finally { stop(box); }
