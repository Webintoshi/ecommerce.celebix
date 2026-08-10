import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP = "202608100099_single_authority_category_showcase.up.sql";
const DOWN = "202608100099_single_authority_category_showcase.down.sql";
const ASSERTIONS = "202608100099_single_authority_category_showcase_assertions.sql";
const DB = `single_showcase_${randomBytes(5).toString("hex")}`;
const RESTORE_DB = `${DB}_restore`;
const STORE = "10000000-0000-4000-8000-000000000099";
const OTHER_STORE = "10000000-0000-4000-8000-000000000199";
const PRINCIPAL = "20000000-0000-4000-8000-000000000099";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000099";
const RECORD = "40000000-0000-4000-8000-000000000099";
const CATEGORY = "41000000-0000-4000-8000-000000000099";
const OTHER_CATEGORY = "41000000-0000-4000-8000-000000000199";
const ASSET = "42000000-0000-4000-8000-000000000099";
const OTHER_ASSET = "42000000-0000-4000-8000-000000000199";
const PLAN = "00000000-0000-4000-8000-000000000001";
const HOST = "single-showcase.example.test";
const NOW = "2026-08-10T12:00:00.000Z";
const TOTAL = 13;
let completed = 0;

function bin(name) {
  const bundled = path.join(homedir(), ".codex", "tmp");
  let candidates = [];
  try {
    candidates = readdirSync(bundled, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^postgresql-16[.][0-9]+-install$/.test(entry.name))
      .map((entry) => path.join(bundled, entry.name, "bin"));
  } catch { /* optional local PostgreSQL runtime */ }
  for (const directory of [process.env.POSTGRES_BIN, ...(process.env.PATH ?? "").split(path.delimiter), ...candidates]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* continue */ }
  }
  throw new Error(`DISPOSABLE_DB_EXECUTION_BLOCKED: missing ${name}`);
}

function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    input,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}

function start() {
  const tools = Object.fromEntries(["initdb", "pg_ctl", "psql", "pg_dump", "pg_restore", "createdb"].map((name) => [name, bin(name)]));
  const root = mkdtempSync(path.join(tmpdir(), "cx-single-showcase-"));
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

function psql(box, source, database = DB, allowFailure = false) {
  return command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], source, allowFailure);
}

function apply(box, file, database = DB, prefix = "") {
  return psql(box, `${prefix}${readFileSync(path.join(SQL, file), "utf8")}`, database);
}

function baseMigrations() {
  const accepted = /(?:[.]up|[.]seed|[.]freeze|_grants|_assertions|catalog_assertions)[.]sql$/;
  return readdirSync(SQL).filter((file) => {
    const sequence = Number.parseInt(file.slice(8, 12), 10);
    return Number.isSafeInteger(sequence) && sequence <= 71 && accepted.test(file) && !file.includes(".down.");
  }).sort((left, right) => {
    const difference = Number.parseInt(left.slice(8, 12), 10) - Number.parseInt(right.slice(8, 12), 10);
    const weight = (file) => file.includes("assertions") ? 3 : file.includes("freeze") || file.includes("grants") ? 2 : 1;
    return difference || weight(left) - weight(right) || left.localeCompare(right);
  });
}

function fingerprint(value) { return createHash("sha256").update(value).digest("hex"); }
function authority() { return `'${STORE}'::uuid,'${PRINCIPAL}'::uuid,'${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${NOW}'::timestamptz`; }
function scenario(name, run) { run(); completed += 1; process.stdout.write(`PASS ${completed}/${TOTAL} ${name}\n`); }

function projection(box, database = DB) {
  const output = psql(box, `SELECT saas.public_starter_retail_presentation('${STORE}','${NOW}',false);`, database).stdout.trim();
  return JSON.parse(output);
}

