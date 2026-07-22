import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { AbandonedCartDetailConsole } from "@/components/orders/AbandonedCartConsole";
import { PanelShell } from "@/components/panel/PanelShell";
import { createPanelChromeModel } from "@/lib/panel-ui/chrome-model";
import { requireServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";
export default async function AbandonedCartDetailPage({ params }: { params: Promise<{ cartId: string }> }) { const [{ cartId }, access] = await Promise.all([params, requireServerPanelAccess()]); const canManage = isMerchantActionAllowed(access.tenantContext.membership.role, "carts.manage"); return <PanelShell model={createPanelChromeModel(access.tenantContext)}><AbandonedCartDetailConsole cartId={cartId} canManage={canManage} /></PanelShell>; }
