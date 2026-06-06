"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Search, X, Command } from "lucide-react";
import { motion } from "framer-motion";
import { ROUTES } from "@/lib/constants";
import { useStorefrontRoute } from "@/lib/storefront-route-context";

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
  resolveImageSrc?: (src?: string | null) => string,
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
  resolveImageSrc,
}: HeaderSearchOverlayProps) {
  const { locale, buildPath } = useStorefrontRoute();
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
          { signal: controller.signal, cache: "no-store" },
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
  }, [isOpen, locale, normalizedQuery]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!isMounted || !isOpen) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-start justify-center px-4 pt-[15vh]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
          <Search className="h-5 w-5 text-neutral-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ürün ara..."
            className="flex-1 bg-transparent text-base text-neutral-900 placeholder:text-neutral-400 outline-none"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1 rounded-md bg-neutral-100 px-1.5 py-0.5">
              <Command className="h-3 w-3 text-neutral-400" />
              <span className="text-xs text-neutral-500">K</span>
            </div>
          )}
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {normalizedQuery.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 rounded-full bg-neutral-50 p-3">
                <Search className="h-6 w-6 text-neutral-300" />
              </div>
              <p className="text-sm text-neutral-400">Aramak için ürün adı yazmaya başlayın.</p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-800" />
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-neutral-400">Sonuç bulunamadı</p>
            </div>
          ) : (
            <div className="py-2">
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
                    href={buildPath(ROUTES.product(product.slug))}
                    onClick={onClose}
                    className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-neutral-50"
                  >
                    <div className="h-12 w-12 overflow-hidden rounded-lg bg-neutral-100">
                      <img
                        src={getProductImage(product, resolveImageSrc)}
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-900 group-hover:text-neutral-700">
                        {product.name}
                      </p>
                      {price ? (
                        <div className="mt-1 flex items-center gap-2">
                          {originalPriceLabel ? (
                            <p className="text-[11px] text-neutral-400 line-through">
                              {originalPriceLabel}
                            </p>
                          ) : null}
                          <p className="text-xs text-neutral-500">{price}</p>
                        </div>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/50 px-4 py-2 text-xs text-neutral-400">
          <span>{results.length > 0 ? `${Math.min(results.length, MAX_RESULTS)} results` : ""}</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-white px-1.5 py-0.5 font-sans text-[10px] ring-1 ring-neutral-200">ESC</kbd>
              <span>close</span>
            </span>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
