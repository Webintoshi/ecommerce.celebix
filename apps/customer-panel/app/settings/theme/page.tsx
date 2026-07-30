import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantModuleConsole } from "@/components/merchant-admin/MerchantModuleConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ThemeSettingsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <MerchantModuleConsole kind="theme_setting" canManage={isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage")} />;
}
