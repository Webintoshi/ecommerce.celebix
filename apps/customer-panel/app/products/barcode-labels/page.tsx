import {
  type BarcodeLabelRow,
} from "@celebix/saas-contracts";
import { BarcodeLabelConsole } from "@/components/catalog-admin/BarcodeLabelConsole";
import { projectBarcodeLabelProducts } from "@/lib/catalog-admin-ui/barcode-label-projection";
import {
  CATALOG_PAGE_ACTIONS,
  isCatalogPageActionAllowed,
} from "@/lib/catalog-page-access";
import { requireServerPanelAccess } from "@/lib/server-access";
import { resolveDefaultServerCatalogRuntime } from "@/lib/server-catalog/default";

export default async function BarcodeLabelsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  const canRead = isCatalogPageActionAllowed(
    tenantContext,
    CATALOG_PAGE_ACTIONS.barcodeLabels,
  );
  const products: BarcodeLabelRow[] = [];
  const runtime = canRead ? await resolveDefaultServerCatalogRuntime() : null;
  if (runtime !== null) {
    const now = new Date();
    let cursor: string | undefined;
    do {
      const page = await runtime.catalog.listProducts({
        tenantContext,
        now,
        pageSize: 100,
        ...(cursor === undefined ? {} : { cursor }),
      });
      const details = await Promise.all(
        page.items.map((product) =>
          runtime.catalog.getProductDetails({
            tenantContext,
            now,
            productId: product.id,
          }),
        ),
      );
      products.push(
        ...projectBarcodeLabelProducts(details).slice(0, 500 - products.length),
      );
      cursor = page.nextCursor;
    } while (cursor !== undefined && products.length < 500);
  }
  return <BarcodeLabelConsole products={Object.freeze(products)} />;
}
