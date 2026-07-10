import "server-only";

import { redirect } from "next/navigation";
import {
  DisabledPanelAuthorizationDataPort,
  resolvePanelTenantContext,
} from "@/lib/panel-access";
import { resolveServerPanelSession } from "@/lib/server-session";

const productionAuthorizationData = new DisabledPanelAuthorizationDataPort();

export async function requireServerPanelAccess() {
  const session = await resolveServerPanelSession();
  if (!session) redirect("/login");

  const access = await resolvePanelTenantContext({
    requestId: crypto.randomUUID(),
    session,
    dataPort: productionAuthorizationData,
  });
  if (!access.ok) redirect("/unauthorized");
  return { session, tenantContext: access.context };
}
