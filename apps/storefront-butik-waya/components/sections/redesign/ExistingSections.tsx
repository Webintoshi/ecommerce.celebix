"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
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
      <section className="w-full">
                  <div className="relative aspect-[5/7] w-full bg-[#ffffff] sm:aspect-[4/5] md:aspect-[16/9] xl:aspect-[2.35/1]" />
      </section>
    );
  }

  const slide = slides[current];

  return (
    <section className="w-full">
              <div className="relative aspect-[5/7] max-h-[980px] w-full overflow-hidden bg-[#ffffff] sm:aspect-[4/5] md:aspect-[16/9] xl:aspect-[2.35/1]">
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

        {slides.length > 1 ? (
          <>
            <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 sm:bottom-8">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrent(idx)}
                  className={cn(
                    "h-1 rounded-full transition-all duration-300",
                    idx === current ? "w-12 bg-white" : "w-6 bg-white/38 hover:bg-white/68",
                  )}
                  aria-label={`Slide ${idx + 1}`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setCurrent((current - 1 + slides.length) % slides.length)}
              className="absolute left-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/18 bg-black/12 text-white backdrop-blur transition-all hover:bg-black/24 lg:flex"
              aria-label="Onceki slide"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setCurrent((current + 1) % slides.length)}
              className="absolute right-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/18 bg-black/12 text-white backdrop-blur transition-all hover:bg-black/24 lg:flex"
              aria-label="Sonraki slide"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        ) : null}
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
