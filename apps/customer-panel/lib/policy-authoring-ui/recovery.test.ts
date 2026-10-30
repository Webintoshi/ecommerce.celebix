import assert from 'node:assert/strict';
import test from 'node:test';
import { clearPolicyAuthoringRecovery, readPolicyAuthoringRecovery, writePolicyAuthoringRecovery, type PolicyAuthoringReceipt } from './recovery.ts';
import { rebindPolicyAuthoringRecoveryContext, samePolicyAuthoringContext } from './controller.ts';

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const receipt: PolicyAuthoringReceipt = {
  operationId: '11111111-1111-4111-8111-111111111111',
  request: { kind: 'policy', draftId: '22222222-2222-4222-8222-222222222222', policyKey: 'kvkk', policyVersion: 2, currentBody: '<p>Özgün metin.</p>', locale: 'tr' },
  context: { recoveryScope: 'opaque-session-scope-a', policyKey: 'kvkk', policyVersion: 2, body: '<p>Özgün metin.</p>', status: 'draft', revision: 'mount-a:3' },
};

test('recovery retains the exact paid request and isolates it by opaque session and policy', () => {
  const browser = storage();
  writePolicyAuthoringRecovery(browser, receipt);
  assert.deepEqual(readPolicyAuthoringRecovery(browser, receipt.context.recoveryScope, 'kvkk'), receipt);
  assert.equal(readPolicyAuthoringRecovery(browser, 'opaque-session-scope-b', 'kvkk'), null);
  assert.equal(readPolicyAuthoringRecovery(browser, receipt.context.recoveryScope, 'membership'), null);
  assert.throws(() => writePolicyAuthoringRecovery(browser, { ...receipt, request: { ...receipt.request, policyVersion: 3 } }));
  assert.throws(() => clearPolicyAuthoringRecovery(browser, { ...receipt, operationId: receipt.request.draftId }));
  assert.equal(browser.values.size, 1);
  clearPolicyAuthoringRecovery(browser, receipt);
  assert.equal(browser.values.size, 0);
});

test('every captured editing boundary invalidates application including a switch away and back', () => {
  const context = receipt.context;
  assert.equal(samePolicyAuthoringContext(context, { ...context }), true);
  for (const changed of [{ recoveryScope: 'other-session' }, { policyKey: 'membership' }, { policyVersion: 3 }, { body: '<p>Elle değiştirildi.</p>' }, { status: 'published' }, { revision: 'mount-a:4' }]) {
    assert.equal(samePolicyAuthoringContext(context, { ...context, ...changed } as typeof context), false);
  }
});

test('malformed recovery fails closed instead of granting a fresh paid operation', () => {
  const browser = storage();
  writePolicyAuthoringRecovery(browser, receipt);
  const key = [...browser.values.keys()][0];
  browser.setItem(key, JSON.stringify({ ...receipt, request: { ...receipt.request, currentBody: 'other body' } }));
  assert.throws(() => readPolicyAuthoringRecovery(browser, receipt.context.recoveryScope, 'kvkk'));
});

test('recovery binds a new mount only when every stable context field matches', () => {
  const captured = receipt.context, newMount = { ...captured, revision: 'mount-b:2' };
  assert.deepEqual(rebindPolicyAuthoringRecoveryContext(captured, newMount), newMount);
  for (const changed of [{ recoveryScope: 'other-session' }, { policyKey: 'membership' }, { policyVersion: 3 }, { body: '<p>Changed</p>' }, { status: 'published' }]) {
    assert.deepEqual(rebindPolicyAuthoringRecoveryContext(captured, { ...newMount, ...changed } as typeof captured), captured);
  }
  assert.deepEqual(rebindPolicyAuthoringRecoveryContext(captured, { ...captured, revision: 'mount-a:4' }), captured, 'same-mount edits and policy switches must retain the captured revision');
  const rebound = rebindPolicyAuthoringRecoveryContext(captured, newMount);
  assert.deepEqual(rebindPolicyAuthoringRecoveryContext(rebound, { ...newMount, revision: 'mount-b:4' }), rebound, 'once rebound, switching away and back cannot rebind again in that mount');
});
