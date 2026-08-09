import assert from "node:assert/strict";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP = "202608090097_responsive_category_showcase_layout.up.sql";
const DOWN = "202608090097_responsive_category_showcase_layout.down.sql";
const ASSERTIONS = "202608090097_responsive_category_showcase_layout_assertions.sql";
const DB = `responsive_category_${Date.now()}`;
const STORE = "10000000-0000-4000-8000-000000000097";
const STORE_B = "10000000-0000-4000-8000-000000000098";
const PRINCIPAL = "20000000-0000-4000-8000-000000000097";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000097";
const CATEGORY = "40000000-0000-4000-8000-000000000097";
const ASSET = "50000000-0000-4000-8000-000000000097";
const SHOWCASE = "60000000-0000-4000-8000-000000000097";
const COMPOSITION = "70000000-0000-4000-8000-000000000097";
let completed = 0;
const TOTAL = 11;

function bin(name) {
  const bundled = path.join(homedir(), ".codex", "tmp");
  let candidates = [];
  try {
    candidates = readdirSync(bundled, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^postgresql-[0-9.]+-install$/.test(entry.name))
      .map((entry) => path.join(bundled, entry.name, "bin"));
  } catch { /* optional bundled directory */ }
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
  const tools = Object.fromEntries(["initdb", "pg_ctl", "psql"].map((name) => [name, bin(name)]));
  const root = mkdtempSync(path.join(tmpdir(), "cx-cat-"));
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

function psql(box, source, allowFailure = false) {
  return command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", DB], source, allowFailure);
}

function apply(box, file, prefix = "") {
  return psql(box, `${prefix}${readFileSync(path.join(SQL, file), "utf8")}`);
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

function scenario(name, run) {
  run();
  completed += 1;
  process.stdout.write(`PASS ${completed}/${TOTAL} ${name}\n`);
}

function seed(box) {
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
      ('${STORE}','Güzide','guzide-responsive','active','tr','TRY','starter','2026-01-01','2026-01-01'),
      ('${STORE_B}','İkinci','ikinci-responsive','active','tr','TRY','starter','2026-01-01','2026-01-01');
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
      ('${PRINCIPAL}','https://identity.example.test/oidc','responsive-owner','responsive@example.test',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
      ('${MEMBERSHIP}','${PRINCIPAL}','${STORE}','store_owner','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
      ('80000000-0000-4000-8000-000000000097','${STORE}','00000000-0000-4000-8000-000000000001','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
    INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES
      ('90000000-0000-4000-8000-000000000097','${STORE}','guzide-responsive.example.test','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
    INSERT INTO saas.catalog_categories(id,store_id,parent_id,name,slug,position,status,version,created_at,updated_at) VALUES
      ('${CATEGORY}','${STORE}',NULL,'Yüzükler','yuzukler',0,'active',1,'2026-01-01','2026-01-01');
    COMMIT;`);
}

function seedLegacyCategory(box) {
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.storefront_assets(id,store_id,asset_kind,object_key,public_url,media_type,alt_text,width,height,byte_size,status,created_at,updated_at,version)
    VALUES('${ASSET}','${STORE}','category','stores/${STORE}/storefront/category/${ASSET}.webp','https://media.saas-staging.celebix.site/stores/${STORE}/storefront/category/${ASSET}.webp','image/webp','Yüzükler',1200,1200,2048,'active','2026-01-01','2026-01-01',1);
    INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at)
    VALUES('${SHOWCASE}','${STORE}','category_showcase','Kategoriler',pg_catalog.jsonb_build_object('heading','Kategoriler','enabled',true,'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('categoryId','${CATEGORY}','assetId','${ASSET}'))),'active',1,'2026-01-01','2026-01-01');
    WITH legacy AS (
      SELECT pg_catalog.jsonb_set(saas.storefront_theme_default_composition(),'{sections}',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('kind','category_grid','enabled',true,'heading','Kategoriler','categoryIds',pg_catalog.jsonb_build_array('${CATEGORY}'))),false) value
    )
    INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at)
    SELECT '${COMPOSITION}','${STORE}','starter_theme_composition','Tema',value,'active',1,'2026-01-01','2026-01-01' FROM legacy;
    INSERT INTO saas.campaign_starter_publications(store_id,record_id,record_version,config,published_at)
    SELECT '${STORE}','${COMPOSITION}',1,config,'2026-01-01' FROM saas.merchant_admin_records WHERE id='${COMPOSITION}';
    UPDATE saas.storefront_designs design
    SET draft_config=pg_catalog.jsonb_set(design.draft_config,'{composition}',publication.config,false),
        published_config=pg_catalog.jsonb_set(design.published_config,'{composition}',publication.config,false)
    FROM saas.campaign_starter_publications publication WHERE design.store_id='${STORE}' AND publication.store_id=design.store_id;
    COMMIT;`);
}

function main() {
  for (const file of [UP, DOWN, ASSERTIONS]) assert.equal(existsSync(path.join(SQL, file)), true, file);
  let box;
  try {
    box = start();
    command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], `CREATE DATABASE ${DB};`);
    for (const file of baseMigrations()) apply(box, file);
    seed(box);
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
    ]) apply(box, file);
    seedLegacyCategory(box);

    apply(box, UP);
    apply(box, ASSERTIONS);
    scenario("PostgreSQL 16 applies migration 097", () => assert.match(psql(box, "SHOW server_version;").stdout, /^16[.]/));
    scenario("legacy publication and design documents normalize to grid", () => {
      assert.equal(psql(box, `SELECT config->'sections'->0->>'layout' FROM saas.campaign_starter_publications WHERE store_id='${STORE}';`).stdout.trim(), "grid");
      assert.equal(psql(box, `SELECT (draft_config->'composition'->'sections'->0->>'layout')||'|'||(published_config->'composition'->'sections'->0->>'layout') FROM saas.storefront_designs WHERE store_id='${STORE}';`).stdout.trim(), "grid|grid");
    });
    scenario("validator accepts only duo and grid", () => {
      for (const layout of ["duo", "grid"]) assert.equal(psql(box, `SELECT saas.campaign_starter_composition_valid(pg_catalog.jsonb_set(config,'{sections,0,layout}','"${layout}"'::jsonb,false)) FROM saas.campaign_starter_publications WHERE store_id='${STORE}';`).stdout.trim(), "t");
      assert.equal(psql(box, `SELECT saas.campaign_starter_composition_valid(config #- '{sections,0,layout}') FROM saas.campaign_starter_publications WHERE store_id='${STORE}';`).stdout.trim(), "f");
      assert.equal(psql(box, `SELECT saas.campaign_starter_composition_valid(pg_catalog.jsonb_set(config,'{sections,0,layout}','"masonry"'::jsonb,false)) FROM saas.campaign_starter_publications WHERE store_id='${STORE}';`).stdout.trim(), "f");
    });
    scenario("public projection carries exact grid authority", () => assert.equal(psql(box, `SELECT section->>'layout' FROM pg_catalog.jsonb_array_elements(saas.public_starter_retail_presentation('${STORE}','2026-02-01',false)->'sections') section WHERE section->>'kind'='category_grid';`).stdout.trim(), "grid"));
    scenario("duo persists and projects without browser authority", () => {
      psql(box, `UPDATE saas.storefront_designs SET draft_config=pg_catalog.jsonb_set(draft_config,'{composition,sections,0,layout}','"duo"'::jsonb,false),published_config=pg_catalog.jsonb_set(published_config,'{composition,sections,0,layout}','"duo"'::jsonb,false) WHERE store_id='${STORE}';`);
      assert.equal(psql(box, `SELECT section->>'layout' FROM pg_catalog.jsonb_array_elements(saas.public_starter_retail_presentation('${STORE}','2026-02-01',false)->'sections') section WHERE section->>'kind'='category_grid';`).stdout.trim(), "duo");
    });
    scenario("another store cannot change the selected store", () => {
      assert.equal(psql(box, `SELECT count(*) FROM saas.storefront_designs WHERE store_id='${STORE_B}' AND published_config->'composition'->'sections' @> '[{"kind":"category_grid"}]'::jsonb;`).stdout.trim(), "0");
      assert.equal(psql(box, `SELECT published_config->'composition'->'sections'->0->>'layout' FROM saas.storefront_designs WHERE store_id='${STORE}';`).stdout.trim(), "duo");
    });
    scenario("runtime roles have neither table nor helper authority", () => assert.equal(psql(box, "SELECT has_table_privilege('celebix_saas_app','saas.storefront_designs','UPDATE') OR has_function_privilege('celebix_saas_app','saas.campaign_starter_category_layout_add_default(jsonb)','EXECUTE');").stdout.trim(), "f"));
    scenario("unguarded rollback is rejected", () => assert.notEqual(psql(box, readFileSync(path.join(SQL, DOWN), "utf8"), true).status, 0));
    scenario("duo rollback is loss guarded", () => assert.notEqual(psql(box, `SET celebix.allow_responsive_category_showcase_layout_down='on';\n${readFileSync(path.join(SQL, DOWN), "utf8")}`, true).status, 0));
    scenario("grid rollback and reapply restore the authority", () => {
      psql(box, `UPDATE saas.storefront_designs SET draft_config=pg_catalog.jsonb_set(draft_config,'{composition,sections,0,layout}','"grid"'::jsonb,false),published_config=pg_catalog.jsonb_set(published_config,'{composition,sections,0,layout}','"grid"'::jsonb,false); UPDATE saas.campaign_starter_publications SET config=pg_catalog.jsonb_set(config,'{sections,0,layout}','"grid"'::jsonb,false);`);
      apply(box, DOWN, "SET celebix.allow_responsive_category_showcase_layout_down='on';\n");
      assert.equal(psql(box, `SELECT config->'sections'->0?'layout' FROM saas.campaign_starter_publications WHERE store_id='${STORE}';`).stdout.trim(), "f");
      apply(box, UP);
      apply(box, ASSERTIONS);
      assert.equal(psql(box, `SELECT config->'sections'->0->>'layout' FROM saas.campaign_starter_publications WHERE store_id='${STORE}';`).stdout.trim(), "grid");
    });
    scenario("disposable database has no leaked sessions", () => assert.equal(psql(box, "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE datname=current_database() AND pid<>pg_catalog.pg_backend_pid();").stdout.trim(), "0"));
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
