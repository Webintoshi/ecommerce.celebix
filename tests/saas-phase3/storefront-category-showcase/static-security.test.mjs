import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
const ROOT=path.resolve(import.meta.dirname,"../../.."),read=(file)=>readFileSync(path.join(ROOT,file),"utf8");
test("category showcase manifest pins every artifact",()=>{const manifest=JSON.parse(read("apps/owner/scripts/sql/saas/phase3z-storefront-category-showcase-manifest.json"));assert.equal(manifest.postgresqlMajor,16);for(const artifact of [...manifest.artifacts,...manifest.rollbackArtifacts])assert.equal(createHash("sha256").update(read(`apps/owner/scripts/sql/saas/${artifact.file}`)).digest("hex"),artifact.sha256,artifact.file);});
test("category showcase remains store-scoped and server-owned",()=>{const sql=read("apps/owner/scripts/sql/saas/202607300067_storefront_category_showcase.up.sql");assert.match(sql,/category\.store_id=p_store_id/);assert.match(sql,/asset\.store_id=p_store_id/);assert.match(sql,/asset\.asset_kind='category'/);assert.match(sql,/public_storefront_authorized\(p_store_id,p_hostname,p_now\)/);assert.doesNotMatch(sql,/x-forwarded|cookie|searchParams|localStorage|sessionStorage/i);});
test("admin and host roles receive no direct table authority",()=>{const sql=read("apps/owner/scripts/sql/saas/202607300067_storefront_category_showcase.up.sql");assert.doesNotMatch(sql,/GRANT (?:SELECT|INSERT|UPDATE|DELETE)[^;]+(?:storefront_assets|catalog_categories|merchant_admin_records)/is);assert.match(sql,/GRANT EXECUTE ON FUNCTION saas\.public_list_products_by_category[^;]+celebix_saas_host_resolver/s);});
