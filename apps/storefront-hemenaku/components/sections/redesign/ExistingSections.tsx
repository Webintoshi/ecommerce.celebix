
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronLeft, ChevronRight, Leaf, Shield, Check, Truck, Clock, Sparkles, Mail, Send, Award, Heart, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES, SITE_NAME, SITE_TAGLINE } from "@/lib/constants";
import { DefaultDemoPlaceholder } from "@/components/placeholders/DefaultDemoPlaceholder";
import { DEFAULT_DEMO_THEME, DEFAULT_TRUST_ITEMS } from "@/lib/default-demo-theme";
import { Marquee } from "../Marquee";

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

// Types from PremiumHome
interface HeroSlide {
  id: string | number;
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
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (slides && slides.length > 0) {
      setIsLoaded(true);
    }
  }, [slides]);

  useEffect(() => {
    if (!slides || slides.length <= 1) return;
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [slides]);

  if (!isLoaded || !slides || slides.length === 0) {
    return (
      <section className="relative overflow-hidden border-b border-[#DDE7E4] bg-[#F7FAF9]">
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0F766E,#EA580C,#2563EB)]" />
        <div className="relative mx-auto flex min-h-[620px] max-w-[1500px] min-w-0 flex-col justify-center overflow-hidden px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="max-w-2xl">
              <span className="inline-flex rounded-full border border-[#0F766E]/20 bg-white px-4 py-2 text-[11px] font-semibold uppercase text-[#0F766E] shadow-sm">
                {DEFAULT_DEMO_THEME.heroEyebrow}
              </span>
              <h1 className="mt-6 font-serif text-4xl font-semibold leading-[1.02] text-[#111827] sm:text-5xl lg:text-6xl">
                {SITE_NAME}
                <span className="mt-3 block text-[#0F766E]">{DEFAULT_DEMO_THEME.heroTitle}</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-8 text-[#4B635E] sm:text-lg">
                {SITE_TAGLINE || DEFAULT_DEMO_THEME.heroDescription}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={ROUTES.products}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0F766E] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#115E59]"
                >
                  Urunleri Incele
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href={ROUTES.contact}
                  className="inline-flex items-center justify-center rounded-full border border-[#CBD8D5] bg-white px-6 py-3.5 text-sm font-semibold text-[#111827] transition hover:border-[#0F766E] hover:text-[#0F766E]"
                >
                  Magazayi Kesfet
                </Link>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {DEFAULT_TRUST_ITEMS.map((item, index) => {
                  const TrustIcon = [Shield, Truck, Check, Clock][index] || Shield;
                  return (
                  <div
                    key={item}
                    className="rounded-lg border border-[#DDE7E4] bg-white px-4 py-3 text-xs font-semibold text-[#425A55] shadow-sm"
                  >
                    <TrustIcon className="mb-2 h-4 w-4 text-[#0F766E]" />
                    <span>{item}</span>
                  </div>
                  );
                })}
              </div>
            </div>

            <div className="grid min-w-0 gap-4 sm:grid-cols-[0.72fr_0.28fr]">
              <div className="relative aspect-[4/5] overflow-hidden rounded-lg shadow-[0_28px_80px_-56px_rgba(15,23,42,0.55)]">
                <DefaultDemoPlaceholder id="placeholder-01" label="Hemenaku vitrini" />
              </div>
              <div className="grid gap-4">
                <div className="relative min-h-[220px] overflow-hidden rounded-lg shadow-[0_20px_48px_-40px_rgba(15,23,42,0.45)]">
                  <DefaultDemoPlaceholder id="placeholder-02" label="Secili urunler" compact />
                </div>
                <div className="rounded-lg border border-[#DDE7E4] bg-white p-5 shadow-[0_20px_48px_-42px_rgba(15,23,42,0.28)]">
                  <p className="text-[11px] font-semibold uppercase text-[#EA580C]">
                    Guvenli akış
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold text-[#111827]">Temiz vitrin, net sepet, kolay odeme</h2>
                  <p className="mt-3 text-sm leading-7 text-[#526B66]">
                    Hemenaku alisveris deneyimi urun az olsa bile dengeli, okunabilir ve guven veren bir yapida kalir.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const slide = slides[current];

  return (
    <section className="relative w-full overflow-hidden">
      {/* Aspect Ratio Container - Mobile: 3/4, Desktop: 16/9 */}
      <div className="relative w-full aspect-[3/4] sm:aspect-[4/5] md:aspect-[16/9] lg:aspect-[21/9] max-h-[900px]">
        <div
          className="absolute inset-0 transition-opacity duration-700"
        >
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
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent md:from-black/60 md:via-black/30" />
        </div>

      <div className="absolute inset-0 z-10 flex items-center">
        <div className="container mx-auto px-4 sm:px-6">
        <div className="max-w-lg sm:max-w-xl md:max-w-2xl">
            <div
              className="opacity-0 animate-[fadeIn_0.5s_ease-out_forwards]"
            >
              {slide.title && (
                <span
                  className="inline-block px-3 py-1 sm:px-4 sm:py-1.5 bg-white/20 backdrop-blur-sm text-white text-xs sm:text-sm font-medium rounded-full mb-4 sm:mb-6"
                >
                  {slide.title}
                </span>
              )}
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-black text-white mb-3 sm:mb-4 leading-tight">
                {slide.alt}
              </h2>
              {slide.subtitle && (
                <p className="text-base sm:text-lg md:text-xl text-white/90 mb-6 sm:mb-8 max-w-md">
                  {slide.subtitle}
                </p>
              )}
              {slide.buttonText && (
                <Link
                  href={slide.buttonLink || ROUTES.products}
                  className="inline-flex items-center gap-2 px-6 py-3 sm:px-8 sm:py-4 bg-white text-gray-900 text-sm sm:text-base font-bold rounded-full hover:bg-gray-100 transition-all hover:scale-105 active:scale-95"
                >
                  {slide.buttonText}
                  <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                </Link>
              )}
            </div>
        </div>
      </div>
      </div>

      {slides.length > 1 && (
        <div className="absolute bottom-4 sm:bottom-6 md:bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-20">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrent(idx)}
              className={cn(
                "w-2 h-2 sm:w-3 sm:h-3 rounded-full transition-all",
                idx === current ? "bg-white w-6 sm:w-8" : "bg-white/50 hover:bg-white/80"
              )}
              aria-label={`Slide ${idx + 1}`}
            />
          ))}
        </div>
      )}

      {slides.length > 1 && (
        <>
          <button
            onClick={() => setCurrent((current - 1 + slides.length) % slides.length)}
            className="hidden sm:flex absolute left-2 md:left-4 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 bg-white/20 backdrop-blur-sm rounded-full items-center justify-center text-white hover:bg-white/30 transition-all z-20 touch-manipulation"
            aria-label="Önceki slide"
          >
            <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
          </button>
          <button
            onClick={() => setCurrent((current + 1) % slides.length)}
            className="hidden sm:flex absolute right-2 md:right-4 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 bg-white/20 backdrop-blur-sm rounded-full items-center justify-center text-white hover:bg-white/30 transition-all z-20 touch-manipulation"
            aria-label="Sonraki slide"
          >
            <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
          </button>
        </>
      )}
      </div>
    </section>
  );
}

