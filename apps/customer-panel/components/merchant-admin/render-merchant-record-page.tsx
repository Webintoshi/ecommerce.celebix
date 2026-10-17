import {
  isMerchantActionAllowed,
  hasCommercialCapability,
  type MerchantAction,
  type MerchantAdminRecordKind,
} from "@celebix/saas-contracts";

import { MerchantContentEditor } from "@/components/content/MerchantContentEditor";
import { MerchantRecordEditor } from "@/components/merchant-admin/MerchantRecordEditor";
import { requireServerPanelAccess } from "@/lib/server-access";
import { resolveInitialContentLocale } from "@/lib/server-content-resource-authoring/locale";
import { contentResourceAuthoringEnabled, contentResearchEnabled } from "@/lib/server-content-resource-authoring/runtime";

export async function renderMerchantRecordPage(input: Readonly<{
  kind: MerchantAdminRecordKind;
  permission: MerchantAction;
  recordId?: string;
  returnTo: string;
}>) {
  const { tenantContext, accountingAccess } = await requireServerPanelAccess();
  if (input.kind === "blog_post" || input.kind === "page") {
    return <MerchantContentEditor storeId={tenantContext.store.id} kind={input.kind} initialLocale={input.recordId ? 'tr' : await resolveInitialContentLocale(tenantContext)} recordId={input.recordId} aiEnabled={hasCommercialCapability(tenantContext.entitlements, "ai") && contentResourceAuthoringEnabled(tenantContext.store.id)} researchEnabled={hasCommercialCapability(tenantContext.entitlements, "ai") && contentResearchEnabled(tenantContext.store.id)} aiUpgradeAvailable={!hasCommercialCapability(tenantContext.entitlements, "ai")} returnTo={input.returnTo} canManage={isMerchantActionAllowed(tenantContext.membership.role, "content.manage")} />;
  }
  return (
    <MerchantRecordEditor
      kind={input.kind}
      recordId={input.recordId}
      returnTo={input.returnTo}
      canManage={isMerchantActionAllowed(tenantContext.membership.role, input.permission) || (input.kind === "accounting_profile" || input.kind === "invoice_integration") && tenantContext.membership.role === "cashier" && accountingAccess?.canManageAccounting === true}
    />
  );
}
