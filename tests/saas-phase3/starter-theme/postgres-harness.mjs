import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP = "202607300066_admin_managed_starter_theme.up.sql";
const DOWN = "202607300066_admin_managed_starter_theme.down.sql";
const ASSERTIONS = "202607300066_admin_managed_starter_theme_assertions.sql";
const DB = "admin_managed_starter_theme";
const STORE_A = "10000000-0000-4000-8000-000000000066";
const STORE_B = "10000000-0000-4000-8000-000000000067";
const HOST_A = "starter-a.saas-staging.celebix.site";
const HOST_B = "starter-b.saas-staging.celebix.site";
const HOST_CUSTOM = "starter-a.example.test";
const NOW = "2026-07-30T12:00:00.000Z";
const PLAN = "00000000-0000-4000-8000-000000000001";
const PRINCIPAL_A = "20000000-0000-4000-8000-000000000066";
const PRINCIPAL_B = "20000000-0000-4000-8000-000000000067";
const MEMBERSHIP_A = "30000000-0000-4000-8000-000000000066";
const MEMBERSHIP_B = "30000000-0000-4000-8000-000000000067";
const ASSET_A = "61000000-0000-4000-8000-000000000066";
const ASSET_B = "61000000-0000-4000-8000-000000000067";
const ASSET_C = "61000000-0000-4000-8000-000000000068";
const TOTAL = 21;
let completed = 0;

