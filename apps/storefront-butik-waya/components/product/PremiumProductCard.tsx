"use client";

import { ProductCard } from "@/components/product/ProductCard";
import { Product } from "@/types/product";

interface PremiumProductCardProps {
  product: Product;
  variant?: "hero" | "standard";
  index?: number;
}

export function PremiumProductCard({
  product,
  variant = "standard",
}: PremiumProductCardProps) {
  return (
    <ProductCard
      product={product}
      cardStyle={variant === "hero" ? "featured" : "standard"}
    />
  );
}
