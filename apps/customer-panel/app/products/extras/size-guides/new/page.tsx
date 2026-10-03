import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { CatalogSizeGuideEditor } from "@/components/catalog-admin/extras/CatalogSizeGuideEditor";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function NewSizeGuidePage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <CatalogSizeGuideEditor canManage={isMerchantActionAllowed(tenantContext.membership.role, "catalog_admin.manage")} />;
}
