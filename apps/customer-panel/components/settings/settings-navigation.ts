export const SETTINGS_GROUPS = [
  { title: "Mağaza", illustration: "store", items: [
    { href: "/settings/general", label: "Genel", description: "Mağaza bilgileri", icon: "store" },
    { href: "/settings/domains", label: "Alan Adı", description: "Adresler ve bağlantı durumu", icon: "globe" },
    { href: "/settings/language", label: "Dil", description: "Varsayılan ve etkin diller", icon: "language" },
    { href: "/settings/administrators", label: "Yöneticiler", description: "Ekip ve yetkiler", icon: "users" },
  ] },
  { title: "Satış ve teslimat", illustration: "commerce", items: [
    { href: "/settings/payment", label: "Ödeme", description: "Yöntemler ve sağlayıcılar", icon: "card" },
    { href: "/settings/pricing", label: "Fiyatlandırma", description: "Kur ve altın referansları", icon: "tags" },
    { href: "/settings/shipping", label: "Kargo", description: "Gönderici ve kargo bağlantısı", icon: "truck" },
  ] },
  { title: "İletişim ve otomasyon", illustration: "communication", items: [
    { href: "/settings/notifications", label: "Bildirimler", description: "Sipariş e-postaları", icon: "bell" },
    { href: "/settings/analytics", label: "Analitik ve sepet", description: "Ölçüm ve terk edilen sepetler", icon: "chart" },
    { href: "/settings/artificial-intelligence", label: "Yapay Zeka", description: "Toshi ve sağlayıcı bağlantıları", icon: "sparkles" },
  ] },
  { title: "Görünüm", illustration: "design", items: [
    { href: "/settings/design", label: "Tasarım", description: "Vitrin, stil ve görseller", icon: "palette" },
    { href: "/settings/store-tools", label: "Mağaza araçları", description: "İletişim ve stok bildirimleri", icon: "settings" },
  ] },
] as const;

export const SETTINGS_DESTINATIONS = SETTINGS_GROUPS.flatMap((group) => [...group.items]);
