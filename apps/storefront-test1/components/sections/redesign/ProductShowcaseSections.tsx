"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { Product } from "@/types/product";
import { ProductCard } from "@/components/product/ProductCard";
import type { HomepageCategory } from "@/lib/homepage";
import { ROUTES } from "@/lib/constants";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";

type ShowcaseProduct = Product & {
  category?: string | null;
  subcategory?: string | null;
};

interface ProductShowcaseSectionsProps {
  categories?: HomepageCategory[];
  allProducts: ShowcaseProduct[];
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

function buildProductGroups(categories: HomepageCategory[], products: ShowcaseProduct[]) {
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

    const selectedProducts = categoryProducts.slice(0, 4);
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
      title: "Urunleri Yayina Al",
      text: "Adminde yayinlanan urunler bu alanda kategori bazli bloklara dagitilir.",
    },
    {
      title: "Kategori Sirasini Kur",
      text: "Aktif kategoriler otomatik section basliklarina ve ana menüye tasinir.",
    },
    {
      title: "Yorumlari Guclendir",
      text: "Onayli musteri yorumlari geldikce vitrindeki guven katmani otomatik buyur.",
    },
  ];

  return (
    <section className="bg-[#F8F8F8F8] py-16 lg:py-20">
      <div className="container-premium">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#C7A985] bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8A6847]">
            <Sparkles className="h-3.5 w-3.5" />
            Vitrin Hazir
          </span>
          <h2 className="mt-5 text-3xl font-semibold tracking-[-0.03em] text-[#18110B] sm:text-4xl">
            Urunleriniz geldikce bu alan Derycraft kalitesinde otomatik dolar
          </h2>
          <p className="mt-4 text-sm leading-7 text-[#6B5A4D] sm:text-[15px]">
            Ayrica ek bir tasarim eforu gerektirmez. Adminden urun, kategori ve gorsel girdikce
            starter tema dogrudan canli vitrininize donusur.
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
  viewAllLabel = "Tumunu Gor",
}: ProductShowcaseSectionsProps) {
  const { locale } = useStorefrontRoute();

  if (!Array.isArray(allProducts) || allProducts.length === 0) {
    return <EmptyShowcaseState />;
  }

  const groups = buildProductGroups(categories, allProducts);
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

  return (
    <>
      {fallbackGroups.map((group) => (
        <section key={group.id} className="bg-[#F8F8F8F8] py-16 lg:py-20">
          <div className="container-premium">
            <div className="mb-12 flex items-end justify-between gap-6">
              <div>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  {group.subtitle}
                </span>
                <h2 className="text-3xl font-bold text-neutral-900 sm:text-4xl">{group.title}</h2>
              </div>

              <Link
                href={buildLocalizedPath(
                  group.link.startsWith("/") ? group.link : ROUTES.products,
                  locale,
                )}
                className="group hidden items-center gap-2 text-sm font-medium text-neutral-700 transition-colors hover:text-neutral-900 sm:inline-flex"
              >
                {viewAllLabel}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4 lg:gap-8">
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
