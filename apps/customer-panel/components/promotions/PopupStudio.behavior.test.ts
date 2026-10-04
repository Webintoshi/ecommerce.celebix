import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {createDefaultStoreEngagementConfig} from '@celebix/saas-contracts';
import { popupScreen } from './popup-studio-test-utils.ts';
const id = '00000000-0000-4000-8000-000000000001';
test('popup Apply saves an enabled campaign once and partial text remains previewable', async () => {
    await popupScreen(async ({ click, change, container, writes }) => {
        await click('Popup ekle');
        await click('İçerik');
        await change('engagement-heading', '');
        assert.ok(container.querySelector('[data-engagement-preview]'));
        await click('Uygula');
        assert.equal(writes.length, 0);
        assert.ok(container.querySelector('[role="alert"]'));
        await change('engagement-heading', 'Hoş geldiniz');
        await click('Uygula');
        assert.equal(writes.length, 1);
        assert.equal(writes[0].enabled, true);
        assert.equal(writes[0].kind, 'popup');
        assert.equal(container.querySelector('[role="dialog"]'), null);
    });
});
test('lost campaign response preserves fields, blocks close and permits only same Apply', async () => {
    let attempt = 0;
    await popupScreen(async ({ click, change, container, writes }) => {
        await click('Popup ekle');
        await click('İçerik');
        await change('engagement-heading', 'Korunan başlık');
        await click('Uygula');
        assert.equal((container.querySelector('[name="engagement-heading"]') as HTMLInputElement).value, 'Korunan başlık');
        assert.equal((container.querySelector('[name="engagement-heading"]') as HTMLInputElement).disabled, true);
        await click('Vazgeç');
        assert.ok(container.querySelector('[role="dialog"]'));
        await click('Uygula');
        assert.equal(writes.length, 2);
        assert.deepEqual(writes[0], writes[1]);
        assert.equal(container.querySelector('[role="dialog"]'), null);
    }, {
        save: async (input) => {
            if (++attempt === 1) {
                const error: any = new Error('Kayıt tamamlanamadı');
                error.code = 'unavailable';
                throw error;
            }
            return {
                ...input, id, version: 1, updatedAt: '2026-10-04T10:00:00.000Z'
            };
        }
    });
});
test('created public coupon stays linked when campaign fails and is not generated again', async () => {
    await popupScreen(async ({ click, change, container, coupons, writes }) => {
        await click('Popup ekle');
        await click('Kupon');
        await change('engagement-coupon-code', 'HOSGELDIN3');
        await click('Kupon oluştur');
        assert.equal(coupons.length, 1);
        await click('Uygula');
        assert.equal(writes[0].config.promotionId, id);
        assert.equal(coupons.length, 1);
        assert.match(container.textContent ?? '', /HOSGELDIN3/);
    }, {
        save: async () => {
            throw Error('network');
        }
    });
});
test('read-only popup cannot open a create operation', async () => {
    await popupScreen(async ({ container, writes }) => {
        assert.ok(!Array.from(container.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).some(button => button.textContent === 'Popup ekle'));
        assert.equal(writes.length, 0);
    }, {
        canManage: false
    });
});

test('reload recovery opens the retained popup and original expectedVersion without reconstructing fields',async()=>{
 const retained={campaignId:id,expectedVersion:6,kind:'popup',name:'Önceki isim',enabled:true,config:{...createDefaultStoreEngagementConfig(),heading:'Önceki başlık'}};
 await popupScreen(async({click,container,writes})=>{await click('Önceki kaydı doğrula');await click('İçerik');assert.equal(container.querySelector('[name="engagement-heading"]').value,'Önceki başlık');assert.equal(container.querySelector('[name="engagement-heading"]').disabled,true);await click('Uygula');assert.equal(writes.length,1);assert.deepEqual(writes[0],retained);assert.equal(container.querySelector('[role="dialog"]'),null);},{recoveryInput:retained,records:[{...retained,id,version:7,config:{...retained.config,heading:'Sonraki okuma'},updatedAt:'2026-10-04T10:00:00.000Z'}]});
});

test('modal keeps typing focus, traps keyboard focus and protects dirty Escape until discard',async()=>{
 await popupScreen(async({click,change,container,window,settle})=>{
  const trigger=container.querySelector('header button');
  await click('Popup ekle');await click('İçerik');
  const heading=container.querySelector('[name="engagement-heading"]');heading.focus();await change('engagement-heading','Değişen');
  assert.equal(window.document.activeElement,heading,'typing must not refocus the modal close button');
  assert.equal(container.querySelector('header').inert,true);
  const close=container.querySelector('[aria-label="Vazgeç ve kapat"]'),apply=Array.from(container.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(button=>button.textContent?.trim()==='Uygula')!;
  close.focus();await React.act(async()=>close.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true})));assert.equal(window.document.activeElement,apply);
  await React.act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));await settle();assert.ok(container.querySelector('[role="dialog"]'));assert.match(container.textContent,/Değişiklikler kaydedilmedi/);
  await click('Değişiklikleri bırak');assert.equal(container.querySelector('[role="dialog"]'),null);assert.equal(window.document.activeElement,trigger);assert.equal(container.querySelector('header').inert,false);
 });
});
test('public popup coupon has no per-customer limit and stays on the storefront channel', async () => {
    await popupScreen(async ({ click, change, coupons }) => {
        await click('Popup ekle');
        await click('Kupon');
        await change('engagement-coupon-code', 'HOSGELDIN3');
        await click('Kupon oluştur');
        assert.equal(coupons[0][0].perCustomerUsage, null);
        assert.deepEqual(coupons[0][0].salesChannels, ['storefront']);
        assert.equal(coupons[0][0].benefit.percentageBps, 300);
    });
});
test('existing coupon for identified customers is explained and cannot be linked', async () => {
    await popupScreen(async ({ click, change, container }) => {
        await click('Popup ekle');
        await click('Kupon');
        await change('engagement-promotion', id);
        assert.match(container.textContent, /kişi başı/);
        assert.equal(container.querySelector('[name="engagement-promotion"]').value, '');
    }, {
        couponItems: [{
                id, name: 'Kişiye özel'
            }], couponDetail: {
            id, status: 'active', name: 'Kişiye özel', ruleDocument: {
                audience: {
                    mode: 'everyone'
                }, limits: {
                    perCustomerUsage: 1
                }, trigger: {
                    kind: 'code', codes: ['HOSGELDIN3']
                }
            }
        }
    });
});
test('malformed coupon success keeps the original creation intent for verification', async () => {
    let attempt = 0;
    await popupScreen(async ({ click, change, coupons, container }) => {
        await click('Popup ekle');
        await click('Kupon');
        await change('engagement-coupon-code', 'HOSGELDIN3');
        await click('Kupon oluştur');
        assert.equal(container.querySelector('[name="engagement-coupon-code"]').disabled, true);
        await click('Kupon kaydını doğrula');
        assert.equal(coupons.length, 2);
        assert.deepEqual(coupons[0], coupons[1]);
    }, {
        applyCoupon: async () => ++attempt === 1 ? {
            kind: 'saved', promotion: {
                status: 'active'
            }
        } : {
            kind: 'saved', promotion: {
                id, status: 'active', name: 'Kupon', ruleDocument: {
                    trigger: {
                        kind: 'code', codes: ['HOSGELDIN3']
                    }
                }
            }
        }
    });
});
