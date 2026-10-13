import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
test('invitation recovery actual DOM fixture',{timeout:30000},()=>{const env={...process.env};delete env.NODE_TEST_CONTEXT;const run=spawnSync(process.execPath,['--experimental-transform-types','--test',fileURLToPath(new URL('./invitation-recovery-browser.fixture.mjs',import.meta.url))],{env,encoding:'utf8',timeout:25000,maxBuffer:100000});assert.equal(run.status,0,`Recovery DOM fixture failed: ${run.stdout}\n${run.stderr}`);assert.match(run.stdout,/pass 4/);});
