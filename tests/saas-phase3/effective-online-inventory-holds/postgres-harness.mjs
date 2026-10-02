import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const BIN = path.join(homedir(), ".codex/tmp/postgresql-16.14-install/bin");
const MIGRATION = "202610010189_effective_online_inventory_holds";
const FIXTURE = "a1890000-0000-4000-8000-000000000001";
const RED = /EFFECTIVE_ONLINE_HOLDS_EXPIRED_ADMISSION_BLOCKED: INVENTORY_ACTIVE_HOLD_VIOLATION/u;
let box;
let count = 0;
const pass = (label) => console.log(`PASS ${++count} ${label}`);

function command(name, args, input = "", allowFailure = false) {
  const result = spawnSync(path.join(BIN, name), args, {
    cwd: ROOT, input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    env: { PATH: process.env.PATH, LC_ALL: "C", LANG: "C" },
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`${name} failed\n${result.stderr}`);
  return result;
}
function sql(source, allowFailure = false) {
  return command("psql", ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], source, allowFailure);
}
const value = (source) => sql(source).stdout.trim();
const apply = (file) => sql(readFileSync(path.join(SQL, file), "utf8"));
const assertions = () => readFileSync(path.join(SQL, `${MIGRATION}_assertions.sql`), "utf8");
function fixtureGone() {
  assert.equal(value(`SELECT count(*) FROM saas.stores WHERE id='${FIXTURE}';`), "0", "rolled-back fixture leaked");
}
function expectRed(label) {
  const result = sql("SELECT set_config('saas.effective_holds_189.case','inventory',false);\n" + assertions(), true);
  assert.notEqual(result.status, 0, "old behavior unexpectedly admitted the last unit");
  assert.match(result.stderr, RED, "failure was not the stale-held inventory defect");
  fixtureGone();
  pass(label);
}
function expectLateRed(version) {
  const result = sql(`SELECT set_config('saas.effective_holds_189.case','v${version}',false);\n` + assertions(), true);
  assert.notEqual(result.status, 0, `old V${version} late capture unexpectedly handled POS conflict`);
  assert.match(result.stderr, new RegExp(`EFFECTIVE_ONLINE_HOLDS_LATE_V${version}_CAPTURE_ABORTED: (?:INVENTORY_ACTIVE_HOLD_VIOLATION|CATALOG_VARIANT_HAS_HELD_CHECKOUT_RESERVATION)`, "u"), "failure was not the missing POS settlement gate");
  fixtureGone();
  pass(`RED actual V${version} late capture misses POS ownership and aborts instead of releasing its own hold`);
}
function expectGreen(label) {
  sql(assertions());
  fixtureGone();
  pass(label);
}
function metadata() {
  return JSON.parse(value(`SELECT jsonb_build_object(
    'relations',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',c.relowner,'acl',c.relacl,'options',c.reloptions,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,
      'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',a.atttypid,'typmod',a.atttypmod,'collation',a.attcollation) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)) ORDER BY c.relname)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relname IN('all_inventory_reservations','checkout_inventory_reservations','in_store_inventory_reservations','payment_attempts','storefront_hosted_checkout_sessions','inventory_balances','product_variants')),
    'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',p.proowner,'acl',p.proacl,'securityDefiner',p.prosecdef,'config',p.proconfig) ORDER BY p.oid::regprocedure::text)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas')
  );`));
}

