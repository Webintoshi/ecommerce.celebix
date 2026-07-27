import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP_FILE = "202607270051_payment_method_admin.up.sql";
const DOWN_FILE = "202607270051_payment_method_admin.down.sql";
const ASSERTIONS_FILE = "202607270051_payment_method_admin_assertions.sql";
const MANIFEST_FILE = "phase3j-payment-method-admin-manifest.json";
const PREFLIGHT_FILE = path.join(ROOT, "tests/saas-phase3/payment-provider-admin/isolated-staging-preflight.sql");
const RUNNER_FILE = path.join(ROOT, "tests/saas-phase3/payment-provider-admin/isolated-staging-runner.mjs");
const PHASE3_RUNNER_FILE = path.join(ROOT, "tests/saas-phase3/run-current-suite.mjs");

function read(name) {
  const file = path.join(SQL, name);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

const up = read(UP_FILE);
const down = read(DOWN_FILE);
const assertions = read(ASSERTIONS_FILE);

test("051 adds exact store-scoped payment method tables without sensitive fields", () => {
  assert.match(up, /payment_processing/);
  assert.match(up, /CREATE TABLE saas\.payment_methods/);
  assert.match(up, /CREATE TABLE saas\.payment_method_operations/);
  assert.match(up, /UNIQUE\(store_id,id\)/);
  assert.match(up, /FOREIGN KEY\(store_id,profile_id,provider_code\)[\s\S]*merchant_provider_profiles\(store_id,id,provider_code\)/);
  assert.match(up, /CHECK\(state IN\('active','disabled','emergency_disabled'\)\)/);
  assert.match(up, /CHECK\(position BETWEEN 0 AND 9999\)/);
  assert.match(up, /merchant_provider_public_config_valid\(config\)/);
  assert.match(up, /kind='provider'[\s\S]*profile_id IS NOT NULL[\s\S]*provider_code IS NOT NULL/);
  assert.match(up, /kind IN\('cash_on_delivery','bank_transfer'\)[\s\S]*profile_id IS NULL[\s\S]*provider_code IS NULL/);
  assert.doesNotMatch(up, /\b(?:pan|cvv|card_number|raw_response|api_secret)\b/i);
});

test("051 exposes only exact SECURITY DEFINER authority and no direct table DML", () => {
  for (const name of [
    "payment_method_list",
    "payment_method_save",
    "payment_method_set_state",
    "payment_method_reorder",
    "payment_method_recover_operation",
  ]) {
    assert.match(up, new RegExp(`CREATE FUNCTION saas\\.${name}`));
  }
  assert.match(up, /CREATE FUNCTION saas\.payment_method_reorder[\s\S]*SECURITY DEFINER/);
  assert.match(up, /merchant_admin_authority_error\([\s\S]*'payment_setting',[\s\S]*(?:true|false)/);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)[\s\S]*payment_methods/i);
  assert.match(up, /REVOKE ALL ON saas\.payment_methods,saas\.payment_method_operations[\s\S]*celebix_saas_app/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION[\s\S]*payment_method_list[\s\S]*payment_method_recover_operation[\s\S]*TO celebix_saas_app/);
});

test("operations are append-only replay records and mutations are versioned", () => {
  assert.match(up, /operation_kind IN\('save','set_state','reorder'\)/);
  assert.match(up, /payload_fingerprint char\(64\) NOT NULL/);
  assert.match(up, /result_payload jsonb NOT NULL/);
  assert.match(up, /CREATE TRIGGER payment_method_operations_immutable/);
  assert.match(up, /FOR UPDATE/);
  assert.match(up, /version_conflict/);
  assert.match(up, /operation_mismatch/);
  assert.match(up, /operation_replayed/);
  assert.match(up, /operation_not_found/);
});

test("state and ordering inputs are bounded and exact", () => {
  assert.match(up, /emergency_reason IS NOT NULL[\s\S]*char_length\(emergency_reason\) BETWEEN 3 AND 240/);
  assert.match(up, /jsonb_array_length\(p_items\) BETWEEN 1 AND 100/);
  assert.match(up, /count\(DISTINCT[\s\S]*->>'id'\)[\s\S]*item_count/i);
  assert.match(up, /count\(DISTINCT[\s\S]*->>'position'\)[\s\S]*item_count/i);
  assert.match(up, /ORDER BY id FOR UPDATE/);
  assert.match(up, /invalid_transition/);
});

test("legacy cash on delivery migration reads only the latest active typed truth", () => {
  assert.match(up, /DISTINCT ON \(store_id\)/);
  assert.match(up, /record_kind='payment_setting'/);
  assert.match(up, /status='active'/);
  assert.match(up, /ORDER BY store_id,updated_at DESC,id DESC/);
  assert.match(up, /config->'cashOnDelivery'='true'::jsonb/);
  assert.doesNotMatch(up, /enabledMethods/);
});

