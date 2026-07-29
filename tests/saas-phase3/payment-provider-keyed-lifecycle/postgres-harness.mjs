import assert from "node:assert/strict";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "payment_provider_keyed_lifecycle";
const ROLLBACK_DB = "payment_provider_keyed_lifecycle_rollback";
const MARK_REPLAY_DB = "payment_provider_keyed_lifecycle_mark_replay";
const UNAVAILABLE_DB = "payment_provider_keyed_lifecycle_unavailable";
const REVOKE_ISOLATION_DB = "payment_provider_keyed_lifecycle_revoke_isolation";
const UP = "202607270056_payment_provider_keyed_lifecycle.up.sql";
const DOWN = "202607270056_payment_provider_keyed_lifecycle.down.sql";
const ASSERTIONS = "202607270056_payment_provider_keyed_lifecycle_assertions.sql";
const FIXTURE = path.join(import.meta.dirname, "fixture.sql");
const prior = JSON.parse(readFileSync(path.join(SQL, "phase3n-hosted-callback-lifecycle-manifest.json"), "utf8"));
const STORE = "10000000-0000-4000-8000-000000000056";
const OTHER_STORE = "10000000-0000-4000-8000-000000000057";
const OWNER = "20000000-0000-4000-8000-000000000056";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000056";
const TEST_PROFILE = "40000000-0000-4000-8000-000000000056";
const LIVE_PROFILE = "40000000-0000-4000-8000-000000000057";
const PAYTR_PROFILE = "40000000-0000-4000-8000-000000000058";
const METHOD = "50000000-0000-4000-8000-000000000056";
const PAYTR_METHOD = "50000000-0000-4000-8000-000000000057";
const PLAN = "00000000-0000-4000-8000-000000000001";
const NOW = "2026-07-27T12:00:00.000Z";
const CLAIMED_AT = "2026-07-27T12:01:00.000Z";
const EXPIRES = "2026-07-27T12:10:00.000Z";
const MARKED_AT = "2026-07-27T12:02:00.000Z";
const LEASE = "60000000-0000-4000-8000-000000000056";
const FP = "a".repeat(64);
const OTHER_FP = "b".repeat(64);
const EVIDENCE = `sha256:${"c".repeat(64)}`;
const TOTAL = 19;
let completed = 0;

function bin(name) {
  const candidate = path.join(PG, name);
  accessSync(candidate, constants.X_OK);
  return candidate;
}

function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    input,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}

