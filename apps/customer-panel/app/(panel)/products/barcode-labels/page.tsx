import { BarcodeLabelStudio } from "@/components/catalog-admin/BarcodeLabelStudio";
import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import {
  CATALOG_PAGE_ACTIONS,
  isCatalogPageActionAllowed,
} from "@/lib/catalog-page-access";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function BarcodeLabelsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return (
    <BarcodeLabelStudio
      canManage={
        isCatalogPageActionAllowed(
          tenantContext,
          CATALOG_PAGE_ACTIONS.barcodeLabels,
        ) &&
        isMerchantActionAllowed(
          tenantContext.membership.role,
          "catalog_admin.manage",
        )
      }
      storeName={tenantContext.store.slug}
    />
  );
}
