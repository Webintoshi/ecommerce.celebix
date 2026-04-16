"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Camera, Loader2, Star, UploadCloud, X } from "lucide-react";
import { MAX_PRODUCT_REVIEW_IMAGES } from "@celebix/platform-config/src/product-reviews";
import { resolveStorefrontAssetUrl, resolveStorefrontDirectAssetUrl } from "@/lib/asset-url";
import type { ProductReview } from "@/types/product";

type ProductReviewsSectionProps = {
  productId: string;
  productName: string;
  activeVariantId?: string | null;
  initialRating?: number;
  initialReviewCount?: number;
};

type UploadedReviewImage = {
  url: string;
  previewUrl: string;
};

type ReviewImageTileProps = {
  source: string;
  fallbackSource?: string;
  alt: string;
  className?: string;
};

function formatDate(value: string) {
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function ReviewImageTile({ source, fallbackSource, alt, className = "object-cover" }: ReviewImageTileProps) {
  const [currentSource, setCurrentSource] = useState(source);
  const [usedFallback, setUsedFallback] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrentSource(source);
    setUsedFallback(false);
    setFailed(false);
  }, [fallbackSource, source]);

  const handleError = () => {
    if (!usedFallback && fallbackSource && fallbackSource !== currentSource) {
      setCurrentSource(fallbackSource);
      setUsedFallback(true);
      return;
    }

    setFailed(true);
  };

  if (failed || !currentSource) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--store-surface-alt)] px-2 text-center text-[11px] font-medium text-[var(--store-ink-soft)]">
        {"G\u00f6rsel y\u00fcklenemedi"}
      </div>
    );
  }

  return (
    <img
      src={currentSource}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`h-full w-full ${className}`}
      onError={handleError}
    />
  );
}

