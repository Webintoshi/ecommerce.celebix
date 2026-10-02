import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";
assertSafeEnvironment();
import { spawn, spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "verified_hosted_callback_reconciliation";
const UP = "202610020192_verified_hosted_callback_reconciliation.up.sql";
const DOWN = "202610020192_verified_hosted_callback_reconciliation.down.sql";
const ASSERTIONS = "202610020192_verified_hosted_callback_reconciliation_assertions.sql";
const prior = JSON.parse(readFileSync(
  path.join(SQL, "phase3o-payment-provider-keyed-lifecycle-manifest.json"),
  "utf8",
));
const STORE = "10000000-0000-4000-8000-000000000055";
const PROFILE = "40000000-0000-4000-8000-000000000055";
const METHOD = "50000000-0000-4000-8000-000000000055";
const NOW = "2026-07-27T12:00:00.000Z";
const CALLBACK_TIME = "2026-07-27T12:01:00.000Z";
const FP = "a".repeat(64);
const AMOUNT = 12_345;
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
    env: { PATH: process.env.PATH, HOME: process.env.HOME, LC_ALL: "C", LANG: "C" },
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
    ], { cwd: ROOT, env: { PATH: process.env.PATH, HOME: process.env.HOME, LC_ALL: "C", LANG: "C" } });
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
    env: { PATH: process.env.PATH, HOME: process.env.HOME, LC_ALL: "C", LANG: "C" },
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
    process.stdout.write(`PASS ${++completed} ${name}\n`);
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
    AMOUNT, "'TRY'", `'${overrides.now ?? CALLBACK_TIME}'`,
  ].join(",");
}

