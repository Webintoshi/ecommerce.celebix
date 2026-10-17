import "server-only";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { decideServerPanelAccess } from "@/lib/server-panel-access/decision";
import { resolveServerPanelSession } from "@/lib/server-session";
import { isCashierPanelPathAllowed } from "./panel-ui/cashier-access.ts";
import { resolvePanelAccountingAccess } from "@/lib/server-accounting/access";
import { commercialRouteDecision } from "./commercial-packages/route-model.ts";

export async function resolveServerPanelAccess() {
  const decision = decideServerPanelAccess(await resolveServerPanelSession());
  if (decision.kind === "redirect") redirect(decision.destination);
  const accountingAccess = decision.tenantContext.membership.role === "cashier"
    ? await resolvePanelAccountingAccess(decision.tenantContext)
    : { canManageAccounting: false, canCollectReceivables: false };
  const pathname = (await headers()).get("x-celebix-panel-pathname");
  if (decision.tenantContext.membership.role === "cashier"
    && !isCashierPanelPathAllowed(pathname, accountingAccess.canManageAccounting)) {
    redirect("/orders/quick-links");
  }
  const feature = commercialRouteDecision(decision.tenantContext, pathname);
  if (feature.kind !== "allowed") redirect(`/upgrade?feature=${feature.capability}`);
  return { session: decision.session, tenantContext: decision.tenantContext, accountingAccess, ...(decision.support ? { support: decision.support } : {}) };
}

export const requireServerPanelAccess = resolveServerPanelAccess;
