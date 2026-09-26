import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP = "202609260165_storefront_design_workspace_fixes.up.sql";
const DOWN = "202609260165_storefront_design_workspace_fixes.down.sql";
const ASSERTIONS = "202609260165_storefront_design_workspace_fixes_assertions.sql";
const DB = `design_workspace_${randomBytes(5).toString("hex")}`;
const STORE = "10000000-0000-4000-8000-000000000098";
const PRINCIPAL = "20000000-0000-4000-8000-000000000098";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000098";
const RECORD = "40000000-0000-4000-8000-000000000098";
const MEDIA = "41000000-0000-4000-8000-000000000098";
const PLAN = "00000000-0000-4000-8000-000000000001";
const HOST = "empty-homepage.example.test";
const NOW = "2026-08-09T12:00:00.000Z";
const TOTAL = 28;
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
  const root = mkdtempSync(path.join(tmpdir(), "cx-design-workspace-"));
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
async function migrationConcurrentSave(box, file, config) {
 const direction=file.endsWith(".down.sql")?"down":"up";
 const marker=direction==="up"?"FROM saas.storefront_designs;":"-- Restore data while the accepting validators are still installed.";
 const pause=direction==="up"?`${marker}\nSELECT pg_catalog.pg_sleep(1.5);`:`PERFORM pg_catalog.pg_sleep(1.5);\n ${marker}`;
 const source=readFileSync(path.join(SQL,file),"utf8");
 assert.ok(source.includes(marker),"concurrency boundary must exist");
 const application=`design165_concurrency_${direction}`;
 const child=spawn(box.tools.psql,["-h",box.socket,"-p",String(box.port),"-X","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d",DB],{env:{...process.env,PGAPPNAME:application},stdio:["pipe","pipe","pipe"]});
 let stderr="";child.stderr.on("data",chunk=>stderr+=chunk);child.stdout.resume();
 const finished=new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",status=>resolve(status));});
 child.stdin.end(source.replace(marker,pause));
 let saveChild;
 try {
  let paused=false;
  for(let attempt=0;attempt<40;attempt++) {
   paused=scalar(box,`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name='${application}' AND wait_event='PgSleep');`)==="t";
   if(paused)break;
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.equal(paused,true,"migration must pause at the real backup/rollback boundary");
  const version=scalar(box,`SELECT draft_version FROM saas.storefront_designs WHERE store_id='${STORE}';`);
  const operation=`95000000-0000-4000-8000-00000000000${direction==="up"?1:2}`;
  const staleOperation=`95000000-0000-4000-8000-00000000000${direction==="up"?3:4}`;
  saveChild=spawn(box.tools.psql,["-h",box.socket,"-p",String(box.port),"-X","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d",DB],{env:{...process.env,PGAPPNAME:`${application}_save`},stdio:["pipe","pipe","pipe"]});
  let saveOutput="",saveErrors="";
  saveChild.stdout.on("data",chunk=>saveOutput+=chunk);saveChild.stderr.on("data",chunk=>saveErrors+=chunk);
  const saveFinished=new Promise((resolve,reject)=>{saveChild.once("error",reject);saveChild.once("close",status=>resolve(status));});
  saveChild.stdin.end(`BEGIN;SET LOCAL ROLE celebix_saas_app;SET LOCAL statement_timeout='10s';SET LOCAL lock_timeout='5s';
   SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.storefront_design_save_draft(${authority()},'${operation}','${fingerprint(`concurrent-${direction}`)}',${version},${literal(config)});
   SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.storefront_design_save_draft(${authority()},'${staleOperation}','${fingerprint(`stale-${direction}`)}',${version},${literal(config)});COMMIT;`);
  let blocked=false;
  for(let attempt=0;attempt<40;attempt++) {
   blocked=scalar(box,`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity save JOIN pg_catalog.pg_stat_activity migration ON migration.application_name='${application}' WHERE save.application_name='${application}_save' AND save.wait_event_type='Lock' AND migration.pid=ANY(pg_catalog.pg_blocking_pids(save.pid)));`)==="t";
   if(blocked)break;
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.equal(blocked,true,"authorized save must wait for the migration transaction lock");
  assert.equal(await finished,0,stderr);
  assert.equal(await saveFinished,0,saveErrors);
  return saveOutput.trim().split("\n").map(value=>JSON.parse(value));
 } finally {if(child.exitCode===null)child.kill("SIGTERM");if(saveChild?.exitCode===null)saveChild.kill("SIGTERM");}
}
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
  owner(box,`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${FOREIGN}','Foreign','foreign','active','tr','TRY','starter','2026-01-01','2026-01-01');
   INSERT INTO saas.catalog_categories(id,store_id,name,slug,created_at,updated_at) VALUES('${CATEGORY}','${STORE}','Category','category','2026-01-01','2026-01-01');
   ${[ASSET,SECOND_ASSET,FOREIGN_ASSET].map((id,index)=>{const store=index===2?FOREIGN:STORE; const key=`stores/${store}/storefront/category/${id}.webp`; return `INSERT INTO saas.storefront_assets(id,store_id,asset_kind,object_key,public_url,media_type,alt_text,width,height,byte_size,status,created_at,updated_at) VALUES('${id}','${store}','category','${key}','https://media.example.test/${key}','image/webp','Category',600,800,100,'active','2026-01-01','2026-01-01');`;}).join("\n")}
   INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES('72000000-0000-4000-8000-000000000165','${STORE}','category_showcase','Legacy',${literal({heading:"Legacy heading",enabled:true,layout:"grid",items:[{categoryId:CATEGORY,assetId:ASSET}]})},'active',1,'2026-01-01','2026-01-01');
   ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
   ${Array.from({length:61},(_,i)=>i+1).map(index=>`INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES('${productId(index)}','${index===61?FOREIGN:STORE}','product-${index}','Product ${index}','active','TRY',1,'2026-01-01'::timestamptz-interval '${index} days','2026-01-01');
   INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,barcode,price_cents,compare_at_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES('${variantId(index)}','${productId(index)}','${index===61?FOREIGN:STORE}','Standard','SKU-${index}','869${index}',10000,${index===60?20000:'NULL'},${index<=4?'true':'false'},0,'active','{}',1,'2026-01-01','2026-01-01');
   ${index<=8?`INSERT INTO saas.catalog_product_categories(store_id,product_id,category_id,storefront_position) VALUES('${STORE}','${productId(index)}','${CATEGORY}',${index});`:''}`).join("\n")}
   ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile`);
  let design=json(box,`SELECT draft_config FROM saas.storefront_designs WHERE store_id='${STORE}';`);
  design.hero.enabled=false;
  const composition=design.composition;
  const manual={kind:"product_row",sectionId:"home_manual_1",enabled:true,heading:"Selected",source:"manual",productIds:[productId(8),productId(5),productId(7)],limit:4};
  const category={kind:"category_grid",sectionId:"home_category_1",enabled:true,heading:"New heading",layout:"duo",categoryIds:[CATEGORY],categoryImages:[{categoryId:CATEGORY,assetId:SECOND_ASSET}]};
  const comp=sections=>({...composition,sections});
  const doc=sections=>({...design,composition:comp(sections)});
  const legacyValid=sections=>scalar(box,`SELECT saas.campaign_starter_composition_valid(${literal(comp(sections))});`);
  const valid=sections=>scalar(box,`SELECT saas.storefront_design_composition_valid(${literal(comp(sections))});`);
  const refs=(sections,publish=false)=>scalar(box,`SELECT saas.storefront_theme_composition_references_valid('${STORE}',${literal(comp(sections))},${publish});`);
  const publishable=sections=>scalar(box,`SELECT saas.storefront_design_publishable('${STORE}',${literal(doc(sections))});`);
  assert.equal(legacyValid([{...manual,productIds:[]}]),"f","baseline must reproduce the missing manual draft contract");
  assert.equal(publishable([{...manual,source:"latest",productIds:undefined}]),"f","baseline must reproduce disabled banner publication blocker");
  process.stdout.write("BASELINE defects reproduced: manual draft rejected; disabled banner blocked.\n");
  const oldDoc=JSON.parse(JSON.stringify(doc([{...category,categoryImages:undefined}]))); oldDoc.announcement.items=["Published legacy message"]; oldDoc.composition.announcement.items=["Unpublished divergent message"];
  owner(box,`UPDATE saas.storefront_designs SET published_config=${literal(oldDoc)},published_version=3 WHERE store_id='${STORE}'`);
  const original=json(box,`SELECT published_config FROM saas.storefront_designs WHERE store_id='${STORE}';`);
  const foreignCategory = "61000000-0000-4000-8000-000000000166";
  const invisible = {...category,categoryIds:[foreignCategory],categoryImages:undefined};
  const foreignDesign=doc([invisible]);
  foreignDesign.composition.sections=[invisible];
  owner(box,`INSERT INTO saas.catalog_categories(id,store_id,name,slug,created_at,updated_at) VALUES('${foreignCategory}','${FOREIGN}','Invisible','invisible','2026-01-01','2026-01-01');INSERT INTO saas.storefront_designs(store_id,schema_version,draft_config,published_config,draft_version,published_version,draft_updated_at,published_at,draft_updated_by,published_by) VALUES('${FOREIGN}',4,${literal(foreignDesign)},${literal(foreignDesign)},1,1,'2026-01-01','2026-01-01','${PRINCIPAL}','${PRINCIPAL}')`);
  const migrationSave=await migrationConcurrentSave(box,UP,oldDoc);
  scenario("migration serializes authorized saves before capturing rollback evidence",()=>{
   assert.equal(migrationSave[0].outcome,"saved");
   assert.equal(migrationSave[1].outcome,"draft_version_conflict");
   assert.deepEqual(json(box,`SELECT draft_config FROM saas.storefront_designs WHERE store_id='${STORE}';`),oldDoc);
   const rollback=psql(box,readFileSync(path.join(SQL,DOWN),"utf8"),DB,true);
   assert.notEqual(rollback.status,0);assert.match(rollback.stderr,/DESIGN_WORKSPACE_FIXES_DOWN_DATA_CHANGED/);
   assert.deepEqual(json(box,`SELECT draft_config FROM saas.storefront_designs WHERE store_id='${STORE}';`),oldDoc,"refused rollback must preserve the accepted save");
   // Restore only the disposable fixture so the independent exact-down test can run.
   owner(box,`UPDATE saas.storefront_designs design SET draft_config=backup.migrated->'draft',draft_version=(backup.migrated->>'draftVersion')::bigint FROM saas.storefront_design_workspace_fixes_backup backup WHERE design.store_id='${STORE}' AND backup.identity=design.store_id::text`);
  });
  apply(box,ASSERTIONS);
  scenario("legacy merchant compositions never acquire unchecked selection fields",()=>{
   assert.equal(legacyValid([manual]),"f");assert.equal(legacyValid([category]),"f");
   const result=rpc(box,`saas.merchant_admin_save(${authority()},'94000000-0000-4000-8000-000000000001','${fingerprint("legacy-foreign")}',NULL,NULL,'starter_theme_composition','Legacy selection',${literal(comp([{...manual,productIds:[productId(61)]}]))},'active')`);
   assert.equal(result.outcome,"invalid_input");
  });
  scenario("migration keeps formerly invisible category sections hidden",()=>assert.equal(json(box,`SELECT published_config FROM saas.storefront_designs WHERE store_id='${FOREIGN}';`).composition.sections[0].enabled,false));
  scenario("manual rows accept empty editable drafts",()=>assert.equal(valid([{...manual,productIds:[]}]),"t"));
  scenario("manual duplicates over twelve and foreign shapes rejected",()=>{
   assert.equal(valid([{...manual,productIds:[productId(5),productId(5)]}]),"f");
   assert.equal(valid([{...manual,productIds:Array.from({length:13},(_,i)=>productId(i+5))}]),"f");
   assert.equal(valid([{...manual,source:"latest"}]),"f");
  });
  scenario("empty visible manual row blocks publication but hidden draft does not",()=>{
   assert.equal(publishable([{...manual,productIds:[]}]),"f");
   assert.equal(publishable([{...manual,enabled:false,productIds:[]}]),"t");
  });
  scenario("foreign product references always rejected including hidden sections",()=>{
   assert.equal(refs([{...manual,productIds:[productId(61)]}]),"f");
   assert.equal(refs([{...manual,enabled:false,productIds:[productId(61)]}],true),"f");
  });
  scenario("category mappings validate complete editable shape",()=>{
   assert.equal(valid([category]),"t"); assert.equal(refs([category],true),"t");
   assert.equal(valid([{...category,categoryImages:[category.categoryImages[0],category.categoryImages[0]]}]),"f");
  });
  scenario("hidden missing category images publish but foreign assets never do",()=>{
   assert.equal(refs([{...category,categoryImages:[]}]),"t"); assert.equal(refs([{...category,categoryImages:[]}],true),"f");
   assert.equal(refs([{...category,enabled:false,categoryImages:[]}],true),"t");
   assert.equal(refs([{...category,enabled:false,categoryImages:[{categoryId:CATEGORY,assetId:FOREIGN_ASSET}]}],true),"f");
  });
  scenario("omitted category mappings retain legacy tenant image fallback",()=>assert.equal(refs([{...category,categoryImages:undefined}],true),"t"));
  scenario("disabled banner is publishable without media",()=>assert.equal(publishable([{...manual,source:"latest",productIds:undefined}]),"t"));
  scenario("migration preserves previously published announcement and category content",()=>{
   const migrated=json(box,`SELECT published_config FROM saas.storefront_designs WHERE store_id='${STORE}';`);
   assert.deepEqual(migrated.composition.announcement.items,original.announcement.items);
   assert.equal(migrated.composition.sections[0].heading,"Legacy heading");
   assert.equal(migrated.composition.sections[0].layout,"grid");
   assert.equal(migrated.composition.sections[0].categoryImages[0].assetId,ASSET);
  });
  const rollbackSave=await migrationConcurrentSave(box,DOWN,oldDoc);
  scenario("rollback serializes authorized saves before checking unchanged design data",()=>{
   assert.equal(rollbackSave[0].outcome,"saved");
   assert.equal(rollbackSave[1].outcome,"draft_version_conflict");
   assert.deepEqual(json(box,`SELECT draft_config FROM saas.storefront_designs WHERE store_id='${STORE}';`),oldDoc,"save after completed rollback must persist");
  });
  scenario("rollback restores exact documents and functions before user changes",()=>{
   assert.deepEqual(json(box,`SELECT published_config FROM saas.storefront_designs WHERE store_id='${STORE}';`),original);
   assert.equal(legacyValid([manual]),"f"); apply(box,UP); assert.equal(valid([manual]),"t");
  });
  scenario("reapplied migration retains the save accepted after rollback",()=>{
   const backup=json(box,`SELECT original FROM saas.storefront_design_workspace_fixes_backup WHERE identity='${STORE}';`);
   assert.deepEqual(backup.draft,oldDoc);assert.equal(backup.draftVersion,rollbackSave[0].result.draftVersion);
  });
  const workspace=()=>json(box,`SELECT saas.storefront_design_workspace_payload('${STORE}');`);
  let operation=0; const op=()=>`91000000-0000-4000-8000-${String(++operation).padStart(12,"0")}`;
  let saved;
  scenario("tenant save preserves ordered IDs and replay is idempotent",()=>{
   const workspaceBefore=workspace(),operationId=op(),hash=fingerprint("manual");
   const sql=`saas.storefront_design_save_draft(${authority()},'${operationId}','${hash}',${workspaceBefore.draftVersion},${literal(doc([manual]))})`;
   saved=rpc(box,sql); assert.equal(saved.outcome,"saved"); assert.deepEqual(saved.result.draft.composition.sections[0].productIds,manual.productIds);
   const replay=rpc(box,sql); assert.equal(replay.outcome,"operation_replayed"); assert.deepEqual(replay.result,saved.result);
  });
  scenario("publish atomically promotes the saved selection with optional banner",()=>{
   const result=rpc(box,`saas.storefront_design_publish(${authority()},'${op()}','${fingerprint("publish")}',${saved.result.draftVersion},${workspace().publishedVersion})`);
   assert.equal(result.outcome,"published"); assert.deepEqual(workspace().publishedDraft.composition.sections[0].productIds,manual.productIds);
  });
  const home=()=>rpc(box,`saas.public_starter_retail_home('${STORE}','${HOST}','${NOW}')`,"celebix_saas_host_resolver");
  scenario("published manual query preserves row order without substitution",()=>{
   const result=home(); assert.equal(result.outcome,"found"); assert.deepEqual(result.result.productRows[0].items.map(product=>product.id),manual.productIds);
   assert.equal(result.result.presentation.sections[0].source,"manual"); assert.deepEqual(result.result.presentation.sections[0].productIds,manual.productIds);
  });
  scenario("workspace exposes full publication assets and product SKU barcode metadata",()=>{
   const result=workspace(); assert.ok(result.publishedDraft); assert.equal(result.assets.length,2);
   const product=result.destinations.find(choice=>choice.resourceId===productId(5));
   assert.deepEqual(product.searchTerms,["8695","SKU-5"]); assert.deepEqual(product.categoryIds,[CATEGORY]); assert.equal(product.available,true); assert.equal(product.priceCents,10000);
   assert.equal(result.destinations.some(choice=>choice.resourceId===productId(61)),false);
  });
  scenario("category banner and workspace targets use the real canonical route",()=>{
   assert.equal(json(box,`SELECT saas.storefront_design_public_destination('${STORE}',${literal({kind:"collection",resourceId:CATEGORY})});`).path,"/categories/category");
   assert.equal(workspace().destinations.find(choice=>choice.resourceId===CATEGORY).path,"/categories/category");
  });
  const direct=sections=>owner(box,`UPDATE saas.storefront_designs SET published_config=${literal(doc(sections))} WHERE store_id='${STORE}'`);
  scenario("composition category heading layout IDs and explicit image override win",()=>{
   direct([category]);const result=home().result.presentation.sections[0];assert.equal(result.heading,"New heading");assert.equal(result.layout,"duo");assert.equal(result.items[0].image.url.endsWith(`${SECOND_ASSET}.webp`),true);
  });
  scenario("sale query finds discounted product older than first forty eight candidates",()=>{
   direct([{...manual,source:"sale",productIds:undefined}]);assert.deepEqual(home().result.productRows[0].items.map(product=>product.id),[productId(60)]);
  });
  scenario("category query fills four cards after four ranked unavailable products",()=>{
   direct([{...manual,source:"category",categoryId:CATEGORY,productIds:undefined}]);assert.deepEqual(home().result.productRows[0].items.map(product=>product.id),[5,6,7,8].map(productId));
  });
  scenario("available discounted public preview query uses all eligibility before pagination",()=>{
   const result=rpc(box,`saas.public_catalog_query_v2('${HOST}','${NOW}',NULL,'','available_discounted','featured',4,0)`,"celebix_saas_host_resolver");
   assert.equal(result.outcome,"found");assert.equal(result.result.total,1);assert.equal(result.result.items[0].id,productId(60));
  });
  scenario("archived products remain invalid tenant selections",()=>{
   owner(box,`UPDATE saas.products SET status='archived',archived_at='${NOW}',updated_at='${NOW}',version=version+1 WHERE id='${productId(9)}'`);
   assert.equal(refs([{...manual,productIds:[productId(9)]}]),"f");
  });
  scenario("public custom page lookup serves only this tenant active published content",()=>{
   owner(box,`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES
    ('96000000-0000-4000-8000-000000000001','${STORE}','page','About',${literal({slug:"about",locale:"tr",body:"<p>Store content.</p>",published:true})},'active',1,'2026-01-01','2026-01-01'),
    ('96000000-0000-4000-8000-000000000002','${STORE}','page','Draft',${literal({slug:"draft",locale:"tr",body:"Draft content",published:false})},'active',1,'2026-01-01','2026-01-01'),
    ('96000000-0000-4000-8000-000000000003','${FOREIGN}','page','Foreign',${literal({slug:"foreign",locale:"tr",body:"Foreign content",published:true})},'active',1,'2026-01-01','2026-01-01'),
    ('96000000-0000-4000-8000-000000000004','${STORE}','page','Empty',${literal({slug:"empty",published:true})},'active',1,'2026-01-01','2026-01-01')`);
   const page=slug=>rpc(box,`saas.public_content_page_get('${HOST}','${NOW}','${slug}')`,"celebix_saas_host_resolver");
   assert.equal(page("about").result.body,"<p>Store content.</p>"); assert.equal(page("draft").outcome,"not_found"); assert.equal(page("foreign").outcome,"not_found"); assert.equal(page("../about").outcome,"invalid_input");
   assert.equal(page("empty").outcome,"found");assert.equal(page("empty").result.body,"");
  });
  scenario("runtime roles receive no backup or private helper authority",()=>assert.equal(scalar(box,`SELECT has_table_privilege('celebix_saas_app','saas.storefront_design_workspace_fixes_backup','SELECT') OR has_function_privilege('celebix_saas_host_resolver','saas.storefront_design_category_asset(uuid,jsonb,uuid)','EXECUTE');`),"f"));
  scenario("rollback refuses post migration user design changes",()=>{
   const result=psql(box,readFileSync(path.join(SQL,"202609260165_storefront_design_workspace_fixes.down.sql"),"utf8"),DB,true);assert.notEqual(result.status,0);assert.match(result.stderr,/DESIGN_WORKSPACE_FIXES_DOWN_DATA_CHANGED/);
  });
  assert.equal(completed,TOTAL);process.stdout.write(`DESIGN_WORKSPACE_FIXES_POSTGRESQL16_COMPLETE ${completed}/${TOTAL}\n`);
 } finally {stop(box);}
}
main();
