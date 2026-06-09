"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { resolveStorefrontAssetUrl, resolveStorefrontDirectAssetUrl } from "@/lib/asset-url";
import type { HomepageTestimonial } from "@/lib/homepage";
import { TESTIMONIALS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const AUTO_PLAY_INTERVAL = 5000;
const PROOF_IMAGE_WIDTH = 480;

type TestimonialItem = {
  id: string;
  name: string;
  verified: boolean;
  rating: number;
  content: string;
  title?: string | null;
  proofImages: string[];
};

function withProofImageWidth(src: string) {
  if (!src) {
    return src;
  }

  if (src.includes("images.celebix.co") && src.includes("width=")) {
    return src.replace(/width=\d+/i, `width=${PROOF_IMAGE_WIDTH}`);
  }

  return src;
}

function ProofImageWithFallback({
  src,
  alt,
  className,
  sizes,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  sizes: string;
}) {
  const normalizedSrc = withProofImageWidth(src || "");
  const proxiedSource = resolveStorefrontAssetUrl(normalizedSrc);
  const directSource = resolveStorefrontDirectAssetUrl(normalizedSrc);
  const [currentSource, setCurrentSource] = useState(proxiedSource || directSource || "");
  const [usedFallback, setUsedFallback] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setCurrentSource(proxiedSource || directSource || "");
    setUsedFallback(false);
    setError(false);
  }, [directSource, proxiedSource]);

  const handleError = () => {
    if (!usedFallback && directSource && directSource !== currentSource) {
      setCurrentSource(directSource);
      setUsedFallback(true);
      return;
    }

    setError(true);
  };

  if (error || !currentSource) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-neutral-100 text-xs font-medium uppercase tracking-[0.18em] text-neutral-400",
          className,
        )}
      >
        Görsel
      </div>
    );
  }

  return (
    <div className={cn("relative h-full w-full", className)}>
      <Image
        src={currentSource}
        alt={alt}
        fill
        className="object-cover"
        sizes={sizes}
        onError={handleError}
      />
    </div>
  );
}

function normalizeTestimonials(items?: HomepageTestimonial[]): TestimonialItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    return TESTIMONIALS.map((item) => ({
      id: String(item.id),
      name: item.name,
      verified: true,
      rating: item.rating,
      content: item.text,
      title: item.title ?? null,
      proofImages: item.proofImages?.length
        ? item.proofImages
        : item.image
          ? [item.image]
          : [],
    }));
  }

  return items
    .filter((item) => item.body && item.name)
    .map((item) => ({
      id: item.id,
      name: item.name,
      verified: true,
      rating: Math.max(1, Math.min(5, item.rating || 5)),
      content: item.body,
      title: item.title ?? null,
      proofImages:
        item.proofImages && item.proofImages.length > 0
          ? item.proofImages
          : item.image
            ? [item.image]
            : [],
    }));
}

function RatingStars({
  rating,
  iconClassName = "h-3.5 w-3.5",
}: {
  rating: number;
  iconClassName?: string;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[...Array(5)].map((_, index) => (
        <Star
          key={index}
          className={cn(
            iconClassName,
            index < rating ? "fill-[#8A6B37] text-[#8A6B37]" : "fill-neutral-200 text-neutral-200",
          )}
        />
      ))}
    </div>
  );
}

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
      <Check className="h-3 w-3" />
      Doğrulanmış Alıcı
    </span>
  );
}

