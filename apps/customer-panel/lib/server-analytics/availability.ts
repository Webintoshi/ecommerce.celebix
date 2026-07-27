import "server-only";

import { isPlanFeatureEnabled, type TenantContext } from "@celebix/saas-contracts";
import { resolveDefaultServerAnalyticsRuntime } from "./default.ts";

export async function resolvePanelAnalyticsAvailability(context: TenantContext): Promise<boolean> {
  if (!isPlanFeatureEnabled(context.entitlements, "analytics")) return false;
  return resolveDefaultServerAnalyticsRuntime().then((runtime) => runtime !== null, () => false);
}
