import {
  isMerchantActionAllowed,
  type MerchantAction,
  type TenantContext,
} from "@celebix/saas-contracts";

export const CATALOG_PAGE_ACTIONS = Object.freeze({
  tags: "catalog_admin.manage",
  barcodeLabels: "catalog_admin.read",
} satisfies Record<string, MerchantAction>);

type CatalogPageAction =
  (typeof CATALOG_PAGE_ACTIONS)[keyof typeof CATALOG_PAGE_ACTIONS];

export function isCatalogPageActionAllowed(
  tenantContext: Pick<TenantContext, "membership">,
  action: CatalogPageAction,
): boolean {
  return isMerchantActionAllowed(tenantContext.membership.role, action);
}
