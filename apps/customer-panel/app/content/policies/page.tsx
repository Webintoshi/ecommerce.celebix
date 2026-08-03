import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { PolicyConsole } from "@/components/content/PolicyConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ContentPoliciesPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <PolicyConsole canManage={isMerchantActionAllowed(tenantContext.membership.role, "content.manage")} />;
}
