"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ROUTES } from "@/lib/constants";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { cn, formatPrice } from "@/lib/utils";
import { HeaderIconClose, HeaderIconSearch } from "@/components/layout/HeaderIcons";

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
};

type HeaderSearchOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
  resolveImageSrc?: (src?: string | null) => string;
};

const SEARCH_DELAY_MS = 220;
const MAX_RESULTS = 6;

const COPY = {
  tr: {
    placeholder: "Mağazada ara",
    loading: "Aranıyor…",
    noResults: "Sonuç bulunamadı.",
    hint: "En az 2 karakter yazın.",
    close: "Kapat",
  },
  en: {
    placeholder: "Search the store",
    loading: "Searching…",
    noResults: "No results found.",
    hint: "Type at least 2 characters.",
    close: "Close",
  },
} as const;

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
  const copy = COPY[locale === "en" ? "en" : "tr"];
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchProductResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim();
  const hasQuery = normalizedQuery.length >= 2;
  const showResults = hasQuery && !isLoading && results.length > 0;
  const showEmpty = hasQuery && !isLoading && results.length === 0;

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults([]);
      return;
    }

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(focusTimer);
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

  return (
    <>
      <AnimatePresence>
        {isOpen ? (
          <motion.button
            type="button"
            key="search-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-neutral-950/45"
            aria-label={copy.close}
            onClick={onClose}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            key="search-panel"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-[60] border-t border-neutral-200 bg-[#ECECEC]"
            role="dialog"
            aria-modal="true"
            aria-label={copy.placeholder}
          >
            <div className="container-premium py-3 sm:py-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <label className="relative mx-auto flex w-full max-w-2xl flex-1 items-center border border-neutral-900/15 bg-white px-4 py-2.5 sm:px-5 sm:py-3">
                  <input
                    ref={inputRef}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={copy.placeholder}
                    autoComplete="off"
                    className="min-w-0 flex-1 bg-transparent font-sans text-sm text-neutral-900 placeholder:text-neutral-400 outline-none sm:text-[15px]"
                  />
                  <HeaderIconSearch className="text-neutral-900" size={20} />
                </label>

                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-neutral-900 transition-opacity hover:opacity-60"
                  aria-label={copy.close}
                >
                  <HeaderIconClose size={22} />
                </button>
              </div>

              {(showResults || showEmpty || isLoading || (!hasQuery && query.length > 0)) && (
                <div className="mx-auto mt-3 max-h-[min(52vh,420px)] w-full max-w-2xl overflow-y-auto border border-neutral-900/10 bg-white">
                  {isLoading ? (
                    <div className="px-5 py-8 text-center font-sans text-sm text-neutral-500">
                      {copy.loading}
                    </div>
                  ) : showEmpty ? (
                    <div className="px-5 py-8 text-center font-sans text-sm text-neutral-500">
                      {copy.noResults}
                    </div>
                  ) : showResults ? (
                    <ul className="divide-y divide-neutral-100">
                      {results.slice(0, MAX_RESULTS).map((product) => {
                        const firstVariant = product.variants?.[0];
                        const price =
                          typeof firstVariant?.price === "number"
                            ? formatPrice(firstVariant.price)
                            : null;

                        return (
                          <li key={product.id}>
                            <Link
                              href={buildPath(ROUTES.product(product.slug))}
                              onClick={onClose}
                              className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-neutral-50 sm:px-5 sm:py-4"
                            >
                              <div className="h-14 w-14 shrink-0 overflow-hidden bg-neutral-50 sm:h-16 sm:w-16">
                                <img
                                  src={getProductImage(product, resolveImageSrc)}
                                  alt={product.name}
                                  className="h-full w-full object-contain p-1"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-serif text-sm text-neutral-900 group-hover:text-neutral-600 sm:text-[15px]">
                                  {product.name}
                                </p>
                                {price ? (
                                  <p className="mt-1 font-serif text-sm text-neutral-700">{price}</p>
                                ) : null}
                              </div>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="px-5 py-6 text-center font-sans text-sm text-neutral-500">
                      {copy.hint}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
