import {
  isMerchantActionAllowed,
  type MerchantAction,
  type MerchantAdminRecordKind,
} from "@celebix/saas-contracts";

import { MerchantRecordEditor } from "@/components/merchant-admin/MerchantRecordEditor";
import { requireServerPanelAccess } from "@/lib/server-access";

export async function renderMerchantRecordPage(input: Readonly<{
  kind: MerchantAdminRecordKind;
  permission: MerchantAction;
  recordId?: string;
  returnTo: string;
}>) {
  const { tenantContext } = await requireServerPanelAccess();
  return (
    <MerchantRecordEditor
      kind={input.kind}
      recordId={input.recordId}
      returnTo={input.returnTo}
      canManage={isMerchantActionAllowed(tenantContext.membership.role, input.permission)}
    />
  );
}
