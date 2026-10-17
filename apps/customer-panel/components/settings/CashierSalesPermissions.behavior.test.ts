import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { compile, mounted, click, input, effectiveCss } from '../../lib/mira-final-test-support.ts';

const MEMBER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DEPOT = '33333333-3333-4333-8333-333333333333';
const staff = { staffId: OTHER, membershipId: MEMBER, displayName: 'Ada', role: 'cashier', enabled: true, version: 2, phoneMasked: null, phoneVerified: true };
const grant = { membershipId: MEMBER, label: 'Ada', role: 'cashier', enabled: true, locationIds: [DEPOT], discountLimitBps: 1250, canEditPrice: true, canSellOnCredit: true, canCollectReceivables: false, version: 4 };
const bootstrap = { scopeKey: 'fixture', locations: [{ id: DEPOT, name: 'Ana depo', isDefault: true }], permissions: { canManageStaff: true }, activeDraft: null, heldSales: [], pendingSales: [], recentSales: [], summary: {} };
const clientModule = compile('lib/in-store-sales-ui/client.ts');
const overrides = { '../../lib/in-store-sales-ui/client.ts': clientModule };
function dialog() { return compile('components/settings/CashierSalesPermissions.tsx', overrides).CashierSalesPermissions; }
function client(extra: any = {}) {
  let sequence = 0;
  return { bootstrap: async () => bootstrap, listStaff: async () => [grant], setStaffGrant: async (_id: string, body: any) => ({ ...grant, ...body, version: body.expectedVersion + 1 }), newId: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`, ...extra };
}
const props = (salesClient: any, extra: any = {}) => ({ membershipId: MEMBER, staff, active: true, client: salesClient, onClose: () => {}, onSaved: () => {}, ...extra });
const field = (host: any, name: string) => host.querySelector(`[name="${name}"]`);
async function submit(host: any, window: any) { await act(async () => host.querySelector('[data-cashier-sales-form]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))); }
async function toggle(host: any, name: string) { await act(async () => field(host, name).click()); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test('Personnel offers sales permissions only for an enabled cashier with an active membership', async () => {
  const { MerchantStaffConsole } = compile('components/settings/MerchantStaffConsole.tsx', overrides);
  let reads = 0;
  const rows = [staff, { ...staff, staffId: 'disabled', membershipId: OTHER, enabled: false }, { ...staff, staffId: 'editor', membershipId: OTHER, role: 'editor' }, { ...staff, staffId: 'legacy', membershipId: undefined }];
  await mounted(MerchantStaffConsole, { client: { state: async () => ({ version: 1, enabled: true, staff: rows }) }, salesClient: client({ bootstrap: async () => { reads++; return bootstrap; } }) }, async host => {
    assert.equal(host.querySelectorAll('[data-sales-permissions]').length, 1);
    assert.equal(reads, 0);
    await click(host, 'Satış yetkileri');
    assert.ok(host.querySelector('dialog[open][aria-labelledby]'));
    assert.match(host.querySelector('dialog[open]').textContent, /Ada/);
    assert.equal(reads, 1);
  });
});

test('opening reads bootstrap and grants once, selects the exact membership and honors saved collection false', async () => {
  let bootReads = 0, staffReads = 0, writes = 0;
  await mounted(dialog(), props(client({ bootstrap: async () => { bootReads++; return bootstrap; }, listStaff: async () => { staffReads++; return [{ ...grant, membershipId: OTHER, canCollectReceivables: true }, grant]; }, setStaffGrant: async () => { writes++; return grant; } })), async host => {
    assert.equal(bootReads, 1); assert.equal(staffReads, 1); assert.equal(writes, 0);
    assert.equal(field(host, 'canCollectReceivables').checked, false);
    assert.equal(field(host, 'enabled').checked, true);
    assert.equal(field(host, 'discount').value, '12,5');
    assert.equal(field(host, 'location').checked, true);
    assert.match(host.textContent, /analizleri görüntüleyebilir/);
    assert.match(host.textContent, /ürün ekleyebilir, düzenleyebilir ve silebilir/);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(staffReads, 1); assert.equal(writes, 0);
  });
});

test('StrictMode opens with one pair of reads and never writes', async () => {
  let bootReads = 0, staffReads = 0, writes = 0;
  const Component = dialog();
  function StrictDialog() { return React.createElement(React.StrictMode, null, React.createElement(Component, props(client({ bootstrap: async () => { bootReads++; return bootstrap; }, listStaff: async () => { staffReads++; return [grant]; }, setStaffGrant: async () => { writes++; return grant; } })))); }
  await mounted(StrictDialog, {}, async host => { assert.ok(field(host, 'discount')); assert.equal(bootReads, 1); assert.equal(staffReads, 1); assert.equal(writes, 0); });
});

test('only a brand-new version zero grant defaults collection to true', async () => {
  for (const [version, saved, expected] of [[0, false, true], [4, false, false], [4, true, true]] as const) {
    await mounted(dialog(), props(client({ listStaff: async () => [{ ...grant, version, canCollectReceivables: saved }] })), async host => assert.equal(field(host, 'canCollectReceivables').checked, expected));
  }
});

test('save uses the selected membership, server version and explicit flags without automatic writes', async () => {
  const writes: any[] = []; let saved = 0;
  await mounted(dialog(), props(client({ setStaffGrant: async (id: string, body: any, key: string) => { writes.push({ id, body, key }); return { ...grant, ...body, version: 5 }; } }), { onSaved: () => saved++ }), async (host, window) => {
    await input(window, field(host, 'discount'), '20,25'); await toggle(host, 'canCollectReceivables'); await toggle(host, 'canEditPrice');
    await submit(host, window);
    assert.equal(writes.length, 1); assert.equal(saved, 1);
    assert.deepEqual(writes[0].body, { expectedVersion: 4, enabled: true, locationIds: [DEPOT], discountLimitBps: 2025, canEditPrice: false, canSellOnCredit: true, canCollectReceivables: true, canManageAccounting: false });
    assert.equal(writes[0].id, MEMBER); assert.ok(writes[0].key);
  });
});

test('uncertain save freezes the draft and retries the identical operation while keeping cancel and Escape available', async () => {
  const writes: any[] = []; let closed = 0;
  await mounted(dialog(), props(client({ setStaffGrant: async (id: string, body: any, key: string) => { writes.push({ id, body, key }); throw new clientModule.InStoreSalesUiError('unavailable', 503, true); } }), { onClose: () => closed++ }), async (host, window) => {
    await input(window, field(host, 'discount'), '15'); await submit(host, window);
    assert.match(host.textContent, /Sonuç doğrulanamadı/); assert.equal(field(host, 'discount').value, '15'); assert.equal(field(host, 'discount').closest('fieldset').disabled, true);
    await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(writes.length, 1);
    await submit(host, window); assert.equal(writes.length, 2); assert.deepEqual(writes[1], writes[0]);
    await click(host, 'Vazgeç'); assert.equal(closed, 1);
    await act(async () => host.querySelector('dialog').dispatchEvent(new window.Event('cancel', { cancelable: true })));
    assert.equal(closed, 2); assert.equal(writes.length, 2);
  });
});

test('version conflict keeps the draft and requires fresh reads plus explicit version adoption before another save', async () => {
  const writes: any[] = []; let reads = 0;
  await mounted(dialog(), props(client({ listStaff: async () => [{ ...grant, version: ++reads === 1 ? 4 : 5, discountLimitBps: 500 }], setStaffGrant: async (id: string, body: any, key: string) => { writes.push({ id, body, key }); if (writes.length === 1) throw new clientModule.InStoreSalesUiError('version_conflict', 409); return { ...grant, version: 6 }; } })), async (host, window) => {
    await input(window, field(host, 'discount'), '25'); await submit(host, window);
    assert.equal(host.querySelector('[type="submit"]').disabled, true);
    const adopt = () => [...host.querySelectorAll('button')].find((b: any) => b.textContent === 'Güncel sürümü kullan');
    assert.equal(adopt().disabled, true); await submit(host, window); assert.equal(writes.length, 1);
    await click(host, 'Güncel yetkileri yükle'); assert.equal(writes.length, 1); assert.equal(adopt().disabled, false); assert.equal(field(host, 'discount').value, '25');
    assert.match(host.textContent, /Güncel kayıt/); await click(host, 'Güncel sürümü kullan'); await submit(host, window);
    assert.equal(writes[1].body.expectedVersion, 5); assert.equal(writes[1].body.discountLimitBps, 2500); assert.notEqual(writes[1].key, writes[0].key);
  });
});

test('missing or non-cashier grants and server authority denial fail closed', async () => {
  for (const extra of [{ listStaff: async () => [] }, { listStaff: async () => [{ ...grant, role: 'editor' }] }, { bootstrap: async () => ({ ...bootstrap, permissions: { canManageStaff: false } }) }]) {
    let writes = 0;
    await mounted(dialog(), props(client({ ...extra, setStaffGrant: async () => { writes++; return grant; } })), async host => { assert.ok(host.querySelector('[role="alert"]')); assert.ok(!host.querySelector('[type="submit"]')); assert.equal(writes, 0); });
  }
});

test('read failure exposes a manual retry; loading and errors never offer an unverified form', async () => {
  const wait = deferred<any>(); let reads = 0;
  await mounted(dialog(), props(client({ bootstrap: async () => { if (++reads === 1) return wait.promise; return bootstrap; } })), async host => {
    assert.ok(host.querySelector('[role="status"]')); assert.ok(!host.querySelector('[type="submit"]'));
    await act(async () => wait.resolve(Promise.reject(new Error('SECRET'))));
    assert.ok(host.querySelector('[role="alert"]')); assert.ok(!host.textContent.includes('SECRET')); assert.ok(!host.querySelector('[type="submit"]'));
    await click(host, 'Yeniden dene'); assert.ok(field(host, 'discount')); assert.equal(reads, 2);
  });
});

test('duplicate submits are ignored and the active membership fence prevents a stale target save', async () => {
  const wait = deferred<any>(); let writes = 0;
  await mounted(dialog(), props(client({ setStaffGrant: async () => { writes++; return wait.promise; } })), async (host, window) => {
    await submit(host, window); await submit(host, window); assert.equal(writes, 1); await act(async () => wait.resolve({ ...grant, version: 5 }));
  });
  await mounted(dialog(), props(client(), { staff: { ...staff, enabled: false } }), async host => { assert.ok(!host.querySelector('[type="submit"]')); assert.ok(host.querySelector('[role="alert"]')); });
});

test('revoking the active target hides its loaded form immediately and cannot replay the previous form handler', async () => {
  let writes = 0;
  const Component = dialog();
  const salesClient = client({ setStaffGrant: async () => { writes++; return grant; } });
  function Target() {
    const [active, setActive] = React.useState(true);
    return React.createElement(React.Fragment, null, React.createElement('button', { onClick: () => setActive(false) }, 'Revoke fixture'), React.createElement(Component, props(salesClient, { staff: { ...staff, enabled: active } })));
  }
  await mounted(Target, {}, async host => { assert.ok(field(host, 'discount')); await click(host, 'Revoke fixture'); assert.ok(!host.querySelector('[type="submit"]')); assert.ok(!field(host, 'discount')); assert.equal(writes, 0); });
});

test('native modal is labelled, focuses its close control and restores focus to the Personnel row after Escape', async () => {
  const { MerchantStaffConsole } = compile('components/settings/MerchantStaffConsole.tsx', overrides);
  await mounted(MerchantStaffConsole, { client: { state: async () => ({ version: 1, enabled: true, staff: [staff] }) }, salesClient: client() }, async (host, window) => {
    const trigger = host.querySelector('[data-sales-permissions]'); trigger.focus(); await click(host, 'Satış yetkileri');
    const modal = host.querySelector('dialog[open]'); assert.ok(modal); assert.ok(window.document.getElementById(modal.getAttribute('aria-labelledby')));
    assert.ok(window.document.activeElement === modal.querySelector('button'), 'Close button receives focus');
    await act(async () => modal.dispatchEvent(new window.Event('cancel', { cancelable: true })));
    assert.ok(!host.querySelector('dialog[open]')); assert.ok(window.document.activeElement === trigger, 'Row action regains focus');
  });
});

test('dialog controls remain bounded and touch sized at mobile and desktop widths', () => {
  for (const width of [390, 1024, 1440]) {
    const form = effectiveCss('components/settings/CashierSalesPermissions.module.css', '<form class="form"><fieldset class="group"><label class="field"><input/></label></fieldset></form>', '.form', width);
    assert.equal(form.minWidth, '0');
    const button = effectiveCss('components/settings/CashierSalesPermissions.module.css', '<button class="primary">Kaydet</button>', '.primary', width); assert.equal(button.minHeight, '44px');
  }
});

test('full accounting is off for all unsaved or older grants and uses exactly one explicit checkbox',async()=>{
 for(const version of [0,4])await mounted(dialog(),props(client({listStaff:async()=>[{...grant,version}]})),async host=>{
  assert.equal(host.querySelectorAll('[name="canManageAccounting"]').length,1);assert.equal(field(host,'canManageAccounting').checked,false);assert.match(field(host,'canManageAccounting').closest('label').textContent,/Tüm muhasebeye erişebilir/);
 });
 await mounted(dialog(),props(client({listStaff:async()=>[{...grant,canManageAccounting:true}]})),async host=>assert.equal(field(host,'canManageAccounting').checked,true));
});
test('full accounting is saved atomically with existing sales flags and uncertain retry preserves the exact choice',async()=>{
 const writes:any[]=[];
 await mounted(dialog(),props(client({setStaffGrant:async(id:string,body:any,key:string)=>{writes.push({id,body,key});throw new clientModule.InStoreSalesUiError('unavailable',503,true);}})),async(host,window)=>{
  await toggle(host,'canManageAccounting');await submit(host,window);assert.equal(writes[0].body.canManageAccounting,true);assert.equal(writes[0].body.canCollectReceivables,false);assert.equal(field(host,'canManageAccounting').closest('fieldset').disabled,true);
  await submit(host,window);assert.deepEqual(writes[1],writes[0]);
 });
});
