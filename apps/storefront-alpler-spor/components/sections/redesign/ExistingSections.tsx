
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronLeft, ChevronRight, Leaf, Shield, Check, Truck, Clock, Sparkles, Mail, Send, Award, Heart, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
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
      <section className="alpler-dark-gradient relative overflow-hidden text-white">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-[#FF6A00]" />
        <div className="absolute right-8 top-12 hidden rounded-full bg-[#B6FF00] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#0B0F14] lg:block">
          Sezon Firsatlari
        </div>
        <div className="container-premium relative flex min-h-[560px] flex-col justify-center py-20 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="max-w-2xl">
              <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.28em] text-[#B6FF00] backdrop-blur">
                Yeni Sezon / Alpler Spor
              </span>
              <h1 className="mt-6 text-4xl font-black leading-[0.96] tracking-tight text-white sm:text-5xl lg:text-7xl">
                Performansini Tarzinla Tamamla
              </h1>
              <p className="mt-5 max-w-xl text-base leading-8 text-[#E5E7EB] sm:text-lg">
                Sneaker, spor ayakkabi ve aktif giyim koleksiyonlarini hizli,
                guvenli ve mobil odakli bir Alpler Spor deneyiminde kesfet.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={ROUTES.products}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#FF6A00] px-7 py-3.5 text-sm font-black text-white transition hover:bg-[#E85F00]"
                >
                  Alisverise Basla
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href={`${ROUTES.products}?sort=discounted`}
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/20 bg-white/10 px-7 py-3.5 text-sm font-black text-white backdrop-blur transition hover:bg-white/15"
                >
                  Kampanyalari Gor
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { title: "Sneaker", text: "Gunluk stil ve sportif rahatlik icin hizli kategori girisi." },
                { title: "Kosudan Outdoor'a", text: "Kullanim senaryosuna gore sade ve hizli kesif." },
                { title: "Mobil Satin Alma", text: "Fiyat, stok ve CTA alani kucuk ekranda kaybolmaz." },
                { title: "Guvenli Akis", text: "Teslimat, iade ve odeme bilgisi satin alma kararini netlestirir." },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-[1.5rem] border border-white/10 bg-white/8 p-5 backdrop-blur"
                >
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#FF6A00]">
                    Performans
                  </p>
                  <h2 className="mt-3 text-xl font-black text-white">{item.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-[#CBD5E1]">{item.text}</p>
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
    <section className="relative w-full overflow-hidden bg-[#0B0F14]">
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
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B0F14]/90 via-[#111827]/60 to-transparent md:from-[#0B0F14]/82 md:via-[#111827]/45" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(255,106,0,0.24),transparent_30%)]" />
        </div>

      <div className="absolute inset-0 z-10 flex items-center">
        <div className="container-premium">
        <div className="max-w-lg sm:max-w-xl md:max-w-2xl">
            <div
              className="opacity-0 animate-[fadeIn_0.5s_ease-out_forwards]"
            >
              {slide.title && (
                <span
                  className="mb-4 inline-block rounded-full bg-[#FF6A00] px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-white backdrop-blur-sm sm:mb-6 sm:px-4 sm:py-1.5 sm:text-sm"
                >
                  {slide.title}
                </span>
              )}
              <h2 className="mb-3 text-4xl font-black leading-[0.98] tracking-tight text-white sm:mb-4 sm:text-5xl md:text-6xl xl:text-7xl">
                {slide.alt || "Performansini Tarzinla Tamamla"}
              </h2>
              {slide.subtitle && (
                <p className="mb-6 max-w-md text-base leading-7 text-[#E5E7EB] sm:mb-8 sm:text-lg md:text-xl">
                  {slide.subtitle}
                </p>
              )}
              {slide.buttonText && (
                <Link
                  href={slide.buttonLink || ROUTES.products}
                  className="inline-flex items-center gap-2 rounded-full bg-[#FF6A00] px-6 py-3 text-sm font-black text-white transition-all hover:bg-[#E85F00] active:scale-95 sm:px-8 sm:py-4 sm:text-base"
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
    <section className="py-16 sm:py-20 md:py-28 bg-[#7B1113] relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Gradient Orbs */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#F3E0E1]/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-[#F3E0E1]/10 rounded-full blur-3xl" />
        
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
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#F3E0E1] flex items-center justify-center">
                <Check className="w-10 h-10 text-[#7B1113]" />
              </div>
              
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                Aramıza Hoş Geldiniz! 🎉
              </h3>
              <p className="text-white/80 text-base sm:text-lg mb-4">
                %10 indirim kodunuz e-posta adresinize gönderildi.
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F3E0E1]/20 text-white text-sm">
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
                <span className="block mt-1 text-[#F3E0E1]">Kaçırma</span>
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
                    className="w-full px-5 sm:px-6 py-4 bg-white/10 border border-white/30 rounded-xl text-white text-base placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[#F3E0E1]/50 focus:border-[#F3E0E1] transition-all backdrop-blur-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-8 py-4 bg-white text-[#7B1113] text-base font-bold rounded-xl hover:bg-[#F3E0E1] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-[#7B1113] border-t-transparent rounded-full animate-spin" />
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
                      className="w-8 h-8 rounded-full bg-[#F3E0E1]/30 border-2 border-[#7B1113] flex items-center justify-center"
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
