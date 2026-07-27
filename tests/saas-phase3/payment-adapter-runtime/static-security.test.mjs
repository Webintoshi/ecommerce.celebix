import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP_FILE = "202607270052_payment_adapter_runtime.up.sql";
const DOWN_FILE = "202607270052_payment_adapter_runtime.down.sql";
const ASSERTIONS_FILE = "202607270052_payment_adapter_runtime_assertions.sql";
const MANIFEST_FILE = "phase3k-payment-adapter-runtime-manifest.json";
const RUNNER_FILE = path.join(ROOT, "tests/saas-phase3/run-current-suite.mjs");
const previousManifest = JSON.parse(
  readFileSync(path.join(SQL, "phase3j-payment-method-admin-manifest.json"), "utf8"),
);

function read(name) {
  const file = path.join(SQL, name);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

const up = read(UP_FILE);
const down = read(DOWN_FILE);
const assertions = read(ASSERTIONS_FILE);

test("052 creates the exact generic attempt authority without altering historical checkout tables", () => {
  for (const relation of [
    "payment_attempts",
    "payment_attempt_events",
    "payment_callback_bindings",
    "payment_attempt_operations",
  ]) assert.match(up, new RegExp(`CREATE TABLE saas\\.${relation}\\b`));
  assert.match(up, /CHECK\(status IN\(\s*'created','awaiting_customer','submitted','provider_outcome_unknown',\s*'authorized','captured','failed','cancelled','partially_refunded',\s*'refunded','expired','reconciliation_required'\s*\)\)/);
  for (const authority of [
    "store_id", "payment_method_id", "profile_id", "provider_code", "environment",
    "credential_version", "amount_minor", "currency", "order_reference",
  ]) assert.match(up, new RegExp(`\\b${authority}\\b`));
  assert.doesNotMatch(up, /ALTER TABLE saas\.checkout_payment_attempts|DROP TABLE saas\.checkout_payment_attempts/i);
  assert.doesNotMatch(up, /\b(?:card_number|cardholder|track_data|cvv|cvc|raw_payload|raw_response|authorization_header)\b/i);
});

test("callback bindings contain only a digest and immutable server authority", () => {
  assert.match(up, /callback_binding_digest char\(64\) NOT NULL/);
  assert.match(up, /callback_binding_digest~'\^\[a-f0-9\]\{64\}\$'/);
  assert.match(
    up,
    /UNIQUE\(store_id,id,payment_method_id,profile_id,provider_code,environment,credential_version\)/,
  );
  assert.match(
    up,
    /FOREIGN KEY\(\s*store_id,attempt_id,payment_method_id,profile_id,\s*provider_code,environment,credential_version\s*\) REFERENCES saas\.payment_attempts\(\s*store_id,id,payment_method_id,profile_id,\s*provider_code,environment,credential_version\s*\)/,
  );
  assert.match(up, /CREATE TRIGGER payment_callback_bindings_immutable/);
  assert.doesNotMatch(up, /\b(?:callback_token|callback_credential|plaintext_binding|binding_plaintext)\b/i);
  assert.doesNotMatch(up, /digest\s*\(/i);
  assert.doesNotMatch(up, /encode\s*\(/i);
});

test("all runtime authority is owner-defined, forced-RLS, and function-only for workflow", () => {
  assert.match(up, /^BEGIN;\s*SET LOCAL ROLE celebix_saas_owner;/);
  for (const relation of [
    "payment_attempts",
    "payment_attempt_events",
    "payment_callback_bindings",
    "payment_attempt_operations",
  ]) {
    assert.match(up, new RegExp(`ALTER TABLE saas\\.${relation} ENABLE ROW LEVEL SECURITY`));
    assert.match(up, new RegExp(`ALTER TABLE saas\\.${relation} FORCE ROW LEVEL SECURITY`));
  }
  for (const name of [
    "payment_attempt_begin",
    "payment_attempt_mark_initialized",
    "payment_attempt_mark_unknown",
    "payment_callback_authority",
    "payment_attempt_settle_callback",
    "payment_attempt_claim_reconciliation",
    "payment_attempt_finalize_reconciliation",
  ]) {
    assert.match(up, new RegExp(`CREATE FUNCTION saas\\.${name}\\b[\\s\\S]*?SECURITY DEFINER`));
  }
  assert.match(up, /REVOKE ALL ON saas\.payment_attempts,saas\.payment_attempt_events,\s*saas\.payment_callback_bindings,saas\.payment_attempt_operations[\s\S]*celebix_saas_workflow/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION[\s\S]*payment_attempt_begin[\s\S]*payment_attempt_finalize_reconciliation[\s\S]*TO celebix_saas_workflow/);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)\s+ON/i);
  assert.doesNotMatch(up, /TO celebix_saas_app/);
});

test("SQL contains no ambient tenant authority, dynamic SQL, CASCADE, or plaintext credential handling", () => {
  const artifacts = `${up}\n${down}\n${assertions}`;
  const schemaArtifacts = `${up}\n${down}`;
  assert.doesNotMatch(artifacts, /\bcurrent_setting\s*\(/i);
  assert.doesNotMatch(artifacts, /\bset_config\s*\(/i);
  assert.doesNotMatch(artifacts, /\b(?:current_user|session_user)\b/i);
  assert.doesNotMatch(artifacts, /^\s*EXECUTE\s+(?:FORMAT|\w+)/im);
  assert.doesNotMatch(artifacts, /\bCASCADE\b/i);
  assert.doesNotMatch(schemaArtifacts, /\b(?:api_secret|merchant_key|merchant_salt|plaintext|password)\b/i);
});

test("attempt transitions are guarded and events plus operations are append-only", () => {
  assert.match(up, /CREATE FUNCTION saas\.guard_payment_attempt_transition/);
  for (const edge of [
    ["created", "awaiting_customer"],
    ["awaiting_customer", "submitted"],
    ["submitted", "captured"],
    ["provider_outcome_unknown", "reconciliation_required"],
    ["captured", "partially_refunded"],
    ["partially_refunded", "refunded"],
  ]) assert.match(up, new RegExp(`OLD\\.status='${edge[0]}'[\\s\\S]*NEW\\.status[^;]+${edge[1]}`));
  assert.match(up, /PAYMENT_ATTEMPT_AUTHORITY_IMMUTABLE/);
  assert.match(up, /NEW\.version<>OLD\.version\+1/);
  assert.match(up, /CREATE TRIGGER payment_attempt_events_immutable/);
  assert.match(up, /CREATE TRIGGER payment_attempt_operations_immutable/);
  assert.match(up, /operation_mismatch/);
  assert.match(up, /callback_replay_mismatch/);
  assert.match(up, /version_conflict/);
});

test("down migration is drain-guarded and destroys only 052 objects in reverse relation order", () => {
  assert.match(down, /PAYMENT_ADAPTER_RUNTIME_ROLLBACK_REQUIRES_DRAIN/);
  const operations = down.indexOf("DROP TABLE saas.payment_attempt_operations");
  const events = down.indexOf("DROP TABLE saas.payment_attempt_events");
  const bindings = down.indexOf("DROP TABLE saas.payment_callback_bindings");
  const attempts = down.indexOf("DROP TABLE saas.payment_attempts");
  assert.ok(operations >= 0 && events > operations && bindings > events && attempts > bindings);
  assert.doesNotMatch(down, /DROP TABLE saas\.(?:checkout_payment_attempts|payment_methods|merchant_provider_profiles|stores)/);
  assert.doesNotMatch(down, /\bCASCADE\b/i);
});

test("catalog assertions and phase 3K manifest pin the exact chain through 052", () => {
  assert.match(assertions, /relrowsecurity AND relation\.relforcerowsecurity/);
  assert.match(assertions, /has_table_privilege\(\s*'celebix_saas_workflow','saas\.payment_attempts','SELECT,INSERT,UPDATE,DELETE'\)/);
  assert.match(assertions, /has_function_privilege\(\s*'celebix_saas_workflow'/);
  assert.match(assertions, /prosecdef/);
  assert.match(assertions, /celebix_saas_owner/);

  assert.ok(existsSync(path.join(SQL, MANIFEST_FILE)), MANIFEST_FILE);
  const manifest = JSON.parse(readFileSync(path.join(SQL, MANIFEST_FILE), "utf8"));
  assert.equal(manifest.phase, "phase3k-payment-adapter-runtime");
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.externalConnections, 0);
  assert.equal(manifest.productionMutations, 0);
  assert.deepEqual(
    manifest.migrationChain.slice(0, -2),
    previousManifest.migrationChain,
  );
  assert.deepEqual(manifest.migrationChain.slice(-2).map(({ file }) => file), [UP_FILE, ASSERTIONS_FILE]);
  assert.deepEqual(manifest.rollbackArtifacts.map(({ file }) => file), [DOWN_FILE]);
  for (const artifact of [...manifest.migrationChain, ...manifest.rollbackArtifacts]) {
    assert.equal(
      createHash("sha256").update(readFileSync(path.join(SQL, artifact.file))).digest("hex"),
      artifact.sha256,
      artifact.file,
    );
  }
});

test("current cumulative runner executes payment adapter runtime after provider administration", () => {
  const runner = readFileSync(RUNNER_FILE, "utf8");
  const adminHarness = runner.indexOf("payment-provider-admin/postgres-harness.mjs");
  const runtimeHarness = runner.indexOf("payment-adapter-runtime/postgres-harness.mjs");
  assert.ok(adminHarness >= 0);
  assert.ok(runtimeHarness > adminHarness);
  assert.match(runner, /payment-adapter-runtime\/postgres-harness\.mjs["'],\s*\n\s*total:\s*25/);
  assert.match(runner, /payment-adapter-runtime["']:\s*2/);
});
