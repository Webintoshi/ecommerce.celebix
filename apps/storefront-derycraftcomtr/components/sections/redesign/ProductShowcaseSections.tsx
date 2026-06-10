"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { Product } from "@/types/product";
import { ProductCard } from "@/components/product/ProductCard";
import type { HomepageCategory } from "@/lib/homepage";
import { ROUTES } from "@/lib/constants";
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
      title: "Ürünleri Yayınlayın",
      text: "Admin panelinde yayınlanan ürünler bu kategori bazlı storefront bloklarına otomatik akar.",
    },
    {
      title: "Sıralamayı Kullanın",
      text: "Admin panelinde verdiğiniz ürün sıralaması storefront vitrin bloklarında korunur.",
    },
    {
      title: "Kategorileri Tamamlayın",
      text: "Aktif kategoriler storefront bölüm başlıklarına ve koleksiyon linklerine otomatik dönüşür.",
    },
  ];

  return (
    <section className="bg-[#F8F8F8F8] py-16 lg:py-20">
      <div className="container-premium">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#C7A985] bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8A6847]">
            <Sparkles className="h-3.5 w-3.5" />
            Vitrin Hazır
          </span>
          <h2 className="mt-5 text-[1.85rem] font-semibold tracking-[-0.03em] text-[#18110B] sm:text-[2.2rem]">
            DeryCraft ürünleri yayınlandıkça bu alan otomatik dolacak
          </h2>
          <p className="mt-4 text-sm leading-7 text-[#6B5A4D] sm:text-[15px]">
            Admin panelinde yönetilen ürünler ve kategoriler storefront düzenine doğrudan bağlanır.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.title}
              className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_24px_60px_-44px_rgba(41,24,15,0.45)]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8A6847]">
                Otomatik
              </p>
              <h3 className="mt-3 text-xl font-semibold text-[#18110B]">{card.title}</h3>
              <p className="mt-3 text-sm leading-7 text-[#6B5A4D]">{card.text}</p>
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
  viewAllLabel = "Tümünü Gör",
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
            subtitle: "Canlı Seçki",
            link: ROUTES.products,
            products: allProducts.slice(0, 4),
          },
          {
            id: "featured",
            title: "Öne Çıkanlar",
            subtitle: "Editör Seçimi",
            link: ROUTES.products,
            products: allProducts.slice(4, 8),
          },
        ].filter((group) => group.products.length > 0);

  const effectiveGroups = fallbackGroups.map((group, index) => ({
    ...group,
    title: groupCopy?.[index]?.title || group.title || humanizeCategory(group.link),
    subtitle: groupCopy?.[index]?.subtitle || group.subtitle,
  }));

  return (
    <>
      {effectiveGroups.map((group) => (
        <section key={group.id} className="bg-[#F8F8F8F8] py-12 sm:py-16 lg:py-20">
          <div className="container-premium">
            <div className="mb-6 flex items-end justify-between gap-3 sm:mb-10 sm:gap-6 lg:mb-12">
              <div className="min-w-0 flex-1">
                <span className="home-section-eyebrow mb-1.5 block sm:mb-2">
                  {group.subtitle}
                </span>
                <h2 className="home-section-heading font-bold">{group.title}</h2>
              </div>

              <Link
                href={buildPath(group.link.startsWith("/") ? group.link : ROUTES.products)}
                className="group inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-neutral-700 transition-colors hover:text-neutral-900 sm:gap-2 sm:text-sm"
              >
                {viewAllLabel}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1 sm:h-4 sm:w-4" />
              </Link>
            </div>

            <div className="home-product-carousel lg:hidden">
              <div className="flex snap-x snap-mandatory gap-3 pb-1 sm:gap-4">
                {group.products.slice(0, 8).map((product) => (
                  <div
                    key={product.id}
                    className="w-[72%] shrink-0 snap-start sm:w-[46%] md:w-[38%]"
                  >
                    <ProductCard product={product} />
                  </div>
                ))}
              </div>
            </div>

            <div className="hidden grid-cols-4 gap-x-8 gap-y-12 lg:grid">
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
