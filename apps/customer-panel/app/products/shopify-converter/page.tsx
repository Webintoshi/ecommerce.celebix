import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { CatalogImportPreparationConsole } from "@/components/catalog-admin/CatalogImportPreparationConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ShopifyConverterPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <CatalogImportPreparationConsole format="shopify_csv" title="Shopify Dönüştürücü" description="Yerel Shopify CSV dosyanızı güvenli dosya dönüştürme önizlemesiyle doğrulayın." canImport={isMerchantActionAllowed(tenantContext.membership.role, "catalog_admin.import")} />;
}
