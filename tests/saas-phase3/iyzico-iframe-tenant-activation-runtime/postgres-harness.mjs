import assert from "node:assert/strict";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;
const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "iyzico_activation_runtime";
const RACE_DB = "iyzico_activation_runtime_race";
const LEASE_DB = "iyzico_activation_runtime_lease";
const ACTIVE_DB = "iyzico_activation_runtime_active";
const ROTATION_DB = "iyzico_activation_runtime_rotation";
const AUTHORITY_DB = "iyzico_activation_runtime_authority";
const ROLLBACK_DB = "iyzico_activation_runtime_rollback";
const CLEAN_DB = "iyzico_activation_runtime_clean";
const DRIFT_DB = "iyzico_activation_runtime_drift";
const UP = "202607280061_iyzico_iframe_tenant_activation_runtime.up.sql";
const DOWN = "202607280061_iyzico_iframe_tenant_activation_runtime.down.sql";
const ASSERTIONS = "202607280061_iyzico_iframe_tenant_activation_runtime_assertions.sql";
const SINGLE_UP = "202607280059_payment_method_single_active_provider.up.sql";
const EVIDENCE_UP = "202607280060_iyzico_iframe_tenant_sandbox_evidence.up.sql";
const FIXTURE = readFileSync(path.join(import.meta.dirname, "fixture.sql"), "utf8");
const prior = JSON.parse(readFileSync(path.join(SQL, "phase3q-quick-order-hosted-payment-bridge-manifest.json"), "utf8"));

const STORE = "10000000-0000-4000-8000-000000000061";
const OTHER_STORE = "10000000-0000-4000-8000-000000000062";
const PRINCIPAL = "20000000-0000-4000-8000-000000000061";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000061";
const OTHER_MEMBERSHIP = "30000000-0000-4000-8000-000000000062";
const PLAN = "00000000-0000-4000-8000-000000000001";
const PROFILE = "40000000-0000-4000-8000-000000000061";
const OTHER_PROFILE = "40000000-0000-4000-8000-000000000062";
const PAYTR_METHOD = "50000000-0000-4000-8000-000000000061";
const COD_METHOD = "50000000-0000-4000-8000-000000000062";
const BANK_METHOD = "50000000-0000-4000-8000-000000000063";
const DIGEST = `sha256:${"a".repeat(64)}`;
const NOW = "2026-07-28T14:05:00.000Z";
const LEASE_NOW = "2026-07-28T14:06:00.000Z";
const LEASE_UNTIL = "2026-07-28T14:11:00.000Z";
const RUN = "60000000-0000-4000-8000-000000000061";
const RUN_2 = "60000000-0000-4000-8000-000000000062";
const LEASE = "61000000-0000-4000-8000-000000000061";
const LEASE_2 = "61000000-0000-4000-8000-000000000062";
const ATTESTATION = "62000000-0000-4000-8000-000000000061";
const WORKER = "iyzico-runtime-worker-1";
const TOTAL = 24;
let completed = 0;

function bin(name) {
  const selected = path.join(PG, name);
  accessSync(selected, constants.X_OK);
  return selected;
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
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  }
  return result;
}

