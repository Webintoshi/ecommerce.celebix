"use client";

import Link from "next/link";
import { Home, Search, ShoppingBag } from "lucide-react";
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-secondary/5">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto text-center">
          {/* 404 Illustration */}
          <div className="mb-8">
            <h1 className="text-9xl font-bold text-primary mb-4">404</h1>
            <div className="text-6xl mb-4">🥜</div>
          </div>

          {/* Message */}
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Sayfa Bulunamadı
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Aradığınız sayfa taşınmış, silinmiş veya hiç var olmamış olabilir.
            <br />
            Endişelenmeyin, size yardımcı olabiliriz!
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              <Home className="w-5 h-5" />
              Ana Sayfaya Dön
            </Link>
            <Link
              href="/urunler"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-primary/20 rounded-lg font-medium hover:bg-primary/5 transition-colors"
            >
              <ShoppingBag className="w-5 h-5" />
              Ürünleri İncele
            </Link>
          </div>

          {/* Search Suggestion */}
          <div className="mt-12 pt-8 border-t border-gray-200">
            <p className="text-gray-600 mb-4">
              Veya aradığınız ürünü bulabilirsiniz:
            </p>
            <div className="max-w-md mx-auto">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Ürün ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearch}
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Popular Links */}
          <div className="mt-12">
            <p className="text-sm text-gray-600 mb-4">Popüler Sayfalar:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <Link
                href="/kategori/fistik-ezmesi-koleksiyonu-2025"
                className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm hover:border-primary hover:text-primary transition-colors"
              >
                Fıstık Ezmeleri
              </Link>
              <Link
                href="/kategori/findik-ezmesi-koleksiyonu"
                className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm hover:border-primary hover:text-primary transition-colors"
              >
                Fındık Ezmeleri
              </Link>
              <Link
                href="/kategori/kuruyemisler"
                className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm hover:border-primary hover:text-primary transition-colors"
              >
                Kuruyemişler
              </Link>
              <Link
                href="/blog"
                className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm hover:border-primary hover:text-primary transition-colors"
              >
                Blog
              </Link>
              <Link
                href="/iletisim"
                className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm hover:border-primary hover:text-primary transition-colors"
              >
                İletişim
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
