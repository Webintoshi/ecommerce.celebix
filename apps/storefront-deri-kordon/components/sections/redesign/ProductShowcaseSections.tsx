"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Product } from "@/types/product";
import { ProductCard } from "@/components/product/ProductCard";

const PRODUCT_GROUPS = [
  {
    id: "bestsellers",
    title: "Cok Satanlar",
    subtitle: "Secili Koleksiyon",
    link: "/urunler",
    targetNames: [
      "Ic cepli klasik deri cuzdan",
      "Citcitli deri kartlik",
      "Telefon bolmeli uzun cuzdan",
      "Dikey deri kartlik",
    ],
  },
  {
    id: "apple-watch",
    title: "Apple Watch Kayislari",
    subtitle: "One Cikanlar",
    link: "/apple-watch-saat-kayislari",
    targetNames: [
      "Bund Cift Katli Apple Watch Deri Kayis - Aci Kahve",
      "Bund Cift Katli Apple Watch Deri Kayis - Antrasit",
      "Bund Cift Katli Apple Watch Deri Kayis - Asfalt",
      "Bund Cift Katli Apple Watch Deri Kayis - Camel",
    ],
  },
  {
    id: "accessories",
    title: "Aksesuarlar",
    subtitle: "Tamamlayicilar",
    link: "/aksesuar",
    targetNames: [
      "Deri Gozluk Kilifi",
      "Deri Rulo Kalemlik",
      "Deri Airpods Kilifi",
      "Deri Anahtar Kesesi Midi",
    ],
  },
  {
    id: "watch-straps",
    title: "Deri Saat Kayislari",
    subtitle: "Klasik Secim",
    link: "/saat-kayislari",
    targetNames: [
      "Cift Katli Deri Saat Kayisi - Yesil",
      "Cift Katli Deri Saat Kayisi - Taba",
      "Cift Katli Deri Saat Kayisi - Siyah",
      "Cift Katli Deri Saat Kayisi - Saffiano Kahve",
    ],
  },
] as const;

type ShowcaseProduct = Product & {
  translationSourceName?: string;
};

interface ProductShowcaseSectionsProps {
  allProducts: ShowcaseProduct[];
  groupCopy?: Array<{
    title: string;
    subtitle: string;
  }>;
  viewAllLabel?: string;
}

function normalizeText(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getComparableProductName(product: ShowcaseProduct) {
  return product.translationSourceName || product.name;
}

function findProductByName(products: ShowcaseProduct[], targetName: string): ShowcaseProduct | null {
  const normalizedTarget = normalizeText(targetName);
  const targetTokens = normalizedTarget.split(" ").filter((token) => token.length > 1);

  const exactMatch = products.find(
    (product) => normalizeText(getComparableProductName(product)) === normalizedTarget,
  );
  if (exactMatch) {
    return exactMatch;
  }

  const containsMatch = products.find((product) => {
    const normalizedName = normalizeText(getComparableProductName(product));
    return normalizedName.includes(normalizedTarget) || normalizedTarget.includes(normalizedName);
  });

  if (containsMatch) {
    return containsMatch;
  }

  const weightedMatch = products
    .map((product) => {
      const normalizedName = normalizeText(getComparableProductName(product));
      const score = targetTokens.reduce((sum, token) => {
        return sum + (normalizedName.includes(token) ? 1 : 0);
      }, 0);

      return { product, score };
    })
    .filter((entry) => entry.score >= Math.min(3, targetTokens.length))
    .sort((left, right) => right.score - left.score)[0];

  return weightedMatch?.product ?? null;
}

function getProductsForGroup(products: ShowcaseProduct[], targetNames: readonly string[]) {
  const usedProductIds = new Set<string>();

  return targetNames
    .map((targetName) => {
      const match = findProductByName(
        products.filter((product) => !usedProductIds.has(product.id)),
        targetName,
      );

      if (match) {
        usedProductIds.add(match.id);
      }

      return match;
    })
    .filter((product): product is ShowcaseProduct => Boolean(product));
}

function ProductGroupSection({
  group,
  products,
  viewAllLabel,
}: {
  group: (typeof PRODUCT_GROUPS)[0];
  products: ShowcaseProduct[];
  viewAllLabel: string;
}) {
  const matchedProducts = getProductsForGroup(products, group.targetNames);

  if (matchedProducts.length === 0) {
    return null;
  }

  return (
    <section className="bg-[#F8F8F8F8] py-16 lg:py-20">
      <div className="container-premium">
        <div className="mb-12 flex items-end justify-between">
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
              {group.subtitle}
            </span>
            <h2 className="text-3xl font-bold text-neutral-900 sm:text-4xl">{group.title}</h2>
          </div>
          <Link
            href={group.link}
            className="group hidden items-center gap-2 text-sm font-medium text-neutral-700 transition-colors hover:text-neutral-900 sm:inline-flex"
          >
            {viewAllLabel}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4 lg:gap-8">
          {matchedProducts.slice(0, 4).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        <div className="mt-10 flex justify-center sm:hidden">
          <Link
            href={group.link}
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-700 transition-colors hover:text-neutral-900"
          >
            {viewAllLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function ProductShowcaseSections({
  allProducts,
  groupCopy,
  viewAllLabel = "Tumunu Gor",
}: ProductShowcaseSectionsProps) {
  if (!allProducts || allProducts.length === 0) {
    return null;
  }

  const effectiveGroups = PRODUCT_GROUPS.map((group, index) => ({
    ...group,
    title: groupCopy?.[index]?.title || group.title,
    subtitle: groupCopy?.[index]?.subtitle || group.subtitle,
  }));

  return (
    <>
      {effectiveGroups.map((group) => (
        <ProductGroupSection
          key={group.id}
          group={group}
          products={allProducts}
          viewAllLabel={viewAllLabel}
        />
      ))}
    </>
  );
}
