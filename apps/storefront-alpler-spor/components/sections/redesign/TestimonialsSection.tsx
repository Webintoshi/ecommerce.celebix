"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";
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
    <section className="bg-[#F5F7FA] py-16 lg:py-20">
      <div className="container-premium">
        <div className="mb-10 text-center">
          <h2 className="mb-2 text-2xl font-medium text-neutral-900 lg:text-3xl">{heading}</h2>
          <p className="text-sm text-neutral-500">{countLabel}</p>
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
                  className="grid w-full flex-shrink-0 grid-cols-1 gap-6 lg:grid-cols-2"
                >
                  {testimonials.slice(slideIndex * 2, slideIndex * 2 + 2).map((review) => (
                    <div key={review.id} className="flex overflow-hidden rounded-[1.5rem] border border-[#E5E7EB] bg-white shadow-sm">
                      <div className="flex w-32 flex-shrink-0 items-center justify-center bg-[#EEF2F7] sm:w-40 lg:w-48">
                        {review.image ? (
                          <div className="relative h-20 w-20 overflow-hidden rounded-full">
                            <Image
                              src={review.image}
                              alt={review.name}
                              fill
                              className="object-cover"
                              sizes="80px"
                            />
                          </div>
                        ) : (
                          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#FFF1E8] text-lg font-semibold tracking-[0.24em] text-[#C2410C]">
                            {getInitials(review.name)}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col justify-center p-4 sm:p-5">
                        <div className="mb-3 flex items-center gap-0.5">
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

                        <div className="mb-3 flex items-center gap-2">
                          <span className="text-sm font-semibold uppercase text-neutral-900">
                            {review.name}
                          </span>
                          {review.verified ? (
                            <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
                              <Check className="h-3 w-3" />
                              Doğrulanmış
                            </span>
                          ) : null}
                        </div>

                        <p className="text-sm leading-relaxed text-neutral-600">{review.text}</p>
                      </div>
                    </div>
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
                className="absolute left-0 top-1/2 flex h-10 w-10 -translate-x-4 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-600 shadow-md transition-all hover:text-[#FF6A00] hover:shadow-lg lg:-translate-x-6"
                aria-label="Önceki"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={nextSlide}
                className="absolute right-0 top-1/2 flex h-10 w-10 translate-x-4 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-600 shadow-md transition-all hover:text-[#FF6A00] hover:shadow-lg lg:translate-x-6"
                aria-label="Sonraki"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
