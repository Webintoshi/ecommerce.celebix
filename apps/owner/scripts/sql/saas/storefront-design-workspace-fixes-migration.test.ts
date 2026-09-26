import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
const base = new URL("./", import.meta.url);
const source = (suffix: string) => { const file = new URL(`202609260165_storefront_design_workspace_fixes.${suffix}.sql`, base); return existsSync(file) ? readFileSync(file, "utf8") : ""; };
test("165 validates ordered manual and category asset references with safe publication", () => {
  const up = source("up");
  for (const term of ["productIds", "categoryImages", "storefront_theme_composition_references_valid", "storefront_design_publishable", "publishedDraft", "searchTerms", "available_discounted"]) assert.ok(up.includes(term), term);
  assert.match(up, /p_config->'hero'->>'enabled'/);
  assert.match(up, /section->>'enabled'/);
  assert.match(up, /asset\.store_id=p_store_id/);
  assert.match(up, /product\.store_id=p_store_id/);
  assert.doesNotMatch(up, /THEN 48 ELSE/);
  assert.match(up, /'\/categories\/'/);
});
test("165 rollback preserves the exact former functions and refuses changed design data", () => {
  assert.match(source("up"), /pg_get_functiondef/);
  assert.match(source("down"), /DESIGN_WORKSPACE_FIXES_DOWN_DATA_CHANGED/);
  assert.match(source("down"), /EXECUTE selected\.definition/);
  for (const sql of [source("up"), source("down")]) {
    assert.match(sql, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
    assert.match(sql, /COMMIT;\s*$/);
  }
});

test("165 locks design writes before snapshot capture and rollback guard", () => {
  const lock = "LOCK TABLE saas.storefront_designs IN EXCLUSIVE MODE;";
  const up = source("up");
  const down = source("down");
  assert.ok(up.indexOf(lock) >= 0 && up.indexOf(lock) < up.indexOf("INSERT INTO saas.storefront_design_workspace_fixes_backup(identity,original)"));
  assert.ok(down.indexOf(lock) >= 0 && down.indexOf(lock) < down.indexOf("DO $rollback$"));
});

test("165 public pages project optional absent bodies as an empty string", () => {
  assert.match(source("up"), /'body',COALESCE\(page\.config->>'body',''\)/);
});

test("165 keeps selection extensions out of the legacy merchant validator", () => {
  assert.match(source("up"), /CREATE FUNCTION saas\.storefront_design_composition_valid\(p_config jsonb\)/);
  assert.doesNotMatch(source("up"), /CREATE OR REPLACE FUNCTION saas\.campaign_starter_composition_valid/);
});

test("165 verification artifacts are complete and checksum pinned", async () => {
  const { createHash } = await import("node:crypto");
  const file = new URL("phase5-storefront-design-workspace-fixes-manifest.json", base);
  assert.equal(existsSync(file), true);
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.externalConnections, 0);
  assert.equal(manifest.productionMutations, 0);
  for (const artifact of manifest.artifacts) assert.equal(createHash("sha256").update(readFileSync(new URL(artifact.file, base))).digest("hex"), artifact.sha256);
});
