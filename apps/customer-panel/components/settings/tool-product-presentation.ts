import type { MouseEvent, ReactNode, RefObject } from 'react';
import type { StoreToolKey } from '@celebix/saas-contracts';

export type ToolSummary = Readonly<{
  loading?: boolean; enabled?: boolean; detail?: string; error?: string; extra?: ReactNode;
  disabled?: boolean; configureLabel?: string; configureId?: string; configureKind?: string;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  onConfigure: (event: MouseEvent<HTMLButtonElement>) => void;
  onRetry?: () => void; shortcuts?: ReactNode;
}>;
export type ToolSummaryRenderer = (summary: ToolSummary) => ReactNode;
type Product = Readonly<{ image: string; benefit: string; features: readonly string[] }>;
export const TOOL_PRODUCTS: Readonly<Record<StoreToolKey | 'all_tools', Product>> = {
  contact_widget: { image: '/payments/tools/celebix-contact-widget-v1.webp', benefit: 'Müşterileriniz tercih ettikleri kanaldan size kolayca ulaşsın.', features: ['WhatsApp, telefon ve diğer iletişim kanalları', 'Cihaz, sayfa ve çalışma saati seçimi', 'Mağazanıza uygun görünüm ve hazır mesaj'] },
  whatsapp_ordering: { image: '/payments/tools/celebix-whatsapp-ordering-v1.webp', benefit: 'Ürün ve sepet bilgileriyle WhatsApp üzerinden sipariş talebi alın.', features: ['Ürün, seçenek ve adet içeren hazır mesaj', 'WhatsApp numarası ve mesaj ayarları', 'Fiyat ve sepete ekleme görünürlüğü'] },
  cart_capture: { image: '/payments/tools/celebix-cart-capture-v1.webp', benefit: 'Sepeti tamamlamayan ziyaretçilerin iletişim bilgisini alın.', features: ['E-posta, telefon veya ikisini toplama', 'Görünüm, cihaz ve gösterim ayarları', 'Yetkiniz varsa isteğe bağlı kupon'] },
  restock: { image: '/payments/tools/celebix-restock-v1.webp', benefit: 'Tükenen ürün yeniden geldiğinde bekleyen müşterilere haber verin.', features: ['Seçenek bazında stok bildirimi kaydı', 'Onaylı talebe tek seferlik e-posta', 'Bekleyen ve gönderilen bildirim durumu'] },
  order_bump: { image: '/payments/tools/celebix-order-bump-v1.webp', benefit: 'Sepette ve ödemede tamamlayıcı ürünleri kendi kurallarınızla önerin.', features: ['Yan sepet ve ödeme sayfasında gösterim', 'Ürün, kategori ve sepet tutarı koşulları', 'Sıralı kurallar ve en fazla 3 öneri'] },
  all_tools: { image: '/payments/tools/celebix-all-tools-v1.webp', benefit: 'İletişimden sepet önerilerine kadar beş aracı tek seferde edinin.', features: ['İletişim balonu ve WhatsApp sipariş', 'Sepet yakalama ve stok bildirimi', 'Sepet ve ödeme önerileri'] },
};
