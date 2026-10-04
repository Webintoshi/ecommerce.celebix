import assert from 'node:assert/strict';
import React from 'react';
import { compile, withEditor } from '../settings/design/design-editor-test-utils.ts';
const id = '00000000-0000-4000-8000-000000000001';
export async function popupScreen(run: (screen: any) => Promise<void>, options: {
    kind?: 'popup' | 'cart_capture';
    save?: (input: any) => Promise<any>;
    records?: any[];
    canManage?: boolean;
    applyCoupon?: () => Promise<any>;
    couponDetail?: any;
    couponItems?: any[];
    recoveryInput?: any;
} = {}) {
    const writes: any[] = [], coupons: any[] = [];
    let unresolved = Boolean(options.recoveryInput);
    class ApiError extends Error {
        constructor(readonly code: string) {
            super('Kayıt tamamlanamadı');
        }
    }
    const api = {
        pendingIntent: async()=>options.recoveryInput??null,
        list: async () => options.records ?? [], hasUnresolved: () => unresolved, save: async (input: any) => {
            writes.push(input);
            try {
                const result = options.save ? await options.save(input) : {
                    ...input, id, version: (input.expectedVersion ?? 0) + 1, updatedAt: '2026-10-04T10:00:00.000Z'
                };
                unresolved = false;
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
                editor: async () => ({
                    media: []
                })
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
            canManage: options.canManage ?? true, canReadCoupons: true, canCreateCoupon: true
        }));
        await settle();
        const click = async (label: string) => {
            const button = Array.from(screen.container.querySelectorAll('button')).find(button => button.textContent?.trim() === label);
            assert.ok(button, `button ${label}`);
            await screen.click(button);
            await settle();
        };
        const change = async (name: string, value: string) => {
            const field = screen.container.querySelector(`[name="${name}"]`);
            assert.ok(field, `field ${name}`);
            await screen.change(field as HTMLInputElement, value);
            await settle();
        };
        await run({
            ...screen, click, change, settle, writes, coupons, ApiError
        });
    });
}
