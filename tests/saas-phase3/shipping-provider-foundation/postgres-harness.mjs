import assert from "node:assert/strict";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "shipping_provider_foundation";
const RESTORED = "shipping_provider_foundation_restored";
const ROLLBACK = "shipping_provider_foundation_rollback";
const NOW = "2026-08-06T12:00:00.000Z";
const PLAN = "00000000-0000-4000-8000-000000000101";
const STORE_A = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const OWNER_A = "20000000-0000-4000-8000-000000000001";
const OWNER_B = "20000000-0000-4000-8000-000000000002";
const ANALYST = "20000000-0000-4000-8000-000000000003";
const MEMBER_A = "30000000-0000-4000-8000-000000000001";
const MEMBER_B = "30000000-0000-4000-8000-000000000002";
const MEMBER_ANALYST = "30000000-0000-4000-8000-000000000003";
const PROFILE_A = "40000000-0000-4000-8000-000000000001";
const JOB_A = "50000000-0000-4000-8000-000000000101";
const OP_A = "60000000-0000-4000-8000-000000000001";
const FP_A = "a".repeat(64);
const PROFILE_B1 = "40000000-0000-4000-8000-000000000002";
const PROFILE_B2 = "40000000-0000-4000-8000-000000000003";
const JOB_B1 = "50000000-0000-4000-8000-000000000201";
const JOB_B2 = "50000000-0000-4000-8000-000000000202";
const OP_B1 = "60000000-0000-4000-8000-000000000002";
const OP_B2 = "60000000-0000-4000-8000-000000000003";
const FP_B1 = "b".repeat(64);
const FP_B2 = "c".repeat(64);
const BASE_FUNCTION = `
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
CREATE FUNCTION saas.merchant_action_authority_error(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $$ SELECT NULL::text $$;
REVOKE ALL ON FUNCTION saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text) FROM PUBLIC;
COMMIT;`;

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch {}
  }
  throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
}

function command(program, args, { input, allowFailure = false } = {}) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    encoding: "utf8",
    input,
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  }
  return result;
}

function commandAsync(program, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd: ROOT,
      env: { ...process.env, LC_ALL: "C", LANG: "C" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (value) => { stdout += value; });
    child.stderr.on("data", (value) => { stderr += value; });
    child.once("error", reject);
    child.once("close", (status) => status === 0
      ? resolve({ stdout, stderr })
      : reject(new Error(`psql failed\n${stderr}`)));
    child.stdin.end(input);
  });
}

function start() {
  const names = ["initdb", "pg_ctl", "createdb", "psql", "pg_dump", "pg_restore"];
  const executables = Object.fromEntries(names.map((name) => [name, executable(name)]));
  const root = mkdtempSync("/tmp/celebix-shipping-provider-");
  const data = path.join(root, "data"), socket = path.join(root, "socket");
  const port = 20000 + Math.floor(Math.random() * 15000);
  mkdirSync(socket, { mode: 0o700 });
  command(executables.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(executables.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { executables, root, data, socket, port };
}

function stop(box) {
  if (!box) return;
  command(box.executables.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], { allowFailure: true });
  rmSync(box.root, { recursive: true, force: true });
}

function dbArgs(box, database = DB) {
  return ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database];
}

function psql(box, input, database = DB, allowFailure = false) {
  return command(box.executables.psql, dbArgs(box, database), { input, allowFailure });
}

