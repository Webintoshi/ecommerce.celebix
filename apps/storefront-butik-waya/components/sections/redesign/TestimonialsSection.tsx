"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";
import type { HomepageTestimonial } from "@/lib/homepage";
import { TESTIMONIALS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const AUTO_PLAY_INTERVAL = 6200;

type TestimonialItem = {
  id: string;
  name: string;
  rating: number;
  text: string;
  image?: string | null;
  verified?: boolean;
};

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
      rating: item.rating,
      text: item.text,
      image: item.image,
      verified: true,
    }));
  }

  return items
    .filter((item) => item.body && item.name)
    .map((item) => ({
      id: item.id,
      name: item.name,
      rating: Math.max(1, Math.min(5, item.rating || 5)),
      text: item.body,
      image: item.image,
      verified: true,
    }));
}

export function TestimonialsSection({
  heading = "Musteri notlari",
  countLabel = "Dogrulanmis yorumlar geldikce bu alan otomatik olarak guncellenir",
  items,
}: {
  heading?: string;
  countLabel?: string;
  items?: HomepageTestimonial[];
}) {
  const testimonials = useMemo(() => normalizeTestimonials(items), [items]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const activeTestimonial = testimonials[currentIndex] || testimonials[0];
  const reviewCountLabel = `${testimonials.length} yorum`;

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  }, [testimonials.length]);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  }, [testimonials.length]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [testimonials.length]);

  useEffect(() => {
    if (isPaused || testimonials.length <= 1) {
      return undefined;
    }

    const interval = setInterval(nextSlide, AUTO_PLAY_INTERVAL);
    return () => clearInterval(interval);
  }, [isPaused, nextSlide, testimonials.length]);

  if (testimonials.length === 0) {
    return null;
  }

  return (
    <section className="py-20 lg:py-28">
      <div className="container-premium">
        <div className="mb-12 grid gap-6 lg:grid-cols-[0.78fr_1fr] lg:items-end">
          <div>
            <p className="editorial-kicker">Musteri notlari</p>
            <h2 className="mt-5 font-serif text-4xl leading-[0.95] tracking-[-0.045em] text-[#1A1A1A] sm:text-5xl">
              {heading}
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-8 text-[#69635E] sm:text-base">{countLabel}</p>
        </div>

        <div
          className="relative rounded-[2.5rem] border border-[rgba(26,26,26,0.08)] bg-white/92 p-6 shadow-[0_28px_90px_-64px_rgba(0,0,0,0.22)] sm:p-8 lg:p-10"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div className="grid gap-8 lg:grid-cols-[0.4fr_1fr] lg:gap-12">
            <div className="flex flex-col justify-between gap-8 border-b border-[rgba(26,26,26,0.08)] pb-8 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-10">
              <div>
                <div className="flex items-center gap-4">
                  <div className="flex h-[72px] w-[72px] flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[rgba(26,26,26,0.08)] bg-[#F2EEE9]">
                    {activeTestimonial.image ? (
                      <div className="relative h-full w-full">
                        <Image
                          src={activeTestimonial.image}
                          alt={activeTestimonial.name}
                          fill
                          className="object-cover"
                          sizes="72px"
                        />
                      </div>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg font-semibold tracking-[0.22em] text-[#7D756D]">
                        {getInitials(activeTestimonial.name)}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-[#7A736D]">
                      Dogrulanmis musteri
                    </p>
                    <h3 className="mt-2 font-serif text-3xl leading-none tracking-[-0.04em] text-[#1A1A1A]">
                      {activeTestimonial.name}
                    </h3>
                  </div>
                </div>

                <div className="mt-6 flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star
                      key={`${activeTestimonial.id}-${index}`}
                      className={cn(
                        "h-4 w-4",
                        index < activeTestimonial.rating
                          ? "fill-[#7D756D] text-[#7D756D]"
                          : "fill-[#E2DDD8] text-[#E2DDD8]",
                      )}
                    />
                  ))}
                </div>

                {activeTestimonial.verified ? (
                  <p className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#69635E]">
                    <Check className="h-3.5 w-3.5" />
                    Dogrulanmis alisveris
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-[#7A736D]">
                    Geri bildirim
                  </p>
                  <p className="mt-2 text-sm text-[#69635E]">{reviewCountLabel}</p>
                </div>

                {testimonials.length > 1 ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={prevSlide}
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(26,26,26,0.1)] bg-[#F7F5F2] text-[#1A1A1A] transition-colors hover:bg-white"
                      aria-label="Onceki"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={nextSlide}
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(26,26,26,0.1)] bg-[#F7F5F2] text-[#1A1A1A] transition-colors hover:bg-white"
                      aria-label="Sonraki"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col justify-between gap-8">
              <div>
                <span className="font-serif text-[5rem] leading-none text-[#DED8D2] lg:text-[6.5rem]">
                  &ldquo;
                </span>
                <blockquote className="-mt-4 max-w-4xl font-serif text-[2rem] leading-[1.08] tracking-[-0.03em] text-[#1A1A1A] sm:text-[2.4rem] lg:text-[2.9rem]">
                  {activeTestimonial.text}
                </blockquote>
              </div>

              <div className="flex flex-wrap gap-2">
                {testimonials.map((review, index) => (
                  <button
                    key={review.id}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    className={`rounded-full border px-4 py-2 text-[11px] uppercase tracking-[0.18em] transition-colors ${
                      index === currentIndex
                        ? "border-[#1A1A1A] bg-[#1A1A1A] text-white"
                        : "border-[rgba(26,26,26,0.1)] bg-[#F7F5F2] text-[#69635E] hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
                    }`}
                  >
                    {review.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
