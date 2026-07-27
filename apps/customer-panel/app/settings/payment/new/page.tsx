import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantRecordEditor } from "@/components/merchant-admin/MerchantRecordEditor";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function NewPaymentSettingPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <MerchantRecordEditor kind="payment_setting" returnTo="/settings/payment" canManage={isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage")} />;
}
