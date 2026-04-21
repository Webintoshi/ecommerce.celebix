import type { MetadataRoute } from "next";
import { STORE_RUNTIME } from "@/lib/store-runtime";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: `${STORE_RUNTIME.name} Admin`,
        short_name: "Celebix Admin",
        description: `${STORE_RUNTIME.name} için mobil uyumlu yönetim paneli`,
        start_url: "/admin",
        display: "standalone",
        background_color: "#f6efe8",
        theme_color: "#FE6100",
        orientation: "portrait",
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
    };
}
