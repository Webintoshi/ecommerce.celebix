import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkReceipt, gatherInputs, writeReceipt } from './signup-release-proof.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const refresh = process.argv.length === 3 && process.argv[2] === '--refresh-proof';
if (process.argv.length > 2 && !refresh) throw new Error('Only --refresh-proof is supported.');
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Signup rehearsal requires Node.js 24 or later.');

// The receipt is written only after both real PostgreSQL rehearsals succeed.
// Never use deployment credentials or an existing database for this command.
const before = gatherInputs(root);
const suites = [
  ['current-signup.native', 'tests/saas-phase3/merchant-signup-profile/current-signup.native.test.mjs'],
  ['starter-plan-snapshots255.native', 'tests/saas-phase3/merchant-signup-profile/starter-plan-snapshots255.native.test.mjs'],
];
const results = [];
for (const [id, file] of suites) {
  console.log(`Running ${id} in disposable PostgreSQL 16`);
  const result = spawnSync(process.execPath, ['--experimental-transform-types', file], {
    cwd: root,
    stdio: 'inherit',
    timeout: 240_000,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${id} failed; release proof was not refreshed`);
  results.push({ id, exitCode: 0, postgresMajor: 16 });
}
const after = gatherInputs(root);
assert.deepEqual(after, before, 'Sources changed during rehearsal; run again with stable inputs.');
if (refresh) {
  const receipt = writeReceipt(root, results, before);
  assert.equal(receipt.inputDigest, before.inputDigest);
  checkReceipt(root);
  console.log(`Signup release proof refreshed: ${receipt.inputDigest}`);
} else {
  checkReceipt(root);
  console.log(`Signup release rehearsal passed: ${after.inputDigest}`);
}
