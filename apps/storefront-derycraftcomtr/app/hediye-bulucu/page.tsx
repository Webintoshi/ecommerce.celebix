import { GiftFinderExperience } from "@/components/gift-finder/GiftFinderExperience";
import { getRequestLocale } from "@/lib/request-locale";
import { getAllProducts } from "@/lib/products";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getStorefrontProfile } from "@/lib/storefront-profile";
import { translateProductCollection } from "@/lib/translation";
import type { Product } from "@/types/product";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();

  return buildStorePageMetadata({
    locale,
    pathname: "/hediye-bulucu",
    title: `Hediye Bulucu | ${profile.name}`,
    description:
      "Kime, hangi bütçe ve hangi özel gün için hediye aradığınızı seçin. DeryCraft el yapımı deri cüzdan, saat kayışı ve aksesuar önerilerini keşfedin.",
    keywords: [
      "deri hediye",
      "hediye bulucu",
      "el yapımı deri hediye",
      "apple watch kayış hediye",
      "deri cüzdan hediye",
      "DeryCraft hediye",
    ],
  });
}

export default async function GiftFinderPage() {
  const locale = await getRequestLocale();
  const products = await getAllProducts();
  const translatedProducts = (await translateProductCollection(
    products as Array<Record<string, unknown>>,
    locale,
  )) as Product[];

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <div className="container-premium py-8 sm:py-10 lg:py-12">
        <GiftFinderExperience products={translatedProducts} />
      </div>
    </div>
  );
}
