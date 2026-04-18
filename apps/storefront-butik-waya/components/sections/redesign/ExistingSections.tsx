"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Leaf,
  Mail,
  Send,
  Shield,
  Sparkles,
  Truck,
  Award,
  Heart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES, SITE_NAME } from "@/lib/constants";

interface MarqueeSettings {
  items: { id: string; text: string; icon: string; badge?: string }[];
  speed?: string;
  direction?: string;
  enabled?: boolean;
}

const ICON_MAP: Record<string, React.ElementType> = {
  leaf: Leaf,
  truck: Truck,
  shield: Shield,
  heart: Heart,
  award: Award,
  sparkle: Sparkles,
};

interface HeroSlide {
  id: number;
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
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (slides.length > 0) {
      setIsLoaded(true);
    }
  }, [slides]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 5600);
    return () => clearInterval(interval);
  }, [slides]);

  if (!isLoaded || slides.length === 0) {
    return (
      <section className="container-premium pt-6">
        <div className="relative overflow-hidden rounded-[2.4rem] border border-[rgba(29,23,21,0.08)] bg-[#16110f] text-white shadow-[0_40px_120px_-70px_rgba(19,13,11,0.95)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(214,174,137,0.25),transparent_28%),radial-gradient(circle_at_80%_18%,rgba(255,255,255,0.08),transparent_20%)]" />
          <div className="relative grid gap-8 px-6 py-10 sm:px-8 sm:py-12 lg:grid-cols-[1.05fr_0.95fr] lg:px-12 lg:py-14">
            <div className="flex min-h-[420px] flex-col justify-end">
              <span className="inline-flex w-fit rounded-full border border-white/14 bg-white/8 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/72">
                Butik Waya Atelier
              </span>
              <h1 className="mt-6 max-w-4xl font-serif text-5xl leading-[0.84] tracking-[-0.07em] text-[#fff8f2] sm:text-6xl lg:text-[6rem]">
                Modern tailoring, soft power, city evening.
              </h1>
              <p className="mt-6 max-w-2xl text-sm leading-8 text-white/68 sm:text-base">
                Balmain ve Zara benzeri premium moda storefront taktiklerinden gelen kontrollu
                kontrasti kullaniyoruz: koyu zemin, kirik beyaz tipografi ve camel vurgular.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={ROUTES.products}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#fff8f2] px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.18em] text-[#16110f] transition hover:bg-[#d6ae89]"
                >
                  Koleksiyonu ac
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href={ROUTES.contact}
                  className="inline-flex items-center justify-center rounded-full border border-white/16 bg-white/8 px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-white/34 hover:bg-white/12"
                >
                  Stil yardimi al
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {[
                {
                  label: "Palette",
                  text: "Black ink, ivory silk, camel highlight.",
                },
                {
                  label: "Structure",
                  text: "Oversized serif headline and restrained navigation rhythm.",
                },
                {
                  label: "Merch",
                  text: "Look-first hierarchy, then category and product sequencing.",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[1.8rem] border border-white/10 bg-white/7 p-5 backdrop-blur"
                >
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[#d6ae89]">{item.label}</p>
                  <p className="mt-4 text-sm leading-7 text-white/70">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const slide = slides[current];

  return (
    <section className="container-premium pt-6">
      <div className="relative overflow-hidden rounded-[2.4rem] border border-[rgba(29,23,21,0.08)] shadow-[0_40px_120px_-70px_rgba(19,13,11,0.95)]">
        <div className="relative aspect-[4/5] max-h-[920px] w-full sm:aspect-[4/5] md:aspect-[16/9] lg:aspect-[21/9]">
          <div className="absolute inset-0">
            <div className="absolute inset-0 hidden md:block">
              <Image
                src={slide.desktop}
                alt={slide.alt}
                fill
                className="object-cover"
                priority
                sizes="100vw"
              />
            </div>
            <div className="absolute inset-0 block md:hidden">
              <Image
                src={slide.mobile || slide.desktop}
                alt={slide.alt}
                fill
                className="object-cover"
                priority
                sizes="100vw"
              />
            </div>

            <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(12,9,8,0.84)_0%,rgba(12,9,8,0.5)_40%,rgba(12,9,8,0.12)_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(214,174,137,0.24),transparent_30%)]" />
          </div>

          <div className="absolute inset-0 z-10 flex items-end md:items-center">
            <div className="w-full px-5 pb-5 sm:px-8 sm:pb-8 lg:px-12">
              <div className="grid gap-5 lg:grid-cols-[0.95fr_0.42fr] lg:items-end">
                <div className="rounded-[2rem] border border-white/12 bg-black/18 p-6 backdrop-blur-sm sm:p-8">
                  <span className="inline-flex rounded-full border border-white/14 bg-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/76">
                    {slide.title || "Waya Signature"}
                  </span>
                  <h2 className="mt-5 max-w-4xl font-serif text-4xl leading-[0.86] tracking-[-0.06em] text-[#fff8f2] sm:text-5xl lg:text-7xl">
                    {slide.alt}
                  </h2>
                  <p className="mt-4 max-w-2xl text-sm leading-8 text-white/72 sm:text-base">
                    {slide.subtitle ||
                      "Keskin ama bagirmayan bir moda vitrini: dar renk paleti, yuksek kontrast ve buyuk editoryal tipografi."}
                  </p>

                  <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                    <Link
                      href={slide.buttonLink || ROUTES.products}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-[#fff8f2] px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.18em] text-[#16110f] transition hover:bg-[#d6ae89]"
                    >
                      {slide.buttonText || "Yeni sezonu ac"}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link
                      href={ROUTES.products}
                      className="inline-flex items-center justify-center rounded-full border border-white/16 bg-white/8 px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-white/34 hover:bg-white/12"
                    >
                      Imza parcalari gor
                    </Link>
                  </div>
                </div>

                <div className="hidden gap-4 lg:grid">
                  {[
                    {
                      title: "01",
                      text: "Monochrome field with camel accent.",
                    },
                    {
                      title: "02",
                      text: "Campaign-first composition before product density.",
                    },
                    {
                      title: "03",
                      text: "Editorial typography with dense negative space.",
                    },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="rounded-[1.75rem] border border-white/10 bg-white/8 p-5 backdrop-blur"
                    >
                      <p className="text-[11px] uppercase tracking-[0.26em] text-[#d6ae89]">{item.title}</p>
                      <p className="mt-3 text-sm leading-7 text-white/70">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {slides.length > 1 ? (
            <>
              <div className="absolute bottom-5 left-5 z-20 flex gap-2 sm:bottom-7 sm:left-8 lg:left-12">
                {slides.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrent(idx)}
                    className={cn(
                      "h-2.5 rounded-full transition-all",
                      idx === current ? "w-10 bg-[#fff8f2]" : "w-2.5 bg-white/45 hover:bg-white/78",
                    )}
                    aria-label={`Slide ${idx + 1}`}
                  />
                ))}
              </div>

              <button
                onClick={() => setCurrent((current - 1 + slides.length) % slides.length)}
                className="absolute left-5 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/14 bg-black/20 text-white backdrop-blur transition-all hover:bg-black/32 sm:flex lg:left-8"
                aria-label="Onceki slide"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => setCurrent((current + 1) % slides.length)}
                className="absolute right-5 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/14 bg-black/20 text-white backdrop-blur transition-all hover:bg-black/32 sm:flex lg:right-8"
                aria-label="Sonraki slide"
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

export function MarqueeSection() {
  const [settings, setSettings] = useState<MarqueeSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMarqueeSettings() {
      try {
        const res = await fetch("/api/settings?type=marquee");
        const data = await res.json();
        if (data.success && data.marqueeSettings) {
          setSettings(data.marqueeSettings);
        }
      } catch (err) {
        console.error("Failed to fetch marquee settings:", err);
      } finally {
        setLoading(false);
      }
    }

    void fetchMarqueeSettings();
  }, []);

  if (loading || !settings?.enabled || !settings.items?.length) {
    return null;
  }

  const speedClass = {
    slow: "animate-marquee-slow",
    normal: "animate-marquee",
    fast: "animate-marquee-fast",
  }[settings.speed || "normal"] || "animate-marquee";

  return (
    <div className="overflow-hidden bg-primary py-2.5 text-white sm:py-3">
      <div className={`flex whitespace-nowrap ${speedClass}`}>
        {[...settings.items, ...settings.items].map((item, idx) => {
          const Icon = ICON_MAP[item.icon] || Leaf;
          return (
            <div key={`${item.id}-${idx}`} className="flex items-center gap-2 px-4 sm:px-6">
              <Icon className="h-4 w-4 flex-shrink-0 text-white/90" />
              <span className="text-xs sm:text-sm">{item.text}</span>
              {item.badge ? (
                <span className="rounded-full bg-white/16 px-2 py-0.5 text-[10px] font-bold sm:text-xs">
                  {item.badge}
                </span>
              ) : null}
              <span className="mx-2 text-white/35">•</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Newsletter() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubscribed(true);
      setEmail("");
    }, 1000);
  };

  return (
    <section className="relative overflow-hidden bg-[#181311] py-16 sm:py-20 md:py-24">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(214,174,137,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_20%)]" />
      <div className="container mx-auto relative z-10 px-4 sm:px-6">
        <div className="mx-auto max-w-2xl">
          {subscribed ? (
            <div className="rounded-[2rem] border border-white/14 bg-white/8 p-8 text-center text-white backdrop-blur sm:p-12">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#fff8f2]">
                <Check className="h-10 w-10 text-[#181311]" />
              </div>
              <h3 className="text-2xl font-semibold text-white sm:text-3xl">
                Waya listesine kaydoldunuz.
              </h3>
              <p className="mt-3 text-base text-white/72 sm:text-lg">
                Yeni sezon dususleri ve ozel kampanya notlari artik ilk size ulasacak.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-sm text-white">
                <Sparkles className="h-4 w-4" />
                Ozel edit erisimi
              </div>
            </div>
          ) : (
            <div className="text-center text-white">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/8 px-4 py-2 text-sm font-medium">
                <Mail className="h-4 w-4" />
                Waya Notes
              </div>

              <h2 className="font-serif text-4xl leading-[0.9] tracking-[-0.05em] text-[#fff8f2] sm:text-5xl md:text-6xl">
                Sezon dususlerini ilk once goren listede olun.
              </h2>

              <p className="mx-auto mt-5 max-w-xl text-base text-white/72 sm:text-lg">
                Drop bildirimleri, sinirli look secimleri ve kampanya notlari tek bir sakin luks
                bultende bulussun.
              </p>

              <form onSubmit={handleSubmit} className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="E-posta adresiniz"
                    required
                    className="w-full rounded-full border border-white/22 bg-white/10 px-5 py-4 text-base text-white placeholder:text-white/45 backdrop-blur-sm transition-all focus:border-[#d6ae89] focus:outline-none focus:ring-2 focus:ring-[#d6ae89]/30"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#fff8f2] px-8 py-4 text-base font-bold text-[#181311] transition-all hover:bg-[#d6ae89] disabled:opacity-50"
                >
                  {loading ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#181311] border-t-transparent" />
                  ) : (
                    <>
                      Katil
                      <Send className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              <p className="mt-6 flex items-center justify-center gap-2 text-xs text-white/58 sm:text-sm">
                <Shield className="h-4 w-4" />
                Yalnizca yeni sezon ve ozel drop notlari.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
