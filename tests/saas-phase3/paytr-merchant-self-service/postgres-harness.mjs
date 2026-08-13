import assert from "node:assert/strict";
import {
  accessSync,
  constants,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const DB = "paytr_merchant_self_service";
const ROLLBACK_DB = "paytr_merchant_self_service_rollback";
const UP = "202608130105_paytr_merchant_self_service.up.sql";
const DOWN = "202608130105_paytr_merchant_self_service.down.sql";
const ASSERTIONS = "202608130105_paytr_merchant_self_service_assertions.sql";
const PREFERENCE_UP = "202608120104_payment_method_preference_snapshot.up.sql";
const priorManifest = JSON.parse(
  readFileSync(path.join(SQL, "phase3u-built-in-payment-methods-manifest.json"), "utf8"),
);
const PRIOR = priorManifest.migrationChain.map(({ file }) => file);

const NOW = "2026-08-13T12:00:00.000Z";
const MARKED = "2026-08-13T12:02:00.000Z";
const EXPIRES = "2026-08-13T12:10:00.000Z";
const TEST_EVIDENCE = `sha256:${"a".repeat(64)}`;
const LIVE_EVIDENCE = `sha256:${"b".repeat(64)}`;
const STORE_A = "10000000-0000-4000-8000-000000000105";
const STORE_B = "10000000-0000-4000-8000-000000000106";
const STORE_C = "10000000-0000-4000-8000-000000000107";
const STORE_D = "10000000-0000-4000-8000-000000000108";
const STORE_E = "10000000-0000-4000-8000-000000000109";
const STORE_F = "10000000-0000-4000-8000-000000000110";
const PAYTR_A = "40000000-0000-4000-8000-000000000105";
const PAYTR_B = "40000000-0000-4000-8000-000000000106";
const PAYTR_C = "40000000-0000-4000-8000-000000000107";
const PAYTR_D = "40000000-0000-4000-8000-000000000108";
const PAYTR_E = "40000000-0000-4000-8000-000000000109";
const PAYTR_F_TEST = "40000000-0000-4000-8000-000000000110";
const PAYTR_F_LIVE = "40000000-0000-4000-8000-000000000111";
const OTHER_A = "41000000-0000-4000-8000-000000000105";
const OTHER_B = "41000000-0000-4000-8000-000000000106";
const OTHER_E = "41000000-0000-4000-8000-000000000109";
const LEASE_A = "60000000-0000-4000-8000-000000000105";
const LEASE_B = "60000000-0000-4000-8000-000000000106";
const LEASE_C = "60000000-0000-4000-8000-000000000107";
const LEASE_D = "60000000-0000-4000-8000-000000000108";
const LEASE_E = "60000000-0000-4000-8000-000000000109";
const LEASE_F_TEST = "60000000-0000-4000-8000-000000000110";
const LEASE_F_LIVE = "60000000-0000-4000-8000-000000000111";
const TOTAL = 10;
let completed = 0;

function executable(name) {
  const directories = [
    process.env.POSTGRES_BIN,
    ...(process.env.PATH ?? "").split(path.delimiter),
  ];
  try {
    directories.push(
      ...readdirSync(path.join(homedir(), ".codex", "tmp"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^postgresql-[0-9.]+-(?:install|)$/.test(entry.name))
        .map((entry) => path.join(homedir(), ".codex", "tmp", entry.name, "bin")),
    );
  } catch {
    // PostgreSQL may already be available on PATH.
  }
  for (const directory of directories) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Keep looking for the pinned PostgreSQL toolchain.
    }
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
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  }
  return result;
}

function start() {
  const tools = Object.fromEntries(
    ["initdb", "pg_ctl", "psql"].map((name) => [name, executable(name)]),
  );
  const root = mkdtempSync("/tmp/celebix-paytr-self-service-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 20_000 + Math.floor(Math.random() * 15_000);
  mkdirSync(socket, { mode: 0o700 });
  command(tools.initdb, [
    "-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8",
  ]);
  command(tools.pg_ctl, [
    "-D", data, "-o", `-k ${socket} -p ${port} -h ''`,
    "-l", path.join(root, "postgres.log"), "start",
  ]);
  return { tools, root, data, socket, port };
}

function stop(box) {
  if (!box) return;
  command(box.tools.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], "", true);
  rmSync(box.root, { recursive: true, force: true });
}

