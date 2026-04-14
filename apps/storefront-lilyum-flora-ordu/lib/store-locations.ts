export interface StoreLocation {
  id: string;
  name: string;
  city: string;
  badge: string;
  summary: string;
  address: string;
  phone: string;
  email: string;
  hours: string;
  mapUrl: string;
  images: string[];
}

export const STORE_LOCATIONS: StoreLocation[] = [
  {
    id: "studio",
    name: "Merkez Stüdyo",
    city: "İstanbul",
    badge: "Atölye & Deneyim",
    summary:
      "Mağaza adresinizi, çalışma saatlerinizi ve destek kanallarınızı adminden girdiğinizde bu alan otomatik olarak markanıza özel bir deneyim kartına dönüşür.",
    address: "Adres bilgisi mağaza ayarlarında tamamlandığında burada gösterilir.",
    phone: "+90 545 628 41 52",
    email: "destek@magazaadi.com",
    hours: "Pzt - Cmt / 10:00 - 19:00",
    mapUrl: "https://www.google.com/maps",
    images: [
      "/placeholders/promo-banner-1.svg",
      "/placeholders/promo-banner-2.svg",
      "/placeholders/promo-banner-3.svg",
    ],
  },
  {
    id: "showroom",
    name: "Showroom",
    city: "Ankara",
    badge: "Koleksiyon Sunumu",
    summary:
      "Fiziksel temas noktalarınızı, showroom veya teslimat ofisi gibi farklı kullanım senaryolarıyla bu starter yapı içinde sergileyebilirsiniz.",
    address: "İkinci lokasyon bilgisi eklendiğinde burada otomatik görünür.",
    phone: "+90 555 000 00 01",
    email: "iletisim@magazaadi.com",
    hours: "Pzt - Cmt / 10:00 - 19:00",
    mapUrl: "https://www.google.com/maps",
    images: ["/placeholder.svg"],
  },
];
