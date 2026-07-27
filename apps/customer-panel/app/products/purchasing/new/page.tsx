import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { PurchasingConsole } from "@/components/inventory/PurchasingConsole";
import { resolveServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function NewPurchaseOrderPage() {
  const access = await resolveServerPanelAccess();
  const role = access.tenantContext.membership.role;
  return <PurchasingConsole
    mode="new"
    canRead={isMerchantActionAllowed(role, "purchasing.read")}
    canManage={isMerchantActionAllowed(role, "purchasing.manage")}
  />;
}
