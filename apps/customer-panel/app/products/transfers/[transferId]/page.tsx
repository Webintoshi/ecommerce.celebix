import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { InventoryTransferConsole } from "@/components/inventory/InventoryTransferConsole";
import { resolveServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function InventoryTransferPage({ params }: { params: Promise<{ transferId: string }> }) {
  const access = await resolveServerPanelAccess();
  const role = access.tenantContext.membership.role;
  const { transferId } = await params;
  return <InventoryTransferConsole resourceId={transferId} canRead={isMerchantActionAllowed(role, "inventory.read")} canManage={isMerchantActionAllowed(role, "inventory.manage")} />;
}
