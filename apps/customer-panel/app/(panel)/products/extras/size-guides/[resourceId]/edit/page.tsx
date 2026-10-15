import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { CatalogSizeGuideEditor } from "@/components/catalog-admin/extras/CatalogSizeGuideEditor";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function EditSizeGuidePage({ params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params;
  const { tenantContext } = await requireServerPanelAccess();
  return <CatalogSizeGuideEditor resourceId={resourceId} canManage={isMerchantActionAllowed(tenantContext.membership.role, "catalog_admin.manage")} />;
}
