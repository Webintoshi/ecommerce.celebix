import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { PriceListConsole } from "@/components/pricing/PriceListConsole";
import { resolveServerPanelAccess } from "@/lib/server-access";
export const dynamic = "force-dynamic";
export default async function PriceListPage({ params }: { params: Promise<{ priceListId: string }> }) { const access = await resolveServerPanelAccess(); const role = access.tenantContext.membership.role; const { priceListId } = await params; return <PriceListConsole mode="detail" resourceId={priceListId} canRead={isMerchantActionAllowed(role, "pricing.read")} canManage={isMerchantActionAllowed(role, "pricing.manage")} />; }
