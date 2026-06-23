import { ProductModuleReadinessPage, productModuleIcons } from "@/components/admin/products-module-phase-one";
import { STORE_RUNTIME } from "@/lib/store-runtime";

export const metadata = {
  title: `Etiketler | ${STORE_RUNTIME.name} Admin`,
  description: "Ürün etiketlerini katalog filtreleme ve dışa aktarım hazırlığı için ayrılaştıran hazırlık alanı.",
};

export default function ProductTagsPage() {
  return (
    <ProductModuleReadinessPage
      title="Etiketler"
      description="Ürün etiketlerini katalog filtreleme ve dışa aktarım hazırlığı için ayrılaştıran hazırlık alanı."
      status="Hazırlık"
      statusTone="info"
      ctaLabel="Etiket oluştur"
      note="Etiket veri modeli ürün listeleme, filtreleme ve dışa aktarım etkileri netleştirildikten sonra aktif edilecek."
      cards={[
        {
          title: "Katalog etiketi",
          description: "Ürünleri kampanya, sezon veya koleksiyon diliyle işaretlemek için planlanır.",
          icon: productModuleIcons.price,
        },
        {
          title: "Filtreleme etkisi",
          description: "Storefront filtreleri ve ürün arama davranışı ayrı fazda değerlendirilecek.",
          icon: productModuleIcons.filteredCount,
        },
        {
          title: "Toplu uygulama",
          description: "Birden fazla ürüne güvenli etiket bağlama akışı gerçek mutation olmadan taslakta tutulur.",
          icon: productModuleIcons.inventory,
        },
        {
          title: "Dışa aktarım",
          description: "Feed ve rapor çıktılarında etiketlerin nasıl okunacağı ayrıca netleştirilecek.",
          icon: productModuleIcons.approval,
        },
      ]}
    />
  );
}
