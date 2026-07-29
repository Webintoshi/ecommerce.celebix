import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { PurchasingConsole } from "@/components/inventory/PurchasingConsole";
import { resolveServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function PurchaseOrderPage({ params }: { params: Promise<{ purchaseOrderId: string }> }) {
  const access = await resolveServerPanelAccess();
  const role = access.tenantContext.membership.role;
  const { purchaseOrderId } = await params;
  return <PurchasingConsole resourceId={purchaseOrderId} canRead={isMerchantActionAllowed(role, "purchasing.read")} canManage={isMerchantActionAllowed(role, "purchasing.manage")} />;
}
