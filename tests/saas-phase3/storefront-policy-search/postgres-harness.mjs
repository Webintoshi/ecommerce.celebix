import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const DB = "storefront_policy_search";
const RESTORE_DB = "storefront_policy_search_restore";
const UP = "202607310071_storefront_policy_search.up.sql";
const DOWN = "202607310071_storefront_policy_search.down.sql";
const ASSERTIONS = "202607310071_storefront_policy_search_assertions.sql";
const MANIFEST = "phase4a-storefront-policy-search-manifest.json";
const STORE_A = "10000000-0000-4000-8000-000000000071";
const STORE_B = "10000000-0000-4000-8000-000000000072";
const HOST_A = "guzide-policy.saas-staging.celebix.site";
const HOST_B = "other-policy.saas-staging.celebix.site";
const PLAN = "00000000-0000-4000-8000-000000000001";
const PRINCIPAL_A = "20000000-0000-4000-8000-000000000071";
const PRINCIPAL_B = "20000000-0000-4000-8000-000000000072";
const MEMBERSHIP_A = "30000000-0000-4000-8000-000000000071";
const MEMBERSHIP_B = "30000000-0000-4000-8000-000000000072";
const PRODUCT_A = "40000000-0000-4000-8000-000000000071";
const PRODUCT_A2 = "40000000-0000-4000-8000-000000000073";
const PRODUCT_B = "40000000-0000-4000-8000-000000000072";
const UNPROJECTABLE_PRODUCT = "40000000-0000-4000-8000-000000000074";
const VARIANT_A = "50000000-0000-4000-8000-000000000071";
const VARIANT_A_UNAVAILABLE = "50000000-0000-4000-8000-000000000074";
const VARIANT_A2 = "50000000-0000-4000-8000-000000000073";
const VARIANT_B = "50000000-0000-4000-8000-000000000072";
const NOW = "2026-07-31T12:00:00.000Z";
const TOTAL = 32;
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
  const root = mkdtempSync(path.join(tmpdir(), "celebix-policy-search-"));
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
    return Number.isSafeInteger(sequence) && sequence <= 70 && accepted.test(file) && !file.includes(".down.");
  }).sort((left, right) => {
    const a = Number.parseInt(left.slice(8, 12), 10), b = Number.parseInt(right.slice(8, 12), 10);
    if (a !== b) return a - b;
    const weight = (value) => value.includes("assertions") ? 3 : value.includes("freeze") || value.includes("grants") ? 2 : 1;
    return weight(left) - weight(right) || left.localeCompare(right);
  });
}
function authority(store = STORE_A, principal = PRINCIPAL_A, membership = MEMBERSHIP_A) { return `'${store}','${principal}','${membership}','${PLAN}','free_starter',1`; }
function envelope(result) { const line = result.stdout.trim().split("\n").at(-1); return line ? JSON.parse(line) : null; }
function list(box, store = STORE_A, principal = PRINCIPAL_A, membership = MEMBERSHIP_A) { return envelope(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'result_payload',result_payload) FROM saas.store_policy_list_admin(${authority(store, principal, membership)},'${NOW}');COMMIT;`)); }
function save(box, { operation = "70000000-0000-4000-8000-000000000071", fingerprint = "a".repeat(64), key = "kvkk", expected = 1, body = "## KVKK\n\nGüncel metin.", status = "published", store = STORE_A, principal = PRINCIPAL_A, membership = MEMBERSHIP_A } = {}) { const encoded = body.replaceAll("'", "''"); return envelope(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'result_payload',result_payload) FROM saas.store_policy_save(${authority(store, principal, membership)},'${NOW}','${operation}','${fingerprint}','${key}',${expected},'${encoded}','${status}');COMMIT;`)); }
function recover(box, operation = "70000000-0000-4000-8000-000000000071", fingerprint = "a".repeat(64)) { return envelope(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'result_payload',result_payload) FROM saas.store_policy_recover(${authority()},'${NOW}','${operation}','${fingerprint}');COMMIT;`)); }
function publicCall(box, expression, database = DB) { return envelope(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT jsonb_build_object('outcome',outcome,'result_payload',result_payload) FROM ${expression};COMMIT;`, database)); }
async function scenario(name, run) { await run(); completed += 1; console.log(`PASS ${completed}/${TOTAL} ${name}`); }

