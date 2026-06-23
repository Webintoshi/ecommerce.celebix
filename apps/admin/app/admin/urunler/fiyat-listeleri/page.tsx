import { ProductModuleReadinessPage, productModuleIcons } from "@/components/admin/products-module-phase-one";
import { STORE_RUNTIME } from "@/lib/store-runtime";

export const metadata = {
  title: `Fiyat Listeleri | ${STORE_RUNTIME.name} Admin`,
  description: "Kanal, müşteri grubu veya dönem bazlı alternatif fiyatlandırma için hazırlık alanı.",
};

export default function ProductPriceListsPage() {
  return (
    <ProductModuleReadinessPage
      title="Fiyat Listeleri"
      description="Kanal, müşteri grubu veya dönem bazlı alternatif fiyatlandırma için hazırlık alanı."
      status="Checkout etkisi analiz gerektirir"
      statusTone="danger"
      ctaLabel="Fiyat listesi oluştur"
      note="Fiyat listeleri storefront ve checkout fiyat çözümleyicisini etkileyebilir; bu nedenle ayrı fazda tasarlanacak."
      warning="Bu modül gerçek fiyat hesaplaması veya satış fiyatı değişikliği yapmaz."
      cards={[
        {
          title: "Kanal bazlı fiyat",
          description: "Pazar yeri, vitrin veya özel kanal fiyatları için model gerektirir.",
          icon: productModuleIcons.price,
        },
        {
          title: "Müşteri grubu",
          description: "Segment bazlı fiyatlar müşteri ve checkout kurallarıyla birlikte düşünülür.",
          icon: productModuleIcons.target,
        },
        {
          title: "Dönemsel liste",
          description: "Başlangıç ve bitiş tarihli fiyat listeleri ayrı doğrulama ister.",
          icon: productModuleIcons.filteredCount,
        },
        {
          title: "Fiyat çözümleyici",
          description: "Storefront ve checkout aynı sonucu üretmeden aktif satışa açılamaz.",
          icon: productModuleIcons.approval,
        },
      ]}
    />
  );
}
