import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { CatalogExtrasConsole } from "@/components/catalog-admin/extras/CatalogExtrasConsole";
import { requireServerPanelAccess } from "@/lib/server-access";
export default async function ExtrasPage() { const { tenantContext } = await requireServerPanelAccess(); return <CatalogExtrasConsole canManage={isMerchantActionAllowed(tenantContext.membership.role, "catalog_admin.manage")} />; }
