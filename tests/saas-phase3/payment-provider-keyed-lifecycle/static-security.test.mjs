import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP = "202607270056_payment_provider_keyed_lifecycle.up.sql";
const DOWN = "202607270056_payment_provider_keyed_lifecycle.down.sql";
const ASSERTIONS = "202607270056_payment_provider_keyed_lifecycle_assertions.sql";
const MANIFEST = "phase3o-payment-provider-keyed-lifecycle-manifest.json";
const FIXTURE = path.join(ROOT, "tests/saas-phase3/payment-provider-keyed-lifecycle/fixture.sql");
const PRESERVED = Object.freeze({
  "202607250049_merchant_provider_profiles.up.sql": "6c14613a94eae74fe11d75860301636c76395d9ef4e1ab1a312bbf1f14a364f8",
  "202607250049_merchant_provider_profiles.down.sql": "15ddb6ea4fdb4d356d84cfdab8251c150bc84fdc0e6287dd815dd1260df878b0",
  "202607250049_merchant_provider_profiles_assertions.sql": "00e49f4bede3b5b50e023e3dbfeb96486509570dc3a540327ece892b71ef6fec",
  "202607270052_payment_adapter_runtime.up.sql": "48472767b968d52803635c74a6369fdffa7802385595640a9e7ab034a753153a",
  "202607270052_payment_adapter_runtime.down.sql": "e52864a90c27c100ba590535d003131b4814b704f03c1c505af42811a1412600",
  "202607270052_payment_adapter_runtime_assertions.sql": "c50aeefcf8f2183048325ffc77256cb5eb9d1c50b95a7dbdbab0747c59e8b867",
  "202607270053_paytr_iframe_activation_authority.up.sql": "4bf5fa9043260eca952abd4f98dce6da3fad099da25dae971f719778500f4230",
  "202607270053_paytr_iframe_activation_authority.down.sql": "5567ed817ef09374d8870b2edf561cb97f35f96e6b7ba77e8b11ca04f32558b3",
  "202607270053_paytr_iframe_activation_authority_assertions.sql": "617556d41fa684aba3f5a2f56cc12f3fc157df530de5477253a1c42775736397",
  "202607270054_paytr_iframe_sandbox_evidence_history.up.sql": "9805a260db96c186560aadad6525fe46e5cfb8abf9d17e89295a6e223ca2063a",
  "202607270054_paytr_iframe_sandbox_evidence_history.down.sql": "00e84af32c8ea44b1546f79f08ad5b6879ac841db891796f2c2583c7433ea60b",
  "202607270054_paytr_iframe_sandbox_evidence_history_assertions.sql": "dd79f14119953294a33ad6bd91081e66d65083a23bf9dac041c7e54ed1ee1be5",
  "202607270055_hosted_callback_lifecycle.up.sql": "3acb5912ef5fa1de93d672056cffdcbd95771f39ad741a3a4ffacf4d22f16b9a",
  "202607270055_hosted_callback_lifecycle.down.sql": "50c5f38951642000d4a01c1bad1b7f26001d74b110975e37b07c00eb71623e67",
  "202607270055_hosted_callback_lifecycle_assertions.sql": "75864a6e34d031188ccd972c4f20100071b3f05e412b4f15449ee10a3007a627",
});

function source(file) {
  const target = path.join(SQL, file);
  return existsSync(target) ? readFileSync(target, "utf8") : "";
}

test("056 is additive after 055 and preserves every protected migration byte", () => {
  for (const [file, expected] of Object.entries(PRESERVED)) {
    assert.equal(createHash("sha256").update(source(file)).digest("hex"), expected, file);
  }
  assert.ok(existsSync(path.join(SQL, UP)), UP);
  assert.ok(existsSync(path.join(SQL, DOWN)), DOWN);
  assert.ok(existsSync(path.join(SQL, ASSERTIONS)), ASSERTIONS);
  const up = source(UP);
  for (const pinned of [
    "merchant_provider_profile_save",
    "merchant_provider_profile_claim_validation",
    "merchant_provider_profile_mark_validation",
    "payment_method_set_state",
    "payment_attempt_begin",
    "paytr_iframe_test_payment_method_activate",
  ]) {
    assert.doesNotMatch(up, new RegExp(`(?:DROP|CREATE OR REPLACE) FUNCTION saas[.]${pinned}\\b`));
  }
});

