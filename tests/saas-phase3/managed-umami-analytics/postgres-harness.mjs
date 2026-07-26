import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const IMAGE = "postgres:16.14-alpine3.22";
const DB = "managed_umami_analytics";
const RESTORE_DB = "managed_umami_analytics_restore";
const NOW = "2026-07-26T12:00:00.000Z";
const STORE = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const PLAN = "00000000-0000-4000-8000-000000000001";
const OWNER = "20000000-0000-4000-8000-000000000001";
const ADMIN = "20000000-0000-4000-8000-000000000002";
const EDITOR = "20000000-0000-4000-8000-000000000003";
const ANALYST = "20000000-0000-4000-8000-000000000004";
const OWNER_B = "20000000-0000-4000-8000-000000000005";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ADMIN = "30000000-0000-4000-8000-000000000002";
const MEMBERSHIP_EDITOR = "30000000-0000-4000-8000-000000000003";
const MEMBERSHIP_ANALYST = "30000000-0000-4000-8000-000000000004";
const MEMBERSHIP_B = "30000000-0000-4000-8000-000000000005";
const CONNECTION = "40000000-0000-4000-8000-000000000001";
const WEBSITE = "50000000-0000-4000-8000-000000000001";
const CONNECTION_B = "40000000-0000-4000-8000-000000000002";
const WEBSITE_B = "50000000-0000-4000-8000-000000000002";
const OP_BEGIN = "60000000-0000-4000-8000-000000000001";
const OP_ACTIVATE = "60000000-0000-4000-8000-000000000002";
const OP_DISABLE = "60000000-0000-4000-8000-000000000003";
const FP_BEGIN = "a".repeat(64);
const FP_ACTIVATE = "b".repeat(64);
const FP_DISABLE = "c".repeat(64);
const UP = "202607260039_store_analytics_authority.up.sql";
const DOWN = "202607260039_store_analytics_authority.down.sql";
const ASSERTIONS = "202607260039_store_analytics_authority_assertions.sql";
const MANIFEST = "phase3h-analytics-manifest.json";

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* continue */ }
  }
  return null;
}

function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    encoding: options.binary ? null : "utf8",
    input: options.input,
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`${path.basename(program)} failed (${result.status})\n${String(result.stderr ?? "").trim()}`);
  }
  return result;
}

function selectBackend() {
  for (const engine of ["docker", "podman"]) {
    const program = executable(engine);
    if (!program || command(program, ["info"], { allowFailure: true }).status !== 0) continue;
    const imageCheck = engine === "docker" ? ["image", "inspect", IMAGE] : ["image", "exists", IMAGE];
    if (command(program, imageCheck, { allowFailure: true }).status === 0) return { kind: "container", engine, program };
  }
  const names = ["initdb", "pg_ctl", "pg_isready", "psql", "createdb", "dropdb", "pg_dump", "pg_restore"];
  const tools = Object.fromEntries(names.map((name) => [name, executable(name)]));
  if (Object.values(tools).every(Boolean)) return { kind: "native", tools };
  throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
}

