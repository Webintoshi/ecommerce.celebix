import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { CatalogResourceEditor } from "@/components/catalog-admin/CatalogResourceEditor";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function EditBrandPage({ params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params;
  const { tenantContext } = await requireServerPanelAccess();
  return <CatalogResourceEditor kind="brand" resourceId={resourceId} canManage={isMerchantActionAllowed(tenantContext.membership.role, "catalog_admin.manage")} />;
}
