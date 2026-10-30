import assert from 'node:assert/strict';
import test from 'node:test';
import { clearPolicyAuthoringCompletedPreview, clearPolicyAuthoringRecovery, readPolicyAuthoringCompletedPreview, readPolicyAuthoringRecovery, writePolicyAuthoringCompletedPreview, writePolicyAuthoringRecovery, type PolicyAuthoringCompletedPreview, type PolicyAuthoringReceipt } from './recovery.ts';
import { rebindPolicyAuthoringRecoveryContext, restorePolicyAuthoringPreviewContext, samePolicyAuthoringContext } from './controller.ts';

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

const completed: PolicyAuthoringCompletedPreview = { receipt, result: { kind: 'policy', operationId: receipt.operationId, draftId: receipt.request.draftId, policyKey: receipt.request.policyKey, policyVersion: receipt.request.policyVersion, requestFingerprint: 'a'.repeat(64), body: '<p>Hazırlanan metin.</p>', suggestions: [], chargedCredits: 7, wallet: { balance: 13, reserved: 0, available: 13 } } };

test('completed previews validate the paid result and remain isolated by opaque scope and policy', () => {
  const browser = storage();
  writePolicyAuthoringCompletedPreview(browser, completed);
  assert.deepEqual(readPolicyAuthoringCompletedPreview(browser, receipt.context.recoveryScope, 'kvkk'), completed);
  assert.equal(readPolicyAuthoringCompletedPreview(browser, 'another-session-scope', 'kvkk'), null);
  assert.equal(readPolicyAuthoringCompletedPreview(browser, receipt.context.recoveryScope, 'membership'), null);
  assert.throws(() => writePolicyAuthoringCompletedPreview(browser, { ...completed, result: { ...completed.result, policyKey: 'membership' } }));
  assert.throws(() => writePolicyAuthoringCompletedPreview(browser, { ...completed, result: { ...completed.result, body: '<script>alert(1)</script>' } }));
  assert.throws(() => clearPolicyAuthoringCompletedPreview(browser, { ...completed, result: { ...completed.result, operationId: receipt.request.draftId } }));
  clearPolicyAuthoringCompletedPreview(browser, completed);
  assert.equal(browser.values.size, 0);
});

test('only explicitly reopened completed previews may bind an unchanged stable context in the same mount', () => {
  const captured = receipt.context, reopened = { ...captured, revision: 'mount-a:9' };
  assert.deepEqual(restorePolicyAuthoringPreviewContext(captured, reopened), reopened);
  for (const changed of [{ recoveryScope: 'other-session' }, { policyKey: 'membership' }, { policyVersion: 3 }, { body: '<p>Changed</p>' }, { status: 'published' }]) {
    assert.deepEqual(restorePolicyAuthoringPreviewContext(captured, { ...reopened, ...changed } as typeof captured), captured);
  }
  assert.equal(samePolicyAuthoringContext(reopened, { ...reopened, revision: 'mount-a:10' }), false, 'an edit after reopening still invalidates Apply');
  assert.deepEqual(rebindPolicyAuthoringRecoveryContext(captured, reopened), captured, 'in-flight recovery keeps its stricter same-mount revision rule');
});

test('oversized and corrupted completed storage fails closed without exposing an unsafe preview', () => {
  const browser = storage();
  writePolicyAuthoringCompletedPreview(browser, completed);
  const key = [...browser.values.keys()][0];
  browser.setItem(key, JSON.stringify({ ...completed, result: { ...completed.result, body: '<img src=x onerror=alert(1)>' } }));
  assert.throws(() => readPolicyAuthoringCompletedPreview(browser, receipt.context.recoveryScope, 'kvkk'));
  browser.setItem(key, ' '.repeat(1_250_001));
  assert.throws(() => readPolicyAuthoringCompletedPreview(browser, receipt.context.recoveryScope, 'kvkk'));
});
