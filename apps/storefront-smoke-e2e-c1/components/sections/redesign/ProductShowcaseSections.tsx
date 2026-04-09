"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Product } from "@/types/product";
import { ProductCard } from "@/components/product/ProductCard";
import { ROUTES } from "@/lib/constants";

const PRODUCT_GROUPS = [
  { id: "featured", title: "Çok Satanlar", subtitle: "Seçili Koleksiyon", offset: 0 },
  { id: "editorial", title: "Öne Çıkanlar", subtitle: "Editör Seçimi", offset: 4 },
  { id: "new", title: "Yeni Gelenler", subtitle: "Taze Seçki", offset: 8 },
  { id: "complements", title: "Tamamlayıcılar", subtitle: "Kombinini Kur", offset: 12 },
] as const;

interface ProductShowcaseSectionsProps {
  allProducts: Product[];
  groupCopy?: Array<{
    title: string;
    subtitle: string;
  }>;
  viewAllLabel?: string;
}

export function ProductShowcaseSections({
  allProducts,
  groupCopy,
  viewAllLabel = "Tümünü Gör",
}: ProductShowcaseSectionsProps) {
  if (!Array.isArray(allProducts) || allProducts.length === 0) {
    return null;
  }

  return (
    <>
      {PRODUCT_GROUPS.map((group, index) => {
        const products = allProducts.slice(group.offset, group.offset + 4);

        if (products.length === 0) {
          return null;
        }

        const copy = groupCopy?.[index];

        return (
          <section key={group.id} className="bg-[#F8F8F8F8] py-16 lg:py-20">
            <div className="container-premium">
              <div className="mb-12 flex items-end justify-between">
                <div>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                    {copy?.subtitle || group.subtitle}
                  </span>
                  <h2 className="text-3xl font-bold text-neutral-900 sm:text-4xl">
                    {copy?.title || group.title}
                  </h2>
                </div>

                <Link
                  href={ROUTES.products}
                  className="group hidden items-center gap-2 text-sm font-medium text-neutral-700 transition-colors hover:text-neutral-900 sm:inline-flex"
                >
                  {viewAllLabel}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4 lg:gap-8">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              <div className="mt-10 flex justify-center sm:hidden">
                <Link
                  href={ROUTES.products}
                  className="inline-flex items-center gap-2 text-sm font-medium text-neutral-700 transition-colors hover:text-neutral-900"
                >
                  {viewAllLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
