import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
test('180 native PostgreSQL checks tenant authority, durable mutations, public readers, leases and retained rollback', {skip: process.env.SEO_HUB_NATIVE_POSTGRES!=='1'},()=>{
 const result=spawnSync(process.execPath,['--experimental-transform-types',new URL('../../../../../tests/saas-phase3/seo-hub/postgres-harness.mjs',import.meta.url).pathname],{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
 process.stdout.write(result.stdout);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS native SEO hub: [0-9]+ scenarios/);
});
