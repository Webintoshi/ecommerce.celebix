import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { InventoryCountConsole } from "@/components/inventory/InventoryCountConsole";
import { resolveServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function InventoryCountPage({ params }: { params: Promise<{ countId: string }> }) {
  const access = await resolveServerPanelAccess();
  const role = access.tenantContext.membership.role;
  const { countId } = await params;
  return <InventoryCountConsole resourceId={countId} canRead={isMerchantActionAllowed(role, "inventory.read")} canManage={isMerchantActionAllowed(role, "inventory.manage")} />;
}
