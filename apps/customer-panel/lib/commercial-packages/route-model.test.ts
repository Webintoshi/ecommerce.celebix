import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMERCIAL_PACKAGES, type PlanEntitlements, type StoreMembershipRole } from '@celebix/saas-contracts';
import { commercialRouteDecision, commercialAnalyticsDecision, commercialNavigationLocks } from './route-model.ts';
const entitlement = (index: number): PlanEntitlements => { const p = COMMERCIAL_PACKAGES[index]; return { schemaVersion: 1, planId: p.id, planCode: p.code, version: p.version, status: 'active', features: p.features, limits: p.limits, validFrom: '2026-01-01T00:00:00Z' }; };
const context = (index = 0, role: StoreMembershipRole = 'store_owner') => ({ membership: { role }, entitlements: entitlement(index) });
test('locked features are classified before consoles load; payment, shipping and basic analytics remain usable', () => {
    for (const [path, capability] of [['/orders/quick-links', 'manual_orders'], ['/discounts/new', 'coupons'], ['/discounts/popups', 'growth_tools'], ['/settings/promotion-banner', 'growth_tools'], ['/seo/content', 'seo_tools'], ['/accounting', 'accounting'], ['/marketing/email/history', 'email_marketing'], ['/settings/pricing', 'reference_pricing'], ['/marketplaces/google-merchant', 'google_merchant']] as const) {
        assert.deepEqual(commercialRouteDecision(context(), path), { kind: 'upgrade', capability }, path);
    }
    for (const path of ['/', '/settings/payment', '/settings/shipping', '/analytics', '/products', '/settings/plan', '/upgrade'])
        assert.equal(commercialRouteDecision(context(), path).kind, 'allowed', path);
    assert.equal(commercialRouteDecision(context(1), '/orders/quick-links').kind, 'upgrade');
    assert.equal(commercialRouteDecision(context(2), '/discounts/popups').kind, 'allowed');
});
test('role denial wins over a package upgrade and cashiers require physical register capability', () => {
    assert.equal(commercialRouteDecision(context(0, 'editor'), '/accounting').kind, 'role_denied');
    assert.equal(commercialRouteDecision(context(0, 'analyst'), '/orders/quick-links').kind, 'role_denied');
    assert.equal(commercialRouteDecision(context(0, 'admin'), '/settings/administrators').kind, 'role_denied');
    assert.deepEqual(commercialRouteDecision(context(), '/settings/domains'), { kind: 'upgrade', capability: 'custom_domains' });
    assert.deepEqual(commercialRouteDecision(context(), '/settings/administrators'), { kind: 'upgrade', capability: 'staff_management' });
    assert.deepEqual(commercialRouteDecision(context(2, 'cashier'), '/orders/quick-links'), { kind: 'upgrade', capability: 'cashier' });
    assert.equal(commercialRouteDecision(context(3, 'cashier'), '/orders/quick-links').kind, 'allowed');
});
test('finite paths and legacy plans retain compatible behavior without trusting route payloads', () => {
    const old = { ...context(0), entitlements: { ...entitlement(3), planId: '00000000-0000-4000-8000-000000000002', planCode: 'pilot', version: 1 } };
    assert.equal(commercialRouteDecision(old, '/accounting').kind, 'allowed');
    for (const path of ['/accountingevil', '//accounting', '/settings/plan?feature=accounting', 'https://evil.test/accounting', '/seo%2fcontent'])
        assert.equal(commercialRouteDecision(context(), path).kind, 'allowed');
});
test('only advanced analytics tabs require growth, and lock metadata contains safe route strings', () => {
    assert.equal(commercialAnalyticsDecision(context(), 'overview').kind, 'allowed');
    assert.deepEqual(commercialAnalyticsDecision(context(), 'funnel'), { kind: 'upgrade', capability: 'advanced_analytics' });
    assert.equal(commercialAnalyticsDecision(context(2), 'funnel').kind, 'allowed');
    const locks = commercialNavigationLocks(context());
    assert.ok(locks.includes('/orders/quick-links'));
    assert.ok(locks.includes('/seo'));
    assert.ok(!locks.includes('/analytics'));
    assert.ok(!locks.includes('/settings/payment'));
    assert.ok(!commercialNavigationLocks(context(0, 'editor')).includes('/accounting'));
});


test('every restricted menu, nested route and legacy manual entry uses its exact capability', () => {
    for (const [path, capability] of [['/settings/analytics', 'advanced_analytics'], ['/marketing/phone/new', 'email_marketing'], ['/marketing/whatsapp/example/edit', 'email_marketing']] as const) {
        assert.deepEqual(commercialRouteDecision(context(1), path), { kind: 'upgrade', capability }, path);
        assert.equal(commercialRouteDecision(context(3), path).kind, 'allowed', path);
    }
    for (const role of ['store_owner', 'admin', 'cashier'] as const) {
        for (const path of ['/orders/quick-links', '/orders/drafts', '/orders/drafts/new', '/orders/drafts/example', '/orders/payment-links']) {
            assert.equal(commercialRouteDecision(context(2, role), path).kind, 'upgrade', `${role}:${path}`);
            assert.equal(commercialRouteDecision(context(3, role), path).kind, 'allowed', `${role}:${path}`);
        }
    }
    assert.ok(commercialNavigationLocks(context(1)).includes('/settings/analytics'));
});
