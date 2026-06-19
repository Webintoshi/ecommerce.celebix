
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BatteryCharging, Car, ChevronLeft, ChevronRight, Headphones, Leaf, Shield, Check, Truck, Clock, Sparkles, Mail, Send, Award, Heart, Users, Wrench, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { ROUTES } from "@/lib/constants";
import { DefaultDemoPlaceholder } from "@/components/placeholders/DefaultDemoPlaceholder";
import { DEFAULT_TRUST_ITEMS } from "@/lib/default-demo-theme";
import { Marquee } from "../Marquee";
import { useStorefrontRoute } from "@/lib/storefront-route-context";

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
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const { buildPath } = useStorefrontRoute();
  const usableSlides = (slides || []).filter((slide) => slide.desktop || slide.mobile);
  const hasSlides = usableSlides.length > 0;

  useEffect(() => {
    if (!hasSlides || current < usableSlides.length) return;
    setCurrent(0);
  }, [current, hasSlides, usableSlides.length]);

  useEffect(() => {
    if (usableSlides.length <= 1) return;
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % usableSlides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [usableSlides.length]);

  const slide = hasSlides ? usableSlides[current] : null;
  const desktopImage = resolveStorefrontAssetUrl(slide?.desktop || slide?.mobile || "");
  const mobileImage = resolveStorefrontAssetUrl(slide?.mobile || slide?.desktop || "");
  const slideId = String(slide?.id ?? "hero");
  const hasHeroImage = Boolean(slide && (desktopImage || mobileImage) && !imageErrors[slideId]);
  const desktopUsesProxy = isProxiedStorefrontAssetUrl(desktopImage);
  const mobileUsesProxy = isProxiedStorefrontAssetUrl(mobileImage);
  const trustCards = [
    { label: DEFAULT_TRUST_ITEMS[0] || "Hızlı teslimat", icon: Truck },
    { label: DEFAULT_TRUST_ITEMS[2] || "Doğru ürün desteği", icon: Wrench },
    { label: DEFAULT_TRUST_ITEMS[3] || "Kolay sipariş", icon: Check },
  ];

  return (
    <section className="relative overflow-hidden border-b border-[#172133] bg-[#08111F] text-white">
      <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#FACC15,#22C55E,#38BDF8)]" />
      <div className="relative mx-auto max-w-[1500px] px-5 pb-10 pt-7 sm:px-8 sm:pb-14 sm:pt-10 lg:px-12 lg:py-16">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-14">
          <div className="order-2 min-w-0 lg:order-1">
            <h1
              className="max-w-2xl text-4xl font-semibold leading-[1.02] tracking-normal text-white sm:text-5xl lg:text-6xl"
              style={{ fontFamily: "Inter, system-ui, sans-serif" }}
            >
              Doğru akü, hızlı çözüm
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              Aracınıza uygun akü seçeneklerini keşfedin.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href={buildPath(ROUTES.products)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#FACC15] px-6 py-3 text-sm font-semibold text-[#0B1220] transition hover:bg-[#FDE047]"
              >
                Ürünleri İncele
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={buildPath(ROUTES.contact)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/18 bg-white/8 px-6 py-3 text-sm font-semibold text-white transition hover:border-[#22C55E]/70 hover:bg-white/12"
              >
                <Headphones className="h-4 w-4" />
                Destek Al
              </Link>
            </div>
            <div className="mt-7 grid grid-cols-3 gap-2 sm:max-w-xl">
              {trustCards.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-4 text-center shadow-[0_18px_48px_-42px_rgba(0,0,0,0.7)]"
                  >
                    <Icon className="mx-auto mb-2 h-5 w-5 text-[#22C55E]" />
                    <p className="text-[11px] font-semibold leading-tight text-white sm:text-xs">{item.label}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative order-1 min-w-0 lg:order-2">
            <div className="relative overflow-hidden rounded-lg border border-white/10 bg-[#0F172A] shadow-[0_34px_110px_-66px_rgba(0,0,0,0.85)]">
              <div className="relative aspect-[5/4] min-h-[300px] sm:aspect-[16/10] lg:aspect-[16/11] lg:min-h-[520px]">
                {hasHeroImage ? (
                  <>
                    <div className="absolute inset-0 hidden md:block">
                      <Image
                        src={desktopImage || mobileImage}
                        alt={slide?.alt || "Hemenaku vitrin görseli"}
                        fill
                        className="object-cover"
                        priority
                        sizes="(min-width: 1024px) 52vw, 100vw"
                        unoptimized={desktopUsesProxy}
                        onError={() =>
                          setImageErrors((currentErrors) => ({
                            ...currentErrors,
                            [slideId]: true,
                          }))
                        }
                      />
                    </div>
                    <div className="absolute inset-0 block md:hidden">
                      <Image
                        src={mobileImage || desktopImage}
                        alt={slide?.alt || "Hemenaku vitrin görseli"}
                        fill
                        className="object-cover"
                        priority
                        sizes="100vw"
                        unoptimized={mobileUsesProxy}
                        onError={() =>
                          setImageErrors((currentErrors) => ({
                            ...currentErrors,
                            [slideId]: true,
                          }))
                        }
                      />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent,rgba(8,17,31,0.42))]" />
                    <div className="pointer-events-none absolute left-4 top-4 hidden h-20 w-44 rounded-lg border border-white/14 bg-[#07111F]/62 backdrop-blur-sm sm:block lg:left-6 lg:top-6">
                      <div className="absolute left-5 right-6 top-8 h-px bg-white/24" />
                      <div className="absolute left-8 top-5 h-9 w-20 rounded-t-full border-x border-t border-white/22" />
                      <div className="absolute bottom-4 left-6 h-5 w-5 rounded-full border border-[#FACC15]/70" />
                      <div className="absolute bottom-4 right-8 h-5 w-5 rounded-full border border-[#22C55E]/70" />
                    </div>
                    <div className="pointer-events-none absolute bottom-4 right-4 w-[min(74%,300px)] rounded-lg border border-white/16 bg-[#07111F]/72 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.34)] backdrop-blur-sm sm:bottom-6 sm:right-6 sm:w-[min(78%,430px)] sm:p-5">
                      <div className="mb-2 flex items-center justify-between gap-3 sm:mb-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#FACC15] text-[#0B1220] sm:h-9 sm:w-9">
                            <BatteryCharging className="h-4 w-4 sm:h-5 sm:w-5" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold leading-tight text-white sm:text-sm">12V enerji</p>
                            <p className="hidden text-[11px] text-slate-400 sm:block">Araç uyumu</p>
                          </div>
                        </div>
                        <Zap className="h-5 w-5 text-[#22C55E]" />
                      </div>
                      <div className="relative h-10 rounded-md border border-white/16 bg-white/8 px-2 py-2 sm:h-14 sm:px-3">
                        <div className="absolute -right-2 top-1/2 h-6 w-2 -translate-y-1/2 rounded-r border-y border-r border-white/16 bg-white/8" />
                        <div className="grid h-full grid-cols-6 gap-1 sm:gap-1.5">
                          {[0, 1, 2, 3, 4, 5].map((item) => (
                            <div
                              key={item}
                              className={cn(
                                "rounded-sm border border-white/10",
                                item < 4 ? "bg-[#22C55E]/82" : item === 4 ? "bg-[#FACC15]/80" : "bg-white/12",
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_72%_26%,rgba(250,204,21,0.2),transparent_22%),linear-gradient(135deg,#0B1220,#162033_58%,#0F172A)]">
                    <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] [background-size:36px_36px]" />
                    <div className="absolute left-8 top-8 flex items-center gap-2 text-xs font-semibold uppercase text-slate-300">
                      <Zap className="h-4 w-4 text-[#FACC15]" />
                      Araç enerji hattı
                    </div>
                    <div className="absolute left-8 right-8 top-24 h-28 rounded-lg border border-white/12">
                      <div className="absolute left-10 right-12 top-10 h-px bg-white/18" />
                      <div className="absolute left-14 top-7 h-14 w-24 rounded-t-full border-x border-t border-white/18" />
                      <div className="absolute bottom-5 left-8 h-8 w-8 rounded-full border border-white/25" />
                      <div className="absolute bottom-5 right-12 h-8 w-8 rounded-full border border-white/25" />
                    </div>
                    <div className="absolute bottom-10 left-1/2 w-[62%] -translate-x-1/2 rounded-lg border border-white/14 bg-white/10 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur-sm">
                      <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#FACC15] text-[#0B1220]">
                            <BatteryCharging className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">Hemenaku enerji modülü</p>
                            <p className="text-xs text-slate-400">Görsel placeholder</p>
                          </div>
                        </div>
                        <Wrench className="h-5 w-5 text-[#22C55E]" />
                      </div>
                      <div className="grid grid-cols-6 gap-2">
                        {[0, 1, 2, 3, 4, 5].map((item) => (
                          <div
                            key={item}
                            className={cn(
                              "h-10 rounded-sm border border-white/10",
                              item < 4 ? "bg-[#22C55E]/70" : "bg-white/12",
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid border-t border-white/10 bg-[#0B1220]/92 sm:grid-cols-3">
                {[
                  ["12V", "Akü"],
                  ["Uyum", "Destek"],
                  ["Hız", "Sipariş"],
                ].map(([label, text]) => (
                  <div key={label} className="border-t border-white/0 px-5 py-4 sm:border-l sm:border-white/10 first:sm:border-l-0">
                    <p className="text-lg font-semibold text-white">{label}</p>
                    <p className="mt-1 text-xs text-slate-400">{text}</p>
                  </div>
                ))}
              </div>
            </div>

            {usableSlides.length > 1 ? (
              <div className="absolute bottom-4 right-4 flex gap-2">
                {usableSlides.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrent(idx)}
                    className={cn(
                      "h-2.5 rounded-full transition-all",
                      idx === current ? "w-7 bg-[#FACC15]" : "w-2.5 bg-white/45 hover:bg-white/75",
                    )}
                    aria-label={`Slide ${idx + 1}`}
                  />
                ))}
              </div>
            ) : null}

            {usableSlides.length > 1 ? (
              <>
                <button
                  onClick={() => setCurrent((current - 1 + usableSlides.length) % usableSlides.length)}
                  className="absolute left-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg border border-white/14 bg-[#0B1220]/70 text-white backdrop-blur transition hover:bg-[#0B1220] sm:flex"
                  aria-label="Önceki slide"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setCurrent((current + 1) % usableSlides.length)}
                  className="absolute right-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg border border-white/14 bg-[#0B1220]/70 text-white backdrop-blur transition hover:bg-[#0B1220] sm:flex"
                  aria-label="Sonraki slide"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export function StorefrontCtaSection() {
  return (
    <section className="bg-[#0B1220] py-14 text-white sm:py-16">
      <div className="container-premium">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase text-[#86EFAC]">
              Hemenaku destek
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
              Hangi akü uygun emin değil misiniz?
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/72">
              Araç modeliniz, kullanım ihtiyacınız ve teslimat beklentinizi paylaşın; doğru ürün seçimi için destek kanalına ulaşın.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Link
              href={ROUTES.products}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#FACC15] px-5 py-3 text-sm font-semibold text-[#0B1220] transition hover:bg-[#FDE047]"
            >
              Ürünleri İncele
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={ROUTES.contact}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <Mail className="h-4 w-4" />
              Destek Al
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
