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
      emptyTitle="Koleksiyon hazirlaniyor"
      emptyDescription="Bu kategori icin yayinlanan urunler geldigi anda soldaki filtre akisi ve premium grid burada otomatik olarak dolacak."
      chipMode="subcategories"
      minimalCopy
    />
  );
}
