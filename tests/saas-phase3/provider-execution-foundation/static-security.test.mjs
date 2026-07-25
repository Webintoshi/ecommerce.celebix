import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP_FILE = "202607250049_merchant_provider_profiles.up.sql";
const DOWN_FILE = "202607250049_merchant_provider_profiles.down.sql";
const ASSERTIONS_FILE = "202607250049_merchant_provider_profiles_assertions.sql";
const MANIFEST_FILE = "phase3i-provider-execution-foundation-manifest.json";
const up = readFileSync(path.join(SQL, UP_FILE), "utf8");
const down = readFileSync(path.join(SQL, DOWN_FILE), "utf8");
const assertions = readFileSync(path.join(SQL, ASSERTIONS_FILE), "utf8");
const manifest = JSON.parse(readFileSync(path.join(SQL, MANIFEST_FILE), "utf8"));

test("provider foundation manifest pins the exact 001 through 049 chain", () => {
  assert.equal(manifest.phase, "phase3i-provider-execution-foundation");
  assert.equal(manifest.externalConnections, 0);
  assert.equal(manifest.productionMutations, 0);
  assert.equal(manifest.migrationChain[0].file, "202607110001_roles.up.sql");
  assert.deepEqual(manifest.migrationChain.slice(-2).map(({ file }) => file), [UP_FILE, ASSERTIONS_FILE]);
  assert.deepEqual(manifest.rollbackArtifacts.map(({ file }) => file), [DOWN_FILE]);
  assert.equal(new Set(manifest.migrationChain.map(({ file }) => file)).size, manifest.migrationChain.length);
  for (const artifact of [...manifest.migrationChain, ...manifest.rollbackArtifacts]) {
    const digest = createHash("sha256").update(readFileSync(path.join(SQL, artifact.file))).digest("hex");
    assert.equal(digest, artifact.sha256, artifact.file);
  }
});

test("provider profiles persist only sealed authority and expose a safe projection", () => {
  assert.match(up, /sealed_credentials jsonb NOT NULL/);
  assert.match(up, /credential_digest char\(64\) NOT NULL/);
  assert.match(up, /credential_key_id text NOT NULL/);
  assert.match(up, /FOREIGN KEY\(provider_code,capability\)[\s\S]*merchant_provider_definitions\(provider_code,capability\)/);
  assert.match(up, /merchant_provider_sealed_envelope_valid\(sealed_credentials,credential_key_id\)/);
  assert.doesNotMatch(up, /\b(api_secret|api_password|access_token|refresh_token|raw_response|plaintext_credential)\b/i);
  const projection = /CREATE FUNCTION saas\.merchant_provider_profile_projection[\s\S]*?\n\$f\$;/.exec(up)?.[0] ?? "";
  assert.doesNotMatch(projection, /storeId|sealedCredentials|credentialDigest|credentialKeyId|ciphertext/i);
  assert.match(projection, /maskedAccountReference/);
});

test("application and workflow authorities are disjoint and tables have no direct grants", () => {
  assert.match(up, /REVOKE ALL ON saas\.merchant_provider_definitions,saas\.merchant_provider_profiles,[\s\S]*FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow/);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)[\s\S]*merchant_provider_(?:definitions|profiles|profile_operations)/i);
  const grants = [...up.matchAll(/GRANT EXECUTE ON FUNCTION[\s\S]*?TO (celebix_saas_app|celebix_saas_workflow);/g)];
  const appGrant = grants.find((match) => match[1] === "celebix_saas_app")?.[0] ?? "";
  const workflowGrant = grants.find((match) => match[1] === "celebix_saas_workflow")?.[0] ?? "";
  assert.match(appGrant, /merchant_provider_profile_save/);
  assert.match(appGrant, /merchant_provider_profile_revoke/);
  assert.doesNotMatch(appGrant, /claim_validation|mark_validation/);
  assert.match(workflowGrant, /claim_validation/);
  assert.match(workflowGrant, /mark_validation/);
  assert.doesNotMatch(workflowGrant, /profile_save|profile_revoke|profile_disable/);
  assert.match(assertions, /has_table_privilege\('celebix_saas_app','saas\.merchant_provider_profiles','SELECT,INSERT,UPDATE,DELETE'\)/);
});

test("validation claiming is atomic bounded and never performs provider network work", () => {
  assert.match(up, /FOR UPDATE OF candidate SKIP LOCKED LIMIT 1/);
  assert.match(up, /p_lease_expires_at>p_now\+interval '15 minutes'/);
  assert.match(up, /profile\.credential_version<>p_credential_version OR profile\.version<>p_profile_version/);
  assert.match(up, /p_validation_outcome NOT IN\('validated','rejected'\)/);
  assert.doesNotMatch(`${up}\n${down}\n${assertions}`, /\b(fetch|axios|curl|http_request|dblink|postgres_fdw)\b/i);
});

test("rollback is guarded and removes only the 049 authority surface", () => {
  assert.match(down, /MERCHANT_PROVIDER_PROFILES_ROLLBACK_DRIFT/);
  assert.match(down, /DROP TABLE saas\.merchant_provider_profile_operations;/);
  assert.match(down, /DROP TABLE saas\.merchant_provider_profiles;/);
  assert.match(down, /DROP TABLE saas\.merchant_provider_definitions;/);
  assert.doesNotMatch(down, /DROP TABLE saas\.(?:stores|memberships|subscriptions|merchant_provider_jobs)/);
});
