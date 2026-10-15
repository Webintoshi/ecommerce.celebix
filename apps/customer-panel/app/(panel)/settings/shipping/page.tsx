import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { ShippingSettingsConsole } from "@/components/shipping/ShippingSettingsConsole";
import { CheckoutDeliverySettings } from "@/components/shipping/CheckoutDeliverySettings";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function SettingsShippingPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <div className="page-stack">
    <h1 className="sr-only">Kargo ayarları</h1>
    <CheckoutDeliverySettings
      canRead={isMerchantActionAllowed(tenantContext.membership.role, "configuration.read")}
      canManage={isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage")}
    />
    <ShippingSettingsConsole canManage={isMerchantActionAllowed(tenantContext.membership.role, "shipping.manage")} />
  </div>;
}
