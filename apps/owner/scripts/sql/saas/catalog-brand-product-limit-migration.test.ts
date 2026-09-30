import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
const prefix = "202609300178_catalog_brand_product_limit";
const up = readFileSync(new URL(`${prefix}.up.sql`,import.meta.url),"utf8");
const down = readFileSync(new URL(`${prefix}.down.sql`,import.meta.url),"utf8");
test("178 changes only the existing brand relation bound without data or privilege rewrites", () => {
  for(const sql of [up,down]) {
    assert.match(sql,/pg_catalog\.pg_get_functiondef/);
    assert.match(sql,/CATALOG_BRAND_PRODUCT_LIMIT_PREDECESSOR_INVALID/);
    assert.match(sql,/proacl IS DISTINCT FROM original_acl/);
    assert.doesNotMatch(sql,/\b(?:UPDATE|INSERT|DELETE|ALTER TABLE|GRANT|REVOKE)\b/);
  }
  assert.match(up,/CASE WHEN p_kind=''brand'' THEN 10000 ELSE 100 END/);
  const manifest = JSON.parse(readFileSync(new URL("catalog-brand-product-limit-manifest.json",import.meta.url),"utf8"));
  for(const artifact of manifest.artifacts) assert.equal(createHash("sha256").update(readFileSync(new URL(artifact.file,import.meta.url))).digest("hex"),artifact.sha256);
});
test("178 native PostgreSQL reproduces and fixes imported brand logo saves", {skip: process.env.CATALOG_BRAND_PRODUCT_LIMIT_NATIVE_POSTGRES !== "1"}, () => {
  const result = spawnSync(process.execPath,[new URL("../../../../../tests/saas-phase3/catalog-administration/postgres-harness.mjs",import.meta.url).pathname],{encoding:"utf8",timeout:180000,maxBuffer:8*1024*1024});
  process.stdout.write(result.stdout);
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/43\/43 PASS/);
});
