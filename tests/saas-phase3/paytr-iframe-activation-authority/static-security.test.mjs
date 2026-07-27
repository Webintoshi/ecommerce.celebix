import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP = "202607270053_paytr_iframe_activation_authority.up.sql";
const DOWN = "202607270053_paytr_iframe_activation_authority.down.sql";
const ASSERTIONS = "202607270053_paytr_iframe_activation_authority_assertions.sql";
const MANIFEST = "phase3l-paytr-iframe-activation-authority-manifest.json";
const PREFLIGHT_HASH = "0302d768e4b58bc06c9a1947ca0bc6dd";

function source(file) {
  const target = path.join(SQL, file);
  return existsSync(target) ? readFileSync(target, "utf8") : "";
}

test("053 defines authority storage without promoting PayTR execution evidence", () => {
  const up = source(UP);
  const beforeApprovalRpc = up.slice(0, up.indexOf("CREATE FUNCTION saas.merchant_provider_execution_authority_approve"));
  assert.match(up, /^BEGIN;\s*SET LOCAL ROLE celebix_saas_owner;/);
  assert.match(up, /'paytr_iframe','payment_processing',true/);
  assert.match(up, /CREATE TABLE saas\.merchant_provider_execution_authorities/);
  assert.match(up, /PRIMARY KEY\(provider_code,environment\)/);
  assert.match(up, /UNIQUE\(provider_code,capability,environment,adapter_version,evidence_digest\)/);
  assert.match(up, /ENABLE ROW LEVEL SECURITY/);
  assert.match(up, /FORCE ROW LEVEL SECURITY/);
  assert.match(up, /REVOKE ALL ON TABLE saas\.merchant_provider_execution_authorities/);
  assert.doesNotMatch(beforeApprovalRpc, /INSERT INTO saas\.merchant_provider_execution_authorities/);
});

test("053 binds exact execution tuples to save, claim, validation, state, and attempt authority", () => {
  const up = source(UP);
  for (const column of [
    "execution_environment",
    "execution_adapter_version",
    "execution_evidence_digest",
  ]) assert.match(up, new RegExp(column));
  assert.match(up, /DROP FUNCTION saas\.merchant_provider_profile_save\([\s\S]*?integer,bigint/);
  assert.match(up, /DROP FUNCTION saas\.merchant_provider_profile_claim_validation\(text,timestamptz,timestamptz,uuid\)/);
  assert.match(up, /DROP FUNCTION saas\.merchant_provider_profile_mark_validation\([\s\S]*?uuid,text,timestamptz/);
  assert.match(up, /merchant_provider_execution_authority_matches\([\s\S]*?p_provider_code,p_capability,p_execution_environment,p_execution_adapter_version,p_execution_evidence_digest/);
  assert.match(up, /candidate\.execution_environment=p_environment/);
  assert.match(up, /candidate\.execution_adapter_version=p_adapter_version/);
  assert.match(up, /candidate\.execution_evidence_digest=p_evidence_digest/);
  assert.match(up, /'executionAuthority',pg_catalog\.jsonb_build_object/);
  assert.match(up, /ALTER FUNCTION saas\.payment_method_set_state[\s\S]*?RENAME TO payment_method_set_state_without_execution_authority/);
  assert.match(up, /ALTER FUNCTION saas\.payment_attempt_begin[\s\S]*?RENAME TO payment_attempt_begin_without_execution_authority/);
  assert.match(up, /IF method\.state='emergency_disabled' THEN[\s\S]*?'invalid_transition'/);
});

test("053 serializes promotion and revocation against shared consumers and invalidates bound state", () => {
  const up = source(UP);
  assert.match(up, /pg_advisory_xact_lock_shared/);
  assert.match(up, /CREATE FUNCTION saas\.merchant_provider_execution_authority_approve[\s\S]*?pg_advisory_xact_lock\(/);
  assert.match(up, /CREATE FUNCTION saas\.merchant_provider_execution_authority_revoke[\s\S]*?pg_advisory_xact_lock\(/);
  assert.match(up, /merchant_provider_execution_authority_invalidate_bound/);
  assert.match(up, /method\.state NOT IN\('disabled','emergency_disabled'\)/);
  assert.match(up, /status=CASE WHEN profile\.status IN\('active','pending_validation'\) THEN 'rotation_required'/);
  assert.match(up, /validation_lease_id=NULL,validation_lease_owner=NULL,validation_lease_expires_at=NULL/);
  assert.match(up, /RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb/);
});

test("053 pins function bodies, exact ACLs, startup preflight, and reversible rollback", () => {
  const up = source(UP);
  const down = source(DOWN);
  const assertions = source(ASSERTIONS);
  const ownerRuntime = readFileSync(path.join(ROOT, "apps/owner/lib/merchant-provider-execution/production.ts"), "utf8");
  const customerRuntime = readFileSync(path.join(ROOT, "apps/customer-panel/lib/server-panel-access/postgres-runtime.ts"), "utf8");
  for (const text of [up, assertions]) {
    assert.match(text, /md5\(procedure\.prosrc\)|md5\(preflight\.prosrc\)/);
    assert.match(text, /search_path=pg_catalog, saas/);
  }
  assert.match(assertions, /PAYTR_IFRAME_ACTIVATION_AUTHORITY_MUST_NOT_BE_SEEDED/);
  assert.match(assertions, new RegExp(PREFLIGHT_HASH));
  assert.match(ownerRuntime, new RegExp(PREFLIGHT_HASH));
  assert.match(customerRuntime, new RegExp(PREFLIGHT_HASH));
  assert.doesNotMatch(`${up}\n${assertions}\n${ownerRuntime}\n${customerRuntime}`, /(?:PREFLIGHT|STAGE|SAVE|CLAIM|MARK)_BODY_HASH/);
  assert.match(down, /PAYTR_IFRAME_ACTIVATION_AUTHORITY_ROLLBACK_REQUIRES_DRAIN/);
  assert.match(down, /DROP TABLE saas\.merchant_provider_execution_authorities/);
  assert.match(down, /RENAME TO payment_method_set_state/);
  assert.match(down, /RENAME TO payment_attempt_begin/);
  assert.doesNotMatch(down, /\bCASCADE\b/i);
});

test("phase3l manifest pins the full immutable chain and rollback artifact", () => {
  const manifestPath = path.join(SQL, MANIFEST);
  assert.ok(existsSync(manifestPath), MANIFEST);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.phase, "phase3l-paytr-iframe-activation-authority");
  assert.equal(manifest.migrationChain.at(-2).file, UP);
  assert.equal(manifest.migrationChain.at(-1).file, ASSERTIONS);
  assert.deepEqual(manifest.rollbackArtifacts.map(({ file }) => file), [DOWN]);
  for (const artifact of [...manifest.migrationChain, ...manifest.rollbackArtifacts]) {
    const digest = createHash("sha256").update(readFileSync(path.join(SQL, artifact.file))).digest("hex");
    assert.equal(digest, artifact.sha256, artifact.file);
  }
});
