import { ProductModuleReadinessPage, productModuleIcons } from "@/components/admin/products-module-phase-one";
import { STORE_RUNTIME } from "@/lib/store-runtime";

export const metadata = {
  title: `Satın Alma | ${STORE_RUNTIME.name} Admin`,
  description: "Tedarikçi siparişleri ve gelen stok hareketleri için hazırlık alanı.",
};

export default function ProductPurchasingPage() {
  return (
    <ProductModuleReadinessPage
      title="Satın Alma"
      description="Tedarikçi siparişleri ve gelen stok hareketleri için hazırlık alanı."
      status="Altyapı gerekli"
      statusTone="warning"
      ctaLabel="Satın alma oluştur"
      note="Bu modül inventory hareket defteri tamamlandıktan sonra aktif edilecek."
      cards={[
        {
          title: "Tedarikçi siparişi",
          description: "Tedarikçi, referans no ve beklenen sevk tarihiyle satın alma taslağı planlanır.",
          icon: productModuleIcons.purchase,
        },
        {
          title: "Gelen ürün kabulü",
          description: "Gelen ürünlerin varyant ve miktar bazında kabul adımı ayrı fazda tasarlanır.",
          icon: productModuleIcons.receiving,
        },
        {
          title: "Maliyet takibi",
          description: "Satın alma maliyeti ürün maliyet alanlarıyla kontrollü ilişkilendirilecek.",
          icon: productModuleIcons.cost,
        },
        {
          title: "Inventory bağlantısı",
          description: "Stok artışı gerçek hareket defteri oluşmadan bu ekrandan yazılmayacak.",
          icon: productModuleIcons.inventory,
        },
      ]}
    />
  );
}
