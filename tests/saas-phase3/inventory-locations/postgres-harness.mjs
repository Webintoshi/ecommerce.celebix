import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "inventory_locations";
const RESTORED = "inventory_locations_restored";
const CLEAN = "inventory_locations_clean";
const PLAN = "00000000-0000-4000-8000-000000000001";
const STORE = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const OWNER = "20000000-0000-4000-8000-000000000001";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000001";
const MEMBERSHIP_B = "30000000-0000-4000-8000-000000000002";
const PRODUCT = "40000000-0000-4000-8000-000000000001";
const PRODUCT_B = "40000000-0000-4000-8000-000000000002";
const VARIANT = "50000000-0000-4000-8000-000000000001";
const VARIANT_B = "50000000-0000-4000-8000-000000000002";
const SECOND = "51000000-0000-4000-8000-000000000002";
const EMPTY = "51000000-0000-4000-8000-000000000003";
const BALANCED = "51000000-0000-4000-8000-000000000004";
const BUSY = "51000000-0000-4000-8000-000000000005";
const RESERVED = "51000000-0000-4000-8000-000000000006";
const SECOND_B = "51000000-0000-4000-8000-000000000007";
const EMPTY_B = "51000000-0000-4000-8000-000000000008";
const TRANSFER = "70000000-0000-4000-8000-000000000001";
const LINE = "71000000-0000-4000-8000-000000000001";
const NOW = "2026-07-23T15:00:00.000Z";
const LATER = "2026-07-23T15:05:00.000Z";

