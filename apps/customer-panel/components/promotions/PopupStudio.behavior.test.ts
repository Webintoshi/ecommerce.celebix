import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {createDefaultStoreEngagementConfig} from '@celebix/saas-contracts';
import { popupScreen } from './popup-studio-test-utils.ts';
const id = '00000000-0000-4000-8000-000000000001';
const imageId = '00000000-0000-4000-8000-000000000002';
const image = {
    id: imageId, url: 'https://fixture.invalid/popup.webp', altText: 'Popup görseli',
    mediaType: 'image/webp', width: 600, height: 800
};
function record(config = createDefaultStoreEngagementConfig()) {
    return { id, kind: 'popup', name: 'Karşılama', enabled: true, version: 4, config, updatedAt: '2026-10-04T10:00:00.000Z' };
}
async function withImageUrls(run: () => Promise<void>) {
    const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:popup-upload-fixture';
    URL.revokeObjectURL = () => {};
    try { await run(); } finally { URL.createObjectURL = create; URL.revokeObjectURL = revoke; }
}
async function pickFile(window: any, input: HTMLInputElement, file: File) {
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await React.act(async () => input.dispatchEvent(new window.Event('change', { bubbles: true }) as unknown as Event));
}
async function nextFrame(window: any) {
    await React.act(async () => new Promise<void>(resolve => window.requestAnimationFrame(() => resolve())));
}
test('popup Apply saves an enabled campaign once and partial text remains previewable', async () => {
    await popupScreen(async ({ click, change, container, writes }) => {
        await click('Popup ekle');
        await click('Tasarım');
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
        await click('Tasarım');
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
 await popupScreen(async({click,container,writes})=>{await click('Önceki kaydı doğrula');await click('Tasarım');assert.equal(container.querySelector('[name="engagement-heading"]').value,'Önceki başlık');assert.equal(container.querySelector('[name="engagement-heading"]').disabled,true);await click('Uygula');assert.equal(writes.length,1);assert.deepEqual(writes[0],retained);assert.equal(container.querySelector('[role="dialog"]'),null);},{recoveryInput:retained,records:[{...retained,id,version:7,config:{...retained.config,heading:'Sonraki okuma'},updatedAt:'2026-10-04T10:00:00.000Z'}]});
});

test('modal keeps typing focus, traps keyboard focus and protects dirty Escape until discard',async()=>{
 await popupScreen(async({click,change,container,window,settle,button})=>{
  const trigger=button('Popup ekle');
  await click('Popup ekle');await click('Tasarım');
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

test('popup has three steps, starts in Design and changes only its live preview before Apply', async () => {
    await popupScreen(async ({ click, change, container, button, writes, coupons }) => {
        await click('Popup ekle');
        const tabs = Array.from((container as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]'));
        assert.deepEqual(tabs.map(tab => tab.textContent?.trim()), ['Tasarım', 'Gösterim', 'Kupon']);
        assert.equal(button('Tasarım').getAttribute('aria-selected'), 'true');
        assert.equal(container.querySelectorAll('[name="engagement-template"]').length, 3);
        await change('engagement-heading', 'Size özel');
        await change('engagement-body', 'Yeni koleksiyon burada');
        await change('engagement-button-label', 'Keşfet');
        const preview = container.querySelector('[data-engagement-preview]');
        assert.match(preview?.textContent ?? '', /Size özel/);
        assert.match(preview?.textContent ?? '', /Yeni koleksiyon burada/);
        assert.match(preview?.textContent ?? '', /Keşfet/);
        await click('Gösterim');
        await click('Kupon');
        await click('Tasarım');
        assert.equal((container.querySelector('[name="engagement-heading"]') as HTMLInputElement).value, 'Size özel');
        assert.equal(writes.length, 0);
        assert.equal(coupons.length, 0);
    });
});

test('step navigation returns keyboard focus to the active tab at the final and initial steps', async () => {
    await popupScreen(async ({ click, change, container, window, button, writes, coupons }) => {
        await click('Popup ekle');
        await change('engagement-heading', 'Korunan adım mesajı');
        for (const [action, tab] of [['Devam', 'Gösterim'], ['Devam', 'Kupon'], ['Geri', 'Gösterim'], ['Geri', 'Tasarım']] as const) {
            const control = button(action);
            control.focus();
            assert.equal(window.document.activeElement, control);
            await click(action);
            await nextFrame(window);
            assert.equal(button(tab).getAttribute('aria-selected'), 'true');
            assert.equal(window.document.activeElement, button(tab), `${action} must focus ${tab} after the step control changes`);
        }
        assert.equal((container.querySelector('[name="engagement-heading"]') as HTMLInputElement).value, 'Korunan adım mesajı');
        const first = button('Tasarım');
        await React.act(async () => first.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })));
        assert.equal(window.document.activeElement, button('Kupon'));
        await React.act(async () => button('Kupon').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })));
        assert.equal(window.document.activeElement, button('Tasarım'));
        assert.equal(writes.length, 0);
        assert.equal(coupons.length, 0);
    });
});

test('an invalid device selection opens Display, focuses the device and preserves entered text', async () => {
    await popupScreen(async ({ click, change, clickElement, container, window, button, writes }) => {
        await click('Popup ekle');
        await change('engagement-heading', 'Korunan mesaj');
        await click('Gösterim');
        await clickElement(container.querySelector('[name="engagement-device-desktop"]'));
        await clickElement(container.querySelector('[name="engagement-device-mobile"]'));
        await click('Kupon');
        await click('Uygula');
        await nextFrame(window);
        assert.equal(writes.length, 0);
        assert.equal(button('Gösterim').getAttribute('aria-selected'), 'true');
        assert.equal(window.document.activeElement?.getAttribute('name'), 'engagement-device-desktop');
        assert.ok(container.querySelector('[role="alert"]'));
        await clickElement(container.querySelector('[name="engagement-device-desktop"]'));
        await click('Tasarım');
        assert.equal((container.querySelector('[name="engagement-heading"]') as HTMLInputElement).value, 'Korunan mesaj');
        await click('Uygula');
        assert.equal(writes.length, 1);
        assert.deepEqual(writes[0].config.devices, { desktop: true, mobile: false });
    });
});

for (const [field, invalid] of [['engagement-delay', '121'], ['engagement-repeat', '0']] as const) {
    test(`${field} validation opens Display and focuses the relevant field without saving`, async () => {
        await popupScreen(async ({ click, change, container, window, button, writes }) => {
            await click('Popup ekle');
            await click('Gösterim');
            await change(field, invalid);
            await click('Tasarım');
            await click('Uygula');
            await nextFrame(window);
            assert.equal(writes.length, 0);
            assert.equal(button('Gösterim').getAttribute('aria-selected'), 'true');
            assert.equal(window.document.activeElement?.getAttribute('name'), field);
            assert.equal((container.querySelector(`[name="${field}"]`) as HTMLInputElement).value, invalid);
            assert.ok(container.querySelector('[role="alert"]'));
        });
    });
}

test('image upload failure retains the file and retries the same operation before canonical campaign save', async () => withImageUrls(async () => {
    let rejectUpload!: (error: Error) => void;
    let finishUpload!: (result: typeof image) => void;
    let attempt = 0;
    await popupScreen(async ({ click, clickElement, container, window, button, settle, uploads, writes }) => {
        await click('Popup ekle');
        await clickElement(container.querySelector('input[name="engagement-template"][value="image_left"]'));
        const input = (container as HTMLElement).querySelector<HTMLInputElement>('input[type="file"]');
        assert.ok(input, 'Görselli must expose the existing native image upload field');
        const file = new window.File(['image bytes'], 'popup.webp', { type: 'image/webp' }) as unknown as File;
        await pickFile(window, input, file);
        await settle();
        assert.equal(uploads.length, 1);
        assert.equal(uploads[0].file, file);
        assert.match(uploads[0].operationId ?? '', /^[0-9a-f-]{36}$/);
        assert.equal(button('Uygula').disabled, true);
        await click('Uygula');
        await click('Vazgeç ve kapat');
        await click('Gösterim');
        await React.act(async () => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', cancelable: true })));
        await settle();
        assert.equal(writes.length, 0);
        assert.ok(container.querySelector('[role="dialog"]'));
        assert.equal(button('Tasarım').getAttribute('aria-selected'), 'true');
        assert.equal(container.querySelector('[data-image-dropzone] img')?.getAttribute('src'), 'blob:popup-upload-fixture');

        await React.act(async () => rejectUpload(new Error('private provider diagnostic')));
        await settle();
        assert.match(container.textContent ?? '', /Seçiminiz korundu/);
        assert.doesNotMatch(container.textContent ?? '', /private provider diagnostic/);
        assert.equal(button('Uygula').disabled, true, 'failed pending files must not silently save without the image');
        await click('Gösterim');
        await click('Vazgeç ve kapat');
        assert.ok(container.querySelector('[role="dialog"]'));
        assert.equal(button('Tasarım').getAttribute('aria-selected'), 'true');
        await click('Tekrar dene', container.querySelector('[data-image-dropzone]')!.closest('section')!);
        assert.equal(uploads.length, 2);
        assert.equal(uploads[1].file, uploads[0].file);
        assert.equal(uploads[1].operationId, uploads[0].operationId);
        await React.act(async () => finishUpload(image));
        await settle();
        assert.equal(button('Uygula').disabled, false);
        assert.equal(container.querySelector('[data-engagement-preview] img')?.getAttribute('src'), image.url);
        await click('Uygula');
        assert.equal(writes.length, 1);
        assert.deepEqual(writes[0].config.image, { kind: 'media', mediaId: imageId });
        assert.equal(container.querySelector('[role="dialog"]'), null);
    }, {
        uploadMedia: () => ++attempt === 1
            ? new Promise((_resolve, reject) => { rejectUpload = reject; })
            : new Promise(resolve => { finishUpload = resolve; })
    });
}));

test('existing library selection saves its original canonical asset reference', async () => {
    await popupScreen(async ({ click, clickElement, container, writes, uploads }) => {
        await click('Düzenle');
        await clickElement(container.querySelector('input[name="engagement-template"][value="image_left"]'));
        await click('Kütüphaneden seç');
        await click('Mevcut kapak görselini seç');
        assert.equal(container.querySelector('[data-engagement-preview] img')?.getAttribute('src'), image.url);
        await click('Uygula');
        assert.equal(uploads.length, 0);
        assert.equal(writes[0].expectedVersion, 4);
        assert.deepEqual(writes[0].config.image, { kind: 'asset', assetId: imageId });
    }, { records: [record()], media: [{ ...image, altText: 'Mevcut kapak', reference: { kind: 'asset', assetId: imageId } }] });
});

test('read-only image preview cannot upload, drop or save', async () => withImageUrls(async () => {
    await popupScreen(async ({ click, container, window, button, uploads, writes }) => {
        await click('Görüntüle');
        const dropzone = (container as HTMLElement).querySelector<HTMLButtonElement>('[data-image-dropzone]');
        assert.ok(dropzone);
        assert.equal(dropzone.disabled, true);
        const file = new window.File(['image bytes'], 'popup.webp', { type: 'image/webp' }) as unknown as File;
        const input = (container as HTMLElement).querySelector<HTMLInputElement>('input[type="file"]');
        if (input) {
            assert.equal(input.disabled, true);
            await pickFile(window, input, file);
        }
        const event = new window.Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'dataTransfer', { value: { files: [file], types: ['Files'] } });
        await React.act(async () => dropzone.dispatchEvent(event));
        assert.equal(button('Uygula').disabled, true);
        await click('Uygula');
        assert.deepEqual(uploads, []);
        assert.deepEqual(writes, []);
    }, { canManage: false, records: [record({ ...createDefaultStoreEngagementConfig(), template: 'image_left' })] });
}));

test('a filtered empty list can clear its search and status without creating or saving', async () => {
    await popupScreen(async ({ click, changeElement, container, settle, writes, coupons }) => {
        const search = (container as HTMLElement).querySelector<HTMLInputElement>('[aria-label="Popup ara"]');
        assert.ok(search);
        await changeElement(search, 'eşleşmeyen');
        await click('Kapalı');
        await settle();
        assert.equal(Array.from((container as HTMLElement).querySelectorAll('button')).some(button => button.textContent?.trim() === 'Düzenle'), false);
        await click('Filtreleri temizle');
        assert.equal(search.value, '');
        assert.ok(Array.from((container as HTMLElement).querySelectorAll('button')).some(button => button.textContent?.trim() === 'Düzenle'));
        assert.equal(container.querySelector('[role="dialog"]'), null);
        assert.equal(writes.length, 0);
        assert.equal(coupons.length, 0);
    }, { records: [record()] });
});
