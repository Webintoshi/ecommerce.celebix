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
      <div className="flex h-full w-full items-center justify-center bg-neutral-100 px-2 text-center text-[11px] font-medium text-neutral-500">
        Görsel yüklenemedi
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
          throw new Error(payload?.error || "Yorumlar yüklenemedi");
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
        message: `En fazla ${MAX_PRODUCT_REVIEW_IMAGES} görsel ekleyebilirsiniz.`,
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
          throw new Error(payload?.error || `${file.name} yüklenemedi`);
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
        message: error instanceof Error ? error.message : "Görseller yüklenemedi.",
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
          message: payload?.error || "Yorum gönderilemedi.",
        });
        return;
      }

      resetForm();
      setFeedback({
        type: "success",
        message: payload?.message || "Yorumunuz onay için alındı.",
      });
    });
  };

  return (
    <section className="space-y-8 border-t border-neutral-200 pt-8">
      <div className="space-y-3">
        <div>
          <p className="text-neutral-500 text-xs font-medium tracking-[0.2em] uppercase">Ürün Yorumları</p>
          <h2 className="mt-2 text-2xl tracking-tight text-neutral-900">Müşteri yorumları</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-600">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <Star
                key={value}
                className={`h-4 w-4 ${
                  value <= Math.round(summary.rating)
                    ? "fill-[#8A6B37] text-[#8A6B37]"
                    : "fill-neutral-200 text-neutral-200"
                }`}
              />
            ))}
          </div>
          <span className="font-medium text-neutral-900">{summary.rating.toFixed(1)}</span>
          <span aria-hidden="true" className="text-neutral-300">/</span>
          <span>{summary.reviewCount} onaylı yorum</span>
          <span aria-hidden="true" className="text-neutral-300">/</span>
          <span>Yeni yorumlar önce moderasyona düşer.</span>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="space-y-4">
          {isLoading ? (
            <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500 shadow-sm">
              Yorumlar yükleniyor...
            </div>
          ) : reviews.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-8 text-center shadow-sm">
              <p className="text-base font-medium text-neutral-900">Bu ürün için henüz onaylı yorum yok.</p>
              <p className="mt-2 text-sm leading-6 text-neutral-500">
                İlk görselli yorumu siz gönderin. Onay sonrası burada yayınlanır.
              </p>
            </div>
          ) : (
            reviews.map((review) => (
              <article key={review.id} className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-neutral-900">{review.reviewerName}</div>
                    <div className="mt-1 text-xs text-neutral-500">{formatDate(review.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <Star
                        key={value}
                        className={`h-4 w-4 ${
                          value <= review.rating
                            ? "fill-[#8A6B37] text-[#8A6B37]"
                            : "fill-neutral-200 text-neutral-200"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                {review.title ? (
                  <h3 className="mt-4 text-base font-semibold text-neutral-900">{review.title}</h3>
                ) : null}
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-600">{review.body}</p>
                {review.imageUrls.length > 0 ? (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {review.imageUrls.map((imageUrl, index) => (
                      <div key={`${review.id}-${index}`} className="relative aspect-square overflow-hidden rounded-2xl bg-neutral-100">
                        <ReviewImageTile
                          source={resolveStorefrontAssetUrl(imageUrl) || imageUrl}
                          fallbackSource={resolveStorefrontDirectAssetUrl(imageUrl) || imageUrl}
                          alt={`${productName} yorum görseli ${index + 1}`}
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

        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm lg:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-neutral-900">Yorum bırak</h3>
              <p className="mt-1 text-sm text-neutral-500">Görsel ekleyebilir, ürünü puanlayabilirsiniz.</p>
            </div>
            <Camera className="h-5 w-5 text-neutral-400" />
          </div>

          <div className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                value={reviewerName}
                onChange={(event) => setReviewerName(event.target.value)}
                placeholder="Ad Soyad"
                className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none transition focus:border-[#8A6B37] focus:ring-4 focus:ring-[#8A6B37]/10"
              />
              <input
                value={reviewerEmail}
                onChange={(event) => setReviewerEmail(event.target.value)}
                placeholder="E-posta (opsiyonel)"
                className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none transition focus:border-[#8A6B37] focus:ring-4 focus:ring-[#8A6B37]/10"
              />
            </div>

            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Yorum başlığı (opsiyonel)"
              className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none transition focus:border-[#8A6B37] focus:ring-4 focus:ring-[#8A6B37]/10"
            />

            <div className="space-y-2">
              <div className="text-sm font-medium text-neutral-900">Puanınız</div>
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
                        value <= rating ? "fill-[#8A6B37] text-[#8A6B37]" : "fill-neutral-200 text-neutral-200"
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
              placeholder="Ürün hakkındaki deneyiminizi yazın..."
              className="w-full rounded-3xl border border-neutral-200 px-4 py-3 text-sm leading-6 outline-none transition focus:border-[#8A6B37] focus:ring-4 focus:ring-[#8A6B37]/10"
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-neutral-900">Görsel ekleyin</div>
                <div className="text-xs text-neutral-500">Maksimum {MAX_PRODUCT_REVIEW_IMAGES}</div>
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
                className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                Görsel Seç
              </button>

              {uploadedImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {uploadedImages.map((image) => (
                    <div key={image.url} className="relative aspect-square overflow-hidden rounded-2xl bg-neutral-100">
                      <ReviewImageTile
                        source={image.previewUrl}
                        fallbackSource={image.url}
                        alt="Yüklenen yorum görseli"
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

            <div className="rounded-2xl bg-neutral-50 px-4 py-3 text-xs leading-6 text-neutral-500">
              Yorumlar önce onaya düşer. Onaylanan görsel ve metinler ürün sayfasında yayınlanır.
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
              className="inline-flex min-w-[180px] items-center justify-center rounded-full bg-[#8A6B37] px-6 py-3 text-sm font-medium uppercase tracking-wide text-white transition hover:bg-[#755a2d] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Gönderiliyor..." : "Yorumu Gönder"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
