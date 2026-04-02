"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { ROUTES } from "@/lib/constants";

type SearchProductResult = {
  id: string;
  name: string;
  slug: string;
  category?: string | null;
  images?: string[] | null;
  variants?: Array<{
    price?: number | null;
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
        className="absolute inset-0 bg-neutral-900/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative flex h-full w-full items-start justify-center p-4 pt-16 sm:p-8 sm:pt-20">
        <div
          className="flex h-auto max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Urun arama penceresi"
        >
          <div className="flex items-center gap-3 border-b border-neutral-100 px-5 py-4">
            <Search className="h-5 w-5 text-neutral-400" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Urun ara..."
              className="flex-1 bg-transparent text-base text-neutral-900 placeholder:text-neutral-400 outline-none"
            />
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-900"
              aria-label="Kapat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {normalizedQuery.length < 2 ? (
              <div className="flex h-48 items-center justify-center px-6 text-center">
                <p className="text-sm text-neutral-400">
                  Aramaya başlamak için yazmaya başlayın
                </p>
              </div>
            ) : isLoading ? (
              <div className="flex h-48 items-center justify-center px-6 text-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900" />
              </div>
            ) : errorMessage ? (
              <div className="flex h-48 items-center justify-center px-6 text-center">
                <p className="text-sm text-neutral-500">{errorMessage}</p>
              </div>
            ) : results.length === 0 ? (
              <div className="flex h-48 items-center justify-center px-6 text-center">
                <p className="text-sm text-neutral-500">
                  Sonuç bulunamadı
                </p>
              </div>
            ) : (
              <div className="py-2">
                {results.slice(0, MAX_RESULTS).map((product) => {
                  const priceLabel = formatPrice(product.variants?.[0]?.price);

                  return (
                    <Link
                      key={product.id}
                      href={ROUTES.product(product.slug)}
                      onClick={onClose}
                      className="flex items-center gap-4 px-5 py-3 transition hover:bg-neutral-50"
                    >
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                        <img
                          src={getProductImage(product, resolveImageSrc)}
                          alt={product.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-900">
                          {product.name}
                        </p>
                        {priceLabel ? (
                          <p className="mt-1 text-sm text-neutral-500">
                            {priceLabel}
                          </p>
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
