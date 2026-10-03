import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
// Executable SQL, provisioning and public/merchant authority behavior is tested
// against a fresh private PostgreSQL16 fixture, never an environment DSN.
test('native209 atomic seed, preserving backfill, CAS/replay, protected identity and public canonical isolation', { skip: process.env.REQUIRED_PAGES_NATIVE_POSTGRES !== '1' }, () => {
 const result = spawnSync(process.execPath, [new URL('../../../../../tests/saas-phase3/required-store-pages/postgres-harness.mjs', import.meta.url).pathname], { encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
 process.stdout.write(result.stdout); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /PASS native required store pages: [0-9]+ scenarios/);
});
