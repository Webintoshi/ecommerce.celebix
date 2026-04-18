"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import { TESTIMONIALS } from "@/lib/constants";
import type { HomepageTestimonial } from "@/lib/homepage";
import { cn } from "@/lib/utils";

const AUTO_PLAY_INTERVAL = 6800;

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
  heading = "Müşteri Notları",
  countLabel = "",
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
    <section className="py-16 lg:py-20">
      <div className="container-premium">
        <div className="mb-8">
          <SectionHeading label={heading} />
          {countLabel ? (
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#6E6761] sm:text-base">{countLabel}</p>
          ) : null}
        </div>

        <div
          className="mx-auto max-w-5xl rounded-[2rem] border border-[rgba(26,26,26,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(246,240,235,0.9))] p-6 shadow-[0_24px_70px_-56px_rgba(0,0,0,0.18)] sm:p-8"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div className={`flex items-start gap-4 ${testimonials.length > 1 ? "justify-end" : "justify-start"}`}>
            {testimonials.length > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={prevSlide}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(26,26,26,0.08)] bg-white/72 text-[#000000] transition-colors hover:bg-white"
                  aria-label="Önceki"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={nextSlide}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(26,26,26,0.08)] bg-white/72 text-[#000000] transition-colors hover:bg-white"
                  aria-label="Sonraki"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </div>

          <blockquote className="mt-6 max-w-4xl font-serif text-[1.55rem] leading-[1.18] tracking-[-0.025em] text-[#1F1A18] sm:text-[1.8rem] lg:text-[2rem]">
            {activeTestimonial.text}
          </blockquote>

          <div className="mt-8 flex flex-col gap-5 border-t border-[rgba(26,26,26,0.08)] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#EFE5DD]">
                {activeTestimonial.image ? (
                  <div className="relative h-full w-full">
                    <Image
                      src={activeTestimonial.image}
                      alt={activeTestimonial.name}
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  </div>
                ) : (
                  <span className="text-sm font-semibold tracking-[0.16em] text-[#8B8178]">
                    {getInitials(activeTestimonial.name)}
                  </span>
                )}
              </div>

              <div>
                <h3 className="font-serif text-[1.45rem] leading-none tracking-[-0.03em] text-[#000000]">
                  {activeTestimonial.name}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star
                        key={`${activeTestimonial.id}-${index}`}
                        className={cn(
                          "h-3.5 w-3.5",
                          index < activeTestimonial.rating
                            ? "fill-[#B7A296] text-[#B7A296]"
                            : "fill-[#E8DED7] text-[#E8DED7]",
                        )}
                      />
                    ))}
                  </div>

                  {activeTestimonial.verified ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-[#6E6761]">
                      <Check className="h-3.5 w-3.5" />
                      Doğrulanmış müşteri
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 sm:max-w-[48%] sm:justify-end">
              {testimonials.map((review, index) => {
                const isActive = index === currentIndex;

                return (
                  <button
                    key={review.id}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    className={cn(
                      "rounded-full border px-3 py-2 text-[10px] uppercase tracking-[0.16em] transition-colors",
                      isActive
                        ? "border-[rgba(183,162,150,0.42)] bg-[#F3E8E0] text-[#000000]"
                        : "border-[rgba(26,26,26,0.08)] bg-white/70 text-[#7E746B] hover:border-[rgba(26,26,26,0.16)] hover:text-[#000000]",
                    )}
                  >
                    {review.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
