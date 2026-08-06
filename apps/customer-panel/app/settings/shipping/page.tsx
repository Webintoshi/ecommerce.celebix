import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { ShippingSettingsConsole } from "@/components/shipping/ShippingSettingsConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function SettingsShippingPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <ShippingSettingsConsole canManage={isMerchantActionAllowed(tenantContext.membership.role, "shipping.manage")} />;
}