const claimName = "payment_attempt_claim_verified_hosted_callback";
const finalName = "payment_attempt_finalize_verified_hosted_callback";
const evidenceName = "payment_attempt_verified_hosted_callback_evidence";
const guardedFinalName = "payment_attempt_finalize_reconciliation_guarded";
const EXECUTION = `sha256:${"2".repeat(64)}`;
const CLAIM_TIME = "2026-07-27T12:02:00.000Z";
const FINAL_TIME = "2026-07-27T12:02:01.000Z";
const EXPIRY = "2026-07-27T12:03:00.000Z";
const value = input => input === null ? "NULL" : typeof input === "number" ? String(input) : `'${String(input).replaceAll("'","''")}'`;
const id = (prefix, ordinal) => `${prefix}0000000-0000-4000-8000-${String(ordinal).padStart(12,"0")}`;
function snapshot(box, attempt) {
  return sql(box, `SELECT row_to_json(attempt)::text FROM saas.payment_attempts attempt WHERE id='${attempt.attemptId}';`).stdout.trim();
}
function predecessorSnapshot(box) {
  return sql(box, `SELECT oid::regprocedure::text||'|'||encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex')||'|'||proowner::regrole::text||'|'||proacl::text||'|'||provolatile::text||'|'||prosecdef::text||'|'||proconfig::text
    FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN('payment_attempt_claim_reconciliation','payment_attempt_finalize_reconciliation','merchant_provider_execution_authority_matches') ORDER BY oid::regprocedure::text;`).stdout;
}
function unknown(box, ordinal) {
  const attempt = beginAwaiting(box,ordinal);
  const result = call(box,"payment_attempt_mark_unknown", [attempt.attemptId,id("9",ordinal),FP,2,1,attempt.providerReference,"provider_timeout",CALLBACK_TIME].map(value).join(","));
  assert.equal(result.outcome,"provider_outcome_unknown");
  return { ...attempt,version:3 };
}
function observe(box,attempt,ordinal,status) {
  const result = call(box,"payment_attempt_apply_hosted_callback",hostedArgs(attempt,ordinal,status));
  assert.equal(result.outcome,"processing");
  return { ...attempt,status,eventKey:callbackEventDigest(ordinal),observationFingerprint:FP,safeCode:status };
}
function claimValues(attempt,ordinal, overrides={}) {
  const fields={ attemptId:attempt.attemptId,operationId:id("a",ordinal),fingerprint:FP,version:attempt.version,worker:"worker.callback",leaseId:id("b",ordinal),now:CLAIM_TIME,expires:EXPIRY,environment:"test",adapterVersion:1,execution:EXECUTION,provider:"fixture_hosted",binding:attempt.binding,event:attempt.eventKey,observationFingerprint:attempt.observationFingerprint,status:attempt.status,reference:attempt.providerReference,credential:1,amount:AMOUNT,currency:"TRY",...overrides };
  return [fields.attemptId,fields.operationId,fields.fingerprint,fields.version,fields.worker,fields.leaseId,fields.now,fields.expires,fields.environment,fields.adapterVersion,fields.execution,fields.provider,fields.binding,fields.event,fields.observationFingerprint,fields.status,fields.reference,fields.credential,fields.amount,fields.currency].map(value).join(",");
}
function finalValues(attempt,ordinal,overrides={}) {
  const fields={attemptId:attempt.attemptId,operationId:id("c",ordinal),fingerprint:FP,version:attempt.version+1,worker:"worker.callback",leaseId:id("b",ordinal),credential:1,status:attempt.status,reference:attempt.providerReference,safeCode:attempt.safeCode,amount:AMOUNT,currency:"TRY",now:FINAL_TIME,provider:"fixture_hosted",binding:attempt.binding,event:attempt.eventKey,observationFingerprint:attempt.observationFingerprint,...overrides};
  return [fields.attemptId,fields.operationId,fields.fingerprint,fields.version,fields.worker,fields.leaseId,fields.credential,fields.status,fields.reference,fields.safeCode,fields.amount,fields.currency,fields.now,fields.provider,fields.binding,fields.event,fields.observationFingerprint].map(value).join(",");
}
function evidenceValues(attempt,overrides={}) {
  const fields={attemptId:attempt.attemptId,version:attempt.version,now:CLAIM_TIME,environment:"test",adapterVersion:1,execution:EXECUTION,...overrides};
  return [fields.attemptId,fields.version,fields.now,fields.environment,fields.adapterVersion,fields.execution].map(value).join(",");
}
async function main() {
  let box;
  try {
    box = start();
    sql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const { file, sha256 } of prior.migrationChain) {
      assert.equal(createHash("sha256").update(readFileSync(path.join(SQL,file))).digest("hex"),sha256,file);
      apply(box,file);
    }
    apply(box,"202607270057_quick_order_hosted_payment_authority.up.sql");
    seed(box);
    const predecessors = predecessorSnapshot(box);
    if (process.argv.includes("--red")) {
      const attempt=observe(box,unknown(box,1),1001,"failed");
      const result=sql(box,`SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.${claimName}(${claimValues(attempt,1)});`,DB,true);
      assert.equal(result.status,0,result.stderr);
      return;
    }
    apply(box,UP);
    if(process.argv.includes("--red-selector")) {
      const attempt=observe(box,unknown(box,1),1001,"failed");
      const result=call(box,evidenceName,evidenceValues(attempt));
      assert.equal(result.outcome,"found");
      return;
    }
    if(process.argv.includes("--red-generic")) {
      const attempt=unknown(box,30);
      assert.equal(readOnlyCall(box,evidenceName,evidenceValues(attempt)).outcome,"no_observation");
      assert.equal(call(box,"payment_attempt_claim_reconciliation",claimValues(attempt,30).split(",").slice(0,11).join(",")).outcome,"claimed");
      observe(box,{...attempt,version:4},2030,"failed");
      assert.equal(call(box,guardedFinalName,finalValues({...attempt,status:"captured",safeCode:"captured"},30).split(",").slice(0,13).join(",")).outcome,"callback_replay_mismatch");
      return;
    }
    process.stdout.write(sql(box,`SELECT oid::regprocedure::text||'|'||encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex') FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN('${claimName}','${finalName}','${evidenceName}','${guardedFinalName}') ORDER BY proname;`).stdout);
    await scenario("authenticated failed and captured observations recover through the durable APIs and READ ONLY replay",()=> {
      for (const [ordinal,status] of [[1,"failed"],[2,"captured"]]) {
        const attempt=observe(box,unknown(box,ordinal),1000+ordinal,status);
        const beforeEvents=sql(box,`SELECT row_to_json(event)::text FROM saas.payment_attempt_events event WHERE attempt_id='${attempt.attemptId}' AND source='callback' ORDER BY event_id;`).stdout;
        const claimed=call(box,claimName,claimValues(attempt,ordinal));
        assert.equal(claimed.outcome,"claimed");
        assert.equal(claimed.result.version,4);
        assert.equal(readOnlyCall(box,claimName,claimValues(attempt,ordinal)).outcome,"operation_replayed");
        const finalized=call(box,finalName,finalValues(attempt,ordinal));
        assert.equal(finalized.outcome,status);
        assert.equal(finalized.result.version,5);
        assert.equal(finalized.result.status,status);
        assert.equal(readOnlyCall(box,finalName,finalValues(attempt,ordinal)).outcome,"operation_replayed");
        assert.equal(readOnlyCall(box,claimName,claimValues(attempt,ordinal)).outcome,"operation_replayed");
        assert.equal(sql(box,`SELECT row_to_json(event)::text FROM saas.payment_attempt_events event WHERE attempt_id='${attempt.attemptId}' AND source='callback' ORDER BY event_id;`).stdout,beforeEvents);
      }
    });
    await scenario("claim rejects missing, wrong, null, cross-attempt and nonterminal evidence without a lease mutation",()=> {
      const attempt=observe(box,unknown(box,3),1003,"failed");
      const other=observe(box,unknown(box,4),1004,"failed");
      const before=snapshot(box,attempt);
      const cases=[
        [{binding:"f".repeat(64)},"callback_not_found"],[{event:"f".repeat(64)},"callback_not_found"],
        [{event:other.eventKey},"callback_not_found"],[{binding:other.binding},"callback_not_found"],
        [{observationFingerprint:"f".repeat(64)},"callback_replay_mismatch"],[{status:"captured"},"callback_replay_mismatch"],
        [{status:null},"invalid_input"],[{status:"provider_outcome_unknown"},"invalid_input"],
        [{reference:null},"invalid_input"],[{reference:"other"},"provider_reference_mismatch"],
        [{credential:2},"credential_version_mismatch"],[{amount:AMOUNT+1},"amount_mismatch"],
        [{currency:"USD"},"currency_mismatch"],[{environment:"live"},"durable_authority_invalid"],
        [{execution:`sha256:${"f".repeat(64)}`},"durable_authority_invalid"],
        [{provider:"other_provider"},"durable_authority_invalid"],[{version:2},"version_conflict"],
        [{observationFingerprint:null},"invalid_input"],[{now:"2026-07-27T12:00:00Z",expires:"2026-07-27T12:01:00Z"},"invalid_input"]
      ];
      for (const [overrides,outcome] of cases) assert.equal(call(box,claimName,claimValues(attempt,30,overrides)).outcome,outcome,JSON.stringify(overrides));
      assert.equal(snapshot(box,attempt),before);
      assert.equal(sql(box,`SELECT count(*) FROM saas.payment_attempt_operations WHERE operation_id='${id("a",30)}';`).stdout.trim(),"0");
    });
    await scenario("opposite immutable terminal observations reject claim and finalize",()=> {
      const attempt=observe(box,unknown(box,5),1005,"failed");
      assert.equal(readOnlyCall(box,evidenceName,evidenceValues(attempt)).outcome,"found");
      observe(box,attempt,2005,"captured");
      const before=snapshot(box,attempt);
      assert.equal(readOnlyCall(box,evidenceName,evidenceValues(attempt)).outcome,"callback_replay_mismatch");
      assert.equal(call(box,claimName,claimValues(attempt,5)).outcome,"callback_replay_mismatch");
      assert.equal(snapshot(box,attempt),before);
      const pending=observe(box,unknown(box,6),1006,"captured");
      assert.equal(call(box,claimName,claimValues(pending,6)).outcome,"claimed");
      assert.equal(readOnlyCall(box,evidenceName,evidenceValues(pending,{version:4})).outcome,"found");
      observe(box,{...pending,version:4},2006,"failed");
      const leased=snapshot(box,pending);
      assert.equal(call(box,finalName,finalValues(pending,6)).outcome,"callback_replay_mismatch");
      assert.equal(snapshot(box,pending),leased);
    });
    await scenario("final rechecks original authority, signed safe code, exact evidence and lease",()=> {
      const attempt=observe(box,unknown(box,7),1007,"failed");
      assert.equal(call(box,claimName,claimValues(attempt,7)).outcome,"claimed");
      const before=snapshot(box,attempt);
      const cases=[
        [{safeCode:"other_code"},"callback_replay_mismatch"],[{event:"f".repeat(64)},"callback_not_found"],
        [{observationFingerprint:"f".repeat(64)},"callback_replay_mismatch"],[{status:"captured"},"callback_replay_mismatch"],
        [{status:null},"invalid_input"],[{reference:"other"},"provider_reference_mismatch"],
        [{amount:AMOUNT+1},"amount_mismatch"],[{currency:"USD"},"currency_mismatch"],
        [{credential:2},"credential_version_mismatch"],[{worker:"worker.other"},"lease_lost"],
        [{leaseId:id("b",999)},"lease_lost"],[{version:3},"version_conflict"],
        [{now:EXPIRY},"lease_lost"]
      ];
      for(const [overrides,outcome] of cases) assert.equal(call(box,finalName,finalValues(attempt,7,overrides)).outcome,outcome,JSON.stringify(overrides));
      sql(box,`UPDATE saas.merchant_provider_execution_authorities SET enabled=false WHERE provider_code='fixture_hosted';`);
      assert.equal(call(box,finalName,finalValues(attempt,7)).outcome,"durable_authority_invalid");
      sql(box,`UPDATE saas.merchant_provider_execution_authorities SET enabled=true WHERE provider_code='fixture_hosted';`);
      assert.equal(snapshot(box,attempt),before);
      assert.equal(call(box,finalName,finalValues(attempt,7)).outcome,"failed");
      assert.equal(readOnlyCall(box,finalName,finalValues(attempt,7,{fingerprint:"f".repeat(64)})).outcome,"operation_mismatch");
    });
    await scenario("SQL055 opposite observations serialize with BOTH verified claim and final on the attempt lock",async()=> {
      for (const [ordinal,phase] of [[8,"claim"],[9,"final"]]) {
        const attempt=observe(box,unknown(box,ordinal),1000+ordinal,"failed");
        if (phase==="final") {
          assert.equal(call(box,claimName,claimValues(attempt,ordinal)).outcome,"claimed");
          attempt.version=4;
        }
        const observation=openSqlSession(box);
        try {
          observation.write(`BEGIN; SET LOCAL ROLE celebix_saas_workflow; SELECT outcome FROM saas.payment_attempt_apply_hosted_callback(${hostedArgs(attempt,2000+ordinal,"captured")}); SELECT 'OBSERVATION_HELD';\n`);
          await waitUntil("opposite observation held",()=>observation.snapshot().stdout.includes("OBSERVATION_HELD"));
          let done=false;
          const fn=phase==="claim" ? claimName : finalName;
          const args=phase==="claim" ? claimValues(attempt,ordinal) : finalValues(attempt,ordinal,{version:4});
          const pending=sqlAsync(box,`SET application_name='verified_callback_${phase}_race'; SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.${fn}(${args});`).then(result=>{done=true;return result;});
          await waitUntil(`${phase} row lock`,()=>sql(box,`SELECT wait_event_type FROM pg_stat_activity WHERE application_name='verified_callback_${phase}_race';`).stdout.trim()==="Lock");
          assert.equal(done,false);
          observation.write("COMMIT;\n\\q\n");
          assert.equal((await observation.closed).status,0);
          const result=await pending;
          assert.equal(result.status,0,result.stderr);
          assert.equal(result.stdout.trim(),"callback_replay_mismatch");
          assert.equal(sql(box,`SELECT status||'|'||version FROM saas.payment_attempts WHERE id='${attempt.attemptId}';`).stdout.trim(),phase==="claim" ? "provider_outcome_unknown|3" : "reconciliation_required|4");
        } finally { if(!observation.snapshot().completed){observation.end();await observation.closed;} }
      }
    });
    await scenario("READ ONLY selector recovers old observations, returns exact proof or normal absence, and fails closed on drift",()=> {
      const none=unknown(box,20);
      assert.equal(readOnlyCall(box,evidenceName,evidenceValues(none)).outcome,"no_observation");
      observe(box,none,1020,"provider_outcome_unknown");
      assert.equal(readOnlyCall(box,evidenceName,evidenceValues(none)).outcome,"no_observation");
      const attempt=observe(box,unknown(box,21),1021,"failed");
      observe(box,attempt,2021,"failed");
      const before=snapshot(box,attempt);
      const selected=readOnlyCall(box,evidenceName,evidenceValues(attempt));
      assert.equal(selected.outcome,"found");
      assert.deepEqual(selected.result,{
        providerCode:"fixture_hosted",callbackBindingDigest:attempt.binding,eventKeyDigest:attempt.eventKey,
        observationFingerprint:FP,status:"failed",providerReference:attempt.providerReference,
        credentialVersion:1,amountMinor:AMOUNT,currency:"TRY",safeCode:"failed"
      });
      for(const [overrides,outcome] of [[{version:2},"version_conflict"],[{environment:"live"},"durable_authority_invalid"],
        [{execution:`sha256:${"f".repeat(64)}`},"durable_authority_invalid"],[{version:null},"invalid_input"],
        [{now:"2026-07-27T12:00:00Z"},"invalid_input"]]) assert.equal(readOnlyCall(box,evidenceName,evidenceValues(attempt,overrides)).outcome,outcome);
      sql(box,`UPDATE saas.merchant_provider_execution_authorities SET enabled=false WHERE provider_code='fixture_hosted';`);
      assert.equal(readOnlyCall(box,evidenceName,evidenceValues(attempt)).outcome,"durable_authority_invalid");
      sql(box,`UPDATE saas.merchant_provider_execution_authorities SET enabled=true WHERE provider_code='fixture_hosted';`);
      const corrupted=sql(box,`BEGIN; SET LOCAL session_replication_role=replica;
        UPDATE saas.payment_attempt_events SET payload_fingerprint='${"f".repeat(64)}' WHERE event_id='${callbackOperationId(1021)}';
        SET LOCAL ROLE celebix_saas_workflow;
        SELECT outcome FROM saas.${evidenceName}(${evidenceValues(attempt)}); ROLLBACK;`).stdout.trim();
      assert.equal(corrupted,"callback_replay_mismatch");
      assert.equal(snapshot(box,attempt),before);
      assert.equal(readOnlyCall(box,evidenceName,evidenceValues(attempt)).outcome,"found");
    });
    await scenario("normal provider-query finalization accepts absent or same-terminal evidence and READ ONLY replay",()=> {
      for (const [ordinal,status,hasObservation] of [[33,"captured",false],[34,"failed",true],[35,"provider_outcome_unknown",true]]) {
        const attempt=unknown(box,ordinal);
        assert.equal(readOnlyCall(box,evidenceName,evidenceValues(attempt)).outcome,"no_observation");
        assert.equal(call(box,"payment_attempt_claim_reconciliation",claimValues(attempt,ordinal).split(",").slice(0,11).join(",")).outcome,"claimed");
        if(hasObservation) observe(box,{...attempt,version:4},2000+ordinal,status==="provider_outcome_unknown" ? "captured" : status);
        const args=finalValues({...attempt,status,safeCode:"query_result"},ordinal).split(",").slice(0,13).join(",");
        assert.equal(call(box,guardedFinalName,args).outcome,status);
        assert.equal(readOnlyCall(box,guardedFinalName,args).outcome,"operation_replayed");
      }
    });
    await scenario("no-observation to provider-query claim races with an opposite callback and BOTH terminal finals fail closed",async()=> {
      for(const [ordinal,status,opposite] of [[30,"captured","failed"],[31,"failed","captured"]]) {
        const attempt=unknown(box,ordinal);
        assert.equal(readOnlyCall(box,evidenceName,evidenceValues(attempt)).outcome,"no_observation");
        assert.equal(call(box,"payment_attempt_claim_reconciliation",claimValues(attempt,ordinal).split(",").slice(0,11).join(",")).outcome,"claimed");
        const before=snapshot(box,attempt);
        const observation=openSqlSession(box);
        try {
          observation.write(`BEGIN; SET LOCAL ROLE celebix_saas_workflow;
            SELECT outcome FROM saas.payment_attempt_apply_hosted_callback(${hostedArgs({...attempt,version:4},2000+ordinal,opposite,{now:"2026-07-27T12:02:00.100Z"})});
            SELECT 'QUERY_OBSERVATION_HELD';\n`);
          await waitUntil("query opposite observation held",()=>observation.snapshot().stdout.includes("QUERY_OBSERVATION_HELD"));
          let done=false;
          const args=finalValues({...attempt,status,safeCode:"query_result"},ordinal).split(",").slice(0,13).join(",");
          const final=sqlAsync(box,`SET application_name='query_callback_${status}_race'; SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.${guardedFinalName}(${args});`).then(result=>{done=true;return result;});
          await waitUntil("query final row lock",()=>sql(box,`SELECT wait_event_type FROM pg_stat_activity WHERE application_name='query_callback_${status}_race';`).stdout.trim()==="Lock");
          assert.equal(done,false);
          observation.write("COMMIT;\n\\q\n");
          assert.equal((await observation.closed).status,0);
          const result=await final;
          assert.equal(result.status,0,result.stderr);
          assert.equal(result.stdout.trim(),"callback_replay_mismatch");
          assert.equal(snapshot(box,attempt),before);
          assert.equal(sql(box,`SELECT count(*) FROM saas.payment_attempt_operations WHERE operation_id='${id("c",ordinal)}';`).stdout.trim(),"0");
        } finally { if(!observation.snapshot().completed){observation.end();await observation.closed;} }
      }
    });
    await scenario("new wrappers preserve ACL and predecessors; guarded DOWN and reapply preserve all payment rows",()=> {
      apply(box,ASSERTIONS);
      assert.equal(predecessorSnapshot(box),predecessors);
      const denied=observe(box,unknown(box,50),1050,"failed");
      for(const role of ["celebix_saas_app","celebix_saas_host_resolver","celebix_saas_identity"]) assert.notEqual(sql(box,`SET ROLE ${role}; SELECT * FROM saas.${claimName}(${claimValues(denied,99)});`,DB,true).status,0);
      const currentData=sql(box,"SELECT 'attempt|'||row_to_json(t)::text FROM saas.payment_attempts t UNION ALL SELECT 'event|'||row_to_json(t)::text FROM saas.payment_attempt_events t UNION ALL SELECT 'operation|'||row_to_json(t)::text FROM saas.payment_attempt_operations t ORDER BY 1;").stdout;
      apply(box,DOWN);
      assert.equal(sql(box,`SELECT count(*) FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN('${claimName}','${finalName}','${evidenceName}','${guardedFinalName}');`).stdout.trim(),"0");
      assert.equal(predecessorSnapshot(box),predecessors);
      assert.equal(sql(box,"SELECT 'attempt|'||row_to_json(t)::text FROM saas.payment_attempts t UNION ALL SELECT 'event|'||row_to_json(t)::text FROM saas.payment_attempt_events t UNION ALL SELECT 'operation|'||row_to_json(t)::text FROM saas.payment_attempt_operations t ORDER BY 1;").stdout,currentData);
      apply(box,UP); apply(box,ASSERTIONS);
      assert.equal(predecessorSnapshot(box),predecessors);
    });
  } finally { stop(box); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
