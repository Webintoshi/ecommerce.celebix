"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { cn } from "@/lib/utils";

const testimonials = [
  {
    id: 1,
    name: "CANER T.",
    verified: true,
    rating: 5,
    content: "Kesinlikle tavsiye ediyorum. Tutun kesesi aldim, harika kalite.",
    image: "/images/placeholders/T.1.jpg",
  },
  {
    id: 2,
    name: "ASLI B.",
    verified: true,
    rating: 5,
    content: "Sahane iscilik ile mukemmel bir urun cikmis. Kullandikca guzellesiyor.",
    image: "/images/placeholders/T.2.jpg",
  },
  {
    id: 3,
    name: "MELIS G.",
    verified: true,
    rating: 5,
    content: "Sade ve sik. Urun dayanikli, kullanisli ve gercekten guzel gorunuyor.",
    image: "/images/placeholders/T.3.jpg",
  },
  {
    id: 4,
    name: "ERTAN Z.",
    verified: true,
    rating: 5,
    content: "Deri saat kayisim geldi, sanki saatimi yeniden almis gibi oldum.",
    image: "/images/placeholders/T.4.jpg",
  },
  {
    id: 5,
    name: "NIHAT C.",
    verified: true,
    rating: 5,
    content: "Iscilikten memnun kaldim. Kalite ve iscilik standartlarin ustunde.",
    image: "/images/placeholders/T.5.jpg",
  },
  {
    id: 6,
    name: "SEDA Y.",
    verified: true,
    rating: 5,
    content: "Bayildim. Deri kalitesi ve isciligi ust duzey hissettiriyor.",
    image: "/images/placeholders/T.6.jpg",
  },
];

const AUTO_PLAY_INTERVAL = 5000;

function ImageWithFallback({
  src,
  alt,
  fallback,
}: {
  src: string;
  alt: string;
  fallback: string;
}) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#8A6B37]/10 text-lg font-semibold tracking-[0.24em] text-[#8A6B37]">
        {fallback}
      </div>
    );
  }

  return (
    <div className="relative h-16 w-16 overflow-hidden rounded-full">
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        unoptimized
        onError={() => setError(true)}
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

export function TestimonialsSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const totalSlides = Math.ceil(testimonials.length / 2);

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
    if (isPaused) {
      return;
    }

    const interval = setInterval(nextSlide, AUTO_PLAY_INTERVAL);
    return () => clearInterval(interval);
  }, [isPaused, nextSlide]);

  return (
    <section className="bg-neutral-50 py-16 lg:py-20">
      <div className="container-premium">
        <div className="mb-10 text-center">
          <h2 className="mb-2 text-2xl font-medium text-neutral-900 lg:text-3xl">
            Musteri Yorumlari
          </h2>
          <p className="text-sm text-neutral-500">1581 degerlendirmeden</p>
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
                  key={slideIndex}
                  className="grid w-full flex-shrink-0 grid-cols-1 gap-6 lg:grid-cols-2"
                >
                  {testimonials
                    .slice(slideIndex * 2, slideIndex * 2 + 2)
                    .map((review) => (
                      <div
                        key={review.id}
                        className="flex overflow-hidden bg-white shadow-sm"
                      >
                        <div className="flex w-32 flex-shrink-0 items-center justify-center bg-neutral-100 sm:w-40 lg:w-48">
                          <ImageWithFallback
                            src={review.image}
                            alt={review.name}
                            fallback={getInitials(review.name)}
                          />
                        </div>

                        <div className="flex flex-1 flex-col justify-center p-4 sm:p-5">
                          <div className="mb-3 flex items-center gap-0.5">
                            {[...Array(5)].map((_, index) => (
                              <Star
                                key={index}
                                className={cn(
                                  "h-3.5 w-3.5",
                                  index < review.rating
                                    ? "fill-[#8A6B37] text-[#8A6B37]"
                                    : "fill-neutral-200 text-neutral-200"
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
                                Dogrulanmis Alici
                              </span>
                            ) : null}
                          </div>

                          <p className="text-sm leading-relaxed text-neutral-600">
                            {review.content}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>

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

          <div className="mt-8 flex items-center justify-center gap-2">
            {[...Array(totalSlides)].map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => goToSlide(index)}
                className={cn(
                  "rounded-full transition-all duration-300",
                  index === currentIndex
                    ? "h-2 w-6 bg-neutral-900"
                    : "h-2 w-2 bg-neutral-300 hover:bg-neutral-400"
                )}
                aria-label={`Sayfa ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
