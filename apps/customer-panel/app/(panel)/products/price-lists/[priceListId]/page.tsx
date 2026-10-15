import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { PriceListConsole } from "@/components/pricing/PriceListConsole";
import { resolveServerPanelAccess } from "@/lib/server-access";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
const PRICE_LIST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export default async function PriceListPage({ params }: { params: Promise<{ priceListId: string }> }) { const access = await resolveServerPanelAccess(); const role = access.tenantContext.membership.role; const { priceListId } = await params; if (!PRICE_LIST_ID.test(priceListId)) notFound(); return <PriceListConsole mode="detail" resourceId={priceListId} canRead={isMerchantActionAllowed(role, "pricing.read")} canManage={isMerchantActionAllowed(role, "pricing.manage")} />; }
