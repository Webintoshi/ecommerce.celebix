import { ProductModuleReadinessPage, productModuleIcons } from "@/components/admin/products-module-phase-one";
import { STORE_RUNTIME } from "@/lib/store-runtime";

export const metadata = {
  title: `Stok Sayımı | ${STORE_RUNTIME.name} Admin`,
  description: "Fiziksel stok sayımı ve fark analizi için hazırlık alanı.",
};

export default function ProductStockCountPage() {
  return (
    <ProductModuleReadinessPage
      title="Stok Sayımı"
      description="Fiziksel stok sayımı ve fark analizi için hazırlık alanı."
      status="Planlandı"
      statusTone="info"
      ctaLabel="Stok sayımı başlat"
      note="Sayım sonucu stok farkı oluşturacağı için bu modül inventory hareket defteri hazır olduğunda aktif edilecek."
      cards={[
        {
          title: "Sayarak sayım",
          description: "Barkod veya manuel girişle ürünleri tek tek sayma akışı planlanır.",
          icon: productModuleIcons.count,
        },
        {
          title: "Filtreye göre sayım",
          description: "Kategori, lokasyon veya stok durumuna göre sayım listesi hazırlanacak.",
          icon: productModuleIcons.filteredCount,
        },
        {
          title: "Sistem / sayılan miktar",
          description: "Sistem stoğu ile fiziksel sayım değeri yan yana gösterilecek.",
          icon: productModuleIcons.quantity,
        },
        {
          title: "Fark hareketi",
          description: "Fark kapatma işlemi ayrı onay ve hareket kaydı gerektirir.",
          icon: productModuleIcons.variance,
        },
      ]}
    />
  );
}
