"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { Product } from "@/types/product";
import { ProductCard } from "@/components/product/ProductCard";
import type { HomepageCategory } from "@/lib/homepage";
import { ROUTES } from "@/lib/constants";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
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

function humanizeCategory(value?: string | null) {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
  const groups = categories.slice(0, 4).map((category, index) => {
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
      subtitle:
        index === 0
          ? "Gunun favorileri"
          : index === 1
            ? "Kahvalti cizgisi"
            : index === 2
              ? "Temiz tercih"
              : "Secki",
      isCategoryDriven: true,
      link: `/${category.slug}`,
      products: selectedProducts,
    };
  });

  const fallbackProducts = products.filter((product) => !usedProductIds.has(product.id));
  if (groups.some((group) => group.products.length > 0)) {
    return groups.map((group) => {
      if (group.products.length > 0) {
        return group;
      }

      const selectedFallbackProducts = fallbackProducts.splice(0, 4);
      selectedFallbackProducts.forEach((product) => usedProductIds.add(product.id));

      return {
        ...group,
        title: group.title || humanizeCategory(group.link),
        products: selectedFallbackProducts,
      };
    });
  }

  return [];
}

function EmptyShowcaseState() {
  return (
    <section className="pt-14 lg:pt-18">
      <div className="container-premium">
        <div className="surface-card px-6 py-12 text-center md:px-10">
          <span className="editorial-kicker">
            <Sparkles className="h-3.5 w-3.5" />
            Ezmeo vitrini
          </span>
          <h2 className="mt-5 text-[var(--foreground)]">Ilk urunler geldikce secki burada canlanacak.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[var(--muted-foreground)] md:text-base">
            Bu alan yayinlanan urunleri dogrudan koleksiyon bloklarina tasir. Gercek veri geldigi
            anda vitrinin sesi urun odakli sekilde netlesir.
          </p>
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
  viewAllLabel = "Tumunu kesfet",
}: ProductShowcaseSectionsProps) {
  const { locale } = useStorefrontRoute();

  if (!Array.isArray(allProducts) || allProducts.length === 0) {
    return <EmptyShowcaseState />;
  }

  const groups = buildProductGroups(categories, allProducts, homepageCuration);
  const fallbackGroups =
    groups.length > 0
      ? groups
      : [
          {
            id: "latest",
            title: "Yeni secilenler",
            subtitle: "Canli akıs",
            link: ROUTES.products,
            products: allProducts.slice(0, 4),
          },
          {
            id: "featured",
            title: "Cok satan ezmeler",
            subtitle: "Editoryal tercih",
            link: ROUTES.products,
            products: allProducts.slice(4, 8),
          },
        ].filter((group) => group.products.length > 0);

  const effectiveGroups = fallbackGroups.map((group, index) => ({
    ...group,
    title:
      (group as { isCategoryDriven?: boolean }).isCategoryDriven
        ? group.title || humanizeCategory(group.link)
        : groupCopy?.[index]?.title || group.title || humanizeCategory(group.link),
    subtitle: groupCopy?.[index]?.subtitle || group.subtitle,
  }));

  return (
    <>
      {effectiveGroups.map((group, index) => (
        <section key={group.id} className="pt-14 lg:pt-18">
          <div className="container-premium">
            <div className="surface-card overflow-hidden px-5 py-6 md:px-7 md:py-8 lg:px-8">
              <div className="mb-8 flex flex-col gap-5 border-b border-[var(--border)] pb-6 md:flex-row md:items-end md:justify-between">
                <div className="max-w-2xl">
                  <p className="editorial-kicker">
                    {group.subtitle}
                  </p>
                  <h2 className="mt-4 text-[var(--foreground)]">{group.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)] md:text-base">
                    {index === 0
                      ? "Urun kartlari daha sakin bir duzende, daha kuvvetli gorsel oranlarla ve daha temiz fiyat hiyerarsisi ile sunulur."
                      : "Kalabaligi azaltan ama secimi hizlandiran editorial bir koleksiyon akisina donusur."}
                  </p>
                </div>

                <Link
                  href={buildLocalizedPath(
                    group.link.startsWith("/") ? group.link : ROUTES.products,
                    locale,
                  )}
                  className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--foreground)] transition-colors hover:text-[var(--primary)]"
                >
                  {viewAllLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {group.products.slice(0, 4).map((product, productIndex) => (
                  <ProductCard key={product.id} product={product} index={productIndex} />
                ))}
              </div>
            </div>
          </div>
        </section>
      ))}
    </>
  );
}
