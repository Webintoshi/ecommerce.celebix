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
  is_featured?: boolean;
};

interface ProductShowcaseSectionsProps {
  categories?: HomepageCategory[];
  allProducts: ShowcaseProduct[];
  description?: string;
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

function isHomepageFeatured(product: ShowcaseProduct) {
  return Boolean(product.featured ?? product.is_featured);
}

function buildProductGroups(categories: HomepageCategory[], products: ShowcaseProduct[]) {
  const usedProductIds = new Set<string>();

  return categories.slice(0, 4).map((category, index) => {
    const categoryKey = normalizeKey(category.slug);
    const categoryProducts = products.filter((product) => {
      const productCategory = normalizeKey(product.category);
      const productSubcategory = normalizeKey(product.subcategory);

      return (
        !usedProductIds.has(product.id) &&
        (productCategory === categoryKey || productSubcategory === categoryKey)
      );
    });

    const prioritizedProducts = [
      ...categoryProducts.filter((product) => isHomepageFeatured(product)),
      ...categoryProducts.filter((product) => !isHomepageFeatured(product)),
    ];

    const selectedProducts = prioritizedProducts.slice(0, 4);
    selectedProducts.forEach((product) => usedProductIds.add(product.id));

    return {
      id: category.id,
      title: category.name,
      subtitle:
        index === 0
          ? "Selected Collection"
          : index === 1
            ? "Featured"
            : index === 2
              ? "Editor's Pick"
              : "Explore",
      link: `/${category.slug}`,
      products: selectedProducts,
    };
  });
}

function EmptyShowcaseState() {
  const cards = [
    {
      title: "Publish Products",
      text: "Products published in admin appear here directly as category-based showcase blocks.",
    },
    {
      title: "Use Manual Ordering",
      text: "The product order in admin is preserved across the showcase and category blocks.",
    },
    {
      title: "Complete Category Setup",
      text: "Active categories automatically become section headings and collection links.",
    },
  ];

  return (
    <section className="bg-[#F8F8F8F8] py-16 lg:py-20">
      <div className="container-premium">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#C7A985] bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8A6847]">
            <Sparkles className="h-3.5 w-3.5" />
            Showcase Ready
          </span>
          <h2 className="mt-5 text-3xl font-semibold tracking-[-0.03em] text-[#18110B] sm:text-4xl">
            As products arrive, this area fills automatically with DeryCraft polish
          </h2>
          <p className="mt-4 text-sm leading-7 text-[#6B5A4D] sm:text-[15px]">
            Without extra theme work, product and category entries from admin fill the storefront
            section layout.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.title}
              className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_24px_60px_-44px_rgba(41,24,15,0.45)]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8A6847]">
                Automatic
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
  description = "Workshop-selected pieces that gain patina in daily use and make strong gifts.",
  groupCopy,
  viewAllLabel = "View All",
}: ProductShowcaseSectionsProps) {
  const { locale } = useStorefrontRoute();

  if (!Array.isArray(allProducts) || allProducts.length === 0) {
    return <EmptyShowcaseState />;
  }

  const baseGroups = buildProductGroups(categories, allProducts);
  const groups =
    baseGroups.length > 0
      ? baseGroups
      : [
          {
            id: "latest",
            title: "New Arrivals",
            subtitle: "Live Selection",
            link: ROUTES.products,
            products: allProducts.slice(0, 4),
          },
          {
            id: "featured",
            title: "Featured",
            subtitle: "Editor's Pick",
            link: ROUTES.products,
            products: allProducts.slice(4, 8),
          },
        ].filter((group) => group.products.length > 0);

  const effectiveGroups = groups.map((group, index) => ({
    ...group,
    title: groupCopy?.[index]?.title || group.title || humanizeCategory(group.link),
    subtitle: groupCopy?.[index]?.subtitle || group.subtitle,
  }));

  return (
    <>
      {effectiveGroups.map((group, index) => (
        <section
          key={group.id}
          className={`${index % 2 === 0 ? "bg-[#F8F8F8F8]" : "bg-white"} py-16 lg:py-20`}
        >
          <div className="container-premium">
            <div className="mb-10 flex flex-col gap-5 md:mb-12 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-[#8A6847]">
                  {group.subtitle}
                </span>
                <h2 className="text-3xl font-bold tracking-[-0.03em] text-neutral-900 sm:text-4xl">
                  {group.title}
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-7 text-neutral-600">{description}</p>
              </div>

              <Link
                href={buildLocalizedPath(
                  group.link.startsWith("/") ? group.link : ROUTES.products,
                  locale,
                )}
                className="group inline-flex items-center gap-2 self-start rounded-full border border-[#D9CCBB] bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:border-[#B99874] hover:text-neutral-900"
              >
                {viewAllLabel}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
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
