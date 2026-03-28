import ProductWizard from "@/components/admin/product-wizard/ProductWizard";
import { STORE_RUNTIME } from "@/lib/store-runtime";

export const metadata = {
  title: `Yeni Urun Ekle | ${STORE_RUNTIME.name} Admin`,
  description: "Yeni ürün ekleme sayfası",
};

export default function NewProductPage() {
  return <ProductWizard />;
}
