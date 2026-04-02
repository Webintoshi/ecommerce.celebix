"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Product } from "@/types/product";
import { ProductCard } from "@/components/product/ProductCard";

const PRODUCT_GROUPS = [
  {
    id: "bestsellers",
    title: "Çok Satanlar",
    subtitle: "Seçili Koleksiyon",
    link: "/urunler",
    targetNames: [
      "İç cepli klasik deri cüzdan",
      "Çıtçıtlı deri kartlık",
      "Telefon bölmeli uzun cüzdan",
      "Dikey deri kartlık",
    ],
  },
  {
    id: "apple-watch",
    title: "Apple Watch Kayışları",
    subtitle: "Öne Çıkanlar",
    link: "/apple-watch-saat-kayislari",
    targetNames: [
      "Bund Çift Katlı Apple Watch Deri Kayış - Acı Kahve",
      "Bund Çift Katlı Apple Watch Deri Kayış - Antrasit",
      "Bund Çift Katlı Apple Watch Deri Kayış - Asfalt",
      "Bund Çift Katlı Apple Watch Deri Kayış - Camel",
    ],
  },
  {
    id: "accessories",
    title: "Aksesuarlar",
    subtitle: "Tamamlayıcılar",
    link: "/aksesuar",
    targetNames: [
      "Deri Gözlük Kılıfı",
      "Deri Rulo Kalemlik",
      "Deri Airpods Kılıfı",
      "Deri Anahtar Kesesi Midi",
    ],
  },
  {
    id: "watch-straps",
    title: "Deri Saat Kayışları",
    subtitle: "Klasik Seçim",
    link: "/saat-kayislari",
    targetNames: [
      "Çift Katlı Deri Saat Kayışı - Yeşil",
      "Çift Katlı Deri Saat Kayışı - Taba",
      "Çift Katlı Deri Saat Kayışı - Siyah",
      "Çift Katlı Deri Saat Kayışı - Saffiano Kahve",
    ],
  },
] as const;

interface ProductShowcaseSectionsProps {
  allProducts: Product[];
}

function normalizeText(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findProductByName(products: Product[], targetName: string): Product | null {
  const normalizedTarget = normalizeText(targetName);
  const targetTokens = normalizedTarget.split(" ").filter((token) => token.length > 1);

  const exactMatch = products.find((product) => normalizeText(product.name) === normalizedTarget);
  if (exactMatch) {
    return exactMatch;
  }

  const containsMatch = products.find((product) => {
    const normalizedName = normalizeText(product.name);
    return normalizedName.includes(normalizedTarget) || normalizedTarget.includes(normalizedName);
  });

  if (containsMatch) {
    return containsMatch;
  }

  const weightedMatch = products
    .map((product) => {
      const normalizedName = normalizeText(product.name);
      const score = targetTokens.reduce((sum, token) => {
        return sum + (normalizedName.includes(token) ? 1 : 0);
      }, 0);

      return { product, score };
    })
    .filter((entry) => entry.score >= Math.min(3, targetTokens.length))
    .sort((left, right) => right.score - left.score)[0];

  return weightedMatch?.product ?? null;
}

function getProductsForGroup(products: Product[], targetNames: readonly string[]) {
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
    .filter((product): product is Product => Boolean(product));
}

function ProductGroupSection({
  group,
  products,
}: {
  group: (typeof PRODUCT_GROUPS)[0];
  products: Product[];
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
            Tümünü Gör
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
            Tümünü Gör
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function ProductShowcaseSections({ allProducts }: ProductShowcaseSectionsProps) {
  if (!allProducts || allProducts.length === 0) {
    return null;
  }

  return (
    <>
      {PRODUCT_GROUPS.map((group) => (
        <ProductGroupSection key={group.id} group={group} products={allProducts} />
      ))}
    </>
  );
}
