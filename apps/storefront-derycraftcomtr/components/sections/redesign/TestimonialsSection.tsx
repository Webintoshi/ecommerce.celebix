"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { resolveStorefrontAssetUrl, resolveStorefrontDirectAssetUrl } from "@/lib/asset-url";
import type { HomepageTestimonial } from "@/lib/homepage";
import { TESTIMONIALS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const AUTO_PLAY_INTERVAL = 5000;

type TestimonialItem = {
  id: string;
  name: string;
  verified: boolean;
  rating: number;
  content: string;
  image?: string | null;
};

function ImageWithFallback({
  src,
  alt,
  fallback,
}: {
  src?: string | null;
  alt: string;
  fallback: string;
}) {
  const proxiedSource = resolveStorefrontAssetUrl(src || "");
  const directSource = resolveStorefrontDirectAssetUrl(src || "");
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
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#8A6B37]/10 text-lg font-semibold tracking-[0.24em] text-[#8A6B37]">
        {fallback}
      </div>
    );
  }

  return (
    <div className="relative h-20 w-20 overflow-hidden rounded-full">
      <Image
        src={currentSource}
        alt={alt}
        fill
        className="object-cover"
        sizes="80px"
        onError={handleError}
      />
    </div>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

function normalizeTestimonials(items?: HomepageTestimonial[]): TestimonialItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    return TESTIMONIALS.map((item) => ({
      id: String(item.id),
      name: item.name,
      verified: true,
      rating: item.rating,
      content: item.text,
      image: item.image,
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
      image: item.image,
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

function DesktopTestimonialCard({ review }: { review: TestimonialItem }) {
  return (
    <div className="flex h-full overflow-hidden rounded-[30px] border border-[#ebe2d6] bg-white shadow-[0_22px_48px_-32px_rgba(55,38,16,0.3)]">
      <div className="flex w-32 flex-shrink-0 items-center justify-center bg-[linear-gradient(180deg,#faf6ef_0%,#f3ece0_100%)] sm:w-40 lg:w-48">
        <ImageWithFallback
          src={review.image}
          alt={review.name}
          fallback={getInitials(review.name)}
        />
      </div>

      <div className="flex flex-1 flex-col justify-center p-5 sm:p-6">
        <div className="mb-3">
          <RatingStars rating={review.rating} />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 gap-y-1">
          <span className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-900">
            {review.name}
          </span>
          {review.verified ? <VerifiedBadge /> : null}
        </div>

        <p className="text-sm leading-7 text-neutral-600">{review.content}</p>
      </div>
    </div>
  );
}

function MobileTestimonialCard({ review }: { review: TestimonialItem }) {
  return (
    <article className="relative min-w-[86%] max-w-[86%] snap-center overflow-hidden rounded-[28px] border border-[#ebe2d6] bg-[linear-gradient(180deg,#fffdfa_0%,#ffffff_100%)] p-5 shadow-[0_22px_48px_-32px_rgba(55,38,16,0.34)]">
      <div className="pointer-events-none absolute right-4 top-2 text-[4rem] leading-none text-[#8A6B37]/10">
        &quot;
      </div>

      <div className="flex items-start gap-4">
        <div className="rounded-[24px] bg-[linear-gradient(180deg,#faf6ef_0%,#f3ece0_100%)] p-2.5">
          <ImageWithFallback
            src={review.image}
            alt={review.name}
            fallback={getInitials(review.name)}
          />
        </div>

        <div className="min-w-0 flex-1 pt-1">
          <RatingStars rating={review.rating} iconClassName="h-4 w-4" />

          <div className="mt-3 flex flex-wrap items-center gap-2 gap-y-1">
            <span className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-900">
              {review.name}
            </span>
            {review.verified ? <VerifiedBadge /> : null}
          </div>
        </div>
      </div>

      <p className="mt-5 text-[0.95rem] leading-7 text-neutral-700">{review.content}</p>
    </article>
  );
}

export function TestimonialsSection({
  heading = "Müşteri Yorumları",
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
    <section className="bg-neutral-50 py-16 lg:py-20">
      <div className="container-premium">
        <div className="mb-8 text-center lg:mb-10">
          <h2 className="mb-2 text-[1.8rem] font-medium text-neutral-900 lg:text-[2.1rem]">{heading}</h2>
          <p className="text-sm text-neutral-500">{countLabel}</p>
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
                aria-label="Onceki"
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
