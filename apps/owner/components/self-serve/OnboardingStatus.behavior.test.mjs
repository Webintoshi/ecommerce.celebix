import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
test('status browser fixture passes with client React conditions',()=>{
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const result=spawnSync(process.execPath,['--experimental-transform-types','--test',fileURLToPath(new URL('./onboarding-status-browser.fixture.mjs',import.meta.url))],{env,encoding:'utf8',timeout:30000,maxBuffer:100000});
 assert.equal(result.status,0,`Browser fixture failed: ${result.stdout}\n${result.stderr}`);
 assert.match(result.stdout,/pass 3/);
});
