import type { Metadata } from "next";

import { CartPageClient } from "@/components/CartPageClient";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export const metadata: Metadata = { title: "Sepet", robots: { index: false, follow: false } };

export default async function CartPage() {
  const { storefront } = requireStorefrontPage(await resolveStorefrontPage());
  return <StorefrontFrame storefront={storefront}><section className="listing-hero"><div className="store-container"><span>ALIŞVERİŞİNİZ</span><h1>Sepet</h1><p>Ürünlerinizi ve güncel toplamları kontrol edin.</p></div></section><section className="store-section store-container"><CartPageClient /></section></StorefrontFrame>;
}