function save(box, config, operation, expectedVersion = 1) {
  const escaped = JSON.stringify(config).replaceAll("'", "''");
  return psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_app;
    SELECT outcome FROM saas.merchant_admin_save(${authority()},'${operation}','${fingerprint(operation)}','${RECORD}',${expectedVersion},'category_showcase','Kategoriler','${escaped}'::jsonb,'active');COMMIT;`).stdout.trim().split("\n").at(-1);
}

function seed(box) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
    VALUES('${STORE}','Tek Kaynak','single-showcase','active','tr','TRY','starter','2026-01-01','2026-01-01'),('${OTHER_STORE}','Diğer','other-showcase','active','tr','TRY','starter','2026-01-01','2026-01-01');
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
    VALUES('${PRINCIPAL}','https://identity.example.test/oidc','single-showcase','single-showcase@example.test',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)
    VALUES('${MEMBERSHIP}','${PRINCIPAL}','${STORE}','store_owner','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
    VALUES('50000000-0000-4000-8000-000000000099','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
    INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)
    VALUES('60000000-0000-4000-8000-000000000099','${STORE}','${HOST}','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
    INSERT INTO saas.catalog_categories(id,store_id,parent_id,name,slug,position,status,version,created_at,updated_at)
    VALUES('${CATEGORY}','${STORE}',NULL,'Kolyeler','kolyeler',0,'active',1,'2026-01-01','2026-01-01'),('${OTHER_CATEGORY}','${OTHER_STORE}',NULL,'Yabancı','yabanci',0,'active',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.storefront_assets(id,store_id,asset_kind,object_key,public_url,media_type,alt_text,width,height,byte_size,status,created_at,updated_at,version)
    VALUES('${ASSET}','${STORE}','category','stores/${STORE}/storefront/category/${ASSET}.webp','https://media.saas-staging.celebix.site/stores/${STORE}/storefront/category/${ASSET}.webp','image/webp','Kolye',896,1195,4096,'active','2026-01-01','2026-01-01',1),
      ('${OTHER_ASSET}','${OTHER_STORE}','category','stores/${OTHER_STORE}/storefront/category/${OTHER_ASSET}.webp','https://media.saas-staging.celebix.site/stores/${OTHER_STORE}/storefront/category/${OTHER_ASSET}.webp','image/webp','Yabancı',896,1195,4096,'active','2026-01-01','2026-01-01',1);
    INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at)
    VALUES('${RECORD}','${STORE}','category_showcase','Kategoriler','{"heading":"Kategorileri keşfedin","enabled":true,"items":[{"categoryId":"${CATEGORY}","assetId":"${ASSET}"}]}'::jsonb,'active',1,'2026-01-01','2026-01-01');
    COMMIT;`);
}

