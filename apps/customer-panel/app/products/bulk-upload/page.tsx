import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { CatalogBulkImportConsole } from "@/components/catalog-admin/CatalogBulkImportConsole";
import { requireServerPanelAccess } from "@/lib/server-access";
export default async function BulkUploadPage() { const { tenantContext } = await requireServerPanelAccess(); return <CatalogBulkImportConsole canImport={isMerchantActionAllowed(tenantContext.membership.role, "catalog_admin.import")} />; }
