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
  heading = "Musteri Yorumlari",
  countLabel = "Onayli degerlendirmeler geldikce bu alan otomatik guncellenir",
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
    <section className="bg-[#1d1715] py-16 text-white lg:py-20">
      <div className="container-premium">
        <div className="mb-10 grid gap-6 lg:grid-cols-[0.8fr_1fr] lg:items-end">
          <div>
            <p className="editorial-kicker text-[#d8b69b] before:bg-[#d8b69b]/45">Client Notes</p>
            <h2 className="mt-5 font-serif text-4xl leading-[0.95] tracking-[-0.045em] text-[#fff7f1] sm:text-5xl">
              {heading}
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-8 text-white/65 sm:text-base">{countLabel}</p>
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
                    <div
                      key={review.id}
                      className="rounded-[2rem] border border-white/10 bg-white/6 p-6 shadow-[0_30px_90px_-60px_rgba(0,0,0,0.8)] backdrop-blur"
                    >
                      <div className="flex items-start gap-5">
                        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/8">
                          {review.image ? (
                            <div className="relative h-full w-full">
                              <Image
                                src={review.image}
                                alt={review.name}
                                fill
                                className="object-cover"
                                sizes="64px"
                              />
                            </div>
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-lg font-semibold tracking-[0.24em] text-[#d8b69b]">
                              {getInitials(review.name)}
                            </div>
                          )}
                        </div>

                        <div className="flex-1">
                          <div className="mb-3 flex items-center gap-0.5">
                            {Array.from({ length: 5 }).map((_, index) => (
                              <Star
                                key={`${review.id}-${index}`}
                                className={cn(
                                  "h-3.5 w-3.5",
                                  index < review.rating
                                    ? "fill-[#d8b69b] text-[#d8b69b]"
                                    : "fill-white/10 text-white/10",
                                )}
                              />
                            ))}
                          </div>

                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-[#fff7f1]">
                              {review.name}
                            </span>
                            {review.verified ? (
                              <span className="inline-flex items-center gap-1 text-xs text-white/55">
                                <Check className="h-3 w-3" />
                                Dogrulanmis yorum
                              </span>
                            ) : null}
                          </div>

                          <p className="text-sm leading-8 text-white/72">{review.text}</p>
                        </div>
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
                className="absolute left-0 top-1/2 flex h-11 w-11 -translate-x-4 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white/72 transition-all hover:bg-white/14 hover:text-white lg:-translate-x-6"
                aria-label="Onceki"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={nextSlide}
                className="absolute right-0 top-1/2 flex h-11 w-11 translate-x-4 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white/72 transition-all hover:bg-white/14 hover:text-white lg:translate-x-6"
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
