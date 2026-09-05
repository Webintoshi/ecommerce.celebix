import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { requireServerPanelAccess } from "@/lib/server-access";
import { resolveServerPromotionsRuntime } from "@/lib/server-promotions/runtime";
import { resolveDefaultServerPanelAccessRuntime } from "@/lib/server-panel-access/default";

export async function requirePromotionPageContext() {
  const { tenantContext } = await requireServerPanelAccess();
  const runtime = resolveServerPromotionsRuntime(await resolveDefaultServerPanelAccessRuntime());
  if (!runtime) throw new Error("promotion_store_timezone_unavailable");
  const now = new Date();
  const [timezone, storefrontOrigin] = await Promise.all([
    runtime.promotions.timezone({ tenantContext, now }),
    runtime.promotions.storefrontOrigin({ tenantContext, now }),
  ]);
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); } catch { throw new Error("promotion_store_timezone_invalid"); }
  return Object.freeze({
    timezone,
    storefrontOrigin,
    canManage: isMerchantActionAllowed(tenantContext.membership.role, "promotions.manage_draft"),
    canPublish: isMerchantActionAllowed(tenantContext.membership.role, "promotions.publish"),
    canExportCodes: isMerchantActionAllowed(tenantContext.membership.role, "promotions.export_codes"),
    canArchive: isMerchantActionAllowed(tenantContext.membership.role, "promotions.archive"),
  });
}
