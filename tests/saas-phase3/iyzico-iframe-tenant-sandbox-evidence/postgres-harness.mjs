import assert from "node:assert/strict";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;
const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "iyzico_tenant_evidence";
const ROTATION_DB = "iyzico_tenant_evidence_rotation";
const ROLLBACK_DB = "iyzico_tenant_evidence_rollback";
const CLEAN_DB = "iyzico_tenant_evidence_clean";
const UP = "202607280060_iyzico_iframe_tenant_sandbox_evidence.up.sql";
const DOWN = "202607280060_iyzico_iframe_tenant_sandbox_evidence.down.sql";
const ASSERTIONS = "202607280060_iyzico_iframe_tenant_sandbox_evidence_assertions.sql";
const SINGLE_UP = "202607280059_payment_method_single_active_provider.up.sql";
const SINGLE_ASSERTIONS = "202607280059_payment_method_single_active_provider_assertions.sql";
const FIXTURE = readFileSync(path.join(import.meta.dirname, "fixture.sql"), "utf8");
const prior = JSON.parse(readFileSync(path.join(SQL, "phase3q-quick-order-hosted-payment-bridge-manifest.json"), "utf8"));

const STORE = "10000000-0000-4000-8000-000000000060";
const OTHER_STORE = "10000000-0000-4000-8000-000000000061";
const PRINCIPAL = "20000000-0000-4000-8000-000000000060";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000060";
const OTHER_MEMBERSHIP = "30000000-0000-4000-8000-000000000061";
const PLAN = "00000000-0000-4000-8000-000000000001";
const PROFILE = "40000000-0000-4000-8000-000000000060";
const OTHER_PROFILE = "40000000-0000-4000-8000-000000000061";
const METHOD = "50000000-0000-4000-8000-000000000060";
const PAYTR_METHOD = "50000000-0000-4000-8000-000000000062";
const DIGEST = `sha256:${"a".repeat(64)}`;
const NOW = "2026-07-28T13:05:00.000Z";
const LEASE_NOW = "2026-07-28T13:06:00.000Z";
const LEASE_UNTIL = "2026-07-28T13:11:00.000Z";
const RUN = "60000000-0000-4000-8000-000000000060";
const LEASE = "61000000-0000-4000-8000-000000000060";
const ATTESTATION = "62000000-0000-4000-8000-000000000060";
const WORKER = "iyzico-evidence-worker-1";
const TOTAL = 17;
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
  const root = mkdtempSync("/tmp/celebix-iyzico-tenant-evidence-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 29_000 + Math.floor(Math.random() * 500);
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

function authority(store = STORE) {
  const membership = store === STORE ? MEMBERSHIP : OTHER_MEMBERSHIP;
  return `'${store}'::uuid,'${PRINCIPAL}'::uuid,'${membership}'::uuid,'${PLAN}'::uuid,` +
    `'free_starter',1,'${NOW}'::timestamptz`;
}

function beginCall({
  store = STORE,
  run = RUN,
  fingerprint = "1".repeat(64),
  profile = PROFILE,
  profileVersion = 1,
  credentialVersion = 1,
  digest = DIGEST,
  adapterVersion = 7,
} = {}) {
  return `SELECT outcome FROM saas.iyzico_iframe_tenant_evidence_begin(
    ${authority(store)},'${run}'::uuid,'${fingerprint}','${profile}'::uuid,
    ${profileVersion},${credentialVersion},'${digest}',${adapterVersion}
  )`;
}

function claimCall(run = RUN, lease = LEASE, worker = WORKER) {
  return `SELECT outcome FROM saas.iyzico_iframe_tenant_evidence_claim(
    '${run}'::uuid,'${worker}','${lease}'::uuid,'${LEASE_NOW}'::timestamptz,
    '${LEASE_UNTIL}'::timestamptz
  )`;
}

function eventCall({ event, caseKind, eventKind, attempt, observation, code }) {
  return `SELECT outcome FROM saas.iyzico_iframe_tenant_evidence_record_event(
    '${RUN}'::uuid,'${LEASE}'::uuid,'${WORKER}','${event}'::uuid,
    '${caseKind}','${eventKind}','${attempt}'::uuid,'${observation}','${code}',
    '2026-07-28T13:07:00.000Z'::timestamptz
  )`;
}

const MATRIX = [
  { event: "63000000-0000-4000-8000-000000000001", caseKind: "success", eventKind: "success_captured", attempt: "64000000-0000-4000-8000-000000000001", observation: "1".repeat(64), code: "captured" },
  { event: "63000000-0000-4000-8000-000000000002", caseKind: "decline", eventKind: "declined", attempt: "64000000-0000-4000-8000-000000000002", observation: "2".repeat(64), code: "declined" },
  { event: "63000000-0000-4000-8000-000000000003", caseKind: "controlled_timeout_recovery", eventKind: "timeout_unknown", attempt: "64000000-0000-4000-8000-000000000003", observation: "3".repeat(64), code: "unknown" },
  { event: "63000000-0000-4000-8000-000000000004", caseKind: "controlled_timeout_recovery", eventKind: "timeout_recovered", attempt: "64000000-0000-4000-8000-000000000003", observation: "4".repeat(64), code: "recovered" },
  { event: "63000000-0000-4000-8000-000000000005", caseKind: "callback_replay", eventKind: "callback_original", attempt: "64000000-0000-4000-8000-000000000004", observation: "5".repeat(64), code: "accepted" },
  { event: "63000000-0000-4000-8000-000000000006", caseKind: "callback_replay", eventKind: "callback_replay", attempt: "64000000-0000-4000-8000-000000000004", observation: "5".repeat(64), code: "replayed" },
];

function asRole(box, role, statement, database = DB, allowFailure = false) {
  return sql(box, `SET ROLE ${role}; ${statement};`, database, allowFailure);
}

function createAttestation(box, database = DB, run = RUN, lease = LEASE, attestation = ATTESTATION) {
  const localMatrix = MATRIX.map((entry) => ({ ...entry }));
  assert.equal(asRole(box, "celebix_saas_app", beginCall({ run }), database).stdout.trim(), "created");
  assert.equal(asRole(box, "celebix_saas_workflow", claimCall(run, lease), database).stdout.trim(), "claimed");
  for (const entry of localMatrix) {
    const call = eventCall(entry).replaceAll(`'${RUN}'::uuid`, `'${run}'::uuid`).replaceAll(`'${LEASE}'::uuid`, `'${lease}'::uuid`);
    assert.equal(asRole(box, "celebix_saas_workflow", call, database).stdout.trim(), "recorded");
  }
  return asRole(box, "celebix_saas_workflow", `SELECT outcome FROM saas.iyzico_iframe_tenant_evidence_finalize(
    '${run}'::uuid,'${lease}'::uuid,'${WORKER}','${attestation}'::uuid,
    '${"2".repeat(64)}','2026-07-28T13:08:00.000Z'::timestamptz
  )`, database).stdout.trim();
}

async function concurrentClaim(box, lease, worker) {
  const client = new Client({ host: box.socket, port: box.port, user: "postgres", database: DB });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE celebix_saas_workflow");
    const result = await client.query(claimCall(RUN, lease, worker));
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
    apply(box, SINGLE_ASSERTIONS);
    sql(box, FIXTURE);
    sql(box, `CREATE DATABASE ${ROTATION_DB} TEMPLATE ${DB};`, "postgres");
    sql(box, `CREATE DATABASE ${ROLLBACK_DB} TEMPLATE ${DB};`, "postgres");
    sql(box, `CREATE DATABASE ${CLEAN_DB} TEMPLATE ${DB};`, "postgres");
    apply(box, UP);
    apply(box, ASSERTIONS);
    apply(box, UP, ROTATION_DB);
    apply(box, UP, ROLLBACK_DB);
    apply(box, UP, CLEAN_DB);

    pass("060 installs FORCE-RLS owner-only evidence relations and exact dependencies", () => {
      assert.equal(sql(box, `SELECT pg_catalog.count(*) FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname='saas'
          AND relation.relname LIKE 'iyzico_iframe_tenant_%'
          AND relation.relkind='r' AND relation.relrowsecurity AND relation.relforcerowsecurity
          AND relation.relowner='celebix_saas_owner'::regrole;`).stdout.trim(), "5");
      assert.equal(asRole(box, "celebix_saas_app", `SELECT saas.iyzico_iframe_tenant_evidence_preflight()`).stdout.trim(), "t");
      assert.equal(asRole(box, "celebix_saas_workflow", `SELECT saas.payment_method_single_active_provider_preflight()`).stdout.trim(), "t");
    });

    pass("migration seeds neither evidence nor platform authority", () => {
      assert.equal(sql(box, `SELECT
        (SELECT count(*) FROM saas.iyzico_iframe_tenant_evidence_runs)||'|'||
        (SELECT count(*) FROM saas.iyzico_iframe_tenant_evidence_attestations)||'|'||
        (SELECT count(*) FROM saas.merchant_provider_execution_authorities);`).stdout.trim(), "0|0|2");
    });

    pass("begin snapshots the exact tenant profile credential and four-case matrix", () => {
      assert.equal(asRole(box, "celebix_saas_app", beginCall()).stdout.trim(), "created");
      assert.equal(sql(box, `SELECT provider_code||'|'||capability||'|'||environment||'|'||adapter_version||'|'||
        profile_version||'|'||credential_version||'|'||candidate_evidence_digest
        FROM saas.iyzico_iframe_tenant_evidence_runs WHERE id='${RUN}';`).stdout.trim(),
        `iyzico_iframe|payment_processing|test|7|1|1|${DIGEST}`);
      assert.equal(sql(box, `SELECT string_agg(case_kind,',' ORDER BY ordinal)
        FROM saas.iyzico_iframe_tenant_evidence_cases WHERE run_id='${RUN}';`).stdout.trim(),
        "success,decline,controlled_timeout_recovery,callback_replay");
    });

    pass("missing cross-store stale or unapproved candidates create no run and no authority", () => {
      const before = sql(box, `SELECT count(*) FROM saas.merchant_provider_execution_authorities;`).stdout.trim();
      const calls = [
        beginCall({ run: "60000000-0000-4000-8000-000000000061", profile: "40000000-0000-4000-8000-000000000099" }),
        beginCall({ run: "60000000-0000-4000-8000-000000000062", profile: OTHER_PROFILE }),
        beginCall({ run: "60000000-0000-4000-8000-000000000063", credentialVersion: 2 }),
        beginCall({ run: "60000000-0000-4000-8000-000000000064", digest: `sha256:${"f".repeat(64)}` }),
      ];
      for (const call of calls) assert.notEqual(asRole(box, "celebix_saas_app", call).stdout.trim(), "created");
      assert.equal(sql(box, `SELECT count(*) FROM saas.iyzico_iframe_tenant_evidence_runs;`).stdout.trim(), "1");
      assert.equal(sql(box, `SELECT count(*) FROM saas.merchant_provider_execution_authorities;`).stdout.trim(), before);
    });

    pass("a disabled Iyzico provider definition cannot start tenant evidence", () => {
      const disabled = sql(box, `BEGIN;
        SET LOCAL ROLE celebix_saas_owner;
        ALTER TABLE saas.merchant_provider_definitions
          DISABLE TRIGGER merchant_provider_definitions_immutable;
        UPDATE saas.merchant_provider_definitions SET enabled=false
        WHERE provider_code='iyzico_iframe' AND capability='payment_processing';
        SET LOCAL ROLE celebix_saas_app;
        ${beginCall({ run: "60000000-0000-4000-8000-000000000068", fingerprint: "8".repeat(64) })};
        ROLLBACK;`).stdout.trim();
      assert.equal(disabled, "provider_disabled");
      assert.equal(sql(box, `SELECT count(*) FROM saas.iyzico_iframe_tenant_evidence_runs;`).stdout.trim(), "1");
    });

    await passAsync("concurrent workers cannot both claim the same run", async () => {
      const first = concurrentClaim(box, LEASE, WORKER);
      await new Promise((resolve) => setTimeout(resolve, 25));
      const second = concurrentClaim(
        box,
        "61000000-0000-4000-8000-000000000061",
        "iyzico-evidence-worker-2",
      );
      assert.deepEqual(await Promise.all([first, second]), ["claimed", "lease_conflict"]);
    });

    pass("event replay is exact and altered duplicate input is rejected", () => {
      const first = MATRIX[0];
      assert.equal(asRole(box, "celebix_saas_workflow", eventCall(first)).stdout.trim(), "recorded");
      assert.equal(asRole(box, "celebix_saas_workflow", eventCall(first)).stdout.trim(), "operation_replayed");
      assert.equal(asRole(box, "celebix_saas_workflow", eventCall({ ...first, observation: "9".repeat(64) })).stdout.trim(), "operation_mismatch");
    });

    pass("the exact success decline timeout-recovery and replay matrix is recorded", () => {
      for (const entry of MATRIX.slice(1)) {
        assert.equal(asRole(box, "celebix_saas_workflow", eventCall(entry)).stdout.trim(), "recorded");
      }
    });

    pass("a forged matrix digest cannot bypass exact attestation finalization", () => {
      const forged = sql(box, `BEGIN;
        SET LOCAL ROLE celebix_saas_owner;
        INSERT INTO saas.iyzico_iframe_tenant_evidence_attestations(
          id,store_id,run_id,profile_id,provider_code,capability,environment,adapter_version,
          candidate_evidence_digest,profile_version,credential_version,matrix_digest,
          finalization_fingerprint,attested_at
        ) VALUES(
          '62000000-0000-4000-8000-000000000099','${STORE}','${RUN}','${PROFILE}',
          'iyzico_iframe','payment_processing','test',7,'${DIGEST}',1,1,
          'sha256:${"f".repeat(64)}','${"9".repeat(64)}','2026-07-28T13:08:00.000Z'
        );
        ROLLBACK;`, DB, true);
      assert.notEqual(forged.status, 0);
      assert.match(forged.stderr, /EXACT_ATTESTATION_REQUIRED/);
    });

    pass("the exact matrix finalizes once with a server-derived digest", () => {
      const finalize = `SELECT outcome FROM saas.iyzico_iframe_tenant_evidence_finalize(
        '${RUN}'::uuid,'${LEASE}'::uuid,'${WORKER}','${ATTESTATION}'::uuid,
        '${"2".repeat(64)}','2026-07-28T13:08:00.000Z'::timestamptz
      )`;
      assert.equal(asRole(box, "celebix_saas_workflow", finalize).stdout.trim(), "attested");
      assert.equal(asRole(box, "celebix_saas_workflow", finalize).stdout.trim(), "operation_replayed");
      assert.equal(sql(box, `SELECT count(*)||'|'||min(matrix_digest) FROM saas.iyzico_iframe_tenant_evidence_attestations;`).stdout.trim().split("|")[0], "1");
    });

    pass("callback witness mismatch rejects a run and prevents finalization", () => {
      const run = "60000000-0000-4000-8000-000000000065";
      const lease = "61000000-0000-4000-8000-000000000065";
      assert.equal(asRole(box, "celebix_saas_app", beginCall({ run, fingerprint: "3".repeat(64) })).stdout.trim(), "created");
      assert.equal(asRole(box, "celebix_saas_workflow", claimCall(run, lease)).stdout.trim(), "claimed");
      const original = eventCall({
        ...MATRIX[4],
        event: "63000000-0000-4000-8000-000000000065",
      }).replaceAll(`'${RUN}'::uuid`, `'${run}'::uuid`).replaceAll(`'${LEASE}'::uuid`, `'${lease}'::uuid`);
      const mismatch = eventCall({
        ...MATRIX[5],
        event: "63000000-0000-4000-8000-000000000066",
        observation: "6".repeat(64),
      }).replaceAll(`'${RUN}'::uuid`, `'${run}'::uuid`).replaceAll(`'${LEASE}'::uuid`, `'${lease}'::uuid`);
      assert.equal(asRole(box, "celebix_saas_workflow", original).stdout.trim(), "recorded");
      assert.equal(asRole(box, "celebix_saas_workflow", mismatch).stdout.trim(), "callback_mismatch");
      assert.equal(sql(box, `SELECT status FROM saas.iyzico_iframe_tenant_evidence_runs WHERE id='${run}';`).stdout.trim(), "rejected");
      assert.equal(sql(box, `SELECT count(*) FROM saas.iyzico_iframe_tenant_evidence_attestations WHERE run_id='${run}';`).stdout.trim(), "0");
    });

    pass("an incomplete event matrix cannot create an attestation", () => {
      const run = "60000000-0000-4000-8000-000000000066";
      const lease = "61000000-0000-4000-8000-000000000066";
      assert.equal(asRole(box, "celebix_saas_app", beginCall({ run, fingerprint: "4".repeat(64) })).stdout.trim(), "created");
      assert.equal(asRole(box, "celebix_saas_workflow", claimCall(run, lease)).stdout.trim(), "claimed");
      const outcome = asRole(box, "celebix_saas_workflow", `SELECT outcome FROM saas.iyzico_iframe_tenant_evidence_finalize(
        '${run}'::uuid,'${lease}'::uuid,'${WORKER}','62000000-0000-4000-8000-000000000066'::uuid,
        '${"4".repeat(64)}','2026-07-28T13:08:00.000Z'::timestamptz
      )`).stdout.trim();
      assert.equal(outcome, "evidence_incomplete");
    });

    pass("credential rotation invalidates otherwise complete evidence", () => {
      assert.equal(createAttestation(box, ROTATION_DB), "attested");
      sql(box, `SET ROLE celebix_saas_owner;
        UPDATE saas.merchant_provider_profiles SET credential_version=2,version=2,
          credential_digest=repeat('8',64),status='pending_validation',last_validated_at=NULL,
          updated_at='2026-07-28T13:09:00.000Z'
        WHERE id='${PROFILE}';`, ROTATION_DB);
      const activate = asRole(box, "celebix_saas_app", `SELECT outcome FROM saas.iyzico_iframe_tenant_evidence_activate(
        ${authority(STORE)},'65000000-0000-4000-8000-000000000060'::uuid,'${"5".repeat(64)}',
        '${METHOD}'::uuid,1,'${ATTESTATION}'::uuid,1
      )`, ROTATION_DB).stdout.trim();
      assert.equal(activate, "stale_evidence");
      assert.equal(sql(box, `SELECT state FROM saas.payment_methods WHERE id='${METHOD}';`, ROTATION_DB).stdout.trim(), "disabled");
    });

    pass("direct binding and generic set-state cannot bypass the attested handshake", () => {
      const bind = sql(box, `SET ROLE celebix_saas_owner;
        SELECT saas.merchant_provider_profile_bind_execution_authority(
          '${OTHER_PROFILE}'::uuid,'iyzico_iframe','payment_processing','test',7,'${DIGEST}',
          '${NOW}'::timestamptz,1
        );`, DB, true);
      assert.notEqual(bind.status, 0);
      const bypass = sql(box, `SET ROLE celebix_saas_owner;
        UPDATE saas.payment_methods SET state='active',version=version+1,
          updated_at='${NOW}'::timestamptz
        WHERE id='50000000-0000-4000-8000-000000000061';`, DB, true);
      assert.notEqual(bypass.status, 0);
    });

    pass("current attestation atomically binds and activates with one immutable operation", () => {
      const activate = `SELECT outcome FROM saas.iyzico_iframe_tenant_evidence_activate(
        ${authority(STORE)},'65000000-0000-4000-8000-000000000060'::uuid,'${"5".repeat(64)}',
        '${METHOD}'::uuid,1,'${ATTESTATION}'::uuid,1
      )`;
      assert.equal(asRole(box, "celebix_saas_app", activate).stdout.trim(), "state_changed");
      assert.equal(asRole(box, "celebix_saas_app", activate).stdout.trim(), "operation_replayed");
      assert.equal(sql(box, `SELECT method.state||'|'||profile.execution_environment||'|'||
        profile.execution_adapter_version||'|'||profile.execution_evidence_digest
        FROM saas.payment_methods AS method JOIN saas.merchant_provider_profiles AS profile
          ON profile.id=method.profile_id WHERE method.id='${METHOD}';`).stdout.trim(),
        `active|test|7|${DIGEST}`);
      assert.equal(sql(box, `SELECT count(*) FROM saas.payment_method_operations
        WHERE operation_id='65000000-0000-4000-8000-000000000060';`).stdout.trim(), "1");
    });

    pass("059 exclusivity returns a stable conflict without a partial Iyzico bind", () => {
      const run = "60000000-0000-4000-8000-000000000067";
      const lease = "61000000-0000-4000-8000-000000000067";
      const attestation = "62000000-0000-4000-8000-000000000067";
      assert.equal(createAttestation(box, ROLLBACK_DB, run, lease, attestation), "attested");
      assert.equal(asRole(box, "celebix_saas_app", `SELECT outcome FROM saas.payment_method_set_state(
        ${authority(STORE)},'65000000-0000-4000-8000-000000000062'::uuid,'${"7".repeat(64)}',
        '${PAYTR_METHOD}'::uuid,1,'active',NULL
      )`, ROLLBACK_DB).stdout.trim(), "state_changed");
      const outcome = asRole(box, "celebix_saas_app", `SELECT outcome FROM saas.iyzico_iframe_tenant_evidence_activate(
        ${authority(STORE)},'65000000-0000-4000-8000-000000000063'::uuid,'${"8".repeat(64)}',
        '${METHOD}'::uuid,1,'${attestation}'::uuid,1
      )`, ROLLBACK_DB).stdout.trim();
      assert.equal(outcome, "provider_already_active");
      assert.equal(sql(box, `SELECT state||'|'||COALESCE(profile.execution_environment,'none')
        FROM saas.payment_methods AS method JOIN saas.merchant_provider_profiles AS profile
          ON profile.id=method.profile_id WHERE method.id='${METHOD}';`, ROLLBACK_DB).stdout.trim(), "disabled|none");
    });

    pass("rollback refuses evidence-bearing databases and succeeds when evidence is absent", () => {
      apply(box, ASSERTIONS);
      const guarded = apply(box, DOWN, DB, true);
      assert.notEqual(guarded.status, 0);
      assert.match(guarded.stderr, /EVIDENCE_EXISTS/);
      apply(box, DOWN, CLEAN_DB);
      assert.equal(sql(box, `SELECT pg_catalog.to_regclass('saas.iyzico_iframe_tenant_evidence_runs') IS NULL;`, CLEAN_DB).stdout.trim(), "t");
      apply(box, UP, CLEAN_DB);
      apply(box, ASSERTIONS, CLEAN_DB);
    });

    assert.equal(completed, TOTAL);
  } finally {
    stop(box);
  }
}

await main();
