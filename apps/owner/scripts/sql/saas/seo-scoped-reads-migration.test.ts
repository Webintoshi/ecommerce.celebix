import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
test('182 scopes resource reads before projections, reuses overview data and clears category overrides', {skip: process.env.SEO_SCOPED_READS_NATIVE_POSTGRES!=='1'},()=>{
 const result=spawnSync(process.execPath,[new URL('../../../../../tests/saas-phase3/seo-hub/scoped-reads-postgres-harness.mjs',import.meta.url).pathname],{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
 process.stdout.write(result.stdout);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS native SEO scoped reads: 6 scenarios/);
});
