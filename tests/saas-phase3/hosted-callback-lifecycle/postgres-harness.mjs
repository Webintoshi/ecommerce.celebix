import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "hosted_callback_lifecycle";
const ROLLBACK_DB = "hosted_callback_lifecycle_rollback";
const RACE_DB = "hosted_callback_lifecycle_race";
const UP = "202607270055_hosted_callback_lifecycle.up.sql";
const DOWN = "202607270055_hosted_callback_lifecycle.down.sql";
const ASSERTIONS = "202607270055_hosted_callback_lifecycle_assertions.sql";
const prior = JSON.parse(readFileSync(
  path.join(SQL, "phase3m-paytr-iframe-sandbox-evidence-history-manifest.json"),
  "utf8",
));
const STORE = "10000000-0000-4000-8000-000000000055";
const PROFILE = "40000000-0000-4000-8000-000000000055";
const METHOD = "50000000-0000-4000-8000-000000000055";
const NOW = "2026-07-27T12:00:00.000Z";
const CALLBACK_TIME = "2026-07-27T12:01:00.000Z";
const FP = "a".repeat(64);
const AMOUNT = 12_345;
const TOTAL = 13;
let completed = 0;

const PRESERVED = Object.freeze({
  "202607270052_payment_adapter_runtime.up.sql": "48472767b968d52803635c74a6369fdffa7802385595640a9e7ab034a753153a",
  "202607270052_payment_adapter_runtime_assertions.sql": "c50aeefcf8f2183048325ffc77256cb5eb9d1c50b95a7dbdbab0747c59e8b867",
  "202607270053_paytr_iframe_activation_authority.up.sql": "4bf5fa9043260eca952abd4f98dce6da3fad099da25dae971f719778500f4230",
  "202607270053_paytr_iframe_activation_authority_assertions.sql": "617556d41fa684aba3f5a2f56cc12f3fc157df530de5477253a1c42775736397",
  "202607270054_paytr_iframe_sandbox_evidence_history.up.sql": "9805a260db96c186560aadad6525fe46e5cfb8abf9d17e89295a6e223ca2063a",
  "202607270054_paytr_iframe_sandbox_evidence_history_assertions.sql": "dd79f14119953294a33ad6bd91081e66d65083a23bf9dac041c7e54ed1ee1be5",
  "202607270054_paytr_iframe_sandbox_evidence_history.down.sql": "00e84af32c8ea44b1546f79f08ad5b6879ac841db891796f2c2583c7433ea60b",
});

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
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  }
  return result;
}