test("rollback is drain-guarded and assertions pin live privileges", () => {
  assert.match(down, /PAYMENT_METHOD_ADMIN_ROLLBACK_REQUIRES_DRAIN/);
  assert.match(down, /merchant_provider_profiles/);
  assert.match(down, /payment_methods/);
  assert.match(down, /DROP TABLE saas\.payment_method_operations/);
  assert.match(down, /DROP TABLE saas\.payment_methods/);
  assert.doesNotMatch(down, /DROP TABLE saas\.(?:stores|memberships|merchant_provider_profiles|merchant_admin_records)/);
  assert.match(assertions, /has_table_privilege\('celebix_saas_app','saas\.payment_methods','SELECT,INSERT,UPDATE,DELETE'\)/);
  assert.match(assertions, /payment_processing/);
  assert.match(assertions, /payment_method_reorder/);
});

test("phase 3J manifest pins the approved chain through 051", () => {
  assert.ok(existsSync(path.join(SQL, MANIFEST_FILE)), MANIFEST_FILE);
  const manifest = JSON.parse(readFileSync(path.join(SQL, MANIFEST_FILE), "utf8"));
  assert.equal(manifest.phase, "phase3j-payment-method-admin");
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.externalConnections, 0);
  assert.equal(manifest.productionMutations, 0);
  assert.deepEqual(manifest.migrationChain.slice(-2).map(({ file }) => file), [UP_FILE, ASSERTIONS_FILE]);
  assert.deepEqual(manifest.rollbackArtifacts.slice(-1).map(({ file }) => file), [DOWN_FILE]);
  for (const artifact of [...manifest.migrationChain, ...manifest.rollbackArtifacts]) {
    assert.equal(
      createHash("sha256").update(readFileSync(path.join(SQL, artifact.file))).digest("hex"),
      artifact.sha256,
      artifact.file,
    );
  }
});

test("isolated staging preflight proves the exact 049-050 base and rejects partial 051", () => {
  assert.ok(existsSync(PREFLIGHT_FILE), "isolated staging preflight");
  const preflight = readFileSync(PREFLIGHT_FILE, "utf8");
  assert.match(preflight, /BEGIN READ ONLY/);
  assert.match(preflight, /SET LOCAL ROLE celebix_saas_owner/);
  assert.match(preflight, /merchant_provider_profiles/);
  assert.match(preflight, /merchant_provider_queue/);
  assert.match(preflight, /marketplace_sync/);
  assert.match(preflight, /invoice_reconciliation/);
  assert.match(preflight, /payment_processing/);
  assert.match(preflight, /to_regclass\('saas\.payment_methods'\)/);
  assert.match(preflight, /to_regclass\('saas\.payment_method_operations'\)/);
  assert.match(preflight, /payment_method_%/);
  assert.match(preflight, /ROLLBACK/);
});

test("isolated staging runner pins pushed bytes, encrypts backup, and applies fail-closed", () => {
  assert.ok(existsSync(RUNNER_FILE), "isolated staging runner");
  const runner = readFileSync(RUNNER_FILE, "utf8");
  assert.match(runner, /--source-sha/);
  assert.match(runner, /--dry-run/);
  assert.match(runner, /--apply/);
  assert.match(runner, /rev-parse/);
  assert.match(runner, /branch["'],\s*["']-r["'],\s*["']--contains/);
  assert.match(runner, /phase3j-payment-method-admin-manifest\.json/);
  assert.match(runner, /git[\s\S]*show/);
  assert.match(runner, /createHash\(["']sha256["']\)/);
  assert.match(runner, /CELEBIX_RUNTIME_MODE/);
  assert.match(runner, /approved_staging/);
  assert.match(runner, /CELEBIX_DEPLOYMENT_TIER/);
  assert.match(runner, /isolated_staging/);
  assert.match(runner, /pg_dump/);
  assert.match(runner, /openssl/);
  assert.match(runner, /aes-256-cbc/);
  assert.match(runner, /-pbkdf2/);
  assert.match(runner, /CELEBIX_SAAS_BACKUP_ENCRYPTION_KEY/);
  assert.match(runner, /rmSync/);
  assert.match(runner, /ON_ERROR_STOP=1/);
  assert.match(runner, /--single-transaction/);
  assert.doesNotMatch(runner, /console\.(?:log|error)\([\s\S]*?(?:DATABASE_URL|PASSWORD|ENCRYPTION_KEY)/);
});

test("Phase 3 runner orders provider execution before every payment admin gate", () => {
  const runner = readFileSync(PHASE3_RUNNER_FILE, "utf8");
  const providerHarness = runner.indexOf("provider-execution-foundation/postgres-harness.mjs");
  const paymentHarness = runner.indexOf("payment-provider-admin/postgres-harness.mjs");
  assert.ok(providerHarness >= 0);
  assert.ok(paymentHarness > providerHarness);
  assert.match(runner, /payment-provider-admin\/postgres-harness\.mjs["'],\s*\n\s*total:\s*23/);
  assert.match(runner, /provider-execution-foundation["']:\s*0/);
  assert.match(runner, /payment-provider-admin["']:\s*1/);
});
