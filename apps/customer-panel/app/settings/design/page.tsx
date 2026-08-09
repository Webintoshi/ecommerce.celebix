import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { redirect } from "next/navigation";

import { DesignWorkspace } from "@/components/settings/design/DesignWorkspace";
import { resolveDesignWorkspaceLocation } from "@/components/settings/design/workspace-navigation-model";
import { requireServerPanelAccess } from "@/lib/server-access";
import { resolveDefaultServerStorefrontDesignRuntime } from "@/lib/server-storefront-design/default";

export default async function DesignSettingsPage({ searchParams }: Readonly<{ searchParams: Promise<{ section?: string }> }>) {
  const { tenantContext } = await requireServerPanelAccess();
  if (!isMerchantActionAllowed(tenantContext.membership.role, "configuration.read")) redirect("/unauthorized");
  const runtime = await resolveDefaultServerStorefrontDesignRuntime();
  if (!runtime) throw new Error("storefront_design_runtime_unavailable");
  const workspace = await runtime.repository.getWorkspace({ tenantContext, now: new Date() });
  const initialLocation = resolveDesignWorkspaceLocation((await searchParams).section);
  return <DesignWorkspace workspace={workspace} canManage={isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage")} initialLocation={initialLocation} />;
}
