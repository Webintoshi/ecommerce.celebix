import ProductsPageClient from "./ProductsPageClient";
import { getAdminProductsBootstrap } from "@/lib/admin-product-list";
import { shouldUseLightPostgresAdmin } from "@/lib/db/admin-database-mode";
import { withServerTimeout } from "@/lib/server-timeout";

export default async function ProductsPage() {
  const productDeleteStrategy = shouldUseLightPostgresAdmin() ? "soft-archive" : "hard-delete";

  try {
    const initialData = await withServerTimeout(
      getAdminProductsBootstrap(1, 20),
      7000,
      "Ürün verileri ilk açılışta zaman aşımına uğradı.",
    );

    return (
      <ProductsPageClient
        initialProducts={initialData.products}
        initialCategories={initialData.categories}
        initialPagination={initialData.pagination}
        productDeleteStrategy={productDeleteStrategy}
      />
    );
  } catch (error) {
    console.error("Admin products page bootstrap error:", error);

    return (
      <ProductsPageClient
        initialError="Ürünler ilk açılışta getirilemedi. Sayfa açık kaldı; tekrar deneyebilirsiniz."
        productDeleteStrategy={productDeleteStrategy}
      />
    );
  }
}
