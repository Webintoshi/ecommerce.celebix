import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import { Toaster } from "sonner";
import { getActiveStoreSlug, requireStoreConfig } from "@celebix/platform-config";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export function generateMetadata(): Metadata {
  const store = requireStoreConfig(getActiveStoreSlug());

  return {
    title: `${store.name} Admin`,
    description: `${store.name} icin ortak admin panel cekirdegi`
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body className={`${inter.variable} ${lora.variable}`}>
        {children}
        <Toaster position="top-right" theme="light" />
      </body>
    </html>
  );
}
