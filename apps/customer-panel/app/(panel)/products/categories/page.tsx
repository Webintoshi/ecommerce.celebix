import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { CategoryManager } from "@/components/catalog-onboarding/CategoryManager";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ProductCategoriesPage() {
  const { tenantContext } = await requireServerPanelAccess();
  const role = tenantContext.membership.role;
  return <CategoryManager
    canManage={isMerchantActionAllowed(role, "catalog_admin.manage")}
    canArchive={isMerchantActionAllowed(role, "catalog_admin.archive")}
    canDelete={isMerchantActionAllowed(role, "catalog_admin.delete")}
    canManageSeo={isMerchantActionAllowed(role, "integrations.manage")}
  />;
}
