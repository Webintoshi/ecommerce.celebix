import { CatalogResourceConsole } from "@/components/catalog-admin/CatalogResourceConsole";
import {
  CATALOG_PAGE_ACTIONS,
  isCatalogPageActionAllowed,
} from "@/lib/catalog-page-access";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function TagsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return (
    <CatalogResourceConsole
      kind="tag"
      canManage={isCatalogPageActionAllowed(
        tenantContext,
        CATALOG_PAGE_ACTIONS.tags,
      )}
    />
  );
}
