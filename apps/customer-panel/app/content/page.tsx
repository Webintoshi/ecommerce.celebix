import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantFamilyOverview } from "@/components/merchant-admin/MerchantFamilyOverview";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ContentPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <MerchantFamilyOverview family="content" canManage={isMerchantActionAllowed(tenantContext.membership.role, "content.manage")} />;
}
