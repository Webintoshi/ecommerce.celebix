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
import type { HomepageCurationSettings } from "@/lib/db/settings";

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

function normalizeKey(value?: string | null) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveHomepageCuratedProductIds(
  categorySlug: string,
  homepageCuration?: HomepageCurationSettings,
) {
  const categoryKey = normalizeKey(categorySlug);
  if (!categoryKey) {
    return [];
  }

  return (homepageCuration?.featuredProductIdsByCategory?.[categoryKey] || []).filter(Boolean);
}

function buildProductGroups(
  categories: HomepageCategory[],
  products: ShowcaseProduct[],
  homepageCuration?: HomepageCurationSettings,
) {
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

    const explicitFeaturedProductIds = resolveHomepageCuratedProductIds(
      category.slug,
      homepageCuration,
    );
    const explicitFeaturedProducts = explicitFeaturedProductIds
      .map((productId) =>
        categoryProducts.find((product) => product.id === productId && !usedProductIds.has(product.id)),
      )
      .filter((product): product is ShowcaseProduct => Boolean(product));
    const explicitFeaturedProductIdSet = new Set(
      explicitFeaturedProducts.map((product) => product.id),
    );

    const remainingProducts = categoryProducts.filter(
      (product) => !explicitFeaturedProductIdSet.has(product.id),
    );

    const selectedProducts = [...explicitFeaturedProducts, ...remainingProducts].slice(0, 4);
    selectedProducts.forEach((product) => usedProductIds.add(product.id));

    return {
      id: category.id,
      title: category.name,
      isCategoryDriven: true,
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
            <p className="section-eyebrow justify-center">{"Vitrin Haz\u0131r"}</p>
            <h2 className="section-title mt-4 text-[var(--store-ink)]">
              {"\u00dcr\u00fcnler geldik\u00e7e koleksiyon alanlar\u0131 otomatik dolacak"}
            </h2>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ProductShowcaseSections({
  categories = [],
  allProducts,
  homepageCuration,
  groupCopy,
  viewAllLabel = "T\u00fcm\u00fcn\u00fc G\u00f6r",
}: ProductShowcaseSectionsProps) {
  const { locale } = useStorefrontRoute();

  if (!Array.isArray(allProducts) || allProducts.length === 0) {
    return <EmptyShowcaseState />;
  }

  const groups = buildProductGroups(categories, allProducts, homepageCuration).filter((group) => group.products.length > 0);
  const fallbackGroups =
    groups.length > 0
      ? groups
      : [
          {
            id: "latest",
            title: "G\u00fcncel Se\u00e7imler",
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
    title:
      (group as { isCategoryDriven?: boolean }).isCategoryDriven
        ? group.title
        : groupCopy?.[index]?.title || group.title,
    subtitle: groupCopy?.[index]?.subtitle || "Se\u00e7ili Grup",
  }));

  return (
    <>
      {effectiveGroups.map((group, index) => (
        <section key={group.id} className={index === 0 ? "section-shell pt-0" : "section-shell"}>
          <div className="container-premium">
            <SectionHeader
              eyebrow={group.subtitle}
              title={group.title}
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
                  {"\u00dcr\u00fcn odakl\u0131 se\u00e7im"}
                </span>
                <span className="rounded-full border border-[var(--store-border)] bg-white px-4 py-2 text-xs font-semibold text-[var(--store-ink-soft)]">
                  {"Mobilde kolay tarama"}
                </span>
                <span className="rounded-full border border-[var(--store-border)] bg-white px-4 py-2 text-xs font-semibold text-[var(--store-ink-soft)]">
                  {"G\u00fcncel kategori ak\u0131\u015f\u0131"}
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
