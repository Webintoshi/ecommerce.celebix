import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantModuleConsole } from "@/components/merchant-admin/MerchantModuleConsole";
import { ArtificialIntelligenceSettings } from "@/components/toshi-settings/ArtificialIntelligenceSettings";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ArtificialIntelligenceSettingsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  const canManage = isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage");
  return (
    <>
      <ArtificialIntelligenceSettings canManage={canManage} />
      <section aria-labelledby="toshi-preferences-title">
        <h2 id="toshi-preferences-title">Tercihler</h2>
        <MerchantModuleConsole kind="ai_setting" canManage={canManage} />
      </section>
    </>
  );
}
