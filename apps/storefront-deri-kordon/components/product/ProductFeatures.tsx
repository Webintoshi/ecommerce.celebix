"use client";

import { Product } from "@/types/product";

interface ProductFeaturesProps {
  product: Product;
}

export function ProductFeatures({ product }: ProductFeaturesProps) {
  return (
    <div className="space-y-12">
      {product.description && (
        <div className="prose prose-neutral max-w-none">
          <p className="text-neutral-600 leading-relaxed whitespace-pre-line">
            {product.description}
          </p>
        </div>
      )}
    </div>
  );
}
