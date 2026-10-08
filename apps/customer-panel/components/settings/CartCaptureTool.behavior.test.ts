import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultStoreEngagementConfig } from '@celebix/saas-contracts';
import { popupScreen } from '../promotions/popup-studio-test-utils.ts';
test('cart capture applies the existing singleton with CAS and keeps capture fields separate from popups', async () => {
    const record = {
        id: '00000000-0000-4000-8000-000000000001', kind: 'cart_capture', name: 'Sepet yakalama', enabled: false, version: 4, config: createDefaultStoreEngagementConfig('cart_capture'), updatedAt: '2026-10-04T10:00:00.000Z'
    };
    await popupScreen(async ({ click, container, writes }) => {
        await click('Düzenle');
        await click('İçerik');
        assert.ok(container.querySelector('[name="engagement-collect-mode"]'));
        const enabled = container.querySelector('[name="engagement-enabled"]');
        await click('Uygula');
        assert.equal(writes.length, 1);
        assert.equal(writes[0].campaignId, record.id);
        assert.equal(writes[0].expectedVersion, 4);
        assert.equal(writes[0].kind, 'cart_capture');
        assert.equal(writes[0].enabled, false);
        assert.ok(enabled);
    }, {
        kind: 'cart_capture', records: [record]
    });
});

test('cart recovery confirms the original create intent even after the committed singleton appears in GET',async()=>{
 const retained={kind:'cart_capture',name:'Sepet yakalama',enabled:true,config:{...createDefaultStoreEngagementConfig('cart_capture'),heading:'Korunan sepet başlığı'}};
 const observed={...retained,id:'00000000-0000-4000-8000-000000000001',version:1,updatedAt:'2026-10-04T10:00:00.000Z'};
 await popupScreen(async({click,container,writes})=>{await click('Önceki kaydı doğrula');await click('İçerik');assert.equal(container.querySelector('[name="engagement-heading"]').value,retained.config.heading);await click('Uygula');assert.deepEqual(writes,[retained]);assert.equal(container.querySelector('[role="dialog"]'),null);},{kind:'cart_capture',recoveryInput:retained,records:[observed]});
});


test('unresolved popup deletion keeps capture edits fenced and provides the popup recovery route',async()=>{
 await popupScreen(async({container,writes})=>{
  const link=container.querySelector('a[href="/discounts/popups"]');assert.ok(link);assert.match(link.textContent,/silme/);
  assert.equal(container.querySelector('[data-tool-edit="cart_capture"]').disabled,true);assert.equal(writes.length,0);
 },{kind:'cart_capture',recoveryDeletion:{campaignId:'00000000-0000-4000-8000-000000000001',expectedVersion:4}});
});
