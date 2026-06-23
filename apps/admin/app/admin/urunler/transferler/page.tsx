import { ProductModuleReadinessPage, productModuleIcons } from "@/components/admin/products-module-phase-one";
import { STORE_RUNTIME } from "@/lib/store-runtime";

export const metadata = {
  title: `Transferler | ${STORE_RUNTIME.name} Admin`,
  description: "Depo ve lokasyonlar arası stok aktarımı için hazırlık alanı.",
};

export default function ProductTransfersPage() {
  return (
    <ProductModuleReadinessPage
      title="Transferler"
      description="Depo ve lokasyonlar arası stok aktarımı için hazırlık alanı."
      status="Inventory foundation gerekli"
      statusTone="warning"
      ctaLabel="Transfer oluştur"
      note="Transfer akışı, kaynak ve hedef lokasyon stoklarını inventory foundation üzerinden güvenli şekilde yazacak ayrı fazda açılacak."
      cards={[
        {
          title: "Kaynak lokasyon",
          description: "Çıkış deposu veya şubesi stok bakiyesiyle birlikte seçilecek.",
          icon: productModuleIcons.source,
        },
        {
          title: "Hedef lokasyon",
          description: "Giriş lokasyonu seçimi ve uygunluk kuralları inventory modeliyle bağlanacak.",
          icon: productModuleIcons.target,
        },
        {
          title: "Transfer adedi",
          description: "Varyant bazlı transfer miktarı stok hareketi oluşturmadan şimdilik pasif tutulur.",
          icon: productModuleIcons.quantity,
        },
        {
          title: "Onay / iptal akışı",
          description: "Taslak, onay ve iptal durumları hareket defteriyle birlikte ele alınacak.",
          icon: productModuleIcons.approval,
        },
      ]}
    />
  );
}
