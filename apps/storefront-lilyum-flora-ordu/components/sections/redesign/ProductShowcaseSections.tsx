"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { Product } from "@/types/product";
import { ProductCard } from "@/components/product/ProductCard";
import type { HomepageCategory } from "@/lib/homepage";
import { ROUTES } from "@/lib/constants";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { SectionHeader } from "./SectionHeader";

type ShowcaseProduct = Product & {
  category?: string | null;
  subcategory?: string | null;
};

interface ProductShowcaseSectionsProps {
  categories?: HomepageCategory[];
  allProducts: ShowcaseProduct[];
  groupCopy?: Array<{
    title: string;
    subtitle: string;
  }>;
  viewAllLabel?: string;
}

function normalizeKey(value?: string | null) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildProductGroups(categories: HomepageCategory[], products: ShowcaseProduct[]) {
  const usedProductIds = new Set<string>();

  return categories.slice(0, 4).map((category) => {
    const categoryKey = normalizeKey(category.slug);
    const categoryProducts = products.filter((product) => {
      const productCategory = normalizeKey(product.category);
      const productSubcategory = normalizeKey(product.subcategory);

      return (
        !usedProductIds.has(product.id) &&
        (productCategory === categoryKey || productSubcategory === categoryKey)
      );
    });

    const selectedProducts = categoryProducts.slice(0, 4);
    selectedProducts.forEach((product) => usedProductIds.add(product.id));

    return {
      id: category.id,
      title: category.name,
      link: `/${category.slug}`,
      products: selectedProducts,
    };
  });
}

function EmptyShowcaseState() {
  return (
    <section className="section-shell">
      <div className="container-premium">
        <div className="soft-panel px-6 py-10 text-center sm:px-8 sm:py-12">
          <div className="mx-auto max-w-2xl">
            <p className="section-eyebrow justify-center">Vitrin Hazir</p>
            <h2 className="section-title mt-4 text-[var(--store-ink)]">
              Urunler geldikce koleksiyon alanlari otomatik dolacak
            </h2>
            <p className="section-copy mt-4">
              Admin panelindeki yayinli urunler ve aktif kategoriler, bu bolumde ek frontend mantigi gerektirmeden premium merchandising bloklarina donusur.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ProductShowcaseSections({
  categories = [],
  allProducts,
  groupCopy,
  viewAllLabel = "Tumunu Gor",
}: ProductShowcaseSectionsProps) {
  const { locale } = useStorefrontRoute();

  if (!Array.isArray(allProducts) || allProducts.length === 0) {
    return <EmptyShowcaseState />;
  }

  const groups = buildProductGroups(categories, allProducts).filter((group) => group.products.length > 0);
  const fallbackGroups =
    groups.length > 0
      ? groups
      : [
          {
            id: "latest",
            title: "Guncel Secimler",
            link: ROUTES.products,
            products: allProducts.slice(0, 4),
          },
          {
            id: "premium",
            title: "Premium Aranjmanlar",
            link: ROUTES.products,
            products: allProducts.slice(4, 8),
          },
        ].filter((group) => group.products.length > 0);

  const effectiveGroups = fallbackGroups.map((group, index) => ({
    ...group,
    title: groupCopy?.[index]?.title || group.title,
    subtitle: groupCopy?.[index]?.subtitle || "Secili Grup",
  }));

  return (
    <>
      {effectiveGroups.map((group, index) => (
        <section key={group.id} className={index === 0 ? "section-shell pt-0" : "section-shell"}>
          <div className="container-premium">
            <SectionHeader
              eyebrow={group.subtitle}
              title={group.title}
              description="Temiz kart yapisi, net fiyat hiyerarsisi ve hizli urun kesfi ile hazir merchandising satiri."
              action={
                <Link
                  href={buildLocalizedPath(
                    group.link.startsWith("/") ? group.link : ROUTES.products,
                    locale,
                  )}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--store-accent)] transition hover:text-[var(--store-accent-strong)]"
                >
                  {viewAllLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              }
            />

            {index === 0 ? (
              <div className="mb-5 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--store-border)] bg-white px-4 py-2 text-xs font-semibold text-[var(--store-ink-soft)]">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--store-accent)]" />
                  Urun odakli secim
                </span>
                <span className="rounded-full border border-[var(--store-border)] bg-white px-4 py-2 text-xs font-semibold text-[var(--store-ink-soft)]">
                  Mobilde kolay tarama
                </span>
                <span className="rounded-full border border-[var(--store-border)] bg-white px-4 py-2 text-xs font-semibold text-[var(--store-ink-soft)]">
                  Guncel kategori akisi
                </span>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-5">
              {group.products.slice(0, 4).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      ))}
    </>
  );
}
