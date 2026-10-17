import { hasCommercialCapability } from '@celebix/saas-contracts';
import { isCatalogProductOperationAllowed, isMerchantActionAllowed } from "@celebix/saas-contracts";

import { ProductDetailConsole } from "@/components/catalog/ProductDetailConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ProductDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  const [{ productId }, { tenantContext }] = await Promise.all([params, requireServerPanelAccess()]);
  const role = tenantContext.membership.role;
  return (
    <ProductDetailConsole
      productId={productId}
      aiAvailable={hasCommercialCapability(tenantContext.entitlements, "ai")}
      canManage={isCatalogProductOperationAllowed(role, "update")}
      canArchive={isCatalogProductOperationAllowed(role, "archive")}
      canDelete={isMerchantActionAllowed(role, "catalog_admin.delete")}
      canReadPricing={isMerchantActionAllowed(role, "pricing.read") && hasCommercialCapability(tenantContext.entitlements, "reference_pricing")}
      canManagePricing={isMerchantActionAllowed(role, "pricing.manage") && hasCommercialCapability(tenantContext.entitlements, "reference_pricing")}
      pricingUpgradeAvailable={isMerchantActionAllowed(role, "pricing.read") && !hasCommercialCapability(tenantContext.entitlements, "reference_pricing")}
    />
  );
}
