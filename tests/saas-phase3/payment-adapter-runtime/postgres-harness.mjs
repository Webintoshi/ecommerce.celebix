import assert from "node:assert/strict";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "payment_adapter_runtime";
const EMPTY_DB = "payment_adapter_runtime_empty";
const NOW = "2026-07-27T12:00:00.000Z";
const LATER = "2026-07-27T12:01:00.000Z";
const STORE = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const ACTIVE_PROFILE = "40000000-0000-4000-8000-000000000001";
const DISABLED_PROFILE = "40000000-0000-4000-8000-000000000002";
const FOREIGN_PROFILE = "40000000-0000-4000-8000-000000000003";
const ACTIVE_METHOD = "50000000-0000-4000-8000-000000000001";
const DISABLED_METHOD = "50000000-0000-4000-8000-000000000002";
const EMERGENCY_METHOD = "50000000-0000-4000-8000-000000000003";
const INACTIVE_PROFILE_METHOD = "50000000-0000-4000-8000-000000000004";
const FOREIGN_METHOD = "50000000-0000-4000-8000-000000000005";
const CAPTURED_ATTEMPT = "60000000-0000-4000-8000-000000000001";
const UNKNOWN_ATTEMPT = "60000000-0000-4000-8000-000000000002";
const FAILED_ATTEMPT = "60000000-0000-4000-8000-000000000003";
const EXPIRED_ATTEMPT = "60000000-0000-4000-8000-000000000004";
const CALLBACK_DIGEST = "a".repeat(64);
const UNKNOWN_CALLBACK_DIGEST = "b".repeat(64);
const FINGERPRINT = "c".repeat(64);
const CREDENTIAL_VERSION = 1;
const AMOUNT = 10_000;
const CURRENCY = "TRY";

const previousManifest = JSON.parse(
  readFileSync(path.join(SQL, "phase3j-payment-method-admin-manifest.json"), "utf8"),
);
const PRIOR = previousManifest.migrationChain.map(({ file }) => file);
const ASSERTION_SQL = readFileSync(
  path.join(SQL, "202607270052_payment_adapter_runtime_assertions.sql"),
  "utf8",
);

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
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

function start() {
  const executables = Object.fromEntries(
    ["initdb", "pg_ctl", "psql"].map((name) => [name, executable(name)]),
  );
  const root = mkdtempSync("/tmp/celebix-payment-adapter-runtime-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 20_000 + Math.floor(Math.random() * 15_000);
  mkdirSync(socket, { mode: 0o700 });
  command(executables.initdb, [
    "-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8",
  ]);
  command(executables.pg_ctl, [
    "-D", data, "-o", `-k ${socket} -p ${port} -h ''`,
    "-l", path.join(root, "postgres.log"), "start",
  ]);
  return { executables, root, data, socket, port };
}

function stop(box) {
  if (!box) return;
  command(box.executables.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], { allowFailure: true });
  rmSync(box.root, { recursive: true, force: true });
}

