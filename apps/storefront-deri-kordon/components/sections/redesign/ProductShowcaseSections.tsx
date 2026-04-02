"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Product } from "@/types/product";
import { ProductCard } from "@/components/product/ProductCard";

// Define the product groups with their target names
const PRODUCT_GROUPS = [
  {
    id: "bestsellers",
    title: "Çok Satanlar",
    subtitle: "Popüler",
    targetNames: [
      "İç cepli klasik deri cüzdan",
      "çıtçıtlı deri kartlık",
      "Telefon bölmeli uzun Cüzdan",
      "Dikey Deri kartlık",
    ],
  },
  {
    id: "apple-watch",
    title: "Apple Watch Kayışlar",
    subtitle: "Koleksiyon",
    targetNames: [
      "Bund Çift Katlı Apple Watch Deri Kayış - Acı Kahve",
      "Bund Çift Katlı Apple Watch Deri Kayış - Antrasit",
      "Bund Çift Katlı Apple Watch Deri Kayış - Asfalt",
      "Bund Çift Katlı Apple Watch Deri Kayış - Camel",
    ],
  },
  {
    id: "accessories",
    title: "AKSESUARLAR",
    subtitle: "Tamamlayıcı",
    targetNames: [
      "Deri Gözlük Kılıfı",
      "Deri Rulo Kalemlik",
      "Deri Airpods Kılıfı",
      "Deri Anahtar Kesesi Midi",
    ],
  },
  {
    id: "watch-straps",
    title: "DERİ SAAT KAYIŞLARI",
    subtitle: "Klasik",
    targetNames: [
      "Çift Katlı Deri Saat Kayışı - Yeşil",
      "Çift Katlı Deri Saat Kayışı - Taba",
      "Çift Katlı Deri Saat Kayışı - Siyah",
      "Çift Katlı Deri Saat Kayışı - Saffiano Kahve",
    ],
  },
];

interface ProductShowcaseSectionsProps {
  allProducts: Product[];
}

function findProductByName(products: Product[], targetName: string): Product | null {
  const normalizedTarget = targetName.toLowerCase().trim();
  
  // Try exact match first
  let match = products.find(
    (p) => p.name.toLowerCase().trim() === normalizedTarget
  );
  
  // Try includes match (product name contains target)
  if (!match) {
    match = products.find(
      (p) => p.name.toLowerCase().includes(normalizedTarget)
    );
  }
  
  // Try reverse includes (target contains product name)
  if (!match) {
    match = products.find(
      (p) => normalizedTarget.includes(p.name.toLowerCase())
    );
  }
  
  // Try word-by-word matching
  if (!match) {
    const targetWords = normalizedTarget.split(/\s+/);
    match = products.find((p) => {
      const productNameLower = p.name.toLowerCase();
      // Check if most words match
      const matchingWords = targetWords.filter(word => 
        word.length > 2 && productNameLower.includes(word)
      );
      return matchingWords.length >= Math.min(3, targetWords.length);
    });
  }
  
  return match || null;
}

function ProductGroupSection({
  group,
  products,
}: {
  group: (typeof PRODUCT_GROUPS)[0];
  products: Product[];
}) {
  const [loading, setLoading] = useState(true);
  const [matchedProducts, setMatchedProducts] = useState<Product[]>([]);

  useEffect(() => {
    // Find matching products
    const matched = group.targetNames
      .map((name) => findProductByName(products, name))
      .filter((p): p is Product => p !== null);
    
    setMatchedProducts(matched);
    setLoading(false);
  }, [products, group.targetNames]);

  if (loading) {
    return (
      <section className="py-16 lg:py-20 bg-[#F8F8F8]">
        <div className="container-premium">
          <div className="flex items-end justify-between mb-12">
            <div>
              <div className="h-4 w-24 bg-neutral-200 rounded-full mb-2" />
              <div className="h-10 w-48 bg-neutral-200 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 lg:gap-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-square bg-neutral-100 mb-4" />
                <div className="h-5 bg-neutral-200 rounded w-3/4 mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (matchedProducts.length === 0) {
    return null;
  }

  return (
    <section className="py-16 lg:py-20 bg-[#F8F8F8]">
      <div className="container-premium">
        {/* Section Header */}
        <div className="flex items-end justify-between mb-12">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 mb-2 block">
              {group.subtitle}
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-neutral-900">
              {group.title}
            </h2>
          </div>
          <Link
            href="/urunler"
            className="hidden sm:inline-flex items-center gap-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-colors group"
          >
            Tümünü Gör
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* Products Grid - 4 columns */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 lg:gap-8">
          {matchedProducts.slice(0, 4).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        {/* Mobile: View All Button */}
        <div className="flex sm:hidden justify-center mt-10">
          <Link
            href="/urunler"
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-colors"
          >
            Tümünü Gör
            <ArrowRight className="w-4 h-4" />
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
        <ProductGroupSection
          key={group.id}
          group={group}
          products={allProducts}
        />
      ))}
    </>
  );
}
