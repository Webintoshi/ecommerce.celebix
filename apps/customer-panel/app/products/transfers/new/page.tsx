import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { InventoryTransferConsole } from "@/components/inventory/InventoryTransferConsole";
import { resolveServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function NewInventoryTransferPage() {
  const access = await resolveServerPanelAccess();
  const role = access.tenantContext.membership.role;
  return <InventoryTransferConsole
    mode="new"
    canRead={isMerchantActionAllowed(role, "inventory.read")}
    canManage={isMerchantActionAllowed(role, "inventory.manage")}
  />;
}