export function ProductReviewsSection({
  productId,
  productName,
  activeVariantId,
  initialRating = 0,
  initialReviewCount = 0,
}: ProductReviewsSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rating, setRating] = useState(5);
  const [uploadedImages, setUploadedImages] = useState<UploadedReviewImage[]>([]);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadReviews = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/product-reviews?productId=${encodeURIComponent(productId)}`, {
          cache: "no-store",
        });
        const payload = await response.json();

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "Yorumlar y\u00fcklenemedi");
        }

        if (isMounted) {
          setReviews(Array.isArray(payload.reviews) ? payload.reviews : []);
        }
      } catch (error) {
        if (isMounted) {
          console.error("Product reviews load error:", error);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadReviews();
    return () => {
      isMounted = false;
    };
  }, [productId]);

  const summary = useMemo(() => {
    if (reviews.length === 0) {
      return {
        rating: initialRating,
        reviewCount: initialReviewCount,
      };
    }

    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    return {
      rating: Number((total / reviews.length).toFixed(1)),
      reviewCount: reviews.length,
    };
  }, [initialRating, initialReviewCount, reviews]);

  const resetForm = () => {
    setReviewerName("");
    setReviewerEmail("");
    setTitle("");
    setBody("");
    setRating(5);
    setUploadedImages([]);
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const remainingSlots = MAX_PRODUCT_REVIEW_IMAGES - uploadedImages.length;
    if (remainingSlots <= 0) {
      setFeedback({
        type: "error",
        message: `En fazla ${MAX_PRODUCT_REVIEW_IMAGES} g\u00f6rsel ekleyebilirsiniz.`,
      });
      return;
    }

    const selectedFiles = Array.from(files).slice(0, remainingSlots);
    setIsUploading(true);
    setFeedback(null);

    try {
      const uploaded: UploadedReviewImage[] = [];

      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", "products");
        formData.append("thumbnail", "false");

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const payload = await response.json();
        if (!response.ok || !payload?.success || typeof payload.url !== "string") {
          throw new Error(payload?.error || `${file.name} y\u00fcklenemedi`);
        }

        uploaded.push({
          url: payload.url,
          previewUrl: resolveStorefrontAssetUrl(payload.url) || payload.url,
        });
      }

      setUploadedImages((current) => [...current, ...uploaded].slice(0, MAX_PRODUCT_REVIEW_IMAGES));
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "G\u00f6rseller y\u00fcklenemedi.",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeUploadedImage = (url: string) => {
    setUploadedImages((current) => current.filter((image) => image.url !== url));
  };

  const handleSubmit = () => {
    if (!reviewerName.trim() || !body.trim()) {
      setFeedback({
        type: "error",
        message: "Ad soyad ve yorum metni zorunludur.",
      });
      return;
    }

    startTransition(async () => {
      setFeedback(null);
      const response = await fetch("/api/product-reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId,
          variantId: activeVariantId || null,
          reviewerName: reviewerName.trim(),
          reviewerEmail: reviewerEmail.trim() || null,
          rating,
          title: title.trim() || null,
          body: body.trim(),
          imageUrls: uploadedImages.map((image) => image.url),
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        setFeedback({
          type: "error",
          message: payload?.error || "Yorum g\u00f6nderilemedi.",
        });
        return;
      }

      resetForm();
      setFeedback({
        type: "success",
        message: payload?.message || "Yorumunuz onay i\u00e7in al\u0131nd\u0131.",
      });
    });
  };

  return (
    <section className="space-y-8 border-t border-[var(--store-border)] pt-10">
      <div className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--store-accent)]">
            {"\u00dcr\u00fcn Yorumlar\u0131"}
          </p>
          <h2 className="mt-2 text-2xl tracking-tight text-[var(--store-ink)]">
            {"M\u00fc\u015fteri yorumlar\u0131"}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-full border border-[var(--store-border)] bg-[linear-gradient(135deg,#ffffff_0%,#f6f6f6_62%,#eef2f5_100%)] px-4 py-3 text-sm text-[var(--store-ink-soft)] sm:w-fit">
          <div className="flex items-center gap-1 rounded-full bg-white px-3 py-1 shadow-[0_8px_24px_rgba(80,94,113,0.08)]">
            {[1, 2, 3, 4, 5].map((value) => (
              <Star
                key={value}
                className={`h-4 w-4 ${
                  value <= Math.round(summary.rating)
                    ? "fill-[var(--store-accent)] text-[var(--store-accent)]"
                    : "fill-[var(--store-surface-alt)] text-[var(--store-surface-alt)]"
                }`}
              />
            ))}
          </div>
          <span className="font-semibold text-[var(--store-ink)]">{summary.rating.toFixed(1)}</span>
          <span aria-hidden="true" className="text-[var(--store-border-strong)]">
            /
          </span>
          <span>{`${summary.reviewCount} onayl\u0131 yorum`}</span>
          <span aria-hidden="true" className="text-[var(--store-border-strong)]">
            /
          </span>
          <span>{"Yeni yorumlar \u00f6nce moderasyona d\u00fc\u015fer."}</span>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="space-y-4">
          {isLoading ? (
            <div className="rounded-[32px] border border-[var(--store-border)] bg-[linear-gradient(135deg,#ffffff_0%,#f6f6f6_100%)] p-6 text-sm text-[var(--store-ink-soft)] shadow-[var(--store-shadow-soft)]">
              {"Yorumlar y\u00fckleniyor..."}
            </div>
          ) : reviews.length === 0 ? (
            <div className="rounded-[32px] border border-dashed border-[var(--store-border-strong)] bg-[linear-gradient(135deg,rgba(246,246,246,0.9)_0%,#ffffff_100%)] p-8 text-center shadow-[var(--store-shadow-soft)]">
              <p className="text-base font-semibold text-[var(--store-ink)]">
                {"Bu \u00fcr\u00fcn i\u00e7in hen\u00fcz onayl\u0131 yorum yok."}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--store-ink-soft)]">
                {"\u0130lk g\u00f6rselli yorumu siz g\u00f6nderin. Onay sonras\u0131 burada yay\u0131nlan\u0131r."}
              </p>
            </div>
          ) : (
            reviews.map((review) => (
              <article
                key={review.id}
                className="rounded-[32px] border border-[var(--store-border)] bg-[linear-gradient(180deg,#ffffff_0%,rgba(246,246,246,0.8)_100%)] p-5 shadow-[var(--store-shadow-soft)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[var(--store-ink)]">{review.reviewerName}</div>
                    <div className="mt-1 text-xs text-[var(--store-ink-soft)]">{formatDate(review.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-1 rounded-full border border-[var(--store-border)] bg-white px-3 py-1.5">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <Star
                        key={value}
                        className={`h-4 w-4 ${
                          value <= review.rating
                            ? "fill-[var(--store-accent)] text-[var(--store-accent)]"
                            : "fill-[var(--store-surface-alt)] text-[var(--store-surface-alt)]"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {review.title ? (
                  <h3 className="mt-4 text-base font-semibold text-[var(--store-ink)]">{review.title}</h3>
                ) : null}

                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--store-ink-soft)]">{review.body}</p>

                {review.imageUrls.length > 0 ? (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {review.imageUrls.map((imageUrl, index) => (
                      <div
                        key={`${review.id}-${index}`}
                        className="relative aspect-square overflow-hidden rounded-[24px] border border-[var(--store-border)] bg-[var(--store-surface-alt)]"
                      >
                        <ReviewImageTile
                          source={resolveStorefrontAssetUrl(imageUrl) || imageUrl}
                          fallbackSource={resolveStorefrontDirectAssetUrl(imageUrl) || imageUrl}
                          alt={`${productName} yorum g\u00f6rseli ${index + 1}`}
                          className="object-cover"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>

        <div className="rounded-[32px] border border-[var(--store-border)] bg-[linear-gradient(180deg,#ffffff_0%,rgba(246,246,246,0.94)_100%)] p-5 shadow-[0_26px_60px_rgba(80,94,113,0.12)] lg:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-[var(--store-ink)]">{"Yorum b\u0131rak"}</h3>
              <p className="mt-1 text-sm text-[var(--store-ink-soft)]">
                {"G\u00f6rsel ekleyebilir, \u00fcr\u00fcn\u00fc puanlayabilirsiniz."}
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--store-border)] bg-white text-[var(--store-accent)] shadow-[0_10px_24px_rgba(80,94,113,0.08)]">
              <Camera className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                value={reviewerName}
                onChange={(event) => setReviewerName(event.target.value)}
                placeholder="Ad Soyad"
                className="w-full rounded-[22px] border border-[var(--store-border)] bg-white px-4 py-3 text-sm text-[var(--store-ink)] outline-none transition placeholder:text-[var(--store-muted)] focus:border-[var(--store-accent)] focus:ring-4 focus:ring-[rgba(218,99,13,0.12)]"
              />
              <input
                value={reviewerEmail}
                onChange={(event) => setReviewerEmail(event.target.value)}
                placeholder={"E-posta (opsiyonel)"}
                className="w-full rounded-[22px] border border-[var(--store-border)] bg-white px-4 py-3 text-sm text-[var(--store-ink)] outline-none transition placeholder:text-[var(--store-muted)] focus:border-[var(--store-accent)] focus:ring-4 focus:ring-[rgba(218,99,13,0.12)]"
              />
            </div>

            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={"Yorum ba\u015fl\u0131\u011f\u0131 (opsiyonel)"}
              className="w-full rounded-[22px] border border-[var(--store-border)] bg-white px-4 py-3 text-sm text-[var(--store-ink)] outline-none transition placeholder:text-[var(--store-muted)] focus:border-[var(--store-accent)] focus:ring-4 focus:ring-[rgba(218,99,13,0.12)]"
            />

            <div className="space-y-2">
              <div className="text-sm font-medium text-[var(--store-ink)]">{"Puan\u0131n\u0131z"}</div>
              <div className="flex items-center gap-2 rounded-[24px] border border-[var(--store-border)] bg-white px-3 py-2.5">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    className="rounded-full p-1 transition hover:scale-105 hover:bg-[rgba(218,99,13,0.08)]"
                  >
                    <Star
                      className={`h-6 w-6 ${
                        value <= rating
                          ? "fill-[var(--store-accent)] text-[var(--store-accent)]"
                          : "fill-[var(--store-surface-alt)] text-[var(--store-surface-alt)]"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              placeholder={"\u00dcr\u00fcn hakk\u0131ndaki deneyiminizi yaz\u0131n..."}
              className="w-full rounded-[28px] border border-[var(--store-border)] bg-white px-4 py-3 text-sm leading-6 text-[var(--store-ink)] outline-none transition placeholder:text-[var(--store-muted)] focus:border-[var(--store-accent)] focus:ring-4 focus:ring-[rgba(218,99,13,0.12)]"
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-[var(--store-ink)]">{"G\u00f6rsel ekleyin"}</div>
                <div className="text-xs text-[var(--store-ink-soft)]">{`Maksimum ${MAX_PRODUCT_REVIEW_IMAGES}`}</div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => handleFilesSelected(event.target.files)}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || uploadedImages.length >= MAX_PRODUCT_REVIEW_IMAGES}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--store-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--store-ink)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                {"G\u00f6rsel Se\u00e7"}
              </button>

              {uploadedImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {uploadedImages.map((image) => (
                    <div
                      key={image.url}
                      className="relative aspect-square overflow-hidden rounded-[24px] border border-[var(--store-border)] bg-[var(--store-surface-alt)]"
                    >
                      <ReviewImageTile
                        source={image.previewUrl}
                        fallbackSource={image.url}
                        alt={"Y\u00fcklenen yorum g\u00f6rseli"}
                        className="object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeUploadedImage(image.url)}
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--store-ink)] text-white shadow-[0_10px_18px_rgba(80,94,113,0.2)]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-[24px] border border-[var(--store-border)] bg-[rgba(246,246,246,0.9)] px-4 py-3 text-xs leading-6 text-[var(--store-ink-soft)]">
              {"Yorumlar \u00f6nce onaya d\u00fc\u015fer. Onaylanan g\u00f6rsel ve metinler \u00fcr\u00fcn sayfas\u0131nda yay\u0131nlan\u0131r."}
            </div>

            {feedback ? (
              <div
                className={`rounded-2xl px-4 py-3 text-sm ${
                  feedback.type === "success"
                    ? "border border-[rgba(80,94,113,0.16)] bg-[rgba(80,94,113,0.08)] text-[var(--store-ink)]"
                    : "border border-[rgba(218,99,13,0.18)] bg-[rgba(218,99,13,0.1)] text-[var(--store-accent-strong)]"
                }`}
              >
                {feedback.message}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending || isUploading}
              className="inline-flex min-w-[180px] items-center justify-center rounded-full bg-[var(--store-accent)] px-6 py-3 text-sm font-medium uppercase tracking-wide text-white shadow-[0_18px_32px_rgba(218,99,13,0.22)] transition hover:bg-[var(--store-accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "G\u00f6nderiliyor..." : "Yorumu G\u00f6nder"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
