import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
const up = new URL('./202609270167_registration_onboarding_jobs.up.sql', import.meta.url);
test('migration provides scoped durable registration jobs', () => {
  assert.ok(existsSync(up), 'onboarding persistence migration is missing');
  const sql = readFileSync(up, 'utf8');
  assert.match(sql, /FOR UPDATE OF job SKIP LOCKED/);
  assert.match(sql, /AFTER INSERT ON saas.registration_verified_identities/);
  assert.match(sql, /lease_token=p_token/);
});
