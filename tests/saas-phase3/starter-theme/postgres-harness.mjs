import assert from "node:assert/strict";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

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
const NOW = "2026-07-30T12:00:00.000Z";
const TOTAL = 14;
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
    await scenario("active hero promotion marquee and SEO project without admin authority", () => {
      const presentation = resolve(box, HOST_A).payload.presentation;
      assert.equal(presentation.hero.headline, "Yaz koleksiyonu"); assert.equal(presentation.promotion.headline, "Bugüne özel"); assert.equal(presentation.marquee.items.length, 2); assert.equal(presentation.seo.allowIndex, true);
      assert.doesNotMatch(JSON.stringify(presentation), /"(?:recordId|recordKind|version|principalId|membershipId|operationId|objectKey)"/i);
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
