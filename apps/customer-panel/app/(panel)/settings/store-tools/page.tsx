import { hasCommercialCapability, isMerchantActionAllowed } from "@celebix/saas-contracts";
import { redirect } from "next/navigation";

import { StoreToolsPurchasingConsole } from "@/components/settings/StoreToolsPurchasingConsole";
import { requireServerPanelAccess } from "@/lib/server-access";
import { requirePromotionPageContext } from "@/lib/server-promotion-page";

export default async function StoreToolsPage() {
  const { tenantContext,support } = await requireServerPanelAccess();
  if (!isMerchantActionAllowed(tenantContext.membership.role, "configuration.read")) redirect("/unauthorized");
  const canReadCoupons = isMerchantActionAllowed(tenantContext.membership.role, "promotions.read") && hasCommercialCapability(tenantContext.entitlements, "coupons");
  const promotionContext = canReadCoupons ? await requirePromotionPageContext() : null;
  return <StoreToolsPurchasingConsole storeId={tenantContext.store.id} checkoutEnabled={process.env.CELEBIX_PLATFORM_COMMERCE_ENABLED==='true'&&!support} canManage={isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage")} canReadCoupons={canReadCoupons} canCreateCoupon={Boolean(promotionContext?.canManage && promotionContext?.canPublish)} timezone={promotionContext?.timezone} />;
}
