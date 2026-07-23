import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantModuleConsole } from "@/components/merchant-admin/MerchantModuleConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ArtificialIntelligenceSettingsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return (
    <>
      <p>Sağlayıcı etkinleştirilmeden içerik üretilmez.</p>
      <MerchantModuleConsole kind="ai_setting" canManage={isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage")} />
    </>
  );
}
