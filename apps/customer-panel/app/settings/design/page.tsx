import { buildDefaultStarterPresentation, isMerchantActionAllowed } from "@celebix/saas-contracts";

import { DesignSettingsHub } from "@/components/settings/DesignSettingsHub";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function DesignSettingsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <DesignSettingsHub
    canManage={isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage")}
    presentation={buildDefaultStarterPresentation({ name: tenantContext.store.slug })}
    storefrontHostname={tenantContext.resolvedHost?.canonicalHostname ?? null}
  />;
}
