import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const directory = new URL("./", import.meta.url);
const files = Object.freeze({
  up: "202609140128_store_domain_replacement_bundles.up.sql",
  down: "202609140128_store_domain_replacement_bundles.down.sql",
  assertions: "202609140128_store_domain_replacement_bundles_assertions.sql",
  manifest: "phase5k-store-domain-replacement-bundles-manifest.json",
});
const source = (name: keyof typeof files) => readFileSync(new URL(files[name], directory), "utf8");

test("replacement migration is additive, tenant-bound, and bounded to one open operation", () => {
  const up = source("up");
  assert.match(up, /CREATE TABLE saas\.store_domain_replacements/u);
  assert.match(up, /FOREIGN KEY\(store_id,source_storefront_domain_id\)/u);
  assert.match(up, /store_domain_replacements_one_open_per_store_idx/u);
  assert.match(up, /CREATE TABLE saas\.store_domain_replacement_actions/u);
  assert.match(up, /operation_replayed/u);
  assert.match(up, /status IN\('preparing','activated','rolled_back'\)/u);
  assert.doesNotMatch(up, /UPDATE saas\.plan_limits/u);
  assert.doesNotMatch(up, /guzide|a828862c/iu);
});

test("activation is paired while cancel and rollback preserve the outgoing rows", () => {
  const up = source("up");
  assert.match(up, /merchant_store_domain_replacement_activate/u);
  assert.match(up, /storefront_provisioning\.ssl_status='active'/u);
  assert.match(up, /admin_domain\.ssl_status='active'/u);
  assert.match(up, /merchant_store_domain_replacement_cancel/u);
  assert.match(up, /merchant_store_domain_replacement_rollback/u);
  assert.doesNotMatch(up, /DELETE FROM saas\.(?:store|admin)_domains/u);
  assert.match(source("down"), /Domain rows are deliberately retained/u);
  assert.match(up, /OLD\.status='rolled_back' AND NEW\.status<>'activated'/u);
  assert.match(up, /selected\.status NOT IN\('preparing','rolled_back'\)/u);
  assert.match(source("down"), /STORE_DOMAIN_REPLACEMENT_DOWN_HISTORY_CONFLICT/u);
  assert.ok(source("down").indexOf("STORE_DOMAIN_REPLACEMENT_DOWN_HISTORY_CONFLICT") < source("down").indexOf("CREATE OR REPLACE FUNCTION"));
});

test("migration artifacts are pinned for disposable PostgreSQL 16 rehearsal", () => {
  const manifest = JSON.parse(source("manifest")) as { phase: string; postgresqlMajor: number; externalConnections: number; productionMutations: number; artifacts: Array<{file:string;direction:string;sha256:string}> };
  assert.deepEqual([manifest.phase,manifest.postgresqlMajor,manifest.externalConnections,manifest.productionMutations], ["phase5k-store-domain-replacement-bundles",16,0,0]);
  assert.deepEqual(manifest.artifacts.map(({file,direction})=>[file,direction]), [[files.up,"up"],[files.down,"down"],[files.assertions,"verify"]]);
  for (const artifact of manifest.artifacts) assert.equal(createHash("sha256").update(readFileSync(new URL(artifact.file,directory))).digest("hex"),artifact.sha256);
});
