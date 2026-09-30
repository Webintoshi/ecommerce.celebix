import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const directory = new URL("./", import.meta.url);
test("collection navigation migration is manifest-bound and preserves function authority", async () => {
 const manifest = JSON.parse(await readFile(new URL("catalog-collection-design-navigation-manifest.json", directory), "utf8"));
 for (const artifact of manifest.artifacts) {
  const source = await readFile(new URL(artifact.file, directory));
  assert.equal(createHash("sha256").update(source).digest("hex"), artifact.sha256);
 }
 const up = await readFile(new URL("202609300183_catalog_collection_design_navigation.up.sql", directory), "utf8");
 assert.match(up, /security_definer boolean NOT NULL/);
 assert.match(up, /proacl IS DISTINCT FROM r.acl/);
 assert.match(up, /prosecdef<>r.security_definer/);
 assert.match(up, /catalog_collection_config_normalized/);
 assert.match(up, /c183_public_destination_predecessor/);
 assert.match(up, /rootLinks/);
 assert.doesNotMatch(up, /UPDATE saas[.]storefront_designs/);
 const down = await readFile(new URL("202609300183_catalog_collection_design_navigation.down.sql", directory), "utf8");
 assert.match(down, /ROLLBACK_REFERENCES_PRESENT/);
 assert.match(down, /pg_get_functiondef\(r.signature::regprocedure\) IS DISTINCT FROM r.migrated_definition/);
});
