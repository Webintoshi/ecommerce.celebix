import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { redirect } from "next/navigation";

import { StoreToolsConsole } from "@/components/settings/StoreToolsConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function StoreToolsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  if (!isMerchantActionAllowed(tenantContext.membership.role, "configuration.read")) redirect("/unauthorized");
  return <StoreToolsConsole canManage={isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage")} />;
}
