"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";
import type { HomepageTestimonial } from "@/lib/homepage";
import { TESTIMONIALS } from "@/lib/constants";
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
  const slideLabel = `${String(currentIndex + 1).padStart(2, "0")} / ${String(
    testimonials.length,
  ).padStart(2, "0")}`;

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
        <div className="mb-12 grid gap-6 lg:grid-cols-[0.8fr_1fr] lg:items-end">
          <div>
            <p className="editorial-kicker">Women of Waya</p>
            <h2 className="mt-5 font-serif text-4xl leading-[0.95] tracking-[-0.045em] text-[#1A1A1A] sm:text-5xl">
              {heading}
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-8 text-[#6E6761] sm:text-base">{countLabel}</p>
        </div>

        <div
          className="relative overflow-hidden rounded-[2.75rem] border border-[rgba(26,26,26,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(245,239,234,0.96))] p-6 shadow-[0_30px_90px_-64px_rgba(0,0,0,0.18)] sm:p-8 lg:p-10"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div className="absolute -left-10 top-8 h-40 w-40 rounded-full bg-[#EEE1D7]/70 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-48 w-48 rounded-full bg-[#F7F0EA]/90 blur-3xl" />

          <div className="relative grid gap-8 lg:grid-cols-[0.42fr_0.58fr] lg:gap-12">
            <div className="space-y-5">
              <div className="relative overflow-hidden rounded-[2.35rem] bg-[#EFE5DD]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.42),transparent_56%)]" />
                <div className="relative aspect-[4/5]">
                  {activeTestimonial.image ? (
                    <Image
                      src={activeTestimonial.image}
                      alt={activeTestimonial.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 1024px) 100vw, 34vw"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,#F4ECE5,#E7DBD1)]">
                      <span className="font-serif text-[3.4rem] tracking-[0.12em] text-[#9C8D82]">
                        {getInitials(activeTestimonial.name)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[1.9rem] border border-[rgba(26,26,26,0.08)] bg-white/76 p-5">
                <p className="text-[10px] uppercase tracking-[0.24em] text-[#8B8178]">
                  Yorum sahibi
                </p>
                <div className="mt-4 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-serif text-[2rem] leading-[0.94] tracking-[-0.04em] text-[#1A1A1A]">
                      {activeTestimonial.name}
                    </h3>
                    {activeTestimonial.verified ? (
                      <p className="mt-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#6E6761]">
                        <Check className="h-3.5 w-3.5" />
                        Dogrulanmis musteri
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star
                        key={`${activeTestimonial.id}-${index}`}
                        className={cn(
                          "h-4 w-4",
                          index < activeTestimonial.rating
                            ? "fill-[#B7A296] text-[#B7A296]"
                            : "fill-[#E8DED7] text-[#E8DED7]",
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-8">
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-[#8B8178]">
                  Nazik geri bildirimler
                </p>
                <span className="mt-4 block font-serif text-[5rem] leading-none text-[#DDD1C8] sm:text-[6rem]">
                  &ldquo;
                </span>
                <blockquote className="-mt-3 max-w-4xl font-serif text-[2rem] leading-[1.12] tracking-[-0.03em] text-[#1F1A18] sm:text-[2.35rem] lg:text-[2.95rem]">
                  {activeTestimonial.text}
                </blockquote>
              </div>

              <div className="flex flex-col gap-5 border-t border-[rgba(26,26,26,0.08)] pt-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-[#8B8178]">
                      Secili yorum
                    </p>
                    <p className="mt-2 text-sm text-[#6E6761]">{slideLabel}</p>
                  </div>

                  {testimonials.length > 1 ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={prevSlide}
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(26,26,26,0.08)] bg-white/84 text-[#1A1A1A] transition-colors hover:bg-white"
                        aria-label="Onceki"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={nextSlide}
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(26,26,26,0.08)] bg-white/84 text-[#1A1A1A] transition-colors hover:bg-white"
                        aria-label="Sonraki"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="flex gap-3 overflow-x-auto pb-1">
                  {testimonials.map((review, index) => {
                    const isActive = index === currentIndex;

                    return (
                      <button
                        key={review.id}
                        type="button"
                        onClick={() => setCurrentIndex(index)}
                        className={cn(
                          "flex min-w-[220px] items-center gap-3 rounded-[1.4rem] border px-4 py-3 text-left transition-all",
                          isActive
                            ? "border-[rgba(183,162,150,0.38)] bg-[#F4EAE3] shadow-[0_16px_40px_-28px_rgba(0,0,0,0.24)]"
                            : "border-[rgba(26,26,26,0.08)] bg-white/68 hover:bg-white/86",
                        )}
                      >
                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#EFE5DD]">
                          {review.image ? (
                            <div className="relative h-full w-full">
                              <Image
                                src={review.image}
                                alt={review.name}
                                fill
                                className="object-cover"
                                sizes="44px"
                              />
                            </div>
                          ) : (
                            <span className="text-sm font-semibold tracking-[0.18em] text-[#8B8178]">
                              {getInitials(review.name)}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[#1F1A18]">
                            {review.name}
                          </p>
                          <p className="mt-1 truncate text-xs uppercase tracking-[0.16em] text-[#8B8178]">
                            {review.verified ? "Dogrulanmis yorum" : "Yorum"}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
