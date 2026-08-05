import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { StoreDomainSettings } from "@/components/settings/domains/StoreDomainSettings";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function StoreDomainsSettingsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <StoreDomainSettings canManage={isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage")} />;
}
