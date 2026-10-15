import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { CatalogExtraEditor } from "@/components/catalog-admin/extras/CatalogExtraEditor";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function EditExtraPage({ params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params;
  const { tenantContext } = await requireServerPanelAccess();
  return <CatalogExtraEditor resourceId={resourceId} canManage={isMerchantActionAllowed(tenantContext.membership.role, "catalog_admin.manage")} />;
}
