"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { Product } from "@/types/product";
import { ProductCard } from "@/components/product/ProductCard";
import type { HomepageCategory } from "@/lib/homepage";
import { ROUTES } from "@/lib/constants";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import type { HomepageCurationSettings } from "@/lib/db/settings";
import { DefaultDemoPlaceholder } from "@/components/placeholders/DefaultDemoPlaceholder";
import { DEFAULT_DEMO_PRODUCT_CARDS } from "@/lib/default-demo-theme";

type ShowcaseProduct = Product & {
  category?: string | null;
  subcategory?: string | null;
  is_featured?: boolean;
};

interface ProductShowcaseSectionsProps {
  categories?: HomepageCategory[];
  allProducts: ShowcaseProduct[];
  homepageCuration?: HomepageCurationSettings;
  groupCopy?: Array<{
    title: string;
    subtitle: string;
  }>;
  viewAllLabel?: string;
}

function EmptyShowcaseState() {
  return (
    <section className="bg-white py-16 lg:py-20">
      <div className="container-premium">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-lg border border-[#22C55E]/25 bg-[#ECFDF5] px-4 py-2 text-[11px] font-semibold uppercase text-[#166534]">
            <Sparkles className="h-3.5 w-3.5" />
            Hemenaku kataloğu
          </span>
          <h2 className="mt-5 text-3xl font-semibold text-[#0B1220] sm:text-4xl">
            Ürünler hazırlanıyor
          </h2>
          <p className="mt-4 text-sm leading-7 text-[#526176] sm:text-[15px]">
            Çok yakında Hemenaku ürün kataloğu burada olacak. Gerçek ürünler yayınlandığında fiyat, stok ve detay sayfaları canlı veriden görünecek.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {DEFAULT_DEMO_PRODUCT_CARDS.map((card) => (
            <div
              key={card.id}
              className="overflow-hidden rounded-lg border border-[#D7DEE8] bg-white shadow-sm"
            >
              <div className="aspect-square">
                <DefaultDemoPlaceholder id={card.placeholder} label={card.title} compact />
              </div>
              <div className="p-5 text-center">
                <p className="text-[11px] font-semibold uppercase text-[#16A34A]">
                  {card.eyebrow}
                </p>
                <h3 className="mt-3 text-base font-semibold text-[#0B1220] sm:text-lg">{card.title}</h3>
                <p className="mt-3 text-xs leading-6 text-[#526176] sm:text-sm">{card.description}</p>
                <p className="mt-4 text-sm font-semibold text-[#B45309]">{card.priceLabel}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-9 text-center">
          <Link
            href={ROUTES.products}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0F172A] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1E293B]"
          >
            Ürünleri İncele
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function ProductShowcaseSections({
  allProducts,
  viewAllLabel = "Tümünü Gör",
}: ProductShowcaseSectionsProps) {
  const { buildPath } = useStorefrontRoute();

  if (!Array.isArray(allProducts) || allProducts.length === 0) {
    return <EmptyShowcaseState />;
  }

  const featuredProducts = allProducts.slice(0, 10);

  return (
    <section className="bg-white py-12 lg:py-16">
      <div className="container-premium">
        <div className="mb-7 flex items-end justify-between gap-5 lg:mb-9">
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase text-[#0F766E]">
              Vitrin
            </span>
            <h2 className="text-3xl font-semibold text-[#0B1220] sm:text-4xl">
              Öne Çıkan Ürünler
            </h2>
          </div>

          <Link
            href={buildPath(ROUTES.products)}
            className="group hidden items-center gap-2 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-2 text-sm font-semibold text-[#0B1220] transition hover:border-[#22C55E] hover:text-[#166534] sm:inline-flex"
          >
            {viewAllLabel}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5 lg:gap-5">
          {featuredProducts.map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} />
          ))}
        </div>

        <div className="mt-8 text-center sm:hidden">
          <Link
            href={buildPath(ROUTES.products)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#0F172A] px-5 py-3 text-sm font-semibold text-white"
          >
            {viewAllLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
