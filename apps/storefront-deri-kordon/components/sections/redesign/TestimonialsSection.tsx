"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Star, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const testimonials = [
  {
    id: 1,
    name: "CANER T.",
    verified: true,
    rating: 5,
    content: "Kesinlikle tavsiye ediyorum. Tütün kesesi aldım harika kalite.",
    image: "/images/placeholders/T.1.jpg",
  },
  {
    id: 2,
    name: "ASLI B.",
    verified: true,
    rating: 5,
    content: "Şahane işçilik ile mükemmel ürün çıkmış kullandıkça güzelleşiyor.",
    image: "/images/placeholders/T.2.jpg",
  },
  {
    id: 3,
    name: "MELİS G.",
    verified: true,
    rating: 5,
    content: "Sade ve şık ! Ürün dayanıklı kedim için aldım kullanışlı ve güzel.",
    image: "/images/placeholders/T.3.jpg",
  },
  {
    id: 4,
    name: "ERTAN Z.",
    verified: true,
    rating: 5,
    content: "Deri saat kayışım geldi sanki saatimi yeni almışım gibi hissediyorum.",
    image: "/images/placeholders/T.4.jpg",
  },
  {
    id: 5,
    name: "NİHAT C.",
    verified: true,
    rating: 5,
    content: "İşçilikten memnun kaldım. Kalite ve işçilik standartların üzerinde.",
    image: "/images/placeholders/T.5.jpg",
  },
  {
    id: 6,
    name: "SEDA Y.",
    verified: true,
    rating: 5,
    content: "Heceleyerek söylüyorum Ba-yıl-dım ! İşçilik deri kalitesi üst düzey.",
    image: "/images/placeholders/T.6.jpg",
  },
];

const AUTO_PLAY_INTERVAL = 5000; // 5 seconds

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

  // Auto-play
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      nextSlide();
    }, AUTO_PLAY_INTERVAL);

    return () => clearInterval(interval);
  }, [isPaused, nextSlide]);

  const visibleTestimonials = testimonials.slice(
    currentIndex * 2,
    currentIndex * 2 + 2
  );

  return (
    <section className="py-16 lg:py-20 bg-neutral-50">
      <div className="container-premium">
        {/* Section Header */}
        <div className="text-center mb-10">
          <h2 className="text-2xl lg:text-3xl font-medium text-neutral-900 mb-2">
            Müşteri Yorumları
          </h2>
          <p className="text-neutral-500 text-sm">
            1581 değerlendirmeden
          </p>
        </div>

        {/* Carousel Container */}
        <div 
          className="relative"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* Slides */}
          <div className="overflow-hidden">
            <div 
              className="flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${currentIndex * 100}%)` }}
            >
              {Array.from({ length: totalSlides }).map((_, slideIndex) => (
                <div 
                  key={slideIndex}
                  className="w-full flex-shrink-0 grid grid-cols-1 lg:grid-cols-2 gap-6"
                >
                  {testimonials
                    .slice(slideIndex * 2, slideIndex * 2 + 2)
                    .map((review) => (
                      <div
                        key={review.id}
                        className="bg-white overflow-hidden shadow-sm flex"
                      >
                        {/* Left: Image */}
                        <div className="relative w-32 sm:w-40 lg:w-48 flex-shrink-0 bg-neutral-100">
                          <Image
                            src={review.image}
                            alt={review.name}
                            fill
                            className="object-cover"
                            sizes="(max-width: 640px) 128px, (max-width: 1024px) 160px, 192px"
                          />
                        </div>

                        {/* Right: Content */}
                        <div className="flex-1 p-4 sm:p-5 flex flex-col justify-center">
                          {/* Stars */}
                          <div className="flex items-center gap-0.5 mb-3">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={cn(
                                  "w-3.5 h-3.5",
                                  i < review.rating
                                    ? "fill-[#8A6B37] text-[#8A6B37]"
                                    : "fill-neutral-200 text-neutral-200"
                                )}
                              />
                            ))}
                          </div>

                          {/* Name with Verified Badge */}
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-sm font-semibold text-neutral-900 uppercase">
                              {review.name}
                            </span>
                            {review.verified && (
                              <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
                                <Check className="w-3 h-3" />
                                Doğrulanmış Alıcı
                              </span>
                            )}
                          </div>

                          {/* Review Content */}
                          <p className="text-sm text-neutral-600 leading-relaxed">
                            {review.content}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>

          {/* Navigation Arrows */}
          <button
            onClick={prevSlide}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 lg:-translate-x-6 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:shadow-lg transition-all"
            aria-label="Önceki"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            onClick={nextSlide}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 lg:translate-x-6 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:shadow-lg transition-all"
            aria-label="Sonraki"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Dots Indicator */}
          <div className="flex items-center justify-center gap-2 mt-8">
            {[...Array(totalSlides)].map((_, i) => (
              <button
                key={i}
                onClick={() => goToSlide(i)}
                className={cn(
                  "transition-all duration-300 rounded-full",
                  i === currentIndex
                    ? "w-6 h-2 bg-neutral-900"
                    : "w-2 h-2 bg-neutral-300 hover:bg-neutral-400"
                )}
                aria-label={`Sayfa ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
