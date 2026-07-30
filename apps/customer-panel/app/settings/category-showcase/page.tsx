import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { CategoryShowcaseEditor } from "@/components/settings/CategoryShowcaseEditor";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function CategoryShowcaseSettingsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <CategoryShowcaseEditor canManage={isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage")} />;
}
