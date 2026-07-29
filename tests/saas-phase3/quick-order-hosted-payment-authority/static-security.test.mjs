import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP = "202607270057_quick_order_hosted_payment_authority.up.sql";
const DOWN = "202607270057_quick_order_hosted_payment_authority.down.sql";
const ASSERTIONS = "202607270057_quick_order_hosted_payment_authority_assertions.sql";
const MANIFEST = "phase3p-quick-order-hosted-payment-authority-manifest.json";
const REPOSITORY_FIXTURE = path.join(ROOT, "tests/saas-phase3/quick-order-hosted-payment-authority/repository-postgres-fixture.ts");
const preserved = Object.freeze({
  "202607220024_quick_order_links.up.sql": "519cda0360940c97dd1a63457fd6f27c0e8262de22176e3a893c1db2725e988a",
  "202607220025_quick_order_links_api.up.sql": "5e087e542a47840783ca0bdc851e8a7d8b8069ee01c3f5849b16773138094da9",
  "202607270056_payment_provider_keyed_lifecycle.up.sql": "05441c27a620553d6aee72c763bf68d21e6e7171aefbd5ad048d1ccccf14f845",
});

const source = (file) => existsSync(path.join(SQL, file)) ? readFileSync(path.join(SQL, file), "utf8") : "";

test("057 is additive and protected quick-link and lifecycle donors remain byte exact", () => {
  for (const [file, digest] of Object.entries(preserved)) {
    assert.equal(createHash("sha256").update(source(file)).digest("hex"), digest, file);
  }
  for (const file of [UP, DOWN, ASSERTIONS, MANIFEST]) assert.ok(existsSync(path.join(SQL, file)), file);
  assert.ok(existsSync(REPOSITORY_FIXTURE));
  assert.doesNotMatch(source(UP), /(?:DROP|CREATE OR REPLACE) FUNCTION saas[.]quick_links_(?:create|duplicate)\b/);
});

test("hosted authority is private, exact-method bound, identity sealed, and item type explicit", () => {
  const up = source(UP);
  const assertions = source(ASSERTIONS);
  assert.match(up, /CREATE TABLE saas[.]quick_order_link_hosted_authorities/);
  assert.match(up, /payment_method_id uuid NOT NULL/);
  assert.match(up, /identity_authority char\(64\)/);
  assert.match(up, /sealed_identity jsonb/);
  assert.match(up, /ADD COLUMN item_type text/);
  assert.match(up, /item_type IN\('PHYSICAL','VIRTUAL'\)/);
  assert.match(up, /method[.]state='active'/);
  assert.match(up, /profile[.]execution_evidence_digest/);
  assert.match(up, /merchant_provider_execution_authority_matches/);
  assert.match(up, /provider_code='iyzico_iframe'/);
  assert.match(up, /saas[.]quick_links_create_hosted/);
  assert.match(up, /REVOKE ALL ON TABLE saas[.]quick_order_link_hosted_authorities/);
  assert.match(assertions, /relrowsecurity[\s\S]*relforcerowsecurity/);
  assert.doesNotMatch(`${up}\n${assertions}`, /identityDigest|identity_number|identity_hash|74300864791/i);
});

