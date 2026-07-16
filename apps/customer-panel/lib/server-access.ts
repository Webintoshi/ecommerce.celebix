import "server-only";

import { redirect } from "next/navigation";
import { decideServerPanelAccess } from "@/lib/server-panel-access/decision";
import { resolveServerPanelSession } from "@/lib/server-session";

export async function requireServerPanelAccess() {
  const decision = decideServerPanelAccess(await resolveServerPanelSession());
  if (decision.kind === "redirect") redirect(decision.destination);
  return { session: decision.session, tenantContext: decision.tenantContext };
}
