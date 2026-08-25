import { isCatalogProductOperationAllowed, isMerchantActionAllowed } from "@celebix/saas-contracts";

import { ProductListConsole } from "@/components/catalog/ProductListConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ProductsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  const role = tenantContext.membership.role;
  return (
    <ProductListConsole
      canManage={isCatalogProductOperationAllowed(role, "update")}
      canArchive={isCatalogProductOperationAllowed(role, "archive")}
      canImport={isMerchantActionAllowed(role, "catalog_admin.import")}
    />
  );
}
