import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as contracts from '@celebix/saas-contracts';
import { Window } from 'happy-dom';
import ts from 'typescript';

const ID = '82000000-0000-4000-8000-000000000001', RULE = '83000000-0000-4000-8000-000000000001', OTHER_RULE = '83000000-0000-4000-8000-000000000002';
const VARIANT = '84000000-0000-4000-8000-000000000001', OTHER_VARIANT = '84000000-0000-4000-8000-000000000002';
const NOW = '2026-10-09T06:00:00.000Z';
const rule = { id: RULE, name: 'Kahve yanında', enabled: true, productIds: [ID], categoryIds: [], minSubtotalCents: null, maxSubtotalCents: null, variantIds: [VARIANT] };
const config = { schemaVersion: 1, enabled: false, heading: 'Birlikte alın', placements: { sideCart: true, checkout: true }, maxOffers: 3, rules: [rule] };
const initial = { version: 4, updatedAt: NOW, config };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

export async function orderBumpScreen(verify: (screen: any) => Promise<void>, options: { canManage?: boolean; storageUnavailable?: boolean; storageCleanupUnavailable?: boolean; workspace?: any; get?: () => Promise<Response>; save?: (body: any, operation: string | null, index: number) => Promise<Response>; choices?: (query: URLSearchParams) => any } = {}) {
  const browser = new Window({ url: 'https://panel.example.test/settings/store-tools' }), previous = new Map<string, PropertyDescriptor | undefined>();
  const navigation = new browser.EventTarget(); Object.defineProperty(browser, 'navigation', { configurable: true, value: navigation });
  if (options.storageUnavailable) Object.defineProperty(browser, 'sessionStorage', { configurable: true, value: { getItem: () => { throw Error('storage_blocked'); }, setItem: () => { throw Error('storage_blocked'); }, removeItem: () => { throw Error('storage_blocked'); } } });
  if (options.storageCleanupUnavailable) { const storage = browser.sessionStorage; Object.defineProperty(browser, 'sessionStorage', { configurable: true, value: { getItem: (key: string) => storage.getItem(key), setItem: (key: string, value: string) => storage.setItem(key, value), removeItem: () => { throw Error('storage_cleanup_blocked'); } } }); }
  const writes: any[] = [], reads: string[] = [], transitions: boolean[] = [], pushes: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input), 'https://panel.example.test');
    if (init?.method === 'POST') { const body = JSON.parse(String(init.body)), operation = new Headers(init.headers).get('idempotency-key'); writes.push({ ...body, operation }); return options.save ? options.save(body, operation, writes.length) : response({ workspace: { version: body.expectedVersion + 1, updatedAt: NOW, config: body.config } }); }
    reads.push(url.pathname + url.search);
    if (url.pathname.endsWith('/options')) {
      if (options.choices) return response({ options: options.choices(url.searchParams) });
      const kind = url.searchParams.get('kind'), ids = url.searchParams.get('ids')?.split(',');
      const items = kind === 'product' ? [{ id: ID, label: 'Filtre kahve', productId: null, priceCents: 22000, available: true }] : kind === 'category' ? [{ id: ID, label: 'Kahveler', productId: null, priceCents: null, available: true }] : [{ id: VARIANT, label: 'Kupa · Mavi', productId: ID, priceCents: 12000, available: true }, { id: OTHER_VARIANT, label: 'Kupa · Beyaz', productId: ID, priceCents: 13000, available: true }];
      return response({ options: { items: ids ? items.filter(item => ids.includes(item.id)) : items, page: Number(url.searchParams.get('page') ?? 1), totalCount: items.length } });
    }
    return options.get ? options.get() : response({ workspace: options.workspace ?? initial });
  };
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, Element: browser.Element, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, HTMLSelectElement: browser.HTMLSelectElement, Event: browser.Event, KeyboardEvent: browser.KeyboardEvent, fetch: fetcher, IS_REACT_ACT_ENVIRONMENT: true })) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  const styles: any = new Proxy({}, { get: (_target, key) => key === '__esModule' ? true : key === 'default' ? styles : String(key) }), cache = new Map<string, any>();
  const componentDir = path.dirname(fileURLToPath(import.meta.url)), appDir = path.resolve(componentDir, '../..');
  function compile(file: string): any {
    if (cache.has(file)) return cache.get(file);
    const compiled = { exports: {} as any }; cache.set(file, compiled.exports);
    const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    Function('require', 'module', 'exports', output)((id: string) => {
      if (id === 'react') return React;
      if (id === 'react/jsx-runtime') return jsxRuntime;
      if (id === 'next/navigation') return { useRouter: () => ({ push: (url: string) => pushes.push(url) }) };
      if (id === '@celebix/saas-contracts') return contracts;
      if (id === 'lucide-react') return new Proxy({}, { get: () => () => null });
      if (id === '@/components/panel/PanelLayoutClient') return { usePanelChromeModel: () => ({ storeSlug: 'fixture-shop' }) };
      if (id.endsWith('.css')) return styles;
      const target = id.startsWith('@/') ? path.resolve(appDir, id.slice(2)) : id.startsWith('.') ? path.resolve(path.dirname(file), id) : '';
      if (!target) throw Error('unexpected_import:' + id);
      const resolved = target.endsWith('.ts') || target.endsWith('.tsx') ? target : readFileExists(target + '.tsx') ? target + '.tsx' : target + '.ts';
      return compile(resolved);
    }, compiled, compiled.exports);
    return compiled.exports;
  }
  function readFileExists(file: string) { try { readFileSync(file); return true; } catch { return false; } }
  const Tool = compile(path.resolve(componentDir, 'OrderBumpTool.tsx')).OrderBumpTool;
  const { createRoot } = await import('react-dom/client'), container = browser.document.createElement('div'); browser.document.body.append(container); const root = createRoot(container as any);
  const settle = async () => { await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 230)); }); };
  const click = async (label: string) => { const element = [...container.querySelectorAll('button,input')].find(control => control.textContent?.trim() === label || control.getAttribute('aria-label') === label); assert.ok(element, label); await React.act(async () => (element as any).click()); await settle(); };
  const input = async (label: string, value: string) => { const element = [...container.querySelectorAll('input')].find(field => field.getAttribute('aria-label') === label || container.querySelector(`label[for="${field.id}"]`)?.textContent?.trim() === label); assert.ok(element, label); await React.act(async () => { Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, 'value')?.set?.call(element, value); element.dispatchEvent(new browser.Event('input', { bubbles: true })); }); await settle(); };
  try { await React.act(async () => { root.render(React.createElement(Tool, { canManage: options.canManage ?? true, onOpenChange: (open: boolean) => transitions.push(open) })); }); await settle(); await verify({ browser, navigation, container, writes, reads, transitions, pushes, click, input, settle }); }
  finally { if (options.storageUnavailable || options.storageCleanupUnavailable) Reflect.deleteProperty(browser, 'sessionStorage'); await React.act(async () => root.unmount()); for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key); await browser.happyDOM.close(); }
}

