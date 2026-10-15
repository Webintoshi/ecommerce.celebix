import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { CatalogResourceConsole } from "@/components/catalog-admin/CatalogResourceConsole";
import { requireServerPanelAccess } from "@/lib/server-access";
export default async function AttributesPage() { const { tenantContext } = await requireServerPanelAccess(); return <CatalogResourceConsole kind="attribute" canManage={isMerchantActionAllowed(tenantContext.membership.role, "catalog_admin.manage")} />; }
