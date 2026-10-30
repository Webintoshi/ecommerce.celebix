import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement, useState } from 'react';
import { compile, mounted, click } from '../../lib/mira-final-test-support.ts';
import { PolicyAuthoringApiError } from '../../lib/policy-authoring-ui/client.ts';
import type { PolicyAuthoringContext } from '../../lib/policy-authoring-ui/controller.ts';
import type { PolicyAuthoringRequest } from '../../lib/policy-authoring/types.ts';

const context: PolicyAuthoringContext = { recoveryScope: 'panel-recovery-scope', policyKey: 'returns_exchanges', policyVersion: 4, body: '<p>Var olan koşullar.</p>', status: 'draft', revision: 'mount-a:1' };
const result = (request: PolicyAuthoringRequest, operationId: string) => ({ kind: 'policy', operationId, draftId: request.draftId, policyKey: request.policyKey, policyVersion: request.policyVersion, requestFingerprint: 'a'.repeat(64), body: '<p>İncelenecek koşullar.</p>', suggestions: [], chargedCredits: 7, wallet: { balance: 23, reserved: 0, available: 23 } });
function moduleFor(generate: (request: PolicyAuthoringRequest, operationId: string) => Promise<unknown>, available = 30) {
  return compile('components/content/PolicyAuthoringPanel.tsx', {
    '@/lib/policy-authoring-ui/client': { PolicyAuthoringApiError, policyAuthoringClient: { generate } },
    '@/lib/content-authoring-ui/credits-client': { readToshiCredits: async () => ({ wallet: { balance: available, reserved: 0, available } }) },
    '@/components/catalog/ProductDescriptionPreview': { ProductDescriptionPreview: ({ source }: any) => createElement('div', null, source) },
  });
}

test('lost responses recover only by explicit action with the same request and operation ID', async () => {
  const calls: { request: PolicyAuthoringRequest; id: string }[] = [];
  const { PolicyAuthoringPanel } = moduleFor(async (request, id) => { calls.push({ request, id }); if (calls.length === 1) throw new Error('lost response'); return result(request, id); });
  let applied = 0;
  await mounted(PolicyAuthoringPanel, { context, onApply: () => { applied++; return true; }, onClose: () => {} }, async (host) => {
    await click(host, 'Metni hazırla');
    assert.equal(calls.length, 1);
    assert.ok(host.textContent.includes('aynı işlemin sonucunu kontrol edin'));
    assert.equal([...host.querySelectorAll('button')].some(button => button.textContent === 'Metni hazırla'), false);
    await click(host, 'İşlemin sonucunu kontrol et');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].id, calls[1].id);
    assert.deepEqual(calls[0].request, calls[1].request);
    assert.equal(applied, 0);
    await click(host, 'Metne uygula');
    assert.equal(applied, 1);
  });
});

test('closing during dispatch preserves recovery and never automatically repeats the request', async () => {
  let finish: (value: unknown) => void = () => {};
  const calls: { request: PolicyAuthoringRequest; id: string }[] = [];
  const { PolicyAuthoringPanel } = moduleFor((request, id) => { calls.push({ request, id }); return calls.length === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(result(request, id)); });
  const Wrapper = () => {
    const [open, setOpen] = useState(true);
    return createElement('div', null, createElement('button', { onClick: () => setOpen(true) }, 'Toshi aç'), open ? createElement(PolicyAuthoringPanel, { context, onApply: () => true, onClose: () => setOpen(false) }) : null);
  };
  await mounted(Wrapper, {}, async (host) => {
    await click(host, 'Metni hazırla');
    await click(host, 'Toshi panelini kapat');
    await act(async () => finish(result(calls[0].request, calls[0].id)));
    await click(host, 'Toshi aç');
    assert.equal(calls.length, 1);
    await click(host, 'İşlemin sonucunu kontrol et');
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], calls[1]);
    assert.ok([...host.querySelectorAll('button')].some(button => button.textContent === 'Metne uygula'));
  });
});

