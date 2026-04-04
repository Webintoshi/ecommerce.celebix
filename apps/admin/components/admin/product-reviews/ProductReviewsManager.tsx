"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, ImageIcon, Search, Trash2, X } from "lucide-react";
import type { ProductReviewStatus } from "@celebix/platform-config/src/product-reviews";
import { resolveAdminAssetUrl, resolveAdminDirectAssetUrl } from "@/lib/asset-url";
import type { AdminProductReviewRecord } from "@/lib/product-reviews";

type ReviewCounts = {
  all: number;
  pending: number;
  approved: number;
  rejected: number;
};

type ProductReviewsManagerProps = {
  initialReviews: AdminProductReviewRecord[];
  initialCounts: ReviewCounts;
};

const FILTERS: Array<{ key: "all" | ProductReviewStatus; label: string }> = [
  { key: "all", label: "Tumu" },
  { key: "pending", label: "Onay Bekleyen" },
  { key: "approved", label: "Yayindaki" },
  { key: "rejected", label: "Reddedilen" },
];

function formatDate(value: string) {
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getStatusLabel(status: ProductReviewStatus) {
  switch (status) {
    case "approved":
      return "Yayinda";
    case "rejected":
      return "Reddedildi";
    default:
      return "Onay Bekliyor";
  }
}

function getStatusClasses(status: ProductReviewStatus) {
  switch (status) {
    case "approved":
      return "bg-green-50 text-green-700 ring-1 ring-green-200";
    case "rejected":
      return "bg-red-50 text-red-700 ring-1 ring-red-200";
    default:
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  }
}

function ReviewImageTile({ src, alt }: { src: string; alt: string }) {
  const proxiedSource = resolveAdminAssetUrl(src) || src;
  const directSource = resolveAdminDirectAssetUrl(src);
  const [currentSource, setCurrentSource] = useState(proxiedSource);
  const [didFallback, setDidFallback] = useState(false);
  const [didFail, setDidFail] = useState(false);

  useEffect(() => {
    setCurrentSource(proxiedSource);
    setDidFallback(false);
    setDidFail(false);
  }, [proxiedSource]);

  const handleError = () => {
    if (!didFallback && directSource && directSource !== currentSource) {
      setCurrentSource(directSource);
      setDidFallback(true);
      return;
    }

    setDidFail(true);
  };

  if (didFail || !currentSource) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 px-3 text-center text-xs font-medium text-gray-400">
        Görsel yüklenemedi
      </div>
    );
  }

  return (
    <img
      src={currentSource}
      alt={alt}
      className="h-full w-full object-cover"
      loading="lazy"
      onError={handleError}
    />
  );
}