test('direct apply stores changes with the loaded version and returns to the tool overview', async () => {
  await orderBumpScreen(async ({ click, input, writes, container, transitions }: any) => { await click('Düzenle'); await input('Başlık', 'Kahvenize eşlik etsin'); await click('Uygula'); assert.equal(writes.length, 1); assert.equal(writes[0].expectedVersion, 4); assert.equal(writes[0].config.heading, 'Kahvenize eşlik etsin'); assert.equal(container.querySelector('[role="dialog"]'), null); assert.deepEqual(transitions, [true, false]); });
});

test('ordered rule moves and removal apply only the retained rules in their displayed order', async () => {
  const second = { ...rule, id: OTHER_RULE, name: 'İkinci kural', variantIds: [OTHER_VARIANT] };
  await orderBumpScreen(async ({ click, writes, container }: any) => { await click('Düzenle'); await click('İkinci kural yukarı taşı'); assert.deepEqual([...container.querySelectorAll('[data-rule-name]')].map((element: any) => element.textContent), ['İkinci kural', 'Kahve yanında']); await click('Kahve yanında kuralını kaldır'); await click('Uygula'); assert.deepEqual(writes[0].config.rules.map((item: any) => item.id), [OTHER_RULE]); }, { workspace: { ...initial, config: { ...config, rules: [rule, second] } } });
});

