import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantModuleConsole } from "@/components/merchant-admin/MerchantModuleConsole";
import { PanelWorkspaceShell } from "@/components/panel/PanelWorkspaceShell";
import { CONTENT_WORKSPACE_TABS } from "@/lib/panel-ui/workspace-navigation";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ContentPagesPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return (
    <PanelWorkspaceShell title="İçerik" description="Blog, sayfa ve politika içeriklerini tek merkezden yönetin." tabs={CONTENT_WORKSPACE_TABS}>
      <MerchantModuleConsole kind="page" canManage={isMerchantActionAllowed(tenantContext.membership.role, "content.manage")} embedded />
    </PanelWorkspaceShell>
  );
}
