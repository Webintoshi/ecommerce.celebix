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
    id: "giresun",
    name: "Giresun Store",
    city: "Giresun",
    badge: "Workshop & Showroom",
    summary:
      "Explore genuine leather collections, production details and custom order options in one place.",
    address: "Bulancak Mahallesi, Fatih Caddesi 29/A, Giresun",
    phone: "+90 (507) 559-7228",
    email: "bilgi@derycraft.com",
    hours: "09:00 - 19:00",
    mapUrl:
      "https://www.google.com/maps/place/DeryCraft/@40.9678798,37.9051515,12z/data=!4m7!3m6!1s0x4063157ce489eef5:0xf933e5195fdfbf2a!8m2!3d40.9394346!4d38.2332595!15sChFEZXJ5Q3JhZnQgTUFSxLBOT0",
    images: [
      "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Ma%C4%9Fazalar/ana-sayfa-magazalarimiz.webp",
      "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Ma%C4%9Fazalar/atolye.webp",
      "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Ma%C4%9Fazalar/giresun.webp",
    ],
  },
  {
    id: "ordu",
    name: "Ordu Store",
    city: "Ordu",
    badge: "Marinoport",
    summary:
      "Experience Apple Watch bands and everyday leather accessories in a calm retail setting.",
    address: "Düz Mahalle, Süleyman Felek Caddesi No: 330, Ordu",
    phone: "+90 (507) 559-7228",
    email: "bilgi@derycraft.com",
    hours: "09:00 - 19:00",
    mapUrl:
      "https://www.google.com/maps/place/DeryCraft+Marinoport/@40.9394052,38.1534343,12z/data=!4m7!3m6!1s0x406319df7dc533f3:0x883042e872d75b52!8m2!3d40.9678798!4d38.0575868!15sChFEZXJ5Q3JhZnQgTUFSxLBOT5IBE2xlYXRoZXJfZ29vZHNfc3RvcmWqAVQKDS9nLzExeTRrd2I3NnQQASoKIgZtYXJpbm8oITIfEAEiG8nsL1AhMVfVyZGXb_49VvEBNZFCETTh7OsNRTIUEAIiEGRlcnljcmFmdCBtYXJpbm_gAQA",
    images: [
      "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Ma%C4%9Fazalar/ordu-2048x2048.webp",
    ],
  },
];
