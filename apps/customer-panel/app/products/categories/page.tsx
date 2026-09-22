import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { CategoryManager } from "@/components/catalog-onboarding/CategoryManager";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ProductCategoriesPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <CategoryManager canDelete={isMerchantActionAllowed(tenantContext.membership.role, "catalog_admin.delete")} />;
}
