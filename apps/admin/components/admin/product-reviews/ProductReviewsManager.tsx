"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, ImageIcon, Mail, MessageSquare, Package, Search, ShieldCheck, Star, Trash2, User, X } from "lucide-react";
import { motion } from "framer-motion";
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
  { key: "pending", label: "Onay Bekleyen" },
  { key: "approved", label: "Yayında" },
  { key: "rejected", label: "Reddedilen" },
];

const ANIMATION_EASE = [0.22, 1, 0.36, 1] as const;

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
      return "Onay Bekliyor";
  }
}

function getStatusClasses(status: ProductReviewStatus) {
  switch (status) {
    case "approved":
      return "border-emerald-200 bg-emerald-100/90 text-emerald-700";
    case "rejected":
      return "border-rose-200 bg-rose-100/90 text-rose-700";
    default:
      return "border-amber-200 bg-amber-100/90 text-amber-700";
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

function RatingStars({ rating }: { rating: number }) {
  const safeRating = Math.max(0, Math.min(5, rating));

  return (
    <div className="flex items-center gap-1" aria-label={`Puan ${safeRating} / 5`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={cn(
            "h-4 w-4",
            index < safeRating ? "fill-[#FE6100] text-[#FE6100]" : "fill-transparent text-stone-300"
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

  const activeFilterLabel = FILTERS.find((filter) => filter.key === activeFilter)?.label || "Tümü";

  return (
    <div className="space-y-8">
      <section className="rounded-[30px] border border-[#ecdccd] bg-gradient-to-br from-white/95 via-[#fffdfa] to-[#f6eee6] p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ad7c56]">Tarama ve filtreleme</p>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#241913]">Moderasyon listesi</h2>
            <p className="text-sm leading-6 text-[#786658]">
              Yorumları ürün adı, yorumcu veya içerik metni üzerinden filtreleyin ve moderasyon durumuna göre
              hızlıca gruplayın.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#7d6a5d]">
            <span className="rounded-full border border-[#ebdccc] bg-white px-3 py-1.5 shadow-sm">
              Aktif filtre: {activeFilterLabel}
            </span>
            <span className="rounded-full border border-[#ebdccc] bg-white px-3 py-1.5 shadow-sm">
              Görünen sonuç: {filteredReviews.length}
            </span>
            {isPending ? (
              <span aria-live="polite" className="rounded-full border border-[#FE6100]/12 bg-[#fff4ea] px-3 py-1.5 text-[#C94E00] shadow-sm">
                İşlem uygulanıyor
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b08d73]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ürün, yorumcu veya yorum metni ara..."
              aria-label="Ürün yorumu ara"
              className="w-full rounded-[20px] border border-[#ecdccd] bg-white pl-11 pr-4 py-3 text-sm text-[#2f241d] shadow-[0_12px_30px_rgba(99,67,37,0.06)] outline-none transition placeholder:text-[#a08e82] focus:border-[#FE6100]/40 focus:ring-4 focus:ring-[#FE6100]/15"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilter(filter.key)}
                aria-pressed={activeFilter === filter.key}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20",
                  activeFilter === filter.key
                    ? "bg-gradient-to-r from-[#FE6100] to-[#E45700] text-white shadow-[0_12px_24px_rgba(254,97,0,0.2)]"
                    : "bg-white text-[#6d5849] ring-1 ring-[#eadccd] hover:text-[#241913]"
                )}
              >
                {filter.label}
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", activeFilter === filter.key ? "bg-white/15 text-white" : "bg-[#f4ece4] text-[#7c6658]")}>{counts[filter.key]}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {FILTERS.map((filter, index) => (
          <motion.div
            key={filter.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.04, ease: ANIMATION_EASE }}
            className="rounded-[28px] border border-[#eadccd] bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] p-5 shadow-[0_18px_45px_rgba(72,36,8,0.08)]"
          >
            <div className="text-sm font-medium text-[#7b685a]">{filter.label}</div>
            <div className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#241913]">{counts[filter.key]}</div>
          </motion.div>
        ))}
      </section>

      <section className="space-y-4">
        {filteredReviews.length === 0 ? (
          <div className="rounded-[30px] border border-dashed border-[#ead8c8] bg-gradient-to-br from-white via-[#fffdfa] to-[#f8f0e7] px-6 py-16 text-center text-[#7a6859] shadow-[0_22px_55px_rgba(72,36,8,0.08)]">
            <div className="mx-auto flex h-18 w-18 items-center justify-center rounded-[24px] bg-gradient-to-br from-[#fff0e4] to-[#f7decb] shadow-[0_16px_28px_rgba(254,97,0,0.12)]">
              <MessageSquare className="h-8 w-8 text-[#FE6100]" />
            </div>
            <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-[#241913]">Bu filtreye uyan yorum bulunamadı</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6">
              Arama veya moderasyon filtresini değiştirerek tekrar deneyin. Liste davranışı değişmeden yalnızca mevcut sonuçlar filtrelenir.
            </p>
          </div>
        ) : null}

        {filteredReviews.map((review, index) => (
          <motion.article
            key={review.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.03, ease: ANIMATION_EASE }}
            className="overflow-hidden rounded-[30px] border border-[#eadccd] bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] p-5 shadow-[0_18px_55px_rgba(72,36,8,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(72,36,8,0.12)] md:p-6"
          >
            <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_220px] xl:items-start">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={cn("inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold", getStatusClasses(review.status))}>
                    {getStatusLabel(review.status)}
                  </span>
                  <span className="text-sm text-[#8d7869]">{formatDate(review.created_at)}</span>
                  <RatingStars rating={review.rating} />
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
                  <div className="rounded-[24px] border border-white/70 bg-white/80 p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-medium text-[#7c6658]">
                      <User className="h-4 w-4 text-[#FE6100]" />
                      Yorumcu bilgisi
                    </div>
                    <p className="mt-3 text-base font-semibold text-[#241913]">{review.reviewer_name}</p>
                    {review.reviewer_email ? (
                      <p className="mt-2 inline-flex items-center gap-2 text-sm text-[#7a6859]">
                        <Mail className="h-4 w-4 text-[#FE6100]" />
                        {review.reviewer_email}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-[#9a8778]">E-posta bilgisi yok</p>
                    )}
                  </div>

                  <div className="rounded-[24px] border border-white/70 bg-white/80 p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-medium text-[#7c6658]">
                      <Package className="h-4 w-4 text-[#FE6100]" />
                      Ürün bağlantısı
                    </div>
                    <div className="mt-3 space-y-2">
                      {review.product ? (
                        <Link
                          href={`/admin/urunler/${review.product.id}`}
                          className="inline-flex max-w-full items-center gap-2 text-base font-semibold text-[#241913] transition-colors hover:text-[#FE6100]"
                        >
                          {review.product.name}
                        </Link>
                      ) : (
                        <p className="text-base font-semibold text-[#241913]">Ürün bağlantısı yok</p>
                      )}
                      {review.variant?.name ? (
                        <span className="inline-flex items-center rounded-full bg-[#f4ece4] px-2.5 py-1 text-xs font-medium text-[#6d5849] ring-1 ring-[#eadccd]">
                          {review.variant.name}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#eadfd5] bg-gradient-to-br from-[#fffaf6] to-white p-5 shadow-sm">
                  {review.title ? (
                    <div className="text-base font-semibold text-[#241913]">{review.title}</div>
                  ) : null}
                  <p className={cn("whitespace-pre-wrap text-sm leading-7 text-[#5f4b3d]", review.title ? "mt-3" : "")}>{review.body}</p>
                </div>

                {review.image_urls.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {review.image_urls.map((imageUrl, imageIndex) => (
                      <div
                        key={`${review.id}-${imageIndex}`}
                        className="relative aspect-square overflow-hidden rounded-[22px] bg-white ring-1 ring-[#eadccd] shadow-sm"
                      >
                        <ReviewImageTile
                          src={imageUrl}
                          alt={`${review.reviewer_name} yorum görseli ${imageIndex + 1}`}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-[#8d7869]">
                    <ImageIcon className="h-4 w-4 text-[#b08d73]" />
                    Görsel eklenmemiş
                  </div>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap gap-2 xl:flex-col">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleStatusUpdate(review.id, "approved")}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200"
                >
                  <Check className="h-4 w-4" />
                  Onayla
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleStatusUpdate(review.id, "rejected")}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-[#d38a1c] px-4 py-3 text-sm font-medium text-white transition hover:from-amber-600 hover:to-[#c07d13] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200"
                >
                  <X className="h-4 w-4" />
                  Reddet
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleDelete(review.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
                >
                  <Trash2 className="h-4 w-4" />
                  Sil
                </button>
                <div className="rounded-[22px] border border-[#eadccd] bg-white/85 p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#7c6658]">
                    <ShieldCheck className="h-4 w-4 text-[#FE6100]" />
                    Moderasyon notu
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#6f5b4d]">
                    Bu yorum için yapılacak aksiyon, ürün sayfasındaki görünürlüğü doğrudan etkiler.
                  </p>
                </div>
              </div>
            </div>
          </motion.article>
        ))}
      </section>
    </div>
  );
}
