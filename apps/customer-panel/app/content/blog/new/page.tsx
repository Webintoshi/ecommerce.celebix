import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantRecordEditor } from "@/components/merchant-admin/MerchantRecordEditor";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function NewBlogPostPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <MerchantRecordEditor kind="blog_post" returnTo="/content/blog" canManage={isMerchantActionAllowed(tenantContext.membership.role, "content.manage")} />;
}