function seedBeforeMigration(box) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${STORE_A}','Güzide','guzide-policy','active','tr','TRY','starter','2026-01-01','2026-01-01');
INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${PRINCIPAL_A}','https://identity.example.test/oidc','policy-a','policy-a@example.test',true,'2026-01-01','2026-01-01');
INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${MEMBERSHIP_A}','${PRINCIPAL_A}','${STORE_A}','store_owner','active','2026-01-01','2026-01-01');
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('60000000-0000-4000-8000-000000000071','${STORE_A}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES('61000000-0000-4000-8000-000000000071','${STORE_A}','${HOST_A}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
INSERT INTO saas.products(id,store_id,slug,title,description,status,currency,version,archived_at,created_at,updated_at) VALUES('${PRODUCT_A}','${STORE_A}','altin-yuzuk','Altın Yüzük','Özel tasarım','active','TRY',1,NULL,'2026-01-02','2026-01-02'),('${PRODUCT_A2}','${STORE_A}','gumus-kolye','Gümüş Kolye',NULL,'active','TRY',1,NULL,'2026-01-01','2026-01-01'),('${UNPROJECTABLE_PRODUCT}','${STORE_A}','fiyatsiz-urun','Fiyatsız Ürün',NULL,'active','TRY',1,NULL,'2026-01-04','2026-01-04');
SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);SELECT pg_catalog.set_config('saas.inventory.source_id','62000000-0000-4000-8000-000000000071',true);SELECT pg_catalog.set_config('saas.inventory.source_time','${NOW}',true);
INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES('${VARIANT_A}','${PRODUCT_A}','${STORE_A}','14 Ayar','YZK-1090',1127100,true,3,'active','{}',1,'2026-01-02','2026-01-02'),('${VARIANT_A_UNAVAILABLE}','${PRODUCT_A}','${STORE_A}','Tükenen Fırsat','YZK-OOS',100000,true,0,'active','{}',1,'2026-01-01','2026-01-01'),('${VARIANT_A2}','${PRODUCT_A2}','${STORE_A}','Standart','KLK-100',200000,false,0,'active','{}',1,'2026-01-01','2026-01-01');
SELECT pg_catalog.set_config('saas.inventory.source_marker','',true);SELECT pg_catalog.set_config('saas.inventory.source_id','',true);SELECT pg_catalog.set_config('saas.inventory.source_time','',true);COMMIT;`);
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.catalog_categories(id,store_id,parent_id,name,slug,position,status,version,created_at,updated_at) VALUES('63000000-0000-4000-8000-000000000071','${STORE_A}',NULL,'Yüzükler','yuzukler',0,'active',1,'2026-01-01','2026-01-01');
INSERT INTO saas.catalog_product_categories(store_id,product_id,category_id,position) VALUES('${STORE_A}','${PRODUCT_A}','63000000-0000-4000-8000-000000000071',0);
INSERT INTO saas.catalog_admin_resources(id,store_id,resource_kind,name,slug,config,status,version,created_at,updated_at) VALUES('64000000-0000-4000-8000-000000000071','${STORE_A}','brand','Güzide Atelier','guzide-atelier','{}','active',1,'2026-01-01','2026-01-01'),('64000000-0000-4000-8000-000000000072','${STORE_A}','tag','El Yapımı','el-yapimi','{}','active',1,'2026-01-01','2026-01-01');
INSERT INTO saas.catalog_admin_resource_products(store_id,resource_id,product_id,position) VALUES('${STORE_A}','64000000-0000-4000-8000-000000000071','${PRODUCT_A}',0),('${STORE_A}','64000000-0000-4000-8000-000000000072','${PRODUCT_A}',0);COMMIT;`);
}

