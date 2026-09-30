import "server-only";
import type { TenantContext } from "@celebix/saas-contracts";
import { resolveServerPromotionsRuntime } from "./server-promotions/runtime.ts";
import { resolveDefaultServerPanelAccessRuntime } from "./server-panel-access/default.ts";

export async function resolveCollectionStorefrontOrigin(tenantContext: TenantContext): Promise<string | null> {
  try {
    const runtime = resolveServerPromotionsRuntime(await resolveDefaultServerPanelAccessRuntime());
    return runtime ? await runtime.promotions.storefrontOrigin({tenantContext, now: new Date()}) : null;
  } catch { return null; }
}
