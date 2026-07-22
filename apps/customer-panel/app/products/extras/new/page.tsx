import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { CatalogResourceEditor } from "@/components/catalog-admin/CatalogResourceEditor";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function NewExtraPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <CatalogResourceEditor kind="extra" canManage={isMerchantActionAllowed(tenantContext.membership.role, "catalog_admin.manage")} />;
}
