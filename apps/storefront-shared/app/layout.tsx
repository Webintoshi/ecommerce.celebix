import type { Metadata } from "next";
import { headers } from "next/headers";

import { StorefrontAnalyticsTracker } from "../components/StorefrontAnalyticsTracker.tsx";
import { resolveStorefrontPage } from "../lib/page-context.ts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Celebix Mağaza",
  description: "Celebix ortak mağaza deneyimi",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [page, requestHeaders] = await Promise.all([resolveStorefrontPage(), headers()]);
  const tracker = page.kind === "active" ? page.context.tracker : null;
  const locale = page.kind === "active" ? page.context.storefront.locale : "tr";
  const nonce = requestHeaders.get("x-nonce") ?? "";
  return (
    <html lang={locale}>
      <body>
        {children}
        {tracker && nonce ? <StorefrontAnalyticsTracker {...tracker} nonce={nonce} /> : null}
      </body>
    </html>
  );
}
