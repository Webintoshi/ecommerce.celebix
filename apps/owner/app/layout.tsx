import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Celebix Panel",
  description: "Celebix E-ticaret owner control plane"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