function start() {
  const root = mkdtempSync("/tmp/celebix-hosted-callback-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 24_000 + Math.floor(Math.random() * 8_000);
  mkdirSync(socket, { mode: 0o700 });
  command(bin("initdb"), [
    "-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8",
  ]);
  command(bin("pg_ctl"), [
    "-D", data, "-o", `-k ${socket} -p ${port} -h ''`,
    "-l", path.join(root, "postgres.log"), "start",
  ]);
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

function sqlAsync(box, input, database = DB) {
  return new Promise((resolve) => {
    const child = spawn(bin("psql"), [
      "-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
      "-U", "postgres", "-d", database,
    ], { cwd: ROOT });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(input);
  });
}

function openSqlSession(box, database = DB) {
  const child = spawn(bin("psql"), [
    "-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], {
    cwd: ROOT,
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
  });
  let stdout = "";
  let stderr = "";
  let completed = false;
  child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const closed = new Promise((resolve) => {
    child.on("close", (status) => {
      completed = true;
      resolve({ status, stdout, stderr });
    });
  });
  return Object.freeze({
    write(input) { child.stdin.write(input); },
    end() { child.stdin.end(); },
    snapshot() { return Object.freeze({ completed, stdout, stderr }); },
    closed,
  });
}

async function waitUntil(label, check) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${label}`);
}

function apply(box, file, database = DB) {
  sql(box, readFileSync(path.join(SQL, file), "utf8"), database);
}

function scenario(name, run) {
  return Promise.resolve(run()).then(() => {
    completed += 1;
    process.stdout.write(`PASS ${completed}/${TOTAL} ${name}\n`);
  });
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

function seed(box, database = DB) {
  sql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
VALUES('${STORE}','Hosted Callback','hosted-callback','active','tr','TRY','default','${NOW}','${NOW}');
INSERT INTO saas.merchant_provider_definitions(provider_code,capability,enabled,created_at)
VALUES('fixture_hosted','payment_processing',true,'${NOW}');
INSERT INTO saas.merchant_provider_execution_authorities(
 provider_code,capability,environment,adapter_version,evidence_digest,readiness,enabled,approved_at
) VALUES(
 'fixture_hosted','payment_processing','test',1,'sha256:${"2".repeat(64)}','sandbox_ready',true,'${NOW}'
);
INSERT INTO saas.merchant_provider_profiles(
 id,store_id,provider_code,capability,public_config,masked_account_reference,sealed_credentials,
 credential_digest,credential_key_id,credential_schema_version,credential_version,status,version,
 last_validated_at,created_at,updated_at,revoked_at,execution_environment,
 execution_adapter_version,execution_evidence_digest
) VALUES(
 '${PROFILE}','${STORE}','fixture_hosted','payment_processing','{"environment":"test"}',
 '••••hosted','${envelope()}'::jsonb,'${"1".repeat(64)}','provider.current',1,1,'active',1,
 '${NOW}','${NOW}','${NOW}',NULL,'test',1,'sha256:${"2".repeat(64)}'
);
INSERT INTO saas.payment_methods(
 id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,position,config,version,created_at,updated_at
) VALUES(
 '${METHOD}','${STORE}','provider','${PROFILE}','fixture_hosted','Fixture Hosted','active',NULL,0,'{}',1,'${NOW}','${NOW}'
);
COMMIT;`, database);
}

function call(box, name, args, database = DB, role = "celebix_saas_workflow") {
  const result = sql(box, `SET ROLE ${role};
SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
FROM saas.${name}(${args});`, database);
  return JSON.parse(result.stdout.trim());
}

function readOnlyCall(box, name, args, database = DB, role = "celebix_saas_workflow") {
  const result = sql(box, `BEGIN READ ONLY; SET LOCAL ROLE ${role};
SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
FROM saas.${name}(${args}); COMMIT;`, database);
  return JSON.parse(result.stdout.trim());
}

function callbackOperationId(ordinal) {
  return `80000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`;
}

function callbackEventDigest(ordinal) {
  return createHash("sha256").update(`event:${ordinal}`).digest("hex");
}

function internalCallbackEvent(operationId, fingerprint, eventDigest) {
  const identity = createHash("sha256")
    .update(`saas.payment.callback.intermediate.event-id.v1:${operationId}:${fingerprint}:${eventDigest}`)
    .digest("hex");
  return Object.freeze({
    eventId: `${identity.slice(0, 8)}-${identity.slice(8, 12)}-8${identity.slice(13, 16)}-8${identity.slice(17, 20)}-${identity.slice(20, 32)}`,
    eventDigest: createHash("sha256")
      .update(`saas.payment.callback.intermediate.digest.v1:${operationId}:${fingerprint}:${eventDigest}`)
      .digest("hex"),
  });
}

function beginAwaiting(box, ordinal, database = DB) {
  const suffix = String(ordinal).padStart(12, "0");
  const attemptId = `60000000-0000-4000-8000-${suffix}`;
  const initId = `70000000-0000-4000-8000-${suffix}`;
  const binding = createHash("sha256").update(`binding:${ordinal}`).digest("hex");
  const created = call(box, "payment_attempt_begin", [
    `'${STORE}'`, `'${NOW}'`, `'${attemptId}'`, `'${FP}'`, `'${METHOD}'`,
    `'ORDER-${ordinal}'`, AMOUNT, "'TRY'", `'${binding}'`,
  ].join(","), database);
  assert.equal(created.outcome, "created");
  const initialized = call(box, "payment_attempt_mark_initialized", [
    `'${attemptId}'`, `'${initId}'`, `'${FP}'`, 1, 1, "'awaiting_customer'",
    `'provider-ref-${ordinal}'`, "'iframe_ready'", `'${NOW}'`,
  ].join(","), database);
  assert.equal(initialized.outcome, "awaiting_customer");
  return { attemptId, binding, version: 2, providerReference: `provider-ref-${ordinal}` };
}

