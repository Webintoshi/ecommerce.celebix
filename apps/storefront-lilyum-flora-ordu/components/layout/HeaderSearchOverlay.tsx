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
          throw new Error(payload.error || "Arama ba\u015far\u0131s\u0131z");
        }

        setResults(Array.isArray(payload.products) ? payload.products : []);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        console.error("Header search request failed:", error);
        setResults([]);
        setErrorMessage("Arama sonu\u00e7lar\u0131 \u015fu anda al\u0131nam\u0131yor.");
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
        className="absolute inset-0 bg-[rgba(42,30,26,0.20)] backdrop-blur-[18px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative flex h-full w-full items-start justify-center p-4 pt-5 sm:p-6 sm:pt-8 lg:p-8 lg:pt-10">
        <div
          className="flex h-full max-h-[min(90vh,860px)] w-full max-w-[1120px] flex-col overflow-hidden rounded-[36px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.97)_0%,rgba(246,246,246,0.96)_100%)] shadow-[0_48px_130px_-56px_rgba(42,30,26,0.40)] backdrop-blur-[28px]"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="\u00dcr\u00fcn arama penceresi"
        >
          <div className="border-b border-[rgba(80,94,113,0.08)] px-5 py-5 sm:px-7 sm:py-6 lg:px-8">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="section-eyebrow">{"H\u0131zl\u0131 Ke\u015fif"}</p>

                <form className="mt-4" onSubmit={(event) => event.preventDefault()}>
                  <div className="relative overflow-hidden rounded-[30px] border border-[rgba(80,94,113,0.08)] bg-white/90 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_18px_40px_-34px_rgba(80,94,113,0.36)] transition duration-300 focus-within:border-[rgba(218,99,13,0.18)] focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_24px_60px_-38px_rgba(218,99,13,0.26)]">
                    <div className="pointer-events-none absolute left-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[linear-gradient(180deg,#f8fbfd_0%,#edf2f7_100%)] text-[var(--store-ink-soft)]">
                      <Search className="h-[18px] w-[18px]" />
                    </div>
                    <input
                      ref={inputRef}
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={"Buket, orkide, g\u00fcl ya da \u00fcr\u00fcn ad\u0131 ara..."}
                      className="h-[64px] w-full bg-transparent pl-[72px] pr-16 text-[15px] font-medium text-[var(--store-ink)] outline-none placeholder:text-[color:rgba(80,94,113,0.46)] sm:text-base"
                    />
                    {query ? (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--store-surface-alt)] text-[var(--store-muted)] transition hover:bg-white hover:text-[var(--store-ink)]"
                        aria-label={"Aramay\u0131 temizle"}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </form>

                {quickLinks.length > 0 ? (
                  <div className="mt-4 rounded-[24px] bg-[rgba(80,94,113,0.04)] p-2">
                    <div className="flex flex-wrap gap-2">
                      {quickLinks.slice(0, 6).map((link) => (
                        <Link
                          key={`${link.href}-${link.label}`}
                          href={buildLocalizedPath(link.href, locale)}
                          onClick={onClose}
                          className="rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-[var(--store-ink-soft)] shadow-[0_10px_22px_-20px_rgba(80,94,113,0.35)] transition hover:text-[var(--store-accent)]"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/88 text-[var(--store-muted)] shadow-[0_16px_36px_-28px_rgba(80,94,113,0.35)] transition hover:text-[var(--store-ink)]"
                aria-label={"Aramay\u0131 kapat"}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6 lg:px-8">
            {normalizedQuery.length < 2 ? (
              <div className="h-2" aria-hidden="true" />
            ) : isLoading ? (
              <div className="flex min-h-[120px] items-center justify-center rounded-[28px] bg-white/70 px-6 shadow-[0_18px_48px_-42px_rgba(80,94,113,0.28)]">
                <div className="mx-auto text-center">
                  <p className="text-lg font-semibold tracking-[-0.03em] text-[var(--store-ink)]">
                    {"Aran\u0131yor"}
                  </p>
                  <p className="mt-2 text-sm text-[var(--store-ink-soft)]">
                    {"Uygun \u00fcr\u00fcnler y\u00fckleniyor."}
                  </p>
                </div>
              </div>
            ) : errorMessage ? (
              <div className="flex min-h-[120px] items-center justify-center rounded-[28px] bg-white/70 px-6 shadow-[0_18px_48px_-42px_rgba(80,94,113,0.28)]">
                <div className="mx-auto max-w-xl text-center">
                  <p className="text-lg font-semibold tracking-[-0.03em] text-[var(--store-ink)]">
                    {"Arama \u015fu an kullan\u0131lam\u0131yor"}
                  </p>
                  <p className="mt-2 text-sm text-[var(--store-ink-soft)]">{errorMessage}</p>
                </div>
              </div>
            ) : results.length === 0 ? (
              <div className="flex min-h-[120px] items-center justify-center rounded-[28px] bg-white/70 px-6 shadow-[0_18px_48px_-42px_rgba(80,94,113,0.28)]">
                <div className="mx-auto max-w-xl text-center">
                  <p className="text-lg font-semibold tracking-[-0.03em] text-[var(--store-ink)]">
                    {"Sonu\u00e7 bulunamad\u0131"}
                  </p>
                  <p className="mt-2 text-sm text-[var(--store-ink-soft)]">
                    {"Farkl\u0131 bir \u00fcr\u00fcn ad\u0131 deneyebilirsin."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="section-eyebrow">{"Sonu\u00e7lar"}</p>
                  <p className="text-sm text-[var(--store-muted)]">
                    {Math.min(results.length, MAX_RESULTS)} {"\u00fcr\u00fcn"}
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
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
                        className="group flex items-center gap-4 rounded-[26px] border border-[rgba(80,94,113,0.08)] bg-white/88 p-3.5 shadow-[0_20px_44px_-38px_rgba(80,94,113,0.34)] transition hover:-translate-y-0.5 hover:border-[rgba(218,99,13,0.18)] hover:bg-white"
                      >
                        <div className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[22px] bg-[var(--store-surface-alt)] sm:h-24 sm:w-24">
                          <img
                            src={getProductImage(product, resolveImageSrc)}
                            alt={product.name}
                            loading="lazy"
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--store-muted)]">
                            {product.category || "\u00dcr\u00fcn"}
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
