import { createHash } from "node:crypto";
import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { PolicyConsole } from "@/components/content/PolicyConsole";
import { PanelWorkspaceShell } from "@/components/panel/PanelWorkspaceShell";
import { CONTENT_WORKSPACE_TABS } from "@/lib/panel-ui/workspace-navigation";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ContentPoliciesPage() {
  const { session, tenantContext } = await requireServerPanelAccess();
  // Opaque presentation scope for browser-memory drafts; never sent to a policy API.
  const recoveryScope = createHash("sha256").update(JSON.stringify([session.id, tenantContext.principal.id, tenantContext.store.id])).digest("hex");
  return (
    <PanelWorkspaceShell title="İçerik" tabs={CONTENT_WORKSPACE_TABS}>
      <PolicyConsole key={recoveryScope} recoveryScope={recoveryScope} canManage={isMerchantActionAllowed(tenantContext.membership.role, "content.manage")} embedded />
    </PanelWorkspaceShell>
  );
}
