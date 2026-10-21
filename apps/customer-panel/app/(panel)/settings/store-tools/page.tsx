import { hasCommercialCapability, hasWhatsAppOrderingAccess, isMerchantActionAllowed } from "@celebix/saas-contracts";
import { redirect } from "next/navigation";

import { StoreToolsConsole } from "@/components/settings/StoreToolsConsole";
import { requireServerPanelAccess } from "@/lib/server-access";
import { requirePromotionPageContext } from "@/lib/server-promotion-page";

export default async function StoreToolsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  if (!isMerchantActionAllowed(tenantContext.membership.role, "configuration.read")) redirect("/unauthorized");
  const canReadCoupons = isMerchantActionAllowed(tenantContext.membership.role, "promotions.read");
  const growthToolsAvailable = hasCommercialCapability(tenantContext.entitlements, "growth_tools");
  const whatsAppOrderingAvailable = hasWhatsAppOrderingAccess(tenantContext.entitlements);
  const promotionContext = canReadCoupons && growthToolsAvailable ? await requirePromotionPageContext() : null;
  return <StoreToolsConsole growthToolsAvailable={growthToolsAvailable} whatsAppOrderingAvailable={whatsAppOrderingAvailable} canManage={isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage")} canReadCoupons={canReadCoupons} canCreateCoupon={Boolean(promotionContext?.canManage && promotionContext?.canPublish)} timezone={promotionContext?.timezone} />;
}
