import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { AbandonedCartDetailConsole } from "@/components/orders/AbandonedCartConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";
export default async function AbandonedCartDetailPage({ params }: { params: Promise<{ cartId: string }> }) { const [{ cartId }, access] = await Promise.all([params, requireServerPanelAccess()]); const canManage = isMerchantActionAllowed(access.tenantContext.membership.role, "carts.manage"); return <><AbandonedCartDetailConsole cartId={cartId} canManage={canManage} /></>; }