test('explicit product variant selection is preserved independently of trigger products', async () => {
  await orderBumpScreen(async ({ click, writes }: any) => { await click('Düzenle'); await click('Kahve yanında'); await click('Önerilecek seçenek ekle'); await click('Filtre kahve seçeneklerini göster'); await click('Kupa · Beyaz seç'); await click('Seçimi tamamla'); await click('Uygula'); assert.deepEqual(writes[0].config.rules[0].productIds, [ID]); assert.deepEqual(writes[0].config.rules[0].variantIds, [VARIANT, OTHER_VARIANT]); });
});

test('unknown save keeps the entered form fenced and replays the same operation before permitting edits', async () => {
  await orderBumpScreen(async ({ click, input, writes, container }: any) => { await click('Düzenle'); await input('Başlık', 'Korunan başlık'); await click('Uygula'); assert.equal((container.querySelector('input[aria-label="Başlık"]') as HTMLInputElement).value, 'Korunan başlık'); assert.equal((container.querySelector('input[aria-label="Başlık"]') as HTMLInputElement).disabled, true); await click('Kaydı doğrula'); assert.equal(writes.length, 2); assert.equal(writes[0].operation, writes[1].operation); assert.deepEqual(writes[0].config, writes[1].config); assert.equal(container.querySelector('[role="dialog"]'), null); }, { save: async (body, _operation, index) => index === 1 ? Promise.reject(Error('unknown')) : response({ workspace: { version: 5, updatedAt: NOW, config: body.config } }) });
});

test('version conflicts and failed explicit reload preserve the form without another write', async () => {
  let reads = 0;
  await orderBumpScreen(async ({ click, input, writes, container }: any) => { await click('Düzenle'); await input('Başlık', 'Çakışan başlık'); await click('Uygula'); assert.equal(writes.length, 1); assert.equal([...container.querySelectorAll('button')].find((button: any) => button.textContent === 'Uygula')?.disabled, true); await click('Güncel ayarları yükle'); await click('Girişleri bırak ve yükle'); assert.equal((container.querySelector('input[aria-label="Başlık"]') as HTMLInputElement).value, 'Çakışan başlık'); assert.equal(writes.length, 1); }, { get: async () => ++reads === 1 ? response({ workspace: initial }) : response({ code: 'unavailable' }, 503), save: async () => response({ code: 'version_conflict' }, 409) });
});

test('dirty Escape requires a decision and restores focus after explicit discard', async () => {
  await orderBumpScreen(async ({ click, input, browser, container, writes }: any) => { await click('Düzenle'); await input('Başlık', 'Kaydedilmedi'); await React.act(async () => browser.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); assert.ok(container.querySelector('[data-order-bump-discard]')); await click('Düzenlemeye devam'); assert.equal((container.querySelector('input[aria-label="Başlık"]') as HTMLInputElement).value, 'Kaydedilmedi'); await click('Vazgeç'); await click('Değişiklikleri bırak'); assert.equal(container.querySelector('[role="dialog"]'), null); assert.equal(browser.document.activeElement?.getAttribute('data-tool-edit'), 'order_bumps'); assert.equal(writes.length, 0); });
});

test('read-only users inspect saved unavailable choices without mutating or seeing opaque IDs', async () => {
  await orderBumpScreen(async ({ click, container, writes }: any) => { await click('Görüntüle'); await click('Kahve yanında'); assert.match(container.textContent, /Kupa · Mavi/); assert.match(container.textContent, /kullanılamıyor/); assert.equal(container.textContent.includes(VARIANT), false); assert.ok([...container.querySelectorAll('input')].every((field: any) => field.disabled)); assert.equal([...container.querySelectorAll('button')].find((button: any) => button.textContent === 'Uygula')?.disabled, true); assert.equal(writes.length, 0); }, { canManage: false, choices: query => ({ items: [{ id: query.get('kind') === 'variant' ? VARIANT : ID, label: query.get('kind') === 'variant' ? 'Kupa · Mavi' : 'Filtre kahve', productId: query.get('kind') === 'variant' ? ID : null, priceCents: null, available: false }], page: 1, totalCount: 1 }) });
});

