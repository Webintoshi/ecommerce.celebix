import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantContentEditor } from "@/components/content/MerchantContentEditor";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function NewBlogPostPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <MerchantContentEditor kind="blog_post" initialLocale={tenantContext.locale} returnTo="/content/blog" canManage={isMerchantActionAllowed(tenantContext.membership.role, "content.manage")} />;
}
