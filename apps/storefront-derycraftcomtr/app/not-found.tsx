"use client";

import Link from "next/link";
import { Home, ShoppingBag, Search } from "lucide-react";
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
      <div className="max-w-xl mx-auto px-4 sm:px-6 text-center">
        <h1 className="text-7xl sm:text-8xl font-medium text-neutral-200 mb-6 tracking-tight">
          404
        </h1>
        <h2 className="text-2xl sm:text-3xl font-medium text-neutral-900 mb-4 tracking-tight">
          Page Not Found
        </h2>
        <p className="text-base text-neutral-500 mb-10 leading-relaxed max-w-md mx-auto">
          The page you are looking for may have moved, been deleted, or never existed.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-neutral-900 text-white rounded-xl font-medium hover:bg-neutral-800 transition-colors"
          >
            <Home className="w-4 h-4" />
            Back to Homepage
          </Link>
          <Link
            href="/urunler"
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-neutral-900 border border-neutral-200 rounded-xl font-medium hover:bg-neutral-50 transition-colors"
          >
            <ShoppingBag className="w-4 h-4" />
            Explore Products
          </Link>
        </div>
        <div className="max-w-sm mx-auto">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearch}
              className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-300 transition-all"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