test('failed initial load offers retry and cannot save defaults over real settings', async () => {
  await orderBumpScreen(async ({ container, writes }: any) => { assert.match(container.textContent, /yüklenemedi/); assert.equal(container.querySelector('[data-tool-edit="order_bumps"]'), null); assert.equal(container.querySelector('[role="dialog"]'), null); assert.equal(writes.length, 0); }, { get: async () => response({ code: 'unavailable' }, 503) });
});

test('unavailable browser storage allows read-only inspection and exit before any mutation', async () => {
  await orderBumpScreen(async ({ click, container, writes, browser }: any) => {
    await click('Görüntüle');
    assert.equal((container.querySelector('input[aria-label="Başlık"]') as HTMLInputElement).value, 'Birlikte alın');
    await click('Vazgeç');
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.equal(browser.document.activeElement?.getAttribute('data-tool-edit'), 'order_bumps');
    assert.equal(writes.length, 0);
  }, { canManage: false, storageUnavailable: true });
});

test('a discarded conflict remains recoverable after reopening and uses a fresh canonical version', async () => {
  let reads = 0;
  await orderBumpScreen(async ({ click, input, writes, container }: any) => {
    await click('Düzenle'); await input('Başlık', 'Çakışan giriş'); await click('Uygula');
    await click('Vazgeç'); await click('Değişiklikleri bırak'); await click('Düzenle');
    assert.equal((container.querySelector('input[aria-label="Başlık"]') as HTMLInputElement).disabled, true);
    await click('Güncel ayarları yükle'); await click('Girişleri bırak ve yükle');
    assert.equal((container.querySelector('input[aria-label="Başlık"]') as HTMLInputElement).value, 'Başka oturumdan');
    await input('Başlık', 'Güncel giriş'); await click('Uygula');
    assert.equal(writes.length, 2); assert.equal(writes[1].expectedVersion, 5);
  }, { get: async () => response({ workspace: ++reads === 1 ? initial : { ...initial, version: 5, config: { ...config, heading: 'Başka oturumdan' } } }), save: async (body, _operation, index) => index === 1 ? response({ code: 'version_conflict' }, 409) : response({ workspace: { version: body.expectedVersion + 1, updatedAt: NOW, config: body.config } }) });
});

test('opening and advancing the option picker focuses search, then Escape returns to its trigger', async () => {
  await orderBumpScreen(async ({ click, browser, container, settle }: any) => {
    await click('Düzenle'); await click('Önerilecek seçenek ekle');
    assert.equal(browser.document.activeElement?.getAttribute('aria-label'), 'Seçeneklerde ara');
    await click('Filtre kahve seçeneklerini göster');
    assert.equal(browser.document.activeElement?.getAttribute('aria-label'), 'Seçeneklerde ara');
    await React.act(async () => browser.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); await settle();
    assert.equal(container.querySelector('section[aria-label="Seçim listesi"]'), null);
    assert.ok(container.querySelector('[role="dialog"]'));
    assert.equal(browser.document.activeElement?.textContent?.trim(), 'Önerilecek seçenek ekle');
  });
});

