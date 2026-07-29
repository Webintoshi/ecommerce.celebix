import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP = "202607270054_paytr_iframe_sandbox_evidence_history.up.sql";
const DOWN = "202607270054_paytr_iframe_sandbox_evidence_history.down.sql";
const ASSERTIONS =
  "202607270054_paytr_iframe_sandbox_evidence_history_assertions.sql";
const MANIFEST =
  "phase3m-paytr-iframe-sandbox-evidence-history-manifest.json";
const SIGNATURE =
  "saas.paytr_iframe_sandbox_evidence_history(uuid,uuid,uuid,uuid,uuid)";

function source(file) {
  const target = path.join(SQL, file);
  return existsSync(target) ? readFileSync(target, "utf8") : "";
}

function functionBody(sql) {
  const start = sql.indexOf("AS $function$");
  const end = sql.indexOf("$function$;", start + 13);
  assert.ok(start >= 0 && end > start, "evidence history function body missing");
  return sql.slice(start + "AS $function$".length, end);
}

test("054 exposes one exact stable security-definer history function", () => {
  const up = source(UP);
  assert.match(up, /^BEGIN;\s*SET LOCAL ROLE celebix_saas_owner;/);
  assert.match(
    up,
    /CREATE FUNCTION saas[.]paytr_iframe_sandbox_evidence_history\(\s*p_success_operation_id uuid,\s*p_decline_operation_id uuid,\s*p_replay_operation_id uuid,\s*p_timeout_operation_id uuid,\s*p_status_operation_id uuid\s*\)/,
  );
  assert.match(up, /RETURNS TABLE\(outcome text,result_payload jsonb\)/);
  assert.match(
    up,
    /LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas/,
  );
  assert.match(up, /p_replay_operation_id<>p_success_operation_id/);
  assert.match(up, /pg_catalog[.]count\(DISTINCT selector\)=4/);
  assert.match(up, /RETURN QUERY SELECT 'incomplete'::text,NULL::jsonb/);
  assert.match(up, /RETURN QUERY SELECT 'found'::text,evidence/);
  assert.match(up, /EXCEPTION WHEN OTHERS THEN/);
});

test("054 derives five bounded legacy facts under one internal provider snapshot", () => {
  const up = source(UP);
  for (const relation of [
    "checkout_payment_attempts",
    "checkout_operations",
    "checkout_callback_receipts",
    "checkout_reconciliation_receipts",
    "checkout_provider_configs",
  ]) assert.match(up, new RegExp(`saas[.]${relation}`));
  for (const binding of [
    "attempt.store_id=authority.store_id",
    "attempt.provider_config_id=authority.provider_config_id",
    "attempt.provider_config_version=authority.provider_config_version",
    "attempt.configuration_digest=authority.configuration_digest",
  ]) assert.match(up, new RegExp(binding.replaceAll(".", "[.]")));
  assert.match(up, /provider[.]provider_key='paytr'/);
  assert.match(up, /success_settlement_count=1/);
  assert.match(up, /success_receipt_count=1/);
  assert.match(up, /timeout_unknown_count=1/);
  assert.match(up, /status_reconcile_count=1/);
  assert.match(up, /status_attempt_id=summary[.]timeout_attempt_id/);
  assert.match(up, /'replayInput',pg_catalog[.]jsonb_build_object/);
  assert.match(up, /'merchantOid',summary[.]replay_merchant_oid/);
  assert.match(up, /'totalAmount',summary[.]replay_total_amount/);
  assert.match(up, /'paymentType',summary[.]replay_payment_type/);
  assert.match(up, /replay_total_amount BETWEEN 1 AND 9007199254740991/);
  assert.match(up, /replay_payment_type IN\('card','eft'\)/);
  assert.match(up, /pg_catalog[.]jsonb_agg\(fact_payload ORDER BY ordinality\)/);
  for (const key of [
    "kind", "operationId", "attemptId", "operationKind", "resultStatus",
    "attemptStatus", "testMode", "replayed", "safeProviderReference",
    "callbackDigest", "startedAt", "completedAt", "amountMinor", "currency",
    "sawUnknown", "sawReconciledCaptured",
  ]) assert.match(up, new RegExp(`'${key}'`));
  assert.doesNotMatch(
    up,
    /'storeId'|'providerConfigId'|'providerConfigVersion'|'configurationDigest'|'order'|'customer'|'resultPayload'/,
  );
});

