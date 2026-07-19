import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Celebix Mağaza", description: "Celebix ortak mağaza deneyimi", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="tr"><body>{children}</body></html>; }
