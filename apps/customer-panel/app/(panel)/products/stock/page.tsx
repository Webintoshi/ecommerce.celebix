import { Suspense } from "react";
import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { StockWorkspace } from "@/components/inventory/StockWorkspace";
import { PanelLoadingState } from "@/components/panel/PanelPageShell";
import { resolveServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const access = await resolveServerPanelAccess();
  const role = access.tenantContext.membership.role;
  return <Suspense fallback={<PanelLoadingState label="Stok yükleniyor…" />}><StockWorkspace
    canReadInventory={isMerchantActionAllowed(role, "inventory.read")}
    canManageInventory={isMerchantActionAllowed(role, "inventory.manage")}
    canReadPurchasing={isMerchantActionAllowed(role, "purchasing.read")}
    canManagePurchasing={isMerchantActionAllowed(role, "purchasing.manage")}
  /></Suspense>;
}
