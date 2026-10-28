import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import * as contracts from '@celebix/saas-contracts';
import { compile, withEditor } from './design/design-editor-test-utils.ts';
import * as toolClient from '../../lib/store-tools-ui/client.ts';
const ID = '11111111-1111-4111-8111-111111111111', NOW = '2026-10-28T12:00:00Z';
const props = { storeId: ID, canManage: true, canReadCoupons: false, canCreateCoupon: false, checkoutEnabled: true };
async function catalog(owned: boolean, run: (context: any) => Promise<void>, readonly = false) {
  const reads: string[] = [];
  const workspace = { storeId: ID, timezone: 'Europe/Istanbul', offers: contracts.STORE_TOOL_OFFERS, purchases: [], licenses: owned ? contracts.STORE_TOOL_KEYS.map(toolKey => ({ toolKey, source: 'grandfathered', grantedAt: NOW })) : [], canRequestPurchase: !readonly };
  const orderApi = { persistenceAvailable: () => true, pendingIntent: () => null, hasUnresolved: () => false, get: async () => { reads.push('order_bump'); return { version: 0, config: contracts.createDefaultOrderBumpSettings() }; } };
  const captureApi = { pendingIntent: async () => null, pendingDeletion: async () => null, hasUnresolved: () => false, list: async () => { reads.push('cart_capture'); return []; } };
  const { StoreToolsPurchasingConsole } = compile<any>(new URL('./StoreToolsPurchasingConsole.tsx', import.meta.url), {
    '@/lib/store-tools-ui/client': { ...toolClient, storeToolsUi: { read: async () => { reads.push('offers'); return workspace; } } },
    '@/components/panel/PanelPageShell': { PanelPageShell: ({ children }: any) => children, PanelPageHeader: () => null },
    '@/components/panel/PanelLayoutClient': { usePanelChromeModel: () => ({ storeSlug: 'fixture' }) },
    '@/lib/merchant-admin-ui/client': { MerchantAdminApiError: class extends Error {}, merchantAdminApi: { records: async (kind: string) => { reads.push(kind); return []; } } },
    '@/lib/store-engagement-ui/client': { scopedStoreEngagementApi: () => captureApi },
    '@/lib/order-bumps-ui/client': { scopedOrderBumpsApi: () => orderApi, OrderBumpsApiError: class extends Error {} },
    'next/navigation': { useRouter: () => ({ push: () => {} }) },
    '../promotions/PopupStudio': { EngagementEditor: ({ onClose }: any) => React.createElement('div', { 'data-capture-editor': true }, React.createElement('button', { onClick: onClose }, 'Kapat')) },
    './design/DesignSettingsDrawer': { DesignSettingsModal: ({ open, children, onClose }: any) => open ? React.createElement('div', { 'data-bump-editor': true }, children, React.createElement('button', { 'data-bump-close': true, onClick: onClose }, 'Kapat')) : null },
    './design/DesignLinkField': { DesignResourceField: () => null },
    '../commercial-packages/PlatformCheckoutButton': { PlatformCheckoutButton: ({ offerId, disabled }: any) => React.createElement('button', { 'data-checkout-offer': offerId, disabled }, 'Güvenli ödemeye geç') },
  });
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { reads.push('stats'); return Response.json({ awaitingConfirmation: 0, pendingConfirmed: 0, sent: 0, failed: 0, recent: [] }); };
  try { await withEditor(async context => { await context.render(React.createElement(StoreToolsPurchasingConsole, { ...props, canManage: !readonly })); await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); await run({ ...context, reads, click: async (selector: string) => { const element = context.container.querySelector(selector); assert.ok(element, selector); await context.click(element); } }); }); }
  finally { globalThis.fetch = previous; }
}

test('real composed catalog renders five individually purchasable products and the bundle', async () => {
  await catalog(false, async ({ container, reads }: any) => {
    assert.equal(container.querySelectorAll('[data-tool-product]').length, 6);
    for (const offer of contracts.STORE_TOOL_OFFERS) {
      const card = container.querySelector(`[data-tool-product="${offer.id}"]`);
      assert.ok(card, offer.id);
      assert.ok(card.querySelector(`[data-checkout-offer="${offer.id}"]`));
      assert.equal(card.querySelectorAll('li').length, 3);
      assert.equal(card.querySelector('img').getAttribute('width'), '960');
      assert.equal(card.querySelector('img').getAttribute('height'), '640');
      assert.match(card.textContent, /Tek seferlik · Yıllık yenileme yok/);
    }
    assert.deepEqual(reads, ['offers'], 'unlicensed products do not read configuration');
  });
});

test('all licensed products keep their real configure callbacks with one existing read per tool', async () => {
  await catalog(true, async ({ container, reads, click }: any) => {
    assert.equal(container.querySelectorAll('[data-tool-product]').length, 5);
    assert.equal(container.querySelectorAll('[data-checkout-offer]').length, 0);
    for (const tool of contracts.STORE_TOOL_KEYS) assert.match(container.querySelector(`[data-tool-product="${tool}"]`).textContent, /Mağazanızda mevcut/);
    for (const key of ['offers', 'contact_widget', 'whatsapp_order_setting', 'restock_alerts', 'cart_capture', 'order_bump', 'stats']) assert.equal(reads.filter((item: string) => item === key).length, 1, key);
    await click('[data-tool-edit="contact_widget"]');
    assert.ok(container.querySelector('form[data-settings-dirty]'));
    assert.equal(container.querySelectorAll('[data-tool-product]').length, 0);
    await click('[data-tool-close]');
    assert.equal(container.querySelectorAll('[data-tool-product]').length, 5);
    await click('[data-tool-edit="restock_alerts"]'); assert.ok(container.querySelector('[data-restock-back]')); await click('[data-restock-back]');
    await click('[data-tool-edit="whatsapp_order_setting"]'); assert.ok(container.querySelector('#whatsapp-back')); await click('#whatsapp-back');
    await click('[data-tool-edit="cart_capture"]'); assert.ok(container.querySelector('[data-capture-editor]')); await click('[data-capture-editor] button');
    await click('[data-tool-edit="order_bumps"]'); assert.ok(container.querySelector('[data-bump-editor]')); await click('[data-bump-close]');
    assert.equal(container.querySelectorAll('[data-tool-product]').length, 5);
  });
});

test('read-only merchants inspect products and owned configuration without acquiring purchase controls', async () => {
  await catalog(false, async ({ container }: any) => { assert.equal(container.querySelectorAll('[data-checkout-offer]').length, 0); assert.match(container.textContent, /mağaza sahibi veya yöneticisi/); }, true);
  await catalog(true, async ({ container, click }: any) => { const button = container.querySelector('[data-tool-edit="contact_widget"]'); assert.equal(button.textContent.replace(/\s+/g, ' ').trim(), 'Görüntüle'); await click('[data-tool-edit="contact_widget"]'); assert.match(container.textContent, /Salt okunur/); }, true);
});