test('synchronous duplicate clicks dispatch once and low balance blocks a new paid request', async () => {
  let calls = 0;
  const { PolicyAuthoringPanel } = moduleFor(async () => { calls++; return new Promise(() => {}); });
  await mounted(PolicyAuthoringPanel, { context, onApply: () => true, onClose: () => {} }, async host => {
    const button = [...host.querySelectorAll('button')].find(item => item.textContent === 'Metni hazırla') as HTMLButtonElement;
    await act(async () => { button.click(); button.click(); });
    assert.equal(calls, 1);
  });
  const { PolicyAuthoringPanel: LowBalance } = moduleFor(async () => { calls++; }, 6);
  await mounted(LowBalance, { context, onApply: () => true, onClose: () => {} }, async host => {
    const button = [...host.querySelectorAll('button')].find(item => item.textContent === 'Metni hazırla') as HTMLButtonElement;
    assert.equal(button.disabled, true);
    await click(host, 'Metni hazırla');
    assert.equal(calls, 1);
  });
});

test('a confirmed terminal failure permits a fresh operation without applying content', async () => {
  const ids: string[] = [];
  const { PolicyAuthoringPanel } = moduleFor(async (request, id) => { ids.push(id); if (ids.length === 1) throw new PolicyAuthoringApiError('operation_failed'); return result(request, id); });
  await mounted(PolicyAuthoringPanel, { context, onApply: () => { assert.fail('generation must never apply automatically'); }, onClose: () => {} }, async host => {
    await click(host, 'Metni hazırla');
    assert.match(host.textContent, /Mevcut metniniz korundu/);
    await click(host, 'Metni hazırla');
    assert.equal(ids.length, 2);
    assert.notEqual(ids[0], ids[1]);
  });
});

test('terminal preflight denials never direct the merchant to a recovery action that was removed', async () => {
  for (const code of ['feature_not_enabled', 'feature_unavailable', 'invalid_input', 'unauthenticated', 'membership_denied', 'store_inactive', 'origin_denied']) {
    const { PolicyAuthoringPanel } = moduleFor(async () => { throw new PolicyAuthoringApiError(code); });
    await mounted(PolicyAuthoringPanel, { context, onApply: () => { assert.fail('a denied request must not alter content'); }, onClose: () => {} }, async host => {
      await click(host, 'Metni hazırla');
      assert.match(host.querySelector('[role="alert"]')?.textContent ?? '', /İşlem başlatılamadı. Mevcut metniniz korundu[.]/, code);
      assert.doesNotMatch(host.textContent, /aynı işlemin sonucunu kontrol edin/, code);
      assert.equal([...host.querySelectorAll('button')].some(button => button.textContent === 'İşlemin sonucunu kontrol et'), false, code);
      assert.ok([...host.querySelectorAll('button')].some(button => button.textContent === 'Metni hazırla'), code);
    });
  }
});

test('unavailable recovery storage blocks a paid dispatch before any network request', async () => {
  let calls = 0;
  const { PolicyAuthoringPanel } = moduleFor(async () => { calls++; });
  await mounted(PolicyAuthoringPanel, { context, onApply: () => true, onClose: () => {} }, async host => {
    await click(host, 'Metni hazırla');
    assert.equal(calls, 0);
    assert.match(host.textContent, /İşlem kimliği güvenle saklanamadı/);
  }, browser => { Object.defineProperty(browser, 'sessionStorage', { value: { getItem: () => null, setItem: () => { throw new Error('storage denied'); }, removeItem: () => {} } }); });
});

test('an oversized unchanged source is explained without an uncertain-operation recovery loop', async () => {
  const { PolicyAuthoringPanel } = moduleFor(async () => { throw new PolicyAuthoringApiError('source_too_large'); });
  await mounted(PolicyAuthoringPanel, { context, onApply: () => { assert.fail('oversized text must remain unchanged'); }, onClose: () => {} }, async host => {
    await click(host, 'Metni hazırla');
    assert.match(host.textContent, /tek seferde düzenlenemeyecek kadar uzun/);
    assert.equal([...host.querySelectorAll('button')].some(button => button.textContent === 'İşlemin sonucunu kontrol et'), false);
    const prepare = [...host.querySelectorAll('button')].find(button => button.textContent === 'Metni hazırla')!;
    assert.equal(prepare.disabled, true, 'an oversized source can only be tried again after editing');
  });
});
