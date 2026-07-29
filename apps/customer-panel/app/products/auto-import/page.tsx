import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { CatalogImportPreparationConsole } from "@/components/catalog-admin/CatalogImportPreparationConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function AutoImportPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <CatalogImportPreparationConsole format="native_csv" title="Otomatik Yükle" description="CSV dosyanızı kalıcı katalog değişikliğinden önce doğrulayın ve önizleyin." canImport={isMerchantActionAllowed(tenantContext.membership.role, "catalog_admin.import")} />;
}
