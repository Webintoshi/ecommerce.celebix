import { isCatalogProductOperationAllowed, isMerchantActionAllowed } from "@celebix/saas-contracts";

import { ProductListConsole } from "@/components/catalog/ProductListConsole";
import { parseProductListUrlQuery } from "@/lib/catalog-ui/product-list-query";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ProductsPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<Record<string, string | string[] | undefined>> }>) {
  const { tenantContext } = await requireServerPanelAccess();
  const role = tenantContext.membership.role;
  const supplied = await searchParams;
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(supplied ?? {})) {
    if (typeof value === "string") parameters.set(key, value);
  }
  return (
    <ProductListConsole
      initialQuery={parseProductListUrlQuery(parameters)}
      canManage={isCatalogProductOperationAllowed(role, "update")}
      canArchive={isCatalogProductOperationAllowed(role, "archive")}
      canImport={isMerchantActionAllowed(role, "catalog_admin.import")}
    />
  );
}