function seedAfterMigration(box) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${STORE_B}','Other','other-policy','active','tr','TRY','starter','2026-01-01','2026-01-01');
INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${PRINCIPAL_B}','https://identity.example.test/oidc','policy-b','policy-b@example.test',true,'2026-01-01','2026-01-01');
INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${MEMBERSHIP_B}','${PRINCIPAL_B}','${STORE_B}','store_owner','active','2026-01-01','2026-01-01');
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('60000000-0000-4000-8000-000000000072','${STORE_B}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES('61000000-0000-4000-8000-000000000072','${STORE_B}','${HOST_B}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES('${PRODUCT_B}','${STORE_B}','other-ring','Other Ring','active','TRY',1,'2026-01-03','2026-01-03');
SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);SELECT pg_catalog.set_config('saas.inventory.source_id','62000000-0000-4000-8000-000000000072',true);SELECT pg_catalog.set_config('saas.inventory.source_time','${NOW}',true);
INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES('${VARIANT_B}','${PRODUCT_B}','${STORE_B}','Standart','OTHER-1',50000,false,0,'active','{}',1,'2026-01-03','2026-01-03');
SELECT pg_catalog.set_config('saas.inventory.source_marker','',true);SELECT pg_catalog.set_config('saas.inventory.source_id','',true);SELECT pg_catalog.set_config('saas.inventory.source_time','',true);COMMIT;`);
}

async function main() {
  let box;
  try {
    for (const file of [UP, DOWN, ASSERTIONS, MANIFEST]) assert.equal(existsSync(path.join(SQL, file)), true, file);
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const file of migrations()) apply(box, file);
    seedBeforeMigration(box);
    apply(box, UP); apply(box, ASSERTIONS); seedAfterMigration(box);

    await scenario("manifest pins migration 071 artifacts", () => { const manifest = JSON.parse(readFileSync(path.join(SQL, MANIFEST), "utf8")); assert.equal(manifest.postgresqlMajor, 16); for (const artifact of [...manifest.artifacts, ...manifest.rollbackArtifacts]) assert.equal(createHash("sha256").update(readFileSync(path.join(SQL, artifact.file))).digest("hex"), artifact.sha256, artifact.file); });
    await scenario("PostgreSQL 16 applies policy and search authority", () => { assert.match(psql(box, "SHOW server_version;").stdout, /^16\./); assert.equal(psql(box, "SELECT to_regclass('saas.store_policy_pages') IS NOT NULL;").stdout.trim(), "t"); });
    await scenario("existing stores receive exactly seven fixed policies", () => { assert.equal(psql(box, `SELECT count(*) FROM saas.store_policy_pages WHERE store_id='${STORE_A}';`).stdout.trim(), "7"); assert.equal(psql(box, `SELECT string_agg(policy_key,',' ORDER BY ordinal) FROM saas.store_policy_pages WHERE store_id='${STORE_A}';`).stdout.trim(), "privacy_security,distance_sales,kvkk,payment_delivery,cookie_usage,returns_exchanges,membership"); });
    await scenario("future stores receive exactly seven fixed policies", () => { assert.equal(psql(box, `SELECT count(*) FROM saas.store_policy_pages WHERE store_id='${STORE_B}';`).stdout.trim(), "7"); });
    await scenario("admin list returns immutable labels routes and order", () => { const result = list(box); assert.equal(result.outcome, "listed"); assert.deepEqual(result.result_payload.items.map(({ key }) => key), ["privacy_security", "distance_sales", "kvkk", "payment_delivery", "cookie_usage", "returns_exchanges", "membership"]); assert.equal(result.result_payload.items[2].route, "/policies/kvkk"); });
    await scenario("policy save publishes exact Markdown with a version bump", () => { const result = save(box); assert.equal(result.outcome, "saved"); assert.equal(result.result_payload.key, "kvkk"); assert.equal(result.result_payload.version, 2); assert.equal(result.result_payload.status, "published"); });
    await scenario("same operation replays immutable result", () => { assert.equal(save(box).outcome, "operation_replayed"); assert.equal(recover(box).outcome, "operation_replayed"); });
    await scenario("operation fingerprint mismatch is denied", () => { assert.equal(save(box, { fingerprint: "b".repeat(64) }).outcome, "operation_mismatch"); assert.equal(recover(box, undefined, "b".repeat(64)).outcome, "operation_mismatch"); });
    await scenario("stale policy version is denied", () => { assert.equal(save(box, { operation: "70000000-0000-4000-8000-000000000072", expected: 1 }).outcome, "version_conflict"); });
    await scenario("fixed policy keys labels and rows cannot be mutated or deleted", () => { for (const sql of [`UPDATE saas.store_policy_pages SET route='/evil' WHERE store_id='${STORE_A}' AND policy_key='kvkk'`, `DELETE FROM saas.store_policy_pages WHERE store_id='${STORE_A}' AND policy_key='kvkk'`]) assert.notEqual(psql(box, `SET ROLE celebix_saas_owner;${sql};`, DB, true).status, 0); });
    await scenario("hostile and oversized Markdown fails closed", () => { const cases = [{ operation: "70000000-0000-4000-8000-000000000073", body: "<script>alert(1)</script>" }, { operation: "70000000-0000-4000-8000-000000000074", body: `safe\u0001unsafe` }, { operation: "70000000-0000-4000-8000-000000000075", body: "x".repeat(100_001) }, { operation: "70000000-0000-4000-8000-000000000076", key: "custom_policy" }]; for (const item of cases) assert.equal(save(box, { expected: 2, ...item }).outcome, "invalid_input"); });
    await scenario("draft policy never exposes its Markdown publicly", () => { const page = publicCall(box, `saas.public_policy_get('${HOST_A}','${NOW}','privacy_security')`); assert.equal(page.outcome, "found"); assert.equal(page.result_payload.published, false); assert.equal("body" in page.result_payload, false); });
    await scenario("published policy exposes only the current Markdown", () => { const page = publicCall(box, `saas.public_policy_get('${HOST_A}','${NOW}','kvkk')`); assert.equal(page.outcome, "found"); assert.equal(page.result_payload.published, true); assert.equal(page.result_payload.body, "## KVKK\n\nGüncel metin."); assert.doesNotMatch(JSON.stringify(page), /storeId|operationId|principalId/); });
    await scenario("public policy index is fixed ordered and body-free", () => { const index = publicCall(box, `saas.public_policy_index('${HOST_A}','${NOW}')`); assert.equal(index.result_payload.items.length, 7); assert.equal(index.result_payload.items[2].published, true); assert.equal(index.result_payload.items.some((item) => "body" in item), false); });
    await scenario("unknown and malformed hosts reveal no store", () => { assert.equal(publicCall(box, `saas.public_policy_index('unknown.policy.test','${NOW}')`).outcome, "not_found"); assert.equal(publicCall(box, `saas.public_policy_index('GUZIDE-POLICY.saas-staging.celebix.site','${NOW}')`).outcome, "invalid_input"); });
    await scenario("search returns only matching same-store active products", () => { const result = publicCall(box, `saas.public_search_products('${HOST_A}','${NOW}','altın',48,NULL)`); assert.deepEqual(result.result_payload.items.map(({ slug }) => slug), ["altin-yuzuk"]); const product = result.result_payload.items[0]; assert.equal(product.priceCents,1127100); assert.equal(product.variants.find(({id})=>id===VARIANT_A)?.available,true); assert.equal(product.variants.find(({id})=>id===VARIANT_A_UNAVAILABLE)?.available,false); assert.doesNotMatch(JSON.stringify(result), /costCents|storeId|objectKey|OTHER-1/); });
    await scenario("search matches exact store SKU without cross-store leakage", () => { assert.deepEqual(publicCall(box, `saas.public_search_products('${HOST_A}','${NOW}','YZK-1090',48,NULL)`).result_payload.items.map(({ slug }) => slug), ["altin-yuzuk"]); assert.equal(publicCall(box, `saas.public_search_products('${HOST_A}','${NOW}','OTHER-1',48,NULL)`).result_payload.items.length, 0); });
    await scenario("search covers brand category and public tag authority", () => { for(const query of ["Güzide Atelier","Yüzükler","El Yapımı"]) assert.deepEqual(publicCall(box, `saas.public_search_products('${HOST_A}','${NOW}','${query}',48,NULL)`).result_payload.items.map(({slug})=>slug),["altin-yuzuk"],query); });
    await scenario("search enforces the exact one hundred byte query boundary", () => { assert.equal(publicCall(box, `saas.public_search_products('${HOST_A}','${NOW}','${"x".repeat(100)}',48,NULL)`).outcome,"found"); assert.equal(publicCall(box, `saas.public_search_products('${HOST_A}','${NOW}','${"x".repeat(101)}',48,NULL)`).outcome,"invalid_input"); });
    await scenario("search cursor filters unprojectable rows before applying its deterministic limit", () => { const first = publicCall(box, `saas.public_search_products('${HOST_A}','${NOW}','',1,NULL)`).result_payload; assert.equal(first.items.length, 1); assert.notEqual(first.items[0].id,UNPROJECTABLE_PRODUCT); assert.equal(typeof first.nextCursor, "string"); const second = publicCall(box, `saas.public_search_products('${HOST_A}','${NOW}','',1,'${first.nextCursor}')`).result_payload; assert.equal(second.items.length, 1); assert.notEqual(first.items[0].id, second.items[0].id); assert.equal(publicCall(box, `saas.public_search_products('${HOST_A}','${NOW}','',49,NULL)`).outcome, "invalid_input"); });
    await scenario("resolve IDs preserves input order and same-store authority", () => { const result = publicCall(box, `saas.public_resolve_product_ids('${HOST_A}','${NOW}',ARRAY['${PRODUCT_A2}','${PRODUCT_B}','${PRODUCT_A}']::uuid[])`).result_payload; assert.deepEqual(result.items.map(({ id }) => id), [PRODUCT_A2, PRODUCT_A]); });
    await scenario("resolve IDs rejects duplicates and oversized arrays", () => { assert.equal(publicCall(box, `saas.public_resolve_product_ids('${HOST_A}','${NOW}',ARRAY['${PRODUCT_A}','${PRODUCT_A}']::uuid[])`).outcome, "invalid_input"); assert.equal(publicCall(box, `saas.public_resolve_product_ids('${HOST_A}','${NOW}',ARRAY(SELECT gen_random_uuid() FROM generate_series(1,101)))`).outcome, "invalid_input"); });
    await scenario("cross-store admin authority is denied", () => { assert.equal(list(box, STORE_B, PRINCIPAL_A, MEMBERSHIP_A).outcome, "membership_denied"); assert.equal(save(box, { operation: "70000000-0000-4000-8000-000000000077", store: STORE_B }).outcome, "membership_denied"); });
    await scenario("read-only analyst cannot mutate policies", () => { psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.memberships SET role='analyst' WHERE id='${MEMBERSHIP_A}';COMMIT;`); assert.equal(list(box).outcome, "listed"); assert.equal(save(box, { operation: "70000000-0000-4000-8000-000000000078", expected: 2 }).outcome, "membership_denied"); psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.memberships SET role='store_owner' WHERE id='${MEMBERSHIP_A}';COMMIT;`); });
    await scenario("revoked membership and expired subscription fail closed", () => { psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.memberships SET status='revoked' WHERE id='${MEMBERSHIP_A}';COMMIT;`); assert.equal(list(box).outcome, "membership_denied"); psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.memberships SET status='active' WHERE id='${MEMBERSHIP_A}';UPDATE saas.subscriptions SET valid_until='2026-07-01' WHERE store_id='${STORE_A}';COMMIT;`); assert.equal(list(box).outcome, "durable_authority_invalid"); psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.subscriptions SET valid_until=NULL WHERE store_id='${STORE_A}';COMMIT;`); });
    await scenario("concurrent same operation commits once and replays once", async () => { const operation = "70000000-0000-4000-8000-000000000079"; const sql = `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM saas.store_policy_save(${authority()},'${NOW}','${operation}','${"c".repeat(64)}','membership',1,'Üyelik metni','published');COMMIT;`; const outcomes = (await Promise.all([psqlAsync(box, sql), psqlAsync(box, sql)])).map(({ stdout }) => stdout.trim().split("\n").at(-1)).sort(); assert.deepEqual(outcomes, ["operation_replayed", "saved"]); assert.equal(psql(box, `SELECT count(*) FROM saas.store_policy_operations WHERE operation_id='${operation}';`).stdout.trim(), "1"); });
    await scenario("application and host roles have no direct table privileges", () => { for (const role of ["celebix_saas_app", "celebix_saas_host_resolver"]) for (const table of ["store_policy_pages", "store_policy_operations"]) assert.notEqual(psql(box, `SET ROLE ${role};SELECT count(*) FROM saas.${table};`, DB, true).status, 0, `${role} ${table}`); });
    await scenario("function ACL separates admin and public authority", () => { for (const signature of ["saas.store_policy_list_admin(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)", "saas.store_policy_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,bigint,text,text)", "saas.store_policy_recover(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)"]) { assert.equal(psql(box, `SELECT has_function_privilege('celebix_saas_app','${signature}','EXECUTE');`).stdout.trim(), "t"); assert.equal(psql(box, `SELECT has_function_privilege('celebix_saas_host_resolver','${signature}','EXECUTE');`).stdout.trim(), "f"); } for (const signature of ["saas.public_policy_index(text,timestamp with time zone)", "saas.public_policy_get(text,timestamp with time zone,text)", "saas.public_search_products(text,timestamp with time zone,text,integer,text)", "saas.public_resolve_product_ids(text,timestamp with time zone,uuid[])"]) { assert.equal(psql(box, `SELECT has_function_privilege('celebix_saas_host_resolver','${signature}','EXECUTE');`).stdout.trim(), "t"); assert.equal(psql(box, `SELECT has_function_privilege('celebix_saas_app','${signature}','EXECUTE');`).stdout.trim(), "f"); } });
    await scenario("backup and restore preserve policies and public reads", () => { const dump = path.join(box.root, "policy.dump"); psql(box, `CREATE DATABASE ${RESTORE_DB};`, "postgres"); command(box.tools.pg_dump, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-Fc", "-f", dump, DB]); command(box.tools.pg_restore, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "--exit-on-error", "-d", RESTORE_DB, dump]); assert.equal(psql(box, `SELECT count(*) FROM saas.store_policy_pages WHERE store_id='${STORE_A}';`, RESTORE_DB).stdout.trim(), "7"); assert.equal(publicCall(box, `saas.public_policy_get('${HOST_A}','${NOW}','kvkk')`, RESTORE_DB).result_payload.published, true); });
    await scenario("rollback removes only migration 071 authority", () => { apply(box, DOWN); assert.equal(psql(box, "SELECT to_regclass('saas.store_policy_pages') IS NULL;").stdout.trim(), "t"); assert.equal(psql(box, "SELECT to_regprocedure('saas.public_search_products(text,timestamp with time zone,text,integer,text)') IS NULL;").stdout.trim(), "t"); assert.equal(psql(box, "SELECT to_regprocedure('saas.public_list_products(uuid,text,timestamp with time zone,integer)') IS NOT NULL;").stdout.trim(), "t"); });
    await scenario("reapply restores seven policies per store", () => { apply(box, UP); apply(box, ASSERTIONS); assert.equal(psql(box, "SELECT store_id,count(*) FROM saas.store_policy_pages GROUP BY store_id HAVING count(*)<>7;").stdout.trim(), ""); assert.equal(publicCall(box, `saas.public_policy_index('${HOST_A}','${NOW}')`).result_payload.items.length, 7); });
    assert.equal(completed, TOTAL - 1);
  } finally {
    const root = box?.root, pid = box?.pid;
    stop(box);
    if (box) {
      const cleanupVerified = () => { assert.equal(root ? existsSync(root) : false, false); if (pid) { try { process.kill(pid, 0); assert.fail("postgres process still alive"); } catch (error) { if (error?.code !== "ESRCH") throw error; } } };
      if (completed === TOTAL - 1) {
        await scenario("cleanup removes the disposable PostgreSQL cluster", cleanupVerified);
        assert.equal(completed, TOTAL);
        console.log(`${TOTAL}/${TOTAL} PASS`);
      } else {
        cleanupVerified();
      }
    }
  }
}

await main();
