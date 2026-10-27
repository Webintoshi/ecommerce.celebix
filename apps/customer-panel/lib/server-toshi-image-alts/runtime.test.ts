import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToshiCreditRepository } from '@celebix/saas-data';
import { registerServerToshiImageAltRuntime, resolveServerToshiImageAltRuntime } from './runtime.ts';
function access(mode = 'approved_staging') { return Object.freeze({ readiness: { mode }, panelOrigin: mode === 'approved_staging' ? 'https://panel.test' : null }) as never; }
const credits: ToshiCreditRepository = { async getWallet() { return { balance: 0, reserved: 0, available: 0 }; }, async reserve() { throw Error('unused'); }, async complete() { throw Error('unused'); }, async fail() { throw Error('unused'); } };
test('image alt runtime is bound once to approved panel access and credit authority', () => {
  const a = access(), runtime = registerServerToshiImageAltRuntime(a, { credits });
  assert.equal(resolveServerToshiImageAltRuntime(a), runtime); assert.equal(Object.isFrozen(runtime), true); assert.equal(typeof runtime.service.generate, 'function');
  assert.equal(resolveServerToshiImageAltRuntime(access()), null);
  assert.throws(() => registerServerToshiImageAltRuntime(a, { credits }), /runtime_invalid/);
});
test('disabled access and missing credit methods cannot register paid image generation', () => {
  const a = access('disabled'); assert.equal(resolveServerToshiImageAltRuntime(a), null); assert.throws(() => registerServerToshiImageAltRuntime(a, { credits }), /runtime_invalid/);
  assert.throws(() => registerServerToshiImageAltRuntime(access(), { credits: {} as never }), /service_invalid/);
});
