import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";

import { DesignWorkspace } from "@/components/settings/design/DesignWorkspace";
import { resolveDesignWorkspaceLocation } from "@/components/settings/design/workspace-navigation-model";
import { requireServerPanelAccess } from "@/lib/server-access";
import { resolveDefaultServerStorefrontDesignRuntime } from "@/lib/server-storefront-design/default";
import { resolveDefaultServerStorefrontDesignPreviewRuntime } from "@/lib/server-storefront-design-preview/default";
import { unavailableStorefrontDesignPreviewResources } from "@/lib/storefront-design-preview-model";

export default async function DesignSettingsPage({ searchParams }: Readonly<{ searchParams: Promise<{ section?: string }> }>) {
  const { session, tenantContext } = await requireServerPanelAccess();
  if (!isMerchantActionAllowed(tenantContext.membership.role, "configuration.read")) redirect("/unauthorized");
  const runtime = await resolveDefaultServerStorefrontDesignRuntime();
  if (!runtime) throw new Error("storefront_design_runtime_unavailable");
  const now = new Date();
  const workspace = await runtime.repository.getWorkspace({ tenantContext, now });
  const previewRuntime = await resolveDefaultServerStorefrontDesignPreviewRuntime();
  let initialPreviewResources = unavailableStorefrontDesignPreviewResources(workspace.draft.composition);
  if (previewRuntime) {
    try { initialPreviewResources = await previewRuntime.loader.load({ tenantContext, now, workspace, composition: workspace.draft.composition }); }
    catch { /* Explicit unavailable resources remain visible without weakening page access. */ }
  }
  const initialLocation = resolveDesignWorkspaceLocation((await searchParams).section);
  // Non-authoritative frontend identity, never sent to a mutation API. Hashing
  // avoids exposing the underlying session identifier in the client props.
  const recoveryScope = createHash("sha256").update(JSON.stringify([session.id, tenantContext.principal.id, tenantContext.store.id])).digest("hex");
  return <DesignWorkspace key={recoveryScope} recoveryScope={recoveryScope} workspace={workspace} initialPreviewResources={initialPreviewResources} canManage={isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage")} initialLocation={initialLocation} />;
}