function start() {
  const root = mkdtempSync("/tmp/celebix-provider-keyed-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 25_000 + Math.floor(Math.random() * 8_000);
  mkdirSync(socket, { mode: 0o700 });
  command(bin("initdb"), ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(bin("pg_ctl"), ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { root, data, socket, port };
}

function stop(box) {
  if (!box) return;
  command(bin("pg_ctl"), ["-D", box.data, "-m", "fast", "stop"], "", true);
  rmSync(box.root, { recursive: true, force: true });
}

function sql(box, input, database = DB, allowFailure = false) {
  return command(bin("psql"), [
    "-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], input, allowFailure);
}

function startSql(box, input, database) {
  const child = spawn(bin("psql"), [
    "-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], {
    cwd: ROOT,
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const completed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, get stdout() { return stdout; }, get stderr() { return stderr; } }));
  });
  child.stdin.write(input);
  return { child, completed, stdout: () => stdout, stderr: () => stderr };
}

async function waitUntil(check, label) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timeout:${label}`);
}

function activityWaiting(box, database, applicationName) {
  return sql(box, `SELECT EXISTS(
    SELECT 1 FROM pg_catalog.pg_stat_activity
    WHERE datname='${database}' AND application_name='${applicationName}'
      AND wait_event_type='Lock'
  );`, "postgres").stdout.trim() === "t";
}

function raceVerificationSql(kind, applicationName) {
  const prefix = `BEGIN;
SET LOCAL application_name='${applicationName}';
SET LOCAL deadlock_timeout='2s';
SET LOCAL lock_timeout='7s';`;
  if (kind === "save") return `${prefix}
SET LOCAL ROLE celebix_saas_app;
SELECT outcome FROM saas.merchant_provider_profile_save_verification(
  ${authority(STORE, "2026-07-27T12:03:00.000Z")},'75000000-0000-4000-8000-000000000056','${FP}','${TEST_PROFILE}',
  'iyzico_iframe','payment_processing','{"environment":"test"}'::jsonb,'iyzico merchant',
  '${envelope()}'::jsonb,'${"3".repeat(64)}','provider.current',1,'test',1,3
);
COMMIT;`;
  if (kind === "mark") return `${prefix}
SET LOCAL ROLE celebix_saas_workflow;
SELECT outcome FROM saas.merchant_provider_profile_mark_verification(
  '${TEST_PROFILE}','iyzico_iframe','payment_processing','test',1,'worker.race',
  '${MARKED_AT}','65000000-0000-4000-8000-000000000056',1,3,'validated','race_probe'
);
COMMIT;`;
  return `${prefix}
SET LOCAL ROLE celebix_saas_owner;
SELECT saas.merchant_provider_profile_bind_execution_authority(
  '${TEST_PROFILE}','iyzico_iframe','payment_processing','test',1,
  '${EVIDENCE}','${MARKED_AT}',3
);
COMMIT;`;
}

function raceMethodSaveSql(applicationName, operation) {
  return `BEGIN;
SET LOCAL application_name='${applicationName}';
SET LOCAL deadlock_timeout='2s';
SET LOCAL lock_timeout='7s';
SET LOCAL ROLE celebix_saas_app;
SELECT outcome FROM saas.payment_method_save(
  ${authority()},'${operation}','${OTHER_FP}','${METHOD}',1,
  'provider','${TEST_PROFILE}','iyzico_iframe','Iyzico','{"environment":"test"}'::jsonb
);
COMMIT;`;
}

async function proveNoReverseLockDeadlock(box, database, kind, suffix) {
  const barrierName = `v056_${kind}_barrier`;
  const verificationName = `v056_${kind}_verification`;
  const methodName = `v056_${kind}_method`;
  const barrier = startSql(box, `BEGIN;
SET LOCAL application_name='${barrierName}';
SELECT 1 FROM saas.merchant_provider_profiles WHERE id='${TEST_PROFILE}' FOR SHARE;
SELECT 'BARRIER_READY';\n`, database);
  await waitUntil(() => barrier.stdout().includes("BARRIER_READY"), `${kind}:barrier`);

  const verification = startSql(box, raceVerificationSql(kind, verificationName), database);
  verification.child.stdin.end();
  await waitUntil(() => activityWaiting(box, database, verificationName), `${kind}:verification-lock`);

  const method = startSql(
    box,
    raceMethodSaveSql(methodName, `76000000-0000-4000-8000-0000000000${suffix}`),
    database,
  );
  method.child.stdin.end();
  await waitUntil(() => activityWaiting(box, database, methodName), `${kind}:method-lock`);

  barrier.child.stdin.end("COMMIT;\n");
  const [barrierResult, verificationResult, methodResult] = await Promise.all([
    barrier.completed, verification.completed, method.completed,
  ]);
  assert.equal(barrierResult.status, 0, barrierResult.stderr);
  assert.equal(verificationResult.status, 0, verificationResult.stderr);
  assert.equal(methodResult.status, 0, methodResult.stderr);
  assert.doesNotMatch(`${verificationResult.stderr}\n${methodResult.stderr}`, /deadlock detected|lock timeout/i);
}

function concurrentMarkSql(applicationName) {
  return `BEGIN;
SET LOCAL application_name='${applicationName}';
SET LOCAL deadlock_timeout='2s';
SET LOCAL lock_timeout='7s';
SET LOCAL ROLE celebix_saas_workflow;
SELECT outcome FROM saas.merchant_provider_profile_mark_verification(
  '${TEST_PROFILE}','iyzico_iframe','payment_processing','test',1,'worker.iyzico',
  '${MARKED_AT}','${LEASE}',1,1,'validated','iyzico_test_ok'
);
COMMIT;`;
}

async function proveConcurrentExactMarkReplay(box) {
  const barrierName = "v056_mark_replay_barrier";
  const firstName = "v056_mark_replay_first";
  const secondName = "v056_mark_replay_second";
  const barrier = startSql(box, `BEGIN;
SET LOCAL application_name='${barrierName}';
SELECT 1 FROM saas.merchant_provider_profiles WHERE id='${TEST_PROFILE}' FOR SHARE;
SELECT 'BARRIER_READY';\n`, MARK_REPLAY_DB);
  await waitUntil(() => barrier.stdout().includes("BARRIER_READY"), "mark-replay:barrier");

  const first = startSql(box, concurrentMarkSql(firstName), MARK_REPLAY_DB);
  const second = startSql(box, concurrentMarkSql(secondName), MARK_REPLAY_DB);
  first.child.stdin.end();
  second.child.stdin.end();
  await waitUntil(() => activityWaiting(box, MARK_REPLAY_DB, firstName), "mark-replay:first-lock");
  await waitUntil(() => activityWaiting(box, MARK_REPLAY_DB, secondName), "mark-replay:second-lock");

  barrier.child.stdin.end("COMMIT;\n");
  const [barrierResult, firstResult, secondResult] = await Promise.all([
    barrier.completed, first.completed, second.completed,
  ]);
  assert.equal(barrierResult.status, 0, barrierResult.stderr);
  assert.equal(firstResult.status, 0, firstResult.stderr);
  assert.equal(secondResult.status, 0, secondResult.stderr);
  assert.doesNotMatch(`${firstResult.stderr}\n${secondResult.stderr}`, /deadlock detected|lock timeout/i);
  assert.deepEqual(
    [firstResult.stdout.trim(), secondResult.stdout.trim()].sort(),
    ["operation_replayed", "validated"],
  );
}

function apply(box, file, database = DB) {
  sql(box, readFileSync(path.join(SQL, file), "utf8"), database);
}

function pinned053Projection(box) {
  return sql(box, `SELECT procedure.oid::regprocedure::text||'|'||pg_catalog.md5(procedure.prosrc)||'|'||
  procedure.prosecdef::text||'|'||procedure.proconfig::text||'|'||procedure.proacl::text
FROM pg_catalog.pg_proc AS procedure
WHERE procedure.oid IN(
  'saas.payment_method_set_state(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)'::regprocedure,
  'saas.payment_attempt_begin(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)'::regprocedure
)
ORDER BY procedure.oid::regprocedure::text;`).stdout;
}

function assertProviderPreflightRejects(box, driftSql) {
  const drift = sql(box, `BEGIN;
${driftSql}
SET LOCAL ROLE celebix_saas_app;
DO $preflight$ BEGIN
  BEGIN
    PERFORM saas.payment_provider_keyed_lifecycle_preflight();
    RAISE EXCEPTION 'EXPECTED_PREFLIGHT_FAILURE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'PAYTR_IFRAME_ACTIVATION_PREFLIGHT_FUNCTION_INVALID: saas.payment_method_set_state(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)'
      AND SQLERRM<>'PAYTR_IFRAME_ACTIVATION_PREFLIGHT_FUNCTION_INVALID: saas.payment_attempt_begin(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)'
      AND SQLERRM<>'PAYTR_IFRAME_ACTIVATION_PREFLIGHT_FUNCTION_ACL_INVALID: saas.payment_attempt_begin(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)'
    THEN RAISE; END IF;
  END;
END $preflight$;
ROLLBACK;`, DB, true);
  assert.equal(drift.status, 0, drift.stderr);
}

function pass(name, run) {
  run();
  completed += 1;
  process.stdout.write(`PASS ${completed}/${TOTAL} ${name}\n`);
}

function envelope() {
  return JSON.stringify({
    algorithm: "A256GCM",
    ciphertext: "b3BhcXVl",
    iv: "AQEBAQEBAQEBAQEB",
    keyId: "provider.current",
    tag: "AgICAgICAgICAgICAgICAg",
    version: 1,
  });
}

function authority(store = STORE, now = NOW) {
  return `'${store}'::uuid,'${OWNER}'::uuid,'${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${now}'::timestamptz`;
}

function app(box, name, extra, store = STORE, database = DB, now = NOW) {
  const result = sql(box, `SET ROLE celebix_saas_app;
SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
FROM saas.${name}(${authority(store, now)},${extra});`, database);
  return JSON.parse(result.stdout.trim());
}

function saveVerification(box, {
  operation = "70000000-0000-4000-8000-000000000056",
  fingerprint = FP,
  profile = TEST_PROFILE,
  store = STORE,
  environment = "test",
  publicEnvironment = environment,
  adapterVersion = 1,
  expectedVersion = 0,
  now = NOW,
} = {}) {
  return app(box, "merchant_provider_profile_save_verification", [
    `'${operation}'::uuid`, `'${fingerprint}'`, `'${profile}'::uuid`, "'iyzico_iframe'",
    "'payment_processing'", `'${JSON.stringify({ environment: publicEnvironment })}'::jsonb`,
    "'iyzico merchant'", `'${envelope()}'::jsonb`, `'${"1".repeat(64)}'`, "'provider.current'",
    "1", `'${environment}'`, adapterVersion, expectedVersion,
  ].join(","), store, DB, now);
}

function claimVerification(box, {
  provider = "iyzico_iframe",
  environment = "test",
  adapterVersion = 1,
  lease = LEASE,
  database = DB,
} = {}) {
  const result = sql(box, `SET ROLE celebix_saas_workflow;
SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
FROM saas.merchant_provider_profile_claim_verification(
  'worker.iyzico','${provider}','payment_processing','${environment}',${adapterVersion},
  '${CLAIMED_AT}'::timestamptz,'${EXPIRES}'::timestamptz,'${lease}'::uuid
);`, database);
  return JSON.parse(result.stdout.trim());
}

function markVerification(box, {
  profile = TEST_PROFILE,
  provider = "iyzico_iframe",
  environment = "test",
  adapterVersion = 1,
  credentialVersion = 1,
  profileVersion = 1,
  outcome = "validated",
  outcomeCode = "iyzico_test_ok",
  database = DB,
} = {}) {
  const result = sql(box, `SET ROLE celebix_saas_workflow;
SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
FROM saas.merchant_provider_profile_mark_verification(
  '${profile}'::uuid,'${provider}','payment_processing','${environment}',${adapterVersion},
  'worker.iyzico','${MARKED_AT}'::timestamptz,'${LEASE}'::uuid,${credentialVersion},${profileVersion},
  '${outcome}','${outcomeCode}'
);`, database);
  return JSON.parse(result.stdout.trim());
}

function methodSave(box, operation, expectedVersion = 0) {
  return app(box, "payment_method_save", [
    `'${operation}'::uuid`, `'${OTHER_FP}'`, `'${METHOD}'::uuid`, expectedVersion, "'provider'",
    `'${TEST_PROFILE}'::uuid`, "'iyzico_iframe'", "'Iyzico'", "'{\"environment\":\"test\"}'::jsonb",
  ].join(","));
}

function seed(box) {
  sql(box, readFileSync(FIXTURE, "utf8"));
}

function savePaytr(box, database = DB) {
  return app(box, "merchant_provider_profile_save", [
    "'70000000-0000-4000-8000-000000000070'::uuid", `'${FP}'`, `'${PAYTR_PROFILE}'::uuid`,
    "'paytr_iframe'", "'payment_processing'", "'{\"environment\":\"test\"}'::jsonb", "'paytr merchant'",
    `'${envelope()}'::jsonb`, `'${"2".repeat(64)}'`, "'provider.current'", "1", "'test'", "1", `'${EVIDENCE}'`, "0",
  ].join(","), STORE, database);
}

async function main() {
  let box;
  try {
    box = start();
    sql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const { file } of prior.migrationChain) apply(box, file);
    const protected053Before = pinned053Projection(box);
    sql(box, `CREATE DATABASE ${ROLLBACK_DB} TEMPLATE ${DB};`, "postgres");

    apply(box, UP);
    apply(box, ASSERTIONS);
    apply(box, "202607270053_paytr_iframe_activation_authority_assertions.sql");
    seed(box);

    pass("PostgreSQL 16 metadata, Iyzico definition-only seed, ACL, and preflights pass", () => {
      assert.match(sql(box, "SHOW server_version;").stdout.trim(), /^16[.]/);
      assert.equal(pinned053Projection(box), protected053Before);
      assert.equal(sql(box, `SELECT allows_verification_without_execution_authority
FROM saas.merchant_provider_definitions WHERE provider_code='iyzico_iframe' AND capability='payment_processing';`).stdout.trim(), "t");
      assert.equal(sql(box, `SELECT count(*) FROM saas.merchant_provider_execution_authorities WHERE provider_code='iyzico_iframe';`).stdout.trim(), "0");
      assert.equal(sql(box, `SELECT count(*) FROM saas.merchant_provider_profiles WHERE provider_code='iyzico_iframe';`).stdout.trim(), "0");
      assert.equal(sql(box, `SELECT count(*) FROM saas.merchant_provider_profiles WHERE provider_code='iyzico_iframe' AND sealed_credentials IS NOT NULL;`).stdout.trim(), "0");
      assert.equal(sql(box, `SELECT count(*) FROM saas.checkout_provider_configs WHERE provider_key='iyzico_iframe';`).stdout.trim(), "0");
      assert.equal(sql(box, `SELECT count(*) FROM saas.merchant_provider_execution_authorities WHERE provider_code='iyzico_iframe' AND evidence_digest IS NOT NULL;`).stdout.trim(), "0");
      assert.equal(sql(box, `SELECT count(*) FROM saas.payment_methods WHERE provider_code='iyzico_iframe';`).stdout.trim(), "0");
      assert.equal(sql(box, `SELECT count(*) FROM saas.payment_attempts WHERE provider_code='iyzico_iframe';`).stdout.trim(), "0");
      assert.equal(sql(box, `SELECT count(*) FROM saas.payment_attempt_events event JOIN saas.payment_attempts attempt ON attempt.id=event.attempt_id WHERE attempt.provider_code='iyzico_iframe';`).stdout.trim(), "0");
      assert.equal(sql(box, `SELECT count(*) FROM saas.quick_order_links;`).stdout.trim(), "0");
      assert.equal(sql(box, "SET ROLE celebix_saas_app; SELECT saas.payment_provider_keyed_lifecycle_preflight();").stdout.trim(), "t");
      assert.equal(sql(box, "SET ROLE celebix_saas_workflow; SELECT saas.paytr_iframe_activation_preflight();").stdout.trim(), "t");
      assert.notEqual(sql(box, `SET ROLE celebix_saas_app; SELECT saas.merchant_provider_profile_bind_execution_authority('${TEST_PROFILE}','iyzico_iframe','payment_processing','test',1,'${EVIDENCE}','${NOW}',1);`, DB, true).status, 0);
    });

    pass("verification save persists identity with an all-null execution tuple and replays", () => {
      assert.equal(saveVerification(box).outcome, "saved");
      assert.equal(saveVerification(box).outcome, "operation_replayed");
      assert.equal(sql(box, `SELECT validation_environment||'|'||validation_adapter_version||'|'||
        (execution_environment IS NULL AND execution_adapter_version IS NULL AND execution_evidence_digest IS NULL)
FROM saas.merchant_provider_profiles WHERE id='${TEST_PROFILE}';`).stdout.trim(), "test|1|true");
      assert.equal(sql(box, `SELECT
  public_config='{"environment":"test"}'::jsonb
  AND (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(public_config))=1
  AND masked_account_reference='iyzico merchant'
  AND credential_digest='${"1".repeat(64)}'
  AND credential_key_id='provider.current'
  AND credential_schema_version=1
  AND (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(sealed_credentials) AS keys(key))
      =ARRAY['algorithm','ciphertext','iv','keyId','tag','version']::text[]
  AND sealed_credentials->>'algorithm'='A256GCM'
  AND sealed_credentials->>'keyId'='provider.current'
  AND sealed_credentials->>'version'='1'
FROM saas.merchant_provider_profiles WHERE id='${TEST_PROFILE}';`).stdout.trim(), "t");
    });

    pass("payment uniqueness is environment-keyed while duplicate and cross-tenant writes fail closed", () => {
      assert.equal(saveVerification(box, {
        operation: "70000000-0000-4000-8000-000000000057", profile: LIVE_PROFILE, environment: "live",
      }).outcome, "saved");
      assert.equal(saveVerification(box, {
        operation: "70000000-0000-4000-8000-000000000058", profile: "40000000-0000-4000-8000-000000000059",
      }).outcome, "invalid_transition");
      assert.equal(saveVerification(box, {
        operation: "70000000-0000-4000-8000-000000000059", profile: "40000000-0000-4000-8000-000000000060", store: OTHER_STORE,
      }).outcome, "membership_denied");
    });

    pass("public validation identity and all-null-or-all-exact constraints reject drift", () => {
      assert.equal(saveVerification(box, {
        operation: "70000000-0000-4000-8000-000000000060", profile: "40000000-0000-4000-8000-000000000061",
        environment: "test", publicEnvironment: "live",
      }).outcome, "invalid_input");
      const mixed = sql(box, `SET ROLE celebix_saas_owner;
UPDATE saas.merchant_provider_profiles SET execution_environment='test' WHERE id='${TEST_PROFILE}';`, DB, true);
      assert.notEqual(mixed.status, 0);
      assert.equal(sql(box, `SELECT execution_environment IS NULL FROM saas.merchant_provider_profiles WHERE id='${TEST_PROFILE}';`).stdout.trim(), "t");
    });

    pass("verification claim is keyed by exact identity and carries no checkout evidence", () => {
      assert.equal(claimVerification(box, { provider: "paytr_iframe", lease: "60000000-0000-4000-8000-000000000059" }).outcome, "empty");
      assert.equal(claimVerification(box, { adapterVersion: 2, lease: "60000000-0000-4000-8000-000000000057" }).outcome, "empty");
      const claimed = claimVerification(box);
      assert.equal(claimed.outcome, "claimed");
      assert.deepEqual(claimVerification(box), { outcome: "operation_replayed", result: claimed.result });
      assert.equal(claimVerification(box, { provider: "paytr_iframe" }).outcome, "invalid_input");
      assert.deepEqual(claimed.result.validationIdentity, { environment: "test", adapterVersion: 1 });
      assert.equal(Object.hasOwn(claimed.result, "executionAuthority"), false);
      assert.equal(JSON.stringify(claimed.result).includes("evidenceDigest"), false);
      sql(box, `CREATE DATABASE ${MARK_REPLAY_DB} TEMPLATE ${DB};`, "postgres");
      sql(box, `CREATE DATABASE ${UNAVAILABLE_DB} TEMPLATE ${DB};`, "postgres");
    });

    pass("verification marking binds lease, versions, and identity without creating a method", () => {
      assert.equal(markVerification(box, { credentialVersion: 2 }).outcome, "lease_lost");
      assert.equal(markVerification(box, { adapterVersion: 2 }).outcome, "durable_authority_invalid");
      assert.equal(markVerification(box, { provider: "paytr_iframe" }).outcome, "durable_authority_invalid");
      assert.equal(markVerification(box, { environment: "live" }).outcome, "durable_authority_invalid");
      assert.equal(markVerification(box, { profile: LIVE_PROFILE }).outcome, "durable_authority_invalid");
      assert.equal(markVerification(box).outcome, "validated");
      assert.equal(markVerification(box).outcome, "operation_replayed");
      assert.equal(markVerification(box, { outcome: "rejected" }).outcome, "operation_mismatch");
      assert.equal(sql(box, `SELECT status||'|'||version||'|'||(execution_environment IS NULL)
FROM saas.merchant_provider_profiles WHERE id='${TEST_PROFILE}';`).stdout.trim(), "active|2|true");
      assert.equal(sql(box, `SELECT count(*) FROM saas.payment_methods WHERE profile_id='${TEST_PROFILE}';`).stdout.trim(), "0");
    });

    pass("verification unavailability releases the exact lease and remains safely retryable", () => {
      const unavailable = markVerification(box, {
        outcome: "unavailable",
        outcomeCode: "validation_unavailable",
        database: UNAVAILABLE_DB,
      });
      assert.equal(unavailable.outcome, "unavailable");
      assert.equal(unavailable.result.status, "pending_validation");
      assert.equal(sql(box, `SELECT status||'|'||version||'|'||
  (validation_lease_id IS NULL AND validation_lease_owner IS NULL AND validation_lease_expires_at IS NULL)||'|'||
  (execution_environment IS NULL AND execution_adapter_version IS NULL AND execution_evidence_digest IS NULL)
FROM saas.merchant_provider_profiles WHERE id='${TEST_PROFILE}';`, UNAVAILABLE_DB).stdout.trim(), "pending_validation|2|true|true");
      assert.deepEqual(markVerification(box, {
        outcome: "unavailable",
        outcomeCode: "validation_unavailable",
        database: UNAVAILABLE_DB,
      }), { outcome: "operation_replayed", result: unavailable.result });
      assert.equal(markVerification(box, {
        outcome: "unavailable",
        outcomeCode: "provider_rejected",
        database: UNAVAILABLE_DB,
      }).outcome, "invalid_input");
      const reclaimed = claimVerification(box, {
        lease: "60000000-0000-4000-8000-000000000060",
        database: UNAVAILABLE_DB,
      });
      assert.equal(reclaimed.outcome, "claimed");
      assert.equal(reclaimed.result.profileVersion, 2);
      assert.equal(sql(box, `SELECT count(*) FROM saas.payment_methods WHERE profile_id='${TEST_PROFILE}';`, UNAVAILABLE_DB).stdout.trim(), "0");
    });

    await proveConcurrentExactMarkReplay(box);
    completed += 1;
    process.stdout.write(`PASS ${completed}/${TOTAL} concurrent exact verification marks serialize to validated and replayed\n`);

    pass("new preflight detects ACL drift transactionally", () => {
      const drift = sql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
GRANT EXECUTE ON FUNCTION saas.merchant_provider_profile_bind_execution_authority(uuid,text,text,text,integer,text,timestamptz,bigint) TO celebix_saas_app;
DO $f$ BEGIN
  BEGIN
    PERFORM saas.payment_provider_keyed_lifecycle_preflight();
    RAISE EXCEPTION 'EXPECTED_PREFLIGHT_FAILURE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'PAYMENT_PROVIDER_KEYED_LIFECYCLE_PREFLIGHT_INVALID' THEN RAISE; END IF;
  END;
END $f$;
ROLLBACK;`, DB, true);
      assert.equal(drift.status, 0, drift.stderr);
      const bodyMetadataDrift = sql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
ALTER FUNCTION saas.merchant_provider_profile_mark_verification(uuid,text,text,text,integer,text,timestamptz,uuid,bigint,bigint,text,text) SECURITY INVOKER;
DO $f$ BEGIN
  BEGIN
    PERFORM saas.payment_provider_keyed_lifecycle_preflight();
    RAISE EXCEPTION 'EXPECTED_PREFLIGHT_FAILURE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'PAYMENT_PROVIDER_KEYED_LIFECYCLE_PREFLIGHT_INVALID' THEN RAISE; END IF;
  END;
END $f$;
ROLLBACK;`, DB, true);
      assert.equal(bodyMetadataDrift.status, 0, bodyMetadataDrift.stderr);
      assert.equal(sql(box, "SET ROLE celebix_saas_app; SELECT saas.payment_provider_keyed_lifecycle_preflight();").stdout.trim(), "t");
    });

    pass("provider-keyed preflight rejects transactional 053 metadata, body, and ACL drift", () => {
      assertProviderPreflightRejects(box, `ALTER FUNCTION saas.payment_method_set_state(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text
) SECURITY INVOKER;`);
      assertProviderPreflightRejects(box, `DO $drift$ DECLARE definition text; BEGIN
  SELECT pg_catalog.pg_get_functiondef(oid) INTO definition
  FROM pg_catalog.pg_proc
  WHERE oid='saas.payment_attempt_begin(uuid,timestamptz,uuid,text,uuid,text,bigint,text,text)'::regprocedure;
  EXECUTE pg_catalog.replace(definition,'is_replay boolean;','is_replay boolean; -- transactional body drift');
END $drift$;`);
      assertProviderPreflightRejects(box, `GRANT EXECUTE ON FUNCTION saas.payment_attempt_begin(
  uuid,timestamptz,uuid,text,uuid,text,bigint,text,text
) TO celebix_saas_app;`);
      assert.equal(sql(box, "SET ROLE celebix_saas_app; SELECT saas.payment_provider_keyed_lifecycle_preflight();").stdout.trim(), "t");
    });

    pass("checkout method creation remains disabled until exact owner binding", () => {
      assert.equal(methodSave(box, "71000000-0000-4000-8000-000000000056").outcome, "provider_disabled");
      assert.equal(sql(box, `SET ROLE celebix_saas_owner;
SELECT saas.merchant_provider_execution_authority_approve('iyzico_iframe','payment_processing','test',1,'${EVIDENCE}','sandbox_ready','${MARKED_AT}');`).stdout.trim(), "t");
      assert.equal(sql(box, `SET ROLE celebix_saas_owner;
SELECT saas.merchant_provider_profile_bind_execution_authority('${LIVE_PROFILE}','iyzico_iframe','payment_processing','test',1,'${EVIDENCE}','${MARKED_AT}',1);`).stdout.trim(), "f");
      assert.equal(sql(box, `SET ROLE celebix_saas_owner;
SELECT saas.merchant_provider_profile_bind_execution_authority('${TEST_PROFILE}','paytr_iframe','payment_processing','test',1,'${EVIDENCE}','${MARKED_AT}',2);`).stdout.trim(), "f");
      assert.equal(sql(box, `SET ROLE celebix_saas_owner;
SELECT saas.merchant_provider_profile_bind_execution_authority('${TEST_PROFILE}','iyzico_iframe','payment_processing','test',1,'${EVIDENCE}','${MARKED_AT}',1);`).stdout.trim(), "f");
      assert.equal(sql(box, `SET ROLE celebix_saas_owner;
SELECT saas.merchant_provider_profile_bind_execution_authority('${TEST_PROFILE}','iyzico_iframe','payment_processing','test',1,'${EVIDENCE}','${MARKED_AT}',2);`).stdout.trim(), "t");
      assert.equal(sql(box, `SET ROLE celebix_saas_owner;
SELECT saas.merchant_provider_profile_bind_execution_authority('${TEST_PROFILE}','iyzico_iframe','payment_processing','test',1,'${EVIDENCE}','${MARKED_AT}',2);`).stdout.trim(), "t");
      assert.equal(sql(box, `SELECT version FROM saas.merchant_provider_profiles WHERE id='${TEST_PROFILE}';`).stdout.trim(), "3");
      assert.equal(markVerification(box).outcome, "operation_replayed");
      assert.equal(methodSave(box, "71000000-0000-4000-8000-000000000057").outcome, "saved");
      assert.equal(sql(box, "SET ROLE celebix_saas_app; SELECT saas.payment_provider_keyed_lifecycle_preflight();").stdout.trim(), "t");
      sql(box, `CREATE DATABASE ${REVOKE_ISOLATION_DB} TEMPLATE ${DB};`, "postgres");
    });

    const raceDatabases = {
      save: "payment_provider_keyed_lifecycle_race_save",
      mark: "payment_provider_keyed_lifecycle_race_mark",
      bind: "payment_provider_keyed_lifecycle_race_bind",
    };
    for (const database of Object.values(raceDatabases)) {
      sql(box, `CREATE DATABASE ${database} TEMPLATE ${DB};`, "postgres");
    }
    await (async () => {
      await proveNoReverseLockDeadlock(box, raceDatabases.save, "save", "61");
      completed += 1;
      process.stdout.write(`PASS ${completed}/${TOTAL} verification save and method save share one lock order\n`);
      await proveNoReverseLockDeadlock(box, raceDatabases.mark, "mark", "62");
      completed += 1;
      process.stdout.write(`PASS ${completed}/${TOTAL} verification mark and method save share one lock order\n`);
      await proveNoReverseLockDeadlock(box, raceDatabases.bind, "bind", "63");
      completed += 1;
      process.stdout.write(`PASS ${completed}/${TOTAL} authority bind and method save share one lock order\n`);
    })();

    pass("Iyzico revoke disables its active bound method without touching active PayTR", () => {
      assert.equal(sql(box, `SET ROLE celebix_saas_app;
SELECT outcome FROM saas.payment_method_set_state(${authority()},'72000000-0000-4000-8000-000000000060','${FP}','${METHOD}',1,'active',NULL);`, REVOKE_ISOLATION_DB).stdout.trim(), "state_changed");
      assert.equal(sql(box, `SET ROLE celebix_saas_owner;
SELECT saas.merchant_provider_execution_authority_approve('paytr_iframe','payment_processing','test',1,'${EVIDENCE}','sandbox_ready','${NOW}');`, REVOKE_ISOLATION_DB).stdout.trim(), "t");
      assert.equal(savePaytr(box, REVOKE_ISOLATION_DB).outcome, "saved");
      assert.equal(sql(box, `SET ROLE celebix_saas_workflow;
SELECT outcome FROM saas.merchant_provider_profile_claim_validation('worker.paytr','paytr_iframe','payment_processing','test',1,'${EVIDENCE}','${CLAIMED_AT}','${EXPIRES}','60000000-0000-4000-8000-000000000058');`, REVOKE_ISOLATION_DB).stdout.trim(), "claimed");
      assert.equal(sql(box, `SET ROLE celebix_saas_workflow;
SELECT outcome FROM saas.merchant_provider_profile_mark_validation('${PAYTR_PROFILE}','paytr_iframe','payment_processing','test',1,'${EVIDENCE}','worker.paytr','${MARKED_AT}','60000000-0000-4000-8000-000000000058',1,1,'validated','paytr_test_ok');`, REVOKE_ISOLATION_DB).stdout.trim(), "validated");
      assert.equal(app(box, "payment_method_save", [
        "'71000000-0000-4000-8000-000000000058'::uuid", `'${OTHER_FP}'`, `'${PAYTR_METHOD}'::uuid`, "0", "'provider'",
        `'${PAYTR_PROFILE}'::uuid`, "'paytr_iframe'", "'PayTR'", "'{\"environment\":\"test\"}'::jsonb",
      ].join(","), STORE, REVOKE_ISOLATION_DB).outcome, "saved");
      assert.equal(sql(box, `SET ROLE celebix_saas_app;
SELECT outcome FROM saas.payment_method_set_state(${authority()},'72000000-0000-4000-8000-000000000061','${OTHER_FP}','${PAYTR_METHOD}',1,'active',NULL);`, REVOKE_ISOLATION_DB).stdout.trim(), "state_changed");
      assert.equal(sql(box, `SELECT iyzico_profile.status||'|'||iyzico_method.state||'|'||paytr_profile.status||'|'||paytr_method.state
FROM saas.merchant_provider_profiles iyzico_profile
JOIN saas.payment_methods iyzico_method ON iyzico_method.profile_id=iyzico_profile.id AND iyzico_method.id='${METHOD}'
JOIN saas.merchant_provider_profiles paytr_profile ON paytr_profile.id='${PAYTR_PROFILE}'
JOIN saas.payment_methods paytr_method ON paytr_method.profile_id=paytr_profile.id AND paytr_method.id='${PAYTR_METHOD}'
WHERE iyzico_profile.id='${TEST_PROFILE}';`, REVOKE_ISOLATION_DB).stdout.trim(), "active|active|active|active");
      assert.equal(sql(box, `SET ROLE celebix_saas_owner;
SELECT saas.merchant_provider_execution_authority_revoke('iyzico_iframe','payment_processing','test',1,'${EVIDENCE}','${MARKED_AT}');`, REVOKE_ISOLATION_DB).stdout.trim(), "t");
      assert.equal(sql(box, `SELECT iyzico_profile.status||'|'||iyzico_method.state||'|'||paytr_profile.status||'|'||paytr_method.state||'|'||paytr_authority.enabled
FROM saas.merchant_provider_profiles iyzico_profile
JOIN saas.payment_methods iyzico_method ON iyzico_method.profile_id=iyzico_profile.id AND iyzico_method.id='${METHOD}'
JOIN saas.merchant_provider_profiles paytr_profile ON paytr_profile.id='${PAYTR_PROFILE}'
JOIN saas.payment_methods paytr_method ON paytr_method.profile_id=paytr_profile.id AND paytr_method.id='${PAYTR_METHOD}'
JOIN saas.merchant_provider_execution_authorities paytr_authority ON paytr_authority.provider_code='paytr_iframe' AND paytr_authority.environment='test'
WHERE iyzico_profile.id='${TEST_PROFILE}';`, REVOKE_ISOLATION_DB).stdout.trim(), "rotation_required|disabled|active|active|true");
    });

    pass("credential rotation clears execution authority and generically disables bound methods", () => {
      assert.equal(sql(box, `SET ROLE celebix_saas_app;
SELECT outcome FROM saas.payment_method_set_state(${authority()},'72000000-0000-4000-8000-000000000056','${FP}','${METHOD}',1,'active',NULL);`).stdout.trim(), "state_changed");
      assert.equal(saveVerification(box, {
        operation: "70000000-0000-4000-8000-000000000061", expectedVersion: 3,
        now: "2026-07-27T12:03:00.000Z",
      }).outcome, "saved");
      assert.equal(sql(box, `SELECT profile.status||'|'||profile.version||'|'||(profile.execution_environment IS NULL)||'|'||method.state
FROM saas.merchant_provider_profiles profile JOIN saas.payment_methods method ON method.profile_id=profile.id
WHERE profile.id='${TEST_PROFILE}';`).stdout.trim(), "pending_validation|4|true|disabled");
      assert.equal(sql(box, `SET ROLE celebix_saas_app;
SELECT outcome FROM saas.payment_method_set_state(${authority()},'72000000-0000-4000-8000-000000000057','${OTHER_FP}','${METHOD}',3,'active',NULL);`).stdout.trim(), "provider_disabled");
    });

    pass("legacy PayTR save, claim, mark, and activation remain compatible", () => {
      assert.equal(sql(box, `SET ROLE celebix_saas_owner;
SELECT saas.merchant_provider_execution_authority_approve('paytr_iframe','payment_processing','test',1,'${EVIDENCE}','sandbox_ready','${NOW}');`).stdout.trim(), "t");
      assert.equal(savePaytr(box).outcome, "saved");
      const claimed = sql(box, `SET ROLE celebix_saas_workflow;
SELECT outcome FROM saas.merchant_provider_profile_claim_validation('worker.paytr','paytr_iframe','payment_processing','test',1,'${EVIDENCE}','${CLAIMED_AT}','${EXPIRES}','60000000-0000-4000-8000-000000000058');`).stdout.trim();
      assert.equal(claimed, "claimed");
      assert.equal(sql(box, `SET ROLE celebix_saas_workflow;
SELECT outcome FROM saas.merchant_provider_profile_mark_validation('${PAYTR_PROFILE}','paytr_iframe','payment_processing','test',1,'${EVIDENCE}','worker.paytr','${MARKED_AT}','60000000-0000-4000-8000-000000000058',1,1,'validated','paytr_test_ok');`).stdout.trim(), "validated");
      assert.equal(sql(box, `SET ROLE celebix_saas_owner;
SELECT saas.merchant_provider_profile_bind_execution_authority('${PAYTR_PROFILE}','paytr_iframe','payment_processing','test',1,'${EVIDENCE}','${MARKED_AT}',2);`).stdout.trim(), "f");
      assert.equal(sql(box, `SELECT validation_environment||'|'||validation_adapter_version||'|'||status
FROM saas.merchant_provider_profiles WHERE id='${PAYTR_PROFILE}';`).stdout.trim(), "test|1|active");
      assert.equal(app(box, "payment_method_save", [
        "'71000000-0000-4000-8000-000000000058'::uuid", `'${OTHER_FP}'`, `'${PAYTR_METHOD}'::uuid`, "0", "'provider'",
        `'${PAYTR_PROFILE}'::uuid`, "'paytr_iframe'", "'PayTR'", "'{\"environment\":\"test\"}'::jsonb",
      ].join(",")).outcome, "saved");
      assert.equal(sql(box, `SET ROLE celebix_saas_app;
SELECT outcome FROM saas.payment_method_set_state(${authority()},'72000000-0000-4000-8000-000000000058','${FP}','${PAYTR_METHOD}',1,'active',NULL);`).stdout.trim(), "state_changed");
      assert.equal(sql(box, `SET ROLE celebix_saas_owner;
SELECT saas.merchant_provider_execution_authority_revoke('iyzico_iframe','payment_processing','test',1,'${EVIDENCE}','${MARKED_AT}');`).stdout.trim(), "t");
      assert.equal(sql(box, `SELECT profile.status||'|'||method.state
FROM saas.merchant_provider_profiles profile JOIN saas.payment_methods method ON method.profile_id=profile.id
WHERE profile.id='${PAYTR_PROFILE}' AND method.id='${PAYTR_METHOD}';`).stdout.trim(), "active|active");
      assert.equal(sql(box, `SET ROLE celebix_saas_app;
SELECT outcome FROM saas.payment_method_set_state(${authority()},'72000000-0000-4000-8000-000000000059','${OTHER_FP}','${METHOD}',3,'active',NULL);`).stdout.trim(), "provider_disabled");
    });

    pass("rollback guard refuses live provider-keyed state", () => {
      const guarded = sql(box, readFileSync(path.join(SQL, DOWN), "utf8"), DB, true);
      assert.notEqual(guarded.status, 0);
      assert.match(guarded.stderr, /PAYMENT_PROVIDER_KEYED_LIFECYCLE_ROLLBACK_REQUIRES_DRAIN/);
      assert.equal(sql(box, "SET ROLE celebix_saas_app; SELECT saas.payment_provider_keyed_lifecycle_preflight();").stdout.trim(), "t");
    });

    pass("clean PostgreSQL 16 up-down-up restores 055 then reapplies 056", () => {
      apply(box, UP, ROLLBACK_DB);
      apply(box, ASSERTIONS, ROLLBACK_DB);
      apply(box, DOWN, ROLLBACK_DB);
      apply(box, "202607270055_hosted_callback_lifecycle_assertions.sql", ROLLBACK_DB);
      assert.equal(sql(box, `SELECT to_regprocedure('saas.merchant_provider_profile_save_verification(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,text,integer,bigint)') IS NULL
AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='saas' AND table_name='merchant_provider_profiles' AND column_name='validation_environment');`, ROLLBACK_DB).stdout.trim(), "t");
      apply(box, UP, ROLLBACK_DB);
      apply(box, ASSERTIONS, ROLLBACK_DB);
    });

    assert.equal(completed, TOTAL);
  } finally {
    stop(box);
  }
}

await main();
