import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantModuleConsole } from "@/components/merchant-admin/MerchantModuleConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function SeoGeoOptimizationPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <MerchantModuleConsole kind="seo_geo_profile" canManage={isMerchantActionAllowed(tenantContext.membership.role, "integrations.manage")} />;
}
