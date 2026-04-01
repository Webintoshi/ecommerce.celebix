import ProductWizard from "@/components/admin/product-wizard/ProductWizard";
import { STORE_RUNTIME } from "@/lib/store-runtime";

interface EditProductPageProps {
  params: Promise<{
    id: string;
  }>;
}

export async function generateMetadata({ params }: EditProductPageProps) {
  const { id } = await params;
  return {
    title: `Ürün Düzenle | ${STORE_RUNTIME.name} Admin`,
    description: "Ürün düzenleme sayfası",
  };
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params;

  return <ProductWizard productId={id} />;
}
