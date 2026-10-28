import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { COMMERCIAL_PACKAGES } from '@celebix/saas-contracts';
import { compile, withEditor } from '../settings/design/design-editor-test-utils.ts';

const currentPlan = { planId: COMMERCIAL_PACKAGES[0].id, planCode: COMMERCIAL_PACKAGES[0].code, version: COMMERCIAL_PACKAGES[0].version };
const usage = { products: 7, variants: 12, staff: 1, storageBytes: 100, monthlyOrders: 3, customDomains: 0 };
const checkout = ({ offerId, term, disabled }: any) => React.createElement('button', { 'data-checkout-offer': offerId, 'data-checkout-term': term, disabled }, 'Güvenli ödemeye geç');
const load = () => compile<any>(new URL('./CommercialPlanComparison.tsx', import.meta.url), { './PlatformCheckoutButton': { PlatformCheckoutButton: checkout } }).CommercialPlanComparison;
const props = { currentPlan, storeId: '11111111-1111-4111-8111-111111111111', canRequest: true, checkoutEnabled: true, fetcher: async () => Response.json({ plan: currentPlan, usage }) };
const money = (cents: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
const gross = (net: number) => net + Math.round(net * 0.2);

test('product cards and selected payment totals stay synchronized with the billing period', async () => {
  const Component = load();
  await withEditor(async ({ container, render, click }) => {
    await render(React.createElement(Component, props));
    const cards = [...container.querySelectorAll<HTMLElement>('[data-plan-id]')];
    assert.equal(cards.length, 4);
    for (const [index, card] of cards.entries()) {
      const plan = COMMERCIAL_PACKAGES[index];
      assert.equal(card.querySelector('[data-plan-price]')?.textContent, `${money(gross(plan.annualPriceCents))} TL`);
      if (plan.annualPriceCents) {
        assert.match(card.textContent ?? '', /KDV dahil/);
        assert.equal(card.querySelector('[data-plan-equivalent]')?.textContent, `Aylık ${money(gross(plan.annualPriceCents) / 12)} TL · KDV dahil`);
      }
    }
    await click(container.querySelector(`input[value="${COMMERCIAL_PACKAGES[2].id}"]`)!);
    const summary = container.querySelector('[aria-label="Paket değişikliği"]')!;
    assert.match(summary.textContent ?? '', /Büyüme · Yıllık/);
    assert.equal(summary.querySelector('[data-total="net"]')?.textContent, '45.370 TL');
    assert.equal(summary.querySelector('[data-total="vat"]')?.textContent, '9.074 TL');
    assert.equal(summary.querySelector('[data-total="total"]')?.textContent, '54.444 TL');
    await click(container.querySelector('button[aria-label="Aylık ödeme"]')!);
    assert.equal(container.querySelector('button[aria-label="Aylık ödeme"]')?.getAttribute('aria-pressed'), 'true');
    for (const [index, card] of cards.entries()) {
      assert.equal(card.querySelector('[data-plan-price]')?.textContent, `${money(gross(COMMERCIAL_PACKAGES[index].monthlyPriceCents))} TL`);
      assert.equal(card.querySelector('[data-plan-equivalent]'), null);
    }
    assert.match(summary.textContent ?? '', /Büyüme · Aylık/);
    assert.equal(summary.querySelector('[data-total="net"]')?.textContent, '4.537 TL');
    assert.equal(summary.querySelector('[data-total="vat"]')?.textContent, '907,40 TL');
    assert.equal(summary.querySelector('[data-total="total"]')?.textContent, '5.444,40 TL');
    assert.equal(summary.querySelector('[data-checkout-offer]')?.getAttribute('data-checkout-offer'), COMMERCIAL_PACKAGES[2].id);
    assert.equal(summary.querySelector('[data-checkout-term]')?.getAttribute('data-checkout-term'), 'monthly');
  });
});

test('all artwork is uncropped source-sized imagery and the selected product summary precedes the full comparison', async () => {
  const Component = load();
  await withEditor(async ({ container, render, click }) => {
    await render(React.createElement(Component, props));
    for (const [index, key] of ['free', 'starter', 'growth', 'professional'].entries()) {
      const image = container.querySelector(`[data-plan-id="${COMMERCIAL_PACKAGES[index].id}"] img`)!;
      assert.equal(image.getAttribute('src'), `/payments/plans/celebix-${key}-v1.webp`);
      assert.equal(image.getAttribute('width'), '960');
      assert.equal(image.getAttribute('height'), '640');
    }
    await click(container.querySelector(`input[value="${COMMERCIAL_PACKAGES[3].id}"]`)!);
    const summary = container.querySelector('[aria-label="Paket değişikliği"]')!;
    const comparison = container.querySelector('[aria-label="Paket özellik karşılaştırması"]')!;
    assert.ok(summary.compareDocumentPosition(comparison) & 4, 'purchase summary is before comparison');
    assert.equal(summary.querySelector('img')?.getAttribute('src'), '/payments/plans/celebix-professional-v1.webp');
    const rows = [...comparison.querySelectorAll('tbody tr')];
    for (const label of ['Ürün', 'SKU / varyant', 'Kullanıcı', 'Depolama', 'Aylık sipariş', 'Özel alan adı', 'Manuel satış', 'Yapay zekâ araçları', 'Personel yönetimi']) assert.ok(rows.some(row => row.querySelector('th')?.textContent === label), label);
    assert.equal(rows.length, 21, 'five quotas, core features and fifteen capability rows');
    assert.doesNotMatch(container.textContent ?? '', /4 özel alan adı|1 özel alan adı/);
  });
});

test('staff can select product artwork without private usage reads or purchase controls', async () => {
  const Component = load(); let reads = 0;
  await withEditor(async ({ container, render, click }) => {
    await render(React.createElement(Component, { ...props, canRequest: false, fetcher: async () => { reads++; return new Response(null, { status: 403 }); } }));
    await click(container.querySelector(`input[value="${COMMERCIAL_PACKAGES[3].id}"]`)!);
    assert.equal(reads, 0);
    assert.equal(container.querySelector('[data-checkout-offer]'), null);
    assert.doesNotMatch(container.textContent ?? '', /Paket değişikliği talep et|7 \/ 25/);
    assert.match(container.textContent ?? '', /Mağaza sahibinizle/);
    assert.equal(container.querySelector('[aria-label="Paket değişikliği"] img')?.getAttribute('src'), '/payments/plans/celebix-professional-v1.webp');
  });
});

test('commerce-enabled historic paid agreements retain old usage limits and manual higher-tier rules', async () => {
  const Component = load();
  for (const [planId, code, canUpgrade] of [
    ['00000000-0000-4000-8000-000000000005', 'growth', true],
    ['00000000-0000-4000-8000-000000000006', 'professional', false],
  ] as const) {
    const historic = { planId, planCode: code, version: 1 };
    await withEditor(async ({ container, render, click }) => {
      await render(React.createElement(Component, { ...props, currentPlan: historic, fetcher: async () => Response.json({ plan: historic, usage }) }));
      assert.match(container.querySelector('[aria-label="Mevcut paket ve kullanım"]')?.textContent ?? '', canUpgrade ? /7 \/ 5.000/ : /7 \/ 10.000/);
      assert.equal(container.querySelector('[data-checkout-offer]'), null, 'paid agreements do not gain direct checkout');
      await click(container.querySelector(`input[value="${COMMERCIAL_PACKAGES[3].id}"]`)!);
      const request = [...container.querySelectorAll('button')].find(button => button.textContent === 'Paket değişikliği talep et')!;
      assert.ok(request);
      assert.equal(request.disabled, !canUpgrade);
      await click(container.querySelector(`input[value="${COMMERCIAL_PACKAGES[2].id}"]`)!);
      assert.equal(request.disabled, true, 'same or lower tiers cannot be requested');
    });
  }
});
