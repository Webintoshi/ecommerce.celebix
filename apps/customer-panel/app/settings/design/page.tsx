import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { redirect } from "next/navigation";

import { DesignWorkspace } from "@/components/settings/design/DesignWorkspace";
import { requireServerPanelAccess } from "@/lib/server-access";
import { resolveDefaultServerStorefrontDesignRuntime } from "@/lib/server-storefront-design/default";

const SECTIONS = Object.freeze(["theme", "brand", "colors", "typography", "hero", "promotion", "announcement"] as const);

export default async function DesignSettingsPage({ searchParams }: Readonly<{ searchParams: Promise<{ section?: string }> }>) {
  const { tenantContext } = await requireServerPanelAccess();
  if (!isMerchantActionAllowed(tenantContext.membership.role, "configuration.read")) redirect("/unauthorized");
  const runtime = await resolveDefaultServerStorefrontDesignRuntime();
  if (!runtime) throw new Error("storefront_design_runtime_unavailable");
  const workspace = await runtime.repository.getWorkspace({ tenantContext, now: new Date() });
  const requested = (await searchParams).section;
  const initialSection = SECTIONS.includes(requested as never) ? requested as (typeof SECTIONS)[number] : "brand";
  return <DesignWorkspace workspace={workspace} canManage={isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage")} initialSection={initialSection} />;
}
