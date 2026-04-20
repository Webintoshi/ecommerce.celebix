"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Check,
  Leaf,
  Mail,
  Send,
  Shield,
  Sparkles,
  Truck,
  Award,
  Heart,
} from "lucide-react";

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
  if (slides.length === 0) {
    return (
      <section className="w-full">
        <div className="relative aspect-[5/7] w-full bg-[#ffffff] sm:aspect-[4/5] md:aspect-[16/9] xl:aspect-[2.35/1]" />
      </section>
    );
  }

  return (
    <section className="w-full space-y-2 sm:space-y-3">
      {slides.map((slide, index) => {
        const href = slide.buttonLink || slide.link;
        const BannerTag = href ? "a" : "div";

        return (
          <BannerTag
            key={slide.id ?? index}
            {...(href
              ? {
                  href,
                  className:
                    "group relative block overflow-hidden bg-[#ffffff] transition-opacity hover:opacity-[0.98]",
                }
              : {
                  className: "relative block overflow-hidden bg-[#ffffff]",
                })}
          >
            <div className="relative aspect-[5/7] w-full sm:aspect-[4/5] md:aspect-[16/9] xl:aspect-[2.35/1]">
              <div className="absolute inset-0 hidden md:block">
                <Image
                  src={slide.desktop}
                  alt={slide.alt}
                  fill
                  className="object-cover"
                  priority={index === 0}
                  sizes="100vw"
                />
              </div>
              <div className="absolute inset-0 block md:hidden">
                <Image
                  src={slide.mobile || slide.desktop}
                  alt={slide.alt}
                  fill
                  className="object-cover"
                  priority={index === 0}
                  sizes="100vw"
                />
              </div>
            </div>
          </BannerTag>
        );
      })}
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
                Yeni sezon düşüşleri ve özel kampanya notları artık ilk size ulaşacak.
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
                Sezon düşüşlerini ilk önce gören listede olun.
              </h2>

              <p className="mx-auto mt-5 max-w-xl text-base text-white/72 sm:text-lg">
                Drop bildirimleri, sınırlı look seçimleri ve kampanya notları tek bir sakin
                lüks bültende buluşsun.
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
                      Katıl
                      <Send className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              <p className="mt-6 flex items-center justify-center gap-2 text-xs text-white/58 sm:text-sm">
                <Shield className="h-4 w-4" />
                Yalnızca yeni sezon ve özel drop notları.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
