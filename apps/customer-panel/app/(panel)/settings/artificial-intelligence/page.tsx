import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { ArtificialIntelligenceSettings } from "@/components/toshi-settings/ArtificialIntelligenceSettings";
import { hasToshiTestPurchaseIntent } from "@/components/toshi-settings/purchase-intent";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ArtificialIntelligenceSettingsPage({searchParams}:{searchParams?:Promise<Record<string,string|string[]|undefined>>}) {
  const { tenantContext } = await requireServerPanelAccess();
  const canManage = isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage");
  const autoStartTestPurchase=canManage&&['store_owner','admin'].includes(tenantContext.membership.role)&&hasToshiTestPurchaseIntent(await searchParams??{});
  return <ArtificialIntelligenceSettings canManage={canManage} storeId={tenantContext.store.id} autoStartTestPurchase={autoStartTestPurchase} />;
}