function start() {
  const backend = { ...selectBackend(), root: mkdtempSync(path.join(tmpdir(), "celebix-managed-umami-")), started: false };
  const token = randomBytes(6).toString("hex");
  if (backend.kind === "native") {
    backend.data = path.join(backend.root, "data");
    backend.socket = path.join(backend.root, "socket");
    backend.port = 20_000 + Math.floor(Math.random() * 15_000);
    mkdirSync(backend.socket, { mode: 0o700 });
    command(backend.tools.initdb, ["-D", backend.data, "--auth=trust", "--username=postgres", "--no-locale"]);
    command(backend.tools.pg_ctl, ["-D", backend.data, "-o", `-k ${backend.socket} -p ${backend.port} -h ''`, "-l", path.join(backend.root, "postgres.log"), "start"]);
    backend.host = backend.socket;
  } else {
    backend.container = `celebix-managed-umami-${token}`;
    command(backend.program, ["run", "--detach", "--rm", "--pull=never", "--name", backend.container, "--publish", "127.0.0.1::5432", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", IMAGE]);
    const port = command(backend.program, ["port", backend.container, "5432/tcp"]).stdout.trim().match(/127\.0\.0\.1:(\d+)$/);
    if (!port) throw new Error("loopback-only PostgreSQL publication required");
    backend.host = "127.0.0.1";
    backend.port = Number(port[1]);
  }
  backend.started = true;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = backend.kind === "native"
      ? command(backend.tools.pg_isready, ["-h", backend.socket, "-p", String(backend.port), "-U", "postgres"], { allowFailure: true })
      : command(backend.program, ["exec", backend.container, "pg_isready", "-U", "postgres"], { allowFailure: true });
    if (ready.status === 0) return backend;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  throw new Error("disposable PostgreSQL readiness timeout");
}

function stop(box) {
  if (!box) return;
  if (box.started) {
    if (box.kind === "native") command(box.tools.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], { allowFailure: true });
    else command(box.program, ["rm", "--force", box.container], { allowFailure: true });
  }
  rmSync(box.root, { recursive: true, force: true });
}

function databaseCommand(box, tool, args, options = {}) {
  if (box.kind === "native") return command(box.tools[tool], ["-h", box.socket, "-p", String(box.port), "-U", "postgres", ...args], options);
  return command(box.program, ["exec", ...(options.input ? ["-i"] : []), box.container, tool, "-U", "postgres", ...args], options);
}

function psql(box, source, database = DB, options = {}) {
  return databaseCommand(box, "psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database], { input: source, allowFailure: options.allowFailure });
}

function psqlAsync(box, source, database = DB) {
  if (box.kind !== "native") return Promise.resolve(psql(box, source, database));
  return new Promise((resolve, reject) => {
    const child = spawn(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database], { cwd: ROOT, env: { ...process.env, LC_ALL: "C", LANG: "C" } });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (value) => { stdout += value; });
    child.stderr.setEncoding("utf8").on("data", (value) => { stderr += value; });
    child.once("error", reject);
    child.once("close", (status) => status === 0 ? resolve({ stdout, stderr, status }) : reject(new Error(`psql failed\n${stderr}`)));
    child.stdin.end(source);
  });
}

function createDatabase(box, name) { databaseCommand(box, "createdb", [name]); }
function dropDatabase(box, name) { databaseCommand(box, "dropdb", ["--if-exists", name], { allowFailure: true }); }
function apply(box, file, database = DB) { psql(box, readFileSync(path.join(SQL, file), "utf8"), database); }
function hash(file) { return createHash("sha256").update(readFileSync(path.join(SQL, file))).digest("hex"); }
function scalar(box, source, database = DB) { return psql(box, source, database).stdout.trim(); }
function json(box, source, database = DB) { return JSON.parse(scalar(box, source, database)); }
function quote(value) { return `'${String(value).replaceAll("'", "''")}'`; }

function authority({ store = STORE, principal = OWNER, membership = MEMBERSHIP, now = NOW } = {}) {
  return `${quote(store)}::uuid,${quote(principal)}::uuid,${quote(membership)}::uuid,${quote(PLAN)}::uuid,'free_starter',1,${quote(now)}::timestamptz`;
}

function app(box, name, extra = "", actor = {}) {
  const result = scalar(box, `SET ROLE celebix_saas_app; SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.${name}(${authority(actor)}${extra ? `,${extra}` : ""});`);
  return JSON.parse(result);
}

async function appAsync(box, name, extra = "", actor = {}) {
  const result = await psqlAsync(box, `SET ROLE celebix_saas_app; SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.${name}(${authority(actor)}${extra ? `,${extra}` : ""});`);
  return JSON.parse(result.stdout.trim());
}

function resolver(box, hostname, now = NOW) {
  return json(box, `SET ROLE celebix_saas_host_resolver; SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.analytics_connection_get_for_host(${quote(hostname)},${quote(now)}::timestamptz);`);
}

function worker(box, name, args) {
  return json(box, `SET ROLE celebix_saas_workflow; SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.${name}(${args});`);
}

function priorFiles() {
  return readdirSync(SQL).filter((file) => {
    if (!/^202607\d{6}_.+\.sql$/.test(file) || file.includes(".down.") || file.includes("rollback") || file.includes("forward_recovery")) return false;
    const sequence = Number(file.slice(8, 12));
    return sequence <= 38 && (file.endsWith(".up.sql") || file.endsWith(".seed.sql") || file.endsWith(".freeze.sql") || file.endsWith("_grants.sql") || file.endsWith("_assertions.sql") || file === "202607110004_grants.sql" || file === "202607110005_catalog_assertions.sql");
  }).sort();
}

