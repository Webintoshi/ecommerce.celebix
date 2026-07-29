import assert from "node:assert/strict";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "quick_order_hosted_authority";
const ROLLBACK_DB = "quick_order_hosted_authority_rollback";
const UP = "202607270057_quick_order_hosted_payment_authority.up.sql";
const DOWN = "202607270057_quick_order_hosted_payment_authority.down.sql";
const ASSERTIONS = "202607270057_quick_order_hosted_payment_authority_assertions.sql";
const REPOSITORY_FIXTURE = path.join(import.meta.dirname, "repository-postgres-fixture.ts");
const prior = JSON.parse(readFileSync(path.join(SQL, "phase3o-payment-provider-keyed-lifecycle-manifest.json"), "utf8"));
const FIXTURE = readFileSync(path.join(import.meta.dirname, "fixture.sql"), "utf8");
const STORE = "10000000-0000-4000-8000-000000000057";
const OTHER_STORE = "10000000-0000-4000-8000-000000000058";
const PRINCIPAL = "20000000-0000-4000-8000-000000000057";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000057";
const PLAN = "00000000-0000-4000-8000-000000000001";
const VARIANT = "41000000-0000-4000-8000-000000000057";
const METHOD = "50000000-0000-4000-8000-000000000057";
const OTHER_METHOD = "50000000-0000-4000-8000-000000000058";
const LEGACY_ATTEMPT = "70000000-0000-4000-8000-000000000057";
const BOUND_ATTEMPT = "70000000-0000-4000-8000-000000000058";
const RACE_ATTEMPT = "70000000-0000-4000-8000-000000000059";
const EXECUTION_EVIDENCE = `sha256:${"c".repeat(64)}`;
const NOW = "2026-07-27T12:00:00.000Z";
const TOTAL = 17;
let completed = 0;

const envelope = (key = "quick.current") => `{"algorithm":"A256GCM","ciphertext":"AQ","iv":"AAAAAAAAAAAAAAAA","keyId":"${key}","tag":"AAAAAAAAAAAAAAAAAAAAAA","version":1}`;
const address = `{"recipientName":"Ada Lovelace","phone":"+905551112233","line1":"Test 1","city":"Istanbul","postalCode":"34710","country":"TR"}`;

