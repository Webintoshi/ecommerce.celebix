import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantRecordEditor } from "@/components/merchant-admin/MerchantRecordEditor";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function EditBlogPostPage({ params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params;
  const { tenantContext } = await requireServerPanelAccess();
  return <MerchantRecordEditor kind="blog_post" recordId={recordId} returnTo="/content/blog" canManage={isMerchantActionAllowed(tenantContext.membership.role, "content.manage")} />;
}
