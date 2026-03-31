"use client";

import Link from "next/link";
import { Home, Search, ShoppingBag, Watch } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NotFound() {
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQuery) {
      router.push(`/urunler?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F8F8]">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-xl mx-auto text-center">
          {/* 404 Number */}
          <h1 className="text-8xl sm:text-9xl font-light text-neutral-900 mb-6 tracking-tight">
            404
          </h1>

          {/* Leather Strap Icon */}
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-neutral-100">
              <Watch className="w-10 h-10 text-neutral-800 stroke-[1.5]" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl sm:text-3xl font-medium text-neutral-900 mb-4">
            Sayfa Bulunamadı
          </h2>

          {/* Description */}
          <p className="text-base text-neutral-500 mb-10 leading-relaxed">
            Aradığınız sayfa taşınmış, silinmiş veya hiç var olmamış olabilir.
            <br className="hidden sm:block" />
            Endişelenmeyin, size yardımcı olabiliriz!
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-neutral-900 text-white rounded-lg font-medium hover:bg-neutral-800 transition-colors"
            >
              <Home className="w-5 h-5" />
              Ana Sayfaya Dön
            </Link>
            <Link
              href="/urunler"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-neutral-900 border border-neutral-300 rounded-lg font-medium hover:bg-neutral-50 transition-colors"
            >
              <ShoppingBag className="w-5 h-5" />
              Ürünleri İncele
            </Link>
          </div>

          {/* Divider */}
          <div className="border-t border-neutral-200 pt-10">
            <p className="text-neutral-500 mb-5">
              Veya aradığınız ürünü bulabilirsiniz:
            </p>

            {/* Search Input */}
            <div className="max-w-md mx-auto">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Ürün ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearch}
                  className="w-full pl-12 pr-4 py-3.5 bg-white border border-neutral-300 rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Popular Categories */}
          <div className="mt-12">
            <p className="text-sm text-neutral-400 mb-4">Popüler Kategoriler:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <Link
                href="/kategori/apple-watch-kayislari"
                className="px-4 py-2 bg-white border border-neutral-200 rounded-full text-sm text-neutral-600 hover:border-neutral-400 hover:text-neutral-900 transition-colors"
              >
                Apple Watch Kayışları
              </Link>
              <Link
                href="/kategori/deri-kordonlar"
                className="px-4 py-2 bg-white border border-neutral-200 rounded-full text-sm text-neutral-600 hover:border-neutral-400 hover:text-neutral-900 transition-colors"
              >
                Deri Kordonlar
              </Link>
              <Link
                href="/kategori/aksesuarlar"
                className="px-4 py-2 bg-white border border-neutral-200 rounded-full text-sm text-neutral-600 hover:border-neutral-400 hover:text-neutral-900 transition-colors"
              >
                Aksesuarlar
              </Link>
              <Link
                href="/koleksiyon/yeni-urunler"
                className="px-4 py-2 bg-white border border-neutral-200 rounded-full text-sm text-neutral-600 hover:border-neutral-400 hover:text-neutral-900 transition-colors"
              >
                Yeni Ürünler
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
