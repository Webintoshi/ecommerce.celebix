import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantContentEditor } from "@/components/content/MerchantContentEditor";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function NewContentPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <MerchantContentEditor kind="page" initialLocale={tenantContext.locale} returnTo="/content/pages" canManage={isMerchantActionAllowed(tenantContext.membership.role, "content.manage")} />;
}
