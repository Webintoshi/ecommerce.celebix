import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP = path.join(SQL, "202607280060_iyzico_iframe_tenant_sandbox_evidence.up.sql");
const DOWN = path.join(SQL, "202607280060_iyzico_iframe_tenant_sandbox_evidence.down.sql");
const ASSERTIONS = path.join(SQL, "202607280060_iyzico_iframe_tenant_sandbox_evidence_assertions.sql");

for (const file of [UP, DOWN, ASSERTIONS]) {
  assert.equal(existsSync(file), true, `missing required 060 artifact: ${path.basename(file)}`);
}

const up = readFileSync(UP, "utf8");
const down = readFileSync(DOWN, "utf8");
const assertions = readFileSync(ASSERTIONS, "utf8");

for (const table of [
  "iyzico_iframe_tenant_evidence_runs",
  "iyzico_iframe_tenant_evidence_cases",
  "iyzico_iframe_tenant_evidence_events",
  "iyzico_iframe_tenant_evidence_attestations",
  "iyzico_iframe_tenant_activation_fences",
]) {
  assert.match(up, new RegExp(`CREATE TABLE saas\\.${table}\\b`));
  assert.match(up, new RegExp(`ALTER TABLE saas\\.${table} FORCE ROW LEVEL SECURITY`));
  assert.match(up, new RegExp(`REVOKE ALL ON (?:TABLE )?saas\\.${table}`));
}

for (const routine of [
  "iyzico_iframe_tenant_evidence_begin",
  "iyzico_iframe_tenant_evidence_claim",
  "iyzico_iframe_tenant_evidence_record_event",
  "iyzico_iframe_tenant_evidence_finalize",
  "iyzico_iframe_tenant_evidence_activate",
  "iyzico_iframe_tenant_evidence_preflight",
]) {
  assert.match(up, new RegExp(`CREATE FUNCTION saas\\.${routine}\\b`));
}

assert.match(up, /payment_methods_one_active_provider_per_store_idx/);
assert.match(up, /payment_method_single_active_provider_preflight/);
assert.match(up, /provider_already_active/);
assert.match(up, /merchant_provider_profile_bind_execution_authority/);
assert.match(up, /LOCK TABLE saas\.payment_methods,saas\.merchant_provider_profiles\s+IN SHARE ROW EXCLUSIVE MODE/);
assert.match(up, /UPDATE saas\.payment_methods SET[\s\S]+provider_code='iyzico_iframe'[\s\S]+state='active'/);
assert.match(up, /UPDATE saas\.merchant_provider_profiles SET[\s\S]+execution_environment=NULL/);
assert.match(up, /TG_OP='INSERT'/);
assert.match(up, /BEFORE INSERT OR UPDATE ON saas\.merchant_provider_profiles/);
assert.match(up, /callback_mismatch/);
assert.match(up, /controlled_timeout_recovery/);
assert.equal((up.match(/success_captured\.attempt_id<>callback_original\.attempt_id/g) ?? []).length, 2);
assert.equal((up.match(/count\(DISTINCT semantic\.digest\)/g) ?? []).length, 2);
assert.match(up, /FOR UPDATE/);
assert.match(up, /pg_advisory_xact_lock/);
assert.match(up, /md5\(procedure\.prosrc\)=expected_hash/);
assert.match(up, /trigger\.tgfoid<>expected\.function_oid/);
assert.match(up, /trigger\.tgtype<>expected\.trigger_type/);
assert.match(up, /pg_get_indexdef\(index\.indexrelid\)/);
assert.match(up, /pg_get_constraintdef\(constraint_record\.oid,false\)/);
assert.equal((up.match(/4d2e4b456b88573c83de9bd47ce05f62/g) ?? []).length, 1);
assert.equal((assertions.match(/4d2e4b456b88573c83de9bd47ce05f62/g) ?? []).length, 1);
assert.equal((up.match(/2713924292a3929427f25dc8cbc90a3c/g) ?? []).length, 1);
assert.equal((assertions.match(/2713924292a3929427f25dc8cbc90a3c/g) ?? []).length, 1);
assert.match(up, /index\.indisunique AND index\.indisvalid AND index\.indisready/);
assert.match(assertions, /index\.indisunique AND index\.indisvalid AND index\.indisready/);
assert.match(up, /privilege\.grantee NOT IN\(owner_oid,app_oid,workflow_oid\)/);
assert.match(assertions, /privilege\.grantee NOT IN\(owner_oid,app_oid,workflow_oid\)/);
assert.match(up, /procedure\.oid=immutability_guard_oid[\s\S]{0,240}NOT procedure\.prosecdef/);
assert.match(assertions, /procedure\.oid=immutability_guard_oid[\s\S]{0,240}NOT procedure\.prosecdef/);
assert.match(assertions, /IYZICO_IFRAME_TENANT_EVIDENCE_ANCESTOR_BOUNDARY_INVALID/);
assert.match(assertions, /IYZICO_IFRAME_TENANT_EVIDENCE_IMMUTABILITY_GUARD_INVALID/);
assert.doesNotMatch(up, /INSERT\s+INTO\s+saas\.merchant_provider_execution_authorities/i);
assert.doesNotMatch(up, /^\s*(?:secret|token|request_body|response_body|request_headers|response_headers|email|phone|address|identity_number)\s+[^\n,]+[,)]/im);
assert.doesNotMatch(up, /\bEXECUTE\s+format\s*\(/i);
assert.doesNotMatch(up, /DROP\s+(?:TABLE|FUNCTION).*CASCADE/i);

assert.match(down, /EVIDENCE_EXISTS/);
assert.match(down, /ACTIVE_OR_EXECUTABLE_STATE_EXISTS/);
assert.match(down, /LOCK TABLE[\s\S]+IN ACCESS EXCLUSIVE MODE/);
assert.doesNotMatch(down, /CASCADE/i);
assert.match(assertions, /iyzico_iframe_tenant_evidence_preflight\(\)/);
assert.match(assertions, /payment_method_single_active_provider_preflight\(\)/);
assert.match(assertions, /IYZICO_IFRAME_TENANT_EVIDENCE_FUNCTION_DRIFT/);
assert.match(assertions, /md5\(procedure\.prosrc\)=expected_hash/);

process.stdout.write("PASS 060 static security contract\n");