test("057 binds every new payment attempt to immutable execution evidence and claims only exact current tuples", () => {
  const up = source(UP);
  const down = source(DOWN);
  const assertions = source(ASSERTIONS);
  assert.match(up, /ALTER TABLE saas[.]payment_attempts[\s\S]*ADD COLUMN execution_adapter_version integer[\s\S]*ADD COLUMN execution_evidence_digest text/);
  assert.match(up, /CREATE FUNCTION saas[.]payment_attempt_bind_execution_authority\(\)/);
  assert.match(up, /BEFORE INSERT ON saas[.]payment_attempts/);
  assert.match(up, /PAYMENT_ATTEMPT_EXECUTION_AUTHORITY_INVALID/);
  assert.match(up, /CREATE FUNCTION saas[.]payment_reconciliation_authority\(/);
  assert.match(up, /payment_attempt_claim_reconciliation\([\s\S]*p_execution_environment text[\s\S]*p_execution_adapter_version integer[\s\S]*p_execution_evidence_digest text/);
  assert.match(up, /merchant_provider_execution_authority_matches\([\s\S]*attempt[.]provider_code[\s\S]*p_execution_evidence_digest/);
  assert.match(up, /REVOKE ALL ON FUNCTION[\s\S]*saas[.]payment_attempt_claim_reconciliation\([\s\S]*uuid,uuid,text,bigint,text,uuid,timestamptz,timestamptz[\s\S]*FROM PUBLIC,[\s\S]*celebix_saas_workflow/);
  assert.match(assertions, /PAYMENT_ATTEMPT_EXECUTION_AUTHORITY_ASSERTION_FAILED/);
  assert.match(down, /DROP COLUMN execution_adapter_version[\s\S]*DROP COLUMN execution_evidence_digest/);
});

test("057 serializes exact claims and preflights the complete authority surface", () => {
  const up = source(UP);
  const wrapper = up.match(/CREATE FUNCTION saas[.]payment_attempt_claim_reconciliation\([\s\S]*?p_execution_evidence_digest text[\s\S]*?\n\$f\$;/)?.[0] ?? "";
  const preflight = up.match(/CREATE FUNCTION saas[.]quick_order_hosted_payment_authority_preflight\(\)[\s\S]*?\n\$f\$;/)?.[0] ?? "";
  assert.match(wrapper, /FROM saas[.]payment_attempts WHERE id=p_attempt_id FOR UPDATE/);
  assert.doesNotMatch(wrapper, /FOR SHARE/);
  assert.match(preflight, /payment_attempts_execution_authority_check/);
  assert.match(preflight, /payment_attempt_bind_execution_authority[\s\S]*payment_attempt_execution_authority_immutable/);
  assert.match(preflight, /payment_reconciliation_authority\(uuid,timestamp with time zone\)[\s\S]*'s'::"char"/);
  assert.match(preflight, /payment_attempt_claim_reconciliation\(uuid,uuid,text,bigint,text,uuid,timestamp with time zone,timestamp with time zone,text,integer,text\)/);
  assert.match(preflight, /relrowsecurity[\s\S]*relforcerowsecurity/);
  assert.match(preflight, /procedure[.]proowner=owner_oid[\s\S]*procedure[.]proconfig/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas[.]quick_order_hosted_payment_authority_preflight\(\)[\s\S]*TO celebix_saas_app,celebix_saas_workflow/);
});

test("rollback is drain locked and no secret reaches public projections or app table ACL", () => {
  const up = source(UP);
  const down = source(DOWN);
  assert.match(down, /QUICK_ORDER_HOSTED_AUTHORITY_ROLLBACK_REQUIRES_DRAIN/);
  assert.match(down, /ALTER COLUMN provider_config_id SET NOT NULL/);
  assert.match(up, /REVOKE ALL ON FUNCTION saas[.]guard_quick_link_provider_authority\(\) FROM PUBLIC/);
  assert.match(down, /REVOKE ALL ON FUNCTION saas[.]guard_quick_link_provider_authority\(\) FROM PUBLIC/);
  assert.match(source(ASSERTIONS), /procedure[.]proacl IS DISTINCT FROM/);
  assert.doesNotMatch(up, /GRANT SELECT[^;]*quick_order_link_hosted_authorities[^;]*celebix_saas_app/is);
  for (const projection of ["quick_links_list", "quick_links_get", "quick_links_mutation_projection"]) {
    assert.doesNotMatch(up, new RegExp(`CREATE OR REPLACE FUNCTION saas[.]${projection}\\b`));
  }
  assert.doesNotMatch(`${up}\n${down}`, /\bCASCADE\b|dblink|postgres_fdw|EXECUTE\s+format/i);
});

test("phase3p manifest and cumulative suite include the PG16 gate", () => {
  const manifest = JSON.parse(source(MANIFEST));
  assert.equal(manifest.phase, "phase3p-quick-order-hosted-payment-authority");
  assert.deepEqual(manifest.migrationChain.slice(-2).map(({ file }) => file), [UP, ASSERTIONS]);
  assert.deepEqual(manifest.rollbackArtifacts.map(({ file }) => file), [DOWN]);
  assert.equal(manifest.postgresqlMajor, 16);
  const runner = readFileSync(path.join(ROOT, "tests/saas-phase3/run-current-suite.mjs"), "utf8");
  assert.match(runner, /quick-order-hosted-payment-authority[/]postgres-harness[.]mjs/);
  assert.match(runner, /quick-order-hosted-payment-authority[/]postgres-harness[.]mjs[\s\S]*total:\s*17/);
});

test("storefront startup fails closed unless the exact 057 authority preflight exists and passes", () => {
  const runtime = readFileSync(path.join(ROOT, "apps/storefront-shared/lib/default-runtime.ts"), "utf8");
  assert.match(runtime, /to_regprocedure\('saas[.]quick_order_hosted_payment_authority_preflight\(\)'\)/);
  assert.match(runtime, /saas[.]quick_order_hosted_payment_authority_preflight\(\)\s+AS\s+migration_057/);
  assert.match(runtime, /row[.]migration_057\s*!==\s*true/);
});
