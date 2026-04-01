import ProductsPageClient from "./ProductsPageClient";
import { getAdminProductsBootstrap } from "@/lib/admin-product-list";
import { withServerTimeout } from "@/lib/server-timeout";

export default async function ProductsPage() {
  try {
    const initialData = await withServerTimeout(
      getAdminProductsBootstrap(1, 20),
      7000,
      "Urun verileri ilk acilista zaman asimina ugradi."
    );

    return (
      <ProductsPageClient
        initialProducts={initialData.products}
        initialCategories={initialData.categories}
        initialPagination={initialData.pagination}
      />
    );
  } catch (error) {
    console.error("Admin products page bootstrap error:", error);

    return (
      <ProductsPageClient
        initialError="Urunler ilk acilista getirilemedi. Sayfa acik kaldi; tekrar deneyebilirsiniz."
      />
    );
  }
}
