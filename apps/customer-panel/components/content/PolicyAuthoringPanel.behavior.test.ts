import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement, useState } from 'react';
import { compile, mounted, click } from '../../lib/mira-final-test-support.ts';
import { PolicyAuthoringApiError } from '../../lib/policy-authoring-ui/client.ts';
import type { PolicyAuthoringContext } from '../../lib/policy-authoring-ui/controller.ts';
import type { PolicyAuthoringRequest } from '../../lib/policy-authoring/types.ts';
import { readPolicyAuthoringCompletedPreview, readPolicyAuthoringRecovery } from '../../lib/policy-authoring-ui/recovery.ts';

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

test('a long completed preview places Apply before the generated text and explains the next Save step', async () => {
  const body = `<h2>Koşullar</h2><p>${'Uzun politika metni. '.repeat(300)}</p>`;
  const { PolicyAuthoringPanel } = moduleFor(async (request, id) => ({ ...result(request, id), body }));
  await mounted(PolicyAuthoringPanel, { context, onApply: () => true, onClose: () => {} }, async host => {
    await click(host, 'Metni hazırla');
    assert.ok(host.textContent.indexOf('Metne uygula') < host.textContent.indexOf('Uzun politika metni.'), 'Apply must remain above the long preview instead of below its final paragraph');
    assert.match(host.textContent, /Kaydetmek için önce Metne uygula/);
  });
});

test('completed paid previews survive close and reopen without another generation', async () => {
  let calls = 0;
  const { PolicyAuthoringPanel } = moduleFor(async (request, id) => { calls++; return result(request, id); });
  const Wrapper = () => {
    const [open, setOpen] = useState(true), [revision, setRevision] = useState(1);
    return createElement('div', null, createElement('button', { onClick: () => { setRevision(value => value + 1); setOpen(true); } }, 'Önizlemeye dön'), open ? createElement(PolicyAuthoringPanel, { context: { ...context, revision: `mount-a:${revision}` }, onApply: () => true, onClose: () => setOpen(false) }) : null);
  };
  await mounted(Wrapper, {}, async host => {
    await click(host, 'Metni hazırla');
    await click(host, 'Toshi panelini kapat');
    await click(host, 'Önizlemeye dön');
    assert.equal(calls, 1, 'a completed result must resume locally without paying for another generation');
    const apply = [...host.querySelectorAll('button')].find(button => button.textContent === 'Metne uygula');
    assert.ok(apply, 'the completed preview must remain available after closing it');
    assert.equal(apply.disabled, false, 'explicitly reopening unchanged stable content may bind the current editing revision');
  });
});

test('restored completed previews reject changed source, version or publication without another generation', async () => {
  let calls = 0;
  const { PolicyAuthoringPanel } = moduleFor(async (request, id) => { calls++; return result(request, id); });
  const persisted: [string, string][] = [];
  await mounted(PolicyAuthoringPanel, { context, onApply: () => true, onClose: () => {} }, async (host, window) => {
    await click(host, 'Metni hazırla');
    for (let index = 0; index < window.sessionStorage.length; index++) {
      const key = window.sessionStorage.key(index)!; persisted.push([key, window.sessionStorage.getItem(key)!]);
    }
  });
  for (const changed of [{ body: '<p>Elle değiştirilen kaynak.</p>' }, { policyVersion: 5 }, { status: 'published' }]) {
    await mounted(PolicyAuthoringPanel, { context: { ...context, ...changed, revision: 'new-mount:2' }, onApply: () => { assert.fail('a mismatching source must never apply'); }, onClose: () => {} }, async host => {
      const apply = [...host.querySelectorAll('button')].find(button => button.textContent === 'Metne uygula');
      assert.ok(apply); assert.equal(apply.disabled, true);
      assert.equal(calls, 1);
    }, window => { for (const [key, value] of persisted) window.sessionStorage.setItem(key, value); });
  }
});

