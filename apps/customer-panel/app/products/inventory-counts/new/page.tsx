import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { InventoryCountConsole } from "@/components/inventory/InventoryCountConsole";
import { resolveServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function NewInventoryCountPage() {
  const access = await resolveServerPanelAccess();
  const role = access.tenantContext.membership.role;
  return <InventoryCountConsole
    mode="new"
    canRead={isMerchantActionAllowed(role, "inventory.read")}
    canManage={isMerchantActionAllowed(role, "inventory.manage")}
  />;
}
