import assert from "node:assert/strict";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const DB = "product_brand_logos";
const UP = "202608030082_product_brand_logos.up.sql";
const DOWN = "202608030082_product_brand_logos.down.sql";
const ASSERTIONS = "202608030082_product_brand_logos_assertions.sql";
const STORE = "10000000-0000-4000-8000-000000000082";
const OTHER_STORE = "10000000-0000-4000-8000-000000000083";
const PRODUCT = "20000000-0000-4000-8000-000000000082";
const VARIANT = "30000000-0000-4000-8000-000000000082";
const BRAND = "40000000-0000-4000-8000-000000000082";
const LOGO = "50000000-0000-4000-8000-000000000082";
const OTHER_LOGO = "50000000-0000-4000-8000-000000000083";
const HERO = "50000000-0000-4000-8000-000000000084";
const ARCHIVED_LOGO = "50000000-0000-4000-8000-000000000085";
const NOW = "2026-08-03T12:00:00.000Z";
let completed = 0;
const TOTAL = 10;

function executable(name) {
  const candidates = [process.env.POSTGRES_BIN, ...(process.env.PATH ?? "").split(path.delimiter)];
  try {
    for (const entry of readdirSync(path.join(homedir(), ".codex", "tmp"), { withFileTypes: true })) {
      if (entry.isDirectory() && /^postgresql-16[.]/.test(entry.name)) candidates.push(path.join(homedir(), ".codex", "tmp", entry.name, "bin"));
    }
  } catch {}
  for (const directory of candidates) {
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
  const tools = Object.fromEntries(["initdb", "pg_ctl", "psql"].map((name) => [name, executable(name)]));
  const root = mkdtempSync(path.join(tmpdir(), "celebix-brand-logo-"));
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

function apply(box, file) { psql(box, readFileSync(path.join(SQL, file), "utf8")); }
function migrations() {
  const accepted = /(?:[.]up|[.]seed|[.]freeze|_grants|_assertions|catalog_assertions)[.]sql$/;
  return readdirSync(SQL).filter((file) => {
    const sequence = Number.parseInt(file.slice(8, 12), 10);
    return Number.isSafeInteger(sequence) && sequence <= 71 && accepted.test(file) && !file.includes(".down.");
  }).sort((left, right) => {
    const a = Number.parseInt(left.slice(8, 12), 10);
    const b = Number.parseInt(right.slice(8, 12), 10);
    if (a !== b) return a - b;
    const weight = (value) => value.includes("assertions") ? 3 : value.includes("freeze") || value.includes("grants") ? 2 : 1;
    return weight(left) - weight(right) || left.localeCompare(right);
  });
}

function product(box) {
  return JSON.parse(psql(box, `SELECT saas.public_campaign_product_projection('${STORE}','${PRODUCT}','${NOW}')::text;`).stdout.trim());
}

function setBrandConfig(box, config) {
  psql(box, `SET ROLE celebix_saas_owner; UPDATE saas.catalog_admin_resources SET config='${JSON.stringify(config).replaceAll("'", "''")}'::jsonb,updated_at='${NOW}',version=version+1 WHERE id='${BRAND}';`);
}

async function scenario(name, run) {
  await run();
  completed += 1;
  console.log(`PASS ${completed}/${TOTAL} ${name}`);
}

function assertBrandWithoutLogo(value) {
  assert.deepEqual(value.brand, { name: "Güzide Kuyumcu", slug: "guzide-kuyumcu" });
}

async function main() {
  let box;
  try {
    for (const file of [UP, DOWN, ASSERTIONS]) assert.equal(existsSync(path.join(SQL, file)), true, file);
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const file of migrations()) apply(box, file);
    for (const file of [
      "202607310072_storefront_cart_checkout.up.sql",
      "202608010073_storefront_checkout_readiness.up.sql",
      "202608010073_storefront_checkout_readiness_assertions.sql",
      "202608010074_campaign_starter_composition.up.sql",
      "202608010074_campaign_starter_composition_assertions.sql",
      "202608020075_complete_starter_retail_experience.up.sql",
      "202608020075_complete_starter_retail_experience_assertions.sql",
      "202608030081_storefront_design_workspace.up.sql",
      "202608030081_storefront_design_workspace_assertions.sql",
    ]) apply(box, file);
    psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
      INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
        ('${STORE}','Güzide','guzide','active','tr','TRY','starter','2026-01-01','2026-01-01'),
        ('${OTHER_STORE}','Diğer','diger','active','tr','TRY','starter','2026-01-01','2026-01-01');
      INSERT INTO saas.products(id,store_id,slug,title,description,status,currency,version,archived_at,created_at,updated_at) VALUES
        ('${PRODUCT}','${STORE}','altin-yuzuk','Altın Yüzük',NULL,'active','TRY',1,NULL,'2026-01-01','2026-01-01');
      SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);
      SELECT pg_catalog.set_config('saas.inventory.source_id','60000000-0000-4000-8000-000000000082',true);
      SELECT pg_catalog.set_config('saas.inventory.source_time','${NOW}',true);
      INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,barcode,price_cents,compare_at_cents,cost_cents,stock_tracking,stock_quantity,status,attributes,version,archived_at,created_at,updated_at) VALUES
        ('${VARIANT}','${PRODUCT}','${STORE}','Standart','GUZ-LOGO',NULL,12500,NULL,NULL,true,2,'active','{}',1,NULL,'2026-01-01','2026-01-01');
      SELECT pg_catalog.set_config('saas.inventory.source_marker','',true);
      SELECT pg_catalog.set_config('saas.inventory.source_id','',true);
      SELECT pg_catalog.set_config('saas.inventory.source_time','',true);
      INSERT INTO saas.storefront_assets(id,store_id,asset_kind,object_key,public_url,media_type,alt_text,width,height,byte_size,status,created_at,updated_at,archived_at,version) VALUES
        ('${LOGO}','${STORE}','logo','stores/${STORE}/storefront/logo/${LOGO}.webp','https://media.saas-staging.celebix.site/stores/${STORE}/storefront/logo/${LOGO}.webp','image/webp','Güzide Kuyumcu',480,160,2048,'active','2026-01-01','2026-01-01',NULL,1),
        ('${OTHER_LOGO}','${OTHER_STORE}','logo','stores/${OTHER_STORE}/storefront/logo/${OTHER_LOGO}.webp','https://media.saas-staging.celebix.site/stores/${OTHER_STORE}/storefront/logo/${OTHER_LOGO}.webp','image/webp','Diğer Marka',480,160,2048,'active','2026-01-01','2026-01-01',NULL,1),
        ('${HERO}','${STORE}','hero','stores/${STORE}/storefront/hero/${HERO}.webp','https://media.saas-staging.celebix.site/stores/${STORE}/storefront/hero/${HERO}.webp','image/webp','Hero',1600,900,4096,'active','2026-01-01','2026-01-01',NULL,1),
        ('${ARCHIVED_LOGO}','${STORE}','logo','stores/${STORE}/storefront/logo/${ARCHIVED_LOGO}.webp','https://media.saas-staging.celebix.site/stores/${STORE}/storefront/logo/${ARCHIVED_LOGO}.webp','image/webp','Arşiv Logo',480,160,2048,'archived','2026-01-01','${NOW}','${NOW}',2);
      INSERT INTO saas.catalog_admin_resources(id,store_id,resource_kind,name,slug,config,status,version,created_at,updated_at) VALUES
        ('${BRAND}','${STORE}','brand','Güzide Kuyumcu','guzide-kuyumcu',pg_catalog.jsonb_build_object('logoAssetId','${LOGO}'),'active',1,'2026-01-01','2026-01-01');
      INSERT INTO saas.catalog_admin_resource_products(store_id,resource_id,product_id,position) VALUES('${STORE}','${BRAND}','${PRODUCT}',0);
    COMMIT;`);
    apply(box, UP);
    apply(box, ASSERTIONS);

    await scenario("PostgreSQL 16 applies migration 082", () => assert.match(psql(box, "SHOW server_version;").stdout, /^16[.]/));
    await scenario("active same-store logo is projected", () => assert.deepEqual(product(box).brand, {
      name: "Güzide Kuyumcu",
      slug: "guzide-kuyumcu",
      logo: { url: `https://media.saas-staging.celebix.site/stores/${STORE}/storefront/logo/${LOGO}.webp`, mediaType: "image/webp", altText: "Güzide Kuyumcu", width: 480, height: 160 },
    }));
    await scenario("missing logo config omits only the logo", () => { setBrandConfig(box, {}); assertBrandWithoutLogo(product(box)); });
    await scenario("malformed logo UUID omits only the logo", () => { setBrandConfig(box, { logoAssetId: "not-a-uuid" }); assertBrandWithoutLogo(product(box)); });
    await scenario("cross-store logo omits only the logo", () => { setBrandConfig(box, { logoAssetId: OTHER_LOGO }); assertBrandWithoutLogo(product(box)); });
    await scenario("wrong asset kind omits only the logo", () => { setBrandConfig(box, { logoAssetId: HERO }); assertBrandWithoutLogo(product(box)); });
    await scenario("archived logo omits only the logo", () => { setBrandConfig(box, { logoAssetId: ARCHIVED_LOGO }); assertBrandWithoutLogo(product(box)); setBrandConfig(box, { logoAssetId: LOGO }); });
    await scenario("runtime roles cannot execute the raw logo helper", () => {
      assert.equal(psql(box, "SELECT pg_catalog.has_function_privilege('public','saas.public_product_brand_logo(uuid,jsonb)','EXECUTE');").stdout.trim(), "f");
      assert.equal(psql(box, "SELECT pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.public_product_brand_logo(uuid,jsonb)','EXECUTE');").stdout.trim(), "f");
    });
    apply(box, DOWN);
    await scenario("rollback restores the previous brand projection", () => { assert.equal(psql(box, "SELECT pg_catalog.to_regprocedure('saas.public_product_brand_logo(uuid,jsonb)') IS NULL;").stdout.trim(), "t"); assertBrandWithoutLogo(product(box)); });
    apply(box, UP);
    apply(box, ASSERTIONS);
    await scenario("reapply restores the tenant logo projection", () => assert.equal(product(box).brand.logo.url, `https://media.saas-staging.celebix.site/stores/${STORE}/storefront/logo/${LOGO}.webp`));
    assert.equal(completed, TOTAL);
    console.log(`${TOTAL}/${TOTAL} PASS`);
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

await main();
