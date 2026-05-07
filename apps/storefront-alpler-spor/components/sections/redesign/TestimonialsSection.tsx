"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Check, ChevronLeft, ChevronRight, Quote, Star } from "lucide-react";
import { repairDisplayText } from "@/lib/display-text";
import type { HomepageTestimonial } from "@/lib/homepage";
import { TESTIMONIALS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const AUTO_PLAY_INTERVAL = 5000;

type TestimonialItem = {
  id: string;
  name: string;
  rating: number;
  text: string;
  image?: string | null;
  title?: string | null;
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
      name: repairDisplayText(item.name),
      rating: item.rating,
      text: repairDisplayText(item.text),
      image: item.image,
      title: repairDisplayText(item.role),
      verified: true,
    }));
  }

  return items
    .filter((item) => item.body && item.name)
    .map((item) => ({
      id: item.id,
      name: repairDisplayText(item.name),
      rating: Math.max(1, Math.min(5, item.rating || 5)),
      text: repairDisplayText(item.body),
      image: item.image,
      title: repairDisplayText(item.title || null) || null,
      verified: true,
    }));
}

export function TestimonialsSection({
  heading = "Müşteri Yorumları",
  countLabel = "Onaylı değerlendirmeler geldikçe bu alan otomatik güncellenir",
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

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
  }, [totalSlides]);

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
    <section className="relative overflow-hidden bg-[#F5F7FA] py-16 lg:py-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(255,106,0,0.12),transparent_72%)]" />
      <div className="container-premium">
        <div className="mb-8 text-center lg:mb-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#FF6A00]/15 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-[#C2410C] shadow-sm">
            Gerçek Deneyimler
          </span>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-[#111827] sm:text-4xl">
            {heading}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-[#6B7280] sm:text-[15px]">
            Alpler Spor&apos;dan alışveriş yapan müşterilerin ürün, teslimat ve deneyim yorumları.
          </p>
          <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-[#9CA3AF]">
            {countLabel}
          </p>
        </div>

        <div
          className="relative"
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
                  className="grid w-full flex-shrink-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6"
                >
                  {testimonials.slice(slideIndex * 2, slideIndex * 2 + 2).map((review) => (
                    <article
                      key={review.id}
                      className="group relative overflow-hidden rounded-[1.75rem] border border-[#E5E7EB] bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-1 hover:border-[#FF6A00]/30 hover:shadow-[0_24px_50px_rgba(15,23,42,0.10)] sm:p-6"
                    >
                      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#FF6A00] via-[#FF8A3D] to-transparent" />

                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, index) => (
                            <Star
                              key={`${review.id}-${index}`}
                              className={cn(
                                "h-3.5 w-3.5",
                                index < review.rating
                                  ? "fill-[#F59E0B] text-[#F59E0B]"
                                  : "fill-neutral-200 text-neutral-200",
                              )}
                            />
                          ))}
                        </div>
                        {review.verified ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF1E8] px-3 py-1 text-[11px] font-bold text-[#C2410C]">
                            <Check className="h-3.5 w-3.5" />
                            Doğrulanmış Alışveriş
                          </span>
                        ) : null}
                      </div>

                      <div className="mb-4 flex items-start gap-4">
                        {review.image ? (
                          <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-full border border-[#E5E7EB] bg-[#F8FAFC]">
                            <Image
                              src={review.image}
                              alt={review.name}
                              fill
                              className="object-cover"
                              sizes="56px"
                            />
                          </div>
                        ) : (
                          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-[#111827] text-sm font-black uppercase tracking-[0.2em] text-white">
                            {getInitials(review.name)}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-black uppercase tracking-[0.14em] text-[#111827]">
                                {review.name}
                              </p>
                              <p className="mt-1 text-xs font-medium text-[#6B7280]">
                                Alpler Spor müşterisi
                              </p>
                            </div>
                            <Quote className="hidden h-5 w-5 flex-shrink-0 text-[#FF6A00] sm:block" />
                          </div>

                          {review.title ? (
                            <div className="mt-3">
                              <span className="inline-flex items-center rounded-full border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-1 text-[11px] font-bold text-[#374151]">
                                {review.title}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <p className="text-sm leading-7 text-[#4B5563] sm:text-[15px]">
                        {review.text}
                      </p>
                    </article>
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
                className="absolute left-0 top-1/2 hidden h-11 w-11 -translate-x-5 -translate-y-1/2 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-[#374151] shadow-md transition-all hover:border-[#FF6A00] hover:text-[#FF6A00] hover:shadow-lg lg:flex"
                aria-label="Önceki"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={nextSlide}
                className="absolute right-0 top-1/2 hidden h-11 w-11 translate-x-5 -translate-y-1/2 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-[#374151] shadow-md transition-all hover:border-[#FF6A00] hover:text-[#FF6A00] hover:shadow-lg lg:flex"
                aria-label="Sonraki"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          ) : null}

          {totalSlides > 1 ? (
            <div className="mt-6 flex items-center justify-center gap-2 lg:hidden">
              {Array.from({ length: totalSlides }).map((_, dotIndex) => (
                <button
                  key={`testimonial-dot-${dotIndex}`}
                  type="button"
                  onClick={() => setCurrentIndex(dotIndex)}
                  className={cn(
                    "h-2.5 rounded-full transition-all",
                    dotIndex === currentIndex
                      ? "w-7 bg-[#FF6A00]"
                      : "w-2.5 bg-[#D1D5DB] hover:bg-[#9CA3AF]",
                  )}
                  aria-label={`Yorum grubu ${dotIndex + 1}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
