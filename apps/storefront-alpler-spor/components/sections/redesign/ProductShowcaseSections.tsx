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
      title: "Ürünleri Yayına Al",
      text: "Alpler Spor panelinde yayınlanan ürünler kategori bazlı vitrine doğrudan taşınır.",
    },
    {
      title: "Satış Sırası Kur",
      text: "Çok satanlar, yeni sezon ve kampanya ürünleri vitrinde daha güçlü hiyerarşi kazanır.",
    },
    {
      title: "Kategori Kurgusunu Tamamla",
      text: "Aktif kategoriler antrenman, outdoor ve ekipman odaklı koleksiyon bağlantılarına dönüşür.",
    },
  ];

  return (
    <section className="bg-[#F5F7FA] py-16 lg:py-20">
      <div className="container-premium">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#FF6A00]/20 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#C2410C]">
            <Sparkles className="h-3.5 w-3.5" />
            Vitrin Hazir
          </span>
          <h2 className="mt-5 text-3xl font-black text-[#111827] sm:text-4xl">
            Ürünler geldikçe Alpler Spor vitrini otomatik güçlenir
          </h2>
          <p className="mt-4 text-sm leading-7 text-[#6B7280] sm:text-[15px]">
            Ürün ve kategori girdileri eklendiğinde bu alan satış odaklı koleksiyon
            bloklarıyla dolar.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.title}
              className="rounded-[1.5rem] border border-[#E5E7EB] bg-white p-6 shadow-sm"
            >
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#FF6A00]">
                Merchandising
              </p>
              <h3 className="mt-3 text-xl font-black text-[#111827]">{card.title}</h3>
              <p className="mt-3 text-sm leading-7 text-[#6B7280]">{card.text}</p>
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
  const trustItems = [
    "%100 Orijinal Ürün",
    "Ücretsiz Kargo",
    "Kolay İade",
    "Güvenli Alışveriş",
  ];

  return (
    <>
      {effectiveGroups.map((group, groupIndex) => (
        <section key={group.id} className="bg-[#F5F7FA] py-14 lg:py-20">
          <div className="container-premium">
            <div className="mb-8 flex flex-col gap-5 sm:mb-10 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <span className="mb-3 block text-xs font-black uppercase tracking-[0.24em] text-[#FF6A00]">
                  ALPLER SPOR
                </span>
                <h2 className="text-3xl font-black tracking-tight text-[#111827] sm:text-4xl">
                  {group.title}
                </h2>
                {group.subtitle ? (
                  <p className="mt-3 max-w-xl text-sm font-medium leading-7 text-[#6B7280] sm:text-[15px]">
                    {group.subtitle}
                  </p>
                ) : null}
              </div>

              <Link
                href={buildPath(group.link.startsWith("/") ? group.link : ROUTES.products)}
                className="group inline-flex w-fit items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-black text-[#111827] shadow-sm transition-colors hover:border-[#FF6A00] hover:text-[#FF6A00]"
              >
                {viewAllLabel}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
              {group.products.slice(0, 4).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            {groupIndex === 0 ? (
              <div className="mt-8 grid grid-cols-2 gap-3 rounded-[1.5rem] border border-[#E5E7EB] bg-white p-3 shadow-sm sm:grid-cols-4 sm:p-4">
                {trustItems.map((item) => (
                  <div
                    key={item}
                    className="flex min-h-11 items-center gap-2 rounded-2xl bg-[#F8FAFC] px-3 text-xs font-black text-[#374151]"
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-[#FF6A00]" />
                    {item}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ))}
    </>
  );
}
