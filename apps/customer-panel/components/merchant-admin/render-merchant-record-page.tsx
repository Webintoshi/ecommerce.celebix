import {
  isMerchantActionAllowed,
  type MerchantAction,
  type MerchantAdminRecordKind,
} from "@celebix/saas-contracts";

import { MerchantContentEditor } from "@/components/content/MerchantContentEditor";
import { MerchantRecordEditor } from "@/components/merchant-admin/MerchantRecordEditor";
import { requireServerPanelAccess } from "@/lib/server-access";

export async function renderMerchantRecordPage(input: Readonly<{
  kind: MerchantAdminRecordKind;
  permission: MerchantAction;
  recordId?: string;
  returnTo: string;
}>) {
  const { tenantContext } = await requireServerPanelAccess();
  if (input.kind === "blog_post" || input.kind === "page") {
    return <MerchantContentEditor kind={input.kind} initialLocale={tenantContext.locale} recordId={input.recordId} returnTo={input.returnTo} canManage={isMerchantActionAllowed(tenantContext.membership.role, "content.manage")} />;
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
