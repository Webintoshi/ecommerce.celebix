import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantContentEditor } from "@/components/content/MerchantContentEditor";
import { requireServerPanelAccess } from "@/lib/server-access";
import { contentResourceAuthoringEnabled, contentResearchEnabled } from "@/lib/server-content-resource-authoring/runtime";

export default async function EditBlogPostPage({ params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params;
  const { tenantContext } = await requireServerPanelAccess();
  return <MerchantContentEditor storeId={tenantContext.store.id} kind="blog_post" recordId={recordId} aiEnabled={contentResourceAuthoringEnabled(tenantContext.store.id)} researchEnabled={contentResearchEnabled(tenantContext.store.id)} returnTo="/content/blog" canManage={isMerchantActionAllowed(tenantContext.membership.role, "content.manage")} />;
}
