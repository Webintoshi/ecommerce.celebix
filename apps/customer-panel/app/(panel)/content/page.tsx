import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantFamilyOverview } from "@/components/merchant-admin/MerchantFamilyOverview";
import { PanelWorkspaceShell } from "@/components/panel/PanelWorkspaceShell";
import { CONTENT_WORKSPACE_TABS } from "@/lib/panel-ui/workspace-navigation";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ContentPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return (
    <PanelWorkspaceShell title="İçerik" description="Blog, sayfa ve politika içeriklerini tek merkezden yönetin." tabs={CONTENT_WORKSPACE_TABS}>
      <MerchantFamilyOverview family="content" canManage={isMerchantActionAllowed(tenantContext.membership.role, "content.manage")} embedded />
    </PanelWorkspaceShell>
  );
}