test('invalid placements and missing offers identify their fields and focus the first problem without writing', async () => {
  await orderBumpScreen(async ({ click, browser, container, writes }: any) => {
    await click('Düzenle'); await click('Yan sepette göster'); await click('Ödemede göster'); await click('Uygula');
    const placement = container.querySelector('input[aria-label="Yan sepette göster"]');
    assert.equal(placement?.getAttribute('aria-invalid'), 'true'); assert.equal(browser.document.activeElement, placement);
    assert.match(browser.document.getElementById(placement?.getAttribute('aria-describedby'))?.textContent, /En az bir gösterim yeri/);
    await click('Yan sepette göster'); await click('Kupa · Mavi seçimini kaldır'); await click('Uygula');
    const offer = [...container.querySelectorAll('button')].find((button: any) => button.textContent?.trim() === 'Önerilecek seçenek ekle');
    assert.equal(offer?.getAttribute('aria-invalid'), 'true'); assert.equal(browser.document.activeElement, offer);
    assert.match(browser.document.getElementById(offer?.getAttribute('aria-describedby'))?.textContent, /En az bir ürün seçeneği/);
    assert.equal(writes.length, 0);
  });
});

test('verified save followed by journal cleanup failure permits exit and inspection without another write', async () => {
  await orderBumpScreen(async ({ click, input, container, writes }: any) => {
    await click('Düzenle'); await input('Başlık', 'Doğrulanmış kayıt'); await click('Uygula');
    assert.equal(container.querySelector('[role="dialog"]'), null); assert.match(container.textContent, /uygulandı/);
    await click('Düzenle'); assert.equal((container.querySelector('input[aria-label="Başlık"]') as HTMLInputElement).value, 'Doğrulanmış kayıt');
    assert.equal((container.querySelector('input[aria-label="Başlık"]') as HTMLInputElement).disabled, true);
    await click('Vazgeç'); assert.equal(container.querySelector('[role="dialog"]'), null); assert.equal(writes.length, 1);
  }, { storageCleanupUnavailable: true });
});

test('dirty same-document Back preserves the form until an explicit navigation discard', async () => {
  await orderBumpScreen(async ({ click, input, browser, navigation, container, writes, pushes }: any) => {
    await click('Düzenle'); await input('Başlık', 'Geri dönüşte korunan');
    const back = new browser.Event('navigate', { cancelable: true }); Object.assign(back, { navigationType: 'traverse', destination: { url: 'https://panel.example.test/settings', sameDocument: true } });
    await React.act(async () => navigation.dispatchEvent(back));
    assert.equal(back.defaultPrevented, true); assert.ok(container.querySelector('[data-order-bump-discard]')); assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
    await click('Düzenlemeye devam'); assert.equal((container.querySelector('input[aria-label="Başlık"]') as HTMLInputElement).value, 'Geri dönüşte korunan'); assert.deepEqual(pushes, []);
    const retry = new browser.Event('navigate', { cancelable: true }); Object.assign(retry, { navigationType: 'traverse', destination: { url: 'https://panel.example.test/settings', sameDocument: true } });
    await React.act(async () => navigation.dispatchEvent(retry)); await click('Değişiklikleri bırak');
    assert.deepEqual(pushes, ['/settings']); assert.equal(writes.length, 0);
  });
});

test('a definitive conflict after uncertain-save recovery releases the old intent before canonical reload', async () => {
  let reads = 0;
  await orderBumpScreen(async ({ click, input, container, writes }: any) => {
    await click('Düzenle'); await input('Başlık', 'İlk korunan giriş'); await click('Uygula'); await click('Kaydı doğrula');
    await click('Güncel ayarları yükle'); await click('Girişleri bırak ve yükle');
    await input('Başlık', 'Yeni kanonik giriş'); await click('Uygula');
    assert.equal(writes.length, 3); assert.equal(writes[0].operation, writes[1].operation); assert.notEqual(writes[1].operation, writes[2].operation);
    assert.equal(writes[2].expectedVersion, 5); assert.equal(writes[2].config.heading, 'Yeni kanonik giriş'); assert.equal(container.querySelector('[role="dialog"]'), null);
  }, { get: async () => response({ workspace: ++reads === 1 ? initial : { ...initial, version: 5, config: { ...config, heading: 'Güncel sunucu başlığı' } } }), save: async (body, _operation, index) => index === 1 ? Promise.reject(Error('lost_response')) : index === 2 ? response({ code: 'version_conflict' }, 409) : response({ workspace: { version: body.expectedVersion + 1, updatedAt: NOW, config: body.config } }) });
});
