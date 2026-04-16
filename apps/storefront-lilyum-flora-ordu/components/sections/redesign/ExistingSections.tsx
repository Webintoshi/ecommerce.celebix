"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronLeft, ChevronRight, Clock3, Flower2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES, SITE_NAME } from "@/lib/constants";

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

const FALLBACK_TRUST_ITEMS = [
  { icon: Clock3, label: "Ayni gun secimler" },
  { icon: Flower2, label: "Taze ve guncel vitrin" },
  { icon: ShieldCheck, label: "Guvenli siparis akisi" },
];

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
          <div className="relative overflow-hidden rounded-[32px] border border-[var(--store-border)] bg-[linear-gradient(135deg,#f7efe6_0%,#f3e6df_48%,#ead9d0_100%)] px-6 py-12 shadow-[var(--store-shadow-soft)] sm:px-8 lg:px-12 lg:py-16">
            <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(123,17,19,0.12),transparent_58%)]" />
            <div className="relative max-w-2xl">
              <p className="section-eyebrow">Lilyum Flora Ordu</p>
              <h1 className="section-title mt-4 text-[var(--store-ink)] sm:text-5xl">
                Sakin, premium ve urun odakli bir cicek vitrini
              </h1>
              <p className="section-copy mt-4 max-w-xl">
                Hero bannerlar admin panelde tanimlandiginda bu alan otomatik olarak canli kampanya ve kategori vitrininize donusur.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link href={ROUTES.products} className="cta-primary">
                  Vitrini Incele
                </Link>
                <Link href={ROUTES.contact} className="cta-secondary">
                  Iletisim Bilgileri
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const slide = slides[current];
  const heroTitle = slide.title || slide.alt || SITE_NAME;
  const heroSubtitle =
    slide.subtitle ||
    "Guncel koleksiyonlar, gonderime hazir secimler ve premium floral sunum tek bakista.";

  return (
    <section className="section-shell pt-6 sm:pt-8">
      <div className="container-premium">
        <div className="relative overflow-hidden rounded-[32px] border border-[var(--store-border)] bg-[var(--store-panel)] shadow-[var(--store-shadow-soft)]">
          <div className="relative min-h-[560px] lg:min-h-[620px]">
            <div className="absolute inset-0 hidden md:block">
              <Image
                src={slide.desktop}
                alt={slide.alt}
                fill
                priority
                className="object-cover"
                sizes="100vw"
              />
            </div>
            <div className="absolute inset-0 md:hidden">
              <Image
                src={slide.mobile || slide.desktop}
                alt={slide.alt}
                fill
                priority
                className="object-cover"
                sizes="100vw"
              />
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(35,19,16,0.72)_0%,rgba(35,19,16,0.44)_42%,rgba(35,19,16,0.10)_100%)] md:bg-[linear-gradient(90deg,rgba(35,19,16,0.68)_0%,rgba(35,19,16,0.38)_48%,rgba(35,19,16,0.06)_100%)]" />

            <div className="relative z-10 flex min-h-[560px] flex-col justify-between p-6 sm:p-8 lg:min-h-[620px] lg:p-12">
              <div className="max-w-2xl pt-6 sm:pt-10">
                <p className="inline-flex rounded-full border border-white/18 bg-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-white/88 backdrop-blur">
                  {slide.title || "Premium Floral Secim"}
                </p>
                <h1 className="mt-5 font-[var(--font-display)] text-4xl font-semibold leading-[0.92] tracking-[-0.05em] text-white sm:text-5xl lg:text-7xl">
                  {heroTitle}
                </h1>
                <p className="mt-4 max-w-xl text-sm leading-7 text-white/82 sm:text-base">
                  {heroSubtitle}
                </p>

                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href={slide.buttonLink || slide.link || ROUTES.products}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-[var(--store-accent)] transition hover:bg-[var(--store-surface-alt)]"
                  >
                    {slide.buttonText || "Koleksiyonu Incele"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href={ROUTES.contact}
                    className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/14"
                  >
                    Teslimat ve Iletisim
                  </Link>
                </div>
              </div>

              <div className="grid gap-3 pt-10 md:grid-cols-[1fr_auto] md:items-end">
                <div className="grid gap-3 sm:grid-cols-3">
                  {FALLBACK_TRUST_ITEMS.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[24px] border border-white/12 bg-white/10 px-4 py-4 text-white backdrop-blur-md"
                    >
                      <item.icon className="h-4 w-4 text-[var(--store-blush)]" />
                      <p className="mt-3 text-sm font-semibold">{item.label}</p>
                    </div>
                  ))}
                </div>

                {slides.length > 1 ? (
                  <div className="flex items-center justify-between gap-4 rounded-full border border-white/12 bg-white/10 px-3 py-2 text-white backdrop-blur-md md:justify-end">
                    <div className="flex items-center gap-2">
                      {slides.map((item, index) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setCurrent(index)}
                          className={cn(
                            "h-2.5 rounded-full transition-all",
                            index === current ? "w-8 bg-white" : "w-2.5 bg-white/45",
                          )}
                          aria-label={`Slide ${index + 1}`}
                        />
                      ))}
                    </div>
                    <div className="hidden items-center gap-2 sm:flex">
                      <button
                        type="button"
                        onClick={() => setCurrent((current - 1 + slides.length) % slides.length)}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/14 bg-white/10 transition hover:bg-white/16"
                        aria-label="Onceki slide"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrent((current + 1) % slides.length)}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/14 bg-white/10 transition hover:bg-white/16"
                        aria-label="Sonraki slide"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
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
