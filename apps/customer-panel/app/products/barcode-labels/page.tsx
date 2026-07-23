import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import type { ProductDetailsResult } from "@celebix/saas-data";
import { BarcodeLabelConsole } from "@/components/catalog-admin/BarcodeLabelConsole";
import { requireServerPanelAccess } from "@/lib/server-access";
import { resolveDefaultServerCatalogRuntime } from "@/lib/server-catalog/default";

export default async function BarcodeLabelsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  const canRead = isMerchantActionAllowed(
    tenantContext.membership.role,
    "catalog_admin.read",
  );
  const products: ProductDetailsResult[] = [];
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
      products.push(
        ...(await Promise.all(
          page.items.map((product) =>
            runtime.catalog.getProductDetails({
              tenantContext,
              now,
              productId: product.id,
            }),
          ),
        )),
      );
      cursor = page.nextCursor;
    } while (cursor !== undefined && products.length < 500);
  }
  return <BarcodeLabelConsole products={products} />;
}
