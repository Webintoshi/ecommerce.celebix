import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { ReferencePricingConsole } from "@/components/reference-pricing/ReferencePricingConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function SettingsPricingPage() {
  const { tenantContext } = await requireServerPanelAccess();
  const role = tenantContext.membership.role;
  return <ReferencePricingConsole canRead={isMerchantActionAllowed(role, "pricing.read")} canManage={isMerchantActionAllowed(role, "pricing.manage")} />;
}
