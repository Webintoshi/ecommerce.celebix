import { hasCommercialCapability, isMerchantActionAllowed, type CommercialCapability, type MerchantAction, type PlanEntitlements, type StoreMembershipRole } from '@celebix/saas-contracts';
export type CommercialPageContext = Readonly<{
    membership: Readonly<{
        role: StoreMembershipRole;
    }>;
    entitlements: PlanEntitlements;
}>;
export type CommercialPageDecision = Readonly<{
    kind: 'allowed';
}> | Readonly<{
    kind: 'role_denied' | 'upgrade';
    capability: CommercialCapability;
}>;
const ALLOWED = Object.freeze({ kind: 'allowed' } as const);
const ACTIONS: Readonly<Record<CommercialCapability, MerchantAction>> = Object.freeze({ manual_orders: 'in_store.read', coupons: 'promotions.read', growth_tools: 'configuration.read', email_marketing: 'integrations.read', advanced_analytics: 'analytics.read', google_connections: 'integrations.read', google_merchant: 'integrations.read', seo_tools: 'integrations.read', cashier: 'in_store.read', accounting: 'accounting.read', reference_pricing: 'pricing.read', ai: 'configuration.read', custom_domains: 'configuration.read', staff_management: 'configuration.manage' });
const RULES: readonly (readonly [
    string,
    CommercialCapability
])[] = Object.freeze([
    ['/orders/quick-links', 'manual_orders'], ['/orders/drafts', 'manual_orders'], ['/orders/payment-links', 'manual_orders'],
    ['/orders/abandoned-carts', 'growth_tools'], ['/customers/segments', 'growth_tools'],
    ['/discounts/popups', 'growth_tools'], ['/discounts/lucky-wheel', 'growth_tools'], ['/discounts', 'coupons'],
    ['/marketing/google', 'google_connections'], ['/marketing/email', 'email_marketing'], ['/marketing/phone', 'email_marketing'], ['/marketing/whatsapp', 'email_marketing'], ['/marketing', 'growth_tools'],
    ['/marketplaces/google-merchant', 'google_merchant'], ['/marketplaces', 'google_connections'],
    ['/settings/analytics', 'advanced_analytics'], ['/settings/store-tools', 'growth_tools'], ['/settings/promotion-banner', 'growth_tools'], ['/settings/artificial-intelligence', 'ai'], ['/toshi', 'ai'],
    ['/settings/domains', 'custom_domains'], ['/settings/administrators', 'staff_management'],
    ['/settings/pricing', 'reference_pricing'], ['/products/price-lists', 'reference_pricing'],
    ['/accounting', 'accounting'], ['/seo', 'seo_tools'],
]);
export const COMMERCIAL_CAPABILITY_LABELS: Readonly<Record<CommercialCapability, string>> = Object.freeze({ manual_orders: 'Manuel satış', coupons: 'Kuponlar ve kampanyalar', growth_tools: 'Satış artıran mağaza araçları', email_marketing: 'E-posta pazarlama', advanced_analytics: 'Gelişmiş analizler', google_connections: 'Google bağlantıları', google_merchant: 'Google Merchant Center', seo_tools: 'SEO araçları', cashier: 'Fiziksel mağaza ve kasiyer', accounting: 'Muhasebe', reference_pricing: 'Kur ve altın referansları', ai: 'Yapay zekâ araçları', custom_domains: 'Özel alan adı', staff_management: 'Personel yönetimi' });
export function commercialCapabilityDecision(context: CommercialPageContext, capability: CommercialCapability): CommercialPageDecision {
    const role = context.membership.role;
    if (capability === 'staff_management' && role !== 'store_owner')
        return { kind: 'role_denied', capability };
    const cashierCollection = capability === 'accounting' && role === 'cashier';
    if (!isMerchantActionAllowed(role, ACTIONS[capability]) && !cashierCollection)
        return { kind: 'role_denied', capability };
    return hasCommercialCapability(context.entitlements, capability) ? ALLOWED : { kind: 'upgrade', capability };
}
export function commercialRouteDecision(context: CommercialPageContext, pathname: string | null): CommercialPageDecision {
    if (!pathname || !/^\/(?:[a-zA-Z0-9_-]+\/?)*$/.test(pathname))
        return ALLOWED;
    const rule = RULES.find(([base]) => pathname === base || pathname.startsWith(`${base}/`));
    if (!rule)
        return ALLOWED;
    const capability = rule[1] === 'manual_orders' && context.membership.role === 'cashier' ? 'cashier' : rule[1];
    return commercialCapabilityDecision(context, capability);
}
export function commercialAnalyticsDecision(context: CommercialPageContext, tab: string): CommercialPageDecision {
    return ['funnel', 'carts', 'acquisition', 'products'].includes(tab) ? commercialCapabilityDecision(context, 'advanced_analytics') : ALLOWED;
}
export function commercialNavigationLocks(context: CommercialPageContext): readonly string[] {
    const paths = new Set([...RULES.map(([path]) => path), '/marketing/phone', '/marketing/whatsapp', '/seo/content', '/seo/settings', '/discounts/new', '/accounting/profitability', '/accounting/receivables', '/accounting/suppliers', '/accounting/accounts', '/accounting/expenses', '/accounting/settings', '/accounting/invoicing-integration']);
    return Object.freeze([...paths].filter(path => commercialRouteDecision(context, path).kind === 'upgrade'));
}
