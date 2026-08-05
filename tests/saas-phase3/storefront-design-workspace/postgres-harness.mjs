import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = `storefront_design_${randomBytes(5).toString("hex")}`;
const RESTORE_DB = `${DB}_restore`;
const STORE_A = "10000000-0000-4000-8000-000000000081";
const STORE_B = "10000000-0000-4000-8000-000000000082";
const PRINCIPAL_OWNER = "20000000-0000-4000-8000-000000000081";
const PRINCIPAL_ANALYST = "20000000-0000-4000-8000-000000000082";
const MEMBERSHIP_OWNER = "30000000-0000-4000-8000-000000000081";
const MEMBERSHIP_ANALYST = "30000000-0000-4000-8000-000000000082";
const PLAN = "00000000-0000-4000-8000-000000000001";
const PRODUCT = "40000000-0000-4000-8000-000000000081";
const CATEGORY = "50000000-0000-4000-8000-000000000081";
const MEDIA_A = "60000000-0000-4000-8000-000000000081";
const MEDIA_B = "60000000-0000-4000-8000-000000000082";
const DOMAIN_A = "70000000-0000-4000-8000-000000000081";
const DOMAIN_B = "70000000-0000-4000-8000-000000000082";
const NOW = "2026-08-03T12:00:00.000Z";
const TOTAL = 27;
let completed = 0;

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* continue */ }
  }
  return null;
}

function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    encoding: "utf8",
    input,
    env: { ...process.env, PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}

function start() {
  assertSafeEnvironment();
  const names = [...new Set([...REQUIRED_NATIVE_TOOLS, "pg_dump", "pg_restore", "createdb"] )];
  const tools = Object.fromEntries(names.map((name) => [name, executable(name)]));
  if (Object.values(tools).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const root = mkdtempSync(path.join(tmpdir(), "celebix-storefront-design-"));
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 20_000 + Math.floor(Math.random() * 15_000);
  mkdirSync(socket, { mode: 0o700 });
  command(tools.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(tools.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { tools, root, data, socket, port, started: true };
}

function stop(box) {
  if (!box) return;
  if (box.started) command(box.tools.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], "", true);
  rmSync(box.root, { recursive: true, force: true });
}

function psql(box, source, database = DB, allowFailure = false) {
  return command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], source, allowFailure);
}

function apply(box, file, database = DB, prefix = "") {
  return psql(box, `${prefix}${readFileSync(path.join(SQL, file), "utf8")}`, database);
}

function fingerprint(marker) { return createHash("sha256").update(marker).digest("hex"); }
function authority(principal = PRINCIPAL_OWNER, membership = MEMBERSHIP_OWNER, store = STORE_A) {
  return `'${store}'::uuid,'${principal}'::uuid,'${membership}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${NOW}'::timestamptz`;
}
function authorityAt(now) {
  return `'${STORE_A}'::uuid,'${PRINCIPAL_OWNER}'::uuid,'${MEMBERSHIP_OWNER}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${now}'::timestamptz`;
}
function rpc(box, sql, role = "celebix_saas_app") {
  const value = psql(box, `BEGIN;SET LOCAL ROLE ${role};SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${sql};COMMIT;`).stdout.trim();
  return JSON.parse(value);
}
function scenario(name, run) { run(); completed += 1; process.stdout.write(`PASS ${completed}/${TOTAL} ${name}\n`); }

function applyBase(box) {
  const accepted = /(?:[.]up|[.]seed|[.]freeze|_grants|_assertions|catalog_assertions)[.]sql$/;
  const base = readdirSync(SQL).filter((file) => {
    const sequence = Number.parseInt(file.slice(8, 12), 10);
    return Number.isSafeInteger(sequence) && sequence <= 71
      && accepted.test(file) && !file.includes(".down.");
  }).sort((left, right) => {
    const difference = Number.parseInt(left.slice(8, 12), 10) - Number.parseInt(right.slice(8, 12), 10);
    const weight = (file) => file.includes("assertions") ? 3 : file.includes("freeze") || file.includes("grants") ? 2 : 1;
    return difference || weight(left) - weight(right) || left.localeCompare(right);
  });
  for (const file of base) apply(box, file);
  for (const file of [
    "202607310072_storefront_cart_checkout.up.sql",
    "202608010073_storefront_checkout_readiness.up.sql",
    "202608010073_storefront_checkout_readiness_assertions.sql",
    "202608010074_campaign_starter_composition.up.sql",
    "202608010074_campaign_starter_composition_assertions.sql",
    "202608020075_complete_starter_retail_experience.up.sql",
    "202608020075_complete_starter_retail_experience_assertions.sql",
  ]) apply(box, file);
}