function bin(name) { const candidate = path.join(PG, name); accessSync(candidate, constants.X_OK); return candidate; }
function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, { cwd: ROOT, input, encoding: "utf8", env: { ...process.env, LC_ALL: "C", LANG: "C" }, maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}
function start() {
  const root = mkdtempSync("/tmp/celebix-quick-hosted-");
  const data = path.join(root, "data"); const socket = path.join(root, "socket");
  const port = 26000 + Math.floor(Math.random() * 5000); mkdirSync(socket, { mode: 0o700 });
  command(bin("initdb"), ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(bin("pg_ctl"), ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { root, data, socket, port };
}
function stop(box) { if (!box) return; command(bin("pg_ctl"), ["-D", box.data, "-m", "fast", "stop"], "", true); rmSync(box.root, { recursive: true, force: true }); }
function sql(box, input, database = DB, allowFailure = false) {
  return command(bin("psql"), ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], input, allowFailure);
}
function apply(box, file, database = DB) { sql(box, readFileSync(path.join(SQL, file), "utf8"), database); }
function pass(label, callback) { callback(); completed += 1; process.stdout.write(`PASS ${completed}/${TOTAL} ${label}\n`); }
async function passAsync(label, callback) { await callback(); completed += 1; process.stdout.write(`PASS ${completed}/${TOTAL} ${label}\n`); }
function client(box, applicationName) {
  return new Client({ host: box.socket, port: box.port, user: "postgres", database: DB, application_name: applicationName });
}
async function waitForClaimWaiters(observer, applicationNames) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const result = await observer.query(`SELECT pg_catalog.count(*)::integer AS waiting
      FROM pg_catalog.pg_stat_activity
      WHERE application_name=ANY($1::text[]) AND state='active' AND wait_event_type='Lock'`, [applicationNames]);
    if (result.rows[0]?.waiting === applicationNames.length) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("both exact reconciliation claims did not reach the lock barrier");
}
function providerGuardAcl(box, database = DB) {
  return sql(box, `SELECT pg_catalog.pg_get_userbyid(procedure.proowner)||'|'||
      COALESCE(procedure.proacl::text,'NULL')||'|'||
      pg_catalog.has_function_privilege('public',procedure.oid,'EXECUTE')::text
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS schema_info ON schema_info.oid=procedure.pronamespace
    WHERE schema_info.nspname='saas' AND procedure.proname='guard_quick_link_provider_authority'
      AND procedure.pronargs=0;`, database).stdout.trim();
}
function authority(store = STORE, principal = PRINCIPAL, membership = MEMBERSHIP) {
  return `'${store}'::uuid,'${principal}'::uuid,'${membership}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${NOW}'::timestamptz`;
}
function hosted({ ordinal, method = METHOD, store = STORE, principal = PRINCIPAL, membership = MEMBERSHIP, identity = true, itemType = "PHYSICAL", fingerprint } = {}) {
  const suffix = String(ordinal).padStart(12, "0");
  const types = itemType === null ? "ARRAY[NULL]::text[]" : `ARRAY['${itemType}']::text[]`;
  const identityArgs = identity
    ? `'${"a".repeat(64)}','${types.slice("ARRAY".length)}'`
    : `NULL,${types}`;
  const args = [
    authority(store, principal, membership),
    `'60000000-0000-4000-8000-${suffix}'::uuid`,
    `ARRAY['80000000-0000-4000-8000-${suffix}'::uuid]`,
    `ARRAY['${VARIANT}'::uuid]`, "ARRAY[1]::bigint[]", `'${method}'::uuid`,
    identity ? `'${"a".repeat(64)}'` : "NULL", types,
    identity ? "'identity.current'" : "NULL", identity ? `'${envelope("identity.current")}'::jsonb` : "NULL",
    "'Ada Lovelace'", "'ada@example.com'", "'+905551112233'",
    `'${address}'::jsonb`, `'${address}'::jsonb`, "NULL", "'hosted'", "0", "0", "24",
    `'${String(ordinal).slice(-1).repeat(64)}'`, "'quick.current'", `'${envelope()}'::jsonb`,
    `'90000000-0000-4000-8000-${suffix}'::uuid`, `'${fingerprint ?? String(ordinal + 1).slice(-1).repeat(64)}'`,
  ].join(",");
  return `SET ROLE celebix_saas_app; SELECT outcome FROM saas.quick_links_create_hosted(${args});`;
}
function legacy(ordinal = 90) {
  const suffix = String(ordinal).padStart(12, "0");
  return `SET ROLE celebix_saas_app; SELECT outcome FROM saas.quick_links_create(
    ${authority()},'61000000-0000-4000-8000-${suffix}',ARRAY['81000000-0000-4000-8000-${suffix}'::uuid],
    ARRAY['${VARIANT}'::uuid],ARRAY[1]::bigint[],'52000000-0000-4000-8000-000000000057',
    'Legacy','legacy@example.com','+905551112233','${address}'::jsonb,'${address}'::jsonb,NULL,NULL,
    0,0,24,'${"e".repeat(64)}','quick.current','${envelope()}'::jsonb,
    '91000000-0000-4000-8000-${suffix}','${"f".repeat(64)}');`;
}
function exactClaim(attemptId, ordinal, expectedVersion = 2) {
  const suffix = String(ordinal).padStart(12, "0");
  return `SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.payment_attempt_claim_reconciliation(
    '${attemptId}','71000000-0000-4000-8000-${suffix}','${String(ordinal).slice(-1).repeat(64)}',${expectedVersion},
    'worker.hosted','72000000-0000-4000-8000-${suffix}','2026-07-27T12:02:00Z','2026-07-27T12:07:00Z',
    'test',1,'${EXECUTION_EVIDENCE}');`;
}

