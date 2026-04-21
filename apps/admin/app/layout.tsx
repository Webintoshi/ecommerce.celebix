import type { Metadata, Viewport } from "next";
import { Inter, Lora } from "next/font/google";
import { Toaster } from "sonner";
import { getActiveStoreSlug, requireStoreConfig } from "@celebix/platform-config";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin", "latin-ext"],
  variable: "--font-lora",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export function generateMetadata(): Metadata {
  let storeName = STORE_RUNTIME.name;

  try {
    storeName = requireStoreConfig(getActiveStoreSlug()).name;
  } catch (error) {
    console.error("Admin metadata store config fallback:", error);
  }

  return {
    title: {
      default: `${storeName} Admin`,
      template: `%s | ${storeName} Admin`,
    },
    description: `${storeName} için ortak admin panel çekirdeği`,
    applicationName: `${storeName} Admin`,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: `${storeName} Admin`,
      statusBarStyle: "default",
    },
    robots: {
      index: false,
      follow: false,
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#FE6100",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body className={`${inter.variable} ${lora.variable} font-sans`}>
        {children}
        <Toaster position="top-right" theme="light" />
      </body>
    </html>
  );
}
