import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { CatalogImportPreparationConsole } from "@/components/catalog-admin/CatalogImportPreparationConsole";
import { PanelWorkspaceShell } from "@/components/panel/PanelWorkspaceShell";
import { IMPORT_WORKSPACE_TABS } from "@/lib/panel-ui/workspace-navigation";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function AutoImportPage() {
  const { tenantContext } = await requireServerPanelAccess();
  const canImport = isMerchantActionAllowed(tenantContext.membership.role, "catalog_admin.import");
  return (
    <PanelWorkspaceShell title="İçe Aktarma" description="Ürün verilerinizi kalıcı katalog değişikliğinden önce doğrulayın ve önizleyin." tabs={canImport ? IMPORT_WORKSPACE_TABS : []}>
      <CatalogImportPreparationConsole format="native_csv" title="Otomatik Yükle" description="CSV dosyanızı kalıcı katalog değişikliğinden önce doğrulayın ve önizleyin." canImport={canImport} embedded />
    </PanelWorkspaceShell>
  );
}