async function main() {
  let box;
  try {
    box = start();
    sql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const { file } of prior.migrationChain) apply(box, file);
    const baselineProviderGuardAcl = providerGuardAcl(box);
    assert.equal(baselineProviderGuardAcl, "celebix_saas_owner|{celebix_saas_owner=X/celebix_saas_owner}|false");
    sql(box, `CREATE DATABASE ${ROLLBACK_DB} TEMPLATE ${DB};`, "postgres");
    sql(box, FIXTURE);
    sql(box, `INSERT INTO saas.payment_attempts(
      id,store_id,payment_method_id,profile_id,provider_code,environment,credential_version,
      order_reference,amount_minor,currency,status,safe_provider_reference,safe_code,
      reconciliation_lease_id,reconciliation_lease_owner,reconciliation_lease_expires_at,
      version,created_at,updated_at
    ) VALUES(
      '${LEGACY_ATTEMPT}','${STORE}','${METHOD}','42000000-0000-4000-8000-000000000057',
      'iyzico_iframe','test',1,'legacy-order',12500,'TRY','provider_outcome_unknown',NULL,
      'provider_outcome_unknown',NULL,NULL,NULL,1,'${NOW}','${NOW}'
    );`);
    apply(box, UP); apply(box, ASSERTIONS);

    pass("PostgreSQL 16 migration, assertions, preflight, RLS and ACL pass", () => {
      assert.match(sql(box, "SHOW server_version;").stdout.trim(), /^16[.]/);
      assert.equal(providerGuardAcl(box), baselineProviderGuardAcl);
      assert.equal(sql(box, "SET ROLE celebix_saas_app; SELECT saas.quick_order_hosted_payment_authority_preflight();").stdout.trim(), "t");
      assert.equal(sql(box, "SET ROLE celebix_saas_workflow; SELECT saas.quick_order_hosted_payment_authority_preflight();").stdout.trim(), "t");
      assert.notEqual(sql(box, "SET ROLE celebix_saas_identity; SELECT saas.quick_order_hosted_payment_authority_preflight();", DB, true).status, 0);
      assert.notEqual(sql(box, "SET ROLE celebix_saas_host_resolver; SELECT saas.quick_order_hosted_payment_authority_preflight();", DB, true).status, 0);
      assert.notEqual(sql(box, "SET ROLE celebix_saas_app; SELECT * FROM saas.quick_order_link_hosted_authorities;", DB, true).status, 0);
    });
    pass("historical null-snapshot attempts fail exact claim without status version or lease mutation", () => {
      assert.equal(sql(box, `SELECT execution_adapter_version IS NULL AND execution_evidence_digest IS NULL
        FROM saas.payment_attempts WHERE id='${LEGACY_ATTEMPT}';`).stdout.trim(), "t");
      assert.equal(sql(box, exactClaim(LEGACY_ATTEMPT, 57, 1)).stdout.trim(), "durable_authority_invalid");
      assert.equal(sql(box, `SELECT status||'|'||version||'|'||(reconciliation_lease_id IS NULL)::text
        FROM saas.payment_attempts WHERE id='${LEGACY_ATTEMPT}';`).stdout.trim(), "provider_outcome_unknown|1|true");
    });
    pass("new begin snapshots the exact current execution tuple in every authority projection", () => {
      const begun = sql(box, `SET ROLE celebix_saas_workflow; SELECT outcome||'|'||
        (result_payload->>'executionAdapterVersion')||'|'||(result_payload->>'executionEvidenceDigest')
        FROM saas.payment_attempt_begin(
          '${STORE}','${NOW}','${BOUND_ATTEMPT}','${"8".repeat(64)}','${METHOD}',
          'bound-order',12500,'TRY','${"9".repeat(64)}'
        );`).stdout.trim();
      assert.equal(begun, `created|1|${EXECUTION_EVIDENCE}`);
      assert.notEqual(sql(box, `UPDATE saas.payment_attempts SET execution_adapter_version=2
        WHERE id='${BOUND_ATTEMPT}';`, DB, true).status, 0);
      assert.notEqual(sql(box, `INSERT INTO saas.payment_attempts(
        id,store_id,payment_method_id,profile_id,provider_code,environment,credential_version,
        execution_adapter_version,execution_evidence_digest,order_reference,amount_minor,currency,
        status,safe_code,version,created_at,updated_at
      ) VALUES(
        '70000000-0000-4000-8000-000000000059','${STORE}','${METHOD}',
        '42000000-0000-4000-8000-000000000057','iyzico_iframe','test',1,1,
        '${EXECUTION_EVIDENCE}','forged-order',12500,'TRY','created','created',1,'${NOW}','${NOW}'
      );`, DB, true).status, 0);
      assert.equal(sql(box, `SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.payment_attempt_mark_unknown(
        '${BOUND_ATTEMPT}','73000000-0000-4000-8000-000000000058','${"a".repeat(64)}',1,1,NULL,
        'provider_outcome_unknown','2026-07-27T12:01:00Z');`).stdout.trim(), "provider_outcome_unknown");
      assert.equal(sql(box, `SET ROLE celebix_saas_workflow; SELECT outcome||'|'||
        (result_payload->>'executionAdapterVersion')||'|'||(result_payload->>'executionEvidenceDigest')
        FROM saas.payment_reconciliation_authority('${BOUND_ATTEMPT}','2026-07-27T12:01:30Z');`).stdout.trim(),
      `found|1|${EXECUTION_EVIDENCE}`);
    });
    await passAsync("concurrent exact claims serialize without deadlock and only one lease mutation wins", async () => {
      assert.equal(sql(box, `SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.payment_attempt_begin(
        '${STORE}','${NOW}','${RACE_ATTEMPT}','${"7".repeat(64)}','${METHOD}',
        'race-order',12500,'TRY','${"6".repeat(64)}'
      );`).stdout.trim(), "created");
      assert.equal(sql(box, `SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.payment_attempt_mark_unknown(
        '${RACE_ATTEMPT}','73000000-0000-4000-8000-000000000059','${"5".repeat(64)}',1,1,NULL,
        'provider_outcome_unknown','2026-07-27T12:01:00Z');`).stdout.trim(), "provider_outcome_unknown");

      const blocker = client(box, "quick_hosted_claim_blocker");
      const first = client(box, "quick_hosted_claim_first");
      const second = client(box, "quick_hosted_claim_second");
      const observer = client(box, "quick_hosted_claim_observer");
      await Promise.all([blocker.connect(), first.connect(), second.connect(), observer.connect()]);
      try {
        await blocker.query("BEGIN");
        await blocker.query(`SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.payment.attempt.operation:'||operation_id::text,0))
          FROM (VALUES
            ('71000000-0000-4000-8000-000000000091'::uuid),
            ('71000000-0000-4000-8000-000000000092'::uuid)
          ) AS operations(operation_id)`);
        await Promise.all([first.query("SET ROLE celebix_saas_workflow"), second.query("SET ROLE celebix_saas_workflow")]);
        const claim = (session, ordinal, owner) => session.query(`SELECT outcome,result_payload
          FROM saas.payment_attempt_claim_reconciliation(
            $1,$2,$3,2,$4,$5,'2026-07-27T12:02:00Z','2026-07-27T12:07:00Z',
            'test',1,$6)`, [
          RACE_ATTEMPT,
          `71000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`,
          String(ordinal).slice(-1).repeat(64),
          owner,
          `72000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`,
          EXECUTION_EVIDENCE,
        ]);
        const pendingClaims = Promise.all([claim(first, 91, "worker.first"), claim(second, 92, "worker.second")]);
        await waitForClaimWaiters(observer, ["quick_hosted_claim_first", "quick_hosted_claim_second"]);
        await blocker.query("COMMIT");
        const claims = await pendingClaims;
        assert.deepEqual(claims.map(({ rows }) => rows[0].outcome).sort(), ["claimed", "version_conflict"]);
        const winner = claims.map(({ rows }) => rows[0]).find(({ outcome }) => outcome === "claimed");
        assert.equal(winner.result_payload.status, "reconciliation_required");
        assert.equal(winner.result_payload.version, 3);
        assert.match(winner.result_payload.leaseOwner, /^worker[.](?:first|second)$/);
        assert.equal(sql(box, `SELECT status||'|'||version||'|'||reconciliation_lease_owner||'|'||
          (SELECT pg_catalog.count(*) FROM saas.payment_attempt_operations operation
            WHERE operation.attempt_id=attempt.id AND operation.operation_kind='claim_reconciliation')||'|'||
          (SELECT pg_catalog.count(*) FROM saas.payment_attempt_events event
            WHERE event.attempt_id=attempt.id AND event.source='reconciliation')
          FROM saas.payment_attempts attempt WHERE attempt.id='${RACE_ATTEMPT}';`).stdout.trim().replace(/worker[.](?:first|second)/, "worker.winner"),
        "reconciliation_required|3|worker.winner|1|1");
      } finally {
        await blocker.query("ROLLBACK").catch(() => {});
        await Promise.all([blocker.end(), first.end(), second.end(), observer.end()]);
      }
    });
    pass("legacy PayTR create remains compatible and has null hosted columns", () => {
      assert.equal(sql(box, legacy()).stdout.trim(), "committed");
      assert.equal(sql(box, "SELECT provider_config_id IS NOT NULL AND hosted_authority_id IS NULL FROM saas.quick_order_links WHERE customer_name='Legacy';").stdout.trim(), "t");
    });
    pass("real repository executes the exact hosted signature and commits Iyzico authority", () => {
      assert.equal(command(process.execPath, [
        "--experimental-transform-types", REPOSITORY_FIXTURE, box.socket, String(box.port), DB,
      ]).stdout.trim(), "repository-hosted-create-committed");
    });
    pass("exact active Iyzico method creates one sealed authority with preserved snapshot", () => {
      assert.equal(sql(box, hosted({ ordinal: 1 })).stdout.trim(), "committed");
      assert.equal(sql(box, `SELECT authority.provider_code||'|'||authority.execution_environment||'|'||item.item_type||'|'||
        (link.shipping_address->>'city')||'|'||(link.shipping_address->>'country')||'|'||(link.shipping_address->>'postalCode')
        FROM saas.quick_order_link_hosted_authorities authority
        JOIN saas.quick_order_links link ON link.id=authority.link_id
        JOIN saas.quick_order_link_items item ON item.quick_order_link_id=link.id
        WHERE authority.link_id='60000000-0000-4000-8000-000000000001';`).stdout.trim(), "iyzico_iframe|test|PHYSICAL|Istanbul|TR|34710");
    });
    pass("public detail contains item type but no identity or method authority", () => {
      const detail = sql(box, `SET ROLE celebix_saas_app; SELECT result_payload FROM saas.quick_links_get(
        ${authority()},'60000000-0000-4000-8000-000000000001');`).stdout.trim();
      assert.match(detail, /"providerKey": "iyzico_iframe"/); assert.match(detail, /"itemType": "PHYSICAL"/);
      assert.doesNotMatch(detail, /identity|paymentMethod|profile|evidence|sealed/i);
    });
    pass("cross-store method substitution fails before insert", () => {
      assert.equal(sql(box, hosted({ ordinal: 2, method: OTHER_METHOD })).stdout.trim(), "provider_not_ready");
    });
    pass("disabled and emergency-disabled methods fail closed", () => {
      sql(box, `UPDATE saas.payment_methods SET state='disabled',updated_at='2026-07-27' WHERE id='${METHOD}';`);
      assert.equal(sql(box, hosted({ ordinal: 3 })).stdout.trim(), "provider_not_ready");
      sql(box, `UPDATE saas.payment_methods SET state='emergency_disabled',emergency_reason='operator lock',updated_at='2026-07-27' WHERE id='${METHOD}';`);
      assert.equal(sql(box, hosted({ ordinal: 4 })).stdout.trim(), "provider_not_ready");
      sql(box, `UPDATE saas.payment_methods SET state='active',emergency_reason=NULL,updated_at='2026-07-27' WHERE id='${METHOD}';`);
    });
    pass("revoked execution evidence fails closed", () => {
      sql(box, "UPDATE saas.merchant_provider_execution_authorities SET enabled=false WHERE provider_code='iyzico_iframe';");
      assert.equal(sql(box, hosted({ ordinal: 5 })).stdout.trim(), "provider_not_ready");
      sql(box, "UPDATE saas.merchant_provider_execution_authorities SET enabled=true WHERE provider_code='iyzico_iframe';");
    });
    pass("missing identity or missing explicit item type is invalid", () => {
      assert.equal(sql(box, hosted({ ordinal: 6, identity: false, itemType: null })).stdout.trim(), "invalid_input");
      assert.equal(sql(box, hosted({ ordinal: 7, itemType: null })).stdout.trim(), "invalid_input");
    });
    pass("cross-store caller authority cannot use another store variant or method", () => {
      assert.equal(sql(box, hosted({ ordinal: 8, store: OTHER_STORE })).stdout.trim(), "membership_denied");
    });
    pass("operation replay is exact and a changed identity authority fingerprint mismatches", () => {
      assert.equal(sql(box, hosted({ ordinal: 9, fingerprint: "7".repeat(64) })).stdout.trim(), "committed");
      assert.equal(sql(box, hosted({ ordinal: 9, fingerprint: "7".repeat(64) })).stdout.trim(), "operation_replayed");
      assert.equal(sql(box, hosted({ ordinal: 9, fingerprint: "8".repeat(64) })).stdout.trim(), "operation_mismatch");
    });
    pass("hosted envelopes cannot be copied to a second link", () => {
      const copied = sql(box, `SET CONSTRAINTS ALL DEFERRED; INSERT INTO saas.quick_order_link_hosted_authorities
        SELECT '60000000-0000-4000-8000-000000000099',store_id,payment_method_id,profile_id,provider_code,
        execution_environment,execution_adapter_version,execution_evidence_digest,identity_authority,identity_key_id,sealed_identity,'${NOW}'
        FROM saas.quick_order_link_hosted_authorities WHERE link_id='60000000-0000-4000-8000-000000000001';`, DB, true);
      assert.notEqual(copied.status, 0);
    });
    pass("supersession between read authority and exact claim performs no reconciliation mutation", () => {
      assert.equal(sql(box, `SELECT saas.merchant_provider_execution_authority_approve(
        'iyzico_iframe','payment_processing','test',2,'sha256:${"e".repeat(64)}',
        'sandbox_ready','2026-07-27T12:01:45Z');`).stdout.trim(), "t");
      assert.equal(sql(box, exactClaim(BOUND_ATTEMPT, 58)).stdout.trim(), "durable_authority_invalid");
      assert.equal(sql(box, `SELECT status||'|'||version||'|'||(reconciliation_lease_id IS NULL)::text||'|'||
        (SELECT pg_catalog.count(*) FROM saas.payment_attempt_operations operation
          WHERE operation.attempt_id=attempt.id AND operation.operation_kind='claim_reconciliation')||'|'||
        (SELECT pg_catalog.count(*) FROM saas.payment_attempt_events event
          WHERE event.attempt_id=attempt.id AND event.source='reconciliation')
        FROM saas.payment_attempts attempt WHERE attempt.id='${BOUND_ATTEMPT}';`).stdout.trim(),
      "provider_outcome_unknown|2|true|0|0");
    });
    pass("down is drain locked and clean down-up assertions restore exactly", () => {
      assert.notEqual(sql(box, readFileSync(path.join(SQL, DOWN), "utf8"), DB, true).status, 0);
      assert.equal(providerGuardAcl(box, ROLLBACK_DB), baselineProviderGuardAcl);
      apply(box, UP, ROLLBACK_DB); apply(box, ASSERTIONS, ROLLBACK_DB);
      assert.equal(providerGuardAcl(box, ROLLBACK_DB), baselineProviderGuardAcl);
      apply(box, DOWN, ROLLBACK_DB);
      assert.equal(providerGuardAcl(box, ROLLBACK_DB), baselineProviderGuardAcl);
      apply(box, UP, ROLLBACK_DB); apply(box, ASSERTIONS, ROLLBACK_DB);
      assert.equal(providerGuardAcl(box, ROLLBACK_DB), baselineProviderGuardAcl);
      assert.equal(sql(box, "SET ROLE celebix_saas_app; SELECT saas.quick_order_hosted_payment_authority_preflight();", ROLLBACK_DB).stdout.trim(), "t");
      assert.equal(sql(box, "SET ROLE celebix_saas_workflow; SELECT saas.quick_order_hosted_payment_authority_preflight();", ROLLBACK_DB).stdout.trim(), "t");
    });
    assert.equal(completed, TOTAL);
  } finally { stop(box); }
}

await main();
