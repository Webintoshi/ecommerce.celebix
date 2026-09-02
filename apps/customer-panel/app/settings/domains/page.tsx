import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { StoreDomainSettings } from "@/components/settings/domains/StoreDomainSettings";
import { AdminDomainSettings } from "@/components/settings/domains/AdminDomainSettings";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function StoreDomainsSettingsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  const canManage=isMerchantActionAllowed(tenantContext.membership.role,"configuration.manage");
  return <><AdminDomainSettings canManage={canManage}/><StoreDomainSettings canManage={canManage}/></>;
}
