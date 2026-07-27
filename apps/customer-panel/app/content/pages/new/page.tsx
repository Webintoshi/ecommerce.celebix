import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantRecordEditor } from "@/components/merchant-admin/MerchantRecordEditor";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function NewContentPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <MerchantRecordEditor kind="page" returnTo="/content/pages" canManage={isMerchantActionAllowed(tenantContext.membership.role, "content.manage")} />;
}
