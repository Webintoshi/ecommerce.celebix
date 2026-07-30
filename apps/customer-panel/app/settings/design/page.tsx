import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { DesignSettingsHub } from "@/components/settings/DesignSettingsHub";
import { requireServerPanelAccess } from "@/lib/server-access";
import { resolveDefaultServerPanelAccessRuntime } from "@/lib/server-panel-access/default";
import { resolveServerMerchantAdminRuntime } from "@/lib/server-merchant-admin/runtime";

export default async function DesignSettingsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  const hostname = tenantContext.resolvedHost?.canonicalHostname;
  const runtime = resolveServerMerchantAdminRuntime(await resolveDefaultServerPanelAccessRuntime());
  if (!runtime || !hostname) throw new Error("design_settings_unavailable");
  const presentation = await runtime.merchantAdmin.getEffectiveStarterPresentation({
    tenantContext,
    hostname,
    now: new Date(),
  });
  return <DesignSettingsHub
    canManage={isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage")}
    presentation={presentation}
    storefrontHostname={hostname}
  />;
}
