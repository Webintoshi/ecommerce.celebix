import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
test('183 prioritizes actionable overview issues over capped metadata warnings at store scale', {skip: process.env.SEO_OVERVIEW_FINDINGS_NATIVE_POSTGRES!=='1'},()=>{
 const result=spawnSync(process.execPath,[new URL('../../../../../tests/saas-phase3/seo-hub/overview-findings-postgres-harness.mjs',import.meta.url).pathname],{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
 process.stdout.write(result.stdout);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS native SEO overview findings: 2 scenarios/);
});
