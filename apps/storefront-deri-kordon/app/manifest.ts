import type { MetadataRoute } from "next";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: STOREFRONT_RUNTIME.name,
    short_name: STOREFRONT_RUNTIME.name,
    description: STOREFRONT_RUNTIME.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F8F4EE",
    theme_color: "#17110B",
    categories: ["shopping", "lifestyle"],
    icons: [
      {
        src: "/logo.webp",
        sizes: "512x512",
        type: "image/webp",
      },
      {
        src: "/icons/default-favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
    shortcuts: [
      {
        name: "Products",
        short_name: "Products",
        url: "/urunler",
      },
      {
        name: "Stores",
        short_name: "Stores",
        url: "/magazalarimiz",
      },
      {
        name: "Contact",
        short_name: "Contact",
        url: "/iletisim",
      },
    ],
  };
}
