import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { PolicyConsole } from "@/components/content/PolicyConsole";
import { PanelWorkspaceShell } from "@/components/panel/PanelWorkspaceShell";
import { CONTENT_WORKSPACE_TABS } from "@/lib/panel-ui/workspace-navigation";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ContentPoliciesPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return (
    <PanelWorkspaceShell title="İçerik" description="Blog, sayfa ve politika içeriklerini tek merkezden yönetin." tabs={CONTENT_WORKSPACE_TABS}>
      <PolicyConsole canManage={isMerchantActionAllowed(tenantContext.membership.role, "content.manage")} embedded />
    </PanelWorkspaceShell>
  );
}
