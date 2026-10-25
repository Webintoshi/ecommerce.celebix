import type { Metadata } from "next";
import { panelFont } from "../lib/panel-font";
import "./globals.css";

export const metadata: Metadata = {
  title: "Celebix Müşteri Paneli",
  description: "Celebix mağaza yönetim paneli",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={panelFont.variable}>
      <body>{children}</body>
    </html>
  );
}
