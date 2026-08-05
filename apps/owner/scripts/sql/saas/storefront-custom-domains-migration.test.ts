import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = Object.freeze({
  up: "202608050088_storefront_custom_domains.up.sql",
  down: "202608050088_storefront_custom_domains.down.sql",
  assertions: "202608050088_storefront_custom_domains_assertions.sql",
  manifest: "phase4h-storefront-custom-domains-manifest.json",
});

function source(name: keyof typeof files): string {
  const selected = new URL(files[name], root);
  return existsSync(selected) ? readFileSync(selected, "utf8") : "";
}

test("088 installs private provider lifecycle and immutable operation authority", () => {
  const up = source("up");
  assert.match(up, /CREATE TABLE saas[.]store_domain_provisioning/u);
  assert.match(up, /CREATE TABLE saas[.]store_domain_operations/u);
  assert.match(up, /ALTER TABLE saas[.]store_domain_provisioning ENABLE ROW LEVEL SECURITY/u);
  assert.match(up, /ALTER TABLE saas[.]store_domain_provisioning FORCE ROW LEVEL SECURITY/u);
  assert.match(up, /ALTER TABLE saas[.]store_domain_operations ENABLE ROW LEVEL SECURITY/u);
  assert.match(up, /ALTER TABLE saas[.]store_domain_operations FORCE ROW LEVEL SECURITY/u);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE).*store_domain_(?:provisioning|operations)/isu);
});

test("088 exposes tenant-authorized merchant RPCs and leased worker RPCs only", () => {
  const up = source("up");
  for (const name of [
    "merchant_store_domain_list",
    "merchant_store_domain_prepare_create",
    "merchant_store_domain_bind_provider",
    "merchant_store_domain_request_recheck",
    "merchant_store_domain_make_primary",
    "merchant_store_domain_disable",
    "store_domain_work_claim",
    "store_domain_work_complete",
    "store_domain_work_fail",
    "resolve_store_domain_origin_health",
  ]) assert.match(up, new RegExp(`CREATE FUNCTION saas[.]${name}\\(`, "u"), name);
  assert.match(up, /merchant_action_authority_error[\s\S]+'custom_domains'[\s\S]+'configuration[.]manage'/u);
  assert.match(up, /FOR UPDATE/u);
  assert.match(up, /SKIP LOCKED/u);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas[.]store_domain_work_claim[\s\S]+TO celebix_saas_workflow/u);
});

test("088 makes the persisted active primary domain the only public canonical authority", () => {
  const up = source("up");
  const assertions = source("assertions");
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]resolve_public_storefront/u);
  assert.match(up, /'canonicalUrl','https:\/\/'\|\|primary_domain[.]hostname\|\|'\/'/u);
  assert.doesNotMatch(up, /'canonicalUrl','https:\/\/'\|\|domain[.]hostname\|\|'\/'/u);
  assert.match(assertions, /STOREFRONT_CUSTOM_DOMAINS_CANONICAL_AUTHORITY_INVALID/u);
});

test("088 guards rollback and pins all SQL artifacts", () => {
  for (const name of Object.values(files)) assert.equal(existsSync(new URL(name, root)), true, `${name} missing`);
  const down = source("down");
  assert.match(down, /STOREFRONT_CUSTOM_DOMAINS_DOWN_BLOCKED/u);
  assert.match(down, /hostname_type='custom_domain'[\s\S]+status='active'/u);
  const manifest = JSON.parse(source("manifest")) as {
    phase: string;
    postgresqlMajor: number;
    externalConnections: number;
    productionMutations: number;
    artifacts: Array<{ file: string; direction: string; sha256: string }>;
  };
  assert.deepEqual(
    { phase: manifest.phase, postgresqlMajor: manifest.postgresqlMajor, externalConnections: manifest.externalConnections, productionMutations: manifest.productionMutations },
    { phase: "phase4h-storefront-custom-domains", postgresqlMajor: 16, externalConnections: 0, productionMutations: 0 },
  );
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [
    [files.up, "up"],
    [files.down, "down"],
    [files.assertions, "verify"],
  ]);
  for (const artifact of manifest.artifacts) {
    assert.equal(createHash("sha256").update(readFileSync(new URL(artifact.file, root))).digest("hex"), artifact.sha256, artifact.file);
  }
});
