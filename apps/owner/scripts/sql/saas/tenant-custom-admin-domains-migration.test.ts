import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const directory = new URL("./", import.meta.url);
const files = Object.freeze({
  up: "202609020120_tenant_custom_admin_domains.up.sql",
  down: "202609020120_tenant_custom_admin_domains.down.sql",
  assertions: "202609020120_tenant_custom_admin_domains_assertions.sql",
  manifest: "phase5g-tenant-custom-admin-domains-manifest.json",
});
const source = (name: keyof typeof files) => readFileSync(new URL(files[name], directory), "utf8");
const up = source("up");
const down = source("down");
const assertions = source("assertions");

test("migration keeps storefront authority separate and adds admin lifecycle state", () => {
  assert.match(up, /ALTER TABLE saas\.admin_domains/u);
  assert.match(up, /ADD COLUMN provider_hostname_id/u);
  assert.match(up, /DROP CONSTRAINT admin_domains_canonical_kind_check/u);
  assert.match(up, /CREATE TABLE saas\.admin_domain_operations/u);
  assert.match(up, /hostname~'\^admin\\\.'/u);
  assert.doesNotMatch(up, /ALTER TABLE saas\.store_domains/u);
});

test("migration replaces exact resolution and auth functions without weakening grants", () => {
  for (const name of ["resolve_public_admin_brand", "issue_returning_panel_session_for_admin_host", "recover_returning_panel_session_for_admin_host", "list_panel_session_store_options", "merchant_admin_domain_list", "merchant_admin_domain_prepare_create", "merchant_admin_domain_make_primary", "merchant_admin_domain_disable"]) {
    assert.match(up, new RegExp(`CREATE(?: OR REPLACE)? FUNCTION saas\\.${name}`));
  }
  assert.match(up, /GRANT EXECUTE[\s\S]*celebix_saas_host_resolver/u);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*admin_domains/iu);
  assert.match(assertions, /ADMIN_CUSTOM_DOMAINS_/u);
  assert.match(down, /DROP TABLE saas\.admin_domain_operations/u);
});

test("migration pins PostgreSQL 16 artifacts and declares no external mutation", () => {
  for (const name of Object.values(files)) assert.equal(existsSync(new URL(name, directory)), true, `${name} missing`);
  const manifest = JSON.parse(source("manifest")) as {
    phase: string; postgresqlMajor: number; externalConnections: number; productionMutations: number;
    artifacts: Array<{ file: string; direction: string; sha256: string }>;
  };
  assert.deepEqual({
    phase: manifest.phase, postgresqlMajor: manifest.postgresqlMajor,
    externalConnections: manifest.externalConnections, productionMutations: manifest.productionMutations,
  }, {
    phase: "phase5g-tenant-custom-admin-domains", postgresqlMajor: 16,
    externalConnections: 0, productionMutations: 0,
  });
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [
    [files.up, "up"], [files.down, "down"], [files.assertions, "verify"],
  ]);
  for (const artifact of manifest.artifacts) {
    assert.equal(createHash("sha256").update(readFileSync(new URL(artifact.file, directory))).digest("hex"), artifact.sha256, artifact.file);
  }
});
