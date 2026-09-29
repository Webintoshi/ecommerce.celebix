import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { clearContentResourceRecovery, readContentResourceRecovery, recoverContentResourceDraft, writeContentResourceRecovery, type ContentResourceRecoveryReceipt } from './recovery.ts';

const STORE_A = '11111111-1111-4111-8111-111111111111';
const STORE_B = '22222222-2222-4222-8222-222222222222';
const RECORD_A = '33333333-3333-4333-8333-333333333333';
const RECORD_B = '44444444-4444-4444-8444-444444444444';
const DRAFT_A = '55555555-5555-4555-8555-555555555555';
const DRAFT_B = '66666666-6666-4666-8666-666666666666';
const OPERATION = '77777777-7777-4777-8777-777777777777';

function receipt(storeId: string, recordId: string | null, draftId: string, locale = 'tr'): ContentResourceRecoveryReceipt {
  return { storeId, target: { kind: 'blog_post', recordId, recordVersion: recordId ? 4 : null, draftId }, locale, operationId: OPERATION, stage: 'outline', status: 'unresolved', safeCode: null };
}

test('recovery is isolated by store, record, kind, draft, and locale while allowing a later record version', async () => {
  const browser = new Window();
  try {
    const storage = browser.sessionStorage;
    const original = receipt(STORE_A, RECORD_A, DRAFT_A);
    writeContentResourceRecovery(storage, original);
    assert.equal(recoverContentResourceDraft(storage, STORE_A, 'blog_post', RECORD_A)?.draftId, DRAFT_A);
    assert.equal(recoverContentResourceDraft(storage, STORE_B, 'blog_post', RECORD_A), null);
    assert.equal(recoverContentResourceDraft(storage, STORE_A, 'blog_post', RECORD_B), null);
    assert.equal(recoverContentResourceDraft(storage, STORE_A, 'page', RECORD_A), null);
    assert.equal(readContentResourceRecovery(storage, { ...original, target: { ...original.target, recordVersion: 5 } })?.operationId, OPERATION);
    assert.equal(readContentResourceRecovery(storage, { ...original, target: { ...original.target, draftId: DRAFT_B } }), null);
    assert.equal(readContentResourceRecovery(storage, { ...original, locale: 'en-US' }), null);
    clearContentResourceRecovery(storage, original);
    assert.equal(recoverContentResourceDraft(storage, STORE_A, 'blog_post', RECORD_A), null);
  } finally { await browser.happyDOM.close(); }
});

test('two unfinished new drafts in one tab fail closed instead of borrowing either operation', async () => {
  const browser = new Window();
  try {
    const storage = browser.sessionStorage;
    writeContentResourceRecovery(storage, receipt(STORE_A, null, DRAFT_A));
    writeContentResourceRecovery(storage, receipt(STORE_A, null, DRAFT_B));
    assert.throws(() => recoverContentResourceDraft(storage, STORE_A, 'blog_post', null), /content_resource_recovery_invalid/);
  } finally { await browser.happyDOM.close(); }
});

test('unreadable receipt for one record does not cross into another record scope', async () => {
  const browser = new Window();
  try {
    const storage = browser.sessionStorage;
    writeContentResourceRecovery(storage, receipt(STORE_A, RECORD_A, DRAFT_A));
    storage.setItem(`celebix:content-resource-operation:v1:${STORE_A}:blog_post:${RECORD_B}:${DRAFT_B}:tr`, '{broken');
    assert.equal(recoverContentResourceDraft(storage, STORE_A, 'blog_post', RECORD_A)?.draftId, DRAFT_A);
    assert.throws(() => recoverContentResourceDraft(storage, STORE_A, 'blog_post', RECORD_B), /content_resource_recovery_invalid/);
  } finally { await browser.happyDOM.close(); }
});
