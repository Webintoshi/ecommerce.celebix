import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COMMERCIAL_PACKAGES } from '@celebix/saas-contracts';
import { compile, withEditor } from '../settings/design/design-editor-test-utils.ts';
const link = { __esModule: true, default: ({ children, ...p }: any) => React.createElement('a', p, children) };
test('one positive upgrade card shows annual upfront price and a separate monthly option from the catalog', () => {
    const { CommercialUpgradeCard } = compile<any>(new URL('./CommercialUpgradeCard.tsx', import.meta.url), { 'next/link': link });
    const html = renderToStaticMarkup(React.createElement(CommercialUpgradeCard, { capability: 'accounting', currentPackage: COMMERCIAL_PACKAGES[1], canRequest: true }));
    for (const copy of ['Bu özelliğe indirimli sahip olabilirsiniz', 'Yıllık pakette 12 ay kullanın, 10 ay ödeyin.', 'Mevcut paketiniz', 'Önerilen paket', '77.870', '7.787', 'İndirimli paketi incele', 'Paketleri karşılaştır'])
        assert.ok(html.includes(copy), copy);
    assert.match(html, /settings\/plan\?feature=accounting/);
    assert.doesNotMatch(html, /dahil değil|planınızda yok|erişiminiz yok/i);
    const staff = renderToStaticMarkup(React.createElement(CommercialUpgradeCard, { capability: 'accounting', currentPackage: COMMERCIAL_PACKAGES[1], canRequest: false }));
    assert.match(staff, /Mağaza sahibinizle/);
    assert.doesNotMatch(staff, /İndirimli paketi incele/);
});
test('comparison loads real usage, sends one stable operation key and preserves it after an uncertain retry', async () => {
    const requests: any[] = [];
    let attempts = 0;
    const fetcher = async (url: string, init?: RequestInit) => { if (!init?.method)
        return Response.json({ plan: { planId: COMMERCIAL_PACKAGES[0].id, planCode: 'free_starter', version: COMMERCIAL_PACKAGES[0].version }, usage: { products: 7, variants: 12, staff: 1, storageBytes: 100, monthlyOrders: 3, customDomains: 0 } }); requests.push({ url, body: JSON.parse(String(init.body)), headers: init.headers }); if (++attempts === 1)
        throw Error('network'); return Response.json({ requestId: '80000000-0000-4000-8000-000000000002', storeId: '80000000-0000-4000-8000-000000000003', planId: COMMERCIAL_PACKAGES[3].id, status: 'pending', createdAt: '2026-10-17T00:00:00Z', replayed: true }); };
    const { CommercialPlanComparison } = compile<any>(new URL('./CommercialPlanComparison.tsx', import.meta.url), { 'next/link': link });
    await withEditor(async ({ container, render, click }) => { await render(React.createElement(CommercialPlanComparison, { currentPlan: { planId: COMMERCIAL_PACKAGES[0].id, planCode: 'free_starter', version: COMMERCIAL_PACKAGES[0].version }, canRequest: true, feature: 'manual_orders', fetcher, createOperationId: () => '80000000-0000-4000-8000-000000000001' })); await React.act(async () => { await new Promise(r => setTimeout(r, 0)); }); assert.match(container.textContent ?? '', /7 \/ 25/); const request = () => Array.from(container.querySelectorAll('button')).find(b => /Paket değişikliği talep et|Aynı talebi yeniden/.test(b.textContent ?? ''))!; await click(request()); await click(request()); assert.equal(requests.length, 2); assert.deepEqual(requests[0].body, requests[1].body); assert.equal(requests[0].headers['Idempotency-Key'], requests[0].body.operationId); assert.match(container.textContent ?? '', /Talebiniz iletildi/); });
});
test('an uncertain write is confirmed by a read without an automatic duplicate write', async () => {
    let writes = 0, reads = 0;
    const pending = { requestId: '80000000-0000-4000-8000-000000000002', storeId: '80000000-0000-4000-8000-000000000003', planId: COMMERCIAL_PACKAGES[3].id, status: 'pending', createdAt: '2026-10-17T00:00:00Z' };
    const fetcher = async (_url: string, init?: RequestInit) => { if (init?.method === 'POST') {
        writes++;
        throw Error('uncertain');
    } return Response.json({ plan: { planId: COMMERCIAL_PACKAGES[0].id, planCode: 'free_starter', version: COMMERCIAL_PACKAGES[0].version }, usage: { products: 7, variants: 12, staff: 1, storageBytes: 100, monthlyOrders: 3, customDomains: 0 }, ...(++reads > 1 ? { request: pending } : {}) }); };
    const { CommercialPlanComparison } = compile<any>(new URL('./CommercialPlanComparison.tsx', import.meta.url), { 'next/link': link });
    await withEditor(async ({ container, render, click }) => { await render(React.createElement(CommercialPlanComparison, { currentPlan: { planId: COMMERCIAL_PACKAGES[0].id, planCode: 'free_starter', version: COMMERCIAL_PACKAGES[0].version }, canRequest: true, feature: 'manual_orders', fetcher, createOperationId: () => '80000000-0000-4000-8000-000000000001' })); await React.act(async () => { await new Promise(r => setTimeout(r, 0)); }); await click(Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Paket değişikliği talep et'))!); assert.equal(writes, 1); assert.equal(reads, 2); assert.match(container.textContent ?? '', /Talebiniz iletildi/); });
});
test('locked navigation links remain clickable with an accessible lock', () => {
    const { PanelNavigation } = compile<any>(new URL('../panel/PanelNavigation.tsx', import.meta.url), { 'next/link': link, 'next/navigation': { usePathname: () => '/seo' } });
    const html = renderToStaticMarkup(React.createElement(PanelNavigation, { mode: 'desktop', lockedNavigationHrefs: ['/seo'] }));
    assert.match(html, /href="\/seo"/);
    assert.match(html, /Paket seçeneklerini inceleyin/);
    assert.doesNotMatch(html, /aria-disabled="true"/);
});

test('staff compare packages without fetching owner usage or rendering a request action',async()=>{
 let reads=0;const {CommercialPlanComparison}=compile<any>(new URL('./CommercialPlanComparison.tsx',import.meta.url),{'next/link':link});
 await withEditor(async({container,render})=>{await render(React.createElement(CommercialPlanComparison,{currentPlan:{planId:COMMERCIAL_PACKAGES[0].id,planCode:'free_starter',version:COMMERCIAL_PACKAGES[0].version},canRequest:false,fetcher:async()=>{reads++;return new Response(null,{status:403});}}));assert.equal(reads,0);assert.doesNotMatch(container.textContent??'',/bilgileri alınamadı|Paket değişikliği talep et/);assert.match(container.textContent??'',/Mağaza sahibinizle/);});
});

test('historic agreements retain their limits and only a higher package tier can be requested',async()=>{
 for(const [id,code,index,limit] of [['00000000-0000-4000-8000-000000000005','growth',2,5000],['00000000-0000-4000-8000-000000000006','professional',3,10000]] as const){
  const currentPlan={planId:id,planCode:code,version:1};const {CommercialPlanComparison}=compile<any>(new URL('./CommercialPlanComparison.tsx',import.meta.url),{'next/link':link});
  await withEditor(async({container,render,click})=>{
   await render(React.createElement(CommercialPlanComparison,{currentPlan,canRequest:true,feature:'manual_orders',fetcher:async()=>Response.json({plan:currentPlan,usage:{products:7,variants:12,staff:1,storageBytes:100,monthlyOrders:3,customDomains:0}})}));await React.act(async()=>{await new Promise(r=>setTimeout(r,0));});
   assert.match(container.textContent??'',new RegExp(`7 / ${limit.toLocaleString('tr-TR')}`));
   const request=()=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent==='Paket değişikliği talep et')!;
   assert.equal(request().disabled,index===3);
   for(const target of [0,1,2]){await click(container.querySelector<HTMLInputElement>(`input[value="${COMMERCIAL_PACKAGES[target].id}"]`)!);assert.equal(request().disabled,true);}
  });
 }
});