export function ProductReviewsManager({
  initialReviews,
  initialCounts,
}: ProductReviewsManagerProps) {
  const [reviews, setReviews] = useState(initialReviews);
  const [counts, setCounts] = useState(initialCounts);
  const [activeFilter, setActiveFilter] = useState<"all" | ProductReviewStatus>("pending");
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  const filteredReviews = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("tr");

    return reviews.filter((review) => {
      if (activeFilter !== "all" && review.status !== activeFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        review.reviewer_name,
        review.reviewer_email || "",
        review.title || "",
        review.body,
        review.product?.name || "",
        review.variant?.name || "",
      ].some((field) => field.toLocaleLowerCase("tr").includes(normalizedQuery));
    });
  }, [activeFilter, query, reviews]);

  const handleStatusUpdate = (id: string, status: ProductReviewStatus) => {
    startTransition(async () => {
      const response = await fetch(`/api/admin/product-reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        alert(payload?.error || "Yorum guncellenemedi");
        return;
      }

      setReviews((current) => {
        const nextReviews = current.map((review) => (review.id === id ? { ...review, status } : review));
        setCounts(
          nextReviews.reduce(
            (accumulator, review) => {
              accumulator.all += 1;
              accumulator[review.status] += 1;
              return accumulator;
            },
            { all: 0, pending: 0, approved: 0, rejected: 0 },
          ),
        );
        return nextReviews;
      });
    });
  };

  const handleDelete = (id: string) => {
    const confirmed = window.confirm("Bu yorumu silmek istediginize emin misiniz?");
    if (!confirmed) return;

    startTransition(async () => {
      const response = await fetch(`/api/admin/product-reviews/${id}`, {
        method: "DELETE",
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        alert(payload?.error || "Yorum silinemedi");
        return;
      }

      const nextReviews = reviews.filter((review) => review.id !== id);
      setReviews(nextReviews);
      setCounts(
        nextReviews.reduce(
          (accumulator, review) => {
            accumulator.all += 1;
            accumulator[review.status] += 1;
            return accumulator;
          },
          { all: 0, pending: 0, approved: 0, rejected: 0 },
        ),
      );
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ürün, yorumcu veya yorum metni ara..."
            className="w-full rounded-2xl border border-gray-200 bg-white py-3 pl-11 pr-4 text-sm text-gray-900 outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              onClick={() => setActiveFilter(filter.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeFilter === filter.key
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 ring-1 ring-gray-200 hover:text-gray-900"
              }`}
            >
              {filter.label}{" "}
              <span className="ml-1 text-xs opacity-80">
                {counts[filter.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {FILTERS.map((filter) => (
          <div key={filter.key} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-medium text-gray-500">{filter.label}</div>
            <div className="mt-2 text-3xl font-semibold text-gray-900">{counts[filter.key]}</div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {filteredReviews.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center text-gray-500">
            Bu filtreye uyan yorum bulunamadi.
          </div>
        ) : null}

        {filteredReviews.map((review) => (
          <div key={review.id} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(review.status)}`}>
                    {getStatusLabel(review.status)}
                  </span>
                  <span className="text-sm text-gray-500">{formatDate(review.created_at)}</span>
                  <span className="text-sm font-medium text-gray-900">
                    {"★".repeat(Math.max(0, Math.min(5, review.rating)))}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="text-base font-semibold text-gray-900">{review.reviewer_name}</div>
                  {review.reviewer_email ? (
                    <div className="text-sm text-gray-500">{review.reviewer_email}</div>
                  ) : null}
                </div>

                <div className="rounded-2xl bg-gray-50 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {review.product ? (
                      <Link
                        href={`/admin/urunler/${review.product.id}`}
                        className="font-semibold text-gray-900 hover:text-amber-700"
                      >
                        {review.product.name}
                      </Link>
                    ) : (
                      <span className="font-semibold text-gray-900">Ürün bağlantısı yok</span>
                    )}
                    {review.variant?.name ? (
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-200">
                        {review.variant.name}
                      </span>
                    ) : null}
                  </div>
                  {review.title ? (
                    <div className="mt-3 text-sm font-semibold text-gray-900">{review.title}</div>
                  ) : null}
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{review.body}</p>
                </div>

                {review.image_urls.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {review.image_urls.map((imageUrl, index) => (
                      <div
                        key={`${review.id}-${index}`}
                        className="relative aspect-square overflow-hidden rounded-2xl bg-gray-100 ring-1 ring-gray-200"
                      >
                        <ReviewImageTile
                          src={imageUrl}
                          alt={`${review.reviewer_name} yorum gorseli ${index + 1}`}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <ImageIcon className="h-4 w-4" />
                    Görsel eklenmemiş
                  </div>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap gap-2 lg:w-40 lg:flex-col">
                <button
                  disabled={isPending}
                  onClick={() => handleStatusUpdate(review.id, "approved")}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Onayla
                </button>
                <button
                  disabled={isPending}
                  onClick={() => handleStatusUpdate(review.id, "rejected")}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  Reddet
                </button>
                <button
                  disabled={isPending}
                  onClick={() => handleDelete(review.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 ring-1 ring-red-200 transition hover:bg-red-100 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Sil
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
