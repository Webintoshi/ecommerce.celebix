"use client";

import { ProductListingExperience } from "@/components/product/ProductListingExperience";
import { Product } from "@/types/product";

interface CollectionProductsClientProps {
  products: Product[];
}

export default function CollectionProductsClient({
  products,
}: CollectionProductsClientProps) {
  return (
    <ProductListingExperience
      products={products}
      emptyTitle="Koleksiyon hazırlanıyor"
      emptyDescription="Bu kategori için yayınlanan ürünler geldiği anda soldaki filtre akışı ve premium grid burada otomatik olarak dolacak."
      chipMode="subcategories"
      minimalCopy
    />
  );
}
