import type { Metadata } from "next";

import { FavoritesPageClient } from "@/components/FavoritesPageClient";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export const metadata: Metadata = {
  title: "Favoriler",
  robots: { index: false, follow: false },
};

export default async function FavoritesPage() {
  const { storefront, design } = requireStorefrontPage(await resolveStorefrontPage());
  return (
    <StorefrontFrame storefront={storefront} design={design}>
      <section className="listing-hero">
        <div className="store-container">
          <span>SEÇTİKLERİNİZ</span>
          <h1>Favoriler</h1>
          <p>Bu tarayıcıda kaydettiğiniz güncel ürünler.</p>
        </div>
      </section>
      <section className="store-section store-container">
        <FavoritesPageClient
          cardStyle={storefront.presentation.theme.productCardStyle}
          imageRatio={storefront.presentation.theme.productImageRatio}
        />
      </section>
    </StorefrontFrame>
  );
}
