import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantModuleConsole } from "@/components/merchant-admin/MerchantModuleConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function PromotionBannerSettingsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <MerchantModuleConsole kind="promotion_banner" canManage={isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage")} />;
}
