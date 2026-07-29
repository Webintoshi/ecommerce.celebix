import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP = path.join(SQL, "202607280061_iyzico_iframe_tenant_activation_runtime.up.sql");
const DOWN = path.join(SQL, "202607280061_iyzico_iframe_tenant_activation_runtime.down.sql");
const ASSERTIONS = path.join(SQL, "202607280061_iyzico_iframe_tenant_activation_runtime_assertions.sql");

for (const file of [UP, DOWN, ASSERTIONS]) {
  assert.equal(existsSync(file), true, `missing required 061 artifact: ${path.basename(file)}`);
}

const up = readFileSync(UP, "utf8");
const down = readFileSync(DOWN, "utf8");
const assertions = readFileSync(ASSERTIONS, "utf8");
const routines = [
  "iyzico_iframe_tenant_evidence_begin_current",
  "iyzico_iframe_tenant_evidence_current",
  "iyzico_iframe_tenant_evidence_claim_next",
  "iyzico_iframe_tenant_evidence_claimed_profile",
  "iyzico_iframe_tenant_evidence_activate_current",
  "iyzico_iframe_tenant_activation_runtime_preflight",
];
const currentBody = up.slice(
  up.indexOf("CREATE FUNCTION saas.iyzico_iframe_tenant_evidence_current"),
  up.indexOf("CREATE FUNCTION saas.iyzico_iframe_tenant_evidence_claim_next"),
);

for (const routine of routines) {
  assert.match(up, new RegExp(`CREATE FUNCTION saas\\.${routine}\\b`));
  assert.match(down, new RegExp(`DROP FUNCTION saas\\.${routine}\\b`));
}

assert.match(up, /iyzico_iframe_tenant_evidence_begin\(/);
assert.match(up, /iyzico_iframe_tenant_evidence_claim\(/);
assert.match(up, /iyzico_iframe_tenant_evidence_activate\(/);
assert.match(up, /FOR UPDATE SKIP LOCKED/);
assert.match(up, /payment_methods_one_active_provider_per_store_idx/);
assert.match(up, /payment_method_single_active_provider_preflight/);
assert.match(up, /iyzico_iframe_tenant_evidence_preflight/);
assert.match(up, /md5\(procedure\.prosrc\)=expected_hash/);
assert.match(up, /activationCurrent/);
assert.match(up, /attestationId/);
assert.doesNotMatch(currentBody, /(?:matrixDigest|candidateEvidenceDigest|observationDigest|sealedCredentials)/);
assert.doesNotMatch(up, /INSERT\s+INTO\s+saas\.merchant_provider_execution_authorities/i);
assert.doesNotMatch(up, /\bEXECUTE\s+format\s*\(/i);
assert.doesNotMatch(up, /DROP\s+(?:TABLE|FUNCTION).*CASCADE/i);
assert.match(down, /IYZICO_IFRAME_TENANT_ACTIVATION_RUNTIME_STATE_EXISTS/);
assert.match(down, /IN ACCESS EXCLUSIVE MODE/);
assert.doesNotMatch(down, /CASCADE/i);
assert.match(assertions, /iyzico_iframe_tenant_activation_runtime_preflight\(\)/);
assert.match(assertions, /IYZICO_IFRAME_TENANT_ACTIVATION_RUNTIME_FUNCTION_DRIFT/);
assert.match(assertions, /IYZICO_IFRAME_TENANT_ACTIVATION_RUNTIME_PRIVILEGE_DRIFT/);

process.stdout.write("PASS 061 static security contract\n");
