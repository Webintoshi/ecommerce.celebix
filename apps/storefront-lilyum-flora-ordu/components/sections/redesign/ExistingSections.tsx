"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SITE_NAME } from "@/lib/constants";

interface HeroSlide {
  id: number | string;
  desktop: string;
  mobile: string;
  alt: string;
  link?: string;
  title?: string;
  subtitle?: string;
  buttonText?: string;
  buttonLink?: string;
}

export function HeroSection({ slides = [] }: { slides?: HeroSlide[] }) {
  const [current, setCurrent] = useState(0);
  const hasSlides = Array.isArray(slides) && slides.length > 0;

  useEffect(() => {
    if (!hasSlides || slides.length <= 1) {
      return;
    }

    const interval = window.setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 6000);

    return () => window.clearInterval(interval);
  }, [hasSlides, slides]);

  if (!hasSlides) {
    return (
      <section className="section-shell pt-6 sm:pt-8">
        <div className="container-premium">
          <div className="overflow-hidden rounded-[36px] border border-[var(--store-border)] bg-[linear-gradient(135deg,#ffffff_0%,#f6f6f6_48%,#e8edf2_100%)] p-2 shadow-[var(--store-shadow-soft)] sm:p-3">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[30px] bg-[linear-gradient(140deg,#fffdf8_0%,#f7efe7_36%,#e8edf2_100%)] sm:aspect-[16/9] lg:aspect-[16/8.7]">
              <div className="absolute left-[7%] top-[12%] h-24 w-24 rounded-full bg-[#DA630D]/14 sm:h-36 sm:w-36" />
              <div className="absolute right-[8%] top-[16%] h-28 w-28 rounded-full bg-[#505E71]/14 sm:h-44 sm:w-44" />
              <div className="absolute bottom-[-10%] left-[20%] h-40 w-40 rounded-full bg-white/60 sm:h-56 sm:w-56" />
              <div className="absolute inset-x-[12%] bottom-[14%] h-[34%] rounded-[32px] border border-white/50 bg-white/35" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  const slide = slides[current];
  const currentSlideLabel = slide.alt || slide.title || SITE_NAME;

  return (
    <section className="section-shell pt-6 sm:pt-8">
      <div className="container-premium">
        <div className="overflow-hidden rounded-[36px] border border-[var(--store-border)] bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_38%,#edf1f4_100%)] p-2 shadow-[var(--store-shadow-soft)] sm:p-3">
          <div className="relative overflow-hidden rounded-[30px]">
            <div className="relative aspect-[4/5] sm:aspect-[16/9] lg:aspect-[16/8.7]">
              <div className="absolute inset-0 hidden md:block">
                <Image
                  src={slide.desktop}
                  alt={currentSlideLabel}
                  fill
                  priority
                  className="object-cover"
                  sizes="100vw"
                />
              </div>
              <div className="absolute inset-0 md:hidden">
                <Image
                  src={slide.mobile || slide.desktop}
                  alt={currentSlideLabel}
                  fill
                  priority
                  className="object-cover"
                  sizes="100vw"
                />
              </div>
            </div>
          </div>

          {slides.length > 1 ? (
            <div className="flex items-center justify-center gap-3 px-4 pb-2 pt-4 sm:justify-between sm:px-6">
              <div className="hidden sm:flex sm:items-center sm:gap-2">
                <button
                  type="button"
                  onClick={() => setCurrent((current - 1 + slides.length) % slides.length)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--store-border)] bg-white text-[var(--store-ink-soft)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)]"
                  aria-label="Önceki slide"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrent((current + 1) % slides.length)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--store-border)] bg-white text-[var(--store-ink-soft)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)]"
                  aria-label="Sonraki slide"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                {slides.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCurrent(index)}
                    className={cn(
                      "h-2.5 rounded-full transition-all",
                      index === current ? "w-8 bg-[var(--store-accent)]" : "w-2.5 bg-[var(--store-border-strong)]",
                    )}
                    aria-label={`Slide ${index + 1}`}
                  />
                ))}
              </div>

              <div className="sm:hidden" />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function MarqueeSection() {
  return null;
}

export function Newsletter() {
  return null;
}
