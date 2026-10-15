import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { redirect } from "next/navigation";

import { StoreToolsConsole } from "@/components/settings/StoreToolsConsole";
import { requireServerPanelAccess } from "@/lib/server-access";
import { requirePromotionPageContext } from "@/lib/server-promotion-page";

export default async function StoreToolsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  if (!isMerchantActionAllowed(tenantContext.membership.role, "configuration.read")) redirect("/unauthorized");
  const canReadCoupons = isMerchantActionAllowed(tenantContext.membership.role, "promotions.read");
  const promotionContext = canReadCoupons ? await requirePromotionPageContext() : null;
  return <StoreToolsConsole canManage={isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage")} canReadCoupons={canReadCoupons} canCreateCoupon={Boolean(promotionContext?.canManage && promotionContext?.canPublish)} timezone={promotionContext?.timezone} />;
}