function createDatabase(box, name) {
  command(box.executables.createdb, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", name]);
}

function apply(box, file, database = DB) {
  psql(box, readFileSync(path.join(SQL, file), "utf8"), database);
}

function installFoundation(box, database, { roles = false } = {}) {
  if (roles) apply(box, "202607110001_roles.up.sql", database);
  else psql(box, `GRANT CREATE ON DATABASE ${database} TO celebix_saas_owner;`, database);
  apply(box, "202607110002_foundation.up.sql", database);
  if (roles) apply(box, "202607110007_identity_roles.up.sql", database);
  psql(box, BASE_FUNCTION, database);
  apply(box, "202608060093_shipping_provider_foundation.up.sql", database);
  apply(box, "202608060093_shipping_provider_foundation_assertions.sql", database);
}

function quoteJson(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function envelope(seed = "opaque-token") {
  return {
    algorithm: "A256GCM",
    ciphertext: Buffer.from(seed, "utf8").toString("base64url"),
    iv: "AQEBAQEBAQEBAQEB",
    keyId: "shipping.current",
    tag: "AgICAgICAgICAgICAgICAg",
    version: 1,
  };
}

function authority(store = STORE_A, principal = OWNER_A, membership = MEMBER_A) {
  return `'${store}'::uuid,'${principal}'::uuid,'${membership}'::uuid,'${PLAN}'::uuid,'shipping_fixture',1,'${NOW}'::timestamptz`;
}

function appSql(name, extra, actor = {}) {
  const auth = authority(actor.store, actor.principal, actor.membership);
  return `SET ROLE celebix_saas_app;
SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
FROM saas.${name}(${auth}${extra ? `,${extra}` : ""});`;
}

function app(box, name, extra = "", actor = {}, database = DB) {
  return JSON.parse(psql(box, appSql(name, extra, actor), database).stdout.trim());
}

async function appAsync(box, name, extra, actor = {}) {
  const result = await commandAsync(box.executables.psql, dbArgs(box), appSql(name, extra, actor));
  return JSON.parse(result.stdout.trim());
}

function workflow(box, name, extra, database = DB) {
  const output = psql(box, `SET ROLE celebix_saas_workflow;
SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
FROM saas.${name}(${extra});`, database).stdout.trim();
  return JSON.parse(output);
}

function saveArgs(operationId, fingerprint, profileId, jobId, expectedVersion = 0, seed = "opaque-token") {
  const sealed = envelope(seed);
  return `'${operationId}','${fingerprint}','${profileId}','${jobId}','basit_kargo',${quoteJson(sealed)},'${"d".repeat(64)}','${sealed.keyId}',${expectedVersion}`;
}

function resources(prefix) {
  const start = prefix === "a" ? "70000000" : "71000000";
  return [
    { id: `${start}-0000-4000-8000-000000000001`, kind: "brand", providerResourceId: `${prefix}_brand`, label: `${prefix.toUpperCase()} Marka`, active: true, digest: "1".repeat(64) },
    { id: `${start}-0000-4000-8000-000000000002`, kind: "address", providerResourceId: `${prefix}_address`, label: `${prefix.toUpperCase()} Depo`, active: true, digest: "2".repeat(64) },
    { id: `${start}-0000-4000-8000-000000000003`, kind: "handler", providerResourceId: `${prefix}_handler`, label: `${prefix.toUpperCase()} Taşıyıcı`, active: true, digest: "3".repeat(64) },
  ];
}

function seed(box) {
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
('${OWNER_A}','https://identity.test','owner-a','owner-a@test.invalid',true,'2026-01-01','2026-01-01'),
('${OWNER_B}','https://identity.test','owner-b','owner-b@test.invalid',true,'2026-01-01','2026-01-01'),
('${ANALYST}','https://identity.test','analyst','analyst@test.invalid',true,'2026-01-01','2026-01-01');
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
('${STORE_A}','Shipping A','shipping-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
('${STORE_B}','Shipping B','shipping-b','active','tr','TRY','default','2026-01-01','2026-01-01');
INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
('${MEMBER_A}','${OWNER_A}','${STORE_A}','store_owner','active','2026-01-01','2026-01-01'),
('${MEMBER_B}','${OWNER_B}','${STORE_B}','store_owner','active','2026-01-01','2026-01-01'),
('${MEMBER_ANALYST}','${ANALYST}','${STORE_A}','analyst','active','2026-01-01','2026-01-01');
INSERT INTO saas.plans(id,plan_code,version,status,valid_from,created_at,updated_at)
VALUES('${PLAN}','shipping_fixture',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.plan_features(plan_id,feature_key,feature_ordinal,enabled)
VALUES('${PLAN}','integrations',1,true);
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
('31000000-0000-4000-8000-000000000001','${STORE_A}','${PLAN}','shipping_fixture',1,'active','2026-01-01','2026-01-01','2026-01-01'),
('31000000-0000-4000-8000-000000000002','${STORE_B}','${PLAN}','shipping_fixture',1,'active','2026-01-01','2026-01-01','2026-01-01');
COMMIT;`);
}

function completeValidation(box, expectedJobId, selectedResources, leaseOrdinal) {
  const leaseId = `80000000-0000-4000-8000-${String(leaseOrdinal).padStart(12, "0")}`;
  const claimed = workflow(box, "shipping_validation_claim", `'worker-${leaseOrdinal}','${NOW}',300,'${leaseId}'`);
  assert.equal(claimed.outcome, "claimed");
  assert.equal(claimed.result.jobId, expectedJobId);
  const opened = workflow(box, "shipping_validation_open_credential",
    `'${expectedJobId}','worker-${leaseOrdinal}','${leaseId}',${claimed.result.fenceToken},'${NOW}'`);
  assert.equal(opened.outcome, "opened");
  assert.equal(opened.result.credentialVersion, 1);
  const stale = workflow(box, "shipping_validation_open_credential",
    `'${expectedJobId}','worker-${leaseOrdinal}','${leaseId}',${claimed.result.fenceToken + 1},'${NOW}'`);
  assert.equal(stale.outcome, "lease_invalid");
  const completed = workflow(box, "shipping_validation_complete",
    `'${expectedJobId}','worker-${leaseOrdinal}','${leaseId}',${claimed.result.fenceToken},'${NOW}','${"e".repeat(64)}',${quoteJson(selectedResources)}`);
  assert.equal(completed.outcome, "completed");
}

let box;
try {
  box = start();
  createDatabase(box, DB);
  installFoundation(box, DB, { roles: true });
  seed(box);

  const savedA = app(box, "shipping_connection_save", saveArgs(OP_A, FP_A, PROFILE_A, JOB_A));
  assert.equal(savedA.outcome, "saved");
  assert.equal(savedA.result.providerCode, "basit_kargo");
  assert.equal(savedA.result.credentialEnvelope, undefined);
  const replayA = app(box, "shipping_connection_save", saveArgs(OP_A, FP_A, PROFILE_A, JOB_A));
  assert.equal(replayA.outcome, "operation_replayed");
  const mismatch = app(box, "shipping_connection_save", saveArgs(OP_A, "f".repeat(64), PROFILE_B1, JOB_B1), {
    store: STORE_B, principal: OWNER_B, membership: MEMBER_B,
  });
  assert.equal(mismatch.outcome, "operation_mismatch");

  const raceActor = { store: STORE_B, principal: OWNER_B, membership: MEMBER_B };
  const raced = await Promise.all([
    appAsync(box, "shipping_connection_save", saveArgs(OP_B1, FP_B1, PROFILE_B1, JOB_B1), raceActor),
    appAsync(box, "shipping_connection_save", saveArgs(OP_B2, FP_B2, PROFILE_B2, JOB_B2), raceActor),
  ]);
  assert.deepEqual(raced.map(({ outcome }) => outcome).sort(), ["saved", "version_conflict"]);
  const winner = raced[0].outcome === "saved"
    ? { profile: PROFILE_B1, job: JOB_B1 }
    : { profile: PROFILE_B2, job: JOB_B2 };
  const currentCount = Number(psql(box, `SET ROLE celebix_saas_owner; SELECT count(*) FROM saas.shipping_provider_profiles WHERE store_id='${STORE_B}' AND status<>'revoked';`).stdout.trim());
  assert.equal(currentCount, 1);

  const analystActor = { store: STORE_A, principal: ANALYST, membership: MEMBER_ANALYST };
  assert.equal(app(box, "shipping_connection_current", "'basit_kargo'", analystActor).outcome, "found");
  assert.equal(app(box, "shipping_connection_save", saveArgs("60000000-0000-4000-8000-000000000099", "9".repeat(64), PROFILE_A, "50000000-0000-4000-8000-000000000099"), analystActor).outcome, "membership_denied");
  const privileges = psql(box, `SELECT pg_catalog.has_table_privilege('celebix_saas_app','saas.shipping_provider_profiles','SELECT,INSERT,UPDATE,DELETE');`).stdout.trim();
  assert.equal(privileges, "f");

  const resourcesA = resources("a"), resourcesB = resources("b");
  completeValidation(box, JOB_A, resourcesA, 1);
  completeValidation(box, winner.job, resourcesB, 2);
  const setupA = app(box, "shipping_connection_setup", "'basit_kargo'");
  assert.equal(setupA.outcome, "found");
  assert.equal(setupA.result.profileId, PROFILE_A);
  assert.equal(setupA.result.resources.length, 3);
  const crossStore = app(box, "shipping_connection_select_resources",
    `'60000000-0000-4000-8000-000000000010','${"4".repeat(64)}','${PROFILE_A}','${resourcesB[0].id}','${resourcesB[1].id}',false,2`);
  assert.equal(crossStore.outcome, "resource_invalid");
  const selected = app(box, "shipping_connection_select_resources",
    `'60000000-0000-4000-8000-000000000011','${"5".repeat(64)}','${PROFILE_A}','${resourcesA[0].id}','${resourcesA[1].id}',true,2`);
  assert.equal(selected.outcome, "selected");
  assert.equal(selected.result.status, "active");
  assert.equal(selected.result.codDeliveredMarksPaid, true);

  const rotated = app(box, "shipping_connection_save",
    saveArgs("60000000-0000-4000-8000-000000000012", "6".repeat(64), PROFILE_A, "50000000-0000-4000-8000-000000000102", 3, "rotated-token"));
  assert.equal(rotated.outcome, "saved");
  assert.equal(rotated.result.status, "pending");
  assert.equal(rotated.result.credentialVersion, 2);
  const oldResourceCount = Number(psql(box, `SET ROLE celebix_saas_owner; SELECT count(*) FROM saas.shipping_provider_resources WHERE profile_id='${PROFILE_A}';`).stdout.trim());
  assert.equal(oldResourceCount, 0);
  const exactLease = "80000000-0000-4000-8000-000000000099";
  const exactClaim = workflow(box, "shipping_validation_claim_job",
    `'50000000-0000-4000-8000-000000000102','worker-99','${NOW}',60,'${exactLease}'`);
  assert.equal(exactClaim.outcome, "claimed");
  assert.equal(exactClaim.result.jobId, "50000000-0000-4000-8000-000000000102");

  const revoked = app(box, "shipping_connection_revoke",
    `'60000000-0000-4000-8000-000000000013','${"7".repeat(64)}','${PROFILE_A}',4`);
  assert.equal(revoked.outcome, "revoked");
  assert.equal(revoked.result.status, "revoked");
  assert.equal(app(box, "shipping_connection_revoke",
    `'60000000-0000-4000-8000-000000000014','${"8".repeat(64)}','${PROFILE_A}',5`).outcome, "already_revoked");
  assert.equal(app(box, "shipping_connection_current", "'basit_kargo'").outcome, "not_found");

  const blockedDown = psql(box, readFileSync(path.join(SQL, "202608060093_shipping_provider_foundation.down.sql"), "utf8"), DB, true);
  assert.notEqual(blockedDown.status, 0);
  assert.match(blockedDown.stderr, /SHIPPING_PROVIDER_FOUNDATION_DOWN_BLOCKED/u);

  const dump = path.join(box.root, "shipping.dump");
  command(box.executables.pg_dump, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-Fc", "-f", dump, DB]);
  createDatabase(box, RESTORED);
  command(box.executables.pg_restore, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-d", RESTORED, dump]);
  assert.equal(psql(box, "SELECT saas.shipping_provider_preflight();", RESTORED).stdout.trim(), "t");
  assert.equal(Number(psql(box, "SET ROLE celebix_saas_owner; SELECT count(*) FROM saas.shipping_provider_profiles;", RESTORED).stdout.trim()), 2);

  createDatabase(box, ROLLBACK);
  installFoundation(box, ROLLBACK);
  apply(box, "202608060093_shipping_provider_foundation.down.sql", ROLLBACK);
  assert.equal(psql(box, "SELECT pg_catalog.to_regclass('saas.shipping_provider_profiles') IS NULL;", ROLLBACK).stdout.trim(), "t");

  console.log("shipping provider PostgreSQL 16 harness passed");
} finally {
  stop(box);
}