function psql(box, source, database = DB, allowFailure = false) {
  return command(box.tools.psql, [
    "-h", box.socket, "-p", String(box.port), "-X", "-qAt",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database,
  ], source, allowFailure);
}

function concurrentPsql(box, source) {
  const child = spawn(box.tools.psql, [
    "-h", box.socket, "-p", String(box.port), "-X", "-qAt",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", DB,
  ], {
    cwd: ROOT,
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const completed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
  child.stdin.end(source);
  return completed;
}

function apply(box, file, database = DB, allowFailure = false) {
  return psql(box, readFileSync(path.join(SQL, file), "utf8"), database, allowFailure);
}

function scenario(name, run) {
  run();
  completed += 1;
  console.log(`PASS ${completed}/${TOTAL} ${name}`);
}

async function asyncScenario(name, run) {
  await run();
  completed += 1;
  console.log(`PASS ${completed}/${TOTAL} ${name}`);
}

function envelope() {
  return JSON.stringify({
    algorithm: "A256GCM",
    ciphertext: "AA",
    iv: "AAAAAAAAAAAAAAAA",
    keyId: "profile-key-105",
    tag: "AAAAAAAAAAAAAAAAAAAAAA",
    version: 1,
  });
}

function profileRow(id, store, provider, environment, adapter, status, lease, evidence = null) {
  const execution = evidence === null
    ? "NULL,NULL,NULL"
    : `'${environment}',${adapter},'${evidence}'`;
  return `(
    '${id}','${store}','${provider}','payment_processing',
    '{"environment":"${environment}","merchantId":"merchant-${id.slice(-3)}"}',
    'merchant-***${id.slice(-3)}','${envelope()}'::jsonb,'${"c".repeat(64)}',
    'profile-key-105',1,1,'${status}',1,NULL,
    ${lease ? `'${lease}','worker.paytr','${EXPIRES}'` : "NULL,NULL,NULL"},
    '${NOW}','${NOW}',NULL,'${environment}',${adapter},${execution}
  )`;
}

function seed(box) {
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
    ALTER TABLE saas.merchant_provider_definitions
      DISABLE TRIGGER merchant_provider_definitions_immutable;
    INSERT INTO saas.merchant_provider_definitions(
      provider_code,capability,enabled,allows_verification_without_execution_authority,created_at
    ) VALUES('other_iframe','payment_processing',true,false,'${NOW}');
    ALTER TABLE saas.merchant_provider_definitions
      ENABLE TRIGGER merchant_provider_definitions_immutable;

    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
    VALUES
      ('${STORE_A}','PayTR A','paytr-a','active','tr','TRY','starter','${NOW}','${NOW}'),
      ('${STORE_B}','PayTR B','paytr-b','active','tr','TRY','starter','${NOW}','${NOW}'),
      ('${STORE_C}','PayTR C','paytr-c','active','tr','TRY','starter','${NOW}','${NOW}'),
      ('${STORE_D}','PayTR D','paytr-d','active','tr','TRY','starter','${NOW}','${NOW}'),
      ('${STORE_E}','PayTR E','paytr-e','active','tr','TRY','starter','${NOW}','${NOW}');
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
    VALUES('${STORE_F}','PayTR F','paytr-f','active','tr','TRY','starter','${NOW}','${NOW}');

    INSERT INTO saas.merchant_provider_execution_authorities(
      provider_code,capability,environment,adapter_version,evidence_digest,
      readiness,enabled,approved_at
    ) VALUES
      ('paytr_iframe','payment_processing','test',1,'${TEST_EVIDENCE}','sandbox_ready',true,'${NOW}'),
      ('paytr_iframe','payment_processing','live',1,'${LIVE_EVIDENCE}','production_ready',true,'${NOW}'),
      ('other_iframe','payment_processing','test',1,'${TEST_EVIDENCE}','sandbox_ready',true,'${NOW}');

    INSERT INTO saas.merchant_provider_profiles(
      id,store_id,provider_code,capability,public_config,masked_account_reference,
      sealed_credentials,credential_digest,credential_key_id,credential_schema_version,
      credential_version,status,version,last_validated_at,
      validation_lease_id,validation_lease_owner,validation_lease_expires_at,
      created_at,updated_at,revoked_at,validation_environment,validation_adapter_version,
      execution_environment,execution_adapter_version,execution_evidence_digest
    ) VALUES
      ${profileRow(PAYTR_A, STORE_A, "paytr_iframe", "test", 1, "pending_validation", LEASE_A)},
      ${profileRow(PAYTR_B, STORE_B, "paytr_iframe", "test", 1, "pending_validation", LEASE_B)},
      ${profileRow(PAYTR_C, STORE_C, "paytr_iframe", "test", 1, "pending_validation", LEASE_C)},
      ${profileRow(PAYTR_D, STORE_D, "paytr_iframe", "test", 2, "pending_validation", LEASE_D)},
      ${profileRow(PAYTR_E, STORE_E, "paytr_iframe", "live", 1, "pending_validation", LEASE_E)},
      ${profileRow(PAYTR_F_TEST, STORE_F, "paytr_iframe", "test", 1, "pending_validation", LEASE_F_TEST)},
      ${profileRow(PAYTR_F_LIVE, STORE_F, "paytr_iframe", "live", 1, "pending_validation", LEASE_F_LIVE)},
      ${profileRow(OTHER_A, STORE_A, "other_iframe", "test", 1, "active", null, TEST_EVIDENCE)},
      ${profileRow(OTHER_B, STORE_B, "other_iframe", "test", 1, "active", null, TEST_EVIDENCE)},
      ${profileRow(OTHER_E, STORE_E, "other_iframe", "test", 1, "active", null, TEST_EVIDENCE)};

    INSERT INTO saas.payment_methods(
      id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,
      position,config,version,created_at,updated_at
    ) VALUES
      ('${OTHER_A}','${STORE_A}','provider','${OTHER_A}','other_iframe','Other hosted','active',NULL,0,
        '{"environment":"test","locale":"tr","threeDSecure":"provider_managed","installmentMode":"all","maxInstallment":0}',1,'${NOW}','${NOW}'),
      ('${OTHER_B}','${STORE_B}','provider','${OTHER_B}','other_iframe','Other hosted','active',NULL,0,
        '{"environment":"test","locale":"tr","threeDSecure":"provider_managed","installmentMode":"all","maxInstallment":0}',1,'${NOW}','${NOW}'),
      ('${OTHER_E}','${STORE_E}','provider','${OTHER_E}','other_iframe','Other hosted','active',NULL,0,
        '{"environment":"test","locale":"tr","threeDSecure":"provider_managed","installmentMode":"all","maxInstallment":0}',1,'${NOW}','${NOW}'),
      ('${PAYTR_E}','${STORE_E}','provider','${PAYTR_E}','paytr_iframe','PayTR','emergency_disabled','operator hold',9999,
        '{"environment":"live","locale":"tr","threeDSecure":"provider_managed","installmentMode":"all","maxInstallment":0}',1,'${NOW}','${NOW}');
    COMMIT;`);
}

function mark(box, profile, lease, environment, adapter, outcome, code) {
  return psql(box, `SET ROLE celebix_saas_workflow;
    SELECT outcome FROM saas.paytr_merchant_self_service_mark_verification(
      '${profile}','paytr_iframe','payment_processing','${environment}',${adapter},
      'worker.paytr','${MARKED}','${lease}',1,1,'${outcome}','${code}'
    );`).stdout.trim();
}

let box;
try {
  box = start();
  psql(box, `CREATE DATABASE ${DB};`, "postgres");
  for (const file of PRIOR) apply(box, file);
  apply(box, PREFERENCE_UP);
  psql(box, `CREATE DATABASE ${ROLLBACK_DB} WITH TEMPLATE ${DB};`, "postgres");
  apply(box, UP);
  seed(box);

  scenario("PostgreSQL 16 applies 105 and its catalog assertions", () => {
    assert.match(psql(box, "SHOW server_version;").stdout.trim(), /^16[.]/);
    apply(box, ASSERTIONS);
    assert.equal(psql(box, `SELECT allows_verification_without_execution_authority
      FROM saas.merchant_provider_definitions
      WHERE provider_code='paytr_iframe' AND capability='payment_processing';`).stdout.trim(), "t");
  });

  scenario("validated test credentials bind exact authority and switch the active provider", () => {
    assert.equal(mark(box, PAYTR_A, LEASE_A, "test", 1, "validated", "validated"), "validated");
    assert.equal(psql(box, `SELECT profile.status||'|'||profile.execution_environment||'|'||
      profile.execution_adapter_version||'|'||profile.execution_evidence_digest||'|'||method.state
      FROM saas.merchant_provider_profiles profile
      JOIN saas.payment_methods method ON method.profile_id=profile.id
      WHERE profile.id='${PAYTR_A}';`).stdout.trim(), `active|test|1|${TEST_EVIDENCE}|active`);
    assert.equal(psql(box, `SELECT state FROM saas.payment_methods WHERE id='${OTHER_A}';`).stdout.trim(), "disabled");
    assert.deepEqual(JSON.parse(psql(box, `SELECT config::text FROM saas.payment_methods WHERE id='${PAYTR_A}';`).stdout.trim()), {
      environment: "test", installmentMode: "all", locale: "tr", maxInstallment: 0,
      threeDSecure: "provider_managed",
    });
  });

  scenario("exact replay returns the committed projection without another mutation", () => {
    const before = psql(box, `SELECT profile.version||'|'||method.version
      FROM saas.merchant_provider_profiles profile JOIN saas.payment_methods method ON method.profile_id=profile.id
      WHERE profile.id='${PAYTR_A}';`).stdout.trim();
    assert.equal(mark(box, PAYTR_A, LEASE_A, "test", 1, "validated", "validated"), "operation_replayed");
    assert.equal(psql(box, `SELECT profile.version||'|'||method.version
      FROM saas.merchant_provider_profiles profile JOIN saas.payment_methods method ON method.profile_id=profile.id
      WHERE profile.id='${PAYTR_A}';`).stdout.trim(), before);
  });

  scenario("unavailable and rejected outcomes never activate PayTR", () => {
    assert.equal(mark(box, PAYTR_B, LEASE_B, "test", 1, "unavailable", "validation_unavailable"), "unavailable");
    assert.equal(mark(box, PAYTR_C, LEASE_C, "test", 1, "rejected", "credentials_rejected"), "rejected");
    assert.equal(psql(box, `SELECT
      (SELECT status FROM saas.merchant_provider_profiles WHERE id='${PAYTR_B}')||'|'||
      (SELECT status FROM saas.merchant_provider_profiles WHERE id='${PAYTR_C}')||'|'||
      (SELECT pg_catalog.count(*) FROM saas.payment_methods WHERE profile_id IN('${PAYTR_B}','${PAYTR_C}'));`).stdout.trim(), "pending_validation|rotation_required|0");
  });

  scenario("missing adapter authority validates the profile but leaves execution disabled", () => {
    assert.equal(mark(box, PAYTR_D, LEASE_D, "test", 2, "validated", "validated"), "validated");
    assert.equal(psql(box, `SELECT status||'|'||(execution_environment IS NULL)||'|'||
      (SELECT pg_catalog.count(*) FROM saas.payment_methods WHERE profile_id='${PAYTR_D}')
      FROM saas.merchant_provider_profiles WHERE id='${PAYTR_D}';`).stdout.trim(), "active|true|0");
  });

  scenario("live activation preserves emergency disablement and exact live config", () => {
    assert.equal(mark(box, PAYTR_E, LEASE_E, "live", 1, "validated", "validated"), "validated");
    assert.equal(psql(box, `SELECT method.state||'|'||method.emergency_reason||'|'||(method.config->>'environment')||'|'||
      (SELECT state FROM saas.payment_methods WHERE id='${OTHER_E}')
      FROM saas.payment_methods method WHERE method.id='${PAYTR_E}';`).stdout.trim(), "emergency_disabled|operator hold|live|active");
  });

  scenario("PayTR activation remains isolated from another store", () => {
    assert.equal(psql(box, `SELECT state FROM saas.payment_methods WHERE id='${OTHER_B}';`).stdout.trim(), "active");
    assert.equal(psql(box, `SELECT pg_catalog.count(*) FROM saas.payment_methods
      WHERE store_id='${STORE_B}' AND state='active' AND kind='provider';`).stdout.trim(), "1");
  });

  await asyncScenario("concurrent test and live validation leaves one active hosted method", async () => {
    const statement = (profile, lease, environment) => `SET ROLE celebix_saas_workflow;
      SELECT outcome FROM saas.paytr_merchant_self_service_mark_verification(
        '${profile}','paytr_iframe','payment_processing','${environment}',1,
        'worker.paytr','${MARKED}','${lease}',1,1,'validated','validated'
      );`;
    const results = await Promise.all([
      concurrentPsql(box, statement(PAYTR_F_TEST, LEASE_F_TEST, "test")),
      concurrentPsql(box, statement(PAYTR_F_LIVE, LEASE_F_LIVE, "live")),
    ]);
    for (const result of results) {
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), "validated");
    }
    assert.equal(psql(box, `SELECT pg_catalog.count(*) FROM saas.payment_methods
      WHERE store_id='${STORE_F}' AND kind='provider' AND state='active';`).stdout.trim(), "1");
    assert.equal(psql(box, `SELECT pg_catalog.count(*) FROM saas.merchant_provider_profiles
      WHERE store_id='${STORE_F}' AND provider_code='paytr_iframe' AND status='active';`).stdout.trim(), "2");
  });

  scenario("only workflow can execute the merchant PayTR finalize boundary", () => {
    const denied = psql(box, `SET ROLE celebix_saas_app;
      SELECT outcome FROM saas.paytr_merchant_self_service_mark_verification(
        '${PAYTR_A}','paytr_iframe','payment_processing','test',1,'worker.paytr',
        '${MARKED}','${LEASE_A}',1,1,'validated','validated'
      );`, DB, true);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /permission denied for function paytr_merchant_self_service_mark_verification/);
  });

  scenario("guarded rollback and reapply preserve the prior schema", () => {
    apply(box, UP, ROLLBACK_DB);
    apply(box, ASSERTIONS, ROLLBACK_DB);
    const blocked = apply(box, DOWN, ROLLBACK_DB, true);
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /PAYTR_MERCHANT_SELF_SERVICE_DOWN_GUARD_REQUIRED/);
    psql(box, `SET celebix.allow_paytr_merchant_self_service_down='on';\n${readFileSync(path.join(SQL, DOWN), "utf8")}`, ROLLBACK_DB);
    assert.equal(psql(box, `SELECT to_regprocedure(
      'saas.paytr_merchant_self_service_mark_verification(uuid,text,text,text,integer,text,timestamp with time zone,uuid,bigint,bigint,text,text)'
    ) IS NULL;`, ROLLBACK_DB).stdout.trim(), "t");
    apply(box, UP, ROLLBACK_DB);
    apply(box, ASSERTIONS, ROLLBACK_DB);
  });

  assert.equal(completed, TOTAL);
  console.log(`PASS ${TOTAL}/${TOTAL} PayTR merchant self-service PostgreSQL rehearsal`);
} finally {
  stop(box);
}
