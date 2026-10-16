import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMERCIAL_PACKAGES, type StoreMembershipRole } from '@celebix/saas-contracts';
import { compile } from '../settings/design/design-editor-test-utils.ts';
test('trusted route gate redirects before a page can load its feature and distinguishes a role denial', async () => {
    for (const [role, path, expected] of [['store_owner', '/discounts/new', 'coupons'], ['store_owner', '/accounting', 'accounting'], ['editor', '/accounting', 'accounting'], ['store_owner', '/settings/shipping', null]] as const) {
        const p = COMMERCIAL_PACKAGES[0];
        const context = { membership: { role: role as StoreMembershipRole }, entitlements: { schemaVersion: 1, planId: p.id, planCode: p.code, version: p.version, status: 'active', features: p.features, limits: p.limits, validFrom: '2026-01-01T00:00:00Z' } };
        const { requireServerPanelAccess } = compile<any>(new URL('../../lib/server-access.ts', import.meta.url), { 'server-only': {}, 'next/headers': { headers: async () => new Headers({ 'x-celebix-panel-pathname': path }) }, 'next/navigation': { redirect: (to: string) => { throw Error(`redirect:${to}`); } }, '@/lib/server-session': { resolveServerPanelSession: async () => ({}) }, '@/lib/server-panel-access/decision': { decideServerPanelAccess: () => ({ kind: 'render', session: {}, tenantContext: context }) } });
        let loads = 0;
        const page = async () => { await requireServerPanelAccess(); loads++; };
        if (expected) {
            await assert.rejects(page(), new RegExp(`redirect:/upgrade\\?feature=${expected}`));
            assert.equal(loads, 0);
        }
        else {
            await page();
            assert.equal(loads, 1);
        }
    }
});

test('direct upgrade links validate the finite feature and skip offers already granted by the active package',async()=>{
 const p=COMMERCIAL_PACKAGES[3];const context={membership:{role:'store_owner'},entitlements:{schemaVersion:1,planId:p.id,planCode:p.code,version:p.version,status:'active',features:p.features,limits:p.limits,validFrom:'2026-01-01T00:00:00Z'}};
 const{default:Page}=compile<any>(new URL('../../app/(panel)/upgrade/page.tsx',import.meta.url),{'@/lib/server-access':{requireServerPanelAccess:async()=>({tenantContext:context})},'next/navigation':{redirect:(to:string)=>{throw Error(`redirect:${to}`);}}});
 for(const feature of ['accounting','unknown',['accounting','ai']])await assert.rejects(Page({searchParams:Promise.resolve({feature})}),/redirect:\/settings\/plan/);
});
