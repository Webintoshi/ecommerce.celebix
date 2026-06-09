"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Search, X } from "lucide-react";
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

const SEARCH_COPY = {
  tr: {
    title: "Ürün Ara",
    placeholder: "Ürün ara...",
    emptyHint: "Aramak için en az 2 karakter yazın.",
    loading: "Aranıyor...",
    noResults: "Sonuç bulunamadı.",
    results: (count: number) => `${count} sonuç`,
    close: "Kapat",
    clear: "Temizle",
  },
  en: {
    title: "Search Products",
    placeholder: "Search products...",
    emptyHint: "Type at least 2 characters to search.",
    loading: "Searching...",
    noResults: "No results found.",
    results: (count: number) => `${count} result${count === 1 ? "" : "s"}`,
    close: "Close",
    clear: "Clear",
  },
} as const;

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

function getSearchShortcutLabel() {
  if (typeof navigator === "undefined") {
    return "Ctrl+K";
  }

  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? "⌘K" : "Ctrl+K";
}

export function HeaderSearchOverlay({
  isOpen,
  onClose,
  resolveImageSrc,
}: HeaderSearchOverlayProps) {
  const { locale, buildPath } = useStorefrontRoute();
  const copy = SEARCH_COPY[locale === "en" ? "en" : "tr"];
  const [isMounted, setIsMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchProductResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim();
  const shortcutLabel = getSearchShortcutLabel();
  const visibleCount = Math.min(results.length, MAX_RESULTS);

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
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 50);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || normalizedQuery.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/products?search=${encodeURIComponent(normalizedQuery)}&locale=${locale}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const data = (await res.json()) as SearchProductsResponse;
        setResults(Array.isArray(data.products) ? data.products : []);
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, SEARCH_DELAY_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
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
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center px-4 pt-[12vh] sm:pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
    >
      <motion.button
        type="button"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-neutral-950/45 backdrop-blur-[2px]"
        aria-label={copy.close}
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, y: -16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-neutral-200 bg-[#F8F8F8F8] shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200/80 px-5 py-4">
          <p className="font-serif text-lg text-neutral-900">{copy.title}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-neutral-500 transition-colors hover:bg-white hover:text-neutral-900"
            aria-label={copy.close}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 transition-colors focus-within:border-neutral-300">
            <Search className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.placeholder}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent font-sans text-[15px] text-neutral-900 placeholder:text-neutral-400 outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
              >
                {copy.clear}
              </button>
            ) : (
              <kbd className="hidden shrink-0 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 font-sans text-[11px] text-neutral-500 sm:inline">
                {shortcutLabel}
              </kbd>
            )}
          </div>
        </div>

        <div className="max-h-[min(50vh,420px)] overflow-y-auto border-t border-neutral-200/80">
          {normalizedQuery.length < 2 ? (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <div className="mb-4 rounded-full border border-neutral-200 bg-white p-3">
                <Search className="h-5 w-5 text-neutral-300" aria-hidden="true" />
              </div>
              <p className="font-sans text-sm text-neutral-500">{copy.emptyHint}</p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center gap-2 px-6 py-14">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-800" />
              <span className="font-sans text-sm text-neutral-500">{copy.loading}</span>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <p className="font-sans text-sm text-neutral-500">{copy.noResults}</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-200/80 py-1">
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
                    className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/80"
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100">
                      <img
                        src={getProductImage(product, resolveImageSrc)}
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-sans text-sm font-medium text-neutral-900 group-hover:text-neutral-700">
                        {product.name}
                      </p>
                      {product.category ? (
                        <p className="mt-0.5 truncate font-sans text-xs text-neutral-400">
                          {product.category}
                        </p>
                      ) : null}
                      {price ? (
                        <div className="mt-1 flex items-center gap-2">
                          {originalPriceLabel ? (
                            <p className="font-sans text-[11px] text-neutral-400 line-through">
                              {originalPriceLabel}
                            </p>
                          ) : null}
                          <p className="font-sans text-xs font-medium text-neutral-700">{price}</p>
                        </div>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-neutral-200/80 bg-white/70 px-5 py-2.5 text-xs text-neutral-500">
          <span className="font-sans">
            {visibleCount > 0 ? copy.results(visibleCount) : ""}
          </span>
          <span className="flex items-center gap-1.5 font-sans">
            <kbd className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[10px] text-neutral-500">
              ESC
            </kbd>
            <span>{copy.close.toLowerCase()}</span>
          </span>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
