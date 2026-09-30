import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
const directory = new URL("./", import.meta.url);
test("collection durability migration is manifest-bound and preserves function authority", () => {
 const manifest = JSON.parse(readFileSync(new URL("catalog-collections-manifest.json", directory), "utf8"));
 for (const artifact of manifest.artifacts) assert.equal(createHash("sha256").update(readFileSync(new URL(artifact.file, directory))).digest("hex"), artifact.sha256);
 const up = readFileSync(new URL("202609300182_catalog_collections.up.sql", directory), "utf8");
 assert.match(up, /proacl IS DISTINCT FROM row.acl/);
 assert.match(up, /proconfig IS DISTINCT FROM row.settings/);
 assert.match(up, /prosecdef IS DISTINCT FROM row.security_definer/);
 assert.match(up, /rich_page AS/);
 assert.match(up, /catalog_collection_matching_product_ids/);
 assert.match(up, /resolve_effective_variant_price/);
 assert.match(up, /capacity_exceeded/);
 const down = readFileSync(new URL("202609300182_catalog_collections.down.sql", directory), "utf8");
 assert.match(down, /COLLECTION_ROLLBACK_REQUIRES_FEATURE_DATA_RECOVERY/);
 assert.match(down, /catalog_collection_matching_product_ids\(uuid,jsonb,uuid\)/);
});
test("native collections exercise full membership, tenant authority, paging and V4 navigation", {skip:process.env.CATALOG_COLLECTIONS_NATIVE_POSTGRES!=="1"}, () => {
 const result = spawnSync(process.execPath, [new URL("../../../../../tests/saas-phase3/catalog-collections/postgres-harness.mjs", import.meta.url).pathname], {encoding:"utf8",timeout:300000,maxBuffer:8*1024*1024});
 process.stdout.write(result.stdout);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/38\/38 PASS/);
});
