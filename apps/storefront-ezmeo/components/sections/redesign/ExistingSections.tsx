"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import {
  isProxiedStorefrontAssetUrl,
  resolveStorefrontAssetUrl,
} from "@/lib/asset-url";
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
    title: "Balli ve sade yorumlar",
    subtitle: "Kavanozun icindekini gostererek satan temiz premium receteler.",
  },
  {
    id: "fallback-2",
    desktop: "/Findik_Ezmeleri_Kategorisi.webp",
    mobile: "/Findik_Ezmeleri_Kategorisi.webp",
    alt: "Ezmeo findik ezmeleri",
    title: "Kahvalti ve kasik ritmi",
    subtitle: "Findik, fistik ve badem etrafinda kurulan daha net bir pantry vitrini.",
  },
  {
    id: "fallback-3",
    desktop: "/fistik_ezmesi_kategori_gorsel.webp",
    mobile: "/fistik_ezmesi_kategori_gorsel.webp",
    alt: "Ezmeo kavanoz seckisi",
    title: "Secili Ezmeo kavanozlari",
    subtitle: "Daha az gorsel gurultu, daha guclu urun kadraji, daha hizli secim.",
  },
];

const TRUST_ITEMS = [
  "Katkisiz yorumlar",
  "Cam kavanoz odagi",
  "Mobil-first alisveris",
];

export function HeroSection({ slides = [] }: { slides?: HeroSlide[] }) {
  const { locale } = useStorefrontRoute();
  const [current, setCurrent] = useState(0);

  const normalizedSlides = useMemo(() => {
    const sourceSlides =
      Array.isArray(slides) && slides.length > 0 ? slides : FALLBACK_SLIDES;

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

  const activeSlide = normalizedSlides[current] || FALLBACK_SLIDES[0];
  const desktopImage = activeSlide.desktop || FALLBACK_SLIDES[0].desktop;
  const mobileImage = activeSlide.mobile || desktopImage;
  const usesProxiedDesktop = isProxiedStorefrontAssetUrl(desktopImage);
  const usesProxiedMobile = isProxiedStorefrontAssetUrl(mobileImage);

  return (
    <section className="pt-4 md:pt-6">
      <div className="container-premium">
        <div className="grid gap-4 lg:grid-cols-[1.02fr_0.98fr] lg:gap-6">
          <div className="order-2 surface-card px-5 py-6 md:px-7 md:py-8 lg:order-1 lg:px-8">
            <span className="editorial-kicker">Ezmeo pantry</span>
            <h1 className="mt-5 max-w-3xl text-[var(--foreground)]">
              Kasikla guven veren premium ezmeler.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-8 text-[var(--muted-foreground)] md:text-base">
              Findik, fistik ve badem receteleri; daha temiz bir arka plan, daha guclu urun goruntusu
              ve daha hizli bir satin alma akisi ile sunulur.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {TRUST_ITEMS.map((item) => (
                <span key={item} className="chip">
                  {item}
                </span>
              ))}
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--muted)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  Lezzet vaadi
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--foreground)]">
                  Temiz tarifler, daha net icerik dili ve jar-first kadrajlar.
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-[rgba(32,22,17,0.1)] bg-[var(--card)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  Alisveris akisi
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--foreground)]">
                  Mobilde once urun, sonra varyant ve fiyat; daha az kopuk blok, daha hizli karar.
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={buildLocalizedPath(ROUTES.products, locale)} className="btn-primary">
                Koleksiyonu kesfet
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href={buildLocalizedPath("/hakkimizda", locale)} className="btn-secondary">
                Markayi tani
              </Link>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="relative min-h-[21rem] overflow-hidden rounded-[1.9rem] border border-[var(--border)] bg-[var(--background-strong)] shadow-[var(--shadow-lg)] md:min-h-[28rem] lg:min-h-[37rem]">
              <div className="absolute inset-0 hidden md:block">
                <Image
                  src={desktopImage}
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
                  src={mobileImage}
                  alt={activeSlide.alt}
                  fill
                  priority
                  className="object-cover"
                  sizes="100vw"
                  unoptimized={usesProxiedMobile}
                />
              </div>

              <div className="absolute inset-0 bg-gradient-to-t from-[rgba(32,22,17,0.72)] via-[rgba(32,22,17,0.16)] to-transparent" />

              <div className="absolute left-4 top-4">
                <span className="chip-dark">One cikan secim</span>
              </div>

              <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5">
                <div className="rounded-[1.6rem] border border-white/16 bg-[rgba(255,252,247,0.92)] p-5 shadow-[0_24px_52px_-36px_rgba(32,22,17,0.55)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    {activeSlide.title || "Ezmeo vitrini"}
                  </p>
                  <p className="mt-3 max-w-lg text-lg font-semibold leading-snug text-[var(--foreground)] md:text-[1.45rem]">
                    {activeSlide.subtitle || "Daha az kampanya sesi, daha guclu urun kadraji."}
                  </p>
                </div>
              </div>
            </div>

            {normalizedSlides.length > 1 ? (
              <div className="mt-3 flex items-center justify-between rounded-[1.35rem] border border-[var(--border)] bg-[rgba(255,253,249,0.9)] px-4 py-3">
                <div className="flex items-center gap-2">
                  {normalizedSlides.map((slide, index) => (
                    <button
                      key={slide.id}
                      onClick={() => setCurrent(index)}
                      className={`h-2.5 rounded-full transition-all ${
                        index === current
                          ? "w-9 bg-[var(--primary)]"
                          : "w-2.5 bg-[var(--foreground)]/16"
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
                      setCurrent(
                        (prev) => (prev - 1 + normalizedSlides.length) % normalizedSlides.length,
                      )
                    }
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--foreground)]"
                    aria-label="Onceki gorsel"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrent((prev) => (prev + 1) % normalizedSlides.length)}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--foreground)]"
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
    </section>
  );
}

export function MarqueeSection() {
  return null;
}

export function Newsletter() {
  return null;
}
