import { ProductModuleReadinessPage, productModuleIcons } from "@/components/admin/products-module-phase-one";
import { STORE_RUNTIME } from "@/lib/store-runtime";

export const metadata = {
  title: `Barkod Etiketleri | ${STORE_RUNTIME.name} Admin`,
  description: "Ürün ve varyantlar için barkod/SKU etiketi hazırlama alanı.",
};

export default function ProductBarcodeLabelsPage() {
  return (
    <ProductModuleReadinessPage
      title="Barkod Etiketleri"
      description="Ürün ve varyantlar için barkod/SKU etiketi hazırlama alanı."
      status="Düşük riskli aday"
      statusTone="success"
      ctaLabel="Etiket hazırlamaya başla"
      note="Bu hazırlık ekranı ürün veya varyant verisini değiştirmez; PDF/print preview ayrı fazda eklenecek."
      cards={[
        {
          title: "Ürün / varyant seçimi",
          description: "Mevcut SKU ve barkod alanlarından güvenli okuma yapacak seçim akışı planlanır.",
          icon: productModuleIcons.barcode,
        },
        {
          title: "Etiket şablonu",
          description: "Etiket ölçüsü, marka bilgisi ve barkod görünümü şablonla yönetilecek.",
          icon: productModuleIcons.price,
        },
        {
          title: "PDF / print preview",
          description: "Yazdırma önizlemesi ürün verisini değiştirmeden üretilecek.",
          icon: productModuleIcons.count,
        },
        {
          title: "Adet seçimi",
          description: "Her varyant için basılacak etiket adedi ayrı giriş olarak planlanır.",
          icon: productModuleIcons.quantity,
        },
      ]}
    />
  );
}
