"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
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

function HeroMedia({
  desktop,
  mobile,
  alt,
  href,
}: {
  desktop: string;
  mobile?: string;
  alt: string;
  href?: string;
}) {
  const media = (
    <div className="relative aspect-[4/4.8] sm:aspect-[16/8.4] lg:aspect-[16/5.3] xl:aspect-[16/5]">
      <div className="absolute inset-0 hidden md:block">
        <Image
          src={desktop}
          alt={alt}
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
      </div>
      <div className="absolute inset-0 md:hidden">
        <Image
          src={mobile || desktop}
          alt={alt}
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
      </div>
    </div>
  );

  if (!href) {
    return media;
  }

  return (
    <Link href={href} className="block">
      {media}
    </Link>
  );
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
      <section className="pt-4 sm:pt-5">
        <div className="relative w-full overflow-hidden bg-[linear-gradient(90deg,#f6f6f6_0%,#ffffff_22%,#eef2f5_100%)]">
          <div className="relative aspect-[4/4.8] sm:aspect-[16/8.4] lg:aspect-[16/5.3] xl:aspect-[16/5]">
            <div className="absolute inset-y-0 left-0 w-[44%] bg-[#505E71]" />
            <div className="absolute inset-y-0 right-0 w-[56%] bg-[#F6F6F6]" />
            <div className="absolute inset-y-[14%] left-[5%] w-[22%] rounded-[30px] bg-white/95" />
            <div className="absolute bottom-[14%] left-[30%] h-[48%] w-[16%] rounded-[30px] bg-[#DA630D]" />
            <div className="absolute right-[8%] top-[14%] h-[50%] w-[24%] rounded-[32px] bg-[#505E71]/14" />
            <div className="absolute bottom-[12%] right-[20%] h-[36%] w-[14%] rounded-[30px] bg-[#DA630D]/18" />
            <div className="absolute right-[12%] top-[18%] h-20 w-20 rounded-full bg-white sm:h-28 sm:w-28" />
            <div className="absolute bottom-[14%] left-[16%] h-16 w-16 rounded-full bg-[#F6F6F6] sm:h-24 sm:w-24" />
          </div>
        </div>

        <div className="section-shell pt-4">
          <div className="container-premium">
            <div className="flex items-center justify-between gap-3 rounded-[26px] border border-[var(--store-border)] bg-white px-4 py-3 shadow-[var(--store-shadow-soft)]">
              <div className="flex gap-2">
                <span className="h-2.5 w-8 rounded-full bg-[#DA630D]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--store-border-strong)]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--store-border-strong)]" />
              </div>
              <div className="h-10 w-28 rounded-full bg-[linear-gradient(90deg,#505E71_0%,#DA630D_100%)]" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  const slide = slides[current];
  const currentSlideLabel = slide.alt || slide.title || SITE_NAME;
  const currentSlideHref = slide.buttonLink || slide.link;

  return (
    <section className="pt-4 sm:pt-5">
      <div className="relative w-full overflow-hidden bg-[var(--store-surface-alt)]">
        <HeroMedia
          desktop={slide.desktop}
          mobile={slide.mobile}
          alt={currentSlideLabel}
          href={currentSlideHref}
        />

        <div className="pointer-events-none absolute inset-[22px] hidden rounded-[32px] border border-white/35 lg:block xl:inset-[28px] xl:rounded-[38px]" />

        {slides.length > 1 ? (
          <div className="absolute bottom-6 right-6 hidden items-center gap-3 rounded-full border border-white/70 bg-[rgba(246,246,246,0.92)] px-3 py-3 shadow-[0_18px_40px_rgba(80,94,113,0.16)] lg:flex">
            <div className="flex items-center gap-2 px-2">
              {slides.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCurrent(index)}
                  className={cn(
                    "h-2 rounded-full transition-all",
                    index === current ? "w-8 bg-[var(--store-accent)]" : "w-2 bg-[var(--store-border-strong)]",
                  )}
                  aria-label={`Slide ${index + 1}`}
                />
              ))}
            </div>

            <div className="h-9 w-px bg-[var(--store-border)]" />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrent((current - 1 + slides.length) % slides.length)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--store-border)] bg-white text-[var(--store-ink-soft)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)]"
                aria-label="Onceki banner"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrent((current + 1) % slides.length)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--store-border)] bg-white text-[var(--store-ink-soft)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)]"
                aria-label="Sonraki banner"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {slides.length > 1 ? (
        <div className="section-shell pt-4">
          <div className="container-premium">
            <div className="flex items-center justify-between gap-4 rounded-[24px] border border-[var(--store-border)] bg-white px-4 py-3 shadow-[var(--store-shadow-soft)] sm:hidden">
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

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrent((current - 1 + slides.length) % slides.length)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--store-border)] bg-[var(--store-surface-alt)] text-[var(--store-ink-soft)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)]"
                  aria-label="Onceki banner"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrent((current + 1) % slides.length)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--store-border)] bg-[var(--store-surface-alt)] text-[var(--store-ink-soft)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)]"
                  aria-label="Sonraki banner"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="hidden flex-col gap-4 rounded-[28px] border border-[var(--store-border)] bg-white px-4 py-4 shadow-[var(--store-shadow-soft)] sm:flex lg:px-5">
              <div className="-mx-1 flex flex-1 gap-3 overflow-x-auto px-1 scrollbar-hide">
                {slides.map((item, index) => {
                  const previewLabel = item.alt || item.title || `${SITE_NAME} ${index + 1}`;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setCurrent(index)}
                      className={cn(
                        "min-w-[148px] flex-[0_0_148px] overflow-hidden rounded-[24px] border bg-[var(--store-surface-alt)] transition sm:min-w-[180px] sm:flex-[0_0_180px] lg:min-w-[168px] lg:flex-[0_0_168px]",
                        index === current
                          ? "border-[var(--store-accent)] shadow-[var(--store-shadow-soft)]"
                          : "border-[var(--store-border)] hover:border-[var(--store-accent)]",
                      )}
                      aria-label={`Slide ${index + 1}`}
                    >
                      <div className="relative aspect-[16/10]">
                        <Image
                          src={item.mobile || item.desktop}
                          alt={previewLabel}
                          fill
                          className="object-cover"
                          sizes="180px"
                        />
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-4 lg:hidden">
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

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrent((current - 1 + slides.length) % slides.length)}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--store-border)] bg-[var(--store-surface-alt)] text-[var(--store-ink-soft)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)]"
                    aria-label="Onceki banner"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrent((current + 1) % slides.length)}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--store-border)] bg-[var(--store-surface-alt)] text-[var(--store-ink-soft)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)]"
                    aria-label="Sonraki banner"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function MarqueeSection() {
  return null;
}

export function Newsletter() {
  return null;
}