function bin(name) {
  const bundledRoot = path.join(homedir(), ".codex", "tmp");
  let bundled = [];
  try { bundled = readdirSync(bundledRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^postgresql-[0-9.]+-install$/.test(entry.name)).map((entry) => path.join(bundledRoot, entry.name, "bin")); } catch {}
  for (const directory of [process.env.POSTGRES_BIN, ...(process.env.PATH ?? "").split(path.delimiter), ...bundled]) {
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
  const tools = Object.fromEntries(["initdb", "pg_ctl", "psql"].map((name) => [name, bin(name)]));
  const root = mkdtempSync(path.join(tmpdir(), "celebix-starter-theme-"));
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 20_000 + Math.floor(Math.random() * 15_000);
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
    const child = spawn(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", DB], { cwd: ROOT, env: { ...process.env, LC_ALL: "C", LANG: "C" }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (value) => { stdout += value.toString("utf8"); });
    child.stderr.on("data", (value) => { stderr += value.toString("utf8"); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(stdout.trim().split("\n").at(-1)) : reject(new Error(`psql concurrent failed\n${stderr}`)));
    child.stdin.end(sql);
  });
}

function apply(box, file) { psql(box, readFileSync(path.join(SQL, file), "utf8")); }

function migrationFiles() {
  const accepted = /(?:\.up|\.seed|\.freeze|_grants|_assertions|catalog_assertions)\.sql$/;
  return readdirSync(SQL).filter((file) => {
    const sequence = Number.parseInt(file.slice(8, 12), 10);
    return Number.isSafeInteger(sequence) && sequence <= 65 && accepted.test(file) && !file.includes(".down.");
  }).sort((left, right) => {
    const leftSequence = Number.parseInt(left.slice(8, 12), 10), rightSequence = Number.parseInt(right.slice(8, 12), 10);
    if (leftSequence !== rightSequence) return leftSequence - rightSequence;
    const weight = (value) => value.includes("assertions") ? 3 : value.includes("freeze") || value.includes("grants") ? 2 : 1;
    return weight(left) - weight(right) || left.localeCompare(right);
  });
}

function resolve(box, host, at = NOW) {
  const output = psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_host_resolver; SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.resolve_public_storefront('${host}','${at}'::timestamptz); COMMIT;`).stdout.trim().split("\n").at(-1);
  return JSON.parse(output);
}

function authority(store = STORE_A, principal = PRINCIPAL_A, membership = MEMBERSHIP_A) { return `'${store}'::uuid,'${principal}'::uuid,'${membership}'::uuid,'${PLAN}'::uuid,'free_starter',1,1000000000,'${NOW}'::timestamptz`; }
function createAsset(box, assetId, operationId, kind = "hero", store = STORE_A, principal = PRINCIPAL_A, membership = MEMBERSHIP_A, fingerprint = "a".repeat(64)) {
  const key = `stores/${store}/storefront/${kind}/${assetId}.webp`, url = `https://media.saas-staging.celebix.site/${key}`;
  return psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_app; SELECT outcome FROM saas.storefront_asset_create(${authority(store,principal,membership)},'${operationId}'::uuid,'${fingerprint}','${assetId}'::uuid,'${kind}','${key}','${url}','image/webp','Vitrin',1600,900,2048); COMMIT;`).stdout.trim().split("\n").at(-1);
}

async function scenario(name, run) { await run(); completed += 1; console.log(`PASS ${completed}/${TOTAL} ${name}`); }

async function main() {
  let box;
  try {
    for (const file of [UP, DOWN, ASSERTIONS]) assert.equal(existsSync(path.join(SQL, file)), true, `${file} missing`);
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const file of migrationFiles()) apply(box, file);
    apply(box, UP);
    apply(box, ASSERTIONS);

    await scenario("PostgreSQL 16 applies the append-only migration", () => assert.match(psql(box, "SHOW server_version;").stdout, /^16\./));
    psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
      INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
        ('${STORE_A}','Starter A','starter-a','active','tr','TRY','starter','2026-01-01','2026-01-01'),
        ('${STORE_B}','Starter B','starter-b','active','tr','TRY','starter','2026-01-01','2026-01-01');
      INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
        ('${PRINCIPAL_A}','https://identity.example.test/oidc','starter-a','starter-a@example.test',true,'2026-01-01','2026-01-01'),
        ('${PRINCIPAL_B}','https://identity.example.test/oidc','starter-b','starter-b@example.test',true,'2026-01-01','2026-01-01');
      INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
        ('${MEMBERSHIP_A}','${PRINCIPAL_A}','${STORE_A}','store_owner','active','2026-01-01','2026-01-01'),
        ('${MEMBERSHIP_B}','${PRINCIPAL_B}','${STORE_B}','store_owner','active','2026-01-01','2026-01-01');
      INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
        ('80000000-0000-4000-8000-000000000066','${STORE_A}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01'),
        ('80000000-0000-4000-8000-000000000067','${STORE_B}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
      INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES
        ('90000000-0000-4000-8000-000000000066','${STORE_A}','${HOST_A}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1),
        ('90000000-0000-4000-8000-000000000067','${STORE_B}','${HOST_B}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
      COMMIT;`);

    await scenario("new store resolves a complete safe default", () => {
      const result = resolve(box, HOST_A); assert.equal(result.outcome, "found");
      assert.equal(result.payload.schemaVersion, 2); assert.equal(result.payload.presentation.displayName, "Starter A");
      assert.deepEqual(result.payload.presentation.theme, { colorScheme: "neutral", headingStyle: "serif", productCardStyle: "editorial", productImageRatio: "portrait", homeProductLimit: 8, showBrandStory: true });
      assert.deepEqual(result.payload.presentation.seo, { allowIndex: false });
    });
    psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
      INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES
        ('71000000-0000-4000-8000-000000000061','${STORE_A}','general_setting','Old','{"storeDisplayName":"Eski"}','active',1,'2026-01-01','2026-07-01'),
        ('71000000-0000-4000-8000-000000000062','${STORE_A}','general_setting','Current','{"storeDisplayName":"Güzide","supportEmail":"destek@guzide.example"}','active',1,'2026-01-01','2026-07-02'),
        ('71000000-0000-4000-8000-000000000063','${STORE_A}','theme_setting','Theme','{"colorScheme":"warm","headingStyle":"sans","productCardStyle":"compact","productImageRatio":"square","homeProductLimit":12,"showBrandStory":false}','active',1,'2026-01-01','2026-07-02'),
        ('71000000-0000-4000-8000-000000000064','${STORE_A}','hero_banner','Hero','{"headline":"Yaz koleksiyonu","body":"Yeni ürünleri keşfedin.","destination":"/products","enabled":true}','active',1,'2026-01-01','2026-07-02'),
        ('71000000-0000-4000-8000-000000000065','${STORE_A}','promotion_banner','Promo','{"headline":"Bugüne özel","body":"Seçili ürünler","destination":"/products","startsAt":"2026-07-30T11:00:00.000Z","endsAt":"2026-07-30T13:00:00.000Z","enabled":true}','active',1,'2026-01-01','2026-07-02'),
        ('71000000-0000-4000-8000-000000000066','${STORE_A}','marquee_setting','Marquee','{"items":["Güvenli ödeme","Özenli seçim"],"icon":"shield","speed":"normal","direction":"left","animation":"continuous","enabled":true}','active',1,'2026-01-01','2026-07-02'),
        ('71000000-0000-4000-8000-000000000067','${STORE_A}','seo_control','SEO','{"metaTitle":"Güzide Kuyumcu","metaDescription":"Güzide ürünleri","allowIndex":true}','active',1,'2026-01-01','2026-07-02'),
        ('71000000-0000-4000-8000-000000000068','${STORE_B}','general_setting','B','{"storeDisplayName":"Başka Mağaza"}','active',1,'2026-01-01','2026-07-03'); COMMIT;`);
    await scenario("latest active singleton wins deterministically", () => assert.equal(resolve(box, HOST_A).payload.presentation.displayName, "Güzide"));
    await scenario("bounded theme settings project exactly", () => assert.deepEqual(resolve(box, HOST_A).payload.presentation.theme, { colorScheme: "warm", headingStyle: "sans", productCardStyle: "compact", productImageRatio: "square", homeProductLimit: 12, showBrandStory: false }));
    await scenario("SEO indexing requires the requested verified primary custom domain", () => {
      const presentation = resolve(box, HOST_A).payload.presentation;
      assert.equal(presentation.hero.headline, "Yaz koleksiyonu"); assert.equal(presentation.promotion.headline, "Bugüne özel"); assert.equal(presentation.marquee.items.length, 2); assert.equal(presentation.seo.allowIndex, false);
      psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
        UPDATE saas.store_domains SET is_primary=false,updated_at='2026-07-30T12:00:01Z',version=version+1 WHERE hostname='${HOST_A}';
        INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)
        VALUES('90000000-0000-4000-8000-000000000068','${STORE_A}','${HOST_CUSTOM}','custom_domain','active',true,'2026-01-01','2026-01-01','2026-07-30T11:59:59Z',1);
        COMMIT;`);
      assert.equal(resolve(box, HOST_A).payload.presentation.seo.allowIndex, false);
      assert.equal(resolve(box, HOST_CUSTOM).payload.presentation.seo.allowIndex, true);
      const appPlatform = psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_app; SELECT result_payload->'seo'->>'allowIndex' FROM saas.merchant_admin_effective_starter_presentation('${STORE_A}','${PRINCIPAL_A}','${MEMBERSHIP_A}','${PLAN}','free_starter',1,'${NOW}','${HOST_A}'); COMMIT;`).stdout.trim().split("\n").at(-1);
      const appCustom = psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_app; SELECT result_payload->'seo'->>'allowIndex' FROM saas.merchant_admin_effective_starter_presentation('${STORE_A}','${PRINCIPAL_A}','${MEMBERSHIP_A}','${PLAN}','free_starter',1,'${NOW}','${HOST_CUSTOM}'); COMMIT;`).stdout.trim().split("\n").at(-1);
      assert.equal(appPlatform, "false"); assert.equal(appCustom, "true");
      assert.doesNotMatch(JSON.stringify(presentation), /"(?:recordId|recordKind|version|principalId|membershipId|operationId|objectKey)"/i);
    });
    await scenario("authenticated app creates one exact store-scoped hero asset", () => assert.equal(createAsset(box, ASSET_A, "62000000-0000-4000-8000-000000000066"), "committed"));
    await scenario("same operation and fingerprint replays without a second asset", async () => {
      assert.equal(createAsset(box, ASSET_A, "62000000-0000-4000-8000-000000000066"), "operation_replayed");
      assert.equal(psql(box, `SET ROLE celebix_saas_owner; SELECT count(*) FROM saas.storefront_assets WHERE store_id='${STORE_A}';`).stdout.trim(), "1");
      const key = `stores/${STORE_A}/storefront/hero/${ASSET_C}.webp`, url = `https://media.saas-staging.celebix.site/${key}`;
      const concurrent = `BEGIN; SET LOCAL ROLE celebix_saas_app; SELECT outcome FROM saas.storefront_asset_create(${authority()},'62000000-0000-4000-8000-000000000071','${"e".repeat(64)}','${ASSET_C}','hero','${key}','${url}','image/webp','Eşzamanlı',1600,900,2048); COMMIT;`;
      const outcomes = (await Promise.all([psqlAsync(box, concurrent), psqlAsync(box, concurrent)])).sort();
      assert.deepEqual(outcomes, ["committed", "operation_replayed"]);
      assert.equal(psql(box, `SET ROLE celebix_saas_owner; SELECT count(*) FROM saas.storefront_assets WHERE store_id='${STORE_A}';`).stdout.trim(), "2");
    });
    await scenario("operation mismatch is durable and cannot replace the original asset", () => assert.equal(createAsset(box, ASSET_B, "62000000-0000-4000-8000-000000000066", "hero", STORE_A, PRINCIPAL_A, MEMBERSHIP_A, "b".repeat(64)), "operation_mismatch"));
    await scenario("cross-store authority cannot read another store asset", () => assert.equal(psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_app; SELECT jsonb_array_length(result_payload) FROM saas.storefront_asset_list(${authority(STORE_B,PRINCIPAL_B,MEMBERSHIP_B)},NULL,false); COMMIT;`).stdout.trim().split("\n").at(-1), "0"));
    psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.merchant_admin_records SET config=config||'{"assetId":"${ASSET_A}"}'::jsonb,updated_at='2026-07-05',version=version+1 WHERE id='71000000-0000-4000-8000-000000000064'; COMMIT;`);
    await scenario("public hero selects only the active same-store asset projection", () => { const image = resolve(box, HOST_A).payload.presentation.hero.image; assert.equal(image.url, `https://media.saas-staging.celebix.site/stores/${STORE_A}/storefront/hero/${ASSET_A}.webp`); assert.deepEqual(Object.keys(image).sort(), ["altText","height","mediaType","url","width"]); });
    await scenario("unbacked external URLs never enter public presentation", () => {
      assert.equal(psql(box, `SET ROLE celebix_saas_owner; SELECT saas.merchant_admin_config_valid('hero_banner','{"imageUrl":"https://external.example.test/hero.webp"}'::jsonb);`).stdout.trim(), "f");
      assert.equal(psql(box, `SET ROLE celebix_saas_owner; SELECT saas.public_storefront_asset('${STORE_A}','hero','{"imageUrl":"https://external.example.test/hero.webp"}'::jsonb) IS NULL;`).stdout.trim(), "t");
      assert.equal(psql(box, `SET ROLE celebix_saas_owner; SELECT saas.merchant_admin_config_valid('hero_banner',jsonb_build_object('body',repeat('x',1001)));`).stdout.trim(), "f");
      assert.equal(psql(box, `SET ROLE celebix_saas_owner; SELECT saas.merchant_admin_config_valid('hero_banner','{"destination":"/products?sort=new"}'::jsonb);`).stdout.trim(), "f");
      assert.equal(psql(box, `SET ROLE celebix_saas_owner; SELECT saas.merchant_admin_config_valid('promotion_banner','{"enabled":true}'::jsonb);`).stdout.trim(), "f");
      assert.equal(psql(box, `SET ROLE celebix_saas_owner; SELECT saas.merchant_admin_config_valid('marquee_setting','{"enabled":true}'::jsonb);`).stdout.trim(), "f");
      assert.equal(psql(box, `SET ROLE celebix_saas_owner; SELECT saas.merchant_admin_config_valid('seo_control',jsonb_build_object('metaDescription',repeat('x',501),'allowIndex',false));`).stdout.trim(), "f");
      assert.equal(psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_app; SELECT outcome FROM saas.storefront_asset_create(${authority()},'62000000-0000-4000-8000-000000000068','${"c".repeat(64)}','${ASSET_B}','hero','stores/${STORE_A}/storefront/hero/${ASSET_B}.webp','https://attacker.example/stores/${STORE_A}/storefront/hero/${ASSET_B}.webp','image/webp','Vitrin',1600,900,2048); COMMIT;`).stdout.trim().split("\n").at(-1), "invalid_input");
    });
    await scenario("application and host roles have no direct storefront asset table access", () => {
      assert.notEqual(psql(box, "SET ROLE celebix_saas_app; SELECT count(*) FROM saas.storefront_assets;", DB, true).status, 0);
      assert.notEqual(psql(box, "SET ROLE celebix_saas_host_resolver; SELECT count(*) FROM saas.storefront_assets;", DB, true).status, 0);
      assert.equal(psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_app; SELECT outcome FROM saas.storefront_asset_archive(${authority(STORE_A,PRINCIPAL_A,MEMBERSHIP_A)},NULL,NULL,'${ASSET_A}',0); COMMIT;`).stdout.trim().split("\n").at(-1), "invalid_input");
      assert.equal(psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_app; SELECT outcome FROM saas.storefront_asset_recover(${authority(STORE_A,PRINCIPAL_A,MEMBERSHIP_A)},'62000000-0000-4000-8000-000000000066','wrong','bad'); COMMIT;`).stdout.trim().split("\n").at(-1), "invalid_input");
      const archiveFingerprint = createHash("sha256").update(JSON.stringify({ kind: "archive_asset", input: { assetId: ASSET_A, expectedVersion: 1 } })).digest("hex");
      assert.equal(psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_app; SELECT outcome FROM saas.storefront_asset_archive(${authority()},'62000000-0000-4000-8000-000000000069','${archiveFingerprint}','${ASSET_A}',1); COMMIT;`).stdout.trim().split("\n").at(-1), "committed");
      psql(box, `SET ROLE celebix_saas_owner; INSERT INTO saas.storefront_assets(id,store_id,asset_kind,object_key,public_url,media_type,alt_text,width,height,byte_size,status,created_at,updated_at,archived_at,version)
        SELECT generated.id,'${STORE_A}','hero','stores/${STORE_A}/storefront/hero/'||generated.id||'.webp','https://media.saas-staging.celebix.site/stores/${STORE_A}/storefront/hero/'||generated.id||'.webp','image/webp','Arşiv',1,1,1,'archived','${NOW}','${NOW}','${NOW}',2
        FROM (SELECT ('63000000-0000-4000-8000-'||pg_catalog.lpad(value::text,12,'0'))::uuid AS id FROM pg_catalog.generate_series(1,63) AS value) AS generated;`);
      const replacement = "61000000-0000-4000-8000-000000000069", key = `stores/${STORE_A}/storefront/hero/${replacement}.webp`;
      assert.equal(psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_app; SELECT outcome FROM saas.storefront_asset_create(${authority()},'62000000-0000-4000-8000-000000000070','${"d".repeat(64)}','${replacement}','hero','${key}','https://media.saas-staging.celebix.site/${key}','image/webp','Vitrin',1600,900,2048); COMMIT;`).stdout.trim().split("\n").at(-1), "asset_limit_reached");
    });
    await scenario("promotion is absent before start and at exact end", () => { assert.equal(resolve(box, HOST_A, "2026-07-30T10:59:59.999Z").payload.presentation.promotion, undefined); assert.equal(resolve(box, HOST_A, "2026-07-30T13:00:00.000Z").payload.presentation.promotion, undefined); });
    await scenario("draft and archived settings never become public", () => { psql(box, `SET ROLE celebix_saas_owner; UPDATE saas.merchant_admin_records SET status='draft',updated_at='2026-07-04' WHERE id='71000000-0000-4000-8000-000000000064';`); assert.equal(resolve(box, HOST_A).payload.presentation.hero.headline, "Starter A"); });
    await scenario("another store cannot influence the selected host", () => assert.equal(resolve(box, HOST_B).payload.presentation.displayName, "Başka Mağaza"));
    await scenario("unknown host remains not found", () => assert.equal(resolve(box, "unknown.example.test").outcome, "not_found"));
    await scenario("host resolver cannot read merchant records directly", () => assert.notEqual(psql(box, "SET ROLE celebix_saas_host_resolver; SELECT count(*) FROM saas.merchant_admin_records;", DB, true).status, 0));
    await scenario("host resolver cannot call the owner-only presentation helper", () => assert.notEqual(psql(box, `SET ROLE celebix_saas_host_resolver; SELECT saas.public_starter_presentation('${STORE_A}',now());`, DB, true).status, 0));
    await scenario("public resolver returns only the exact schema-v2 root", () => assert.deepEqual(Object.keys(resolve(box, HOST_A).payload).sort(), ["canonicalUrl","currency","hostname","id","locale","name","presentation","primaryHostname","schemaVersion","slug","themeKey"].sort()));
    psql(box, `SET ROLE celebix_saas_owner; DELETE FROM saas.merchant_admin_records WHERE record_kind='theme_setting';`);
    apply(box, DOWN);
    await scenario("rollback restores schema-v1 public projection", () => assert.equal(resolve(box, HOST_A).payload.schemaVersion, 1));
    apply(box, UP); apply(box, ASSERTIONS);
    await scenario("reapply restores schema-v2 defaults", () => assert.equal(resolve(box, HOST_A).payload.presentation.theme.homeProductLimit, 8));
    assert.equal(completed, TOTAL);
    console.log(`${TOTAL}/${TOTAL} PASS`);
  } finally {
    const root = box?.root, pid = box?.pid; stop(box);
    assert.equal(root ? existsSync(root) : false, false);
    if (pid) { try { process.kill(pid, 0); assert.fail("postgres process still alive"); } catch (error) { if (error?.code !== "ESRCH") throw error; } }
  }
}

await main();
