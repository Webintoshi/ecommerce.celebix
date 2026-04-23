"use client";

import { Product } from "@/types/product";
import { renderProductDescriptionHtml } from "@/lib/product-description";

interface ProductFeaturesProps {
  product: Product;
}

export function ProductFeatures({ product }: ProductFeaturesProps) {
  const descriptionHtml = renderProductDescriptionHtml(
    product.description,
    product.name,
  );

  return (
    <div className="space-y-12">
      {descriptionHtml ? (
        <div
          className="prose prose-neutral max-w-none text-neutral-700 [&_a]:text-neutral-900 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-neutral-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_li]:my-1 [&_ol]:pl-5 [&_p]:text-[15px] [&_p]:leading-7 [&_ul]:pl-5 lg:[&_p]:text-base"
          dangerouslySetInnerHTML={{ __html: descriptionHtml }}
        />
      ) : (
        <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-5 text-sm font-medium text-[#6B7280]">
          Bu urun icin aciklama henuz eklenmedi.
        </div>
      )}
    </div>
  );
}
