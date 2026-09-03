import type { Metadata } from "next";

import { CartPageClient } from "@/components/CartPageClient";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export const metadata: Metadata = {
  title: "Sepet",
  robots: { index: false, follow: false },
};

export default async function CartPage({ searchParams }: Readonly<{ searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>> }>) {
  const { storefront, design } = requireStorefrontPage(await resolveStorefrontPage());
  const query = await searchParams;
  const recovered = query.recovered === "1";
  const omitted = typeof query.omitted === "string" && /^\d{1,3}$/.test(query.omitted) ? Number(query.omitted) : 0;
  return (
    <StorefrontFrame storefront={storefront} design={design}>
      <section className="store-section store-container">
        <h1 className="sr-only">Sepet</h1>
        <CartPageClient locale={storefront.locale} recovered={recovered} omittedItems={omitted} />
      </section>
    </StorefrontFrame>
  );
}
