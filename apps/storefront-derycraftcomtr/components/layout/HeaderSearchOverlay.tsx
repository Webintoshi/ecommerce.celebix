"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowUpRight, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ROUTES } from "@/lib/constants";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { cn } from "@/lib/utils";

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

const SEARCH_DELAY_MS = 220;
const MAX_RESULTS = 8;

const SEARCH_COPY = {
  tr: {
    eyebrow: "Dery Craft Koleksiyonu",
    title: "Ne arıyorsunuz?",
    placeholder: "Cüzdan, kayış, kartlık…",
    emptyHint: "En az iki karakter yazın; koleksiyonumuzda sizin için arayalım.",
    popularLabel: "Popüler aramalar",
    loading: "Koleksiyon taranıyor",
    noResults: "Bu aramada ürün bulunamadı.",
    results: (count: number) => `${count} eşleşme`,
    close: "Kapat",
    viewAll: "Tüm ürünleri gör",
  },
  en: {
    eyebrow: "Dery Craft Collection",
    title: "What are you looking for?",
    placeholder: "Wallet, strap, cardholder…",
    emptyHint: "Type at least two characters and we will search the collection for you.",
    popularLabel: "Popular searches",
    loading: "Searching the collection",
    noResults: "No products matched this search.",
    results: (count: number) => `${count} match${count === 1 ? "" : "es"}`,
    close: "Close",
    viewAll: "View all products",
  },
} as const;