function main() {
  for (const file of [UP, DOWN, ASSERTIONS]) assert.equal(existsSync(path.join(SQL, file)), true, file);
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const file of baseMigrations()) apply(box, file);
    for (const file of [
      "202607310072_storefront_cart_checkout.up.sql",
      "202608010073_storefront_checkout_readiness.up.sql",
      "202608010074_campaign_starter_composition.up.sql",
      "202608020075_complete_starter_retail_experience.up.sql",
      "202608030081_storefront_design_workspace.up.sql",
      "202608030082_storefront_hero_slider.up.sql",
      "202608040083_storefront_unified_theme_authority.up.sql",
      "202608040084_storefront_customer_identity.up.sql",
      "202608040085_storefront_magic_link_auth.up.sql",
      "202608040086_side_cart_quantity_controls.up.sql",
      "202608050087_storefront_design_publication_timestamp_fix.up.sql",
      "202608070095_starter_header_layouts.up.sql",
      "202608070096_storefront_google_fonts_typography.up.sql",
      "202608090097_responsive_category_showcase_layout.up.sql",
      "202608090098_empty_homepage_sections.up.sql",
    ]) apply(box, file);
    seed(box);
    apply(box, UP);
    apply(box, ASSERTIONS);

    scenario("PostgreSQL 16 applies migration 099", () => assert.match(psql(box, "SHOW server_version;").stdout, /^16[.]/));
    scenario("legacy category showcase records backfill to grid", () => assert.equal(psql(box, `SELECT config->>'layout' FROM saas.merchant_admin_records WHERE id='${RECORD}';`).stdout.trim(), "grid"));
    scenario("finite validation accepts only exact duo and grid layouts", () => {
      for (const layout of ["duo", "grid"]) assert.equal(psql(box, `SELECT saas.merchant_admin_config_valid('category_showcase','{"heading":"Kategoriler","enabled":true,"layout":"${layout}","items":[{"categoryId":"${CATEGORY}","assetId":"${ASSET}"}]}'::jsonb);`).stdout.trim(), "t");
      for (const suffix of ["", ',"layout":"carousel"', ',"layout":1']) {
        const body = `{"heading":"Kategoriler","enabled":true${suffix},"items":[{"categoryId":"${CATEGORY}","assetId":"${ASSET}"}]}`;
        assert.equal(psql(box, `SELECT saas.merchant_admin_config_valid('category_showcase','${body}'::jsonb);`).stdout.trim(), "f");
      }
    });
    scenario("public projection carries the backfilled grid authority", () => {
      assert.equal(projection(box).categoryShowcase.layout, "grid");
      assert.deepEqual(projection(box).categoryShowcase.items.map(({ name, slug }) => ({ name, slug })), [{ name: "Kolyeler", slug: "kolyeler" }]);
    });
    scenario("authenticated save publishes exact duo layout", () => {
      assert.equal(save(box, { heading: "Koleksiyon", enabled: true, layout: "duo", items: [{ categoryId: CATEGORY, assetId: ASSET }] }, "70000000-0000-4000-8000-000000000099"), "saved");
      assert.equal(projection(box).categoryShowcase.layout, "duo");
    });
    scenario("same-store category and asset authority remains mandatory", () => {
      assert.equal(save(box, { heading: "Koleksiyon", enabled: true, layout: "grid", items: [{ categoryId: OTHER_CATEGORY, assetId: ASSET }] }, "70000000-0000-4000-8000-000000000199", 2), "invalid_input");
      assert.equal(save(box, { heading: "Koleksiyon", enabled: true, layout: "grid", items: [{ categoryId: CATEGORY, assetId: OTHER_ASSET }] }, "70000000-0000-4000-8000-000000000299", 2), "invalid_input");
    });
    scenario("disabled showcase projects no category content", () => {
      assert.equal(save(box, { heading: "Koleksiyon", enabled: false, layout: "grid", items: [{ categoryId: CATEGORY, assetId: ASSET }] }, "70000000-0000-4000-8000-000000000399", 2), "saved");
      assert.equal(projection(box).categoryShowcase, undefined);
    });
    scenario("invalid layouts never reach durable mutation", () => assert.equal(save(box, { heading: "Koleksiyon", enabled: true, layout: "carousel", items: [{ categoryId: CATEGORY, assetId: ASSET }] }, "70000000-0000-4000-8000-000000000499", 3), "invalid_input"));
    scenario("runtime roles retain no direct merchant record access", () => assert.notEqual(psql(box, "SET ROLE celebix_saas_app;SELECT count(*) FROM saas.merchant_admin_records;", DB, true).status, 0));
    scenario("backup and restore preserve exact disabled grid authority", () => {
      const archive = path.join(box.root, "single-showcase.dump");
      command(box.tools.pg_dump, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-d", DB, "-Fc", "-f", archive]);
      command(box.tools.createdb, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", RESTORE_DB]);
      command(box.tools.pg_restore, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-d", RESTORE_DB, archive]);
      assert.equal(psql(box, `SELECT config->>'layout' FROM saas.merchant_admin_records WHERE id='${RECORD}';`, RESTORE_DB).stdout.trim(), "grid");
      assert.equal(projection(box, RESTORE_DB).categoryShowcase, undefined);
    });
    scenario("unguarded rollback is rejected", () => assert.notEqual(psql(box, readFileSync(path.join(SQL, DOWN), "utf8"), DB, true).status, 0));
    scenario("duo rollback is rejected as lossy", () => {
      psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.merchant_admin_records SET config=config||'{"layout":"duo"}'::jsonb WHERE id='${RECORD}';COMMIT;`);
      assert.notEqual(psql(box, `SET celebix.allow_single_authority_category_showcase_down='on';\n${readFileSync(path.join(SQL, DOWN), "utf8")}`, DB, true).status, 0);
    });
    scenario("grid rollback and reapply restore exact authority", () => {
      psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.merchant_admin_records SET config=config||'{"layout":"grid"}'::jsonb WHERE id='${RECORD}';COMMIT;`);
      apply(box, DOWN, DB, "SET celebix.allow_single_authority_category_showcase_down='on';\n");
      assert.equal(psql(box, `SELECT config?'layout' FROM saas.merchant_admin_records WHERE id='${RECORD}';`).stdout.trim(), "f");
      apply(box, UP);
      apply(box, ASSERTIONS);
      assert.equal(psql(box, `SELECT config->>'layout' FROM saas.merchant_admin_records WHERE id='${RECORD}';`).stdout.trim(), "grid");
    });
    assert.equal(completed, TOTAL);
    process.stdout.write(`${TOTAL}/${TOTAL} PASS\n`);
  } finally {
    const root = box?.root;
    const pid = box?.pid;
    stop(box);
    assert.equal(root ? existsSync(root) : false, false);
    if (pid) {
      try { process.kill(pid, 0); assert.fail("postgres process still alive"); }
      catch (error) { if (error?.code !== "ESRCH") throw error; }
    }
  }
}

main();