test("054 grants only app execution and no direct legacy table reads", () => {
  const up = source(UP);
  const assertions = source(ASSERTIONS);
  assert.match(
    up,
    /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator/,
  );
  assert.match(
    up,
    /GRANT EXECUTE ON FUNCTION[\s\S]*TO celebix_saas_app;/,
  );
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|ALL)\s+ON\s+(?:TABLE\s+)?saas[.]checkout_/i);
  assert.doesNotMatch(
    functionBody(up),
    /current_setting|session_user|current_user|EXECUTE\s|format\s*\(|dblink|postgres_fdw/i,
  );
  assert.match(assertions, /procedure[.]proowner=owner_oid/);
  assert.match(assertions, /procedure[.]prosecdef/);
  assert.match(assertions, /procedure[.]provolatile='s'/);
  assert.match(
    assertions,
    /procedure[.]proconfig IS NOT DISTINCT FROM\s+ARRAY\['search_path=pg_catalog, saas'\]::text\[\]/,
  );
  assert.match(assertions, /pg_catalog[.]md5\(procedure[.]prosrc\)=expected_hash/);
  assert.match(assertions, /celebix_saas_app/);
  for (const denied of [
    "celebix_saas_identity",
    "celebix_saas_workflow",
    "celebix_saas_host_resolver",
    "celebix_saas_bootstrap",
    "celebix_saas_observability",
    "celebix_saas_migrator",
  ]) assert.match(assertions, new RegExp(denied));
  assert.match(
    assertions,
    /has_table_privilege\(\s*'celebix_saas_app'/,
  );
});

test("054 assertions pin the exact body and rollback removes only the function", () => {
  const up = source(UP);
  const down = source(DOWN);
  const assertions = source(ASSERTIONS);
  const bodyHash = createHash("md5").update(functionBody(up)).digest("hex");
  assert.match(assertions, new RegExp(bodyHash));
  assert.match(down, /^BEGIN;\s*SET LOCAL ROLE celebix_saas_owner;/);
  assert.match(
    down,
    /DROP FUNCTION saas[.]paytr_iframe_sandbox_evidence_history\(uuid,uuid,uuid,uuid,uuid\)/,
  );
  assert.doesNotMatch(down, /\bCASCADE\b/i);
});

test("phase3m manifest appends 054 and pins rollback while cumulative gate runs its harness", () => {
  const manifestPath = path.join(SQL, MANIFEST);
  assert.ok(existsSync(manifestPath), MANIFEST);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(
    manifest.phase,
    "phase3m-paytr-iframe-sandbox-evidence-history",
  );
  assert.deepEqual(
    manifest.migrationChain.slice(-2).map(({ file }) => file),
    [UP, ASSERTIONS],
  );
  assert.deepEqual(manifest.rollbackArtifacts.map(({ file }) => file), [DOWN]);
  for (const artifact of [...manifest.migrationChain, ...manifest.rollbackArtifacts]) {
    const digest = createHash("sha256")
      .update(readFileSync(path.join(SQL, artifact.file)))
      .digest("hex");
    assert.equal(digest, artifact.sha256, artifact.file);
  }
  const runner = readFileSync(
    path.join(ROOT, "tests/saas-phase3/run-current-suite.mjs"),
    "utf8",
  );
  assert.match(
    runner,
    /payment-sandbox-evidence-history[/]postgres-harness[.]mjs/,
  );
});