export function StorefrontCtaSection() {
  return (
    <section className="bg-[#111827] py-14 text-white sm:py-16">
      <div className="container-premium">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase text-[#99F6E4]">
              Hemenaku destek hattı
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
              Siparis, teslimat veya urun sorulariniz icin net bir sonraki adim var.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/72">
              Urunleri inceleyebilir, sorulariniz icin iletisim kanalina gecebilir ya da sepetinizi guvenli odeme akisiyle tamamlayabilirsiniz.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Link
              href={ROUTES.products}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#111827] transition hover:bg-[#F7FAF9]"
            >
              Urunleri Incele
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={ROUTES.contact}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <Mail className="h-4 w-4" />
              Iletisime Gec
            </Link>
          </div>
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
    fetchMarqueeSettings();
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
    <div className="bg-primary text-white py-2.5 sm:py-3 overflow-hidden">
      <div className={`flex ${speedClass} whitespace-nowrap`}>
        {[...settings.items, ...settings.items].map((item, idx) => {
          const Icon = ICON_MAP[item.icon] || Leaf;
          return (
            <div key={`${item.id}-${idx}`} className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6">
              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/90 flex-shrink-0" />
              <span className="text-xs sm:text-sm font-medium">{item.text}</span>
              {item.badge && (
                <span className="px-1.5 sm:px-2 py-0.5 bg-white/20 rounded-full text-[10px] sm:text-xs font-bold">
                  {item.badge}
                </span>
              )}
              <span className="text-white/40 mx-1 sm:mx-2">•</span>
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
    <section className="py-16 sm:py-20 md:py-28 bg-[#0F766E] relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Gradient Orbs */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#F0FDFA]/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-[#F0FDFA]/10 rounded-full blur-3xl" />
        
        {/* Pattern Overlay */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="max-w-2xl mx-auto">
          {subscribed ? (
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-8 sm:p-12 text-center opacity-0 animate-[fadeIn_0.5s_ease-out_forwards]">
              {/* Success Icon */}
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#F0FDFA] flex items-center justify-center">
                <Check className="w-10 h-10 text-[#0F766E]" />
              </div>
              
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                Aramıza Hoş Geldiniz! 🎉
              </h3>
              <p className="text-white/80 text-base sm:text-lg mb-4">
                %10 indirim kodunuz e-posta adresinize gönderildi.
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F0FDFA]/20 text-white text-sm">
                <Sparkles className="w-4 h-4" />
                İlk siparişinizde geçerli
              </div>
            </div>
          ) : (
            <div className="text-center opacity-0 animate-[fadeIn_0.6s_ease-out_forwards]">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white text-sm font-medium mb-6 opacity-0 animate-[fadeIn_0.4s_ease-out_forwards]" style={{ animationDelay: '0.1s' }}>
                <Mail className="w-4 h-4" />
                E-Bülten
              </div>

              {/* Title */}
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
                Özel Fırsatları
                <span className="block mt-1 text-[#F0FDFA]">Kaçırma</span>
              </h2>

              {/* Description */}
              <p className="text-white/80 text-base sm:text-lg mb-8 max-w-lg mx-auto">
                İlk siparişinde <span className="text-white font-bold bg-white/20 px-2 py-0.5 rounded">%10 indirim</span> kazanmak için e-bültene abone ol
              </p>

              {/* Form */}
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                <div className="relative flex-1">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="E-posta adresin"
                    required
                    className="w-full px-5 sm:px-6 py-4 bg-white/10 border border-white/30 rounded-xl text-white text-base placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[#F0FDFA]/50 focus:border-[#F0FDFA] transition-all backdrop-blur-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-8 py-4 bg-white text-[#0F766E] text-base font-bold rounded-xl hover:bg-[#F0FDFA] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-[#0F766E] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      Abone Ol
                      <Send className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Trust Note */}
              <p className="text-white/60 text-xs sm:text-sm mt-6 flex items-center justify-center gap-2">
                <Shield className="w-4 h-4" />
                Dilediğin zaman abonelikten çıkabilirsin. Spam yok.
              </p>

              {/* Decorative Elements */}
              <div className="flex items-center justify-center gap-4 mt-8">
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="w-8 h-8 rounded-full bg-[#F0FDFA]/30 border-2 border-[#0F766E] flex items-center justify-center"
                    >
                      <span className="text-white text-xs">👤</span>
                    </div>
                  ))}
                </div>
                <span className="text-white/60 text-sm">
                  <span className="text-white font-semibold">5.000+</span> kişi katıldı
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
