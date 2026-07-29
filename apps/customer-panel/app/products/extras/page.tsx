import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { CatalogResourceConsole } from "@/components/catalog-admin/CatalogResourceConsole";
import { requireServerPanelAccess } from "@/lib/server-access";
export default async function ExtrasPage() { const { tenantContext } = await requireServerPanelAccess(); return <CatalogResourceConsole kind="extra" canManage={isMerchantActionAllowed(tenantContext.membership.role, "catalog_admin.manage")} />; }
