"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { type StorefrontLocale, buildLocalizedPath } from "@/lib/i18n";

type SearchProductResult = {
  id: string;
  name: string;
  slug: string;
  category?: string | null;
  categoryLabel?: string | null;
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
  locale?: StorefrontLocale;
};

const SEARCH_DELAY_MS = 250;
const MAX_RESULTS = 8;

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
  resolveImageSrc,
  locale = "tr",
}: HeaderSearchOverlayProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchProductResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previousBodyOverflowRef = useRef<string | null>(null);
  const normalizedQuery = query.trim();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults([]);
      setIsLoading(false);
      setErrorMessage("");
      return;
    }

    previousBodyOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimeout = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 40);

    return () => {
      window.clearTimeout(focusTimeout);
      document.body.style.overflow = previousBodyOverflowRef.current ?? "";
      previousBodyOverflowRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (normalizedQuery.length < 2) {
      setResults([]);
      setIsLoading(false);
      setErrorMessage("");
      return;
    }

    const controller = new AbortController();
    const searchTimeout = window.setTimeout(async () => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch(
          `/api/products?search=${encodeURIComponent(normalizedQuery)}&locale=${encodeURIComponent(locale)}`,
          {
            signal: controller.signal,
            cache: "no-store",
          }
        );

        const payload = (await response.json()) as SearchProductsResponse;

        if (!response.ok || payload.success === false) {
          throw new Error(payload.error || "Arama basarisiz");
        }

        setResults(Array.isArray(payload.products) ? payload.products : []);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        console.error("Header search request failed:", error);
        setResults([]);
        setErrorMessage("Arama sonuclari su anda alinamiyor.");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, SEARCH_DELAY_MS);

    return () => {
      controller.abort();
      window.clearTimeout(searchTimeout);
    };
  }, [isOpen, normalizedQuery]);

  if (!isMounted || !isOpen) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[120]">
      <div
        className="absolute inset-0 bg-neutral-950/25 backdrop-blur-2xl"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative flex h-full w-full items-start justify-center p-4 sm:p-8">
        <div
          className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-white/60 bg-[rgba(248,248,248,0.96)] shadow-[0_40px_120px_rgba(15,22,38,0.18)]"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Urun arama penceresi"
        >
          <div className="border-b border-neutral-200 px-5 py-5 sm:px-8 sm:py-7">
            <div className="flex items-start gap-4">
              <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-neutral-900 shadow-sm sm:flex">
                <Search className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">
                  Hizli Arama
                </p>
                <form
                  className="mt-3"
                  onSubmit={(event) => event.preventDefault()}
                >
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
                    <input
                      ref={inputRef}
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Urun, kategori veya model ara..."
                      className="h-14 w-full rounded-2xl border border-neutral-200 bg-white pl-12 pr-14 text-base font-medium text-neutral-900 outline-none transition focus:border-neutral-400"
                    />
                    {query ? (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-800"
                        aria-label="Aramayi temizle"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </form>
                <p className="mt-3 text-sm text-neutral-500">
                  En az 2 karakter yazin. Sonuclar yazdikca otomatik gelir.
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-900"
                aria-label="Aramayi kapat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-7">
            {normalizedQuery.length < 2 ? (
              <div className="flex h-full min-h-[280px] items-center justify-center rounded-[1.75rem] border border-dashed border-neutral-200 bg-white/70 px-6 text-center">
                <div>
                  <p className="text-lg font-semibold text-neutral-900">
                    Arama hazir
                  </p>
                  <p className="mt-2 text-sm text-neutral-500">
                    Popupta ajax arama acik. Urun ismini yazmaya baslayin.
                  </p>
                </div>
              </div>
            ) : isLoading ? (
              <div className="flex h-full min-h-[280px] items-center justify-center rounded-[1.75rem] border border-neutral-200 bg-white/70 px-6 text-center">
                <div>
                  <p className="text-lg font-semibold text-neutral-900">
                    Araniyor...
                  </p>
                  <p className="mt-2 text-sm text-neutral-500">
                    Sonuclar anlik olarak getiriliyor.
                  </p>
                </div>
              </div>
            ) : errorMessage ? (
              <div className="flex h-full min-h-[280px] items-center justify-center rounded-[1.75rem] border border-neutral-200 bg-white/70 px-6 text-center">
                <div>
                  <p className="text-lg font-semibold text-neutral-900">
                    Arama su an calismiyor
                  </p>
                  <p className="mt-2 text-sm text-neutral-500">{errorMessage}</p>
                </div>
              </div>
            ) : results.length === 0 ? (
              <div className="flex h-full min-h-[280px] items-center justify-center rounded-[1.75rem] border border-neutral-200 bg-white/70 px-6 text-center">
                <div>
                  <p className="text-lg font-semibold text-neutral-900">
                    Sonuc bulunamadi
                  </p>
                  <p className="mt-2 text-sm text-neutral-500">
                    Farkli bir urun veya model ismi deneyin.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    Sonuclar
                  </p>
                  <p className="text-sm text-neutral-500">
                    {Math.min(results.length, MAX_RESULTS)} urun
                  </p>
                </div>

                {results.slice(0, MAX_RESULTS).map((product) => {
                  const firstVariant = product.variants?.[0];
                  const priceLabel = formatPrice(firstVariant?.price);
                  const originalPrice =
                    typeof firstVariant?.originalPrice === "number"
                      ? firstVariant.originalPrice
                      : typeof firstVariant?.original_price === "number"
                        ? firstVariant.original_price
                        : null;
                  const originalPriceLabel =
                    typeof originalPrice === "number" && typeof firstVariant?.price === "number" && originalPrice > firstVariant.price
                      ? formatPrice(originalPrice)
                      : null;

                  return (
                    <Link
                      key={product.id}
                      href={buildLocalizedPath(ROUTES.product(product.slug), locale)}
                      onClick={onClose}
                      className="flex items-center gap-4 rounded-[1.5rem] border border-neutral-200 bg-white p-3 transition hover:border-neutral-300 hover:shadow-sm"
                    >
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[1.25rem] bg-neutral-100">
                        <img
                          src={getProductImage(product, resolveImageSrc)}
                          alt={product.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                          {product.categoryLabel || product.category || "Urun"}
                        </p>
                        <p className="store-product-title mt-1 text-neutral-900">
                          {product.name}
                        </p>
                        {priceLabel ? (
                          <div className="mt-2 flex items-center gap-2">
                            {originalPriceLabel ? (
                              <p className="text-xs text-neutral-400 line-through">
                                {originalPriceLabel}
                              </p>
                            ) : null}
                            <p className="text-sm font-medium text-neutral-600">
                              {priceLabel}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