const POPULAR_SEARCHES = {
  tr: [
    { label: "Cüzdan & Kartlık", query: "cüzdan" },
    { label: "Apple Watch Kayışı", query: "apple watch" },
    { label: "Saat Kayışı", query: "saat kayış" },
    { label: "Deri Aksesuar", query: "aksesuar" },
  ],
  en: [
    { label: "Wallets & Cardholders", query: "wallet" },
    { label: "Apple Watch Straps", query: "apple watch" },
    { label: "Watch Straps", query: "watch strap" },
    { label: "Leather Accessories", query: "accessory" },
  ],
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

function SearchResultSkeleton() {
  return (
    <div className="flex items-center gap-5 border-b border-neutral-200/70 py-6 last:border-b-0">
      <div className="h-20 w-20 shrink-0 animate-pulse rounded-xl bg-neutral-200/80" />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-200/80" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-neutral-100" />
        <div className="h-3 w-1/4 animate-pulse rounded bg-neutral-100" />
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
  const copy = SEARCH_COPY[isEnglish ? "en" : "tr"];
  const popularSearches = POPULAR_SEARCHES[isEnglish ? "en" : "tr"];
  const [isMounted, setIsMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchProductResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim();
  const visibleCount = Math.min(results.length, MAX_RESULTS);
  const hasQuery = normalizedQuery.length >= 2;
  const showResults = hasQuery && !isLoading && results.length > 0;
  const showEmpty = hasQuery && !isLoading && results.length === 0;

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

    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 120);

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

  if (!isMounted) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key="search-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[120]"
          role="dialog"
          aria-modal="true"
          aria-label={copy.title}
        >
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-neutral-950/72 backdrop-blur-md"
            aria-label={copy.close}
            onClick={onClose}
          />

          <motion.div
            initial={{ y: "-8%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "-4%", opacity: 0 }}
            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none absolute inset-x-0 top-0 flex min-h-[min(100vh,920px)] justify-center"
          >
            <div
              className="pointer-events-auto relative flex w-full max-w-5xl flex-col px-5 pb-10 pt-6 sm:px-8 sm:pb-14 sm:pt-8 md:px-12"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-[#8B6914]/70 to-transparent sm:inset-x-8 md:inset-x-12" />

              <div className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,#FFFFFF_0%,#F8F6F2_48%,#F3F0EA_100%)] shadow-[0_40px_120px_rgba(15,23,42,0.28)] sm:rounded-[2.5rem]">
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.35]"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 20% 0%, rgba(139,105,20,0.08), transparent 42%), radial-gradient(circle at 80% 100%, rgba(26,26,26,0.04), transparent 36%)",
                  }}
                />

                <div className="relative flex items-start justify-between gap-6 px-6 pb-2 pt-7 sm:px-10 sm:pt-9">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8B6914]">
                      {copy.eyebrow}
                    </p>
                    <h2 className="mt-3 font-serif text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] text-neutral-950 sm:text-[2.65rem]">
                      {copy.title}
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={onClose}
                    className="group inline-flex shrink-0 items-center gap-2 rounded-full border border-neutral-200/90 bg-white/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-600 transition-all hover:border-neutral-300 hover:text-neutral-950"
                    aria-label={copy.close}
                  >
                    <span className="hidden sm:inline">{copy.close}</span>
                    <X className="h-4 w-4 transition-transform group-hover:rotate-90" strokeWidth={1.75} />
                  </button>
                </div>

                <div className="relative px-6 sm:px-10">
                  <div className="flex items-center gap-4 border-b border-neutral-200/80 pb-4">
                    <Search
                      className={cn(
                        "h-5 w-5 shrink-0 transition-colors duration-300",
                        isFocused ? "text-[#8B6914]" : "text-neutral-400",
                      )}
                      strokeWidth={1.75}
                      aria-hidden="true"
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
                      className="min-w-0 flex-1 bg-transparent font-serif text-[1.35rem] text-neutral-950 placeholder:text-neutral-400/90 outline-none sm:text-[1.75rem]"
                    />
                    {query ? (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500 transition-colors hover:text-neutral-900"
                      >
                        {isEnglish ? "Clear" : "Temizle"}
                      </button>
                    ) : null}
                  </div>

                  <motion.div
                    className="h-px bg-[#8B6914]"
                    initial={false}
                    animate={{
                      scaleX: isFocused || query ? 1 : 0.12,
                      opacity: isFocused || query ? 1 : 0.45,
                    }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    style={{ transformOrigin: "left center" }}
                  />
                </div>

                <div className="relative max-h-[min(52vh,520px)] overflow-y-auto px-6 sm:px-10">
                  {!hasQuery ? (
                    <div className="py-8 sm:py-10">
                      <p className="max-w-xl font-sans text-sm leading-relaxed text-neutral-500">
                        {copy.emptyHint}
                      </p>

                      <div className="mt-8">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-400">
                          {copy.popularLabel}
                        </p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {popularSearches.map((item, index) => (
                            <motion.button
                              key={item.label}
                              type="button"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.05 * index, duration: 0.3 }}
                              onClick={() => setQuery(item.query)}
                              className="group flex items-center justify-between rounded-2xl border border-neutral-200/80 bg-white/70 px-5 py-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-[#8B6914]/35 hover:bg-white hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
                            >
                              <span className="font-sans text-[13px] font-medium uppercase tracking-[0.14em] text-neutral-800 transition-colors group-hover:text-neutral-950">
                                {item.label}
                              </span>
                              <ArrowUpRight
                                className="h-4 w-4 text-neutral-300 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#8B6914]"
                                strokeWidth={1.75}
                              />
                            </motion.button>
                          ))}
                        </div>
                      </div>

                      <div className="mt-8 border-t border-neutral-200/70 pt-6">
                        <Link
                          href={buildPath(ROUTES.products)}
                          onClick={onClose}
                          className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-700 transition-colors hover:text-[#8B6914]"
                        >
                          {copy.viewAll}
                          <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
                        </Link>
                      </div>
                    </div>
                  ) : isLoading ? (
                    <div className="py-6">
                      <div className="mb-6 flex items-center gap-3">
                        <div className="h-px flex-1 bg-neutral-200" />
                        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-400">
                          {copy.loading}
                        </span>
                        <div className="h-px flex-1 bg-neutral-200" />
                      </div>
                      <SearchResultSkeleton />
                      <SearchResultSkeleton />
                      <SearchResultSkeleton />
                    </div>
                  ) : showEmpty ? (
                    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
                      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-neutral-200 bg-white">
                        <Search className="h-6 w-6 text-neutral-300" strokeWidth={1.5} aria-hidden="true" />
                      </div>
                      <p className="font-serif text-xl text-neutral-800">{copy.noResults}</p>
                      <p className="mt-2 max-w-sm font-sans text-sm text-neutral-500">
                        {isEnglish
                          ? "Try another keyword or browse the full collection."
                          : "Farklı bir anahtar kelime deneyin veya tüm koleksiyona göz atın."}
                      </p>
                      <Link
                        href={buildPath(ROUTES.products)}
                        onClick={onClose}
                        className="mt-6 inline-flex items-center gap-2 border-b border-neutral-900 pb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-900 transition-colors hover:border-[#8B6914] hover:text-[#8B6914]"
                      >
                        {copy.viewAll}
                      </Link>
                    </div>
                  ) : showResults ? (
                    <motion.div
                      initial="hidden"
                      animate="visible"
                      variants={{
                        hidden: {},
                        visible: { transition: { staggerChildren: 0.05 } },
                      }}
                      className="py-2"
                    >
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
                          <motion.div
                            key={product.id}
                            variants={{
                              hidden: { opacity: 0, y: 12 },
                              visible: { opacity: 1, y: 0 },
                            }}
                          >
                            <Link
                              href={buildPath(ROUTES.product(product.slug))}
                              onClick={onClose}
                              className="group flex items-center gap-5 border-b border-neutral-200/70 py-6 transition-colors last:border-b-0 hover:bg-white/55"
                            >
                              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-neutral-200/80 bg-neutral-100 shadow-[0_10px_24px_rgba(15,23,42,0.06)] sm:h-24 sm:w-24">
                                <img
                                  src={getProductImage(product, resolveImageSrc)}
                                  alt={product.name}
                                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                {product.category ? (
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8B6914]">
                                    {product.category}
                                  </p>
                                ) : null}
                                <p className="mt-1 truncate font-serif text-lg text-neutral-950 transition-colors group-hover:text-neutral-700 sm:text-xl">
                                  {product.name}
                                </p>
                                {price ? (
                                  <div className="mt-2 flex items-center gap-2">
                                    {originalPriceLabel ? (
                                      <p className="font-sans text-xs text-neutral-400 line-through">
                                        {originalPriceLabel}
                                      </p>
                                    ) : null}
                                    <p className="font-sans text-sm font-medium text-neutral-800">{price}</p>
                                  </div>
                                ) : null}
                              </div>
                              <ArrowUpRight
                                className="h-5 w-5 shrink-0 text-neutral-300 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-neutral-900"
                                strokeWidth={1.75}
                              />
                            </Link>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  ) : null}
                </div>

                <div className="relative flex items-center justify-between border-t border-neutral-200/80 px-6 py-4 sm:px-10">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
                    {visibleCount > 0 ? copy.results(visibleCount) : ""}
                  </span>
                  <span className="hidden items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-neutral-400 sm:flex">
                    <kbd className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 font-sans text-[10px] text-neutral-500">
                      ESC
                    </kbd>
                    {copy.close.toLowerCase()}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
