import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { MerchantModuleConsole } from "@/components/merchant-admin/MerchantModuleConsole";
import { GoogleMerchantMarketplaceCard } from "@/components/google-merchant/GoogleMerchantMarketplaceCard";
import { TrendyolMarketplaceCard } from "@/components/trendyol/TrendyolMarketplaceCard";
import { PanelPageShell, PanelPageHeader } from "@/components/panel/PanelPageShell";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function MarketplacesPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <PanelPageShell><PanelPageHeader title="Pazaryeri" />
    <h1 className="sr-only">Pazar yerleri</h1>
    {isMerchantActionAllowed(tenantContext.membership.role, "integrations.read") ? <GoogleMerchantMarketplaceCard /> : null}
    {isMerchantActionAllowed(tenantContext.membership.role, "integrations.read") ? <TrendyolMarketplaceCard /> : null}
    <MerchantModuleConsole kind="marketplace_connection" canManage={isMerchantActionAllowed(tenantContext.membership.role, "integrations.manage")} embedded />
  </PanelPageShell>;
}
