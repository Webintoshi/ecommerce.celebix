import assert from "node:assert/strict";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "paytr_iframe_activation";
const ROLLBACK_DB = "paytr_iframe_activation_rollback";
const STORE = "10000000-0000-4000-8000-000000000053";
const OTHER_STORE = "10000000-0000-4000-8000-000000000054";
const OWNER = "20000000-0000-4000-8000-000000000053";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000053";
const PROFILE = "40000000-0000-4000-8000-000000000053";
const SECOND_METHOD = "50000000-0000-4000-8000-000000000053";
const PLAN = "00000000-0000-4000-8000-000000000001";
const NOW = "2026-07-27T12:00:00.000Z";
const LATER = "2026-07-27T12:01:00.000Z";
const FINGERPRINT = "a".repeat(64);
const OTHER_FINGERPRINT = "b".repeat(64);
const CALLBACK_DIGEST = "c".repeat(64);
const EVIDENCE = `sha256:${"d".repeat(64)}`;
const STALE_EVIDENCE = `sha256:${"e".repeat(64)}`;
const prior = JSON.parse(readFileSync(path.join(SQL, "phase3k-payment-adapter-runtime-manifest.json"), "utf8"));

function bin(name) {
  const file = path.join(PG, name);
  accessSync(file, constants.X_OK);
  return file;
}

function run(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  }
  return result;
}

function sql(box, input, allowFailure = false, database = DB) {
  return run(bin("psql"), [
    "-h", box.socket,
    "-p", String(box.port),
    "-X", "-qAt",
    "-v", "ON_ERROR_STOP=1",
    "-U", "postgres",
    "-d", database,
  ], input, allowFailure);
}

function sqlAsync(box, input, database = DB) {
  return new Promise((resolve) => {
    const child = spawn(bin("psql"), [
      "-h", box.socket,
      "-p", String(box.port),
      "-X", "-qAt",
      "-v", "ON_ERROR_STOP=1",
      "-U", "postgres",
      "-d", database,
    ], { cwd: ROOT, timeout: 10_000 });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(input);
  });
}

function apply(box, file, database = DB) {
  sql(box, readFileSync(path.join(SQL, file), "utf8"), false, database);
}

