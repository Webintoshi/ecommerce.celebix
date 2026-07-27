import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { PriceListConsole } from "@/components/pricing/PriceListConsole";
import { resolveServerPanelAccess } from "@/lib/server-access";
export const dynamic = "force-dynamic";
export default async function NewPriceListPage() { const access = await resolveServerPanelAccess(); const role = access.tenantContext.membership.role; return <PriceListConsole mode="new" canRead={isMerchantActionAllowed(role, "pricing.read")} canManage={isMerchantActionAllowed(role, "pricing.manage")} />; }
