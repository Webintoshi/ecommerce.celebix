"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  ProductListingExperience,
  ProductListingExperienceSkeleton,
} from "@/components/product/ProductListingExperience";
import { Product } from "@/types/product";

interface ProductsPageClientProps {
  initialProducts: Product[];
  categoryCounts?: Record<string, number>;
}

function ProductsPageContent({ initialProducts }: Pick<ProductsPageClientProps, "initialProducts">) {
  return (
    <div className="min-h-screen">
      <section className="container-premium py-6 sm:py-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <ProductListingExperience
            products={initialProducts}
            emptyTitle="Vitrin hazir"
            emptyDescription="Adminde yayinlanan ilk urunler geldigi anda bu alan Butik Waya kartlariyla otomatik olarak dolar."
            chipMode="categories"
            minimalCopy
          />
        </motion.div>
      </section>
    </div>
  );
}

export function ProductsPageClient({
  initialProducts,
  categoryCounts: _categoryCounts,
}: ProductsPageClientProps) {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen">
          <div className="container-premium py-6 sm:py-8">
            <ProductListingExperienceSkeleton />
          </div>
        </div>
      }
    >
      <ProductsPageContent initialProducts={initialProducts} />
    </React.Suspense>
  );
}