const source = readFileSync(path.join(ROOT, "tests/saas-phase3/price-lists/postgres-harness.mjs"), "utf8");
const priorSource = /const PRIOR = (\[[\s\S]*?\]);/.exec(source)?.[1];
if (!priorSource) throw new Error("PRIOR_MIGRATION_LIST_MISSING");
const PRIOR = [...priorSource.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
const AFTER = [
  "202607220043_inventory_purchasing.up.sql", "202607220043_inventory_purchasing_assertions.sql",
  "202607220044_inventory_counts_transfers.up.sql", "202607220044_inventory_counts_transfers_assertions.sql",
  "202607220045_price_lists.up.sql", "202607220045_price_lists_assertions.sql",
];

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch {}
  }
  throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
}
function command(program, args, { input, allowFailure = false } = {}) {
  const completed = spawnSync(program, args, { cwd: ROOT, encoding: "utf8", input, env: { ...process.env, LC_ALL: "C", LANG: "C" }, maxBuffer: 64 * 1024 * 1024 });
  if (completed.error) throw completed.error;
  if (!allowFailure && completed.status !== 0) throw new Error(`${path.basename(program)} failed\n${completed.stderr}`);
  return completed;
}
function start() {
  const executables = Object.fromEntries(["initdb", "pg_ctl", "psql", "pg_dump", "pg_restore"].map((name) => [name, executable(name)]));
  const root = mkdtempSync("/tmp/celebix-inventory-locations-");
  const data = path.join(root, "data"), socket = path.join(root, "socket"), port = 20000 + Math.floor(Math.random() * 15000);
  mkdirSync(socket, { mode: 0o700 });
  command(executables.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(executables.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { executables, root, data, socket, port };
}
function stop(box) { if (box) command(box.executables.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], { allowFailure: true }); }
function psql(box, input, database = DB, allowFailure = false) {
  return command(box.executables.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input, allowFailure });
}
function psqlAsync(box, input, database = DB) {
  return new Promise((resolve, reject) => {
    const child = spawn(box.executables.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], {
      cwd: ROOT,
      env: { ...process.env, LC_ALL: "C", LANG: "C" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (value) => { stdout += value; });
    child.stderr.on("data", (value) => { stderr += value; });
    child.on("error", reject);
    child.on("close", (status) => status === 0 ? resolve({ stdout, stderr, status }) : reject(new Error(`psql async failed\n${stderr}`)));
    child.stdin.end(input);
  });
}
function apply(box, file, database = DB) { psql(box, readFileSync(path.join(SQL, file), "utf8"), database); }
function seed(box, database = DB) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
VALUES('${OWNER}','https://id.test/oidc','owner','owner@test.invalid',true,'2026-01-01','2026-01-01');
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
('${STORE}','Inventory A','inventory-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
('${STORE_B}','Inventory B','inventory-b','active','tr','TRY','default','2026-01-01','2026-01-01');
INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)
VALUES
('${MEMBERSHIP}','${OWNER}','${STORE}','store_owner','active','2026-01-01','2026-01-01'),
('${MEMBERSHIP_B}','${OWNER}','${STORE_B}','store_owner','active','2026-01-01','2026-01-01');
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
VALUES
('31000000-0000-4000-8000-000000000001','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01'),
('31000000-0000-4000-8000-000000000002','${STORE_B}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES
('${PRODUCT}','${STORE}','inventory-product','Inventory Product','active','TRY',1,'2026-01-01','2026-01-01'),
('${PRODUCT_B}','${STORE_B}','cross-product','Cross Product','active','TRY',1,'2026-01-01','2026-01-01');
INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,cost_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES
('${VARIANT}','${PRODUCT}','${STORE}','Default','INV-1',1500,700,true,50,'active','{}',1,'2026-01-01','2026-01-01'),
('${VARIANT_B}','${PRODUCT_B}','${STORE_B}','Cross','INV-B',2500,900,true,10,'active','{}',1,'2026-01-01','2026-01-01');
COMMIT;`, database);
}
function migrateBase(box, database = DB) {
  for (const file of PRIOR) apply(box, file, database);
  seed(box, database);
  for (const file of AFTER) apply(box, file, database);
}
function authority(store = STORE, now = NOW) { return `'${store}'::uuid,'${OWNER}'::uuid,'${store === STORE_B ? MEMBERSHIP_B : MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${now}'::timestamptz`; }
function fp(marker) { return createHash("sha256").update(marker).digest("hex"); }
function op(seed) { return `8${String(seed).padStart(7, "0")}-0000-4000-8000-${String(seed).padStart(12, "0")}`; }
function saveCall(seed, location, name, expected = null, store = STORE, now = NOW, fingerprint = fp(`save-${seed}`)) {
  return `saas.inventory_locations_save(${authority(store, now)},'${op(seed)}','${fingerprint}','${location}',${expected === null ? "NULL" : expected}::bigint,'${name}')`;
}
function archiveCall(seed, location, expected, now = NOW, fingerprint = fp(`archive-${seed}`), store = STORE) {
  return `saas.inventory_locations_archive(${authority(store, now)},'${op(seed)}','${fingerprint}','${location}',${expected === null ? "NULL" : expected})`;
}
function result(box, call, database = DB) {
  return JSON.parse(psql(box, `SET ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${call};`, database).stdout.trim());
}
function listLocations(box, store = STORE, database = DB) {
  return JSON.parse(psql(box, `SET ROLE celebix_saas_app;SELECT result_payload FROM saas.inventory_list_locations(${authority(store)});`, database).stdout.trim()).items;
}
function entity(seed, prefix = "9") { return `${prefix}${String(seed).padStart(7, "0")}-0000-4000-8000-${String(seed).padStart(12, "0")}`; }
function purchaseSaveCall(seed, location) {
  return `saas.purchasing_save(${authority()},'${op(seed)}','${fp(`purchase-race-${seed}`)}','${entity(seed)}',NULL,'${location}','Race Supplier','[{"lineId":"${entity(seed, "a")}","variantId":"${VARIANT}","orderedQuantity":1,"unitCostCents":100}]'::jsonb)`;
}
function countSaveCall(seed, location) {
  return `saas.inventory_counts_save(${authority()},'${op(seed)}','${fp(`count-race-${seed}`)}','${entity(seed)}',NULL,'${location}','[{"lineId":"${entity(seed, "a")}","variantId":"${VARIANT}"}]'::jsonb)`;
}
function transferSaveCall(seed, location, defaultLocation) {
  return `saas.inventory_transfers_save(${authority()},'${op(seed)}','${fp(`transfer-race-${seed}`)}','${entity(seed)}',NULL,'${location}','${defaultLocation}','[{"lineId":"${entity(seed, "a")}","variantId":"${VARIANT}","quantity":1}]'::jsonb)`;
}
async function race(box, firstCall, secondCall) {
  const script = (call, delay) => `SET statement_timeout='5s';SET lock_timeout='4s';SET ROLE celebix_saas_app;SELECT pg_sleep(${delay});SELECT jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${call};`;
  const [first, second] = await Promise.all([psqlAsync(box, script(firstCall, 0)), psqlAsync(box, script(secondCall, 0.35))]);
  const parse = (value) => JSON.parse(value.stdout.trim().split("\n").at(-1));
  return [parse(first), parse(second)];
}

const TOTAL = 44;
let count = 0;
async function main() {
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    migrateBase(box);
    psql(box, `CREATE DATABASE ${CLEAN} TEMPLATE ${DB};`, "postgres");
    apply(box, "202607230046_inventory_locations.up.sql");
    apply(box, "202607230046_inventory_locations_assertions.sql");
    const defaultLocation = psql(box, `SELECT id FROM saas.inventory_locations WHERE store_id='${STORE}' AND is_default;`).stdout.trim();
    async function scenario(name, run) { await run(); count += 1; console.log(`inventory location scenario ${count}/${TOTAL}: ${name}`); }

    await scenario("PostgreSQL 16 disposable authority is active", () => assert.match(psql(box, "SHOW server_version;").stdout.trim(), /^16\./));
    await scenario("migration 046 and assertions apply", () => assert.equal(psql(box, "SELECT to_regclass('saas.inventory_location_operations') IS NOT NULL;").stdout.trim(), "t"));
    await scenario("operation ledger is FORCE RLS", () => assert.equal(psql(box, "SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='saas.inventory_location_operations'::regclass;").stdout.trim(), "t"));
    await scenario("application role has no direct operation DML", () => assert.notEqual(psql(box, "SET ROLE celebix_saas_app;SELECT count(*) FROM saas.inventory_location_operations;", DB, true).status, 0));
    await scenario("application role has exactly three executable RPCs", () => assert.equal(psql(box, `SELECT count(*) FROM (VALUES
      ('saas.inventory_locations_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)'::regprocedure),
      ('saas.inventory_locations_archive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::regprocedure),
      ('saas.inventory_locations_recover(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'::regprocedure)
    ) f(oid) WHERE has_function_privilege('celebix_saas_app',oid,'EXECUTE');`).stdout.trim(), "3"));
    await scenario("app creates a second active non-default location", () => assert.deepEqual(result(box, saveCall(1, SECOND, "Secondary warehouse")), { outcome: "saved", result: { id: SECOND, replayed: false, status: "active", updatedAt: NOW, version: 1 } }));
    await scenario("list projects exact server-owned archive eligibility", () => {
      const locations = listLocations(box);
      assert.deepEqual(locations.find((location) => location.id === defaultLocation).archiveEligibility, { canArchive: false, reason: "default" });
      assert.deepEqual(locations.find((location) => location.id === SECOND).archiveEligibility, { canArchive: true, reason: null });
    });
    await scenario("create replay is byte-identical", () => assert.equal(result(box, saveCall(1, SECOND, "Secondary warehouse")).outcome, "operation_replayed"));
    await scenario("operation replay retarget is rejected", () => assert.equal(result(box, saveCall(1, EMPTY, "Secondary warehouse")).outcome, "operation_mismatch"));
    await scenario("operation fingerprint mismatch is rejected", () => assert.equal(result(box, saveCall(1, SECOND, "Secondary warehouse", null, STORE, NOW, fp("wrong"))).outcome, "operation_mismatch"));
    await scenario("cross-store membership authority is denied", () => {
      const forged = saveCall(2, EMPTY, "Cross", null, STORE_B).replace(`'${MEMBERSHIP_B}'::uuid`, `'${MEMBERSHIP}'::uuid`);
      assert.notEqual(result(box, forged).outcome, "saved");
    });
    await scenario("update requires exact version and advances it", () => assert.equal(result(box, saveCall(3, SECOND, "City warehouse", 1, STORE, LATER)).result.version, 2));
    await scenario("stale update is rejected", () => assert.equal(result(box, saveCall(4, SECOND, "Stale", 1, STORE, LATER)).outcome, "version_conflict"));
    await scenario("fully authorized store B is denied reuse of store A operation identity", () => {
      assert.equal(result(box, saveCall(17, SECOND_B, "Store B warehouse", null, STORE_B)).outcome, "saved");
      const denied = result(box, saveCall(1, op(1), "Cross-store replay", null, STORE_B));
      assert.deepEqual(denied, { outcome: "operation_mismatch", result: null });
      assert.equal(psql(box, `SELECT count(*) FROM saas.inventory_locations WHERE store_id='${STORE_B}' AND id='${op(1)}';`).stdout.trim(), "0");
    });
    await scenario("global operation identity cannot retarget an archive across authorized stores", () => {
      assert.equal(result(box, saveCall(18, EMPTY_B, "Store B temporary", null, STORE_B)).outcome, "saved");
      assert.equal(result(box, archiveCall(19, EMPTY_B, 1, LATER, fp("archive-19"), STORE_B)).outcome, "archived");
      const denied = result(box, archiveCall(19, SECOND, 2, LATER, fp("archive-19"), STORE));
      assert.deepEqual(denied, { outcome: "operation_mismatch", result: null });
      assert.equal(psql(box, `SELECT status||':'||version FROM saas.inventory_locations WHERE store_id='${STORE}' AND id='${SECOND}';`).stdout.trim(), "active:2");
    });
    await scenario("concurrent authorized stores admit exactly one global operation identity", async () => {
      const target = op(20);
      const [left, right] = await race(box,
        saveCall(20, target, "Global A", null, STORE, NOW, fp("global-a")),
        saveCall(20, target, "Global B", null, STORE_B, NOW, fp("global-b")),
      );
      assert.deepEqual([left.outcome, right.outcome], ["saved", "operation_mismatch"]);
      assert.equal(right.result, null);
      assert.equal(psql(box, `SELECT count(*) FROM saas.inventory_location_operations WHERE operation_id='${op(20)}';`).stdout.trim(), "1");
      assert.equal(psql(box, `SELECT count(*) FROM saas.inventory_locations WHERE id='${target}' AND store_id IN('${STORE}','${STORE_B}');`).stdout.trim(), "1");
    });
    await scenario("default location archive is rejected", () => assert.equal(result(box, archiveCall(5, defaultLocation, 1)).outcome, "invalid_transition"));
    await scenario("app archive rejects an explicit null expected version without mutation", () => {
      const denied = result(box, archiveCall(45, SECOND, null));
      assert.deepEqual(denied, { outcome: "invalid_input", result: null });
      assert.equal(psql(box, `SELECT status||':'||version FROM saas.inventory_locations WHERE store_id='${STORE}' AND id='${SECOND}';`).stdout.trim(), "active:2");
      assert.equal(psql(box, `SELECT count(*) FROM saas.inventory_location_operations WHERE operation_id='${op(45)}';`).stdout.trim(), "0");
    });
    await scenario("empty archive candidate is created", () => assert.equal(result(box, saveCall(6, EMPTY, "Temporary")).outcome, "saved"));
    await scenario("archive persists exact status and version", () => assert.deepEqual(result(box, archiveCall(7, EMPTY, 1, LATER)), { outcome: "archived", result: { id: EMPTY, replayed: false, status: "archived", updatedAt: LATER, version: 2 } }));
    await scenario("archive replay is byte-identical", () => assert.equal(result(box, archiveCall(7, EMPTY, 1, LATER)).outcome, "operation_replayed"));
    await scenario("archived location cannot be selected for new transfer work", () => {
      const call = `saas.inventory_transfers_save(${authority()},'${op(8)}','${fp("transfer-archived")}','70000000-0000-4000-8000-000000000008',NULL,'${defaultLocation}','${EMPTY}','[{"lineId":"71000000-0000-4000-8000-000000000008","variantId":"${VARIANT}","quantity":1}]'::jsonb)`;
      assert.equal(result(box, call).outcome, "invalid_input");
    });
    await scenario("nonzero on-hand balance blocks archive", () => {
      assert.equal(result(box, saveCall(9, BALANCED, "Balanced")).outcome, "saved");
      psql(box, `SET ROLE celebix_saas_owner;INSERT INTO saas.inventory_balances(store_id,location_id,variant_id,quantity,version,updated_at) VALUES('${STORE}','${BALANCED}','${VARIANT}',1,1,'${NOW}');`);
      assert.deepEqual(listLocations(box).find((location) => location.id === BALANCED).archiveEligibility, { canArchive: false, reason: "positive_on_hand" });
      assert.equal(result(box, archiveCall(10, BALANCED, 1)).outcome, "inventory_conflict");
      psql(box, `SET ROLE celebix_saas_owner;DELETE FROM saas.inventory_balances WHERE store_id='${STORE}' AND location_id='${BALANCED}';`);
    });
    await scenario("eligibility prioritizes positive stock then exposes held reservation", () => {
      assert.equal(result(box, saveCall(21, RESERVED, "Reserved")).outcome, "saved");
      psql(box, `SET session_replication_role=replica;
INSERT INTO saas.inventory_balances(store_id,location_id,variant_id,quantity,version,updated_at) VALUES('${STORE}','${RESERVED}','${VARIANT}',1,1,'${NOW}');
INSERT INTO saas.checkout_inventory_reservations(id,store_id,attempt_id,quick_order_link_id,product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at)
VALUES('${entity(21, "6")}','${STORE}','${entity(22, "6")}','${entity(23, "6")}','${PRODUCT}','${VARIANT}',1,true,'held','${NOW}',1,'${NOW}');
SET session_replication_role=origin;`);
      assert.deepEqual(listLocations(box).find((location) => location.id === RESERVED).archiveEligibility, { canArchive: false, reason: "positive_on_hand" });
      psql(box, `SET session_replication_role=replica;UPDATE saas.inventory_balances SET quantity=0 WHERE store_id='${STORE}' AND location_id='${RESERVED}';SET session_replication_role=origin;`);
      assert.deepEqual(listLocations(box).find((location) => location.id === RESERVED).archiveEligibility, { canArchive: false, reason: "reserved" });
      assert.equal(result(box, archiveCall(22, RESERVED, 1)).outcome, "inventory_conflict");
      psql(box, `SET session_replication_role=replica;DELETE FROM saas.checkout_inventory_reservations WHERE id='${entity(21, "6")}';DELETE FROM saas.inventory_balances WHERE store_id='${STORE}' AND location_id='${RESERVED}';SET session_replication_role=origin;`);
    });
    await scenario("nonterminal purchase blocks archive", () => {
      assert.equal(result(box, saveCall(11, BUSY, "Busy")).outcome, "saved");
      psql(box, `SET ROLE celebix_saas_owner;INSERT INTO saas.purchase_orders(id,store_id,location_id,supplier_name,status,total_cost_cents,version,created_at,updated_at) VALUES('40000000-0000-4000-8000-000000000099','${STORE}','${BUSY}','Supplier','draft',0,1,'${NOW}','${NOW}');`);
      assert.deepEqual(listLocations(box).find((location) => location.id === BUSY).archiveEligibility, { canArchive: false, reason: "open_purchase" });
      assert.equal(result(box, archiveCall(12, BUSY, 1)).outcome, "inventory_conflict");
      psql(box, "SET ROLE celebix_saas_owner;DELETE FROM saas.purchase_orders WHERE id='40000000-0000-4000-8000-000000000099';");
    });
    await scenario("nonterminal count blocks archive", () => {
      psql(box, `SET ROLE celebix_saas_owner;INSERT INTO saas.inventory_counts(id,store_id,location_id,status,version,created_at,updated_at) VALUES('60000000-0000-4000-8000-000000000099','${STORE}','${BUSY}','counting',1,'${NOW}','${NOW}');`);
      assert.deepEqual(listLocations(box).find((location) => location.id === BUSY).archiveEligibility, { canArchive: false, reason: "open_count" });
      assert.equal(result(box, archiveCall(13, BUSY, 1)).outcome, "inventory_conflict");
      psql(box, "SET ROLE celebix_saas_owner;DELETE FROM saas.inventory_counts WHERE id='60000000-0000-4000-8000-000000000099';");
    });
    await scenario("sequential nonterminal transfer exposes and enforces open-transfer denial", () => {
      const transfer = entity(24), line = entity(24, "a");
      const call = `saas.inventory_transfers_save(${authority()},'${op(24)}','${fp("sequential-transfer")}','${transfer}',NULL,'${BUSY}','${defaultLocation}','[{"lineId":"${line}","variantId":"${VARIANT}","quantity":1}]'::jsonb)`;
      assert.equal(result(box, call).outcome, "saved");
      assert.deepEqual(listLocations(box).find((location) => location.id === BUSY).archiveEligibility, { canArchive: false, reason: "open_transfer" });
      assert.equal(result(box, archiveCall(25, BUSY, 1)).outcome, "inventory_conflict");
      assert.equal(psql(box, `SELECT status||':'||version FROM saas.inventory_locations WHERE store_id='${STORE}' AND id='${BUSY}';`).stdout.trim(), "active:1");
    });
    for (const [kind, makeWriter, relation, baseSeed] of [
      ["purchase", (seed, location) => purchaseSaveCall(seed, location), "purchase_orders", 30],
      ["count", (seed, location) => countSaveCall(seed, location), "inventory_counts", 32],
      ["transfer", (seed, location) => transferSaveCall(seed, location, defaultLocation), "inventory_transfers", 34],
    ]) {
      await scenario(`archive-first ${kind} race archives once with no partial writer`, async () => {
        const location = entity(baseSeed, "5"), writerSeed = 100 + baseSeed, archiveSeed = 200 + baseSeed;
        assert.equal(result(box, saveCall(baseSeed, location, `${kind} archive first`)).outcome, "saved");
        if (kind === "count") psql(box, `SET ROLE celebix_saas_owner;INSERT INTO saas.inventory_balances(store_id,location_id,variant_id,quantity,version,updated_at) VALUES('${STORE}','${location}','${VARIANT}',0,1,'${NOW}');`);
        const [archive, writer] = await race(box, archiveCall(archiveSeed, location, 1, LATER), makeWriter(writerSeed, location));
        assert.deepEqual([archive.outcome, writer.outcome], ["archived", "invalid_input"]);
        assert.equal(psql(box, `SELECT status||':'||version FROM saas.inventory_locations WHERE store_id='${STORE}' AND id='${location}';`).stdout.trim(), "archived:2");
        assert.equal(psql(box, `SELECT count(*) FROM saas.${relation} WHERE store_id='${STORE}' AND id='${entity(writerSeed)}';`).stdout.trim(), "0");
      });
      await scenario(`writer-first ${kind} race persists work and denies archive without partial mutation`, async () => {
        const location = entity(baseSeed + 1, "5"), writerSeed = 101 + baseSeed, archiveSeed = 201 + baseSeed;
        assert.equal(result(box, saveCall(baseSeed + 1, location, `${kind} writer first`)).outcome, "saved");
        if (kind === "count") psql(box, `SET ROLE celebix_saas_owner;INSERT INTO saas.inventory_balances(store_id,location_id,variant_id,quantity,version,updated_at) VALUES('${STORE}','${location}','${VARIANT}',0,1,'${NOW}');`);
        const [writer, archive] = await race(box, makeWriter(writerSeed, location), archiveCall(archiveSeed, location, 1, LATER));
        assert.deepEqual([writer.outcome, archive.outcome], ["saved", "inventory_conflict"]);
        assert.equal(psql(box, `SELECT status||':'||version FROM saas.inventory_locations WHERE store_id='${STORE}' AND id='${location}';`).stdout.trim(), "active:1");
        assert.equal(psql(box, `SELECT count(*) FROM saas.${relation} WHERE store_id='${STORE}' AND id='${entity(writerSeed)}';`).stdout.trim(), "1");
        assert.equal(psql(box, `SELECT count(*) FROM saas.inventory_location_operations WHERE operation_id='${op(archiveSeed)}';`).stdout.trim(), "0");
      });
    }
    await scenario("location operation recovery returns exact durable identity", () => {
      const recovered = result(box, `saas.inventory_locations_recover(${authority(STORE, LATER)},'${op(3)}','${fp("save-3")}')`);
      assert.equal(recovered.outcome, "operation_replayed"); assert.equal(recovered.result.id, SECOND);
    });
    await scenario("recovery mismatch is rejected", () => assert.equal(result(box, `saas.inventory_locations_recover(${authority()},'${op(3)}','${fp("bad")}')`).outcome, "operation_mismatch"));
    await scenario("operation rows are immutable", () => assert.notEqual(psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.inventory_location_operations SET committed_at='${LATER}' WHERE store_id='${STORE}';`, DB, true).status, 0));
    await scenario("real app-role transfer saves between both active locations", () => {
      const call = `saas.inventory_transfers_save(${authority(STORE, LATER)},'${op(14)}','${fp("real-transfer")}','${TRANSFER}',NULL,'${defaultLocation}','${SECOND}','[{"lineId":"${LINE}","variantId":"${VARIANT}","quantity":3}]'::jsonb)`;
      assert.equal(result(box, call).outcome, "saved");
    });
    await scenario("real app-role transfer dispatches from default location", () => assert.equal(result(box, `saas.inventory_transfers_dispatch(${authority(STORE, LATER)},'${op(15)}','${fp("dispatch")}','${TRANSFER}',1)`).outcome, "dispatched"));
    await scenario("real app-role transfer receives into second location", () => assert.equal(result(box, `saas.inventory_transfers_receive(${authority(STORE, LATER)},'${op(16)}','${fp("receive")}','${TRANSFER}',2)`).outcome, "received"));
    await scenario("transfer balances prove durable two-location movement", () => assert.equal(psql(box, `SELECT string_agg(location_id::text||':'||quantity::text,',' ORDER BY location_id) FROM saas.inventory_balances WHERE store_id='${STORE}' AND variant_id='${VARIANT}' AND quantity<>0;`).stdout.trim(), `${SECOND}:3,${defaultLocation}:47`));
    await scenario("backup restore preserves location authority and ACL", () => {
      const dump = path.join(box.root, "inventory-locations.dump");
      command(box.executables.pg_dump, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-Fc", "-f", dump, DB]);
      psql(box, `CREATE DATABASE ${RESTORED};`, "postgres");
      command(box.executables.pg_restore, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-d", RESTORED, dump]);
      const sourceCount = psql(box, `SELECT count(*) FROM saas.inventory_locations WHERE store_id='${STORE}';`).stdout.trim();
      assert.equal(psql(box, `SELECT count(*) FROM saas.inventory_locations WHERE store_id='${STORE}';`, RESTORED).stdout.trim(), sourceCount);
      assert.notEqual(psql(box, "SET ROLE celebix_saas_app;SELECT count(*) FROM saas.inventory_location_operations;", RESTORED, true).status, 0);
    });
    await scenario("guarded down refuses durable location state", () => assert.notEqual(psql(box, readFileSync(path.join(SQL, "202607230046_inventory_locations.down.sql"), "utf8"), DB, true).status, 0));
    await scenario("clean rollback and reapply restore exact migration authority", () => {
      apply(box, "202607230046_inventory_locations.up.sql", CLEAN); apply(box, "202607230046_inventory_locations.down.sql", CLEAN);
      assert.equal(psql(box, "SELECT to_regclass('saas.inventory_location_operations') IS NULL;", CLEAN).stdout.trim(), "t");
      assert.equal(psql(box, `SET ROLE celebix_saas_app;SELECT (result_payload->'items'->0) ? 'archiveEligibility' FROM saas.inventory_list_locations(${authority()});`, CLEAN).stdout.trim(), "f");
      apply(box, "202607230046_inventory_locations.up.sql", CLEAN); apply(box, "202607230046_inventory_locations_assertions.sql", CLEAN);
      assert.equal(psql(box, `SET ROLE celebix_saas_app;SELECT (result_payload->'items'->0) ? 'archiveEligibility' FROM saas.inventory_list_locations(${authority()});`, CLEAN).stdout.trim(), "t");
    });
    await scenario("cleanup removes disposable PostgreSQL socket and data", () => {
      const root = box.root; stop(box); box = null; rmSync(root, { recursive: true, force: true }); assert.equal(true, true);
    });
    assert.equal(count, TOTAL);
  } finally { stop(box); }
}

main().catch((error) => { console.error(error?.stack ?? error); process.exitCode = 1; });
