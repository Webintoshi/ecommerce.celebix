const CASHIER_PAGES = new Set(['/orders/quick-links', '/analytics', '/products', '/products/new', '/accounting/receivables', '/settings/security', '/upgrade', '/settings/plan']);
const PRODUCT_DETAIL = /^\/products\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ORDER_DETAIL = /^\/orders\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\/print)?$/i;
export function isCashierPanelPathAllowed(pathname: string | null, canManageAccounting = false, canManageOrders = false, canViewOverview = false): boolean {
  return pathname !== null && pathname!=="/accounting/commissions" && !pathname.startsWith("/accounting/commissions/") && (canViewOverview === true && pathname === '/' || CASHIER_PAGES.has(pathname) || PRODUCT_DETAIL.test(pathname) || canManageOrders && (pathname === '/orders' || ORDER_DETAIL.test(pathname)) || canManageAccounting && /^\/accounting(?:\/[A-Za-z0-9_-]+)*\/?$/.test(pathname));
}
