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
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const DB = "payment_method_preference_snapshot";
const ROLLBACK_DB = "payment_method_preference_snapshot_rollback";
const UP = "202608120104_payment_method_preference_snapshot.up.sql";
const DOWN = "202608120104_payment_method_preference_snapshot.down.sql";
const ASSERTIONS = "202608120104_payment_method_preference_snapshot_assertions.sql";
const STORE = "10000000-0000-4000-8000-000000000104";
const PROFILE = "40000000-0000-4000-8000-000000000104";
const METHOD = "50000000-0000-4000-8000-000000000104";
const FIRST_ATTEMPT = "60000000-0000-4000-8000-000000000104";
const SECOND_ATTEMPT = "60000000-0000-4000-8000-000000000105";
const NOW = "2026-08-12T12:00:00.000Z";
const FIRST_CONFIG = Object.freeze({
  environment: "test",
  installmentMode: "all",
  locale: "tr",
  maxInstallment: 0,
  threeDSecure: "provider_managed",
});
const SECOND_CONFIG = Object.freeze({
  environment: "test",
  installmentMode: "limited",
  locale: "tr",
  maxInstallment: 6,
  threeDSecure: "provider_managed",
});
const TOTAL = 11;
let completed = 0;

const priorManifest = JSON.parse(
  readFileSync(path.join(SQL, "phase3u-built-in-payment-methods-manifest.json"), "utf8"),
);
const PRIOR = priorManifest.migrationChain.map(({ file }) => file);

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
    // A bundled PostgreSQL installation is optional when PostgreSQL 16 is on PATH.
  }
  for (const directory of directories) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue until an executable PostgreSQL 16 toolchain is found.
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
  const root = mkdtempSync("/tmp/celebix-payment-preference-");
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
    "-h", box.socket,
    "-p", String(box.port),
    "-X", "-qAt",
    "-v", "ON_ERROR_STOP=1",
    "-U", "postgres",
    "-d", database,
  ], source, allowFailure);
}

function apply(box, file, database = DB, allowFailure = false) {
  return psql(box, readFileSync(path.join(SQL, file), "utf8"), database, allowFailure);
}

function scenario(name, run) {
  run();
  completed += 1;
  console.log(`PASS ${completed}/${TOTAL} ${name}`);
}

