import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
test('181 rejects other noindex canonical targets atomically and preserves public fallback plus rollback', {skip: process.env.SEO_INDEXABLE_CANONICALS_NATIVE_POSTGRES!=='1'},()=>{
 const result=spawnSync(process.execPath,['--experimental-transform-types',new URL('../../../../../tests/saas-phase3/seo-hub/indexable-canonicals-postgres-harness.mjs',import.meta.url).pathname],{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
 process.stdout.write(result.stdout);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS native SEO indexable canonicals: 4 scenarios/);
});