function psql(box, source, database = DB, allowFailure = false) {
  return command(box.executables.psql, [
    "-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], { input: source, allowFailure });
}

function psqlAsync(box, source, database = DB) {
  return new Promise((resolve, reject) => {
    const child = spawn(box.executables.psql, [
      "-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
      "-U", "postgres", "-d", database,
    ], {
      cwd: ROOT,
      env: { ...process.env, LC_ALL: "C", LANG: "C" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (value) => { stdout += value; });
    child.stderr.setEncoding("utf8").on("data", (value) => { stderr += value; });
    child.once("error", reject);
    child.once("close", (status) => {
      if (status === 0) resolve({ stdout, stderr });
      else reject(new Error(`psql failed\n${stderr}`));
    });
    child.stdin.end(source);
  });
}

function apply(box, file, database = DB) {
  psql(box, readFileSync(path.join(SQL, file), "utf8"), database);
}

function assertAssertionDriftRejected(box, mutation, expected) {
  const result = psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
${mutation}
${ASSERTION_SQL}`, DB, true);
  assert.notEqual(result.status, 0, mutation);
  assert.match(result.stderr, expected);
}

function call(box, name, args, database = DB) {
  const result = psql(box, `SET ROLE celebix_saas_workflow;
SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
FROM saas.${name}(${args});`, database);
  return JSON.parse(result.stdout.trim());
}

async function callAsync(box, name, args, database = DB) {
  const result = await psqlAsync(box, `SET ROLE celebix_saas_workflow;
SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
FROM saas.${name}(${args});`, database);
  return JSON.parse(result.stdout.trim());
}

function begin(box, {
  attemptId,
  methodId = ACTIVE_METHOD,
  storeId = STORE,
  fingerprint = FINGERPRINT,
  bindingDigest = CALLBACK_DIGEST,
  orderReference = `order:${attemptId}`,
  amount = AMOUNT,
  currency = CURRENCY,
} = {}) {
  return call(box, "payment_attempt_begin", [
    `'${storeId}'`, `'${NOW}'`, `'${attemptId}'`, `'${fingerprint}'`, `'${methodId}'`,
    `'${orderReference}'`, amount, `'${currency}'`, `'${bindingDigest}'`,
  ].join(","));
}

function initialized(box, {
  attemptId,
  operationId,
  fingerprint = FINGERPRINT,
  expectedVersion,
  credentialVersion = CREDENTIAL_VERSION,
  status,
  providerReference = null,
  safeCode,
  now = LATER,
} = {}) {
  return call(box, "payment_attempt_mark_initialized", [
    `'${attemptId}'`, `'${operationId}'`, `'${fingerprint}'`, expectedVersion,
    credentialVersion, `'${status}'`,
    providerReference === null ? "NULL" : `'${providerReference}'`,
    `'${safeCode}'`, `'${now}'`,
  ].join(","));
}

function markUnknown(box, {
  attemptId,
  operationId,
  fingerprint = FINGERPRINT,
  expectedVersion,
  credentialVersion = CREDENTIAL_VERSION,
  providerReference = null,
  safeCode = "transport_outcome_unknown",
  now = LATER,
} = {}) {
  return call(box, "payment_attempt_mark_unknown", [
    `'${attemptId}'`, `'${operationId}'`, `'${fingerprint}'`, expectedVersion,
    credentialVersion, providerReference === null ? "NULL" : `'${providerReference}'`,
    `'${safeCode}'`, `'${now}'`,
  ].join(","));
}

function callbackAuthority(box, digest = CALLBACK_DIGEST, providerCode = "paytr_iframe") {
  return call(box, "payment_callback_authority", `'${providerCode}','${digest}','${LATER}'`);
}

function settle(box, {
  digest = CALLBACK_DIGEST,
  operationId,
  fingerprint = FINGERPRINT,
  eventDigest,
  expectedVersion,
  credentialVersion = CREDENTIAL_VERSION,
  status,
  providerReference = "provider-ref-1",
  safeCode,
  amount = AMOUNT,
  currency = CURRENCY,
  now = LATER,
} = {}) {
  return call(box, "payment_attempt_settle_callback", [
    "'paytr_iframe'", `'${digest}'`, `'${operationId}'`, `'${fingerprint}'`,
    `'${eventDigest}'`, expectedVersion, credentialVersion, `'${status}'`,
    providerReference === null ? "NULL" : `'${providerReference}'`,
    `'${safeCode}'`, amount, `'${currency}'`, `'${now}'`,
  ].join(","));
}

function claimArguments({
  attemptId = UNKNOWN_ATTEMPT,
  operationId = "71000000-0000-4000-8000-000000000001",
  fingerprint = FINGERPRINT,
  expectedVersion,
  workerId = "worker.reconcile",
  leaseId = "72000000-0000-4000-8000-000000000001",
  now = LATER,
  leaseExpiresAt = "2026-07-27T12:06:00.000Z",
} = {}) {
  return [
    `'${attemptId}'`, `'${operationId}'`, `'${fingerprint}'`, expectedVersion,
    `'${workerId}'`, `'${leaseId}'`, `'${now}'`, `'${leaseExpiresAt}'`,
  ].join(",");
}

function claim(box, input = {}) {
  return call(box, "payment_attempt_claim_reconciliation", claimArguments(input));
}

function claimAsync(box, input = {}) {
  return callAsync(box, "payment_attempt_claim_reconciliation", claimArguments(input));
}

function finalize(box, {
  attemptId = UNKNOWN_ATTEMPT,
  operationId = "73000000-0000-4000-8000-000000000001",
  fingerprint = FINGERPRINT,
  expectedVersion,
  workerId = "worker.reconcile",
  leaseId = "72000000-0000-4000-8000-000000000001",
  credentialVersion = CREDENTIAL_VERSION,
  status = "captured",
  providerReference = "provider-ref-reconciled",
  safeCode = "query_captured",
  amount = AMOUNT,
  currency = CURRENCY,
  now = "2026-07-27T12:02:00.000Z",
} = {}) {
  return call(box, "payment_attempt_finalize_reconciliation", [
    `'${attemptId}'`, `'${operationId}'`, `'${fingerprint}'`, expectedVersion,
    `'${workerId}'`, `'${leaseId}'`, credentialVersion, `'${status}'`,
    providerReference === null ? "NULL" : `'${providerReference}'`,
    `'${safeCode}'`, amount, `'${currency}'`, `'${now}'`,
  ].join(","));
}

function envelope(ordinal) {
  return JSON.stringify({
    algorithm: "A256GCM",
    ciphertext: Buffer.from(`opaque-${ordinal}`).toString("base64url"),
    iv: "AQEBAQEBAQEBAQEB",
    keyId: "provider.current",
    tag: "AgICAgICAgICAgICAgICAg",
    version: 1,
  }).replaceAll("'", "''");
}

function seed(box) {
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
('${STORE}','Runtime A','runtime-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
('${STORE_B}','Runtime B','runtime-b','active','tr','TRY','default','2026-01-01','2026-01-01');
INSERT INTO saas.merchant_provider_definitions(provider_code,capability,enabled,created_at) VALUES
('paytr_iframe','payment_processing',true,'${NOW}'),
('paytr_disabled','payment_processing',true,'${NOW}');
INSERT INTO saas.merchant_provider_profiles(
 id,store_id,provider_code,capability,public_config,masked_account_reference,sealed_credentials,
 credential_digest,credential_key_id,credential_schema_version,credential_version,status,version,
 last_validated_at,created_at,updated_at,revoked_at
) VALUES
('${ACTIVE_PROFILE}','${STORE}','paytr_iframe','payment_processing','{"environment":"test","merchantId":"fixture"}','••••active','${envelope(1)}','${"1".repeat(64)}','provider.current',1,1,'active',1,'${NOW}','${NOW}','${NOW}',NULL),
('${DISABLED_PROFILE}','${STORE}','paytr_disabled','payment_processing','{"environment":"test","merchantId":"disabled"}','••••disabled','${envelope(2)}','${"2".repeat(64)}','provider.current',1,1,'disabled',1,NULL,'${NOW}','${NOW}',NULL),
('${FOREIGN_PROFILE}','${STORE_B}','paytr_iframe','payment_processing','{"environment":"test","merchantId":"foreign"}','••••foreign','${envelope(3)}','${"3".repeat(64)}','provider.current',1,1,'active',1,'${NOW}','${NOW}','${NOW}',NULL);
INSERT INTO saas.payment_methods(
 id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,
 position,config,version,created_at,updated_at
) VALUES
('${ACTIVE_METHOD}','${STORE}','provider','${ACTIVE_PROFILE}','paytr_iframe','PayTR','active',NULL,0,'{}',1,'${NOW}','${NOW}'),
('${DISABLED_METHOD}','${STORE}','provider','${ACTIVE_PROFILE}','paytr_iframe','Disabled','disabled',NULL,1,'{}',1,'${NOW}','${NOW}'),
('${EMERGENCY_METHOD}','${STORE}','provider','${ACTIVE_PROFILE}','paytr_iframe','Emergency','emergency_disabled','Provider outage',2,'{}',1,'${NOW}','${NOW}'),
('${INACTIVE_PROFILE_METHOD}','${STORE}','provider','${DISABLED_PROFILE}','paytr_disabled','Inactive profile','active',NULL,3,'{}',1,'${NOW}','${NOW}'),
('${FOREIGN_METHOD}','${STORE_B}','provider','${FOREIGN_PROFILE}','paytr_iframe','Foreign','active',NULL,0,'{}',1,'${NOW}','${NOW}');
COMMIT;`);
}

const HISTORY_FINGERPRINT_SQL = `SELECT pg_catalog.md5(pg_catalog.string_agg(definition,E'\\n' ORDER BY definition))
FROM (
  SELECT 'column:'||column_name||':'||data_type||':'||is_nullable||':'||COALESCE(column_default,'')
  FROM information_schema.columns
  WHERE table_schema='saas' AND table_name='checkout_payment_attempts'
  UNION ALL
  SELECT 'constraint:'||conname||':'||pg_catalog.pg_get_constraintdef(oid)
  FROM pg_catalog.pg_constraint WHERE conrelid='saas.checkout_payment_attempts'::regclass
) AS preserved(definition);`;

const TOTAL = 30;
let count = 0;
async function scenario(name, run) {
  await run();
  count += 1;
  console.log(`PASS ${count}/${TOTAL} ${name}`);
}

async function main() {
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const file of PRIOR) apply(box, file);
    psql(box, `CREATE DATABASE ${EMPTY_DB} WITH TEMPLATE ${DB};`, "postgres");
    seed(box);
    const historicalBefore = psql(box, HISTORY_FINGERPRINT_SQL).stdout.trim();
    apply(box, "202607270052_payment_adapter_runtime.up.sql");

    await scenario("PostgreSQL 16 and 052 assertions pass", () => {
      assert.match(psql(box, "SHOW server_version;").stdout.trim(), /^16[.]/);
      apply(box, "202607270052_payment_adapter_runtime_assertions.sql");
    });

    await scenario("052 assertions reject exact relation ACL drift for browser-like roles", () => {
      assertAssertionDriftRejected(
        box,
        "GRANT SELECT ON saas.payment_attempt_operations TO celebix_saas_identity;",
        /PAYMENT_ADAPTER_RUNTIME_RELATION_ACL_INVALID/,
      );
    });

    await scenario("052 assertions reject function search_path and exact body drift", () => {
      assertAssertionDriftRejected(
        box,
        `ALTER FUNCTION saas.payment_attempt_claim_reconciliation(
          uuid,uuid,text,bigint,text,uuid,timestamptz,timestamptz
        ) SET search_path=public;`,
        /PAYMENT_ADAPTER_RUNTIME_FUNCTION_METADATA_INVALID/,
      );
      assertAssertionDriftRejected(
        box,
        `CREATE OR REPLACE FUNCTION saas.payment_attempt_mutation_projection(
          p_attempt_id uuid,p_replayed boolean
        ) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas
        AS $drift$ SELECT '{}'::jsonb $drift$;`,
        /PAYMENT_ADAPTER_RUNTIME_FUNCTION_DEFINITION_INVALID/,
      );
    });

    await scenario("052 assertions reject exact immutable-trigger drift", () => {
      assertAssertionDriftRejected(
        box,
        "ALTER TABLE saas.payment_attempt_events DISABLE TRIGGER payment_attempt_events_immutable;",
        /PAYMENT_ADAPTER_RUNTIME_TRIGGER_INVALID/,
      );
    });

    await scenario("relations are owner-scoped forced-RLS and preserve checkout authority", () => {
      assert.equal(psql(box, `SELECT count(*) FROM pg_catalog.pg_class relation
JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
JOIN pg_catalog.pg_roles owner_role ON owner_role.oid=relation.relowner
WHERE namespace.nspname='saas' AND relation.relname IN(
'payment_attempts','payment_attempt_events','payment_callback_bindings','payment_attempt_operations')
AND relation.relrowsecurity AND relation.relforcerowsecurity AND owner_role.rolname='celebix_saas_owner';`).stdout.trim(), "4");
      assert.equal(psql(box, HISTORY_FINGERPRINT_SQL).stdout.trim(), historicalBefore);
    });

    let capturedVersion;
    await scenario("begin snapshots exact active method profile and environment authority", () => {
      const created = begin(box, { attemptId: CAPTURED_ATTEMPT });
      assert.equal(created.outcome, "created");
      assert.deepEqual(Object.keys(created.result).sort(), [
        "amountMinor", "attemptId", "credentialVersion", "currency", "environment",
        "paymentMethodId", "profileId", "providerCode", "publicConfig", "sealedCredentials", "storeId",
      ]);
      assert.equal(created.result.environment, "test");
      assert.equal(created.result.credentialVersion, 1);
      assert.equal(created.result.amountMinor, AMOUNT);
      assert.equal(JSON.stringify(created.result).includes(CALLBACK_DIGEST), false);
      capturedVersion = 1;
    });

    await scenario("begin replay is exact and duplicate command mismatch fails closed", () => {
      const replay = begin(box, { attemptId: CAPTURED_ATTEMPT });
      assert.equal(replay.outcome, "operation_replayed");
      assert.equal(replay.result.attemptId, CAPTURED_ATTEMPT);
      assert.equal(begin(box, { attemptId: CAPTURED_ATTEMPT, fingerprint: "d".repeat(64) }).outcome, "operation_mismatch");
      assert.equal(psql(box, `SELECT count(*) FROM saas.payment_attempts WHERE id='${CAPTURED_ATTEMPT}';`).stdout.trim(), "1");
    });

    await scenario("disabled and emergency-disabled methods cannot begin", () => {
      assert.equal(begin(box, { attemptId: "60000000-0000-4000-8000-000000000010", methodId: DISABLED_METHOD, bindingDigest: "1".repeat(64) }).outcome, "payment_method_inactive");
      assert.equal(begin(box, { attemptId: "60000000-0000-4000-8000-000000000011", methodId: EMERGENCY_METHOD, bindingDigest: "2".repeat(64) }).outcome, "payment_method_inactive");
    });

    await scenario("cross-store methods and non-active profiles cannot begin", () => {
      assert.equal(begin(box, { attemptId: "60000000-0000-4000-8000-000000000012", methodId: FOREIGN_METHOD, bindingDigest: "3".repeat(64) }).outcome, "payment_method_not_found");
      assert.equal(begin(box, { attemptId: "60000000-0000-4000-8000-000000000013", methodId: INACTIVE_PROFILE_METHOD, bindingDigest: "4".repeat(64) }).outcome, "profile_not_active");
    });

    await scenario("skipped state stale version and credential mismatch write nothing", () => {
      assert.equal(initialized(box, {
        attemptId: CAPTURED_ATTEMPT, operationId: "70000000-0000-4000-8000-000000000001",
        expectedVersion: 1, status: "submitted", safeCode: "submitted",
      }).outcome, "invalid_transition");
      assert.equal(initialized(box, {
        attemptId: CAPTURED_ATTEMPT, operationId: "70000000-0000-4000-8000-000000000002",
        expectedVersion: 2, status: "awaiting_customer", safeCode: "iframe_ready",
      }).outcome, "version_conflict");
      assert.equal(initialized(box, {
        attemptId: CAPTURED_ATTEMPT, operationId: "70000000-0000-4000-8000-000000000003",
        expectedVersion: 1, credentialVersion: 2, status: "awaiting_customer", safeCode: "iframe_ready",
      }).outcome, "credential_version_mismatch");
    });

    await scenario("created transitions to awaiting_customer", () => {
      const result = initialized(box, {
        attemptId: CAPTURED_ATTEMPT, operationId: "70000000-0000-4000-8000-000000000004",
        expectedVersion: capturedVersion, status: "awaiting_customer",
        providerReference: "provider-ref-1", safeCode: "iframe_ready",
      });
      assert.equal(result.outcome, "awaiting_customer");
      capturedVersion = result.result.version;
    });

    await scenario("awaiting_customer transitions to submitted", () => {
      const result = initialized(box, {
        attemptId: CAPTURED_ATTEMPT, operationId: "70000000-0000-4000-8000-000000000005",
        expectedVersion: capturedVersion, status: "submitted",
        providerReference: "provider-ref-1", safeCode: "customer_submitted",
      });
      assert.equal(result.outcome, "submitted");
      capturedVersion = result.result.version;
    });

    await scenario("callback authority resolves only provider plus opaque digest", () => {
      const authority = callbackAuthority(box);
      assert.equal(authority.outcome, "found");
      assert.equal(authority.result.attemptId, CAPTURED_ATTEMPT);
      assert.equal(authority.result.storeId, STORE);
      assert.equal(authority.result.orderReference, `order:${CAPTURED_ATTEMPT}`);
      assert.equal(authority.result.sealedCredentials.algorithm, "A256GCM");
      assert.equal(JSON.stringify(authority.result).includes(CALLBACK_DIGEST), false);
    });

    await scenario("unknown callback and callback fact mismatches fail closed", () => {
      assert.equal(callbackAuthority(box, UNKNOWN_CALLBACK_DIGEST).outcome, "not_found");
      assert.equal(settle(box, {
        digest: UNKNOWN_CALLBACK_DIGEST, operationId: "70000000-0000-4000-8000-000000000006",
        eventDigest: "5".repeat(64), expectedVersion: capturedVersion,
        status: "captured", safeCode: "captured",
      }).outcome, "callback_not_found");
      assert.equal(settle(box, {
        operationId: "70000000-0000-4000-8000-000000000007",
        eventDigest: "6".repeat(64), expectedVersion: capturedVersion,
        credentialVersion: 2, status: "captured", safeCode: "captured",
      }).outcome, "credential_version_mismatch");
      assert.equal(settle(box, {
        operationId: "70000000-0000-4000-8000-000000000008",
        eventDigest: "7".repeat(64), expectedVersion: capturedVersion,
        status: "captured", safeCode: "captured", amount: AMOUNT + 1,
      }).outcome, "amount_mismatch");
      assert.equal(settle(box, {
        operationId: "70000000-0000-4000-8000-000000000009",
        eventDigest: "8".repeat(64), expectedVersion: capturedVersion,
        status: "captured", safeCode: "captured", currency: "USD",
      }).outcome, "currency_mismatch");
    });

    const captureEvent = "9".repeat(64);
    await scenario("submitted transitions to captured only through verified callback facts", () => {
      const result = settle(box, {
        operationId: "70000000-0000-4000-8000-000000000010",
        eventDigest: captureEvent, expectedVersion: capturedVersion,
        status: "captured", safeCode: "captured",
      });
      assert.equal(result.outcome, "captured");
      capturedVersion = result.result.version;
    });

    await scenario("callback replay is idempotent and changed replay facts are rejected", () => {
      const replay = settle(box, {
        operationId: "70000000-0000-4000-8000-000000000011",
        eventDigest: captureEvent, expectedVersion: capturedVersion,
        status: "captured", safeCode: "captured",
      });
      assert.equal(replay.outcome, "callback_replayed");
      assert.equal(replay.result.status, "captured");
      assert.equal(settle(box, {
        operationId: "70000000-0000-4000-8000-000000000012",
        fingerprint: "e".repeat(64), eventDigest: captureEvent, expectedVersion: capturedVersion,
        status: "captured", safeCode: "changed",
      }).outcome, "callback_replay_mismatch");
    });

    await scenario("captured transitions to partially_refunded then refunded", () => {
      const partial = settle(box, {
        operationId: "70000000-0000-4000-8000-000000000013",
        eventDigest: "a1".repeat(32), expectedVersion: capturedVersion,
        status: "partially_refunded", safeCode: "partial_refund",
      });
      assert.equal(partial.outcome, "partially_refunded");
      const refunded = settle(box, {
        operationId: "70000000-0000-4000-8000-000000000014",
        eventDigest: "a2".repeat(32), expectedVersion: partial.result.version,
        status: "refunded", safeCode: "full_refund",
      });
      assert.equal(refunded.outcome, "refunded");
    });

    let unknownVersion;
    await scenario("created transitions durably to provider_outcome_unknown", () => {
      assert.equal(begin(box, {
        attemptId: UNKNOWN_ATTEMPT, bindingDigest: "f".repeat(64),
      }).outcome, "created");
      const result = markUnknown(box, {
        attemptId: UNKNOWN_ATTEMPT, operationId: "71000000-0000-4000-8000-000000000010",
        expectedVersion: 1,
      });
      assert.equal(result.outcome, "provider_outcome_unknown");
      unknownVersion = result.result.version;
    });

    let reconciliation;
    await scenario("unknown attempt is claimed into reconciliation_required with exact credential authority", () => {
      reconciliation = claim(box, { expectedVersion: unknownVersion });
      assert.equal(reconciliation.outcome, "claimed");
      assert.equal(reconciliation.result.status, "reconciliation_required");
      assert.equal(reconciliation.result.credentialVersion, 1);
      assert.equal(reconciliation.result.sealedCredentials.algorithm, "A256GCM");
      unknownVersion = reconciliation.result.version;
    });

    await scenario("stale reconciliation leases versions and facts are rejected", () => {
      assert.equal(finalize(box, { expectedVersion: unknownVersion, leaseId: "72000000-0000-4000-8000-999999999999" }).outcome, "lease_lost");
      assert.equal(finalize(box, { expectedVersion: unknownVersion - 1 }).outcome, "version_conflict");
      assert.equal(finalize(box, { expectedVersion: unknownVersion, credentialVersion: 2 }).outcome, "credential_version_mismatch");
      assert.equal(finalize(box, { expectedVersion: unknownVersion, amount: AMOUNT + 1 }).outcome, "amount_mismatch");
      assert.equal(finalize(box, { expectedVersion: unknownVersion, currency: "USD" }).outcome, "currency_mismatch");
    });

    let reclaimedLease;
    await scenario("two expired-lease reclaimers admit one new fence and reject the old worker", async () => {
      const contenders = [
        {
          operationId: "71000000-0000-4000-8000-000000000011",
          expectedVersion: unknownVersion,
          workerId: "worker.reclaim.a",
          leaseId: "72000000-0000-4000-8000-000000000011",
          now: "2026-07-27T12:07:00.000Z",
          leaseExpiresAt: "2026-07-27T12:12:00.000Z",
        },
        {
          operationId: "71000000-0000-4000-8000-000000000012",
          expectedVersion: unknownVersion,
          workerId: "worker.reclaim.b",
          leaseId: "72000000-0000-4000-8000-000000000012",
          now: "2026-07-27T12:07:00.000Z",
          leaseExpiresAt: "2026-07-27T12:12:00.000Z",
        },
      ];
      const results = await Promise.all(contenders.map((input) => claimAsync(box, input)));
      assert.deepEqual(results.map(({ outcome }) => outcome).sort(), ["claimed", "version_conflict"]);
      const winnerIndex = results.findIndex(({ outcome }) => outcome === "claimed");
      reclaimedLease = { ...contenders[winnerIndex], result: results[winnerIndex].result };
      unknownVersion = reclaimedLease.result.version;
      assert.equal(finalize(box, {
        operationId: "73000000-0000-4000-8000-000000000011",
        expectedVersion: unknownVersion,
        now: "2026-07-27T12:08:00.000Z",
      }).outcome, "lease_lost");
    });

    await scenario("the reclaimed worker finalizes the attempt", () => {
      const result = finalize(box, {
        expectedVersion: unknownVersion,
        workerId: reclaimedLease.workerId,
        leaseId: reclaimedLease.leaseId,
        now: "2026-07-27T12:08:00.000Z",
      });
      assert.equal(result.outcome, "captured");
      assert.equal(result.result.status, "captured");
    });

    await scenario("claim replay remains byte-identical after finalization and rejects fingerprint drift", () => {
      const replay = claim(box, { expectedVersion: 2 });
      assert.equal(replay.outcome, "operation_replayed");
      assert.deepEqual(replay.result, reconciliation.result);
      assert.equal(claim(box, {
        expectedVersion: 2,
        fingerprint: "d".repeat(64),
      }).outcome, "operation_mismatch");
    });

    await scenario("created transitions directly to failed", () => {
      assert.equal(begin(box, {
        attemptId: FAILED_ATTEMPT, bindingDigest: "6".repeat(64),
      }).outcome, "created");
      const failed = initialized(box, {
        attemptId: FAILED_ATTEMPT, operationId: "74000000-0000-4000-8000-000000000001",
        expectedVersion: 1, status: "failed", safeCode: "provider_rejected",
      });
      assert.equal(failed.outcome, "failed");
    });

    await scenario("created transitions directly to expired", () => {
      assert.equal(begin(box, {
        attemptId: EXPIRED_ATTEMPT, bindingDigest: "7".repeat(64),
      }).outcome, "created");
      const expired = initialized(box, {
        attemptId: EXPIRED_ATTEMPT, operationId: "74000000-0000-4000-8000-000000000002",
        expectedVersion: 1, status: "expired", safeCode: "attempt_expired",
      });
      assert.equal(expired.outcome, "expired");
    });

    await scenario("application and workflow roles have no direct relation DML", () => {
      for (const role of ["celebix_saas_app", "celebix_saas_workflow"]) {
        for (const relation of [
          "payment_attempts", "payment_attempt_events",
          "payment_callback_bindings", "payment_attempt_operations",
        ]) {
          assert.notEqual(psql(box, `SET ROLE ${role}; SELECT * FROM saas.${relation};`, DB, true).status, 0);
          assert.notEqual(psql(box, `SET ROLE ${role}; DELETE FROM saas.${relation};`, DB, true).status, 0);
        }
      }
    });

    await scenario("event mutation skipped owner states and immutable authority are rejected", () => {
      assert.notEqual(psql(box, `SET ROLE celebix_saas_owner;
UPDATE saas.payment_attempt_events SET safe_code='changed' WHERE attempt_id='${CAPTURED_ATTEMPT}';`, DB, true).status, 0);
      assert.notEqual(psql(box, `SET ROLE celebix_saas_owner;
UPDATE saas.payment_attempts SET amount_minor=1,version=version+1,updated_at='2026-07-27T12:10:00Z'
WHERE id='${UNKNOWN_ATTEMPT}';`, DB, true).status, 0);
      assert.notEqual(psql(box, `SET ROLE celebix_saas_owner;
UPDATE saas.payment_attempts SET status='refunded',version=version+1,updated_at='2026-07-27T12:10:00Z'
WHERE id='${UNKNOWN_ATTEMPT}';`, DB, true).status, 0);
    });

    await scenario("events are exact append-only state history and operation payloads are bounded safe projections", () => {
      assert.equal(psql(box, `SELECT pg_catalog.string_agg(COALESCE(from_status,'null')||'>'||to_status,',' ORDER BY occurred_at,event_id)
FROM saas.payment_attempt_events WHERE attempt_id='${CAPTURED_ATTEMPT}';`).stdout.trim(),
      "null>created,created>awaiting_customer,awaiting_customer>submitted,submitted>captured,captured>partially_refunded,partially_refunded>refunded");
      assert.equal(psql(box, `SELECT pg_catalog.bool_and(pg_catalog.pg_column_size(result_payload)<=32768
AND result_payload::text!~*'sealedCredentials|callback_binding_digest|raw')
FROM saas.payment_attempt_operations;`).stdout.trim(), "t");
    });

    await scenario("guarded non-empty rollback fails before destruction", () => {
      const result = psql(box, readFileSync(path.join(SQL, "202607270052_payment_adapter_runtime.down.sql"), "utf8"), DB, true);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /PAYMENT_ADAPTER_RUNTIME_ROLLBACK_REQUIRES_DRAIN/);
      assert.equal(psql(box, "SELECT to_regclass('saas.payment_attempts') IS NOT NULL;").stdout.trim(), "t");
    });

    await scenario("empty rollback reapply and historical compatibility are clean", () => {
      const before = psql(box, HISTORY_FINGERPRINT_SQL, EMPTY_DB).stdout.trim();
      apply(box, "202607270052_payment_adapter_runtime.up.sql", EMPTY_DB);
      apply(box, "202607270052_payment_adapter_runtime.down.sql", EMPTY_DB);
      assert.equal(psql(box, "SELECT to_regclass('saas.payment_attempts') IS NULL;", EMPTY_DB).stdout.trim(), "t");
      assert.equal(psql(box, HISTORY_FINGERPRINT_SQL, EMPTY_DB).stdout.trim(), before);
      apply(box, "202607270052_payment_adapter_runtime.up.sql", EMPTY_DB);
      apply(box, "202607270052_payment_adapter_runtime_assertions.sql", EMPTY_DB);
    });

    assert.equal(count, TOTAL);
    console.log(`${TOTAL}/${TOTAL} PASS`);
  } finally {
    stop(box);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
