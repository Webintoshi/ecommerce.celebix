import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Celebix Owner Panel",
  description: "Tum e-ticaret projelerini tek panelden yonet."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
