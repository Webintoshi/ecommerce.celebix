"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Product } from "@/types/product";
import { ProductCard } from "./ProductCard";

interface ComplementaryProductsProps {
  title: string;
  products: Product[];
  loading?: boolean;
}

export function ComplementaryProducts({ title, products, loading }: ComplementaryProductsProps) {
  if (loading) {
    return (
      <section className="py-16 bg-[#F0FDFA]/20">
        <div className="container-premium">
          <div className="flex items-center justify-between mb-8">
            <div className="h-8 w-64 bg-[#F0FDFA] rounded-lg animate-pulse" />
            <div className="h-6 w-24 bg-[#F0FDFA] rounded-lg animate-pulse" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] bg-[#F0FDFA] rounded-2xl animate-pulse"
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (products.length === 0) return null;

  return (
    <section className="py-16 bg-[#F0FDFA]/20 border-y border-[#0F766E]/10">
      <div className="container-premium">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-semibold text-[#0F766E]">{title}</h2>
          <Link
            href="/urunler"
            className="flex items-center gap-1 text-[#0F766E] font-medium hover:gap-2 transition-all"
          >
            Tümünü Gör
            <ChevronRight className="w-5 h-5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {products.slice(0, 4).map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
