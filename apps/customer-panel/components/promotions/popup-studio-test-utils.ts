import assert from 'node:assert/strict';
import React from 'react';
import { compile, withEditor } from '../settings/design/design-editor-test-utils.ts';
const id = '00000000-0000-4000-8000-000000000001';
export async function popupScreen(run: (screen: any) => Promise<void>, options: {
    kind?: 'popup' | 'cart_capture';
    save?: (input: any) => Promise<any>;
    records?: any[];
    canManage?: boolean;
    canReadCoupons?: boolean;
    canCreateCoupon?: boolean;
    applyCoupon?: () => Promise<any>;
    couponDetail?: any;
    couponItems?: any[];
    recoveryInput?: any;
    recoveryDeletion?: any;
    deletePopup?: (input:any)=>Promise<any>;
    media?: any[];
    images?: any[];
    editor?: () => Promise<any>;
    uploadMedia?: (input: any) => Promise<any>;
    list?: () => Promise<any[]>;
    listError?: Error;
} = {}) {
    const writes: any[] = [], coupons: any[] = [], uploads: any[] = [], reads: string[] = [], deletions:any[]=[];
    let listed=options.records??[];
    let unresolved = Boolean(options.recoveryInput || options.recoveryDeletion);
    class ApiError extends Error {
        constructor(readonly code: string) {
            super('Kayıt tamamlanamadı');
        }
    }
    const api = {
        pendingIntent: async()=>options.recoveryInput??null,
        pendingDeletion: async()=>options.recoveryDeletion??null,
        deletePopup: async (input:any)=>{deletions.push(input);try{const result=options.deletePopup?await options.deletePopup(input):{campaignId:input.campaignId,deleted:true};listed=listed.filter(item=>item.id!==result.campaignId);unresolved=false;return result;}catch(error){unresolved=true;throw error;}},
        list: async () => {
            reads.push('campaigns');
            if (options.listError) throw options.listError;
            return options.list ? options.list() : listed;
        }, hasUnresolved: () => unresolved, save: async (input: any) => {
            writes.push(input);
            try {
                const result = options.save ? await options.save(input) : {
                    ...input, id, version: (input.expectedVersion ?? 0) + 1, updatedAt: '2026-10-04T10:00:00.000Z'
                };
                unresolved = false;
                listed=[result,...listed.filter(item=>item.id!==result.id)];
                return result;
            }
            catch (error) {
                unresolved = error instanceof ApiError && error.code === 'unavailable';
                throw error;
            }
        }
    };
    const overrides = {
        '@/components/panel/PanelLayoutClient': {
            usePanelChromeModel: () => ({
                storeSlug: 'guzide'
            })
        }, '@/components/panel/PanelPageShell': {
            PanelPageShell: ({ children }: any) => React.createElement('section', null, children), PanelPageHeader: ({ actions }: any) => React.createElement('header', null, actions)
        }, '@/lib/store-engagement-ui/client': {
            scopedStoreEngagementApi: () => api, StoreEngagementApiError: ApiError
        }, '@/lib/storefront-design-ui/client': {
            storefrontDesignApi: {
                editor: async () => {
                    reads.push('media');
                    return options.editor ? options.editor() : {
                        media: options.media ?? options.images ?? []
                    };
                },
                uploadMedia: async (input: any) => {
                    uploads.push(input);
                    return options.uploadMedia ? options.uploadMedia(input) : {
                        id: '00000000-0000-4000-8000-000000000002',
                        url: 'https://fixture.invalid/popup.webp',
                        altText: input.altText,
                        mediaType: 'image/webp', width: 600, height: 800
                    };
                }
            }
        }, '@/lib/promotion-ui/client': {
            promotionApi: {
                list: async () => ({
                    items: options.couponItems ?? [], nextCursor: null
                }), detail: async () => options.couponDetail ?? null, apply: async (...args: any[]) => {
                    coupons.push(args);
                    return options.applyCoupon ? options.applyCoupon() : {
                        kind: 'saved', promotion: {
                            id, version: 2, status: 'active', name: 'Kupon', ruleDocument: {
                                trigger: {
                                    kind: 'code', codes: ['HOSGELDIN3']
                                }
                            }
                        }
                    };
                }
            }, promotionErrorMessage: () => 'Kupon kaydedilemedi'
        }, '@/lib/promotion-ui/model': {
            createPromotionDraft: () => ({
                name: 'Kupon', codeInput: '', perCustomerUsage: 1, benefit: {
                    kind: 'percentage', percentageBps: 300
                }
            }), updatePromotionDraft: (draft: any, patch: any) => ({
                ...draft, ...patch
            })
        }
    };
    const { PopupStudio } = compile<any>(new URL('./PopupStudio.tsx', import.meta.url), overrides);
    const { CartCaptureTool } = options.kind === 'cart_capture' ? compile<any>(new URL('../settings/CartCaptureTool.tsx', import.meta.url), overrides) : {};
    await withEditor(async (screen) => {
        const settle = async () => {
            await React.act(async () => {
                await new Promise(resolve => setTimeout(resolve, 0));
            });
        };
        await screen.render(React.createElement(options.kind === 'cart_capture' ? CartCaptureTool : PopupStudio, {
            canManage: options.canManage ?? true,
            canReadCoupons: options.canReadCoupons ?? true,
            canCreateCoupon: options.canCreateCoupon ?? true
        }));
        await settle();
        const button = (label: string, within: ParentNode = screen.container): HTMLButtonElement => {
            const buttons = Array.from(within.querySelectorAll<HTMLButtonElement>('button'));
            const result = buttons.find(item => item.getAttribute('aria-label') === label)
                ?? buttons.find(item => item.textContent?.trim() === label);
            assert.ok(result, `button ${label}`);
            return result;
        };
        const click = async (label: string, within?: ParentNode) => {
            await screen.click(button(label, within));
            await settle();
        };
        const change = async (name: string, value: string) => {
            const field = screen.container.querySelector(`[name="${name}"]`);
            assert.ok(field, `field ${name}`);
            await screen.change(field as HTMLInputElement, value);
            await settle();
        };
        await run({
            ...screen, clickElement: screen.click, changeElement: screen.change,
            button, click, change, settle, writes, coupons, uploads, reads, deletions, ApiError
        });
    });
}