function hostedArgs(attempt, ordinal, status, overrides = {}) {
  const operationId = overrides.operationId ?? callbackOperationId(ordinal);
  const event = overrides.event ?? callbackEventDigest(ordinal);
  return [
    "'fixture_hosted'", `'${attempt.binding}'`, `'${operationId}'`, `'${overrides.fingerprint ?? FP}'`,
    `'${event}'`, overrides.expectedVersion ?? attempt.version, 1, `'${status}'`,
    `'${overrides.providerReference ?? attempt.providerReference}'`, `'${overrides.safeCode ?? status}'`,
    AMOUNT, "'TRY'", `'${CALLBACK_TIME}'`,
  ].join(",");
}

async function main() {
  let box;
  try {
    box = start();
    sql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const { file } of prior.migrationChain) apply(box, file);
    seed(box);
    sql(box, `CREATE DATABASE ${ROLLBACK_DB} TEMPLATE ${DB};`, "postgres");
    sql(box, `CREATE DATABASE ${RACE_DB} TEMPLATE ${DB};`, "postgres");

    const captured = beginAwaiting(box, 1);
    await scenario("real 052 rejects the hosted iframe terminal callback from awaiting_customer", () => {
      const legacy = call(box, "payment_attempt_settle_callback", hostedArgs(captured, 101, "captured"));
      assert.equal(legacy.outcome, "invalid_transition");
      assert.equal(sql(box, `SELECT status||'|'||version FROM saas.payment_attempts WHERE id='${captured.attemptId}';`).stdout.trim(), "awaiting_customer|2");
    });

    apply(box, UP);
    apply(box, ASSERTIONS);

    await scenario("PostgreSQL 16 metadata, owner ACL, forced RLS, and preserved checksums pass", () => {
      assert.match(sql(box, "SHOW server_version;").stdout.trim(), /^16[.]/);
      for (const [file, expected] of Object.entries(PRESERVED)) {
        assert.equal(createHash("sha256").update(readFileSync(path.join(SQL, file))).digest("hex"), expected, file);
      }
      assert.equal(sql(box, `SELECT count(*) FROM pg_catalog.pg_class relation
JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
WHERE namespace.nspname='saas' AND relation.relname IN('payment_attempts','payment_attempt_events','payment_callback_bindings','payment_attempt_operations')
AND relation.relrowsecurity AND relation.relforcerowsecurity;`).stdout.trim(), "4");
      assert.equal(sql(box, `SELECT data_type||'|'||is_nullable
FROM information_schema.columns
WHERE table_schema='saas' AND table_name='payment_attempt_events'
  AND column_name='observed_callback_status';`).stdout.trim(), "text|YES");
      assert.equal(sql(box, `SELECT pg_catalog.pg_get_constraintdef(oid,false)
FROM pg_catalog.pg_constraint
WHERE conrelid='saas.payment_attempt_events'::regclass
  AND conname='payment_attempt_events_observed_callback_status_check';`).stdout.trim(), "CHECK (((observed_callback_status IS NULL) OR ((source = 'callback'::text) AND (observed_callback_status = ANY (ARRAY['captured'::text, 'failed'::text, 'provider_outcome_unknown'::text])))))");
      assert.notEqual(sql(box, `SET ROLE celebix_saas_app; SELECT * FROM saas.payment_attempt_apply_hosted_callback(${hostedArgs(captured, 102, "captured")});`, DB, true).status, 0);
    });

    await scenario("awaiting_customer success crosses submitted atomically and captures", () => {
      const result = call(box, "payment_attempt_apply_hosted_callback", hostedArgs(captured, 103, "captured"));
      assert.equal(result.outcome, "captured");
      assert.deepEqual({ status: result.result.status, version: result.result.version }, { status: "captured", version: 4 });
      const operationId = callbackOperationId(103);
      const eventDigest = callbackEventDigest(103);
      const internal = internalCallbackEvent(operationId, FP, eventDigest);
      assert.equal(sql(box, `SELECT event_id::text||'|'||from_status||'|'||to_status||'|'||attempt_version||'|'||safe_code||'|'||event_key_digest||'|'||COALESCE(observed_callback_status,'-')
FROM saas.payment_attempt_events WHERE attempt_id='${captured.attemptId}' AND source='callback'
ORDER BY attempt_version;`).stdout.trim(), [
        `${internal.eventId}|awaiting_customer|submitted|3|callback_submitted|${internal.eventDigest}|-`,
        `${operationId}|submitted|captured|4|captured|${eventDigest}|captured`,
      ].join("\n"));
      const eventReplay = call(box, "payment_attempt_apply_hosted_callback", hostedArgs(
        { ...captured, version: 4 }, 104, "captured", { event: eventDigest },
      ));
      assert.equal(eventReplay.outcome, "callback_replayed");
      assert.equal(eventReplay.result.replayed, true);
      assert.equal(sql(box, `SELECT count(*) FROM saas.payment_attempt_events
WHERE attempt_id='${captured.attemptId}' AND source='callback';`).stdout.trim(), "2");
    });

    await scenario("awaiting_customer failure crosses submitted atomically and fails", () => {
      const attempt = beginAwaiting(box, 2);
      const result = call(box, "payment_attempt_apply_hosted_callback", hostedArgs(attempt, 201, "failed"));
      assert.equal(result.outcome, "failed");
      assert.equal(result.result.version, 4);
      const operationId = callbackOperationId(201);
      const eventDigest = callbackEventDigest(201);
      const internal = internalCallbackEvent(operationId, FP, eventDigest);
      assert.equal(sql(box, `SELECT event_id::text||'|'||from_status||'|'||to_status||'|'||attempt_version||'|'||event_key_digest||'|'||COALESCE(observed_callback_status,'-')
FROM saas.payment_attempt_events WHERE attempt_id='${attempt.attemptId}' AND source='callback'
ORDER BY attempt_version;`).stdout.trim(), [
        `${internal.eventId}|awaiting_customer|submitted|3|${internal.eventDigest}|-`,
        `${operationId}|submitted|failed|4|${eventDigest}|failed`,
      ].join("\n"));
    });

    const pending = beginAwaiting(box, 3);
    const pendingEvent = createHash("sha256").update("pending-event").digest("hex");
    await scenario("pending and timeout persist durable callback identity as provider_outcome_unknown", () => {
      const result = call(box, "payment_attempt_apply_hosted_callback", hostedArgs(
        pending, 301, "provider_outcome_unknown", { event: pendingEvent, safeCode: "fraud_review" },
      ));
      assert.equal(result.outcome, "provider_outcome_unknown");
      assert.equal(result.result.version, 3);
      assert.equal(sql(box, `SELECT source||'|'||event_key_digest||'|'||to_status||'|'||observed_callback_status
FROM saas.payment_attempt_events WHERE attempt_id='${pending.attemptId}' AND attempt_version=3;`).stdout.trim(), `callback|${pendingEvent}|provider_outcome_unknown|provider_outcome_unknown`);
      assert.equal(sql(box, `SELECT operation_kind FROM saas.payment_attempt_operations
WHERE operation_id='${callbackOperationId(301)}';`).stdout.trim(), "mark_unknown");
    });

    await scenario("same callback event replays exactly without a second mutation", () => {
      const replay = call(box, "payment_attempt_apply_hosted_callback", hostedArgs(
        { ...pending, version: 3 }, 302, "provider_outcome_unknown",
        { event: pendingEvent, safeCode: "fraud_review" },
      ));
      assert.equal(replay.outcome, "callback_replayed");
      assert.equal(replay.result.replayed, true);
      assert.equal(sql(box, `SELECT count(*) FROM saas.payment_attempt_events WHERE attempt_id='${pending.attemptId}' AND source='callback';`).stdout.trim(), "1");
    });

    await scenario("a changed terminal callback after unknown records safe observed facts and recovers read-only", () => {
      const rejected = call(box, "payment_attempt_apply_hosted_callback", hostedArgs(
        { ...pending, version: 3 }, 305, "captured", {
          event: "d".repeat(64), providerReference: "provider-ref-wrong-305",
          safeCode: "late_captured",
        },
      ));
      assert.equal(rejected.outcome, "provider_reference_mismatch");
      assert.equal(sql(box, `SELECT count(*) FROM saas.payment_attempt_events
WHERE event_id='${callbackOperationId(305)}' OR event_key_digest='${"d".repeat(64)}';`).stdout.trim(), "0");
      assert.equal(sql(box, `SELECT count(*) FROM saas.payment_attempt_operations
WHERE operation_id='${callbackOperationId(305)}';`).stdout.trim(), "0");
      const changedReference = pending.providerReference;
      const changed = call(box, "payment_attempt_apply_hosted_callback", hostedArgs(
        { ...pending, version: 3 }, 303, "captured", {
          event: "e".repeat(64), providerReference: changedReference, safeCode: "late_captured",
        },
      ));
      assert.equal(changed.outcome, "processing");
      assert.equal(changed.result.status, "provider_outcome_unknown");
      assert.equal(changed.result.version, 3);
      assert.equal(sql(box, `SELECT source||'|'||event_key_digest||'|'||from_status||'|'||to_status||'|'||safe_provider_reference||'|'||safe_code||'|'||observed_callback_status
FROM saas.payment_attempt_events WHERE event_id='80000000-0000-4000-8000-000000000303';`).stdout.trim(), `callback|${"e".repeat(64)}|provider_outcome_unknown|provider_outcome_unknown|${changedReference}|late_captured|captured`);
      assert.equal(sql(box, `SELECT safe_provider_reference||'|'||safe_code||'|'||status||'|'||version
FROM saas.payment_attempts WHERE id='${pending.attemptId}';`).stdout.trim(), `${pending.providerReference}|fraud_review|provider_outcome_unknown|3`);
      const processingReplay = readOnlyCall(box, "payment_attempt_apply_hosted_callback", hostedArgs(
        { ...pending, version: 3 }, 303, "captured", {
          event: "e".repeat(64), providerReference: changedReference, safeCode: "late_captured",
        },
      ));
      assert.equal(processingReplay.outcome, "operation_replayed");
      assert.equal(processingReplay.result.replayed, true);
      const eventReplay = call(box, "payment_attempt_apply_hosted_callback", hostedArgs(
        { ...pending, version: 3 }, 304, "captured", {
          event: "e".repeat(64), providerReference: changedReference, safeCode: "late_captured",
        },
      ));
      assert.equal(eventReplay.outcome, "callback_replayed");
      assert.deepEqual({
        status: eventReplay.result.status,
        version: eventReplay.result.version,
        providerReference: eventReplay.result.providerReference,
        safeCode: eventReplay.result.safeCode,
        replayed: eventReplay.result.replayed,
      }, {
        status: "provider_outcome_unknown",
        version: 3,
        providerReference: pending.providerReference,
        safeCode: "fraud_review",
        replayed: true,
      });
      const claim = call(box, "payment_attempt_claim_reconciliation", [
        `'${pending.attemptId}'`, "'81000000-0000-4000-8000-000000000303'", `'${FP}'`, 3,
        "'worker.hosted'", "'82000000-0000-4000-8000-000000000303'", `'${CALLBACK_TIME}'`,
        "'2026-07-27T12:06:00.000Z'",
      ].join(","));
      assert.equal(claim.outcome, "claimed");
    });

    await scenario("legacy unknown data replays through the new hosted callback binary", () => {
      const attempt = beginAwaiting(box, 6);
      const operationId = callbackOperationId(601);
      const legacy = call(box, "payment_attempt_mark_unknown", [
        `'${attempt.attemptId}'`, `'${operationId}'`, `'${FP}'`, 2, 1,
        `'${attempt.providerReference}'`, "'provider_timeout'", `'${CALLBACK_TIME}'`,
      ].join(","));
      assert.equal(legacy.outcome, "provider_outcome_unknown");
      const modern = call(box, "payment_attempt_apply_hosted_callback", hostedArgs(
        attempt, 601, "provider_outcome_unknown", {
          operationId, event: callbackEventDigest(601), safeCode: "provider_timeout",
        },
      ));
      assert.equal(modern.outcome, "operation_replayed");
      assert.equal(modern.result.replayed, true);
    });

    await scenario("new hosted unknown data preserves mark_unknown replay for the old binary", () => {
      const attempt = beginAwaiting(box, 7);
      const operationId = callbackOperationId(701);
      const modern = call(box, "payment_attempt_apply_hosted_callback", hostedArgs(
        attempt, 701, "provider_outcome_unknown", {
          operationId, event: callbackEventDigest(701), safeCode: "provider_timeout",
        },
      ));
      assert.equal(modern.outcome, "provider_outcome_unknown");
      assert.equal(sql(box, `SELECT operation_kind FROM saas.payment_attempt_operations
WHERE operation_id='${operationId}';`).stdout.trim(), "mark_unknown");
      const legacy = call(box, "payment_attempt_mark_unknown", [
        `'${attempt.attemptId}'`, `'${operationId}'`, `'${FP}'`, 2, 1,
        `'${attempt.providerReference}'`, "'provider_timeout'", `'${CALLBACK_TIME}'`,
      ].join(","));
      assert.equal(legacy.outcome, "operation_replayed");
      assert.equal(legacy.result.replayed, true);
    });

    await scenario("timeout unknown is independently claimable for reconciliation", () => {
      const attempt = beginAwaiting(box, 4);
      const unknown = call(box, "payment_attempt_apply_hosted_callback", hostedArgs(
        attempt, 401, "provider_outcome_unknown", { safeCode: "provider_verification_timeout" },
      ));
      assert.equal(unknown.outcome, "provider_outcome_unknown");
      const claim = call(box, "payment_attempt_claim_reconciliation", [
        `'${attempt.attemptId}'`, "'81000000-0000-4000-8000-000000000401'", `'${FP}'`, 3,
        "'worker.timeout'", "'82000000-0000-4000-8000-000000000401'", `'${CALLBACK_TIME}'`,
        "'2026-07-27T12:06:00.000Z'",
      ].join(","));
      assert.equal(claim.result.status, "reconciliation_required");
    });

    await scenario("concurrent changed callbacks have one terminal winner and one exact version conflict", async () => {
      const attempt = beginAwaiting(box, 5);
      const statements = [501, 502].map((ordinal) => `SET ROLE celebix_saas_workflow;
SELECT outcome FROM saas.payment_attempt_apply_hosted_callback(${hostedArgs(attempt, ordinal, "captured")});`);
      const results = await Promise.all(statements.map((statement) => sqlAsync(box, statement)));
      assert.ok(results.every(({ status }) => status === 0));
      assert.deepEqual(results.map(({ stdout }) => stdout.trim()).sort(), ["captured", "version_conflict"]);
      assert.equal(sql(box, `SELECT status||'|'||version FROM saas.payment_attempts WHERE id='${attempt.attemptId}';`).stdout.trim(), "captured|4");
    });

    await scenario("down waits for an uncommitted callback then preserves every 055 artifact", async () => {
      apply(box, UP, RACE_DB);
      apply(box, ASSERTIONS, RACE_DB);
      const attempt = beginAwaiting(box, 8, RACE_DB);
      const callback = openSqlSession(box, RACE_DB);
      let downPromise;
      try {
        callback.write(`BEGIN; SET LOCAL ROLE celebix_saas_workflow;
SELECT outcome FROM saas.payment_attempt_apply_hosted_callback(${hostedArgs(attempt, 801, "captured")});
SELECT 'CALLBACK_HELD_OPEN';
`);
        await waitUntil("uncommitted callback", () => {
          const state = callback.snapshot();
          if (state.completed) throw new Error(state.stderr || "callback session closed");
          return state.stdout.includes("CALLBACK_HELD_OPEN");
        });

        let downCompleted = false;
        let earlyDownResult;
        downPromise = sqlAsync(box, `SET application_name='hosted_callback_down_race';
${readFileSync(path.join(SQL, DOWN), "utf8")}`, RACE_DB).then((result) => {
          downCompleted = true;
          earlyDownResult = result;
          return result;
        });
        let downWait = "";
        await waitUntil("down lock", () => {
          if (downCompleted) {
            throw new Error(`down completed before lock: ${earlyDownResult?.status}|${earlyDownResult?.stderr}`);
          }
          downWait = sql(box, `SELECT wait_event_type||'|'||wait_event
FROM pg_catalog.pg_stat_activity
WHERE application_name='hosted_callback_down_race';`).stdout.trim();
          return downWait.startsWith("Lock|");
        });
        assert.equal(downCompleted, false);

        callback.write("COMMIT; SELECT 'CALLBACK_COMMITTED';\n\\q\n");
        const callbackResult = await callback.closed;
        assert.equal(callbackResult.status, 0, callbackResult.stderr);
        assert.match(callbackResult.stdout, /CALLBACK_COMMITTED/);

        const downResult = await downPromise;
        assert.notEqual(downResult.status, 0);
        assert.equal(downWait, "Lock|relation");
        assert.match(downResult.stderr, /PAYMENT_HOSTED_CALLBACK_LIFECYCLE_ROLLBACK_OBSERVATIONS_PRESENT/);
        assert.equal(sql(box, "SELECT to_regprocedure('saas.payment_attempt_apply_hosted_callback(text,text,uuid,text,text,bigint,bigint,text,text,text,bigint,text,timestamptz)') IS NOT NULL;", RACE_DB).stdout.trim(), "t");
        assert.equal(sql(box, `SELECT count(*) FROM information_schema.columns
WHERE table_schema='saas' AND table_name='payment_attempt_events'
  AND column_name='observed_callback_status';`, RACE_DB).stdout.trim(), "1");
        assert.equal(sql(box, `SELECT from_status||'|'||to_status||'|'||attempt_version||'|'||observed_callback_status
FROM saas.payment_attempt_events
WHERE attempt_id='${attempt.attemptId}' AND observed_callback_status IS NOT NULL;`, RACE_DB).stdout.trim(), "submitted|captured|4|captured");
      } finally {
        if (!callback.snapshot().completed) {
          callback.end();
          await callback.closed;
        }
        if (downPromise !== undefined) await downPromise;
      }
    });

    await scenario("down/up rollback is narrow and old RPC plus ACL remain unchanged", () => {
      const unsafeDown = sql(box, readFileSync(path.join(SQL, DOWN), "utf8"), DB, true);
      assert.notEqual(unsafeDown.status, 0);
      assert.match(unsafeDown.stderr, /PAYMENT_HOSTED_CALLBACK_LIFECYCLE_ROLLBACK_OBSERVATIONS_PRESENT/);
      assert.equal(sql(box, "SELECT to_regprocedure('saas.payment_attempt_apply_hosted_callback(text,text,uuid,text,text,bigint,bigint,text,text,text,bigint,text,timestamptz)') IS NOT NULL;").stdout.trim(), "t");
      apply(box, UP, ROLLBACK_DB);
      apply(box, DOWN, ROLLBACK_DB);
      assert.equal(sql(box, "SELECT to_regprocedure('saas.payment_attempt_apply_hosted_callback(text,text,uuid,text,text,bigint,bigint,text,text,text,bigint,text,timestamptz)') IS NULL;", ROLLBACK_DB).stdout.trim(), "t");
      assert.equal(sql(box, `SELECT count(*) FROM information_schema.columns
WHERE table_schema='saas' AND table_name='payment_attempt_events'
  AND column_name='observed_callback_status';`, ROLLBACK_DB).stdout.trim(), "0");
      assert.notEqual(sql(box, "SET ROLE celebix_saas_app; SELECT * FROM saas.payment_attempt_settle_callback(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);", ROLLBACK_DB, true).status, 0);
      apply(box, UP, ROLLBACK_DB);
      apply(box, ASSERTIONS, ROLLBACK_DB);
    });

    assert.equal(completed, TOTAL);
  } finally {
    stop(box);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
