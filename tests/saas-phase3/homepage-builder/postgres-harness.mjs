import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP = "202608110100_modular_homepage_builder.up.sql";
const DOWN = "202608110100_modular_homepage_builder.down.sql";
const ASSERTIONS = "202608110100_modular_homepage_builder_assertions.sql";
const DB = `homepage_builder_${randomBytes(5).toString("hex")}`;
const RESTORE_DB = `${DB}_restore`;
const STORE = "10000000-0000-4000-8000-000000000100";
const PRINCIPAL = "20000000-0000-4000-8000-000000000100";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000100";
const RECORD = "40000000-0000-4000-8000-000000000100";
const MEDIA = "41000000-0000-4000-8000-000000000100";
const PLAN = "00000000-0000-4000-8000-000000000001";
const HOST = "homepage-builder.example.test";
const NOW = "2026-08-11T12:00:00.000Z";
const TOTAL = 14;
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
  const root = mkdtempSync(path.join(tmpdir(), "cx-homepage-builder-"));
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

function fingerprint(marker) { return createHash("sha256").update(marker).digest("hex"); }
function authority() { return `'${STORE}'::uuid,'${PRINCIPAL}'::uuid,'${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${NOW}'::timestamptz`; }
function rpc(box, sql, role = "celebix_saas_app", database = DB) {
  const value = psql(box, `BEGIN;SET LOCAL ROLE ${role};SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${sql};COMMIT;`, database).stdout.trim();
  return JSON.parse(value);
}
function scenario(name, run) { run(); completed += 1; process.stdout.write(`PASS ${completed}/${TOTAL} ${name}\n`); }

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

const subsequentMigrations = Object.freeze([
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
  "202608100099_single_authority_category_showcase.up.sql",
]);

function seedAuthority(box) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
    VALUES('${STORE}','Modüler Ana Sayfa','homepage-builder','active','tr','TRY','starter','2026-01-01','2026-01-01');
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
    VALUES('${PRINCIPAL}','https://identity.example.test/oidc','homepage-builder-owner','homepage-builder@example.test',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)
    VALUES('${MEMBERSHIP}','${PRINCIPAL}','${STORE}','store_owner','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
    VALUES('50000000-0000-4000-8000-000000000100','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
    INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)
    VALUES('60000000-0000-4000-8000-000000000100','${STORE}','${HOST}','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
    COMMIT;`);
}

function seedDesign(box) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.storefront_design_media(id,store_id,object_key,public_url,media_type,alt_text,width,height,content_length,content_sha256,status,created_at,updated_at)
    VALUES('${MEDIA}','${STORE}','stores/${STORE}/design/${MEDIA}.webp','https://media.saas-staging.celebix.site/stores/${STORE}/design/${MEDIA}.webp','image/webp','Ana banner',1600,900,4096,'${fingerprint("homepage-builder-hero")}', 'active','2026-01-01','2026-01-01');
    INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at)
    VALUES('${RECORD}','${STORE}','starter_theme_composition','Tema',saas.storefront_theme_default_composition(),'active',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.campaign_starter_publications(store_id,record_id,record_version,config,published_at)
    VALUES('${STORE}','${RECORD}',1,saas.storefront_theme_default_composition(),'2026-01-01');
    UPDATE saas.storefront_designs
    SET draft_config=pg_catalog.jsonb_set(draft_config,ARRAY['hero','slides','0','desktopImage'],pg_catalog.jsonb_build_object('kind','media','mediaId','${MEDIA}'),false),
        published_config=pg_catalog.jsonb_set(published_config,ARRAY['hero','slides','0','desktopImage'],pg_catalog.jsonb_build_object('kind','media','mediaId','${MEDIA}'),false)
    WHERE store_id='${STORE}';
    COMMIT;`);
}

