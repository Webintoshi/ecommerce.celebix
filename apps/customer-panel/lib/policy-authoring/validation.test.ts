import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePolicyAuthoringRequest, parsePolicyAuthoringResult } from './validation.ts';

const id = '11111111-1111-4111-8111-111111111111';
const operationId = '22222222-2222-4222-8222-222222222222';
const request = { kind: 'policy', draftId: id, policyKey: 'kvkk', policyVersion: 3, currentBody: '<p>Mevcut metin</p>', locale: 'tr' };
const result = { kind: 'policy', operationId, draftId: id, policyKey: 'kvkk', policyVersion: 3, requestFingerprint: 'a'.repeat(64), body: '<p>İletişim bilgilerinizi kontrol edin.</p>', suggestions: ['Veri sorumlusunun resmî adını ekleyin.'], chargedCredits: 7, wallet: { balance: 93, reserved: 0, available: 93 } };

test('policy request keeps the selected fixed policy and rejects authority overrides', () => {
  assert.deepEqual(parsePolicyAuthoringRequest(request), request);
  for (const patch of [{ policyKey: 'returns_exchange' }, { policyVersion: 0 }, { locale: 'en' }, { storeId: id }, { cost: 1 }, { provider: 'openai' }, { currentBody: 'ü'.repeat(50_001) }]) {
    assert.throws(() => parsePolicyAuthoringRequest({ ...request, ...patch }));
  }
});

test('contract inspection never evaluates untrusted accessors or sparse suggestions', () => {
  let called = 0;
  assert.throws(() => parsePolicyAuthoringRequest(Object.defineProperty({ ...request }, 'currentBody', { enumerable: true, get() { called++; return ''; } })));
  assert.throws(() => parsePolicyAuthoringResult({ ...result, suggestions: new Array(1) }));
  assert.equal(called, 0);
});

test('preview results reject wrong operation, target, price and wallet arithmetic', () => {
  const expected = { request: parsePolicyAuthoringRequest(request), operationId };
  assert.deepEqual(parsePolicyAuthoringResult(result, expected), result);
  for (const patch of [{ operationId: id }, { policyKey: 'membership' }, { policyVersion: 4 }, { draftId: operationId }, { chargedCredits: 1 }, { wallet: { balance: 93, reserved: 1, available: 93 } }, { body: '' }]) {
    assert.throws(() => parsePolicyAuthoringResult({ ...result, ...patch }, expected));
  }
});
