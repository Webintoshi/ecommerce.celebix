import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
const root=new URL('../../../../',import.meta.url);
const sql=new URL('apps/owner/scripts/sql/saas/',root);
const up=readFileSync(new URL('202609290173_content_authoring_failed_usage.up.sql',sql),'utf8');
const down=readFileSync(new URL('202609290173_content_authoring_failed_usage.down.sql',sql),'utf8');
const frozen={
  "202609290170_content_authoring_operations.up.sql": "b8cb21e9fc58192366f7e094af543ac283cfa30cae19118d78a39bc93f037990",
  "202609290170_content_authoring_operations.down.sql": "28a42428346d649a32c859551768d142580f8504cd029463aed39e8a1f042c58",
  "202609290171_storefront_product_seo.up.sql": "1c416275e571ba4a1e2a59e803b80b477ee01ccdf1b3ac09c70492b4277cf9c6",
  "202609290171_storefront_product_seo.down.sql": "daaec220ac95ddb5734ef7c9aa40f9995d02226934a9dc3eddf8cd3c1f77143a",
  "202609290172_content_authoring_origins.up.sql": "23280834acd71fe5523a458b2bdef567840254fa3ceeae0fdbced52f436d9f22",
  "202609290172_content_authoring_origins.down.sql": "1e874f765bc55ff489737fe5323ba96eef5ad4c03022fac06630026aeb9869e2"
};
test('173 adds one isolated failure writer while applied migration bytes remain frozen',()=>{
 for(const [name,hash]of Object.entries(frozen))assert.equal(createHash('sha256').update(readFileSync(new URL(name,sql))).digest('hex'),hash,name);
 assert.equal((up.match(/CREATE FUNCTION /g)||[]).length,1);assert.doesNotMatch(up,/CREATE OR REPLACE|ALTER TABLE|DROP|CREATE TABLE/);
 assert.match(up,/saas\.content_authoring_fail_v2/);assert.match(up,/content_authoring_usage_valid\(p_usage\) IS NOT TRUE/);
 assert.match(up,/content_authoring\.store:/);assert.match(up,/FOR UPDATE/);assert.match(up,/FROM saas\.content_authoring_fail\(/);
 assert.match(up,/op\.usage IS DISTINCT FROM measured/);assert.match(up,/GET DIAGNOSTICS changed=ROW_COUNT/);
 assert.match(up,/SET search_path=pg_catalog,saas/);assert.match(up,/FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver/);
 assert.doesNotMatch(down,/DELETE|UPDATE|DROP TABLE|CASCADE/);assert.equal((down.match(/DROP FUNCTION /g)||[]).length,1);
});
// Included by saas-data's existing src/**/*.test.ts glob. Opt in only to a local
// Unix-socket feature-up template, cloned and dropped by the native harness.
test('native failed usage PostgreSQL acceptance', {skip:process.env.CONTENT_AUTHORING_NATIVE_POSTGRES!=='1'},()=>{
 const result=spawnSync(process.execPath,[new URL('tests/saas-phase3/content-authoring-failed-usage/postgres-harness.mjs',root).pathname],{encoding:'utf8',timeout:60000});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS concurrent replay/);
});
