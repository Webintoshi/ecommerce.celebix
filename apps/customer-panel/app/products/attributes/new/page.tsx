import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { CatalogResourceEditor } from "@/components/catalog-admin/CatalogResourceEditor";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function NewAttributePage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <CatalogResourceEditor kind="attribute" canManage={isMerchantActionAllowed(tenantContext.membership.role, "catalog_admin.manage")} />;
}
