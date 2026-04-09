"use client";

import { Product } from "@/types/product";
import { formatProductDescription } from "@/lib/product-description";

interface ProductFeaturesProps {
  product: Product;
}

export function ProductFeatures({ product }: ProductFeaturesProps) {
  const descriptionBlocks = formatProductDescription(product.description, product.name);

  return (
    <div className="space-y-12">
      {descriptionBlocks.length > 0 && (
        <div className="space-y-4">
          {descriptionBlocks.map((block, index) => (
            <p
              key={`${product.id}-description-${index}`}
              className="font-sans text-[15px] leading-7 text-neutral-700 lg:text-base"
            >
              {block}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
