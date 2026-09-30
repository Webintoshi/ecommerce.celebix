import assert from "node:assert/strict";
import { parsePublicStarterThemePresentation, normalizeStorefrontDesignDocumentV5 } from "../../../packages/saas-contracts/src/index.ts";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP = "202609300178_section_homepage_v4.up.sql";
const DOWN = "202609300178_section_homepage_v4.down.sql";
const ASSERTIONS = "202609300178_section_homepage_v4_assertions.sql";
const DB = `design_section_${randomBytes(5).toString("hex")}`;
const STORE = "10000000-0000-4000-8000-000000000098";
const PRINCIPAL = "20000000-0000-4000-8000-000000000098";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000098";
const RECORD = "40000000-0000-4000-8000-000000000098";
const MEDIA = "41000000-0000-4000-8000-000000000098";
const PLAN = "00000000-0000-4000-8000-000000000001";
const HOST = "empty-homepage.example.test";
const NOW = "2026-08-09T12:00:00.000Z";
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
  const root = mkdtempSync(path.join(tmpdir(), "cx-design-section-"));
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
function rpc(box, sql, role = "celebix_saas_app") {
  const value = psql(box, `BEGIN;SET LOCAL ROLE ${role};SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${sql};COMMIT;`).stdout.trim();
  return JSON.parse(value);
}
function scenario(name, run) { run(); completed += 1; process.stdout.write(`PASS ${completed} ${name}\n`); }

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

function seed(box) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
    VALUES('${STORE}','Boş Ana Sayfa','empty-homepage','active','tr','TRY','starter','2026-01-01','2026-01-01');
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
    VALUES('${PRINCIPAL}','https://identity.example.test/oidc','empty-homepage-owner','empty-homepage@example.test',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)
    VALUES('${MEMBERSHIP}','${PRINCIPAL}','${STORE}','store_owner','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
    VALUES('50000000-0000-4000-8000-000000000098','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
    INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)
    VALUES('60000000-0000-4000-8000-000000000098','${STORE}','${HOST}','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
    COMMIT;`);
}

function seedPublication(box) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.storefront_design_media(id,store_id,object_key,public_url,media_type,alt_text,width,height,content_length,content_sha256,status,created_at,updated_at)
    VALUES('${MEDIA}','${STORE}','stores/${STORE}/design/${MEDIA}.webp','https://media.saas-staging.celebix.site/stores/${STORE}/design/${MEDIA}.webp','image/webp','Vitrin',1600,900,4096,'${fingerprint("empty-homepage-hero")}', 'active','2026-01-01','2026-01-01');
    INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at)
    VALUES('${RECORD}','${STORE}','starter_theme_composition','Tema',saas.storefront_theme_default_composition(),'active',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.campaign_starter_publications(store_id,record_id,record_version,config,published_at)
    VALUES('${STORE}','${RECORD}',1,saas.storefront_theme_default_composition(),'2026-01-01');
    UPDATE saas.storefront_designs
    SET draft_config=pg_catalog.jsonb_set(
          pg_catalog.jsonb_set(draft_config,ARRAY['hero','slides','0','desktopImage'],pg_catalog.jsonb_build_object('kind','media','mediaId','${MEDIA}'),false),
          ARRAY['composition'],saas.storefront_theme_default_composition(),false
        ),
        published_config=pg_catalog.jsonb_set(
          pg_catalog.jsonb_set(published_config,ARRAY['hero','slides','0','desktopImage'],pg_catalog.jsonb_build_object('kind','media','mediaId','${MEDIA}'),false),
          ARRAY['composition'],saas.storefront_theme_default_composition(),false
        )
    WHERE store_id='${STORE}';
    COMMIT;`);
}

const CATEGORY="61000000-0000-4000-8000-000000000165";
const ASSET="71000000-0000-4000-8000-000000000165";
const SECOND_ASSET="71000000-0000-4000-8000-000000000166";
const FOREIGN="10000000-0000-4000-8000-000000000166";
const FOREIGN_ASSET="71000000-0000-4000-8000-000000000167";
const productId=index=>`82000000-0000-4000-8000-${String(index).padStart(12,"0")}`;
const variantId=index=>`83000000-0000-4000-8000-${String(index).padStart(12,"0")}`;
const literal=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
const scalar=(box,sql)=>psql(box,sql).stdout.trim();
const json=(box,sql)=>JSON.parse(scalar(box,sql));
const owner=(box,sql)=>psql(box,`BEGIN;SET LOCAL ROLE celebix_saas_owner;${sql};COMMIT;`);