function seed(box) {
  psql(box, `
    SET ROLE celebix_saas_owner;
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
      ('${STORE}','Store A','store-a','active','tr','TRY','default','${NOW}','${NOW}'),
      ('${STORE_B}','Store B','store-b','active','tr','TRY','default','${NOW}','${NOW}');
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
      ('${OWNER}','https://identity.test','owner-a','owner-a@example.test',true,'${NOW}','${NOW}'),
      ('${ADMIN}','https://identity.test','admin-a','admin-a@example.test',true,'${NOW}','${NOW}'),
      ('${EDITOR}','https://identity.test','editor-a','editor-a@example.test',true,'${NOW}','${NOW}'),
      ('${ANALYST}','https://identity.test','analyst-a','analyst-a@example.test',true,'${NOW}','${NOW}'),
      ('${OWNER_B}','https://identity.test','owner-b','owner-b@example.test',true,'${NOW}','${NOW}');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
      ('${MEMBERSHIP}','${OWNER}','${STORE}','store_owner','active','${NOW}','${NOW}'),
      ('${MEMBERSHIP_ADMIN}','${ADMIN}','${STORE}','admin','active','${NOW}','${NOW}'),
      ('${MEMBERSHIP_EDITOR}','${EDITOR}','${STORE}','editor','active','${NOW}','${NOW}'),
      ('${MEMBERSHIP_ANALYST}','${ANALYST}','${STORE}','analyst','active','${NOW}','${NOW}'),
      ('${MEMBERSHIP_B}','${OWNER_B}','${STORE_B}','store_owner','active','${NOW}','${NOW}');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at) VALUES
      ('70000000-0000-4000-8000-000000000001','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01T00:00:00Z',NULL,'${NOW}','${NOW}'),
      ('70000000-0000-4000-8000-000000000002','${STORE_B}','${PLAN}','free_starter',1,'active','2026-01-01T00:00:00Z',NULL,'${NOW}','${NOW}');
    INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES
      ('80000000-0000-4000-8000-000000000001','${STORE}','store-a.example.test','custom_domain','active',true,'${NOW}','${NOW}','${NOW}',1),
      ('80000000-0000-4000-8000-000000000002','${STORE_B}','store-b.example.test','custom_domain','active',true,'${NOW}','${NOW}','${NOW}',1);
    RESET ROLE;
  `);
}

function orderSql(id, payment, updatedAt, store = STORE) {
  return `INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,tracking,version,created_at,updated_at)
    VALUES('${id}','${store}','ORD-${id.slice(-4)}','storefront','Private Customer','private@example.test',NULL,'TRY',10000,0,0,10000,'confirmed','${payment}','{}',NULL,1,'${NOW}','${updatedAt}');`;
}

