import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { StarterThemeComposer } from "@/components/settings/StarterThemeComposer";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ThemeSettingsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <StarterThemeComposer canManage={isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage")} />;
}