async function main() {
 let box;
 try {
  box=start(); psql(box,`CREATE DATABASE ${DB};`,"postgres");
  for(const file of baseMigrations()) apply(box,file);
  seed(box);
  const extra = readdirSync(SQL).filter(file => file.endsWith(".up.sql") && Number(file.slice(8,12))>71 && Number(file.slice(8,12))<=128 && file!=="202607300073_seed_guzide_pilot_admin_domain.up.sql").sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12)) || a.localeCompare(b));
  for(const file of extra) apply(box,file);
  apply(box,"202609250153_category_product_manual_order.up.sql");
  apply(box,"202609250154_category_product_public_order.up.sql");
  apply(box,"202609260165_storefront_design_workspace_fixes.up.sql");
  seedPublication(box);
  owner(box,`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${FOREIGN}','Foreign','foreign','active','tr','TRY','starter','2026-01-01','2026-01-01');
   INSERT INTO saas.catalog_categories(id,store_id,name,slug,created_at,updated_at) VALUES('${CATEGORY}','${STORE}','Category','category','2026-01-01','2026-01-01');
   ${[ASSET,SECOND_ASSET,FOREIGN_ASSET].map((id,index)=>{const store=index===2?FOREIGN:STORE; const key=`stores/${store}/storefront/category/${id}.webp`; return `INSERT INTO saas.storefront_assets(id,store_id,asset_kind,object_key,public_url,media_type,alt_text,width,height,byte_size,status,created_at,updated_at) VALUES('${id}','${store}','category','${key}','https://media.saas-staging.celebix.site/${key}','image/webp','Category',600,800,100,'active','2026-01-01','2026-01-01');`;}).join("\n")}
   INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES('72000000-0000-4000-8000-000000000165','${STORE}','category_showcase','Legacy',${literal({heading:"Legacy heading",enabled:true,layout:"grid",items:[{categoryId:CATEGORY,assetId:ASSET}]})},'active',1,'2026-01-01','2026-01-01');
   ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
   ${Array.from({length:61},(_,i)=>i+1).map(index=>`INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES('${productId(index)}','${index===61?FOREIGN:STORE}','product-${index}','Product ${index}','active','TRY',1,'2026-01-01'::timestamptz-interval '${index} days','2026-01-01');
   INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,barcode,price_cents,compare_at_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES('${variantId(index)}','${productId(index)}','${index===61?FOREIGN:STORE}','Standard','SKU-${index}','869${index}',10000,${index===60?20000:'NULL'},${index<=4?'true':'false'},0,'active','{}',1,'2026-01-01','2026-01-01');
   ${index<=8?`INSERT INTO saas.catalog_product_categories(store_id,product_id,category_id,storefront_position) VALUES('${STORE}','${productId(index)}','${CATEGORY}',${index});`:''}`).join("\n")}
   ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);

  const legacy=json(box,`SELECT published_config FROM saas.storefront_designs WHERE store_id='${STORE}';`);
  const legacyPresentation=json(box,`SELECT saas.public_starter_retail_presentation('${STORE}','${NOW}',false);`);
  apply(box,UP); apply(box,ASSERTIONS);
  const normalized=json(box,`SELECT saas.storefront_design_normalize_v5(${literal(legacy)});`);
  assert.deepEqual(normalizeStorefrontDesignDocumentV5(legacy),normalized,"SQL/TypeScript normalization must match");
  const sections=normalized.composition.sections;
  const banner=sections.find(section=>section.kind==="banner");
  const composition=values=>({...normalized.composition,sections:values});
  const document=values=>({...normalized,composition:composition(values)});
  const valid=values=>scalar(box,`SELECT saas.storefront_design_composition_valid(${literal(composition(values))});`);
  const publishable=(values,current=legacy)=>scalar(box,`SELECT saas.storefront_design_v5_publishable('${STORE}',${literal(document(values))},${literal(current)});`);
  const direct=values=>owner(box,`UPDATE saas.storefront_designs SET schema_version=5,published_config=${literal(document(values))} WHERE store_id='${STORE}'`);
  const home=()=>{const result=rpc(box,`saas.public_starter_retail_home('${STORE}','${HOST}','${NOW}')`,"celebix_saas_host_resolver"); if(result.outcome==="found") parsePublicStarterThemePresentation(result.result.presentation);return result;};
  const manual={kind:"product_row",sectionId:"home_manual_one",enabled:true,heading:"Manual",source:"manual",productIds:[productId(8),productId(5),productId(7)],limit:4};
  const category={kind:"category_grid",sectionId:"home_category_one",enabled:true,heading:"First",layout:"duo",categoryIds:[CATEGORY],categoryImages:[{categoryId:CATEGORY,assetId:ASSET}]};
  scenario("normalization retains media and is stable",()=>{assert.equal(normalized.schemaVersion,5);assert.equal(normalized.hero.enabled,false);assert.equal(banner.presentation,"image_only");assert.deepEqual(banner.slides[0].desktopImage,{kind:"media",mediaId:MEDIA});assert.deepEqual(json(box,`SELECT saas.storefront_design_normalize_v5(${literal(normalized)});`),normalized);});
  scenario("legacy readers remain identical",()=>assert.deepEqual(json(box,`SELECT saas.public_starter_retail_presentation('${STORE}','${NOW}',false);`),legacyPresentation));
  scenario("fifty repeated sections accepted with style",()=>assert.equal(valid(Array.from({length:50},(_,i)=>({...manual,sectionId:`home_manual_${i}`,style:{background:"brand",width:"full",spacing:"large"}}))),"t"));
  scenario("duplicate IDs and styles rejected",()=>{assert.equal(valid([manual,manual]),"f");assert.equal(valid([{...manual,style:{background:"bad",width:"full",spacing:"large"}}]),"f");});
  scenario("manual ordering is resolved from each row",()=>{direct([manual]);assert.deepEqual(home().result.productRows[0].items.map(item=>item.id),manual.productIds);});
  scenario("foreign products cannot publish",()=>assert.equal(publishable([{...manual,productIds:[productId(61)]}]),"f"));
  scenario("repeated categories retain distinct images and layout",()=>{direct([category,{...category,sectionId:"home_category_two",heading:"Second",layout:"grid",categoryImages:[{categoryId:CATEGORY,assetId:SECOND_ASSET}]}]);const projected=home().result.presentation;assert.equal(projected.schemaVersion,4);assert.equal(projected.sections.length,2);assert.equal(projected.sections[0].layout,"duo");assert.ok(projected.sections[0].items[0].image.url.endsWith(`${ASSET}.webp`));assert.ok(projected.sections[1].items[0].image.url.endsWith(`${SECOND_ASSET}.webp`));});
  scenario("banner media source public projection",()=>{direct([banner]);const projected=home().result.presentation.sections[0];assert.equal(projected.kind,"banner");assert.equal(projected.slides[0].desktopImage.url,`https://media.saas-staging.celebix.site/stores/${STORE}/design/${MEDIA}.webp`);assert.equal(projected.slides[0].destination,null);});
  scenario("new legacy URL injection blocked",()=>{const injected={...banner,slides:[{...banner.slides[0],desktopImage:{kind:"legacy_https",url:"https://legacy.example.test/old.webp"}}]};assert.equal(publishable([injected]),"f");const retained={...legacy,hero:{...legacy.hero,slides:[{...legacy.hero.slides[0],desktopImage:injected.slides[0].desktopImage}]}};assert.equal(publishable([injected],retained),"t");});
  scenario("empty visible banners and foreign media blocked",()=>{assert.equal(publishable([{...banner,slides:[]}]),"f");assert.equal(publishable([{...banner,enabled:false,slides:[]}]),"t");assert.equal(publishable([{...banner,slides:[{...banner.slides[0],desktopImage:{kind:"asset",assetId:FOREIGN_ASSET}}]}]),"f");});
  scenario("fifty mixed rows reuse each native source query",()=>{
   owner(box,`ALTER FUNCTION saas.public_effective_product_projection(uuid,uuid,timestamptz) RENAME TO public_effective_product_projection_uncounted;
    CREATE SEQUENCE saas.homepage_projection_calls;
    CREATE FUNCTION saas.public_effective_product_projection(p_store_id uuid,p_product_id uuid,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,saas AS $count$ BEGIN PERFORM pg_catalog.nextval('saas.homepage_projection_calls'); RETURN saas.public_effective_product_projection_uncounted(p_store_id,p_product_id,p_now); END $count$;
    REVOKE ALL ON FUNCTION saas.public_effective_product_projection(uuid,uuid,timestamptz) FROM PUBLIC`);
   try {
    const sources=[manual,{...manual,source:"latest",productIds:undefined},{...manual,source:"sale",productIds:undefined},{...manual,source:"category",categoryId:CATEGORY,productIds:undefined}];
    direct(sources.map((row,index)=>({...row,sectionId:`home_source_${index}`})));home();const baseline=Number(scalar(box,"SELECT last_value FROM saas.homepage_projection_calls;"));
    owner(box,"ALTER SEQUENCE saas.homepage_projection_calls RESTART WITH 1");
    direct(Array.from({length:50},(_,index)=>({...sources[index%4],sectionId:`home_mixed_${index}`,heading:`Row ${index}`,style:{background:"theme",width:"contained",spacing:"normal"}})));
    const projected=home().result;assert.equal(projected.productRows.length,50);assert.equal(projected.presentation.sections.length,50);
    const actual=Number(scalar(box,"SELECT last_value FROM saas.homepage_projection_calls;"));assert.equal(actual,baseline,`50 repeated rows must execute the same ${baseline} product projections as four distinct sources`);
    process.stdout.write(`Native SQL source cache: four source kinds and50rows both ${actual} product projections.\n`);
   } finally {owner(box,"DROP FUNCTION saas.public_effective_product_projection(uuid,uuid,timestamptz); ALTER FUNCTION saas.public_effective_product_projection_uncounted(uuid,uuid,timestamptz) RENAME TO public_effective_product_projection; DROP SEQUENCE saas.homepage_projection_calls");}
  });
  scenario("archived legacy draft stays intact when live V5 is written",()=>{
   owner(box,`UPDATE saas.storefront_design_media SET status='deleted' WHERE id='${MEDIA}'`);
   const before=json(box,`SELECT pg_catalog.jsonb_build_object('draft',draft_config,'version',draft_version) FROM saas.storefront_designs WHERE store_id='${STORE}';`);
   assert.equal(scalar(box,`SELECT saas.storefront_design_document_valid('${STORE}',${literal(before.draft)},true);`),"f");
   direct([manual]);assert.deepEqual(json(box,`SELECT pg_catalog.jsonb_build_object('draft',draft_config,'version',draft_version) FROM saas.storefront_designs WHERE store_id='${STORE}';`),before);
   owner(box,`UPDATE saas.storefront_design_media SET status='active' WHERE id='${MEDIA}'`);
  });
  scenario("rollback refuses authored V5 content",()=>{const result=psql(box,readFileSync(path.join(SQL,DOWN),"utf8"),DB,true);assert.notEqual(result.status,0);assert.match(result.stderr,/SECTION_HOMEPAGE_V4_DOWN_DATA_PRESENT/);});
  owner(box,`UPDATE saas.storefront_designs SET schema_version=4,published_config=${literal(legacy)} WHERE store_id='${STORE}'`);
  scenario("rollback restores exact legacy functions",()=>{apply(box,DOWN);assert.deepEqual(json(box,`SELECT saas.public_starter_retail_presentation('${STORE}','${NOW}',false);`),legacyPresentation);apply(box,UP);apply(box,ASSERTIONS);});
  const extension=path.join(import.meta.dirname,"direct-apply-scenarios.mjs");
  if(existsSync(extension)){apply(box,"202609300179_storefront_design_direct_apply.up.sql");apply(box,"202609300179_storefront_design_direct_apply_assertions.sql");const {runDirectApplyScenarios}=await import(extension);await runDirectApplyScenarios({box,ROOT,SQL,DB,STORE,PRINCIPAL,MEMBERSHIP,PLAN,HOST,NOW,MEDIA,CATEGORY,ASSET,SECOND_ASSET,FOREIGN,FOREIGN_ASSET,productId,variantId,literal,scalar,json,owner,rpc,apply,psql,fingerprint,authority,scenario,legacy,normalized,manual,banner,category,composition,document,direct,home});}
  process.stdout.write(`Verified ${completed} disposable PostgreSQL scenarios.\n`);
 } finally {stop(box);}
}
await main();
