import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const read = (file) => readFileSync(path.join(SQL, file), "utf8");
const files = Object.freeze({
  up: "202608100099_single_authority_category_showcase.up.sql",
  down: "202608100099_single_authority_category_showcase.down.sql",
  assertions: "202608100099_single_authority_category_showcase_assertions.sql",
  manifest: "phase4r-single-authority-category-showcase-manifest.json",
});

test("migration 099 manifest pins the exact single-authority artifacts", () => {
  const manifest = JSON.parse(read(files.manifest));
  assert.equal(manifest.phase, "phase4r-single-authority-category-showcase");
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.externalConnections, 0);
  assert.equal(manifest.productionMutations, 0);
  assert.deepEqual(manifest.artifacts.map(({ file }) => file), [files.up, files.down, files.assertions]);
  for (const artifact of manifest.artifacts) {
    assert.equal(createHash("sha256").update(read(artifact.file)).digest("hex"), artifact.sha256, artifact.file);
  }
});

test("category showcase owns exact finite layout and preserves store-scoped mappings", () => {
  const up = read(files.up);
  const originalAuthority = read("202607300070_storefront_category_showcase.up.sql");
  assert.match(up, /record_kind='category_showcase'/);
  assert.match(up, /'heading','enabled','layout','items'/);
  assert.match(up, /IN \('duo','grid'\)/);
  assert.match(originalAuthority, /category\.store_id=p_store_id/);
  assert.match(originalAuthority, /asset\.store_id=p_store_id/);
  assert.match(originalAuthority, /asset\.asset_kind='category'/);
  assert.match(up, /'categoryShowcase'/);
  assert.match(up, /'layout',showcase_layout/);
  assert.doesNotMatch(up, /navigation|PLACEHOLDER|x-forwarded|cookie|localStorage|sessionStorage/i);
});

test("rollback is explicit and refuses lossy duo removal", () => {
  const down = read(files.down);
  assert.match(down, /celebix\.allow_single_authority_category_showcase_down/);
  assert.match(down, /SINGLE_AUTHORITY_CATEGORY_SHOWCASE_DOWN_DATA_LOSS/);
  assert.match(down, /config->>'layout'='duo'/);
});

test("runtime roles receive no helper or direct table authority", () => {
  const source = `${read(files.up)}\n${read(files.assertions)}`;
  assert.match(source, /REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC,celebix_saas_identity,celebix_saas_app/);
  assert.doesNotMatch(source, /GRANT (?:ALL|SELECT|INSERT|UPDATE|DELETE)[^;]+merchant_admin_records[^;]+celebix_saas_app/is);
  assert.doesNotMatch(source, /https?:\/\/|client_secret|api_key|database_url|r2_secret/i);
});
