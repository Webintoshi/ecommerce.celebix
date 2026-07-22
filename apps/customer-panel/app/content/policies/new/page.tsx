import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantRecordEditor } from "@/components/merchant-admin/MerchantRecordEditor";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function NewPolicyPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <MerchantRecordEditor kind="policy" returnTo="/content/policies" canManage={isMerchantActionAllowed(tenantContext.membership.role, "content.manage")} />;
}
