"use client";

import Link from "next/link";
import { Home, Search, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NotFound() {
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  const handleSearch = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && searchQuery) {
      router.push(`/urunler?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto flex min-h-screen items-center justify-center px-4">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-8">
            <h1 className="mb-4 text-9xl font-bold text-primary">404</h1>
            <div className="mb-4 text-6xl">?</div>
          </div>

          <h2 className="mb-4 text-3xl font-bold text-gray-900 md:text-4xl">
            Sayfa Bulunamadı
          </h2>
          <p className="mb-8 text-lg text-gray-600">
            Aradığınız sayfa taşınmış, silinmiş veya henüz hazır değil olabilir.
            Endişelenmeyin, sizi doğru yere yönlendirebiliriz.
          </p>

          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Home className="h-5 w-5" />
              Ana Sayfaya Dön
            </Link>
            <Link
              href="/urunler"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/20 px-6 py-3 font-medium transition-colors hover:bg-primary/5"
            >
              <ShoppingBag className="h-5 w-5" />
              Ürünleri İncele
            </Link>
          </div>

          <div className="mt-12 border-t border-gray-200 pt-8">
            <p className="mb-4 text-gray-600">Veya aradığınız ürünü burada arayın:</p>
            <div className="mx-auto max-w-md">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Ürün ara..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={handleSearch}
                  className="w-full rounded-lg border border-gray-300 py-3 pl-12 pr-4 focus:border-transparent focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          <div className="mt-12">
            <p className="mb-4 text-sm text-gray-600">Popüler Sayfalar:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                { href: "/urunler", label: "Ürünler" },
                { href: "/hakkimizda", label: "Hakkımızda" },
                { href: "/kargo", label: "Kargo" },
                { href: "/blog", label: "Blog" },
                { href: "/iletisim", label: "İletişim" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm transition-colors hover:border-primary hover:text-primary"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
