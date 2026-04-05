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
    fallbackCategories: ["cuzdan-kartlik"],
    fallbackQueries: ["cuzdan", "kartlik"],
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
    fallbackCategories: ["apple-watch-saat-kayislari"],
    fallbackQueries: ["Bund Cift Katli Apple Watch Deri Kayis"],
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
    fallbackCategories: ["aksesuar"],
    fallbackQueries: ["Deri", "Aksesuar"],
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
    fallbackCategories: ["saat-kayislari"],
    fallbackQueries: ["Cift Katli Deri Saat Kayisi"],
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
  category?: string | null;
  subcategory?: string | null;
  shopify_metadata?: {
    celebix_category_hierarchy?: {
      categorySlug?: string | null;
      subcategorySlug?: string | null;
    };
  } | null;
};

interface ProductShowcaseSectionsProps {
  allProducts: ShowcaseProduct[];
  groupCopy?: Array<{
    title: string;
    subtitle: string;
  }>;
  viewAllLabel?: string;
}

const TEXT_NORMALIZATION_MAP: Record<string, string> = {
  "\u00c7": "c",
  "\u00e7": "c",
  "\u011e": "g",
  "\u011f": "g",
  "\u0130": "i",
  "\u0131": "i",
  "\u00d6": "o",
  "\u00f6": "o",
  "\u015e": "s",
  "\u015f": "s",
  "\u00dc": "u",
  "\u00fc": "u",
};

function normalizeText(value: string) {
  return Array.from(value)
    .map((char) => TEXT_NORMALIZATION_MAP[char] ?? char)
    .join("")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getComparableProductName(product: ShowcaseProduct) {
  return product.translationSourceName || product.name;
}

function matchesTargetShape(normalizedName: string, normalizedTarget: string) {
  const requiredPhrases = ["apple watch", "bund", "saat kayisi"].filter((phrase) =>
    normalizedTarget.includes(phrase),
  );
  const forbiddenPhrases = ["apple watch", "bund"].filter((phrase) => !normalizedTarget.includes(phrase));

  return (
    requiredPhrases.every((phrase) => normalizedName.includes(phrase)) &&
    forbiddenPhrases.every((phrase) => !normalizedName.includes(phrase))
  );
}

function findProductByName(products: ShowcaseProduct[], targetName: string): ShowcaseProduct | null {
  const normalizedTarget = normalizeText(targetName);
  const targetTokens = normalizedTarget.split(" ").filter((token) => token.length > 1);
  const distinctiveToken = targetTokens[targetTokens.length - 1] ?? "";
  const requiresDistinctiveToken = targetTokens.length >= 5 && distinctiveToken.length >= 3;

  const exactMatch = products.find(
    (product) => normalizeText(getComparableProductName(product)) === normalizedTarget,
  );
  if (exactMatch) {
    return exactMatch;
  }

  const containsMatch = products.find((product) => {
    const normalizedName = normalizeText(getComparableProductName(product));
    return (
      matchesTargetShape(normalizedName, normalizedTarget) &&
      (normalizedName.includes(normalizedTarget) || normalizedTarget.includes(normalizedName))
    );
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
      const lengthDelta = Math.abs(normalizedName.length - normalizedTarget.length);

      return { product, score, normalizedName, lengthDelta };
    })
    .filter((entry) => entry.score >= Math.min(3, targetTokens.length))
    .filter((entry) => !requiresDistinctiveToken || entry.normalizedName.includes(distinctiveToken))
    .filter((entry) => matchesTargetShape(entry.normalizedName, normalizedTarget))
    .sort((left, right) => right.score - left.score || left.lengthDelta - right.lengthDelta)[0];

  return weightedMatch?.product ?? null;
}

function getProductCategoryCandidates(product: ShowcaseProduct) {
  return [
    product.category,
    product.subcategory,
    product.shopify_metadata?.celebix_category_hierarchy?.categorySlug,
    product.shopify_metadata?.celebix_category_hierarchy?.subcategorySlug,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeText(value));
}

function getFallbackProductsForGroup(
  products: ShowcaseProduct[],
  usedProductIds: Set<string>,
  fallbackCategories: readonly string[],
  fallbackQueries: readonly string[],
) {
  const normalizedCategories = fallbackCategories.map((category) => normalizeText(category));
  const normalizedQueries = fallbackQueries.map((query) => normalizeText(query));

  return products
    .filter((product) => !usedProductIds.has(product.id))
    .map((product) => {
      const comparableName = normalizeText(getComparableProductName(product));
      const categoryCandidates = getProductCategoryCandidates(product);

      const categoryScore = normalizedCategories.some((category) => categoryCandidates.includes(category)) ? 3 : 0;
      const queryScore = normalizedQueries.reduce((score, query) => {
        return score + (comparableName.includes(query) ? 5 : 0);
      }, 0);

      return {
        product,
        score: categoryScore + queryScore,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.product);
}

function getProductsForGroup(
  products: ShowcaseProduct[],
  targetNames: readonly string[],
  fallbackCategories: readonly string[] = [],
  fallbackQueries: readonly string[] = [],
) {
  const usedProductIds = new Set<string>();
  const matchedProducts = targetNames
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

  if (matchedProducts.length >= 4) {
    return matchedProducts;
  }

  const fallbackProducts = getFallbackProductsForGroup(
    products,
    usedProductIds,
    fallbackCategories,
    fallbackQueries,
  );

  for (const fallbackProduct of fallbackProducts) {
    if (matchedProducts.length >= 4) {
      break;
    }

    if (!usedProductIds.has(fallbackProduct.id)) {
      usedProductIds.add(fallbackProduct.id);
      matchedProducts.push(fallbackProduct);
    }
  }

  return matchedProducts;
}

function ProductGroupSection({
  group,
  products,
  viewAllLabel,
}: {
  group: (typeof PRODUCT_GROUPS)[number] & {
    fallbackCategories?: readonly string[];
    fallbackQueries?: readonly string[];
  };
  products: ShowcaseProduct[];
  viewAllLabel: string;
}) {
  const matchedProducts = getProductsForGroup(
    products,
    group.targetNames,
    group.fallbackCategories ?? [],
    group.fallbackQueries ?? [],
  );

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
