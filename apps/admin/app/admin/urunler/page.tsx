import ProductsPageClient from "./ProductsPageClient";
import { getAdminProductsBootstrap } from "@/lib/admin-product-list";

export default async function ProductsPage() {
  try {
    const initialData = await getAdminProductsBootstrap(1, 20);

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
