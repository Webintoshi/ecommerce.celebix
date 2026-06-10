"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ROUTES } from "@/lib/constants";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
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
    title: "Koleksiyonda ara",
    placeholder: "Cüzdan, kayış, kartlık…",
    loading: "Aranıyor",
    noResults: "Bu aramada ürün bulunamadı.",
    hint: "En az 2 karakter yazın.",
    popular: "Popüler aramalar",
    clear: "Temizle",
    close: "Kapat",
    viewAll: "Tüm ürünler",
  },
  en: {
    title: "Search the collection",
    placeholder: "Wallet, strap, cardholder…",
    loading: "Searching",
    noResults: "No products matched this search.",
    hint: "Type at least 2 characters.",
    popular: "Popular searches",
    clear: "Clear",
    close: "Close",
    viewAll: "All products",
  },
} as const;

const POPULAR = {
  tr: ["cüzdan", "apple watch", "saat kayış", "kartlık"],
  en: ["wallet", "apple watch", "watch strap", "cardholder"],
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

function ResultSkeleton() {
  return (
    <div className="flex items-center gap-4 px-1 py-3">
      <div className="h-14 w-14 shrink-0 animate-pulse bg-neutral-100" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-neutral-100" />
        <div className="h-3 w-1/4 animate-pulse rounded bg-neutral-50" />
      </div>
    </div>
  );
}

export function HeaderSearchOverlay({
  isOpen,
  onClose,
  resolveImageSrc,
}: HeaderSearchOverlayProps) {
  const { locale, buildPath } = useStorefrontRoute();
  const isEnglish = locale === "en";
  const copy = COPY[isEnglish ? "en" : "tr"];
  const popularItems = POPULAR[isEnglish ? "en" : "tr"];
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchProductResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim();
  const hasQuery = normalizedQuery.length >= 2;
  const showResults = hasQuery && !isLoading && results.length > 0;
  const showEmpty = hasQuery && !isLoading && results.length === 0;
  const showPanel = showResults || showEmpty || isLoading || query.length > 0;

  useBodyScrollLock(isOpen);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults([]);
      setIsFocused(false);
      return;
    }

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 100);
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

  return isMounted
    ? createPortal(
        <>
          <AnimatePresence>
            {isOpen ? (
              <motion.button
                type="button"
                key="search-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="fixed inset-0 z-[9990] bg-neutral-950/55 backdrop-blur-[3px]"
                aria-label={copy.close}
                onClick={onClose}
              />
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {isOpen ? (
              <motion.div
                key="search-panel"
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="fixed inset-x-0 top-0 z-[9991] max-h-[min(100dvh,100vh)] overflow-y-auto border-b border-neutral-200/80 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.12)]"
                role="dialog"
                aria-modal="true"
                aria-label={copy.title}
              >
                <div className="container-premium py-6 sm:py-8">
                  <div className="mx-auto max-w-3xl">
                    <div className="mb-5 flex items-center justify-between gap-4">
                      <p className="font-serif text-[1.35rem] text-neutral-950 sm:text-[1.5rem]">
                        {copy.title}
                      </p>
                      <button
                        type="button"
                        onClick={onClose}
                        className="group inline-flex min-h-11 min-w-11 items-center justify-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-500 transition-colors hover:text-neutral-900"
                        aria-label={copy.close}
                      >
                        <span className="hidden sm:inline">{copy.close}</span>
                        <HeaderIconClose
                          size={20}
                          className="transition-transform group-hover:rotate-90"
                        />
                      </button>
                    </div>

                    <div
                      className={cn(
                        "flex items-center gap-4 border-b pb-3 transition-colors duration-300",
                        isFocused || query ? "border-[#8B6914]" : "border-neutral-200",
                      )}
                    >
                      <HeaderIconSearch
                        size={22}
                        className={cn(
                          "shrink-0 transition-colors",
                          isFocused || query ? "text-[#8B6914]" : "text-neutral-400",
                        )}
                      />
                      <input
                        ref={inputRef}
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        placeholder={copy.placeholder}
                        autoComplete="off"
                        className="min-w-0 flex-1 bg-transparent font-serif text-xl text-neutral-900 placeholder:text-neutral-400/90 outline-none sm:text-[1.65rem]"
                      />
                      {query ? (
                        <button
                          type="button"
                          onClick={() => setQuery("")}
                          className="inline-flex min-h-11 shrink-0 items-center px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400 transition-colors hover:text-neutral-800"
                        >
                          {copy.clear}
                        </button>
                      ) : null}
                    </div>

                    {!hasQuery && !query ? (
                      <div className="mt-6">
                        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-400">
                          {copy.popular}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {popularItems.map((term) => (
                            <button
                              key={term}
                              type="button"
                              onClick={() => setQuery(term)}
                              className="rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2.5 font-sans text-[12px] text-neutral-700 transition-colors hover:border-[#8B6914]/40 hover:bg-white hover:text-neutral-900"
                            >
                              {term}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <AnimatePresence initial={false}>
                      {showPanel ? (
                        <motion.div
                          key="search-results"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="mt-5 max-h-[min(50vh,400px)] overflow-y-auto border border-neutral-100 bg-[#FAFAFA]">
                            {isLoading ? (
                              <div className="px-4 py-3 sm:px-5">
                                <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-neutral-400">
                                  {copy.loading}
                                </p>
                                <ResultSkeleton />
                                <ResultSkeleton />
                              </div>
                            ) : showEmpty ? (
                              <div className="px-5 py-10 text-center">
                                <p className="font-serif text-lg text-neutral-800">{copy.noResults}</p>
                                <Link
                                  href={buildPath(ROUTES.products)}
                                  onClick={onClose}
                                  className="mt-4 inline-block text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-600 underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-[#8B6914]"
                                >
                                  {copy.viewAll}
                                </Link>
                              </div>
                            ) : showResults ? (
                              <ul>
                                {results.slice(0, MAX_RESULTS).map((product) => {
                                  const firstVariant = product.variants?.[0];
                                  const price =
                                    typeof firstVariant?.price === "number"
                                      ? formatPrice(firstVariant.price)
                                      : null;

                                  return (
                                    <li key={product.id} className="border-b border-neutral-100 last:border-0">
                                      <Link
                                        href={buildPath(ROUTES.product(product.slug))}
                                        onClick={onClose}
                                        className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-white sm:px-5 sm:py-4"
                                      >
                                        <div className="h-14 w-14 shrink-0 overflow-hidden bg-white sm:h-16 sm:w-16">
                                          <img
                                            src={getProductImage(product, resolveImageSrc)}
                                            alt={product.name}
                                            className="h-full w-full object-contain p-1.5"
                                          />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate font-serif text-[15px] text-neutral-900 transition-colors group-hover:text-neutral-600">
                                            {product.name}
                                          </p>
                                          {price ? (
                                            <p className="mt-1 font-serif text-sm text-neutral-600">
                                              {price}
                                            </p>
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
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>,
        document.body,
      )
    : null;
}
