import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { CatalogResourceConsole } from "@/components/catalog-admin/CatalogResourceConsole";
import { requireServerPanelAccess } from "@/lib/server-access";
export default async function DefinitionsPage() { const { tenantContext } = await requireServerPanelAccess(); return <CatalogResourceConsole kind="definition" canManage={isMerchantActionAllowed(tenantContext.membership.role, "catalog_admin.manage")} />; }
