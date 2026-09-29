import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantContentEditor } from "@/components/content/MerchantContentEditor";
import { requireServerPanelAccess } from "@/lib/server-access";
import { resolveInitialContentLocale } from "@/lib/server-content-resource-authoring/locale";
import { contentResourceAuthoringEnabled, contentResearchEnabled } from "@/lib/server-content-resource-authoring/runtime";

export default async function NewBlogPostPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <MerchantContentEditor storeId={tenantContext.store.id} kind="blog_post" initialLocale={await resolveInitialContentLocale(tenantContext)} aiEnabled={contentResourceAuthoringEnabled(tenantContext.store.id)} researchEnabled={contentResearchEnabled(tenantContext.store.id)} returnTo="/content/blog" canManage={isMerchantActionAllowed(tenantContext.membership.role, "content.manage")} />;
}