try {
  assertSafeEnvironment();
  assert.deepEqual(process.argv.slice(2).filter((arg) => !["--red-only", "--up-only"].includes(arg)), [], "unknown harness argument");
  assert.ok(process.argv.slice(2).length <= 1, "select only one harness mode");
  const temporary = mkdtempSync("/tmp/celebix-effective-online-holds-");
  box = { temporary, data: path.join(temporary, "data"), socket: path.join(temporary, "socket"), port: 20000 + Math.floor(Math.random() * 10000), started: false };
  mkdirSync(box.socket, { mode: 0o700 });
  command("initdb", ["-D", box.data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command("pg_ctl", ["-D", box.data, "-o", `-k ${box.socket} -p ${box.port} -h ''`, "-l", path.join(temporary, "postgres.log"), "start"]);
  box.started = true;
  assert.match(value("SHOW server_version;"), /^16\./u);
  const migrations = readdirSync(SQL).filter((file) => /^\d{12}/u.test(file) && Number(file.slice(8, 12)) <= 156 && /(?:\.up|\.seed|\.freeze|_grants)\.sql$/u.test(file) && !file.includes("seed_guzide_pilot_admin_domain"))
    .sort((a, b) => Number(a.slice(8, 12)) - Number(b.slice(8, 12)) || a.localeCompare(b));
  for (const file of migrations) {
    if (file === "202609230148_celebix_net_staging_starter_storefront.up.sql") {
      sql(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
        VALUES('10000000-0000-4000-8000-000000000148','Butik Siora','butik-siora','active','tr','TRY','hemenaku','2026-01-01','2026-01-01');
        INSERT INTO saas.domains(id,store_id,normalized_hostname,domain_type,status,canonical,cache_version,created_at,updated_at)
        VALUES('50000000-0000-4000-8000-000000000148','10000000-0000-4000-8000-000000000148','butik-siora.saas-staging.celebix.net','platform_subdomain','active',true,1,'2026-01-01','2026-01-01');`);
    }
    apply(file);
  }
  apply("202609260157_in_store_sales_register.up.sql");
  for (const file of readdirSync(SQL).filter((file) => /^\d{12}/u.test(file) && Number(file.slice(8, 12)) >= 158 && Number(file.slice(8, 12)) <= 160 && /\.up\.sql$/u.test(file)).sort()) apply(file);
  // SQL161 also lists a live-only legacy terminal absent from the repository's
  // bootstrap chain. Use its actual allocator and hash-checked hosted patches
  // only. This focused clone must match189's exact live hosted predecessors.
  const numbering = readFileSync(path.join(SQL, "202609260161_order_number_series.up.sql"), "utf8");
  const numberingAnchor = ") AS predecessors(signature,expected_hash,expected_owner,expected_acl,insert_anchor,updated_insert,allocation_statement,target_variable,add_variable,pos_sale) LOOP";
  assert.equal(numbering.split(numberingAnchor).length, 2, "SQL161 patch manifest anchor drift");
  sql(numbering.replace(numberingAnchor, numberingAnchor.replace(" LOOP", " WHERE signature IN('saas.storefront_hosted_checkout_terminal_transition()','saas.storefront_hosted_checkout_promotion_terminal_v2()') LOOP")));
  pass("actual migrations through160 plus exact SQL161 hosted predecessors install isolated PostgreSQL16 boundaries");
  const before = metadata();
  expectRed("RED actual expired-held reservation wrongly blocks otherwise available last unit");
  expectLateRed(1);
  expectLateRed(2);
  if (!process.argv.includes("--red-only")) {
    apply(`${MIGRATION}.up.sql`);
    console.log(`EFFECTIVE_ONLINE_INVENTORY_HOLDS_VIEW_SHA256 ${value("SELECT encode(sha256(convert_to(pg_get_viewdef('saas.all_inventory_reservations'::regclass,false),'UTF8')),'hex');")}`);
    expectGreen("GREEN expired history retained while active online and POS holds guard admission and capture stock decrement");
    assert.deepEqual(metadata(), before);
    pass("view columns owner ACL options and existing table RLS/function privileges unchanged");
    if (!process.argv.includes("--up-only")) {
      apply(`${MIGRATION}.down.sql`);
      assert.deepEqual(metadata(), before);
      expectRed("rollback restores the exact stale-hold defect without mutating inventory history");
      expectLateRed(1);
      expectLateRed(2);
      apply(`${MIGRATION}.up.sql`);
      expectGreen("reapply restores admission decrement and active/POS oversell protection");
      assert.deepEqual(metadata(), before);
    }
  }
  console.log(`EFFECTIVE_ONLINE_INVENTORY_HOLDS_POSTGRESQL16_COMPLETE ${count}/${count}`);
} finally {
  if (box?.started) command("pg_ctl", ["-D", box.data, "-m", "fast", "stop"], "", true);
  if (box) rmSync(box.temporary, { recursive: true, force: true });
}