function ProofGallery({ review }: { review: TestimonialItem }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const images = review.proofImages;
  const activeImage = images[activeIndex] || images[0];

  if (!activeImage) {
    return (
      <div className="flex h-full min-h-[220px] items-center justify-center bg-neutral-100 text-xs font-medium uppercase tracking-[0.18em] text-neutral-400 sm:min-h-full">
        Görsel kanıt
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-[220px] flex-1 overflow-hidden bg-neutral-100 sm:min-h-[260px]">
        <ProofImageWithFallback
          src={activeImage}
          alt={`${review.name} yorum görseli`}
          className="absolute inset-0"
          sizes="(max-width: 1024px) 100vw, 280px"
        />
      </div>

      {images.length > 1 ? (
        <div className="grid grid-cols-3 gap-1 border-t border-neutral-200/80 bg-white p-1">
          {images.slice(0, 3).map((image, index) => (
            <button
              key={`${review.id}-proof-${index}`}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={cn(
                "relative aspect-[4/3] overflow-hidden rounded-md border transition-colors",
                index === activeIndex
                  ? "border-[#8A6B37]"
                  : "border-transparent opacity-70 hover:opacity-100",
              )}
              aria-label={`${review.name} görsel ${index + 1}`}
            >
              <ProofImageWithFallback
                src={image}
                alt={`${review.name} yorum görseli ${index + 1}`}
                className="absolute inset-0"
                sizes="96px"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DesktopTestimonialCard({ review }: { review: TestimonialItem }) {
  return (
    <article className="flex h-full overflow-hidden rounded-[24px] border border-neutral-200 bg-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.18)]">
      <div className="w-[38%] max-w-[280px] shrink-0 border-r border-neutral-200/80">
        <ProofGallery review={review} />
      </div>

      <div className="flex flex-1 flex-col justify-center p-5 sm:p-6">
        <RatingStars rating={review.rating} />

        <div className="mt-3 flex flex-wrap items-center gap-2 gap-y-1">
          <span className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-900">
            {review.name}
          </span>
          {review.verified ? <VerifiedBadge /> : null}
        </div>

        {review.title ? (
          <p className="mt-2 text-sm font-medium text-neutral-800">{review.title}</p>
        ) : null}

        <p className="mt-3 text-sm leading-7 text-neutral-600">{review.content}</p>
      </div>
    </article>
  );
}

function MobileTestimonialCard({ review }: { review: TestimonialItem }) {
  return (
    <article className="min-w-[88%] max-w-[88%] snap-center overflow-hidden rounded-[24px] border border-neutral-200 bg-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.18)]">
      <ProofGallery review={review} />

      <div className="p-5">
        <RatingStars rating={review.rating} iconClassName="h-4 w-4" />

        <div className="mt-3 flex flex-wrap items-center gap-2 gap-y-1">
          <span className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-900">
            {review.name}
          </span>
          {review.verified ? <VerifiedBadge /> : null}
        </div>

        {review.title ? (
          <p className="mt-2 text-sm font-medium text-neutral-800">{review.title}</p>
        ) : null}

        <p className="mt-3 text-[0.95rem] leading-7 text-neutral-700">{review.content}</p>
      </div>
    </article>
  );
}

export function TestimonialsSection({
  heading = "Güncel Yorumlar",
  countLabel = "1581 değerlendirmeden",
  items,
}: {
  heading?: string;
  countLabel?: string;
  items?: HomepageTestimonial[];
}) {
  const testimonials = useMemo(() => normalizeTestimonials(items), [items]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const totalSlides = Math.max(1, Math.ceil(testimonials.length / 2));

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % totalSlides);
  }, [totalSlides]);

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  useEffect(() => {
    setCurrentIndex(0);
  }, [totalSlides]);

  useEffect(() => {
    if (isPaused || totalSlides <= 1) {
      return undefined;
    }

    const interval = setInterval(nextSlide, AUTO_PLAY_INTERVAL);
    return () => clearInterval(interval);
  }, [isPaused, nextSlide, totalSlides]);

  if (testimonials.length === 0) {
    return null;
  }

  return (
    <section className="bg-[#F8F8F8F8] py-16 lg:py-20">
      <div className="container-premium">
        <div className="mb-8 text-center lg:mb-10">
          <h2 className="font-serif text-[1.8rem] font-medium text-neutral-900 lg:text-[2.1rem]">
            {heading}
          </h2>
          <p className="mt-2 text-sm text-neutral-500">{countLabel}</p>
        </div>

        <div className="lg:hidden">
          <div className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex snap-x snap-mandatory gap-4 pb-2">
              {testimonials.map((review) => (
                <MobileTestimonialCard key={review.id} review={review} />
              ))}
            </div>
          </div>
        </div>

        <div
          className="relative hidden lg:block"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div className="overflow-hidden">
            <div
              className="flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${currentIndex * 100}%)` }}
            >
              {Array.from({ length: totalSlides }).map((_, slideIndex) => (
                <div
                  key={`testimonial-slide-${slideIndex}`}
                  className="grid w-full flex-shrink-0 grid-cols-2 gap-6"
                >
                  {testimonials.slice(slideIndex * 2, slideIndex * 2 + 2).map((review) => (
                    <DesktopTestimonialCard key={review.id} review={review} />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {totalSlides > 1 ? (
            <>
              <button
                type="button"
                onClick={prevSlide}
                className="absolute left-0 top-1/2 flex h-10 w-10 -translate-x-4 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-600 shadow-md transition-all hover:text-neutral-900 hover:shadow-lg lg:-translate-x-6"
                aria-label="Önceki"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={nextSlide}
                className="absolute right-0 top-1/2 flex h-10 w-10 translate-x-4 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-600 shadow-md transition-all hover:text-neutral-900 hover:shadow-lg lg:translate-x-6"
                aria-label="Sonraki"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          ) : null}

          {totalSlides > 1 ? (
            <div className="mt-8 flex justify-center gap-2">
              {Array.from({ length: totalSlides }).map((_, index) => (
                <button
                  key={`testimonial-dot-${index}`}
                  type="button"
                  onClick={() => goToSlide(index)}
                  className={cn(
                    "h-2 rounded-full transition-all",
                    index === currentIndex ? "w-8 bg-[#8A6B37]" : "w-2 bg-neutral-300 hover:bg-neutral-400",
                  )}
                  aria-label={`Slayt ${index + 1}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