function start() {
  const root = mkdtempSync("/tmp/celebix-iyzico-activation-runtime-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 29_500 + Math.floor(Math.random() * 400);
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

function apply(box, file, database = DB, allowFailure = false) {
  const target = path.join(SQL, file);
  if (!existsSync(target)) throw new Error(`missing required SQL artifact: ${file}`);
  return sql(box, readFileSync(target, "utf8"), database, allowFailure);
}

function pass(label, callback) {
  callback();
  completed += 1;
  process.stdout.write(`PASS ${completed}/${TOTAL} ${label}\n`);
}

async function passAsync(label, callback) {
  await callback();
  completed += 1;
  process.stdout.write(`PASS ${completed}/${TOTAL} ${label}\n`);
}

function authority(store = STORE, now = NOW) {
  const membership = store === STORE ? MEMBERSHIP : OTHER_MEMBERSHIP;
  return `'${store}'::uuid,'${PRINCIPAL}'::uuid,'${membership}'::uuid,'${PLAN}'::uuid,` +
    `'free_starter',1,'${now}'::timestamptz`;
}

function beginCall({ store = STORE, run = RUN, fingerprint = "1".repeat(64), profile = PROFILE,
  profileVersion = 1, credentialVersion = 1, digest = DIGEST, adapterVersion = 7 } = {}) {
  return `SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_begin_current(
    ${authority(store)},'${run}'::uuid,'${fingerprint}','${profile}'::uuid,
    ${profileVersion},${credentialVersion},'${digest}',${adapterVersion}
  )`;
}

function currentCall({ store = STORE, profile = PROFILE, now = "2026-07-28T14:09:00.000Z" } = {}) {
  return `SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_current(
    ${authority(store, now)},'${profile}'::uuid
  )`;
}

function claimNextCall({ worker = WORKER, lease = LEASE, now = LEASE_NOW, until = LEASE_UNTIL } = {}) {
  return `SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_claim_next(
    '${worker}','${lease}'::uuid,'${now}'::timestamptz,'${until}'::timestamptz
  )`;
}

function claimedProfileCall({ run = RUN, lease = LEASE, worker = WORKER, now = LEASE_NOW } = {}) {
  return `SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_claimed_profile(
    '${run}'::uuid,'${lease}'::uuid,'${worker}','${now}'::timestamptz
  )`;
}

function activateCall({ operation = "65000000-0000-4000-8000-000000000061", fingerprint = "9".repeat(64),
  method = PROFILE, expectedVersion = 1 } = {}) {
  return `SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_activate_current(
    ${authority(STORE, "2026-07-28T14:09:00.000Z")},'${operation}'::uuid,'${fingerprint}',
    '${method}'::uuid,${expectedVersion}
  )`;
}

function asRole(box, role, statement, database = DB, allowFailure = false) {
  return sql(box, `SET ROLE ${role}; ${statement};`, database, allowFailure);
}

function row(output) {
  const [outcome, payload] = output.trim().split("|", 2);
  return { outcome, payload: payload ? JSON.parse(payload) : null };
}

const MATRIX = [
  { event: "63000000-0000-4000-8000-000000000011", caseKind: "success", eventKind: "success_captured", attempt: "64000000-0000-4000-8000-000000000011", observation: "1".repeat(64), code: "captured" },
  { event: "63000000-0000-4000-8000-000000000012", caseKind: "decline", eventKind: "declined", attempt: "64000000-0000-4000-8000-000000000012", observation: "2".repeat(64), code: "declined" },
  { event: "63000000-0000-4000-8000-000000000013", caseKind: "controlled_timeout_recovery", eventKind: "timeout_unknown", attempt: "64000000-0000-4000-8000-000000000013", observation: "3".repeat(64), code: "unknown" },
  { event: "63000000-0000-4000-8000-000000000014", caseKind: "controlled_timeout_recovery", eventKind: "timeout_recovered", attempt: "64000000-0000-4000-8000-000000000013", observation: "4".repeat(64), code: "recovered" },
  { event: "63000000-0000-4000-8000-000000000015", caseKind: "callback_replay", eventKind: "callback_original", attempt: "64000000-0000-4000-8000-000000000011", observation: "5".repeat(64), code: "accepted" },
  { event: "63000000-0000-4000-8000-000000000016", caseKind: "callback_replay", eventKind: "callback_replay", attempt: "64000000-0000-4000-8000-000000000011", observation: "5".repeat(64), code: "replayed" },
];

function createAttestation(box, database, { run = RUN, lease = LEASE, attestation = ATTESTATION } = {}) {
  assert.ok(["created", "operation_replayed"].includes(
    row(asRole(box, "celebix_saas_app", beginCall({ run }), database).stdout).outcome,
  ));
  const claimed = row(asRole(box, "celebix_saas_workflow", claimNextCall({ lease }), database).stdout);
  assert.equal(claimed.outcome, "claimed");
  assert.equal(claimed.payload.runId, run);
  for (const entry of MATRIX) {
    const call = `SELECT outcome FROM saas.iyzico_iframe_tenant_evidence_record_event(
      '${run}'::uuid,'${lease}'::uuid,'${WORKER}','${entry.event}'::uuid,
      '${entry.caseKind}','${entry.eventKind}','${entry.attempt}'::uuid,
      '${entry.observation}','${entry.code}','2026-07-28T14:07:00.000Z'::timestamptz
    )`;
    assert.equal(asRole(box, "celebix_saas_workflow", call, database).stdout.trim(), "recorded");
  }
  assert.equal(asRole(box, "celebix_saas_workflow", `SELECT outcome FROM saas.iyzico_iframe_tenant_evidence_finalize(
    '${run}'::uuid,'${lease}'::uuid,'${WORKER}','${attestation}'::uuid,
    '${"2".repeat(64)}','2026-07-28T14:08:00.000Z'::timestamptz
  )`, database).stdout.trim(), "attested");
}

async function concurrentClaim(box, database, worker, lease) {
  const client = new Client({ host: box.socket, port: box.port, user: "postgres", database });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE celebix_saas_workflow");
    const result = await client.query(claimNextCall({ worker, lease }));
    await client.query("COMMIT");
    return result.rows[0]?.outcome;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  let box;
  try {
    box = start();
    sql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const { file } of prior.migrationChain) apply(box, file);
    apply(box, SINGLE_UP);
    sql(box, FIXTURE);
    apply(box, EVIDENCE_UP);
    for (const database of [RACE_DB, LEASE_DB, ACTIVE_DB, ROTATION_DB, AUTHORITY_DB, ROLLBACK_DB, CLEAN_DB, DRIFT_DB]) {
      sql(box, `CREATE DATABASE ${database} TEMPLATE ${DB};`, "postgres");
    }
    for (const database of [DB, RACE_DB, LEASE_DB, ACTIVE_DB, ROTATION_DB, AUTHORITY_DB, ROLLBACK_DB, CLEAN_DB, DRIFT_DB]) {
      apply(box, UP, database);
    }
    apply(box, ASSERTIONS);

    pass("current exposes a safe first-class not_started state", () => {
      const selected = row(asRole(box, "celebix_saas_app", currentCall(), DB).stdout);
      assert.equal(selected.outcome, "not_started");
      assert.deepEqual(Object.keys(selected.payload).sort(), [
        "activationCurrent", "attestationId", "credentialVersion", "methodId", "methodState",
        "methodVersion", "profileId", "profileVersion", "rejectionCode", "runId", "status",
      ]);
      assert.deepEqual(selected.payload, {
        profileId: PROFILE, runId: null, status: null, rejectionCode: null,
        methodId: null, methodVersion: null, methodState: null,
        profileVersion: 1, credentialVersion: 1, attestationId: null, activationCurrent: false,
      });
    });

    pass("begin stages the deterministic disabled method without execution authority", () => {
      const selected = row(asRole(box, "celebix_saas_app", beginCall(), DB).stdout);
      assert.deepEqual(selected, { outcome: "created", payload: {
        runId: RUN, status: "pending", methodId: PROFILE, methodVersion: 1,
        methodState: "disabled", replayed: false,
      } });
      assert.equal(sql(box, `SELECT method.id||'|'||method.profile_id||'|'||method.state||'|'||
        method.config::text||'|'||COALESCE(profile.execution_environment,'none')
        FROM saas.payment_methods AS method JOIN saas.merchant_provider_profiles AS profile
          ON profile.id=method.profile_id WHERE method.id='${PROFILE}'`).stdout.trim(),
      `${PROFILE}|${PROFILE}|disabled|{"environment": "test"}|none`);
    });

    pass("begin replay is exact and mismatch does not create another run", () => {
      const replay = row(asRole(box, "celebix_saas_app", beginCall(), DB).stdout);
      assert.equal(replay.outcome, "operation_replayed");
      assert.equal(replay.payload.replayed, true);
      const mismatch = row(asRole(box, "celebix_saas_app", beginCall({ fingerprint: "8".repeat(64) }), DB).stdout);
      assert.deepEqual(mismatch, { outcome: "operation_mismatch", payload: null });
      assert.equal(sql(box, "SELECT count(*) FROM saas.iyzico_iframe_tenant_evidence_runs").stdout.trim(), "1");
    });

    pass("current reload reports pending without exposing build or event digests", () => {
      const selected = row(asRole(box, "celebix_saas_app", currentCall(), DB).stdout);
      assert.equal(selected.outcome, "current");
      assert.equal(selected.payload.runId, RUN);
      assert.equal(selected.payload.status, "pending");
      assert.equal(selected.payload.methodId, PROFILE);
      assert.equal(selected.payload.activationCurrent, false);
      assert.equal(JSON.stringify(selected.payload).includes("sha256:"), false);
      assert.equal(Object.hasOwn(selected.payload, "candidateEvidenceDigest"), false);
      assert.equal(Object.hasOwn(selected.payload, "matrixDigest"), false);
    });

    pass("current enforces tenant authority", () => {
      const denied = row(asRole(box, "celebix_saas_app", currentCall({ profile: OTHER_PROFILE }), DB).stdout);
      assert.equal(denied.outcome, "profile_not_found");
      assert.equal(denied.payload, null);
    });

    pass("claim_next returns the oldest current run with bounded worker metadata", () => {
      const selected = row(asRole(box, "celebix_saas_workflow", claimNextCall(), DB).stdout);
      assert.equal(selected.outcome, "claimed");
      assert.deepEqual(selected.payload, {
        runId: RUN, storeId: STORE, profileId: PROFILE, adapterVersion: 7,
        candidateEvidenceDigest: DIGEST, profileVersion: 1, credentialVersion: 1,
        leaseId: LEASE, replayed: false,
      });
    });

    pass("claimed_profile exposes the sealed tenant profile only to its live workflow lease", () => {
      const selected = row(asRole(box, "celebix_saas_workflow", claimedProfileCall(), DB).stdout);
      assert.equal(selected.outcome, "current");
      assert.deepEqual(Object.keys(selected.payload).sort(), [
        "capability", "credentialVersion", "profileId", "profileVersion", "providerCode",
        "publicConfig", "sealedCredentials", "storeId",
      ]);
      assert.equal(selected.payload.storeId, STORE);
      assert.equal(selected.payload.profileId, PROFILE);
      assert.equal(selected.payload.providerCode, "iyzico_iframe");
      assert.equal(selected.payload.capability, "payment_processing");
      assert.deepEqual(selected.payload.publicConfig, { environment: "test" });
      assert.equal(selected.payload.sealedCredentials.algorithm, "A256GCM");
      assert.equal(selected.payload.profileVersion, 1);
      assert.equal(selected.payload.credentialVersion, 1);
      const denied = row(asRole(box, "celebix_saas_workflow", claimedProfileCall({ worker: "other-worker" }), DB).stdout);
      assert.deepEqual(denied, { outcome: "lease_lost", payload: null });
    });

    pass("claim_next replays the same live lease and empty work is normal", () => {
      const replay = row(asRole(box, "celebix_saas_workflow", claimNextCall(), DB).stdout);
      assert.equal(replay.outcome, "operation_replayed");
      assert.equal(replay.payload.replayed, true);
      const empty = row(asRole(box, "celebix_saas_workflow", claimNextCall({ lease: LEASE_2, worker: "empty-worker" }), DB).stdout);
      assert.deepEqual(empty, { outcome: "none", payload: null });
    });

    pass("expired leases are reclaimable but live leases are not stealable", () => {
      assert.equal(row(asRole(box, "celebix_saas_app", beginCall(), LEASE_DB).stdout).outcome, "created");
      const first = row(asRole(box, "celebix_saas_workflow", claimNextCall({
        lease: LEASE, now: "2026-07-28T14:06:00.000Z", until: "2026-07-28T14:07:00.000Z",
      }), LEASE_DB).stdout);
      assert.equal(first.outcome, "claimed");
      const live = row(asRole(box, "celebix_saas_workflow", claimNextCall({
        worker: "thief", lease: LEASE_2, now: "2026-07-28T14:06:30.000Z", until: "2026-07-28T14:08:00.000Z",
      }), LEASE_DB).stdout);
      assert.equal(live.outcome, "none");
      const expired = row(asRole(box, "celebix_saas_workflow", claimNextCall({
        worker: "recovery-worker", lease: LEASE_2, now: "2026-07-28T14:08:00.000Z", until: "2026-07-28T14:10:00.000Z",
      }), LEASE_DB).stdout);
      assert.equal(expired.outcome, "claimed");
      assert.equal(expired.payload.runId, RUN);
    });

    await passAsync("claim_next SKIP LOCKED race gives one lease only", async () => {
      assert.equal(row(asRole(box, "celebix_saas_app", beginCall(), RACE_DB).stdout).outcome, "created");
      const outcomes = await Promise.all([
        concurrentClaim(box, RACE_DB, "race-worker-1", LEASE),
        concurrentClaim(box, RACE_DB, "race-worker-2", LEASE_2),
      ]);
      assert.deepEqual([...outcomes].sort(), ["claimed", "none"]);
      assert.equal(sql(box, "SELECT count(*) FROM saas.iyzico_iframe_tenant_evidence_runs WHERE status='leased'", RACE_DB).stdout.trim(), "1");
    });

    pass("workflow completion reloads exact attested current state", () => {
      for (const entry of MATRIX) {
        assert.equal(asRole(box, "celebix_saas_workflow", `SELECT outcome FROM saas.iyzico_iframe_tenant_evidence_record_event(
          '${RUN}'::uuid,'${LEASE}'::uuid,'${WORKER}','${entry.event}'::uuid,
          '${entry.caseKind}','${entry.eventKind}','${entry.attempt}'::uuid,
          '${entry.observation}','${entry.code}','2026-07-28T14:07:00.000Z'::timestamptz
        )`, DB).stdout.trim(), "recorded");
      }
      assert.equal(asRole(box, "celebix_saas_workflow", `SELECT outcome FROM saas.iyzico_iframe_tenant_evidence_finalize(
        '${RUN}'::uuid,'${LEASE}'::uuid,'${WORKER}','${ATTESTATION}'::uuid,
        '${"2".repeat(64)}','2026-07-28T14:08:00.000Z'::timestamptz
      )`, DB).stdout.trim(), "attested");
      const selected = row(asRole(box, "celebix_saas_app", currentCall(), DB).stdout);
      assert.equal(selected.payload.status, "attested");
      assert.equal(selected.payload.attestationId, ATTESTATION);
      assert.equal(selected.payload.activationCurrent, true);
    });

    pass("generic active bypass remains blocked before attested activation", () => {
      assert.equal(row(asRole(box, "celebix_saas_app", beginCall(), ACTIVE_DB).stdout).outcome, "created");
      const bypass = asRole(box, "celebix_saas_app", `SELECT outcome FROM saas.payment_method_set_state(
        ${authority()},'66000000-0000-4000-8000-000000000061'::uuid,'${"6".repeat(64)}',
        '${PROFILE}'::uuid,1,'active',NULL
      )`, ACTIVE_DB, true);
      if (bypass.status === 0) {
        assert.notEqual(row(bypass.stdout).outcome, "state_changed");
      } else {
        assert.match(bypass.stderr, /IYZICO_IFRAME_TENANT_ATTESTATION_REQUIRED_FOR_METHOD_ACTIVATION/);
      }
    });

    pass("activate_current selects the attestation server-side and preserves COD and bank transfer", () => {
      const activated = row(asRole(box, "celebix_saas_app", activateCall(), DB).stdout);
      assert.equal(activated.outcome, "state_changed");
      assert.equal(activated.payload.id, PROFILE);
      assert.equal(activated.payload.state, "active");
      assert.equal(activated.payload.activationAttestationId, ATTESTATION);
      assert.equal(sql(box, `SELECT count(*) FILTER(WHERE kind='provider' AND state='active')||'|'||
        count(*) FILTER(WHERE id IN('${COD_METHOD}','${BANK_METHOD}') AND state='active')
        FROM saas.payment_methods WHERE store_id='${STORE}'`).stdout.trim(), "1|2");
    });

    pass("activate_current operation replay recovers its ledger attestation", () => {
      const replay = row(asRole(box, "celebix_saas_app", activateCall(), DB).stdout);
      assert.equal(replay.outcome, "operation_replayed");
      assert.equal(replay.payload.activationAttestationId, ATTESTATION);
      assert.equal(replay.payload.replayed, true);
    });

    pass("current reports exact active binding only after durable activation", () => {
      const selected = row(asRole(box, "celebix_saas_app", currentCall(), DB).stdout);
      assert.equal(selected.payload.activationCurrent, true);
      assert.equal(selected.payload.methodState, "active");
      assert.equal(selected.payload.methodVersion, 2);
      assert.equal(selected.payload.profileVersion, 2);
    });

    pass("a different active online provider blocks Iyzico but COD and bank transfer do not", () => {
      createAttestation(box, ACTIVE_DB);
      assert.equal(row(asRole(box, "celebix_saas_app", `SELECT outcome,result_payload FROM saas.payment_method_set_state(
        ${authority()},'66000000-0000-4000-8000-000000000062'::uuid,'${"7".repeat(64)}',
        '${PAYTR_METHOD}'::uuid,1,'active',NULL
      )`, ACTIVE_DB).stdout).outcome, "state_changed");
      const rejected = row(asRole(box, "celebix_saas_app", activateCall(), ACTIVE_DB).stdout);
      assert.deepEqual(rejected, { outcome: "provider_already_active", payload: null });
      assert.equal(sql(box, `SELECT count(*) FILTER(WHERE kind='provider' AND state='active')||'|'||
        count(*) FILTER(WHERE id IN('${COD_METHOD}','${BANK_METHOD}') AND state='active')
        FROM saas.payment_methods WHERE store_id='${STORE}'`, ACTIVE_DB).stdout.trim(), "1|2");
    });

    pass("credential rotation invalidates prior activation currentness", () => {
      createAttestation(box, ROTATION_DB);
      assert.equal(row(asRole(box, "celebix_saas_app", activateCall(), ROTATION_DB).stdout).outcome, "state_changed");
      sql(box, `SET ROLE celebix_saas_owner;
        UPDATE saas.payment_methods SET state='disabled',version=version+1,
          updated_at='2026-07-28T14:10:00.000Z' WHERE id='${PROFILE}';
        UPDATE saas.merchant_provider_profiles SET credential_version=credential_version+1,
          execution_environment=NULL,execution_adapter_version=NULL,execution_evidence_digest=NULL,
          version=version+1,updated_at='2026-07-28T14:10:00.000Z' WHERE id='${PROFILE}';`, ROTATION_DB);
      const selected = row(asRole(box, "celebix_saas_app", currentCall({ now: "2026-07-28T14:11:00.000Z" }), ROTATION_DB).stdout);
      assert.equal(selected.payload.status, "attested");
      assert.equal(selected.payload.credentialVersion, 2);
      assert.equal(selected.payload.activationCurrent, false);
    });

    pass("disabled or mismatched global build authority invalidates currentness", () => {
      createAttestation(box, AUTHORITY_DB);
      assert.equal(row(asRole(box, "celebix_saas_app", activateCall(), AUTHORITY_DB).stdout).outcome, "state_changed");
      sql(box, `SET ROLE celebix_saas_owner;
        UPDATE saas.merchant_provider_execution_authorities SET enabled=false
        WHERE provider_code='iyzico_iframe' AND capability='payment_processing' AND environment='test';`, AUTHORITY_DB);
      const selected = row(asRole(box, "celebix_saas_app", currentCall(), AUTHORITY_DB).stdout);
      assert.equal(selected.payload.activationCurrent, false);
    });

    pass("061 functions are least privilege and tables remain inaccessible", () => {
      const privileges = sql(box, `SELECT
        has_function_privilege('celebix_saas_app','saas.iyzico_iframe_tenant_evidence_begin_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,text,integer)','EXECUTE'),
        has_function_privilege('celebix_saas_app','saas.iyzico_iframe_tenant_evidence_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)','EXECUTE'),
        has_function_privilege('celebix_saas_app','saas.iyzico_iframe_tenant_evidence_claim_next(text,uuid,timestamp with time zone,timestamp with time zone)','EXECUTE'),
        has_function_privilege('celebix_saas_workflow','saas.iyzico_iframe_tenant_evidence_claim_next(text,uuid,timestamp with time zone,timestamp with time zone)','EXECUTE'),
        has_function_privilege('celebix_saas_app','saas.iyzico_iframe_tenant_evidence_claimed_profile(uuid,uuid,text,timestamp with time zone)','EXECUTE'),
        has_function_privilege('celebix_saas_workflow','saas.iyzico_iframe_tenant_evidence_claimed_profile(uuid,uuid,text,timestamp with time zone)','EXECUTE'),
        has_function_privilege('celebix_saas_workflow','saas.iyzico_iframe_tenant_evidence_activate_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)','EXECUTE'),
        has_table_privilege('celebix_saas_app','saas.iyzico_iframe_tenant_evidence_runs','SELECT')`).stdout.trim();
      assert.equal(privileges, "t|t|f|t|f|t|f|f");
    });

    pass("activation runtime preflight detects donor ACL drift", () => {
      assert.equal(asRole(box, "celebix_saas_app", "SELECT saas.iyzico_iframe_tenant_activation_runtime_preflight()", DRIFT_DB).stdout.trim(), "t");
      sql(box, `SET ROLE celebix_saas_owner; GRANT EXECUTE ON FUNCTION
        saas.iyzico_iframe_tenant_evidence_begin(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,bigint,text,integer)
        TO PUBLIC;`, DRIFT_DB);
      assert.equal(sql(box, "SELECT saas.iyzico_iframe_tenant_activation_runtime_preflight()", DRIFT_DB).stdout.trim(), "f");
    });

    pass("down refuses evidence runs or active bindings", () => {
      assert.equal(row(asRole(box, "celebix_saas_app", beginCall(), ROLLBACK_DB).stdout).outcome, "created");
      const refused = apply(box, DOWN, ROLLBACK_DB, true);
      assert.notEqual(refused.status, 0);
      assert.match(refused.stderr, /IYZICO_IFRAME_TENANT_ACTIVATION_RUNTIME_STATE_EXISTS/);
      assert.equal(sql(box, "SELECT saas.iyzico_iframe_tenant_activation_runtime_preflight()", ROLLBACK_DB).stdout.trim(), "t");
    });

    pass("clean up down up round trip is reversible", () => {
      apply(box, DOWN, CLEAN_DB);
      assert.equal(sql(box, "SELECT to_regprocedure('saas.iyzico_iframe_tenant_activation_runtime_preflight()') IS NULL", CLEAN_DB).stdout.trim(), "t");
      apply(box, UP, CLEAN_DB);
      apply(box, ASSERTIONS, CLEAN_DB);
    });

    pass("061 assertions and runtime preflight remain green", () => {
      apply(box, ASSERTIONS);
      assert.equal(asRole(box, "celebix_saas_app", "SELECT saas.iyzico_iframe_tenant_activation_runtime_preflight()", DB).stdout.trim(), "t");
      assert.equal(asRole(box, "celebix_saas_workflow", "SELECT saas.iyzico_iframe_tenant_activation_runtime_preflight()", DB).stdout.trim(), "t");
    });

    pass("claim_next rejects malformed or unbounded leases", () => {
      const invalidWorker = row(asRole(box, "celebix_saas_workflow", claimNextCall({ worker: " bad " }), DB).stdout);
      assert.deepEqual(invalidWorker, { outcome: "invalid_input", payload: null });
      const unbounded = row(asRole(box, "celebix_saas_workflow", claimNextCall({
        lease: LEASE_2, now: "2026-07-28T14:06:00.000Z", until: "2026-07-28T14:21:00.001Z",
      }), DB).stdout);
      assert.deepEqual(unbounded, { outcome: "invalid_input", payload: null });
    });

    assert.equal(completed, TOTAL);
    process.stdout.write(`PASS 061 PostgreSQL harness (${completed}/${TOTAL})\n`);
  } finally {
    stop(box);
  }
}

await main();
