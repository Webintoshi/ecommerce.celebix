import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('central existing-account phone enrollment actual DOM cases',{timeout:30000},()=>{const env={...process.env};delete env.NODE_TEST_CONTEXT;const result=spawnSync(process.execPath,['--experimental-transform-types','--test',fileURLToPath(new URL('./merchant-phone-enrollment-dom.fixture.ts',import.meta.url))],{env,encoding:'utf8',timeout:25000,maxBuffer:100000});assert.equal(result.status,0,`Enrollment DOM fixture failed: ${result.stdout}\n${result.stderr}`);assert.match(result.stdout,/pass 4/);});
