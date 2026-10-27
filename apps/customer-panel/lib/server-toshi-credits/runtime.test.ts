import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToshiCreditRepository } from '@celebix/saas-data';
import { registerServerToshiCreditsRuntime, resolveServerToshiCreditsRuntime } from './runtime.ts';
const wallet = { balance: 0, reserved: 0, available: 0 };
function access(mode = 'approved_staging') { return Object.freeze({ readiness: { mode }, panelOrigin: mode === 'approved_staging' ? 'https://panel.test' : null }) as never; }
function repository(): ToshiCreditRepository { return { async getWallet() { return wallet; }, async reserve() { throw Error('unused'); }, async complete() { return wallet; }, async fail() { return wallet; } }; }
test('credit runtime is bound to one panel access authority and captures repository methods', async () => {
  const a = access(), r = repository(), runtime = registerServerToshiCreditsRuntime(a, r);
  r.getWallet = async () => { throw Error('mutated'); };
  assert.equal(resolveServerToshiCreditsRuntime(a), runtime);
  assert.equal(resolveServerToshiCreditsRuntime(access()), null);
  assert.equal(Object.isFrozen(runtime), true); assert.equal(Object.isFrozen(runtime.repository), true);
  assert.deepEqual(await runtime.repository.getWallet({} as never), wallet);
  assert.throws(() => registerServerToshiCreditsRuntime(a, r), /runtime_invalid/);
});
test('disabled and incomplete runtimes fail closed', () => {
  const a = access('disabled'); assert.equal(resolveServerToshiCreditsRuntime(a), null);
  assert.throws(() => registerServerToshiCreditsRuntime(a, repository()), /runtime_invalid/);
  assert.throws(() => registerServerToshiCreditsRuntime(access(), { getWallet() {} } as never), /runtime_invalid/);
});
