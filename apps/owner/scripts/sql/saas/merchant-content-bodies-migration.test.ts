import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
const frozen={
  "202609290170_content_authoring_operations.down.sql": "28a42428346d649a32c859551768d142580f8504cd029463aed39e8a1f042c58",
  "202609290170_content_authoring_operations.up.sql": "b8cb21e9fc58192366f7e094af543ac283cfa30cae19118d78a39bc93f037990",
  "202609290171_storefront_product_seo.down.sql": "daaec220ac95ddb5734ef7c9aa40f9995d02226934a9dc3eddf8cd3c1f77143a",
  "202609290171_storefront_product_seo.up.sql": "1c416275e571ba4a1e2a59e803b80b477ee01ccdf1b3ac09c70492b4277cf9c6",
  "202609290172_content_authoring_origins.down.sql": "1e874f765bc55ff489737fe5323ba96eef5ad4c03022fac06630026aeb9869e2",
  "202609290172_content_authoring_origins.up.sql": "23280834acd71fe5523a458b2bdef567840254fa3ceeae0fdbced52f436d9f22",
  "202609290173_content_authoring_failed_usage.down.sql": "9c9b76aa622c401496624ed4aa951f6d73ff4b643194aeb86ae92e693761e022",
  "202609290173_content_authoring_failed_usage.up.sql": "a0d7b94fa541d34d6487ebae00bf5476a0359b5956d41cd8cecdf1b6573d9950"
};
test('174 leaves every applied product authoring migration byte immutable',()=>{
 for(const [file,sha] of Object.entries(frozen))assert.equal(createHash('sha256').update(readFileSync(new URL(file,import.meta.url))).digest('hex'),sha,file);
});
// Executable migration/storage/permission assertions live in the native fixture,
// not source regexes. It always creates its own local Unix-only synthetic cluster.
test('native174 storage, authority, recovery, firewall and downgrade acceptance',{skip:process.env.MERCHANT_CONTENT_NATIVE_POSTGRES!=='1'},()=>{
 const result=spawnSync(process.execPath,['--conditions=react-server','--experimental-transform-types',new URL('../../../../../tests/saas-phase3/merchant-content/postgres-harness.mjs',import.meta.url).pathname],{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
 process.stdout.write(result.stdout);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS native merchant content: [0-9]+ scenarios/);
});
