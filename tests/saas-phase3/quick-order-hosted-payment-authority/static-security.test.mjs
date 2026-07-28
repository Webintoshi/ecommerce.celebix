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
  "202607270056_payment_provider_keyed_lifecycle.up.sql": "601e0dfcdad9adee38f8579bbf1333c55f59b64af883451975a03eeb9112f3d0",
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
});
