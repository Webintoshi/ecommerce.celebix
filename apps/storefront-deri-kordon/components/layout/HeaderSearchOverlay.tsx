"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Search, X, Command } from "lucide-react";
import { motion } from "framer-motion";
import { ROUTES } from "@/lib/constants";
import { buildLocalizedPath, type StorefrontLocale } from "@/lib/i18n";

type SearchProductResult = {
  id: string;
  name: string;
  slug: string;
  category?: string | null;
  images?: string[] | null;
  variants?: Array<{
    price?: number | null;
    originalPrice?: number | null;
    original_price?: number | null;
  }> | null;
};

type SearchProductsResponse = {
  success?: boolean;
  products?: SearchProductResult[];
  error?: string;
};

type HeaderSearchOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
  locale: StorefrontLocale;
  resolveImageSrc?: (src?: string | null) => string;
};

const SEARCH_DELAY_MS = 200;
const MAX_RESULTS = 6;

function formatPrice(price?: number | null) {
  if (typeof price !== "number" || Number.isNaN(price)) {
    return null;
  }
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(price);
}

function getProductImage(
  product: SearchProductResult,
  resolveImageSrc?: (src?: string | null) => string
) {
  const imageSource = product.images?.[0] || "/placeholder.svg";
  if (!resolveImageSrc) {
    return imageSource;
  }
  return resolveImageSrc(imageSource) || "/placeholder.svg";
}

export function HeaderSearchOverlay({
  isOpen,
  onClose,
  locale,
  resolveImageSrc,
}: HeaderSearchOverlayProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchProductResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults([]);
      return;
    }
    document.body.style.overflow = "hidden";
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || normalizedQuery.length < 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/products?search=${encodeURIComponent(normalizedQuery)}&locale=${locale}`,
          { signal: controller.signal, cache: "no-store" }
        );
        const data = (await res.json()) as SearchProductsResponse;
        setResults(Array.isArray(data.products) ? data.products : []);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, SEARCH_DELAY_MS);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [isOpen, normalizedQuery]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!isMounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-start justify-center px-4 pb-6 pt-[8vh] sm:pt-[10vh]">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(28,20,10,0.28),rgba(10,8,5,0.66))] backdrop-blur-[3px]"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.96 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-[#e5d9ca] bg-[linear-gradient(180deg,#fffdfa_0%,#ffffff_42%,#fcf8f2_100%)] shadow-[0_38px_90px_-34px_rgba(36,24,8,0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d4b17b] to-transparent" />

        {/* Input Header */}
        <div className="border-b border-[#ebe1d3] px-4 pb-4 pt-4 sm:px-6 sm:pb-5 sm:pt-5">
          <div className="flex items-center gap-2 rounded-2xl border border-[#d8c6a9]/80 bg-white/95 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-24px_rgba(65,43,14,0.5)]">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#f8f2e8] text-[#8e6a36]">
              <Search className="h-4 w-4" />
            </span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ürün ara..."
              className="h-9 flex-1 bg-transparent text-base text-neutral-900 placeholder:text-neutral-400 outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded-full p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                aria-label="Aramayı temizle"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1">
                <Command className="h-3 w-3 text-neutral-400" />
                <span className="text-[11px] font-medium text-neutral-500">K</span>
              </div>
            )}
          </div>
          <p className="mt-2 pl-1 text-[11px] font-medium tracking-[0.08em] text-neutral-400">
            En az 2 karakter yazın
          </p>
        </div>

        {/* Results Area */}
        <div className="search-overlay-scroll max-h-[52vh] overflow-y-auto px-2 py-2 sm:px-3">
          {normalizedQuery.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="mb-4 rounded-full bg-[radial-gradient(circle,#f5ecde_0%,#fbf6ee_72%)] p-4 ring-1 ring-[#ecdcc5]">
                <Search className="h-7 w-7 text-[#b69564]" />
              </div>
              <p className="text-sm font-medium text-neutral-500">
                Bir ürün adı yazarak aramaya başlayın
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-14">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#e8dbc7] border-t-[#8a6635]" />
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <p className="text-sm font-medium text-neutral-500">Sonuç bulunamadı</p>
            </div>
          ) : (
            <div className="py-1">
              {results.slice(0, MAX_RESULTS).map((product) => {
                const firstVariant = product.variants?.[0];
                const price = formatPrice(firstVariant?.price);
                const originalPrice =
                  typeof firstVariant?.originalPrice === "number"
                    ? firstVariant.originalPrice
                    : typeof firstVariant?.original_price === "number"
                      ? firstVariant.original_price
                      : null;
                const originalPriceLabel =
                  typeof originalPrice === "number" &&
                  typeof firstVariant?.price === "number" &&
                  originalPrice > firstVariant.price
                    ? formatPrice(originalPrice)
                    : null;
                return (
                  <Link
                    key={product.id}
                    href={buildLocalizedPath(ROUTES.product(product.slug), locale)}
                    onClick={onClose}
                    className="group flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 transition-all duration-200 hover:border-[#e8dcc9] hover:bg-white hover:shadow-[0_22px_44px_-36px_rgba(50,34,13,0.55)]"
                  >
                    <div className="h-14 w-14 overflow-hidden rounded-xl border border-[#ece3d8] bg-neutral-100">
                      <img
                        src={getProductImage(product, resolveImageSrc)}
                        alt={product.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-neutral-900 group-hover:text-neutral-700">
                        {product.name}
                      </p>
                      {price ? (
                        <div className="mt-1 flex items-center gap-2">
                          {originalPriceLabel ? (
                            <p className="text-[11px] text-neutral-400 line-through">
                              {originalPriceLabel}
                            </p>
                          ) : null}
                          <p className="text-xs font-medium text-[#8a6635]">{price}</p>
                        </div>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#ebe1d3] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,245,237,0.92))] px-4 py-3 text-xs text-neutral-500 sm:px-6">
          <span className="rounded-full border border-[#e4d6c3] bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600">
            {results.length > 0 ? `${Math.min(results.length, MAX_RESULTS)} sonuç` : ""}
          </span>
          <span className="flex items-center gap-2">
            <kbd className="rounded-md border border-[#e4d6c3] bg-white px-1.5 py-0.5 font-sans text-[10px] text-neutral-500">ESC</kbd>
            <span className="text-[11px] font-medium">kapat</span>
          </span>
        </div>

        <style jsx>{`
          .search-overlay-scroll {
            scrollbar-width: thin;
            scrollbar-color: rgba(138, 102, 53, 0.35) transparent;
          }

          .search-overlay-scroll::-webkit-scrollbar {
            width: 7px;
          }

          .search-overlay-scroll::-webkit-scrollbar-thumb {
            background: rgba(138, 102, 53, 0.35);
            border-radius: 999px;
          }
        `}</style>
      </motion.div>
    </div>,
    document.body
  );
}
