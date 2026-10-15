import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { ArtificialIntelligenceSettings } from "@/components/toshi-settings/ArtificialIntelligenceSettings";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ArtificialIntelligenceSettingsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  const canManage = isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage");
  return <ArtificialIntelligenceSettings canManage={canManage} />;
}
