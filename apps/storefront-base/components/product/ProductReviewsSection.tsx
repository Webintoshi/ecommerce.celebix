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
      <div className="flex h-full w-full items-center justify-center bg-[#FFF5F5] px-2 text-center text-[11px] font-medium text-[#6b4b4c]">
        Gorsel yuklenemedi
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
          throw new Error(payload?.error || "Yorumlar yuklenemedi");
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
        message: `En fazla ${MAX_PRODUCT_REVIEW_IMAGES} gorsel ekleyebilirsiniz.`,
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
          throw new Error(payload?.error || `${file.name} yuklenemedi`);
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
        message: error instanceof Error ? error.message : "Gorseller yuklenemedi.",
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
          message: payload?.error || "Yorum gonderilemedi.",
        });
        return;
      }

      resetForm();
      setFeedback({
        type: "success",
        message: payload?.message || "Yorumunuz onay icin alindi.",
      });
    });
  };

  return (
    <section className="space-y-8 border-t border-[#7B1113]/10 pt-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[#6b4b4c] text-xs font-medium tracking-[0.2em] uppercase">Urun Yorumlari</p>
          <h2 className="mt-2 text-2xl tracking-tight text-[#7B1113]">Gorselli musteri yorumlari</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6b4b4c]">
            Onaylanan yorumlar burada yayinlanir. Yeni yorumlar once moderasyon kuyruğuna duser.
          </p>
        </div>
        <div className="rounded-3xl border border-[#7B1113]/10 bg-white px-5 py-4 text-right shadow-sm">
          <div className="text-3xl font-semibold text-[#7B1113]">{summary.rating.toFixed(1)}</div>
          <div className="mt-2 flex justify-end gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <Star
                key={value}
                className={`h-4 w-4 ${
                  value <= Math.round(summary.rating)
                    ? "fill-amber-400 text-amber-400"
                    : "fill-gray-200 text-gray-200"
                }`}
              />
            ))}
          </div>
          <div className="mt-2 text-sm text-[#6b4b4c]">{summary.reviewCount} onayli yorum</div>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="space-y-4">
          {isLoading ? (
            <div className="rounded-3xl border border-[#7B1113]/10 bg-white p-6 text-sm text-[#6b4b4c] shadow-sm">
              Yorumlar yukleniyor...
            </div>
          ) : reviews.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#7B1113]/20 bg-white p-8 text-center shadow-sm">
              <p className="text-base font-medium text-[#7B1113]">Bu urun icin henuz onayli yorum yok.</p>
              <p className="mt-2 text-sm leading-6 text-[#6b4b4c]">
                Ilk gorselli yorumu siz gonderin. Onay sonrasi burada yayinlanir.
              </p>
            </div>
          ) : (
            reviews.map((review) => (
              <article key={review.id} className="rounded-3xl border border-[#7B1113]/10 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[#7B1113]">{review.reviewerName}</div>
                    <div className="mt-1 text-xs text-[#6b4b4c]">{formatDate(review.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <Star
                        key={value}
                        className={`h-4 w-4 ${
                          value <= review.rating ? "fill-amber-400 text-amber-400" : "fill-gray-200 text-gray-200"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                {review.title ? (
                  <h3 className="mt-4 text-base font-semibold text-[#7B1113]">{review.title}</h3>
                ) : null}
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#6b4b4c]">{review.body}</p>
                {review.imageUrls.length > 0 ? (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {review.imageUrls.map((imageUrl, index) => (
                      <div key={`${review.id}-${index}`} className="relative aspect-square overflow-hidden rounded-2xl bg-[#FFF5F5]">
                        <ReviewImageTile
                          source={resolveStorefrontAssetUrl(imageUrl) || imageUrl}
                          fallbackSource={resolveStorefrontDirectAssetUrl(imageUrl) || imageUrl}
                          alt={`${productName} yorum gorseli ${index + 1}`}
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

        <div className="rounded-3xl border border-[#7B1113]/10 bg-white p-5 shadow-sm lg:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-[#7B1113]">Yorum birak</h3>
              <p className="mt-1 text-sm text-[#6b4b4c]">Gorsel ekleyebilir, urunu puanlayabilirsiniz.</p>
            </div>
            <Camera className="h-5 w-5 text-[#6b4b4c]" />
          </div>

          <div className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                value={reviewerName}
                onChange={(event) => setReviewerName(event.target.value)}
                placeholder="Ad Soyad"
                className="w-full rounded-2xl border border-[#7B1113]/15 px-4 py-3 text-sm outline-none transition focus:border-[#7B1113] focus:ring-4 focus:ring-[#7B1113]/10"
              />
              <input
                value={reviewerEmail}
                onChange={(event) => setReviewerEmail(event.target.value)}
                placeholder="E-posta (opsiyonel)"
                className="w-full rounded-2xl border border-[#7B1113]/15 px-4 py-3 text-sm outline-none transition focus:border-[#7B1113] focus:ring-4 focus:ring-[#7B1113]/10"
              />
            </div>

            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Yorum basligi (opsiyonel)"
              className="w-full rounded-2xl border border-[#7B1113]/15 px-4 py-3 text-sm outline-none transition focus:border-[#7B1113] focus:ring-4 focus:ring-[#7B1113]/10"
            />

            <div className="space-y-2">
              <div className="text-sm font-medium text-[#7B1113]">Puaniniz</div>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    className="rounded-full p-1 transition hover:scale-105"
                  >
                    <Star
                      className={`h-6 w-6 ${
                        value <= rating ? "fill-amber-400 text-amber-400" : "fill-gray-200 text-gray-200"
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
              placeholder="Urun hakkindaki deneyiminizi yazin..."
              className="w-full rounded-3xl border border-[#7B1113]/15 px-4 py-3 text-sm leading-6 outline-none transition focus:border-[#7B1113] focus:ring-4 focus:ring-[#7B1113]/10"
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-[#7B1113]">Gorsel ekleyin</div>
                <div className="text-xs text-[#6b4b4c]">Maksimum {MAX_PRODUCT_REVIEW_IMAGES}</div>
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
                className="inline-flex items-center gap-2 rounded-full border border-[#7B1113]/15 px-4 py-2.5 text-sm font-medium text-[#7B1113] transition hover:border-[#7B1113]/35 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                Gorsel Sec
              </button>

              {uploadedImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {uploadedImages.map((image) => (
                    <div key={image.url} className="relative aspect-square overflow-hidden rounded-2xl bg-[#FFF5F5]">
                      <ReviewImageTile
                        source={image.previewUrl}
                        fallbackSource={image.url}
                        alt="Yuklenen yorum gorseli"
                        className="object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeUploadedImage(image.url)}
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl bg-[#FFF5F5] px-4 py-3 text-xs leading-6 text-[#6b4b4c]">
              Yorumlar once onaya duser. Onaylanan gorsel ve metinler urun sayfasinda yayinlanir.
            </div>

            {feedback ? (
              <div
                className={`rounded-2xl px-4 py-3 text-sm ${
                  feedback.type === "success"
                    ? "bg-green-50 text-green-700 ring-1 ring-green-200"
                    : "bg-red-50 text-red-700 ring-1 ring-red-200"
                }`}
              >
                {feedback.message}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending || isUploading}
              className="inline-flex min-w-[180px] items-center justify-center rounded-full bg-[#7B1113] px-6 py-3 text-sm font-medium uppercase tracking-wide text-white transition hover:bg-[#5d0e0f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Gonderiliyor..." : "Yorumu Gonder"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
