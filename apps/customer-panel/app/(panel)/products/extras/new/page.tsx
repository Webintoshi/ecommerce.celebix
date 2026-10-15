import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { CatalogResourceEditor } from "@/components/catalog-admin/CatalogResourceEditor";
import { CatalogExtraTypeChooser } from "@/components/catalog-admin/extras/CatalogExtraTypeChooser";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function NewExtraPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { tenantContext } = await requireServerPanelAccess();
  const canManage = isMerchantActionAllowed(tenantContext.membership.role, "catalog_admin.manage");
  const { type } = await searchParams;
  return type === "priced_option" ? <CatalogResourceEditor kind="extra" canManage={canManage} /> : <CatalogExtraTypeChooser canManage={canManage} />;
}
