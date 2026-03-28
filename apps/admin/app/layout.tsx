import type { Metadata } from "next";
import { Toaster } from "sonner";
import { getActiveStoreSlug, requireStoreConfig } from "@celebix/platform-config";
import "./globals.css";

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
      <body>
        {children}
        <Toaster position="top-right" theme="light" />
      </body>
    </html>
  );
}