function main() {
  for (const file of [UP, DOWN, ASSERTIONS]) assert.equal(existsSync(path.join(SQL, file)), true, file);
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const file of baseMigrations()) apply(box, file);
    seedAuthority(box);
    for (const file of subsequentMigrations) apply(box, file);
    seedDesign(box);
    apply(box, UP);
    apply(box, ASSERTIONS);

    scenario("PostgreSQL 16 applies migration 100", () => assert.match(psql(box, "SHOW server_version;").stdout, /^16[.]/));
    scenario("existing documents backfill to schema 4 and composition 3", () => {
      assert.equal(psql(box, `SELECT schema_version||':'||(draft_config->>'schemaVersion')||':'||(draft_config->'composition'->>'schemaVersion') FROM saas.storefront_designs WHERE store_id='${STORE}';`).stdout.trim(), "4:4:3");
    });
    scenario("backfilled section identities are deterministic, unique and ordered", () => {
      const ids = JSON.parse(psql(box, `SELECT pg_catalog.jsonb_agg(section.value->>'sectionId' ORDER BY section.ordinality) FROM saas.storefront_designs design CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(design.draft_config->'composition'->'sections') WITH ORDINALITY section(value,ordinality) WHERE design.store_id='${STORE}';`).stdout.trim());
      assert.equal(ids.every((id) => /^home_[a-z0-9_]{3,75}$/.test(id)), true);
      assert.equal(new Set(ids).size, ids.length);
      assert.equal(ids[0], "home_product_row_1");
    });
    scenario("empty version 3 composition remains valid and safe", () => {
      assert.equal(psql(box, `SELECT saas.campaign_starter_composition_valid(pg_catalog.jsonb_set(draft_config->'composition',ARRAY['sections'],'[]'::jsonb,false)) FROM saas.storefront_designs WHERE store_id='${STORE}';`).stdout.trim(), "t");
    });
    scenario("duplicate, malformed and missing section identities are denied", () => {
      const valid = `(SELECT draft_config->'composition' FROM saas.storefront_designs WHERE store_id='${STORE}')`;
      assert.equal(psql(box, `SELECT saas.campaign_starter_composition_valid(pg_catalog.jsonb_set(${valid},ARRAY['sections','0','sectionId'],'"bad"'::jsonb,false));`).stdout.trim(), "f");
      assert.equal(psql(box, `SELECT saas.campaign_starter_composition_valid(pg_catalog.jsonb_set(${valid},ARRAY['sections','0'],((${valid}->'sections'->0)-'sectionId'),false));`).stdout.trim(), "f");
      assert.equal(psql(box, `SELECT saas.campaign_starter_composition_valid(pg_catalog.jsonb_set(${valid},ARRAY['sections'],(${valid}->'sections')||pg_catalog.jsonb_build_array(${valid}->'sections'->0),false));`).stdout.trim(), "f");
    });
    scenario("legacy campaign composition compatibility remains intact", () => {
      assert.equal(psql(box, "SELECT saas.campaign_starter_composition_valid(saas.storefront_theme_default_composition());").stdout.trim(), "t");
    });

    const emptyDocument = psql(box, `SELECT pg_catalog.jsonb_set(draft_config,ARRAY['composition','sections'],'[]'::jsonb,false)::text FROM saas.storefront_designs WHERE store_id='${STORE}';`).stdout.trim();
    const saved = rpc(box, `saas.storefront_design_save_draft(${authority()},'70000000-0000-4000-8000-000000000100','${fingerprint("empty-v3-draft")}',1,$homepage$${emptyDocument}$homepage$::jsonb)`);
    scenario("authenticated owner saves versioned empty homepage", () => { assert.equal(saved.outcome, "saved"); assert.equal(saved.result.draftVersion, 2); });
    const published = rpc(box, `saas.storefront_design_publish(${authority()},'80000000-0000-4000-8000-000000000100','${fingerprint("empty-v3-publish")}',2,1)`);
    scenario("authenticated owner publishes without persisted quality score", () => {
      assert.equal(published.outcome, "published");
      assert.equal(psql(box, `SELECT (published_config::text NOT LIKE '%qualityScore%' AND pg_catalog.jsonb_array_length(published_config->'composition'->'sections')=0)::int FROM saas.storefront_designs WHERE store_id='${STORE}';`).stdout.trim(), "1");
    });
    scenario("public projection and exact-host resolver preserve safe empty order", () => {
      assert.equal(psql(box, `SELECT pg_catalog.jsonb_array_length(saas.public_starter_retail_presentation('${STORE}','${NOW}',true)->'sections');`).stdout.trim(), "0");
      assert.equal(rpc(box, `saas.resolve_public_storefront('${HOST}','${NOW}')`, "celebix_saas_host_resolver").result.presentation.sections.length, 0);
    });
    scenario("runtime roles receive no direct table or helper authority", () => {
      assert.equal(psql(box, "SELECT has_table_privilege('celebix_saas_app','saas.storefront_designs','UPDATE') OR has_function_privilege('celebix_saas_app','saas.storefront_theme_composition_with_home_ids(jsonb)','EXECUTE');").stdout.trim(), "f");
    });
    scenario("backup and restore preserve schema and exact section identity", () => {
      const archive = path.join(box.root, "homepage-builder.dump");
      command(box.tools.pg_dump, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-d", DB, "-Fc", "-f", archive]);
      command(box.tools.createdb, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", RESTORE_DB]);
      command(box.tools.pg_restore, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-d", RESTORE_DB, archive]);
      assert.equal(psql(box, `SELECT schema_version||':'||(published_config->'composition'->>'schemaVersion') FROM saas.storefront_designs WHERE store_id='${STORE}';`, RESTORE_DB).stdout.trim(), "4:3");
    });
    scenario("unguarded rollback is rejected", () => assert.notEqual(psql(box, readFileSync(path.join(SQL, DOWN), "utf8"), DB, true).status, 0));
    scenario("guarded rollback and reapply restore exact authority", () => {
      apply(box, DOWN, DB, "SET celebix.allow_modular_homepage_builder_down='on';\n");
      assert.equal(psql(box, `SELECT schema_version||':'||(draft_config->'composition'->>'schemaVersion') FROM saas.storefront_designs WHERE store_id='${STORE}';`).stdout.trim(), "3:2");
      apply(box, UP);
      apply(box, ASSERTIONS);
      assert.equal(psql(box, `SELECT schema_version||':'||(draft_config->'composition'->>'schemaVersion') FROM saas.storefront_designs WHERE store_id='${STORE}';`).stdout.trim(), "4:3");
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
