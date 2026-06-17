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
          ? "Secili Koleksiyon"
          : index === 1
            ? "One Cikanlar"
            : index === 2
              ? "Editorden"
              : "Kesfet",
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
    <section className="bg-white py-16 lg:py-20">
      <div className="container-premium">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#0F766E]/20 bg-[#F0FDFA] px-4 py-2 text-[11px] font-semibold uppercase text-[#0F766E]">
            <Sparkles className="h-3.5 w-3.5" />
            Hemenaku Vitrini
          </span>
          <h2 className="mt-5 text-3xl font-semibold text-[#111827] sm:text-4xl">
            Yeni secimler icin temiz ve guven veren vitrin
          </h2>
          <p className="mt-4 text-sm leading-7 text-[#526B66] sm:text-[15px]">
            Urunler yayina alindikca bu alan canli fiyat, stok ve detay sayfalariyla dolar.
            Bu arada ziyaretci vitrin rotalarini ve destek kanallarini rahatca bulur.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {DEFAULT_DEMO_PRODUCT_CARDS.map((card) => (
            <div
              key={card.id}
              className="overflow-hidden rounded-lg border border-[#DDE7E4] bg-white shadow-sm"
            >
              <div className="aspect-square">
                <DefaultDemoPlaceholder id={card.placeholder} label={card.title} compact />
              </div>
              <div className="p-5 text-center">
                <p className="text-[11px] font-semibold uppercase text-[#0F766E]">
                  {card.eyebrow}
                </p>
                <h3 className="mt-3 text-base font-semibold text-[#111827] sm:text-lg">{card.title}</h3>
                <p className="mt-3 text-xs leading-6 text-[#526B66] sm:text-sm">{card.description}</p>
                <p className="mt-4 text-sm font-semibold text-[#EA580C]">{card.priceLabel}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-9 text-center">
          <Link
            href={ROUTES.products}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0F766E] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#115E59]"
          >
            Tum urunleri kesfet
            <ArrowRight className="h-4 w-4" />
          </Link>
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
  viewAllLabel = "Tumunu Gor",
}: ProductShowcaseSectionsProps) {
  const { buildPath } = useStorefrontRoute();

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
            title: "Yeni Gelenler",
            subtitle: "Canli Secki",
            link: ROUTES.products,
            products: allProducts.slice(0, 4),
          },
          {
            id: "featured",
            title: "One Cikanlar",
            subtitle: "Editor Secimi",
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
      {effectiveGroups.map((group) => (
        <section key={group.id} className="bg-[#F7FAF9] py-16 lg:py-20">
          <div className="container-premium">
            <div className="mb-12 flex items-end justify-between gap-6">
              <div>
                <span className="mb-2 block text-xs font-semibold uppercase text-[#0F766E]">
                  {group.subtitle}
                </span>
                <h2 className="text-3xl font-semibold text-[#111827] sm:text-4xl">
                  {group.title}
                </h2>
              </div>

              <Link
                href={buildPath(group.link.startsWith("/") ? group.link : ROUTES.products)}
                className="group hidden items-center gap-2 text-sm font-semibold text-[#0F766E] transition-colors hover:text-[#115E59] sm:inline-flex"
              >
                {viewAllLabel}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
              {group.products.slice(0, 4).map((product, index) => (
                <ProductCard key={product.id} product={product} index={index} />
              ))}
            </div>
          </div>
        </section>
      ))}
    </>
  );
}