test('a failed completed-preview write keeps its visible result and original recovery key without a new charge', async () => {
  let calls = 0;
  const { PolicyAuthoringPanel } = moduleFor(async (request, id) => { calls++; return result(request, id); });
  await mounted(PolicyAuthoringPanel, { context, onApply: () => true, onClose: () => {} }, async (host, window) => {
    await click(host, 'Metni hazırla');
    assert.ok([...host.querySelectorAll('button')].some(button => button.textContent === 'Metne uygula'));
    assert.ok(readPolicyAuthoringRecovery(window.sessionStorage, context.recoveryScope, context.policyKey));
    assert.equal(calls, 1);
    assert.equal([...host.querySelectorAll('button')].some(button => button.textContent === 'Yeniden hazırla'), false);
    assert.match(host.textContent, /önizleme kaydı saklanamadı/);
  }, window => {
    const storage = window.sessionStorage, write = storage.setItem.bind(storage);
    Object.defineProperty(storage, 'setItem', { value: (key: string, value: string) => { if (key.includes('policy-authoring-preview:')) throw new Error('quota'); write(key, value); } });
  });
});

test('Apply and explicit preview discard remove only the stored completed result', async () => {
  for (const action of ['Metne uygula', 'Önizlemeyi kaldır']) {
    let calls = 0, applied = 0;
    const { PolicyAuthoringPanel } = moduleFor(async (request, id) => { calls++; return result(request, id); });
    await mounted(PolicyAuthoringPanel, { context, onApply: () => { applied++; return true; }, onClose: () => {} }, async (host, window) => {
      await click(host, 'Metni hazırla');
      assert.ok(readPolicyAuthoringCompletedPreview(window.sessionStorage, context.recoveryScope, context.policyKey));
      await click(host, action);
      assert.equal(readPolicyAuthoringCompletedPreview(window.sessionStorage, context.recoveryScope, context.policyKey), null);
      assert.equal(applied, action === 'Metne uygula' ? 1 : 0);
      assert.equal(calls, 1);
    });
  }
});

test('failed preview cleanup keeps the paid content visible and blocks fresh generation', async () => {
  let calls = 0;
  const { PolicyAuthoringPanel } = moduleFor(async (request, id) => { calls++; return result(request, id); });
  await mounted(PolicyAuthoringPanel, { context, onApply: () => true, onClose: () => {} }, async (host, window) => {
    await click(host, 'Metni hazırla');
    const storage = window.sessionStorage, remove = storage.removeItem.bind(storage);
    Object.defineProperty(storage, 'removeItem', { value: (key: string) => { if (key.includes('policy-authoring-preview:')) throw new Error('storage denied'); remove(key); } });
    await click(host, 'Önizlemeyi kaldır');
    assert.ok([...host.querySelectorAll('button')].some(button => button.textContent === 'Metne uygula'));
    const prepare = [...host.querySelectorAll('button')].find(button => button.textContent === 'Yeniden hazırla')!;
    assert.equal(prepare.disabled, true);
    assert.equal(calls, 1);
  });
});

test('a restored paid preview remains applicable with zero credit and never asks the merchant to buy credits to use it', async () => {
  const { PolicyAuthoringPanel } = moduleFor(async (request, id) => ({ ...result(request, id), wallet: { balance: 0, reserved: 0, available: 0 } }));
  const persisted: [string, string][] = [];
  await mounted(PolicyAuthoringPanel, { context, onApply: () => true, onClose: () => {} }, async (host, window) => {
    await click(host, 'Metni hazırla');
    for (let index = 0; index < window.sessionStorage.length; index++) {
      const key = window.sessionStorage.key(index)!; persisted.push([key, window.sessionStorage.getItem(key)!]);
    }
  });
  const { PolicyAuthoringPanel: Restored } = moduleFor(async () => { assert.fail('an already paid preview must not be generated again'); }, 0);
  let applied = 0;
  await mounted(Restored, { context, onApply: () => { applied++; return true; }, onClose: () => {} }, async host => {
    const apply = [...host.querySelectorAll('button')].find(button => button.textContent === 'Metne uygula')!;
    assert.equal(apply.disabled, false);
    assert.doesNotMatch(host.textContent, /Kredi yükle/);
    await click(host, 'Metne uygula');
    assert.equal(applied, 1);
  }, window => { for (const [key, value] of persisted) window.sessionStorage.setItem(key, value); });
});
