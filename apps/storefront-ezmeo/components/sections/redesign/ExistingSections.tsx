"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";

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

const FALLBACK_SLIDES: HeroSlide[] = [
  {
    id: "fallback-1",
    desktop: "/hero-banner-fistik-ezmeleri.jpg",
    mobile: "/hero-banner-fistik-ezmeleri-mobile.jpg",
    alt: "Ezmeo premium fistik ezmeleri",
    title: "Dogal ama rafine",
    subtitle: "Fistik, findik ve badem etrafinda kurulan secili bir premium ezme vitrini.",
  },
  {
    id: "fallback-2",
    desktop: "/Findik_Ezmeleri_Kategorisi.webp",
    mobile: "/Findik_Ezmeleri_Kategorisi.webp",
    alt: "Ezmeo findik ezmeleri",
    title: "Gunluk ritme uyumlu",
    subtitle: "Kahvalti, tatli ve kasik anlarina yakisan editorial bir secki.",
  },
  {
    id: "fallback-3",
    desktop: "/fistik_ezmesi_kategori_gorsel.webp",
    mobile: "/fistik_ezmesi_kategori_gorsel.webp",
    alt: "Ezmeo kavanoz seckisi",
    title: "Kavanoz bazli premium sunum",
    subtitle: "Urunu merkeze alan daha sakin, daha iyi kadrajli bir alisveris akisi.",
  },
];

const HERO_CHIPS = [
  "Fistik, findik, badem",
  "Sekersiz, balli, hurmali",
  "Net urun odagi",
];

export function HeroSection({ slides = [] }: { slides?: HeroSlide[] }) {
  const { locale } = useStorefrontRoute();
  const [current, setCurrent] = useState(0);

  const normalizedSlides = useMemo(() => {
    const sourceSlides = Array.isArray(slides) && slides.length > 0 ? slides : FALLBACK_SLIDES;
    return sourceSlides.map((slide) => {
      const desktop = resolveStorefrontAssetUrl(slide.desktop);
      const mobile = resolveStorefrontAssetUrl(slide.mobile || slide.desktop);

      return {
        ...slide,
        desktop,
        mobile,
      };
    });
  }, [slides]);

  useEffect(() => {
    if (normalizedSlides.length <= 1) {
      return;
    }

    const interval = window.setInterval(() => {
      setCurrent((prev) => (prev + 1) % normalizedSlides.length);
    }, 6500);

    return () => window.clearInterval(interval);
  }, [normalizedSlides.length]);

  useEffect(() => {
    if (current >= normalizedSlides.length) {
      setCurrent(0);
    }
  }, [current, normalizedSlides.length]);

  const activeSlide = normalizedSlides[current];
  const activeImage = activeSlide?.desktop || FALLBACK_SLIDES[0].desktop;
  const activeMobileImage = activeSlide?.mobile || activeImage;
  const usesProxiedDesktop = isProxiedStorefrontAssetUrl(activeImage);
  const usesProxiedMobile = isProxiedStorefrontAssetUrl(activeMobileImage);

  return (
    <section className="pt-4 md:pt-6">
      <div className="container-premium">
        <div className="surface-card overflow-hidden px-5 py-5 md:px-7 md:py-7 lg:px-8 lg:py-8">
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:gap-8">
            <div className="flex flex-col justify-between gap-8 rounded-[2rem] bg-[rgba(255,250,244,0.7)] p-6 md:p-8">
              <div>
                <span className="editorial-kicker">
                  Ezmeo seckisi
                </span>
                <h1 className="mt-5 max-w-xl text-[var(--foreground)]">
                  Kasikla guven veren premium ezmeler.
                </h1>
                <p className="mt-5 max-w-xl text-base leading-8 text-[var(--muted-foreground)] md:text-lg">
                  Ezmeo; findik, fistik, badem ve benzeri ezmeleri daha sakin bir lüks duygusuyla
                  sunar. Daha az gürültü, daha iyi urun kadraji, daha rafine bir vitrin.
                </p>
              </div>

              <div className="flex flex-wrap gap-2.5">
                {HERO_CHIPS.map((chip) => (
                  <span key={chip} className="chip">
                    {chip}
                  </span>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.5rem] border border-[var(--border)] bg-[rgba(255,250,244,0.92)] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                    Lezzet dili
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[var(--foreground)]">
                    Kahvaltiya, tatliya ve gunluk ritme yakisan temiz ama premium bir sunum.
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-[var(--border)] bg-[rgba(38,23,16,0.92)] p-4 text-white">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
                    Vitrin prensibi
                  </p>
                  <p className="mt-2 text-sm leading-7 text-white/78">
                    Ucuz kampanya hissi yerine urunun kivamini, rengini ve etiket karakterini one cikarir.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href={buildLocalizedPath(ROUTES.products, locale)} className="btn-primary">
                  Koleksiyonu kesfet
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href={buildLocalizedPath("/hakkimizda", locale)} className="btn-secondary">
                  Markayi tani
                </Link>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="relative overflow-hidden rounded-[2rem] bg-[var(--background-strong)] min-h-[26rem] md:min-h-[32rem]">
                <div className="absolute inset-0 hidden md:block">
                  <Image
                    src={activeImage}
                    alt={activeSlide.alt}
                    fill
                    priority
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 54vw"
                    unoptimized={usesProxiedDesktop}
                  />
                </div>
                <div className="absolute inset-0 md:hidden">
                  <Image
                    src={activeMobileImage}
                    alt={activeSlide.alt}
                    fill
                    priority
                    className="object-cover"
                    sizes="100vw"
                    unoptimized={usesProxiedMobile}
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[rgba(28,16,10,0.7)] via-[rgba(28,16,10,0.12)] to-transparent" />

                <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                  <span className="chip-dark">
                    {activeSlide.title || "Editorial secki"}
                  </span>
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5">
                  <div className="surface-card max-w-md rounded-[1.75rem] bg-[rgba(255,250,244,0.78)] p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                      Bu hafta one cikan
                    </p>
                    <h2 className="mt-3 text-2xl leading-tight text-[var(--foreground)] md:text-3xl">
                      {activeSlide.subtitle || "Temiz icerik, dengeli tat, iyi sunum."}
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)]">
                      {activeSlide.alt}
                    </p>
                  </div>
                </div>
              </div>

              {normalizedSlides.length > 1 ? (
                <div className="flex items-center justify-between gap-4 rounded-[1.5rem] border border-[var(--border)] bg-[rgba(255,250,244,0.68)] px-4 py-3">
                  <div className="flex items-center gap-2">
                    {normalizedSlides.map((slide, index) => (
                      <button
                        key={slide.id}
                        onClick={() => setCurrent(index)}
                        className={`h-2.5 rounded-full transition-all ${
                          index === current ? "w-10 bg-[var(--cocoa)]" : "w-2.5 bg-[var(--foreground)]/18"
                        }`}
                        aria-label={`Slide ${index + 1}`}
                        type="button"
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCurrent((prev) => (prev - 1 + normalizedSlides.length) % normalizedSlides.length)
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white/80 text-[var(--foreground)]"
                      aria-label="Onceki gorsel"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrent((prev) => (prev + 1) % normalizedSlides.length)}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white/80 text-[var(--foreground)]"
                      aria-label="Sonraki gorsel"
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
    </section>
  );
}

export function MarqueeSection() {
  return null;
}

export function Newsletter() {
  return null;
}
