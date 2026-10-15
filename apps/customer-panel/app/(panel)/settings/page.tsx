import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantFamilyOverview } from "@/components/merchant-admin/MerchantFamilyOverview";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function SettingsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <MerchantFamilyOverview family="settings" canManage={isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage")} />;
}