test("the PostgreSQL harness uses a credential-free standalone fixture", () => {
  assert.ok(existsSync(FIXTURE), "fixture.sql");
  const fixture = readFileSync(FIXTURE, "utf8");
  assert.doesNotMatch(fixture, /ciphertext|sealed_credentials|credential_digest|merchant_provider_(?:profiles|execution_authorities)|payment_methods|payment_attempts|quick_order_links/i);
  assert.match(readFileSync(path.join(ROOT, "tests/saas-phase3/payment-provider-keyed-lifecycle/postgres-harness.mjs"), "utf8"), /readFileSync\(FIXTURE/);
});

test("056 separates validation identity from an all-null-or-all-exact execution tuple", () => {
  const up = source(UP);
  assert.match(up, /ADD COLUMN allows_verification_without_execution_authority boolean NOT NULL DEFAULT false/);
  assert.match(up, /'iyzico_iframe','payment_processing',true,true/);
  assert.match(up, /ADD COLUMN validation_environment text/);
  assert.match(up, /ADD COLUMN validation_adapter_version integer/);
  assert.match(up, /public_config->>'environment' IS NOT DISTINCT FROM validation_environment/);
  assert.match(up, /execution_environment IS NULL[\s\S]*execution_adapter_version IS NULL[\s\S]*execution_evidence_digest IS NULL/);
  assert.match(up, /execution_environment=validation_environment/);
  assert.match(up, /execution_adapter_version=validation_adapter_version/);
  assert.doesNotMatch(up, /INSERT INTO saas[.]merchant_provider_execution_authorities[\s\S]*iyzico_iframe/);
});

test("056 exposes distinct verification RPCs and preserves exact role boundaries", () => {
  const up = source(UP);
  const assertions = source(ASSERTIONS);
  for (const name of [
    "merchant_provider_profile_save_verification",
    "merchant_provider_profile_claim_verification",
    "merchant_provider_profile_mark_verification",
    "merchant_provider_profile_bind_execution_authority",
    "payment_provider_keyed_lifecycle_preflight",
  ]) assert.match(up, new RegExp(`CREATE FUNCTION saas[.]${name}\\b`));
  assert.match(up, /merchant_provider_profile_save_verification[\s\S]*TO celebix_saas_app/);
  assert.match(up, /merchant_provider_profile_claim_verification[\s\S]*merchant_provider_profile_mark_verification[\s\S]*TO celebix_saas_workflow/);
  assert.match(up, /payment_provider_keyed_lifecycle_preflight\(\)[\s\S]*TO celebix_saas_app,celebix_saas_workflow/);
  assert.doesNotMatch(up, /GRANT EXECUTE ON FUNCTION[^;]*merchant_provider_profile_bind_execution_authority[^;]*TO celebix_saas_(?:app|workflow)/s);
  assert.match(assertions, /pg_catalog[.]md5\(procedure[.]prosrc\)/);
  assert.match(assertions, /relrowsecurity[\s\S]*relforcerowsecurity/);
});

test("056 keeps transient verification unavailability pending and replayable", () => {
  const up = source(UP);
  assert.match(up, /p_validation_outcome NOT IN\('validated','rejected','unavailable'\)/);
  assert.match(up, /\(p_validation_outcome='unavailable'\)<>\(p_outcome_code='validation_unavailable'\)/);
  assert.match(up, /WHEN 'rejected' THEN 'rotation_required'[\s\S]*ELSE 'pending_validation'/);
  assert.match(up, /validation_lease_id=NULL,validation_lease_owner=NULL,validation_lease_expires_at=NULL/);
  assert.match(up, /operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at/);
});

test("056 replaces profile uniqueness and guards creation, activation, and rollback", () => {
  const up = source(UP);
  const down = source(DOWN);
  assert.match(up, /merchant_provider_profiles_one_live_nonpayment_capability_idx/);
  assert.match(up, /merchant_provider_profiles_one_live_payment_environment_idx/);
  assert.match(up, /merchant_provider_profiles_verification_claim_idx/);
  assert.match(up, /RENAME TO payment_method_save_without_execution_authority/);
  assert.match(up, /CREATE FUNCTION saas[.]payment_method_save\(/);
  assert.match(up, /merchant_provider_execution_authority_matches/);
  assert.match(up, /CREATE TRIGGER merchant_provider_profiles_validation_identity_compat/);
  assert.match(up, /CREATE TRIGGER merchant_provider_profiles_disable_bound_methods/);
  assert.match(down, /PAYMENT_PROVIDER_KEYED_LIFECYCLE_ROLLBACK_REQUIRES_DRAIN/);
  assert.match(down, /CREATE UNIQUE INDEX merchant_provider_profiles_one_live_capability_idx/);
  assert.match(down, /RENAME TO payment_method_save/);
  assert.doesNotMatch(`${up}\n${down}`, /\bCASCADE\b|dblink|postgres_fdw|EXECUTE\s+format/i);
});

test("phase3o manifest appends 056 and cumulative runner executes the real PG16 harness", () => {
  const manifestPath = path.join(SQL, MANIFEST);
  assert.ok(existsSync(manifestPath), MANIFEST);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.phase, "phase3o-payment-provider-keyed-lifecycle");
  assert.deepEqual(manifest.migrationChain.slice(-4, -2).map(({ file }) => file), [
    "202607270055_hosted_callback_lifecycle.up.sql",
    "202607270055_hosted_callback_lifecycle_assertions.sql",
  ]);
  assert.deepEqual(manifest.migrationChain.slice(-2).map(({ file }) => file), [UP, ASSERTIONS]);
  assert.deepEqual(manifest.rollbackArtifacts.map(({ file }) => file), [DOWN]);
  assert.equal(manifest.externalConnections, 0);
  assert.equal(manifest.productionMutations, 0);
  const runner = readFileSync(path.join(ROOT, "tests/saas-phase3/run-current-suite.mjs"), "utf8");
  assert.match(runner, /payment-provider-keyed-lifecycle[/]postgres-harness[.]mjs/);
});

test("customer-panel startup preflights the provider-keyed verification repository", () => {
  const runtime = readFileSync(path.join(
    ROOT,
    "apps/customer-panel/lib/server-panel-access/postgres-runtime.ts",
  ), "utf8");
  assert.match(runtime, /to_regprocedure\('saas[.]merchant_provider_profile_save_verification/u);
  assert.match(runtime, /saas[.]payment_provider_keyed_lifecycle_preflight\(\)/u);
  assert.match(runtime, /row[.]payment_provider_keyed_lifecycle !== true/u);
  assert.doesNotMatch(runtime, /WHERE procedure[.]oid = 'saas[.]paytr_iframe_activation_preflight\(\)'/u);
});
