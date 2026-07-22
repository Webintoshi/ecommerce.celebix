import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantRecordEditor } from "@/components/merchant-admin/MerchantRecordEditor";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function EditDiscountPage({ params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params;
  const { tenantContext } = await requireServerPanelAccess();
  return <MerchantRecordEditor kind="discount" recordId={recordId} returnTo="/discounts" canManage={isMerchantActionAllowed(tenantContext.membership.role, "promotions.manage")} />;
}
