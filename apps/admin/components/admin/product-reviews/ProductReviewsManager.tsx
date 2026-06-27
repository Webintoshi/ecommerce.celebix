"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Mail, Package, Search, Star, Trash2, User, X } from "lucide-react";
import type { ProductReviewStatus } from "@celebix/platform-config/src/product-reviews";
import { resolveAdminAssetUrl, resolveAdminDirectAssetUrl } from "@/lib/asset-url";
import type { AdminProductReviewRecord } from "@/lib/product-reviews";
import { cn } from "@/lib/utils";

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
  { key: "all", label: "Tümü" },
  { key: "pending", label: "Bekleyen" },
  { key: "approved", label: "Yayında" },
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
      return "Yayında";
    case "rejected":
      return "Reddedildi";
    default:
      return "Onay bekliyor";
  }
}

function getStatusTone(status: ProductReviewStatus) {
  switch (status) {
    case "approved":
      return "text-emerald-600";
    case "rejected":
      return "text-rose-600";
    default:
      return "text-[var(--admin-accent-hover)]";
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
      <div className="flex h-full items-center justify-center bg-[#F9F9F9] px-2 text-center text-[10px] font-medium text-[#9CA3AF]">
        Görsel yok
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

function RatingStars({ rating }: { rating: number }) {
  const safeRating = Math.max(0, Math.min(5, rating));

  return (
    <div className="flex items-center gap-0.5" aria-label={`Puan ${safeRating} / 5`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={cn(
            "h-3.5 w-3.5",
            index < safeRating ? "fill-[#FF6A00] text-[var(--admin-accent)]" : "fill-transparent text-[#CBD5E1]",
          )}
        />
      ))}
    </div>
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
        alert(payload?.error || "Yorum güncellenemedi");
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
    const confirmed = window.confirm("Bu yorumu silmek istediğinize emin misiniz?");
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
    <div className="space-y-4">
      <section className="border-b border-[#E1E7EF] bg-[#F9F9F9] pb-4">
        <div className="grid gap-3 min-[1180px]:grid-cols-[minmax(0,1fr)_auto] min-[1180px]:items-center">
          <label className="relative block max-w-2xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B95A5]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Yorum ara"
              aria-label="Ürün yorumu ara"
              className="h-11 w-full rounded-[10px] border border-[#DCE3EC] bg-white py-2.5 pl-11 pr-4 text-sm font-medium text-[#111827] outline-none transition placeholder:text-[#8B95A5] focus:border-[var(--admin-accent-border)] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilter(filter.key)}
                aria-pressed={activeFilter === filter.key}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-[10px] border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]",
                  activeFilter === filter.key
                    ? "border-[var(--admin-accent-border)] bg-[#FFF1E8] text-[var(--admin-accent-hover)]"
                    : "border-[#DCE3EC] bg-white text-[#6B7280] hover:border-[#FFD7BF] hover:text-[var(--admin-accent-hover)]",
                )}
              >
                {filter.label}
                <span className="text-xs font-semibold text-current opacity-75">{counts[filter.key]}</span>
              </button>
            ))}
            <span className="inline-flex h-10 items-center rounded-[10px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#6B7280]">
              {filteredReviews.length} sonuç
            </span>
            {isPending ? (
              <span aria-live="polite" className="inline-flex h-10 items-center rounded-[10px] border border-[#FFD7BF] bg-[#FFF1E8] px-3 text-sm font-semibold text-[var(--admin-accent-hover)]">
                İşleniyor
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <div className="hidden grid-cols-[1.05fr_1.25fr_0.8fr_220px] gap-4 border-b border-[#DCE3EC] bg-[#EEF3F7] px-5 py-3 text-sm font-semibold text-[#4B5563] min-[1180px]:grid">
          <div>Yorumcu</div>
          <div>Yorum</div>
          <div>Ürün</div>
          <div className="text-right">İşlem</div>
        </div>

        {filteredReviews.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[16px] bg-[#FFF1E8] text-[var(--admin-accent)]">
              <Star className="h-7 w-7" />
            </div>
            <h2 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-[#111827]">Yorum bulunamadı</h2>
            <p className="mt-2 text-sm font-medium text-[#6B7280]">Filtreyi veya aramayı değiştirin.</p>
          </div>
        ) : null}

        {filteredReviews.map((review) => (
          <article
            key={review.id}
            className="grid gap-4 border-b border-[#E1E7EF] px-4 py-4 transition last:border-b-0 hover:bg-[#FFF8F3] sm:px-5 min-[1180px]:grid-cols-[1.05fr_1.25fr_0.8fr_220px] min-[1180px]:items-start"
          >
            <div className="min-w-0">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#111827] text-white">
                  <User className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#111827]">{review.reviewer_name}</p>
                  {review.reviewer_email ? (
                    <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs font-medium text-[#6B7280]">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-[#9CA3AF]" />
                      <span className="truncate">{review.reviewer_email}</span>
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs font-medium text-[#9CA3AF]">{formatDate(review.created_at)}</p>
                </div>
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("text-sm font-semibold", getStatusTone(review.status))}>
                  {getStatusLabel(review.status)}
                </span>
                <RatingStars rating={review.rating} />
              </div>
              {review.title ? (
                <p className="mt-2 truncate text-sm font-semibold text-[#111827]">{review.title}</p>
              ) : null}
              <p className={cn("line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-[#4B5563]", review.title ? "mt-1" : "mt-2")}>
                {review.body}
              </p>
              {review.image_urls.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {review.image_urls.slice(0, 4).map((imageUrl, imageIndex) => (
                    <div
                      key={`${review.id}-${imageIndex}`}
                      className="h-12 w-12 overflow-hidden rounded-[9px] border border-[#DCE3EC] bg-[#F9F9F9]"
                    >
                      <ReviewImageTile
                        src={imageUrl}
                        alt={`${review.reviewer_name} yorum görseli ${imageIndex + 1}`}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="min-w-0">
              <div className="flex items-start gap-2">
                <Package className="mt-0.5 h-4 w-4 shrink-0 text-[#9CA3AF]" />
                <div className="min-w-0">
                  {review.product ? (
                    <Link
                      href={`/admin/urunler/${review.product.id}`}
                      className="block truncate text-sm font-semibold text-[#111827] transition hover:text-[var(--admin-accent-hover)]"
                    >
                      {review.product.name}
                    </Link>
                  ) : (
                    <p className="text-sm font-semibold text-[#6B7280]">Ürün yok</p>
                  )}
                  {review.variant?.name ? (
                    <p className="mt-1 truncate text-xs font-medium text-[#6B7280]">{review.variant.name}</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 min-[1180px]:justify-end">
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleStatusUpdate(review.id, "approved")}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-[#CFECD7] bg-white px-3 text-sm font-semibold text-[#16A34A] transition hover:bg-[#EAF8EF] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100"
              >
                <Check className="h-4 w-4" />
                Onayla
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleStatusUpdate(review.id, "rejected")}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-[#FFD7BF] bg-white px-3 text-sm font-semibold text-[var(--admin-accent-hover)] transition hover:bg-[#FFF1E8] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"
              >
                <X className="h-4 w-4" />
                Reddet
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleDelete(review.id)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-rose-200 bg-white text-rose-500 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100"
                aria-label="Yorumu sil"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
