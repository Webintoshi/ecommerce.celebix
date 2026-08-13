import type { Metadata } from "next";

import { CartPageClient } from "@/components/CartPageClient";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export const metadata: Metadata = {
  title: "Sepet",
  robots: { index: false, follow: false },
};

export default async function CartPage() {
  const { storefront, design } = requireStorefrontPage(await resolveStorefrontPage());
  return (
    <StorefrontFrame storefront={storefront} design={design}>
      <section className="store-section store-container">
        <h1 className="sr-only">Sepet</h1>
        <CartPageClient locale={storefront.locale} />
      </section>
    </StorefrontFrame>
  );
}
