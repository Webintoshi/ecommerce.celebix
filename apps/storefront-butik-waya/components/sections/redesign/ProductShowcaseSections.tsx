"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import { ProductCard } from "@/components/product/ProductCard";
import { ROUTES } from "@/lib/constants";
import type { HomepageCurationSettings } from "@/lib/db/settings";
import type { HomepageCategory } from "@/lib/homepage";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import type { Product } from "@/types/product";

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
        categoryProducts.find(
          (product) => product.id === productId && !usedProductIds.has(product.id),
        ),
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
          ? "Seçili Koleksiyon"
          : index === 1
            ? "Öne Çıkanlar"
            : index === 2
              ? "Editörden"
              : "Keşfet",
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
  const cards = [
    {
      title: "Vitrin hazır",
      text: "Yayına giren ürünler burada otomatik olarak görünür.",
    },
    {
      title: "Kategori akışı korunur",
      text: "Bloklar ilgili kategoriyle birlikte vitrine taşınır.",
    },
    {
      title: "Butik hissi korunur",
      text: "Ürün sayısı arttıkça düzen aynı çizgide kalır.",
    },
  ];

  return (
    <section className="py-16 lg:py-20">
      <div className="container-premium">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(26,26,26,0.1)] bg-white/70 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#6f6a65]">
            <Sparkles className="h-3.5 w-3.5" />
            Vitrin hazır
          </span>
          <h2 className="mt-5 font-serif text-4xl leading-[0.95] tracking-[-0.04em] text-[#1d1715] sm:text-5xl">
            Ürünler geldikçe vitrin şekillenecek
          </h2>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.title}
              className="rounded-[2rem] border border-[rgba(26,26,26,0.08)] bg-[rgba(255,255,255,0.9)] p-6 shadow-[0_24px_70px_-50px_rgba(0,0,0,0.24)]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#6f6a65]">
                Otomatik
              </p>
              <h3 className="mt-4 font-serif text-3xl leading-none tracking-[-0.04em] text-[#1d1715]">
                {card.title}
              </h3>
              <p className="mt-4 text-sm leading-7 text-[#5f524a]">{card.text}</p>
            </div>
          ))}
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
  viewAllLabel = "Tümünü gör",
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
            title: "Yeni gelenler",
            subtitle: "Seçki",
            link: ROUTES.products,
            products: allProducts.slice(0, 4),
          },
          {
            id: "featured",
            title: "Öne çıkanlar",
            subtitle: "Editör seçimi",
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
        <section key={group.id} className={`py-16 lg:py-20 ${index % 2 === 1 ? "bg-white/40" : ""}`}>
          <div className="container-premium">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <SectionHeading label={group.title} />

              <Link
                href={buildLocalizedPath(
                  group.link.startsWith("/") ? group.link : ROUTES.products,
                  locale,
                )}
                className="group inline-flex items-center gap-2 rounded-full border border-[rgba(26,26,26,0.12)] bg-white/78 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#000000] backdrop-blur hover:border-[#000000] hover:text-[#000000]"
              >
                {viewAllLabel}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-8">
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