function start() {
  const root = mkdtempSync("/tmp/celebix-paytr-iframe-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 35000 + Math.floor(Math.random() * 1000);
  mkdirSync(socket, { mode: 0o700 });
  run(bin("initdb"), ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  run(bin("pg_ctl"), ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { root, data, socket, port };
}

function stop(box) {
  if (!box) return;
  run(bin("pg_ctl"), ["-D", box.data, "-m", "fast", "stop"], "", true);
  rmSync(box.root, { recursive: true, force: true });
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

function merchantAuthority(store = STORE, now = NOW) {
  return `'${store}'::uuid,'${OWNER}'::uuid,'${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${now}'::timestamptz`;
}

function app(box, name, extra, store = STORE, now = NOW) {
  const result = sql(box, `SET ROLE celebix_saas_app;
SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
FROM saas.${name}(${merchantAuthority(store, now)},${extra});`);
  return JSON.parse(result.stdout.trim());
}

function save(box, {
  operation,
  profile = PROFILE,
  store = STORE,
  expectedVersion = 0,
  publicEnvironment = "test",
  authorityEnvironment = "test",
  adapterVersion = 1,
  evidenceDigest = EVIDENCE,
  now = NOW,
}) {
  return app(
    box,
    "merchant_provider_profile_save",
    `'${operation}'::uuid,'${FINGERPRINT}','${profile}'::uuid,'paytr_iframe','payment_processing',
     '{"environment":"${publicEnvironment}"}'::jsonb,'••••paytr','${envelope()}'::jsonb,
     '${"1".repeat(64)}','provider.current',1,'${authorityEnvironment}',${adapterVersion},'${evidenceDigest}',${expectedVersion}`,
    store,
    now,
  );
}

function claim(box, {
  worker = "worker.paytr",
  environment = "test",
  adapterVersion = 1,
  evidenceDigest = EVIDENCE,
  now = LATER,
  expires = "2026-07-27T12:10:00.000Z",
  lease = "60000000-0000-4000-8000-000000000053",
} = {}) {
  const result = sql(box, `SET ROLE celebix_saas_workflow;
SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
FROM saas.merchant_provider_profile_claim_validation(
  '${worker}','paytr_iframe','payment_processing','${environment}',${adapterVersion},'${evidenceDigest}',
  '${now}'::timestamptz,'${expires}'::timestamptz,'${lease}'::uuid
);`);
  return JSON.parse(result.stdout.trim());
}

function mark(box, {
  environment = "test",
  adapterVersion = 1,
  evidenceDigest = EVIDENCE,
  worker = "worker.paytr",
  lease = "60000000-0000-4000-8000-000000000053",
  credentialVersion = 1,
  profileVersion = 1,
  validationOutcome = "validated",
  outcomeCode = "paytr_test_ok",
  now = "2026-07-27T12:02:00.000Z",
} = {}) {
  const result = sql(box, `SET ROLE celebix_saas_workflow;
SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
FROM saas.merchant_provider_profile_mark_validation(
  '${PROFILE}'::uuid,'paytr_iframe','payment_processing','${environment}',${adapterVersion},'${evidenceDigest}',
  '${worker}','${now}'::timestamptz,'${lease}'::uuid,${credentialVersion},${profileVersion},
  '${validationOutcome}','${outcomeCode}'
);`);
  return JSON.parse(result.stdout.trim());
}

function setMethodState(box, operation, expectedVersion, state, reason = null, now = "2026-07-27T12:03:00.000Z") {
  return app(
    box,
    "payment_method_set_state",
    `'${operation}'::uuid,'${OTHER_FINGERPRINT}','${PROFILE}'::uuid,${expectedVersion},'${state}',${reason === null ? "NULL" : `'${reason}'`}`,
    STORE,
    now,
  );
}

function beginAttempt(box, operation = "80000000-0000-4000-8000-000000000053") {
  const result = sql(box, `SET ROLE celebix_saas_workflow;
SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
FROM saas.payment_attempt_begin(
  '${STORE}'::uuid,'2026-07-27T12:04:00.000Z'::timestamptz,'${operation}'::uuid,
  '${FINGERPRINT}','${PROFILE}'::uuid,'ORDER-53',12500,'TRY','${CALLBACK_DIGEST}'
);`);
  return JSON.parse(result.stdout.trim());
}

async function main() {
  let box;
  try {
    box = start();
    sql(box, `CREATE DATABASE ${DB};`, false, "postgres");
    for (const { file } of prior.migrationChain) {
      apply(box, file, DB);
    }
    sql(box, `CREATE DATABASE ${ROLLBACK_DB} TEMPLATE ${DB};`, false, "postgres");

    apply(box, "202607270053_paytr_iframe_activation_authority.up.sql");
    apply(box, "202607270053_paytr_iframe_activation_authority_assertions.sql");
    assert.equal(sql(box, "SET ROLE celebix_saas_workflow; SELECT saas.paytr_iframe_activation_preflight();").stdout.trim(), "t");
    assert.equal(sql(box, "SET ROLE celebix_saas_app; SELECT saas.paytr_iframe_activation_preflight();").stdout.trim(), "t");
    assert.equal(sql(box, "SELECT count(*) FROM saas.merchant_provider_execution_authorities;").stdout.trim(), "0");

    const aclDrift = sql(box, `BEGIN;
SET LOCAL ROLE celebix_saas_owner;
GRANT EXECUTE ON FUNCTION saas.merchant_provider_execution_authority_approve(text,text,text,integer,text,text,timestamptz) TO celebix_saas_app;
SELECT saas.paytr_iframe_activation_preflight();
ROLLBACK;`, true);
    assert.notEqual(aclDrift.status, 0);
    assert.equal(sql(box, "SET ROLE celebix_saas_app; SELECT saas.paytr_iframe_activation_preflight();").stdout.trim(), "t");

    sql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
VALUES('${OWNER}','https://id.test','owner','owner@test.invalid',true,'${NOW}','${NOW}');
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
VALUES('${STORE}','PayTR','paytr','active','tr','TRY','default','${NOW}','${NOW}'),
      ('${OTHER_STORE}','Other','other','active','tr','TRY','default','${NOW}','${NOW}');
INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)
VALUES('${MEMBERSHIP}','${OWNER}','${STORE}','store_owner','active','${NOW}','${NOW}');
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
VALUES('31000000-0000-4000-8000-000000000053','${STORE}','${PLAN}','free_starter',1,'active','${NOW}','${NOW}','${NOW}');
ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable;
UPDATE saas.plan_features SET enabled=true WHERE plan_id='${PLAN}' AND feature_key='integrations';
ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable;
COMMIT;`);

    assert.equal(save(box, { operation: "70000000-0000-4000-8000-000000000050" }).outcome, "provider_disabled");
    assert.equal(claim(box).outcome, "empty");
    assert.equal(sql(box, "SELECT count(*) FROM saas.merchant_provider_profiles;").stdout.trim(), "0");
    assert.notEqual(sql(box, `SET ROLE celebix_saas_app; SELECT * FROM saas.merchant_provider_execution_authorities;`, true).status, 0);
    assert.notEqual(sql(box, `SET ROLE celebix_saas_workflow; SELECT saas.merchant_provider_execution_authority_approve('paytr_iframe','payment_processing','test',1,'${EVIDENCE}','sandbox_ready','${NOW}');`, true).status, 0);

    assert.equal(sql(box, `SET ROLE celebix_saas_owner;
SELECT saas.merchant_provider_execution_authority_approve(
  'paytr_iframe','payment_processing','test',1,'${EVIDENCE}','sandbox_ready','${NOW}'::timestamptz
);`).stdout.trim(), "t");
    assert.equal(sql(box, "SELECT count(*) FROM saas.merchant_provider_execution_authorities WHERE enabled;").stdout.trim(), "1");

    assert.equal(save(box, {
      operation: "70000000-0000-4000-8000-000000000051",
      publicEnvironment: "live",
      authorityEnvironment: "live",
    }).outcome, "provider_disabled");
    assert.equal(save(box, {
      operation: "70000000-0000-4000-8000-000000000052",
      adapterVersion: 2,
    }).outcome, "provider_disabled");
    assert.equal(save(box, {
      operation: "70000000-0000-4000-8000-000000000053",
      evidenceDigest: STALE_EVIDENCE,
    }).outcome, "provider_disabled");
    assert.equal(save(box, {
      operation: "70000000-0000-4000-8000-000000000054",
      publicEnvironment: "live",
    }).outcome, "invalid_input");
    assert.equal(sql(box, "SELECT count(*) FROM saas.merchant_provider_profiles;").stdout.trim(), "0");

    const saved = save(box, { operation: "70000000-0000-4000-8000-000000000055" });
    assert.equal(saved.outcome, "saved");
    assert.equal(save(box, { operation: "70000000-0000-4000-8000-000000000055" }).outcome, "operation_replayed");
    assert.equal(save(box, {
      operation: "70000000-0000-4000-8000-000000000056",
      profile: "40000000-0000-4000-8000-000000000054",
      store: OTHER_STORE,
    }).outcome, "membership_denied");

    assert.equal(claim(box, {
      environment: "live",
      lease: "60000000-0000-4000-8000-000000000050",
    }).outcome, "empty");
    assert.equal(claim(box, {
      adapterVersion: 2,
      lease: "60000000-0000-4000-8000-000000000051",
    }).outcome, "empty");
    assert.equal(claim(box, {
      evidenceDigest: STALE_EVIDENCE,
      lease: "60000000-0000-4000-8000-000000000052",
    }).outcome, "empty");
    const claimed = claim(box);
    assert.equal(claimed.outcome, "claimed");
    assert.deepEqual(claimed.result.executionAuthority, {
      environment: "test",
      adapterVersion: 1,
      evidenceDigest: EVIDENCE,
    });

    assert.equal(mark(box, { adapterVersion: 2 }).outcome, "durable_authority_invalid");
    assert.equal(sql(box, `SELECT status='pending_validation' AND validation_lease_id='60000000-0000-4000-8000-000000000053'::uuid FROM saas.merchant_provider_profiles WHERE id='${PROFILE}';`).stdout.trim(), "t");
    assert.equal(mark(box).outcome, "validated");
    assert.equal(sql(box, `SELECT status='active' AND execution_environment='test' AND execution_adapter_version=1 AND execution_evidence_digest='${EVIDENCE}' FROM saas.merchant_provider_profiles WHERE id='${PROFILE}';`).stdout.trim(), "t");
    assert.equal(sql(box, `SELECT state='active' AND provider_code='paytr_iframe' AND profile_id='${PROFILE}'::uuid FROM saas.payment_methods WHERE id='${PROFILE}';`).stdout.trim(), "t");

    assert.equal(setMethodState(box, "71000000-0000-4000-8000-000000000053", 1, "disabled").outcome, "state_changed");
    assert.equal(setMethodState(box, "71000000-0000-4000-8000-000000000054", 2, "active").outcome, "state_changed");
    assert.equal(beginAttempt(box).outcome, "created");
    assert.equal(sql(box, "SELECT count(*) FROM saas.payment_attempts;").stdout.trim(), "1");

    assert.equal(setMethodState(
      box,
      "71000000-0000-4000-8000-000000000055",
      3,
      "emergency_disabled",
      "Manual payment incident",
    ).outcome, "state_changed");
    assert.equal(setMethodState(
      box,
      "71000000-0000-4000-8000-000000000056",
      4,
      "active",
    ).outcome, "invalid_transition");

    sql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.payment_methods(
  id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,
  position,config,version,created_at,updated_at
) VALUES(
  '${SECOND_METHOD}','${STORE}','provider','${PROFILE}','paytr_iframe','Secondary PayTR',
  'active',NULL,1,'{"environment":"test"}',1,'${LATER}','${LATER}'
);
COMMIT;`);

    const lockHolder = sqlAsync(box, `BEGIN;
SET LOCAL ROLE celebix_saas_workflow;
SET LOCAL lock_timeout='4s';
SELECT outcome FROM saas.merchant_provider_profile_claim_validation(
  'worker.lock','paytr_iframe','payment_processing','test',1,'${EVIDENCE}',
  '2026-07-27T12:05:00.000Z'::timestamptz,'2026-07-27T12:10:00.000Z'::timestamptz,
  '60000000-0000-4000-8000-000000000060'::uuid
);
SELECT pg_catalog.pg_sleep(0.5);
COMMIT;`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const revokeStarted = Date.now();
    const revoke = await sqlAsync(box, `BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='4s';
SELECT saas.merchant_provider_execution_authority_revoke(
  'paytr_iframe','payment_processing','test',1,'${EVIDENCE}',
  '2026-07-27T12:06:00.000Z'::timestamptz
);
COMMIT;`);
    const revokeElapsed = Date.now() - revokeStarted;
    const holder = await lockHolder;
    assert.equal(holder.status, 0, holder.stderr);
    assert.equal(revoke.status, 0, revoke.stderr);
    assert.match(holder.stdout, /empty/);
    assert.match(revoke.stdout, /t/);
    assert.ok(revokeElapsed >= 250, `revoke did not serialize behind shared authority guard: ${revokeElapsed}ms`);

    assert.equal(sql(box, `SELECT enabled=false FROM saas.merchant_provider_execution_authorities WHERE provider_code='paytr_iframe' AND environment='test';`).stdout.trim(), "t");
    assert.equal(sql(box, `SELECT status='rotation_required' AND validation_lease_id IS NULL FROM saas.merchant_provider_profiles WHERE id='${PROFILE}';`).stdout.trim(), "t");
    assert.equal(sql(box, `SELECT state='emergency_disabled' AND emergency_reason='Manual payment incident' FROM saas.payment_methods WHERE id='${PROFILE}';`).stdout.trim(), "t");
    assert.equal(sql(box, `SELECT state='disabled' FROM saas.payment_methods WHERE id='${SECOND_METHOD}';`).stdout.trim(), "t");
    assert.equal(mark(box).outcome, "durable_authority_invalid");
    assert.equal(beginAttempt(box).outcome, "durable_authority_invalid");
    assert.equal(setMethodState(box, "71000000-0000-4000-8000-000000000054", 2, "active").outcome, "provider_disabled");
    assert.equal(claim(box, { lease: "60000000-0000-4000-8000-000000000061" }).outcome, "empty");
    sql(box, `SET ROLE celebix_saas_owner; DELETE FROM saas.payment_methods WHERE id='${SECOND_METHOD}'::uuid;`);
    sql(box, `SET ROLE celebix_saas_owner; SELECT saas.paytr_iframe_test_payment_method_activate('${STORE}'::uuid,'${PROFILE}'::uuid,'2026-07-27T12:07:00.000Z');`);
    assert.equal(sql(box, `SELECT state='emergency_disabled' FROM saas.payment_methods WHERE id='${PROFILE}';`).stdout.trim(), "t");
    assert.equal(sql(box, "SET ROLE celebix_saas_workflow; SELECT saas.paytr_iframe_activation_preflight();").stdout.trim(), "t");

    apply(box, "202607270053_paytr_iframe_activation_authority.up.sql", ROLLBACK_DB);
    apply(box, "202607270053_paytr_iframe_activation_authority_assertions.sql", ROLLBACK_DB);
    apply(box, "202607270053_paytr_iframe_activation_authority.down.sql", ROLLBACK_DB);
    for (const file of [
      "202607250049_merchant_provider_profiles_assertions.sql",
      "202607250050_merchant_provider_execution_assertions.sql",
      "202607270051_payment_method_admin_assertions.sql",
      "202607270052_payment_adapter_runtime_assertions.sql",
    ]) apply(box, file, ROLLBACK_DB);
    assert.equal(sql(box, `SELECT
      to_regclass('saas.merchant_provider_execution_authorities') IS NULL
      AND to_regprocedure('saas.merchant_provider_execution_authority_matches(text,text,text,integer,text)') IS NULL
      AND to_regprocedure('saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,text,integer,text,bigint)') IS NULL
      AND to_regprocedure('saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,bigint)') IS NOT NULL
      AND to_regprocedure('saas.merchant_provider_profile_claim_validation(text,timestamp with time zone,timestamp with time zone,uuid)') IS NOT NULL
      AND to_regprocedure('saas.merchant_provider_profile_mark_validation(uuid,text,timestamp with time zone,uuid,bigint,bigint,text,text)') IS NOT NULL
      AND to_regprocedure('saas.payment_method_set_state_without_execution_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)') IS NULL
      AND to_regprocedure('saas.payment_attempt_begin_without_execution_authority(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)') IS NULL
      AND NOT EXISTS(SELECT 1 FROM saas.merchant_provider_definitions WHERE provider_code='paytr_iframe');`, false, ROLLBACK_DB).stdout.trim(), "t");

    console.log("1/1 PASS");
  } finally {
    stop(box);
  }
}

await main();
