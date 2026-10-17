import { hasCommercialCapability } from '@celebix/saas-contracts';
import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantContentEditor } from "@/components/content/MerchantContentEditor";
import { requireServerPanelAccess } from "@/lib/server-access";
import { contentResourceAuthoringEnabled, contentResearchEnabled } from "@/lib/server-content-resource-authoring/runtime";

export default async function EditContentPage({ params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params;
  const { tenantContext } = await requireServerPanelAccess();
  return <MerchantContentEditor storeId={tenantContext.store.id} kind="page" recordId={recordId} aiEnabled={hasCommercialCapability(tenantContext.entitlements, "ai") && contentResourceAuthoringEnabled(tenantContext.store.id)} researchEnabled={hasCommercialCapability(tenantContext.entitlements, "ai") && contentResearchEnabled(tenantContext.store.id)} aiUpgradeAvailable={!hasCommercialCapability(tenantContext.entitlements, "ai")} returnTo="/content/pages" canManage={isMerchantActionAllowed(tenantContext.membership.role, "content.manage")} />;
}