function seed(box) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
      ('${PRINCIPAL_OWNER}','https://identity.example.test/oidc','design-owner','owner81@example.test',true,'2026-01-01','2026-01-01'),
      ('${PRINCIPAL_ANALYST}','https://identity.example.test/oidc','design-analyst','analyst81@example.test',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
      ('${STORE_A}','Güzide Kuyumcu','guzide-design-81','active','tr','TRY','hemenaku','2026-01-01','2026-01-01'),
      ('${STORE_B}','İkinci Mağaza','ikinci-design-82','active','tr','TRY','hemenaku','2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
      ('${MEMBERSHIP_OWNER}','${PRINCIPAL_OWNER}','${STORE_A}','store_owner','active','2026-01-01','2026-01-01'),
      ('${MEMBERSHIP_ANALYST}','${PRINCIPAL_ANALYST}','${STORE_A}','analyst','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at) VALUES
      ('80000000-0000-4000-8000-000000000081','${STORE_A}','${PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01'),
      ('80000000-0000-4000-8000-000000000082','${STORE_B}','${PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01');
    INSERT INTO saas.store_media_namespaces(store_id,namespace_prefix,status,version,created_at,updated_at) VALUES
      ('${STORE_A}','stores/${STORE_A}/','active',1,'2026-01-01','2026-01-01'),
      ('${STORE_B}','stores/${STORE_B}/','active',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES
      ('${DOMAIN_A}','${STORE_A}','guzide-design-81.example.test','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1),
      ('${DOMAIN_B}','${STORE_B}','ikinci-design-82.example.test','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
    INSERT INTO saas.products(id,store_id,slug,title,description,status,currency,version,created_at,updated_at) VALUES
      ('${PRODUCT}','${STORE_A}','pirlanta-kolye','Pırlanta Kolye',NULL,'active','TRY',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.catalog_categories(id,store_id,parent_id,name,slug,position,depth,status,version,created_at,updated_at) VALUES
      ('${CATEGORY}','${STORE_A}',NULL,'Yeni Ürünler','yeni-urunler',0,1,'active',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES
      ('90000000-0000-4000-8000-000000000081','${STORE_A}','hero_banner','Eski ana görsel','{"headline":"Eski vitrin","body":"Yayındaki içerik","imageUrl":"https://legacy.example/hero.jpg","enabled":true}'::jsonb,'active',1,'2026-01-01','2026-01-01');
    COMMIT;`);
}

function main() {
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    applyBase(box);
    seed(box);
    apply(box, "202608030081_storefront_design_workspace.up.sql");
    apply(box, "202608030081_storefront_design_workspace_assertions.sql");
    apply(box, "202608030082_storefront_hero_slider.up.sql");
    apply(box, "202608030082_storefront_hero_slider_assertions.sql");

    scenario("PostgreSQL 16 and migration artifacts execute", () => assert.match(psql(box, "SHOW server_version;").stdout, /^16[.]/));
    scenario("one row per store preserves legacy publication", () => {
      assert.equal(psql(box, "SELECT count(*) FROM saas.storefront_designs;").stdout.trim(), "2");
      assert.equal(psql(box, `SELECT (published_config->'hero'->'slides'->0->>'headline')||'|'||(published_config->'hero'->'slides'->0->'desktopImage'->>'kind') FROM saas.storefront_designs WHERE store_id='${STORE_A}';`).stdout.trim(), "Eski vitrin|legacy_https");
      assert.equal(psql(box, `SELECT draft_config->'hero'->'slides'->0->'desktopImage'='null'::jsonb FROM saas.storefront_designs WHERE store_id='${STORE_A}';`).stdout.trim(), "t");
    });
    scenario("relations have no direct app or host grants", () => assert.equal(psql(box, "SELECT has_table_privilege('celebix_saas_app','saas.storefront_designs','SELECT') OR has_table_privilege('celebix_saas_host_resolver','saas.storefront_designs','SELECT');").stdout.trim(), "f"));
    scenario("owner reads versioned workspace", () => assert.equal(rpc(box, `saas.storefront_design_get(${authority()})`).outcome, "found"));
    scenario("analyst receives read-only workspace", () => {
      assert.equal(rpc(box, `saas.storefront_design_get(${authority(PRINCIPAL_ANALYST, MEMBERSHIP_ANALYST)})`).outcome, "found");
      assert.equal(rpc(box, `saas.storefront_design_publish(${authority(PRINCIPAL_ANALYST, MEMBERSHIP_ANALYST)},'a1000000-0000-4000-8000-000000000081','${fingerprint("analyst")}',1,1)`).outcome, "membership_denied");
    });
    scenario("cross-store membership is denied", () => assert.equal(rpc(box, `saas.storefront_design_get(${authority(PRINCIPAL_OWNER, MEMBERSHIP_OWNER, STORE_B)})`).outcome, "membership_denied"));

    const reserve = rpc(box, `saas.storefront_design_media_reserve(${authority()},'a2000000-0000-4000-8000-000000000081','${fingerprint("media-a")}','${MEDIA_A}','image/webp','Altın kolye',1200,600,1024,'${fingerprint("content-a")}')`);
    scenario("media reservation derives tenant object key", () => {
      assert.equal(reserve.outcome, "reserved");
      assert.equal(reserve.result.objectKey, `stores/${STORE_A}/design/${MEDIA_A}.webp`);
    });
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;INSERT INTO saas.storefront_design_media VALUES('${MEDIA_B}','${STORE_B}','stores/${STORE_B}/design/${MEDIA_B}.webp','https://media.saas-staging.celebix.site/stores/${STORE_B}/design/${MEDIA_B}.webp','image/webp','Diğer',100,100,100,'${fingerprint("content-b")}','active','${NOW}','${NOW}');COMMIT;`);
    scenario("cross-store media is rejected by document authority", () => assert.equal(psql(box, `SELECT saas.storefront_design_document_valid('${STORE_A}',jsonb_set(draft_config,'{hero,slides,0,desktopImage}','{"kind":"media","mediaId":"${MEDIA_B}"}'::jsonb),false) FROM saas.storefront_designs WHERE store_id='${STORE_A}';`).stdout.trim(), "f"));
    scenario("active tenant product destination is accepted", () => assert.equal(psql(box, `SELECT saas.storefront_design_document_valid('${STORE_A}',jsonb_set(jsonb_set(draft_config,'{hero,slides,0,desktopImage}','{"kind":"media","mediaId":"${MEDIA_A}"}'::jsonb),'{hero,slides,0,destination}','{"kind":"product","resourceId":"${PRODUCT}"}'::jsonb),false) FROM saas.storefront_designs WHERE store_id='${STORE_A}';`).stdout.trim(), "t"));

    scenario("zero and four slide drafts are rejected", () => {
      assert.equal(psql(box, `SELECT saas.storefront_design_document_valid('${STORE_A}',jsonb_set(draft_config,'{hero,slides}','[]'::jsonb),false) FROM saas.storefront_designs WHERE store_id='${STORE_A}';`).stdout.trim(), "f");
      assert.equal(psql(box, `SELECT saas.storefront_design_document_valid('${STORE_A}',jsonb_set(draft_config,'{hero,slides}',pg_catalog.jsonb_build_array(draft_config->'hero'->'slides'->0,draft_config->'hero'->'slides'->0,draft_config->'hero'->'slides'->0,draft_config->'hero'->'slides'->0)),false) FROM saas.storefront_designs WHERE store_id='${STORE_A}';`).stdout.trim(), "f");
    });
    scenario("publish requires a desktop image on each enabled slide", () => assert.equal(psql(box, `SELECT saas.storefront_design_publishable('${STORE_A}',draft_config) FROM saas.storefront_designs WHERE store_id='${STORE_A}';`).stdout.trim(), "f"));

    const configSql = `jsonb_set(jsonb_set(jsonb_set(draft_config,'{hero,slides,0,desktopImage}','{"kind":"media","mediaId":"${MEDIA_A}"}'::jsonb),'{hero,slides,0,destination}','{"kind":"product","resourceId":"${PRODUCT}"}'::jsonb),'{hero,slides,0,headline}','"Yeni vitrin"'::jsonb)`;
    const saveConfig = psql(box, `SELECT (${configSql})::text FROM saas.storefront_designs WHERE store_id='${STORE_A}';`).stdout.trim();
    const saveConfigSql = `$storefront_design_config$${saveConfig}$storefront_design_config$::jsonb`;
    const saveOp = "a3000000-0000-4000-8000-000000000081";
    const saveFingerprint = fingerprint("save-a");
    scenario("stale draft version returns conflict without mutation", () => assert.equal(rpc(box, `saas.storefront_design_save_draft(${authority()},'a3000000-0000-4000-8000-000000000080','${fingerprint("stale")}',2,${saveConfigSql})`).outcome, "draft_version_conflict"));
    const saved = rpc(box, `saas.storefront_design_save_draft(${authority()},'${saveOp}','${saveFingerprint}',1,${saveConfigSql})`);
    scenario("valid draft saves one complete document", () => { assert.equal(saved.outcome, "saved"); assert.equal(saved.result.draftVersion, 2); });
    scenario("same operation replays byte-identically", () => assert.deepEqual(rpc(box, `saas.storefront_design_save_draft(${authority()},'${saveOp}','${saveFingerprint}',1,${saveConfigSql})`).result, saved.result));
    scenario("same operation with different fingerprint is rejected", () => assert.equal(rpc(box, `saas.storefront_design_save_draft(${authority()},'${saveOp}','${fingerprint("different")}',2,${saveConfigSql})`).outcome, "operation_mismatch"));
    scenario("public resolver excludes unpublished draft", () => assert.equal(rpc(box, `saas.storefront_design_get_public('${STORE_A}','guzide-design-81.example.test','${NOW}')`, "celebix_saas_host_resolver").result.hero.slides[0].headline, "Eski vitrin"));
    const published = rpc(box, `saas.storefront_design_publish(${authority()},'a4000000-0000-4000-8000-000000000081','${fingerprint("publish-a")}',2,1)`);
    scenario("publish atomically copies the durable draft", () => { assert.equal(published.outcome, "published"); assert.equal(published.result.published.hero.slides[0].headline, "Yeni vitrin"); assert.equal(published.result.publishedVersion, 2); });
    scenario("stale published version returns conflict", () => assert.equal(rpc(box, `saas.storefront_design_publish(${authority()},'a4000000-0000-4000-8000-000000000082','${fingerprint("stale-publish")}',2,1)`).outcome, "published_version_conflict"));
    scenario("public resolver binds hostname to store", () => assert.equal(rpc(box, `saas.storefront_design_get_public('${STORE_A}','ikinci-design-82.example.test','${NOW}')`, "celebix_saas_host_resolver").outcome, "storefront_not_found"));
    scenario("backup restore and guarded slider down-up preserve authority", () => {
      const archive = path.join(box.root, "design.dump");
      command(box.tools.pg_dump, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-d", DB, "-Fc", "-f", archive]);
      command(box.tools.createdb, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", RESTORE_DB]);
      command(box.tools.pg_restore, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-d", RESTORE_DB, archive]);
      assert.equal(psql(box, "SELECT count(*) FROM saas.storefront_designs;", RESTORE_DB).stdout.trim(), "2");
      const guarded = psql(box, readFileSync(path.join(SQL, "202608030082_storefront_hero_slider.down.sql"), "utf8"), DB, true);
      assert.notEqual(guarded.status, 0);
      apply(box, "202608030082_storefront_hero_slider.down.sql", DB, "SET celebix.allow_storefront_hero_slider_down='on';\n");
      assert.equal(psql(box, `SELECT schema_version FROM saas.storefront_designs WHERE store_id='${STORE_A}';`).stdout.trim(), "1");
      apply(box, "202608030082_storefront_hero_slider.up.sql");
      apply(box, "202608030082_storefront_hero_slider_assertions.sql");
      assert.equal(psql(box, "SELECT count(*) FROM saas.storefront_designs;").stdout.trim(), "2");
    });
    apply(box, "202608040083_storefront_unified_theme_authority.up.sql");
    apply(box, "202608040083_storefront_unified_theme_authority_assertions.sql");
    scenario("unified authority upgrades every durable design to schema three", () => {
      assert.equal(psql(box, "SELECT count(*) FROM saas.storefront_designs WHERE schema_version=3 AND draft_config->>'schemaVersion'='3' AND published_config->>'schemaVersion'='3';").stdout.trim(), "2");
    });
    apply(box, "202608050087_storefront_design_publication_timestamp_fix.up.sql");
    apply(box, "202608050087_storefront_design_publication_timestamp_fix_assertions.sql");
    scenario("a later publication may follow an earlier draft save", () => {
      const unchangedDraft = psql(box, `SELECT draft_config::text FROM saas.storefront_designs WHERE store_id='${STORE_A}';`).stdout.trim();
      const draft = rpc(box, `saas.storefront_design_save_draft(${authorityAt("2026-08-03T12:01:00.000Z")},'a5000000-0000-4000-8000-000000000081','${fingerprint("later-draft")}',2,$later_draft$${unchangedDraft}$later_draft$::jsonb)`);
      assert.equal(draft.outcome, "saved");
      const publication = rpc(box, `saas.storefront_design_publish(${authorityAt("2026-08-03T12:02:00.000Z")},'a5000000-0000-4000-8000-000000000082','${fingerprint("later-publication")}',3,2)`);
      assert.equal(publication.outcome, "published");
      assert.equal(psql(box, `SELECT published_at>draft_updated_at FROM saas.storefront_designs WHERE store_id='${STORE_A}';`).stdout.trim(), "t");
    });
    apply(box, "202608040084_storefront_customer_identity.up.sql");
    apply(box, "202608040084_storefront_customer_identity_assertions.sql");
    apply(box, "202608040085_storefront_magic_link_auth.up.sql");
    apply(box, "202608040085_storefront_magic_link_auth_assertions.sql");
    apply(box, "202608040086_side_cart_quantity_controls.up.sql");
    apply(box, "202608040086_side_cart_quantity_controls_assertions.sql");
    scenario("quantity selector migration executes on PostgreSQL 16", () => assert.match(psql(box, "SHOW server_version;").stdout, /^16[.]/));
    scenario("existing designs and new defaults normalize quantity selection to enabled", () => {
      assert.equal(psql(box, "SELECT (saas.storefront_theme_default_composition()->'cart'->>'showQuantitySelector')::boolean;").stdout.trim(), "t");
      assert.equal(psql(box, "SELECT count(*) FROM saas.storefront_designs WHERE draft_config->'composition'->'cart'->'showQuantitySelector'='true'::jsonb AND published_config->'composition'->'cart'->'showQuantitySelector'='true'::jsonb;").stdout.trim(), "2");
    });
    scenario("quantity selector is one exact required boolean authority", () => {
      assert.equal(psql(box, "SELECT saas.campaign_starter_composition_valid(saas.storefront_theme_default_composition() #- ARRAY['cart','showQuantitySelector']);").stdout.trim(), "f");
      assert.equal(psql(box, "SELECT saas.campaign_starter_composition_valid(pg_catalog.jsonb_set(saas.storefront_theme_default_composition(),ARRAY['cart','showQuantitySelector'],'false'::jsonb,false));").stdout.trim(), "t");
      assert.equal(psql(box, "SELECT saas.campaign_starter_composition_valid(pg_catalog.jsonb_set(saas.storefront_theme_default_composition(),ARRAY['cart','showQuantitySelector'],'\"true\"'::jsonb,false));").stdout.trim(), "f");
    });
    scenario("quantity selector rollback is explicit and loss guarded", () => {
      assert.notEqual(psql(box, readFileSync(path.join(SQL, "202608040086_side_cart_quantity_controls.down.sql"), "utf8"), DB, true).status, 0);
      psql(box, "UPDATE saas.storefront_designs SET draft_config=pg_catalog.jsonb_set(draft_config,ARRAY['composition','cart','showQuantitySelector'],'false'::jsonb,false),published_config=pg_catalog.jsonb_set(published_config,ARRAY['composition','cart','showQuantitySelector'],'false'::jsonb,false);");
      const lossGuard = psql(box, `SET celebix.allow_side_cart_quantity_controls_down='on';\n${readFileSync(path.join(SQL, "202608040086_side_cart_quantity_controls.down.sql"), "utf8")}`, DB, true);
      assert.notEqual(lossGuard.status, 0);
      psql(box, "UPDATE saas.storefront_designs SET draft_config=pg_catalog.jsonb_set(draft_config,ARRAY['composition','cart','showQuantitySelector'],'true'::jsonb,false),published_config=pg_catalog.jsonb_set(published_config,ARRAY['composition','cart','showQuantitySelector'],'true'::jsonb,false);");
    });
    scenario("guarded rollback and reapply preserve cleanup-safe authority", () => {
      apply(box, "202608040086_side_cart_quantity_controls.down.sql", DB, "SET celebix.allow_side_cart_quantity_controls_down='on';\n");
      assert.equal(psql(box, "SELECT count(*) FROM saas.storefront_designs WHERE draft_config->'composition'->'cart'?'showQuantitySelector';").stdout.trim(), "0");
      apply(box, "202608040086_side_cart_quantity_controls.up.sql");
      apply(box, "202608040086_side_cart_quantity_controls_assertions.sql");
      assert.equal(psql(box, "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE datname=current_database() AND pid<>pg_catalog.pg_backend_pid();").stdout.trim(), "0");
    });
    assert.equal(completed, TOTAL);
    process.stdout.write(`PASS STOREFRONT DESIGN WORKSPACE PostgreSQL harness (${TOTAL}/${TOTAL})\n`);
  } finally {
    stop(box);
  }
}

main();
