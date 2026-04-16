"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { type StorefrontLocale, buildLocalizedPath } from "@/lib/i18n";
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

type QuickLink = {
  label: string;
  href: string;
};

type HeaderSearchOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
  resolveImageSrc?: (src?: string | null) => string;
  locale?: StorefrontLocale;
  quickLinks?: QuickLink[];
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
  locale = "tr",
  quickLinks = [],
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
          `/api/products?search=${encodeURIComponent(normalizedQuery)}`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
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
        className="absolute inset-0 bg-[#2A1E1A]/30 backdrop-blur-xl"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative flex h-full w-full items-start justify-center p-4 sm:p-6 lg:p-8">
        <div
          className="soft-panel flex h-full w-full max-w-5xl flex-col overflow-hidden"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Urun arama penceresi"
        >
          <div className="border-b border-[var(--store-border)] px-5 py-5 sm:px-8 sm:py-7">
            <div className="flex items-start gap-4">
              <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-[24px] border border-[var(--store-border)] bg-white text-[var(--store-ink)] shadow-[var(--store-shadow-soft)] sm:flex">
                <Search className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="section-eyebrow">Hizli Kesif</p>
                <form className="mt-3" onSubmit={(event) => event.preventDefault()}>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--store-muted)]" />
                    <input
                      ref={inputRef}
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Buket, orkide, gul ya da urun adi ara..."
                      className="h-14 w-full rounded-[24px] border border-[var(--store-border-strong)] bg-white pl-12 pr-14 text-base font-medium text-[var(--store-ink)] outline-none transition focus:border-[var(--store-accent)]"
                    />
                    {query ? (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[var(--store-muted)] transition hover:bg-[var(--store-surface-alt)] hover:text-[var(--store-ink)]"
                        aria-label="Aramayi temizle"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </form>

                <div className="mt-4 flex flex-wrap gap-2">
                  {quickLinks.slice(0, 6).map((link) => (
                    <Link
                      key={`${link.href}-${link.label}`}
                      href={buildLocalizedPath(link.href, locale)}
                      onClick={onClose}
                      className="rounded-full border border-[var(--store-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--store-ink-soft)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)]"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[22px] border border-[var(--store-border)] bg-white text-[var(--store-muted)] transition hover:border-[var(--store-border-strong)] hover:text-[var(--store-ink)]"
                aria-label="Aramayi kapat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-7">
            {normalizedQuery.length < 2 ? (
              <div className="flex min-h-[320px] items-center rounded-[28px] border border-dashed border-[var(--store-border)] bg-white/75 px-6">
                <div className="mx-auto max-w-xl text-center">
                  <p className="section-title text-[var(--store-ink)]">Kesif icin yazmaya basla</p>
                  <p className="section-copy mt-3">
                    En az 2 karakter yaz. Arama acikken urunler, kategoriye yakin eslesmeler ve hizli gecisler anlik guncellenir.
                  </p>
                </div>
              </div>
            ) : isLoading ? (
              <div className="flex min-h-[320px] items-center rounded-[28px] border border-[var(--store-border)] bg-white/75 px-6">
                <div className="mx-auto text-center">
                  <p className="section-title text-[var(--store-ink)]">Araniyor</p>
                  <p className="section-copy mt-3">
                    Uygun urunler yukleniyor.
                  </p>
                </div>
              </div>
            ) : errorMessage ? (
              <div className="flex min-h-[320px] items-center rounded-[28px] border border-[var(--store-border)] bg-white/75 px-6">
                <div className="mx-auto max-w-xl text-center">
                  <p className="section-title text-[var(--store-ink)]">Arama su an kullanilamiyor</p>
                  <p className="section-copy mt-3">{errorMessage}</p>
                </div>
              </div>
            ) : results.length === 0 ? (
              <div className="flex min-h-[320px] items-center rounded-[28px] border border-[var(--store-border)] bg-white/75 px-6">
                <div className="mx-auto max-w-xl text-center">
                  <p className="section-title text-[var(--store-ink)]">Sonuc bulunamadi</p>
                  <p className="section-copy mt-3">
                    Farkli bir urun adi dene ya da hazir kisayollardan devam et.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {quickLinks.slice(0, 4).map((link) => (
                      <Link
                        key={`empty-${link.href}-${link.label}`}
                        href={buildLocalizedPath(link.href, locale)}
                        onClick={onClose}
                        className="rounded-full border border-[var(--store-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--store-ink-soft)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)]"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="section-eyebrow">Sonuclar</p>
                  <p className="text-sm text-[var(--store-muted)]">
                    {Math.min(results.length, MAX_RESULTS)} urun
                  </p>
                </div>

                <div className="grid gap-3">
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
                        className="group flex items-center gap-4 rounded-[24px] border border-[var(--store-border)] bg-white p-3 transition hover:border-[var(--store-accent)] hover:shadow-[var(--store-shadow-soft)]"
                      >
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[20px] bg-[var(--store-surface-alt)]">
                          <img
                            src={getProductImage(product, resolveImageSrc)}
                            alt={product.name}
                            loading="lazy"
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--store-muted)]">
                            {product.category || "Urun"}
                          </p>
                          <p className="store-product-title mt-1 text-[var(--store-ink)]">
                            {product.name}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          {originalPriceLabel ? (
                            <p className="text-xs text-[var(--store-muted)] line-through">
                              {originalPriceLabel}
                            </p>
                          ) : null}
                          <p
                            className={cn(
                              "text-sm font-semibold text-[var(--store-accent)]",
                              !priceLabel && "text-[var(--store-muted)]",
                            )}
                          >
                            {priceLabel || "Bilgi al"}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
