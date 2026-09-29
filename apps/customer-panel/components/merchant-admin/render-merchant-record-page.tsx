import {
  isMerchantActionAllowed,
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
  const { tenantContext } = await requireServerPanelAccess();
  if (input.kind === "blog_post" || input.kind === "page") {
    return <MerchantContentEditor storeId={tenantContext.store.id} kind={input.kind} initialLocale={input.recordId ? 'tr' : await resolveInitialContentLocale(tenantContext)} recordId={input.recordId} aiEnabled={contentResourceAuthoringEnabled(tenantContext.store.id)} researchEnabled={contentResearchEnabled(tenantContext.store.id)} returnTo={input.returnTo} canManage={isMerchantActionAllowed(tenantContext.membership.role, "content.manage")} />;
  }
  return (
    <MerchantRecordEditor
      kind={input.kind}
      recordId={input.recordId}
      returnTo={input.returnTo}
      canManage={isMerchantActionAllowed(tenantContext.membership.role, input.permission)}
    />
  );
}
