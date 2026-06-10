"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";
import type { HomepageTestimonial } from "@/lib/homepage";
import { TESTIMONIALS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const PROOF_IMAGE_WIDTH = 640;

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
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const displaySrc = withProofImageWidth(src || "");

  if (!displaySrc) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-neutral-100 text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-400",
          className,
        )}
      >
        Görsel
      </div>
    );
  }

  return (
    <img
      src={displaySrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn("h-full w-full object-cover", className)}
    />
  );
}

function mapConstantTestimonials(): TestimonialItem[] {
  return TESTIMONIALS.map((item) => ({
    id: String(item.id),
    name: item.name,
    verified: true,
    rating: item.rating,
    content: item.text,
    title: item.title ?? null,
    proofImages: item.proofImages?.length ? item.proofImages : [],
  }));
}

function normalizeTestimonials(items?: HomepageTestimonial[]): TestimonialItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    return mapConstantTestimonials();
  }

  const fromApi = items
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

  if (fromApi.length === 0 || fromApi.every((item) => item.proofImages.length === 0)) {
    return mapConstantTestimonials();
  }

  return fromApi;
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

function VerifiedBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-neutral-500 sm:text-xs">
      <Check className="h-3 w-3 shrink-0" />
      {compact ? "Doğrulandı" : "Doğrulanmış Alıcı"}
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
      <div className="relative aspect-square overflow-hidden bg-neutral-100">
        <ProofImageWithFallback
          src={activeImage}
          alt={`${review.name} yorum görseli`}
          className="absolute inset-0"
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
  const primaryImage = review.proofImages[0];

  return (
    <article className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-[#E8DFD3] bg-white shadow-[0_12px_32px_-24px_rgba(15,23,42,0.2)]">
      <div className="flex items-start gap-3 border-b border-[#F0EBE3] p-4">
        {primaryImage ? (
          <div className="h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-xl bg-neutral-100">
            <ProofImageWithFallback
              src={primaryImage}
              alt={`${review.name} yorum görseli`}
              className="h-full w-full"
            />
          </div>
        ) : (
          <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-xl bg-[#FAF7F2] text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400">
            Yorum
          </div>
        )}

        <div className="min-w-0 flex-1 pt-0.5">
          <RatingStars rating={review.rating} iconClassName="h-3 w-3" />
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.06em] text-neutral-900">
              {review.name}
            </span>
            {review.verified ? <VerifiedBadge compact /> : null}
          </div>
          {review.title ? (
            <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-5 text-neutral-700">
              {review.title}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 pt-3">
        <p className="line-clamp-5 text-sm leading-6 text-neutral-600">{review.content}</p>
      </div>
    </article>
  );
}

function CarouselDots({
  count,
  currentIndex,
  onSelect,
  className,
}: {
  count: number;
  currentIndex: number;
  onSelect: (index: number) => void;
  className?: string;
}) {
  if (count <= 1) {
    return null;
  }

  return (
    <div className={cn("flex justify-center gap-2", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <button
          key={`dot-${index}`}
          type="button"
          onClick={() => onSelect(index)}
          className={cn(
            "h-1.5 rounded-full transition-all",
            index === currentIndex ? "w-6 bg-[#8A6B37]" : "w-1.5 bg-neutral-300 hover:bg-neutral-400",
          )}
          aria-label={`Slayt ${index + 1}`}
        />
      ))}
    </div>
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
  const [desktopIndex, setDesktopIndex] = useState(0);
  const [mobileIndex, setMobileIndex] = useState(0);

  const desktopSlides = Math.max(1, Math.ceil(testimonials.length / 2));

  const nextDesktopSlide = useCallback(() => {
    setDesktopIndex((prev) => (prev + 1) % desktopSlides);
  }, [desktopSlides]);

  const prevDesktopSlide = () => {
    setDesktopIndex((prev) => (prev - 1 + desktopSlides) % desktopSlides);
  };

  const nextMobileSlide = useCallback(() => {
    setMobileIndex((prev) => (prev + 1) % testimonials.length);
  }, [testimonials.length]);

  const prevMobileSlide = () => {
    setMobileIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  useEffect(() => {
    setDesktopIndex(0);
    setMobileIndex(0);
  }, [desktopSlides, testimonials.length]);

  if (testimonials.length === 0) {
    return null;
  }

  return (
    <section className="bg-[#F8F8F8F8] py-12 sm:py-16 lg:py-20">
      <div className="container-premium">
        <div className="mb-6 text-center sm:mb-8 lg:mb-10">
          <h2 className="home-section-heading font-medium">{heading}</h2>
          <p className="mt-1.5 text-xs text-neutral-500 sm:mt-2 sm:text-sm">{countLabel}</p>
        </div>

        <div className="lg:hidden">
          <div className="relative">
            <div className="overflow-hidden">
              <div
                className="flex transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${mobileIndex * 100}%)` }}
              >
                {testimonials.map((review) => (
                  <div key={review.id} className="w-full shrink-0 px-0.5">
                    <MobileTestimonialCard review={review} />
                  </div>
                ))}
              </div>
            </div>

            {testimonials.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={prevMobileSlide}
                  className="absolute left-0 top-1/2 flex h-9 w-9 -translate-x-1 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow-sm"
                  aria-label="Önceki yorum"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={nextMobileSlide}
                  className="absolute right-0 top-1/2 flex h-9 w-9 translate-x-1 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow-sm"
                  aria-label="Sonraki yorum"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            ) : null}
          </div>

          <CarouselDots
            count={testimonials.length}
            currentIndex={mobileIndex}
            onSelect={setMobileIndex}
            className="mt-5"
          />
        </div>

        <div className="relative hidden lg:block">
          <div className="overflow-hidden">
            <div
              className="flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${desktopIndex * 100}%)` }}
            >
              {Array.from({ length: desktopSlides }).map((_, slideIndex) => (
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

          {desktopSlides > 1 ? (
            <>
              <button
                type="button"
                onClick={prevDesktopSlide}
                className="absolute left-0 top-1/2 flex h-10 w-10 -translate-x-4 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-600 shadow-md transition-all hover:text-neutral-900 hover:shadow-lg lg:-translate-x-6"
                aria-label="Önceki"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={nextDesktopSlide}
                className="absolute right-0 top-1/2 flex h-10 w-10 translate-x-4 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-600 shadow-md transition-all hover:text-neutral-900 hover:shadow-lg lg:translate-x-6"
                aria-label="Sonraki"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          ) : null}

          <CarouselDots
            count={desktopSlides}
            currentIndex={desktopIndex}
            onSelect={setDesktopIndex}
            className="mt-8"
          />
        </div>
      </div>
    </section>
  );
}
