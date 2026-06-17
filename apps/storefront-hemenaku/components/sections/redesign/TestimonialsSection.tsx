"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Check, ChevronLeft, ChevronRight, Headphones, RotateCcw, ShieldCheck, Star, Truck } from "lucide-react";
import type { HomepageTestimonial } from "@/lib/homepage";
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
    return [];
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
    const trustCards = [
      {
        title: "Guvenli odeme",
        text: "Odeme adimlari net, izlenebilir ve musteri bilgilerini koruyacak sekilde tasarlandi.",
        icon: ShieldCheck,
      },
      {
        title: "Teslimat takibi",
        text: "Siparis sureci sepetten teslimata kadar acik bilgilerle desteklenir.",
        icon: Truck,
      },
      {
        title: "Kolay iade",
        text: "Iade ve degisim surecleri musteri destek kanallariyla kolaylastirilir.",
        icon: RotateCcw,
      },
      {
        title: "Ulasilabilir destek",
        text: "Urun, sepet ve teslimat sorulari icin Hemenaku iletisim kanallari gorunur kalir.",
        icon: Headphones,
      },
    ];

    return (
      <section className="bg-[#F7FAF9] py-16 lg:py-20">
        <div className="container-premium">
          <div className="mb-10 text-center">
            <h2 className="mb-2 text-2xl font-semibold text-[#111827] lg:text-3xl">{heading}</h2>
            <p className="mx-auto max-w-2xl text-sm leading-7 text-[#526B66]">{countLabel}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {trustCards.map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.title} className="rounded-lg border border-[#DDE7E4] bg-white p-5 shadow-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F0FDFA] text-[#0F766E]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-[#111827]">{card.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#526B66]">{card.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-[#F7FAF9] py-16 lg:py-20">
      <div className="container-premium">
        <div className="mb-10 text-center">
          <h2 className="mb-2 text-2xl font-semibold text-[#111827] lg:text-3xl">{heading}</h2>
          <p className="text-sm text-[#526B66]">{countLabel}</p>
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
                    <div key={review.id} className="flex overflow-hidden bg-white shadow-sm">
                      <div className="flex w-32 flex-shrink-0 items-center justify-center bg-neutral-100 sm:w-40 lg:w-48">
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
                          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#8A6B37]/10 text-lg font-semibold tracking-[0.24em] text-[#8A6B37]">
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
                                  ? "fill-[#8A6B37] text-[#8A6B37]"
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
                              Dogrulanmis
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
                className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-600 shadow-md transition-all hover:text-neutral-900 hover:shadow-lg sm:left-0 sm:-translate-x-4 lg:-translate-x-6"
                aria-label="Onceki"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={nextSlide}
                className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-600 shadow-md transition-all hover:text-neutral-900 hover:shadow-lg sm:right-0 sm:translate-x-4 lg:translate-x-6"
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
