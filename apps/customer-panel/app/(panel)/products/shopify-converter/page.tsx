import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { CatalogImportPreparationConsole } from "@/components/catalog-admin/CatalogImportPreparationConsole";
import { PanelWorkspaceShell } from "@/components/panel/PanelWorkspaceShell";
import { IMPORT_WORKSPACE_TABS } from "@/lib/panel-ui/workspace-navigation";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ShopifyConverterPage() {
  const { tenantContext } = await requireServerPanelAccess();
  const canImport = isMerchantActionAllowed(tenantContext.membership.role, "catalog_admin.import");
  return (
    <PanelWorkspaceShell title="İçe Aktarma" description="Ürün verilerinizi kalıcı katalog değişikliğinden önce doğrulayın ve önizleyin." tabs={canImport ? IMPORT_WORKSPACE_TABS : []}>
      <CatalogImportPreparationConsole format="shopify_csv" title="Shopify Dönüştürücü" description="Yerel Shopify CSV dosyanızı güvenli dosya dönüştürme önizlemesiyle doğrulayın." canImport={canImport} embedded />
    </PanelWorkspaceShell>
  );
}
