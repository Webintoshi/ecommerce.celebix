import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const directory = new URL("./", import.meta.url);
const files = Object.freeze({
  up: "202609020121_auto_admin_domain_bundles.up.sql",
  down: "202609020121_auto_admin_domain_bundles.down.sql",
  assertions: "202609020121_auto_admin_domain_bundles_assertions.sql",
  manifest: "phase5h-auto-admin-domain-bundles-manifest.json",
});
const source = (name: keyof typeof files) => readFileSync(new URL(files[name], directory), "utf8");

test("migration adds atomic paired intent and conservative adoption without replacing v1 functions", () => {
  const up = source("up");
  assert.match(up, /CREATE FUNCTION saas\.merchant_store_domain_bundle_prepare_create/u);
  assert.match(up, /source_storefront_domain_id/u);
  assert.match(up, /management='system'/u);
  assert.match(up, /admin_domain\.hostname='admin\.'/u);
  assert.doesNotMatch(up, /DROP FUNCTION saas\.merchant_(?:store|admin)_domain_/u);
  assert.doesNotMatch(up, /apps\/admin/u);
});

test("migration keeps merchant table access denied and lifecycle paired", () => {
  const up = source("up");
  assert.match(up, /REVOKE ALL ON saas\.domain_bundle_operations FROM PUBLIC,celebix_saas_app/u);
  assert.match(up, /CREATE FUNCTION saas\.merchant_store_domain_bundle_make_primary/u);
  assert.match(up, /CREATE FUNCTION saas\.merchant_store_domain_bundle_disable/u);
  assert.match(up, /kind='platform_subdomain'/u);
  assert.match(source("down"), /Paired custom hostname rows are retained/u);
  assert.match(source("assertions"), /AUTO_ADMIN_DOMAIN_BUNDLE_ASSERTION_FAILED/u);
});

test("migration artifacts are pinned for disposable PostgreSQL 16 rehearsal", () => {
  const manifest = JSON.parse(source("manifest")) as { phase: string; postgresqlMajor: number; externalConnections: number; productionMutations: number; artifacts: Array<{file:string;direction:string;sha256:string}> };
  assert.deepEqual([manifest.phase,manifest.postgresqlMajor,manifest.externalConnections,manifest.productionMutations], ["phase5h-auto-admin-domain-bundles",16,0,0]);
  assert.deepEqual(manifest.artifacts.map(({file,direction})=>[file,direction]), [[files.up,"up"],[files.down,"down"],[files.assertions,"verify"]]);
  for (const artifact of manifest.artifacts) assert.equal(createHash("sha256").update(readFileSync(new URL(artifact.file,directory))).digest("hex"),artifact.sha256);
});