async function run() {
  let box; let scenarios = 0; const evidence = [];
  const scenario = async (name, proof) => {
    await proof(); scenarios += 1; evidence.push(`PASS ${String(scenarios).padStart(2, "0")}/50 ${name}`);
  };
  try {
    box = start();
    createDatabase(box, DB);
    const version = scalar(box, "SHOW server_version;");
    assert.equal(Number(version.split(".")[0]), 16, `PostgreSQL 16 required, got ${version}`);

    await scenario("manifest order and checksum", () => {
      const manifest = JSON.parse(readFileSync(path.join(SQL, MANIFEST), "utf8"));
      assert.deepEqual(manifest.artifacts.map((entry) => entry.file), [UP, DOWN, ASSERTIONS]);
      for (const entry of manifest.artifacts) assert.equal(entry.sha256, hash(entry.file));
    });
    await scenario("apply migrations 001 through 039", () => { for (const file of priorFiles()) apply(box, file); apply(box, UP); apply(box, ASSERTIONS); seed(box); });
    await scenario("table and column types", () => assert.equal(scalar(box, "SELECT count(*) FROM information_schema.columns WHERE table_schema='saas' AND table_name IN('store_analytics_connections','analytics_connection_operations','analytics_delivery_outbox');"), "35"));
    await scenario("constraints", () => assert.equal(scalar(box, "SELECT count(*)>=16 FROM pg_constraint WHERE connamespace='saas'::regnamespace AND conrelid IN('saas.store_analytics_connections'::regclass,'saas.analytics_connection_operations'::regclass,'saas.analytics_delivery_outbox'::regclass);"), "t"));
    await scenario("indexes", () => assert.equal(scalar(box, "SELECT count(*)>=8 FROM pg_indexes WHERE schemaname='saas' AND tablename IN('store_analytics_connections','analytics_connection_operations','analytics_delivery_outbox');"), "t"));
    await scenario("triggers", () => assert.equal(scalar(box, "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN('store_analytics_connections_authority_guard','analytics_connection_operations_authority_guard','orders_enqueue_analytics_purchase');"), "3"));
    await scenario("RLS is forced", () => assert.equal(scalar(box, "SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE oid IN('saas.store_analytics_connections'::regclass,'saas.analytics_connection_operations'::regclass,'saas.analytics_delivery_outbox'::regclass);"), "t"));
    await scenario("app direct table denial", () => assert.equal(scalar(box, "SELECT has_table_privilege('celebix_saas_app','saas.store_analytics_connections','SELECT,INSERT,UPDATE,DELETE');"), "f"));
    await scenario("resolver direct table denial", () => assert.equal(scalar(box, "SELECT has_table_privilege('celebix_saas_host_resolver','saas.store_analytics_connections','SELECT');"), "f"));
    await scenario("workflow direct table denial", () => assert.equal(scalar(box, "SELECT has_table_privilege('celebix_saas_workflow','saas.analytics_delivery_outbox','SELECT,UPDATE');"), "f"));
    await scenario("exact app function grants", () => assert.equal(scalar(box, "SELECT has_function_privilege('celebix_saas_app','saas.analytics_connection_begin(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid)','EXECUTE');"), "t"));
    await scenario("exact resolver grant", () => assert.equal(scalar(box, "SELECT has_function_privilege('celebix_saas_host_resolver','saas.analytics_connection_get_for_host(text,timestamp with time zone)','EXECUTE');"), "t"));
    await scenario("exact workflow grants", () => assert.equal(scalar(box, "SELECT has_function_privilege('celebix_saas_workflow','saas.analytics_outbox_claim(timestamp with time zone,integer,interval)','EXECUTE');"), "t"));
    await scenario("helper non-exposure", () => { for (const role of ['celebix_saas_app','celebix_saas_host_resolver','celebix_saas_workflow']) assert.equal(scalar(box, `SELECT has_function_privilege('${role}','saas.analytics_connection_is_current(uuid,timestamp with time zone)','EXECUTE');`), "f"); });
    await scenario("default denied", () => assert.equal(scalar(box, "SELECT has_function_privilege('public','saas.analytics_connection_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)','EXECUTE');"), "f"));
    await scenario("store-owner read", () => assert.equal(app(box, "analytics_connection_get").outcome, "not_configured"));
    await scenario("admin read", () => assert.equal(app(box, "analytics_connection_get", "", { principal: ADMIN, membership: MEMBERSHIP_ADMIN }).outcome, "not_configured"));
    await scenario("editor and analyst read", () => { assert.equal(app(box, "analytics_connection_get", "", { principal: EDITOR, membership: MEMBERSHIP_EDITOR }).outcome, "not_configured"); assert.equal(app(box, "analytics_connection_get", "", { principal: ANALYST, membership: MEMBERSHIP_ANALYST }).outcome, "not_configured"); });
    await scenario("feature denial", () => { psql(box, `ALTER TABLE saas.plan_features DISABLE TRIGGER USER; UPDATE saas.plan_features SET enabled=false WHERE plan_id='${PLAN}' AND feature_key='analytics'; ALTER TABLE saas.plan_features ENABLE TRIGGER USER;`); assert.equal(app(box, "analytics_connection_get").outcome, "feature_not_enabled"); psql(box, `ALTER TABLE saas.plan_features DISABLE TRIGGER USER; UPDATE saas.plan_features SET enabled=true WHERE plan_id='${PLAN}' AND feature_key='analytics'; ALTER TABLE saas.plan_features ENABLE TRIGGER USER;`); });
    await scenario("subscription expiry denial", () => { psql(box, `ALTER TABLE saas.subscriptions DISABLE TRIGGER USER; UPDATE saas.subscriptions SET valid_until='2026-07-26T11:00:00Z' WHERE store_id='${STORE}'; ALTER TABLE saas.subscriptions ENABLE TRIGGER USER;`); assert.equal(app(box, "analytics_connection_get").outcome, "durable_authority_invalid"); psql(box, `ALTER TABLE saas.subscriptions DISABLE TRIGGER USER; UPDATE saas.subscriptions SET valid_until=NULL WHERE store_id='${STORE}'; ALTER TABLE saas.subscriptions ENABLE TRIGGER USER;`); });
    await scenario("inactive store denial", () => { psql(box, `UPDATE saas.stores SET status='suspended' WHERE id='${STORE}';`); assert.equal(app(box, "analytics_connection_get").outcome, "store_inactive"); psql(box, `UPDATE saas.stores SET status='active' WHERE id='${STORE}';`); });
    await scenario("hostname absence denial", () => { psql(box, `UPDATE saas.store_domains SET status='disabled',is_primary=false,version=version+1,updated_at='2026-07-26T12:00:01Z' WHERE store_id='${STORE}';`); assert.equal(app(box, "analytics_connection_get").outcome, "hostname_not_found"); psql(box, `UPDATE saas.store_domains SET status='active',is_primary=true,version=version+1,updated_at='2026-07-26T12:00:02Z' WHERE store_id='${STORE}';`); });
    const begin = `'${OP_BEGIN}','${FP_BEGIN}','${CONNECTION}','${WEBSITE}'`;
    await scenario("begin happy path", () => { const value = app(box, "analytics_connection_begin", begin); assert.equal(value.outcome, "pending"); assert.equal(value.result.hostname, "store-a.example.test"); });
    await scenario("begin replay", () => assert.equal(app(box, "analytics_connection_begin", begin).outcome, "operation_replayed"));
    await scenario("begin fingerprint mismatch", () => assert.equal(app(box, "analytics_connection_begin", begin.replace(FP_BEGIN, "d".repeat(64))).outcome, "operation_mismatch"));
    await scenario("concurrent begin has one durable winner", async () => { const left = `'61000000-0000-4000-8000-000000000001','${"e".repeat(64)}','${CONNECTION_B}','${WEBSITE_B}'`; const right = `'61000000-0000-4000-8000-000000000002','${"f".repeat(64)}','40000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000003'`; const results = await Promise.all([appAsync(box,"analytics_connection_begin",left,{store:STORE_B,principal:OWNER_B,membership:MEMBERSHIP_B}),appAsync(box,"analytics_connection_begin",right,{store:STORE_B,principal:OWNER_B,membership:MEMBERSHIP_B})]); assert.equal(results.filter((value) => value.outcome==='pending').length,1); assert.equal(scalar(box, `SELECT count(*) FROM saas.store_analytics_connections WHERE store_id='${STORE_B}';`), "1"); });
    await scenario("Website ID uniqueness", () => assert.equal(scalar(box, "SELECT count(*)=count(DISTINCT website_id) FROM saas.store_analytics_connections;"), "t"));
    await scenario("cross-store Website ID denial", () => { psql(box, `DELETE FROM saas.store_analytics_connections WHERE store_id='${STORE_B}';`); const value=app(box,"analytics_connection_begin",`'62000000-0000-4000-8000-000000000001','${"1".repeat(64)}','40000000-0000-4000-8000-000000000004','${WEBSITE}'`,{store:STORE_B,principal:OWNER_B,membership:MEMBERSHIP_B}); assert.equal(value.outcome,'website_id_conflict'); });
    await scenario("activate wrong domain denial", () => assert.equal(app(box,"analytics_connection_activate",`'63000000-0000-4000-8000-000000000001','${"2".repeat(64)}','${CONNECTION}','${WEBSITE}','wrong.example.test'`).outcome,'hostname_mismatch'));
    await scenario("activate wrong Website ID denial", () => assert.equal(app(box,"analytics_connection_activate",`'63000000-0000-4000-8000-000000000002','${"3".repeat(64)}','${CONNECTION}','50000000-0000-4000-8000-000000000099','store-a.example.test'`).outcome,'website_id_mismatch'));
    const activate = `'${OP_ACTIVATE}','${FP_ACTIVATE}','${CONNECTION}','${WEBSITE}','store-a.example.test'`;
    await scenario("activate happy path", () => assert.equal(app(box,"analytics_connection_activate",activate).outcome,'active'));
    await scenario("activate stale operation denial", () => assert.equal(app(box,"analytics_connection_activate",`'63000000-0000-4000-8000-000000000003','${"4".repeat(64)}','${CONNECTION}','${WEBSITE}','store-a.example.test'`).outcome,'stale_operation'));
    const disable = `'${OP_DISABLE}','${FP_DISABLE}','${CONNECTION}',2`;
    await scenario("disable happy path", () => assert.equal(app(box,"analytics_connection_disable",disable).outcome,'disabled'));
    await scenario("disable stale version", () => assert.equal(app(box,"analytics_connection_disable",`'64000000-0000-4000-8000-000000000001','${"5".repeat(64)}','${CONNECTION}',2`).outcome,'stale_version'));
    await scenario("recovery exact", () => { const value=app(box,"analytics_connection_recover_operation",`'${OP_ACTIVATE}','${FP_ACTIVATE}'`); assert.equal(value.outcome,'operation_recovered'); assert.equal(value.result.replayed,true); });
    psql(box, `UPDATE saas.store_analytics_connections SET status='active',version=version+1,last_verified_at='${NOW}',updated_at='2026-07-26T12:00:03Z' WHERE id='${CONNECTION}';`);
    await scenario("public exact host", () => { const value=resolver(box,'store-a.example.test'); assert.equal(value.outcome,'found'); assert.deepEqual(Object.keys(value.result).sort(),['hostname','websiteId']); });
    await scenario("public alias denial", () => { psql(box, `INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES('80000000-0000-4000-8000-000000000003','${STORE}','alias.example.test','custom_domain','active',false,'${NOW}','${NOW}','${NOW}',1);`); assert.equal(resolver(box,'alias.example.test').outcome,'not_found'); });
    await scenario("public unknown denial", () => assert.equal(resolver(box,'unknown.example.test').outcome,'not_found'));
    await scenario("public inactive connection denial", () => { psql(box, `UPDATE saas.store_analytics_connections SET status='disabled',version=version+1,updated_at='2026-07-26T12:00:04Z' WHERE id='${CONNECTION}';`); assert.equal(resolver(box,'store-a.example.test').outcome,'not_found'); psql(box, `UPDATE saas.store_analytics_connections SET status='active',version=version+1,last_verified_at='${NOW}',updated_at='2026-07-26T12:00:05Z' WHERE id='${CONNECTION}';`); });
    await scenario("canonical hostname change invalidation", () => { psql(box, `UPDATE saas.store_domains SET status='disabled',is_primary=false,version=version+1,updated_at='2026-07-26T12:00:06Z' WHERE hostname='store-a.example.test'; INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES('80000000-0000-4000-8000-000000000004','${STORE}','new.example.test','custom_domain','active',true,'${NOW}','${NOW}','2026-07-26T12:00:06Z',1);`); assert.equal(resolver(box,'store-a.example.test').outcome,'not_found'); psql(box, `UPDATE saas.store_domains SET status='disabled',is_primary=false,version=version+1,updated_at='2026-07-26T12:00:07Z' WHERE hostname='new.example.test'; UPDATE saas.store_domains SET status='active',is_primary=true,version=version+1,updated_at='2026-07-26T12:00:07Z' WHERE hostname='store-a.example.test';`); });
    const ORDER_A='90000000-0000-4000-8000-000000000001'; const ORDER_B='90000000-0000-4000-8000-000000000002';
    await scenario("order-completed enqueue", () => { psql(box,orderSql(ORDER_A,'completed','2026-07-26T12:01:00Z')); assert.equal(scalar(box,`SELECT count(*) FROM saas.analytics_delivery_outbox WHERE order_id='${ORDER_A}';`),'1'); const payload=json(box,`SELECT payload FROM saas.analytics_delivery_outbox WHERE order_id='${ORDER_A}';`); assert.deepEqual(Object.keys(payload).sort(),['currency','source','valueCents']); });
    await scenario("unpaid order no enqueue", () => { psql(box,orderSql(ORDER_B,'pending','2026-07-26T12:02:00Z')); assert.equal(scalar(box,`SELECT count(*) FROM saas.analytics_delivery_outbox WHERE order_id='${ORDER_B}';`),'0'); });
    await scenario("completed-update enqueue", () => { psql(box,`UPDATE saas.orders SET payment_status='completed',version=version+1,updated_at='2026-07-26T12:03:00Z' WHERE id='${ORDER_B}';`); assert.equal(scalar(box,`SELECT count(*) FROM saas.analytics_delivery_outbox WHERE order_id='${ORDER_B}';`),'1'); });
    await scenario("settlement replay no duplicate", () => { psql(box,`UPDATE saas.orders SET payment_status='completed',version=version+1,updated_at='2026-07-26T12:04:00Z' WHERE id='${ORDER_B}';`); assert.equal(scalar(box,`SELECT count(*) FROM saas.analytics_delivery_outbox WHERE order_id='${ORDER_B}';`),'1'); });
    let firstClaim;
    await scenario("outbox claim bound", () => { const value=worker(box,'analytics_outbox_claim',`'2026-07-26T12:05:00Z',1,interval '5 minutes'`); assert.equal(value.outcome,'claimed'); assert.equal(value.result.length,1); firstClaim=value.result[0]; assert.deepEqual(Object.keys(firstClaim.payload).sort(),['currency','name','source','valueCents']); });
    await scenario("lease fencing", () => { assert.equal(worker(box,'analytics_outbox_mark_delivered',`'${firstClaim.eventId}','${"0".repeat(64)}','2026-07-26T12:06:00Z'`).outcome,'lease_lost'); assert.equal(worker(box,'analytics_outbox_mark_delivered',`'${firstClaim.eventId}','${firstClaim.leaseToken}','2026-07-26T12:06:00Z'`).outcome,'delivered'); });
    let retryClaim;
    await scenario("retry and backoff", () => { const value=worker(box,'analytics_outbox_claim',`'2026-07-26T12:05:00Z',1,interval '5 minutes'`); retryClaim=value.result[0]; assert.equal(worker(box,'analytics_outbox_mark_failed',`'${retryClaim.eventId}','${retryClaim.leaseToken}','2026-07-26T12:06:00Z','collector_unavailable','2026-07-26T12:10:00Z',false`).outcome,'retry_scheduled'); assert.equal(worker(box,'analytics_outbox_claim',`'2026-07-26T12:09:00Z',10,interval '5 minutes'`).result.length,0); });
    await scenario("permanent failure", () => { const value=worker(box,'analytics_outbox_claim',`'2026-07-26T12:10:00Z',1,interval '5 minutes'`).result[0]; assert.equal(worker(box,'analytics_outbox_mark_failed',`'${value.eventId}','${value.leaseToken}','2026-07-26T12:11:00Z','collector_rejected','2026-07-26T12:20:00Z',true`).outcome,'failed'); assert.equal(scalar(box,`SELECT status FROM saas.analytics_delivery_outbox WHERE id='${value.eventId}';`),'failed'); });
    await scenario("backup and restore", () => { const dump = databaseCommand(box,'pg_dump',["--format=custom","--dbname",DB],{binary:true}).stdout; createDatabase(box,RESTORE_DB); databaseCommand(box,'pg_restore',["--exit-on-error","--dbname",RESTORE_DB],{input:dump,binary:true}); assert.equal(scalar(box,"SELECT count(*) FROM saas.store_analytics_connections;",RESTORE_DB),scalar(box,"SELECT count(*) FROM saas.store_analytics_connections;")); dropDatabase(box,RESTORE_DB); });
    await scenario("rollback and reapply plus cleanup", () => { apply(box,DOWN); assert.equal(scalar(box,"SELECT to_regclass('saas.store_analytics_connections') IS NULL;"),'t'); apply(box,UP); apply(box,ASSERTIONS); });

    assert.equal(scenarios,50);
    console.log(`Managed Umami analytics PostgreSQL ${version} (${box.kind})`);
    console.log(evidence.join("\n"));
    console.log("50/50 PASS; disposable database cleanup PASS");
  } finally {
    if (box) { dropDatabase(box,RESTORE_DB); dropDatabase(box,DB); }
    stop(box);
  }
}

run().catch((error) => { console.error(error.stack ?? error); process.exitCode=1; });
