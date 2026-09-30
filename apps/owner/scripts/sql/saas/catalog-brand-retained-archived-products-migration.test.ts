import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
const prefix="202609300179_catalog_brand_retained_archived_products";
const up=readFileSync(new URL(`${prefix}.up.sql`,import.meta.url),"utf8");
const down=readFileSync(new URL(`${prefix}.down.sql`,import.meta.url),"utf8");
test("179 patches only the archived predicate for versioned same-brand retained relations",()=>{
  for(const sql of [up,down]){
    assert.match(sql,/pg_catalog\.pg_get_functiondef/);
    assert.match(sql,/CATALOG_BRAND_RETAINED_ARCHIVED_PREDECESSOR_INVALID/);
    assert.match(sql,/proacl IS DISTINCT FROM original_acl/);
    assert.doesNotMatch(sql,/\b(?:UPDATE|INSERT|DELETE|ALTER TABLE|GRANT|REVOKE)\b/);
    assert.match(sql,/p_kind=''brand'' AND p_expected_version IS NOT NULL/);
    assert.match(sql,/retained\.store_id=p_store_id AND retained\.resource_id=p_resource_id AND retained\.product_id=p\.id/);
  }
  const manifest=JSON.parse(readFileSync(new URL("catalog-brand-retained-archived-products-manifest.json",import.meta.url),"utf8"));
  for(const artifact of manifest.artifacts)assert.equal(createHash("sha256").update(readFileSync(new URL(artifact.file,import.meta.url))).digest("hex"),artifact.sha256);
});
test("179 native PostgreSQL reproduces and preserves retained archived brand relations",{skip:process.env.CATALOG_BRAND_RETAINED_ARCHIVED_NATIVE_POSTGRES!=="1"},()=>{
  const result=spawnSync(process.execPath,[new URL("../../../../../tests/saas-phase3/catalog-administration/postgres-harness.mjs",import.meta.url).pathname],{encoding:"utf8",timeout:180000,maxBuffer:8*1024*1024});
  process.stdout.write(result.stdout);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/51\/51 PASS/);
});