function seedLegacyProvider(box) {
  const sealedCredentials = JSON.stringify({
    algorithm: "A256GCM",
    ciphertext: "AA",
    iv: "AAAAAAAAAAAAAAAA",
    keyId: "profile-key-104",
    tag: "AAAAAAAAAAAAAAAAAAAAAA",
    version: 1,
  }).replaceAll("'", "''");
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
      VALUES('${STORE}','Preference Snapshot','preference-snapshot','active','tr','TRY','starter','${NOW}','${NOW}');
    INSERT INTO saas.merchant_provider_definitions(provider_code,capability,enabled,created_at)
      VALUES('paytr_iframe','payment_processing',true,'${NOW}')
      ON CONFLICT(provider_code,capability) DO NOTHING;
    INSERT INTO saas.merchant_provider_execution_authorities(
      provider_code,capability,environment,adapter_version,evidence_digest,
      readiness,enabled,approved_at
    ) VALUES(
      'paytr_iframe','payment_processing','test',1,'sha256:${"a".repeat(64)}',
      'sandbox_ready',true,'${NOW}'
    ) ON CONFLICT(provider_code,environment) DO NOTHING;
    INSERT INTO saas.merchant_provider_profiles(
      id,store_id,provider_code,capability,public_config,masked_account_reference,
      sealed_credentials,credential_digest,credential_key_id,credential_schema_version,
      credential_version,status,version,last_validated_at,created_at,updated_at,
      execution_environment,execution_adapter_version,execution_evidence_digest,
      validation_environment,validation_adapter_version
    ) VALUES(
      '${PROFILE}','${STORE}','paytr_iframe','payment_processing','{"environment":"test"}',
      'merchant-***104','${sealedCredentials}'::jsonb,'${"b".repeat(64)}','profile-key-104',1,
      1,'active',1,'${NOW}','${NOW}','${NOW}','test',1,'sha256:${"a".repeat(64)}','test',1
    );
    INSERT INTO saas.payment_methods(
      id,store_id,kind,profile_id,provider_code,label,state,position,config,version,
      created_at,updated_at
    ) VALUES(
      '${METHOD}','${STORE}','provider','${PROFILE}','paytr_iframe','PayTR','active',0,
      '{"environment":"test"}',1,'${NOW}','${NOW}'
    );
    COMMIT;`);
}

function insertAttempt(box, attemptId, createdAt, suppliedConfig = null) {
  const snapshotColumn = suppliedConfig === null ? "" : ",method_config_snapshot";
  const snapshotValue = suppliedConfig === null
    ? ""
    : `,'${JSON.stringify(suppliedConfig).replaceAll("'", "''")}'::jsonb`;
  return psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.payment_attempts(
      id,store_id,payment_method_id,profile_id,provider_code,environment,
      credential_version,order_reference,amount_minor,currency,status,
      safe_provider_reference,safe_code,reconciliation_lease_id,
      reconciliation_lease_owner,reconciliation_lease_expires_at,
      version,created_at,updated_at${snapshotColumn}
    ) VALUES(
      '${attemptId}','${STORE}','${METHOD}','${PROFILE}','paytr_iframe','test',1,
      'order:${attemptId}',10000,'TRY','created',NULL,'attempt_created',NULL,NULL,NULL,
      1,'${createdAt}','${createdAt}'${snapshotValue}
    ); COMMIT;`, DB, suppliedConfig !== null);
}

function readSnapshot(box, attemptId) {
  return JSON.parse(psql(box, `SELECT method_config_snapshot::text FROM saas.payment_attempts WHERE id='${attemptId}';`).stdout.trim());
}

let box;
try {
  box = start();
  psql(box, `CREATE DATABASE ${DB};`, "postgres");
  for (const file of PRIOR) apply(box, file);
  psql(box, `CREATE DATABASE ${ROLLBACK_DB} WITH TEMPLATE ${DB};`, "postgres");

  scenario("PostgreSQL 16 base schema is available", () => {
    assert.match(psql(box, "SHOW server_version;").stdout.trim(), /^16[.]/);
  });

  seedLegacyProvider(box);
  apply(box, UP);
  scenario("104 upgrades the exact legacy provider config and catalog assertions pass", () => {
    apply(box, ASSERTIONS);
    const config = JSON.parse(psql(box, `SELECT config::text FROM saas.payment_methods WHERE id='${METHOD}';`).stdout.trim());
    assert.deepEqual(config, FIRST_CONFIG);
  });

  insertAttempt(box, FIRST_ATTEMPT, NOW);
  scenario("first attempt snapshots the persisted method preference under triggers", () => {
    assert.deepEqual(readSnapshot(box, FIRST_ATTEMPT), FIRST_CONFIG);
    const projection = JSON.parse(psql(box, `SELECT saas.payment_attempt_begin_projection('${FIRST_ATTEMPT}')::text;`).stdout.trim());
    assert.deepEqual(projection.methodConfig, FIRST_CONFIG);
  });

  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
    UPDATE saas.payment_methods SET
      config='${JSON.stringify(SECOND_CONFIG)}'::jsonb,
      version=version+1,
      updated_at='2026-08-12T12:01:00.000Z'
    WHERE id='${METHOD}'; COMMIT;`);
  scenario("persisted method updates cannot rewrite the first immutable snapshot", () => {
    assert.deepEqual(readSnapshot(box, FIRST_ATTEMPT), FIRST_CONFIG);
  });

  insertAttempt(box, SECOND_ATTEMPT, "2026-08-12T12:01:00.000Z");
  scenario("a later attempt receives the new exact persisted preference", () => {
    assert.deepEqual(readSnapshot(box, SECOND_ATTEMPT), SECOND_CONFIG);
  });

  scenario("callers cannot inject a payment preference snapshot", () => {
    const result = insertAttempt(
      box,
      "60000000-0000-4000-8000-000000000106",
      "2026-08-12T12:02:00.000Z",
      FIRST_CONFIG,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PAYMENT_ATTEMPT_METHOD_CONFIG_CALLER_AUTHORITY_FORBIDDEN/);
  });

  scenario("an existing attempt snapshot cannot be mutated", () => {
    const result = psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
      UPDATE saas.payment_attempts SET method_config_snapshot='${JSON.stringify(SECOND_CONFIG)}'::jsonb
      WHERE id='${FIRST_ATTEMPT}'; COMMIT;`, DB, true);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PAYMENT_ATTEMPT_METHOD_CONFIG_IMMUTABLE/);
  });

  scenario("malformed executable-provider preferences remain fail closed", () => {
    const result = psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
      UPDATE saas.payment_methods SET
        config='{"environment":"test","locale":"tr","threeDSecure":"optional","installmentMode":"all","maxInstallment":0}'::jsonb,
        version=version+1,updated_at='2026-08-12T12:02:00.000Z'
      WHERE id='${METHOD}'; COMMIT;`, DB, true);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /payment_methods_provider_preference_check/);
  });

  apply(box, UP, ROLLBACK_DB);
  apply(box, ASSERTIONS, ROLLBACK_DB);
  scenario("rollback requires its explicit local guard", () => {
    const result = apply(box, DOWN, ROLLBACK_DB, true);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PAYMENT_METHOD_PREFERENCE_SNAPSHOT_DOWN_GUARD_REQUIRED/);
  });

  scenario("guarded rollback removes only 104 authority", () => {
    const down = `SET celebix.allow_payment_method_preference_snapshot_down='on';\n${readFileSync(path.join(SQL, DOWN), "utf8")}`;
    psql(box, down, ROLLBACK_DB);
    assert.equal(psql(box, "SELECT to_regprocedure('saas.provider_payment_method_config_valid(text,jsonb)') IS NULL;", ROLLBACK_DB).stdout.trim(), "t");
    assert.equal(psql(box, "SELECT to_regclass('saas.payment_attempts') IS NOT NULL;", ROLLBACK_DB).stdout.trim(), "t");
  });

  scenario("104 reapplies cleanly after guarded rollback", () => {
    apply(box, UP, ROLLBACK_DB);
    apply(box, ASSERTIONS, ROLLBACK_DB);
  });

  assert.equal(completed, TOTAL);
  console.log(`PASS ${TOTAL}/${TOTAL} payment-method preference PostgreSQL rehearsal`);
} finally {
  stop(box);
}
