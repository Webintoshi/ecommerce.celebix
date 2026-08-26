import { isCatalogProductOperationAllowed } from "@celebix/saas-contracts";

import { ProductDetailConsole } from "@/components/catalog/ProductDetailConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ProductDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  const [{ productId }, { tenantContext }] = await Promise.all([params, requireServerPanelAccess()]);
  const role = tenantContext.membership.role;
  return (
    <ProductDetailConsole
      productId={productId}
      canManage={isCatalogProductOperationAllowed(role, "update")}
      canArchive={isCatalogProductOperationAllowed(role, "archive")}
    />
  );
}
