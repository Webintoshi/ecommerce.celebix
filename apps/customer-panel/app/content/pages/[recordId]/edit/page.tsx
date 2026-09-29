import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantContentEditor } from "@/components/content/MerchantContentEditor";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function EditContentPage({ params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params;
  const { tenantContext } = await requireServerPanelAccess();
  return <MerchantContentEditor kind="page" initialLocale={tenantContext.locale} recordId={recordId} returnTo="/content/pages" canManage={isMerchantActionAllowed(tenantContext.membership.role, "content.manage")} />;
}
