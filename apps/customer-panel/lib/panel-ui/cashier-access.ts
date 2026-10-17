const CASHIER_PAGES = new Set(['/', '/orders/quick-links', '/analytics', '/products', '/products/new', '/accounting/receivables', '/settings/security', '/upgrade', '/settings/plan']);
const PRODUCT_DETAIL = /^\/products\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCashierPanelPathAllowed(pathname: string | null, canManageAccounting = false): boolean {
  return pathname !== null && (CASHIER_PAGES.has(pathname) || PRODUCT_DETAIL.test(pathname) || canManageAccounting && /^\/accounting(?:\/[A-Za-z0-9_-]+)*\/?$/.test(pathname));
}
