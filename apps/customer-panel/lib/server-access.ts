import "server-only";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { decideServerPanelAccess } from "@/lib/server-panel-access/decision";
import { resolveServerPanelSession } from "@/lib/server-session";
import { isCashierPanelPathAllowed } from "./panel-ui/cashier-access.ts";

export async function resolveServerPanelAccess() {
  const decision = decideServerPanelAccess(await resolveServerPanelSession());
  if (decision.kind === "redirect") redirect(decision.destination);
  if (decision.tenantContext.membership.role === "cashier"
    && !isCashierPanelPathAllowed((await headers()).get("x-celebix-panel-pathname"))) {
    redirect("/orders/quick-links");
  }
  return { session: decision.session, tenantContext: decision.tenantContext, ...(decision.support ? { support: decision.support } : {}) };
}

export const requireServerPanelAccess = resolveServerPanelAccess;
