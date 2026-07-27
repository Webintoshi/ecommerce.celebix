import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantModuleConsole } from "@/components/merchant-admin/MerchantModuleConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function SeoContentPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <MerchantModuleConsole kind="seo_content_entry" canManage={isMerchantActionAllowed(tenantContext.membership.role, "integrations.manage")} />;
}
