import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { GoogleMerchantConsole } from "@/components/google-merchant/GoogleMerchantConsole";
import { PanelPageShell, PanelPageHeader } from "@/components/panel/PanelPageShell";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function GoogleMerchantPage() {
  const { tenantContext } = await requireServerPanelAccess();
  const canRead = isMerchantActionAllowed(tenantContext.membership.role, "integrations.read");
  return <PanelPageShell><PanelPageHeader title="Google Merchant Center" />
    {canRead ? <GoogleMerchantConsole canManage={isMerchantActionAllowed(tenantContext.membership.role, "integrations.manage")} /> : <p>Bu bağlantıyı görüntüleme yetkiniz bulunmuyor.</p>}
  </PanelPageShell>;
}
