import type { MetadataRoute } from "next";
import { STORE_RUNTIME } from "@/lib/store-runtime";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/admin",
    name: `${STORE_RUNTIME.name} Admin`,
    short_name: "Celebix Admin",
    description: `${STORE_RUNTIME.name} için mobil odaklı yönetim paneli`,
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    display_override: ["standalone", "browser"],
    background_color: "#f6efe8",
    theme_color: "#FE6100",
    orientation: "portrait",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/pwa/admin-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/pwa/admin-icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Siparişler",
        short_name: "Sipariş",
        description: "Bekleyen ve yeni siparişleri aç",
        url: "/admin/siparisler",
      },
      {
        name: "Ürünler",
        short_name: "Ürün",
        description: "Katalog ve stok ekranını aç",
        url: "/admin/urunler",
      },
      {
        name: "Bildirimler",
        short_name: "Bildirim",
        description: "Bildirim ayarlarını aç",
        url: "/admin/ayarlar/bildirimler",
      },
    ],
  };
}
