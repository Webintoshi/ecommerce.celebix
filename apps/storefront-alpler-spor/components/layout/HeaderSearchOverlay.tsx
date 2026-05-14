"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { useStorefrontRoute } from "@/lib/storefront-route-context";

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
}: HeaderSearchOverlayProps) {
  const { locale, buildPath } = useStorefrontRoute();
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
          throw new Error(payload.error || "Arama başarısız");
        }

        setResults(Array.isArray(payload.products) ? payload.products : []);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        console.error("Header search request failed:", error);
        setResults([]);
        setErrorMessage("Arama sonuçları şu anda alınamıyor.");
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
        className="absolute inset-0 bg-[#0B0F14]/70 backdrop-blur-xl"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative flex h-full w-full items-start justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-8">
        <div
          className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#F5F7FA] shadow-[0_40px_120px_rgba(0,0,0,0.35)] sm:rounded-[2rem]"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Ürün arama penceresi"
        >
          <div className="border-b border-[#E5E7EB] bg-white px-4 py-4 sm:px-8 sm:py-7">
            <div className="flex items-start gap-4">
              <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#111827] text-[#FF6A00] shadow-sm sm:flex">
                <Search className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#FF6A00]">
                  Alpler Spor Arama
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
                      placeholder="Sneaker, forma, ayakkabı veya kategori ara..."
                      className="h-14 w-full rounded-2xl border border-[#D1D5DB] bg-white pl-12 pr-14 text-base font-semibold text-[#111827] outline-none transition focus:border-[#FF6A00] focus:ring-4 focus:ring-[#FF6A00]/15"
                    />
                    {query ? (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-800"
                        aria-label="Aramayı temizle"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </form>
                <p className="mt-3 text-sm text-neutral-500">
                  En az 2 karakter yazın. Sonuçlar dinamik ürün verisinden gelir.
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white text-[#6B7280] transition hover:border-[#FF6A00] hover:text-[#FF6A00]"
                aria-label="Aramayı kapat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-8 sm:py-7">
            {normalizedQuery.length < 2 ? (
              <div className="flex h-full min-h-[280px] items-center justify-center rounded-[1.75rem] border border-dashed border-[#D1D5DB] bg-white px-6 text-center">
                <div>
                  <p className="text-lg font-black text-[#111827]">
                    Arama hazır
                  </p>
                  <p className="mt-2 text-sm text-[#6B7280]">
                    Ürün, model veya kategori ismini yazmaya başlayın.
                  </p>
                </div>
              </div>
            ) : isLoading ? (
              <div className="flex h-full min-h-[280px] items-center justify-center rounded-[1.75rem] border border-[#E5E7EB] bg-white px-6 text-center">
                <div>
                  <p className="text-lg font-black text-[#111827]">
                    Araniyor...
                  </p>
                  <p className="mt-2 text-sm text-[#6B7280]">
                    Sonuclar anlik olarak getiriliyor.
                  </p>
                </div>
              </div>
            ) : errorMessage ? (
              <div className="flex h-full min-h-[280px] items-center justify-center rounded-[1.75rem] border border-[#E5E7EB] bg-white px-6 text-center">
                <div>
                  <p className="text-lg font-black text-[#111827]">
                    Arama su an calismiyor
                  </p>
                  <p className="mt-2 text-sm text-neutral-500">{errorMessage}</p>
                </div>
              </div>
            ) : results.length === 0 ? (
              <div className="flex h-full min-h-[280px] items-center justify-center rounded-[1.75rem] border border-[#E5E7EB] bg-white px-6 text-center">
                <div>
                  <p className="text-lg font-black text-[#111827]">
                    Sonuc bulunamadi
                  </p>
                  <p className="mt-2 text-sm text-neutral-500">
                    Aramanizla eslesen urun bulunamadi. Farkli bir urun veya model ismi deneyin.
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
                      href={buildPath(ROUTES.product(product.slug))}
                      onClick={onClose}
                    className="flex items-center gap-4 rounded-[1.5rem] border border-[#E5E7EB] bg-white p-3 transition hover:border-[#FF6A00]/40 hover:shadow-sm"
                    >
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[1.25rem] bg-[#EEF2F7]">
                        <img
                          src={getProductImage(product, resolveImageSrc)}
                          alt={product.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#6B7280]">
                          {product.categoryLabel || product.category || "Ürün"}
                        </p>
                        <p className="store-product-title mt-1 text-[#111827]">
                          {product.name}
                        </p>
                        {priceLabel ? (
                          <div className="mt-2 flex items-center gap-2">
                            {originalPriceLabel ? (
                              <p className="text-xs text-neutral-400 line-through">
                                {originalPriceLabel}
                              </p>
                            ) : null}
                            <p className="text-sm font-black text-[#DC2626]">
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
