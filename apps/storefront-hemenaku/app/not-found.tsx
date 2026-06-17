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
    <div className="min-h-screen bg-[#F7FAF9]">
      <div className="container mx-auto flex min-h-screen items-center justify-center px-4">
        <div className="mx-auto max-w-2xl rounded-lg border border-[#DDE7E4] bg-white px-6 py-12 text-center shadow-sm sm:px-10">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase text-[#0F766E]">Hemenaku</p>
            <h1 className="mt-3 text-7xl font-semibold text-[#111827] sm:text-8xl">404</h1>
          </div>

          <h2 className="mb-4 text-3xl font-semibold text-[#111827] md:text-4xl">
            Aradığınız sayfa bulunamadı
          </h2>
          <p className="mb-8 text-base leading-8 text-[#526B66]">
            Aradığınız sayfa taşınmış, silinmiş veya henüz hazır değil olabilir.
            Endişelenmeyin, sizi doğru yere yönlendirebiliriz.
          </p>

          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0F766E] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#115E59]"
            >
              <Home className="h-5 w-5" />
              Ana Sayfaya Dön
            </Link>
            <Link
              href="/urunler"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#DDE7E4] px-6 py-3 font-semibold text-[#111827] transition-colors hover:border-[#0F766E] hover:text-[#0F766E]"
            >
              <ShoppingBag className="h-5 w-5" />
              Ürünleri İncele
            </Link>
          </div>

          <div className="mt-12 border-t border-[#DDE7E4] pt-8">
            <p className="mb-4 text-[#526B66]">Veya aradığınız ürünü burada arayın:</p>
            <div className="mx-auto max-w-md">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Ürün ara..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={handleSearch}
                  className="w-full rounded-lg border border-[#DDE7E4] py-3 pl-12 pr-4 focus:border-transparent focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          <div className="mt-12">
            <p className="mb-4 text-sm text-[#526B66]">Popüler Sayfalar:</p>
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
                  className="rounded-full border border-[#DDE7E4] bg-white px-4 py-2 text-sm transition-colors hover:border-[#0F766E] hover:text-[#0F766E]"
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
