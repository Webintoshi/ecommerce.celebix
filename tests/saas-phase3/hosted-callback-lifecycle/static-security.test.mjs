import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP = "202607270055_hosted_callback_lifecycle.up.sql";
const DOWN = "202607270055_hosted_callback_lifecycle.down.sql";
const ASSERTIONS = "202607270055_hosted_callback_lifecycle_assertions.sql";
const MANIFEST = "phase3n-hosted-callback-lifecycle-manifest.json";
const REPOSITORY = path.join(ROOT, "packages/saas-data/src/payment-attempts/repository.ts");
const SIGNATURE = "saas.payment_attempt_apply_hosted_callback(text,text,uuid,text,text,bigint,bigint,text,text,text,bigint,text,timestamptz)";
const PRESERVED = Object.freeze({
  "202607270052_payment_adapter_runtime.up.sql": "48472767b968d52803635c74a6369fdffa7802385595640a9e7ab034a753153a",
  "202607270052_payment_adapter_runtime_assertions.sql": "c50aeefcf8f2183048325ffc77256cb5eb9d1c50b95a7dbdbab0747c59e8b867",
  "202607270053_paytr_iframe_activation_authority.up.sql": "4bf5fa9043260eca952abd4f98dce6da3fad099da25dae971f719778500f4230",
  "202607270053_paytr_iframe_activation_authority_assertions.sql": "617556d41fa684aba3f5a2f56cc12f3fc157df530de5477253a1c42775736397",
  "202607270054_paytr_iframe_sandbox_evidence_history.up.sql": "9805a260db96c186560aadad6525fe46e5cfb8abf9d17e89295a6e223ca2063a",
  "202607270054_paytr_iframe_sandbox_evidence_history_assertions.sql": "dd79f14119953294a33ad6bd91081e66d65083a23bf9dac041c7e54ed1ee1be5",
  "202607270054_paytr_iframe_sandbox_evidence_history.down.sql": "00e84af32c8ea44b1546f79f08ad5b6879ac841db891796f2c2583c7433ea60b",
});

function source(file) {
  const target = path.join(SQL, file);
  return existsSync(target) ? readFileSync(target, "utf8") : "";
}

test("055 is additive and preserves the immutable 052/053/054 migration bytes", () => {
  for (const [file, expected] of Object.entries(PRESERVED)) {
    assert.equal(createHash("sha256").update(source(file)).digest("hex"), expected, file);
  }
  assert.ok(existsSync(path.join(SQL, UP)), UP);
  assert.ok(existsSync(path.join(SQL, DOWN)), DOWN);
  assert.ok(existsSync(path.join(SQL, ASSERTIONS)), ASSERTIONS);
  const up = source(UP);
  assert.match(
    up,
    /CREATE FUNCTION saas[.]payment_attempt_apply_hosted_callback\([\s\S]*p_now timestamptz\s*\)/,
  );
  assert.doesNotMatch(up, /CREATE OR REPLACE|ALTER FUNCTION saas[.]payment_attempt_settle_callback/i);
});

test("hosted callback SQL records callback identity and keeps the transition trigger strict", () => {
  const up = source(UP);
  const repository = readFileSync(REPOSITORY, "utf8");
  const legacyParser = repository.match(/function parseMutation\([\s\S]*?\n}\n\nfunction parseHostedCallbackMutation/)?.[0] ?? "";
  assert.match(up, /p_status NOT IN\('captured','failed','provider_outcome_unknown'\)/);
  assert.match(up, /'callback'/);
  assert.match(up, /p_event_key_digest/);
  assert.match(up, /ADD COLUMN observed_callback_status text/);
  assert.match(up, /observed_callback_status IN\(\s*'captured','failed','provider_outcome_unknown'\s*\)/);
  assert.match(up, /pg_catalog[.]sha256/);
  assert.match(up, /callback[.]intermediate[.]digest[.]v1/);
  assert.match(up, /'mark_unknown'/);
  assert.match(up, /attempt[.]status='awaiting_customer'/);
  assert.match(up, /status='submitted'/);
  assert.match(up, /status=p_status/);
  assert.match(up, /attempt[.]status IN\('provider_outcome_unknown','reconciliation_required'\)/);
  assert.match(up, /RETURN QUERY SELECT 'processing'/);
  assert.doesNotMatch(up, /CREATE OR REPLACE FUNCTION saas[.]guard_payment_attempt_transition/);
  assert.doesNotMatch(legacyParser, /processingProjection/);
});

test("055 pins owner/security/ACL and rollback removes only the additive RPC and observation column", () => {
  const up = source(UP);
  const down = source(DOWN);
  const assertions = source(ASSERTIONS);
  assert.match(up, /LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas/);
  assert.match(up, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION[\s\S]*TO celebix_saas_workflow/);
  assert.match(assertions, /PAYMENT_HOSTED_CALLBACK_LIFECYCLE_/);
  assert.match(assertions, /pg_catalog[.]md5\(procedure[.]prosrc\)/);
  assert.match(assertions, /observed_callback_status/);
  assert.match(down, /DROP FUNCTION saas[.]payment_attempt_apply_hosted_callback/);
  assert.match(down, /DROP COLUMN observed_callback_status/);
  assert.match(down, /PAYMENT_HOSTED_CALLBACK_LIFECYCLE_ROLLBACK_OBSERVATIONS_PRESENT/);
  assert.doesNotMatch(down, /\bCASCADE\b|DROP TABLE|payment_attempt_settle_callback/i);
});

test("phase3n manifest and cumulative runner include the PostgreSQL 16 lifecycle harness", () => {
  const manifestPath = path.join(SQL, MANIFEST);
  assert.ok(existsSync(manifestPath), MANIFEST);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.phase, "phase3n-hosted-callback-lifecycle");
  assert.deepEqual(manifest.migrationChain.slice(-2).map(({ file }) => file), [UP, ASSERTIONS]);
  assert.deepEqual(manifest.rollbackArtifacts.map(({ file }) => file), [DOWN]);
  const runner = readFileSync(path.join(ROOT, "tests/saas-phase3/run-current-suite.mjs"), "utf8");
  assert.match(runner, /hosted-callback-lifecycle[/]postgres-harness[.]mjs/);
});
