"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import { ChevronLeft, ChevronRight, ArrowRight, Sparkles, Percent, Clock } from "lucide-react";

export interface PromoBanner {
  id: number;
  image: string;
  mobileImage?: string;
  title: string;
  subtitle: string;
  buttonText: string;
  buttonLink: string;
  order: number;
  badge?: string;
  color?: string;
  discount?: string;
  endDate?: string;
}

interface PromotionalBannersProps {
  initialBanners?: PromoBanner[];
}

export default function PromotionalBanners({ initialBanners = [] }: PromotionalBannersProps) {
  const [banners, setBanners] = useState<PromoBanner[]>(initialBanners);
  const [loading, setLoading] = useState(!initialBanners.length);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const autoPlayRef = useRef<NodeJS.Timeout | null>(null);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    async function fetchBanners() {
      if (initialBanners.length > 0) {
        setBanners(initialBanners);
        setLoading(false);
        return;
      }

      try {
        const supabase = getBrowserSupabaseClient();

        const { data } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "promo_banners")
          .single();

        if (data?.value?.banners) {
          const mergedBanners = data.value.banners.map((banner: PromoBanner) => ({
            ...banner,
            badge: banner.badge || getDefaultBadge(banner.order),
            color: banner.color || getDefaultColor(banner.order),
            discount: banner.discount || getDefaultDiscount(banner.order),
          }));
          setBanners(mergedBanners);
        } else {
          setBanners(getDefaultBanners());
        }
      } catch (err) {
        console.error(err);
        setBanners(getDefaultBanners());
      } finally {
        setLoading(false);
      }
    }
    fetchBanners();
  }, [initialBanners]);

  const getDefaultBadge = (order: number): string => {
    const badges = ["🔥 Çok Satan", "✨ Yeni", "🌿 Organik"];
    return badges[order - 1] || "✨ Özel";
  };

  const getDefaultColor = (order: number): string => {
    const colors = ["#7B1113", "#8B4513", "#2D5016"];
    return colors[order - 1] || "#7B1113";
  };

  const getDefaultDiscount = (order: number): string => {
    const discounts = ["20", "15", "10"];
    return discounts[order - 1] || "10";
  };

  const getDefaultBanners = (): PromoBanner[] => [
    {
      id: 1,
      image: "/hero-banner-fistik-ezmeleri.jpg",
      mobileImage: "/hero-banner-fistik-ezmeleri-mobile.jpg",
      title: "Doğal Fıstık Ezmesi",
      subtitle: "Her Gün Taze",
      buttonText: "İncele",
      buttonLink: "/koleksiyon/fistik-ezmesi",
      order: 1,
      badge: "🔥 Çok Satan",
      color: "#7B1113",
      discount: "20"
    },
    {
      id: 2,
      image: "/Hero_banner_Bir.jpg",
      mobileImage: "/hero-banner-super-gidalar-mobile.jpg",
      title: "Süper Gıdalar",
      subtitle: "Yeni Geldi!",
      buttonText: "Keşfet",
      buttonLink: "/koleksiyon/yeni-urunler",
      order: 2,
      badge: "✨ Yeni",
      color: "#8B4513",
      discount: "15"
    },
    {
      id: 3,
      image: "/Findik_Ezmeleri_Kategorisi.webp",
      mobileImage: "/Findik_Ezmeleri_Kategorisi.webp",
      title: "Saf Organik",
      subtitle: "Koleksiyon",
      buttonText: "Göz At",
      buttonLink: "/koleksiyon/kuruyemis",
      order: 3,
      badge: "🌿 Organik",
      color: "#2D5016",
      discount: "10"
    }
  ];

  const scroll = useCallback((direction: "left" | "right") => {
    if (scrollRef.current) {
      const container = scrollRef.current;
      const cardWidth = isMobile ? container.offsetWidth * 0.85 : 400;
      const gap = isMobile ? 12 : 24;
      const scrollAmount = cardWidth + gap;
      
      container.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth"
      });
    }
  }, [isMobile]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const scrollLeft = scrollRef.current.scrollLeft;
      const cardWidth = isMobile ? scrollRef.current.offsetWidth * 0.85 : 400;
      const gap = isMobile ? 12 : 24;
      const newIndex = Math.round(scrollLeft / (cardWidth + gap));
      setCurrentIndex(Math.min(newIndex, banners.length - 1));
    }
  }, [banners.length, isMobile]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50;
    
    if (Math.abs(diff) > threshold) {
      if (diff > 0 && currentIndex < banners.length - 1) {
        scroll("right");
      } else if (diff < 0 && currentIndex > 0) {
        scroll("left");
      }
    }
  }, [scroll, currentIndex, banners.length]);

  const goToSlide = useCallback((index: number) => {
    if (scrollRef.current) {
      const container = scrollRef.current;
      const cardWidth = isMobile ? container.offsetWidth * 0.85 : 400;
      const gap = isMobile ? 12 : 24;
      
      container.scrollTo({
        left: index * (cardWidth + gap),
        behavior: 'smooth'
      });
    }
  }, [isMobile]);

  const sortedBanners = [...banners].sort((a, b) => a.order - b.order);
  const autoPlayTimeout = 5000;

  useEffect(() => {
    if (!isPaused && sortedBanners.length > 1 && !loading) {
      autoPlayRef.current = setInterval(() => {
        const nextIndex = (currentIndex + 1) % sortedBanners.length;
        setCurrentIndex(nextIndex);
        goToSlide(nextIndex);
      }, autoPlayTimeout);
    }

    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
      }
    };
  }, [isPaused, sortedBanners.length, loading, currentIndex, goToSlide]);

  const handlePause = () => setIsPaused(true);
  const handleResume = () => setIsPaused(false);

  if (loading) {
    return (
      <section className="py-16 md:py-24 bg-[#FFF5F5]" id="promotional-banners">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-4 md:gap-6 justify-center">
            {[1, 2, 3].map((i) => (
              <div 
                key={i} 
                className="flex-shrink-0 w-[85vw] md:w-[400px] aspect-[16/10] md:aspect-[16/9] rounded-2xl md:rounded-3xl bg-[#F3E0E1] animate-pulse"
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section 
      className="py-16 md:py-24 bg-[#FFF5F5] overflow-hidden" 
      id="promotional-banners"
      aria-label="Kampanya Bannerları"
    >
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-10 md:mb-14 opacity-0 animate-[fadeIn_0.6s_ease-out_forwards]">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#7B1113] text-white text-sm font-medium mb-4 shadow-lg">
            <Sparkles className="w-4 h-4" />
            Özel Kampanyalar
          </span>
          
          <h2 className="text-3xl md:text-5xl font-bold text-[#7B1113] mb-4 tracking-tight">
            Kaçırılmayacak Fırsatlar
          </h2>
          
          <p className="text-[#6b4b4c] text-base md:text-lg max-w-lg mx-auto">
            Sınırlı süreli indirimler ve özel kampanyaları keşfedin
          </p>
        </div>

        {/* Desktop: Featured Layout (1 Large + 2 Small) */}
        <div className="hidden lg:block">
          <div className="grid grid-cols-12 gap-6">
            {/* Featured Large Card */}
            <div className="col-span-7 opacity-0 animate-[fadeIn_0.6s_ease-out_forwards]">
              <Link href={sortedBanners[0]?.buttonLink || "#"}>
                <div className="group relative aspect-[16/9] rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-500">
                  {/* Background Image */}
                  <Image
                    src={sortedBanners[0]?.image || ""}
                    alt={sortedBanners[0]?.title || ""}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 1400px) 60vw, 800px"
                    priority
                  />
                  
                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
                  
                  {/* Discount Badge */}
                  <div className="absolute top-6 left-6">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#7B1113] text-white shadow-lg">
                      <Percent className="w-4 h-4" />
                      <span className="font-bold">{sortedBanners[0]?.discount}% İndirim</span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="absolute inset-0 flex flex-col justify-end p-8">
                    <span className="text-white/80 text-sm font-medium uppercase tracking-wider mb-2">
                      {sortedBanners[0]?.subtitle}
                    </span>
                    <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
                      {sortedBanners[0]?.title}
                    </h3>
                    <span className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-[#7B1113] font-semibold w-fit group-hover:bg-[#F3E0E1] transition-colors">
                      {sortedBanners[0]?.buttonText}
                      <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </div>
              </Link>
            </div>

            {/* Side Small Cards */}
            <div className="col-span-5 flex flex-col gap-6">
              {sortedBanners.slice(1, 3).map((banner, idx) => (
                <div 
                  key={banner.id}
                  className="flex-1 opacity-0 animate-[fadeIn_0.5s_ease-out_forwards]"
                  style={{ animationDelay: `${(idx + 1) * 0.1}s` }}
                >
                  <Link href={banner.buttonLink}>
                    <div className="group relative h-full min-h-[180px] rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-500">
                      <Image
                        src={banner.image}
                        alt={banner.title}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                        sizes="(max-width: 1400px) 40vw, 500px"
                      />
                      
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                      
                      {/* Discount Badge */}
                      <div className="absolute top-4 right-4">
                        <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white text-sm font-bold border border-white/30">
                          %{banner.discount}
                        </span>
                      </div>

                      <div className="absolute inset-0 flex flex-col justify-end p-5">
                        <h4 className="text-xl font-bold text-white mb-2">
                          {banner.title}
                        </h4>
                        <span className="inline-flex items-center gap-1 text-white/90 text-sm font-medium group-hover:text-white transition-colors">
                          {banner.buttonText}
                          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                        </span>
                      </div>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tablet: 2 Column Grid */}
        <div className="hidden md:grid lg:hidden grid-cols-2 gap-6">
          {sortedBanners.map((banner, idx) => (
            <div 
              key={banner.id}
              className={`${idx === 0 ? "col-span-2" : ""} opacity-0 animate-[fadeIn_0.5s_ease-out_forwards]`}
              style={{ animationDelay: `${idx * 0.1}s` }}
            >
              <Link href={banner.buttonLink}>
                <div className={`group relative rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-500 ${idx === 0 ? "aspect-[21/9]" : "aspect-[16/10]"}`}>
                  <Image
                    src={banner.image}
                    alt={banner.title}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                  
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  
                  {/* Badge */}
                  <div className="absolute top-4 left-4">
                    <span className="px-3 py-1.5 rounded-full bg-[#7B1113] text-white text-sm font-bold shadow-lg">
                      %{banner.discount} İndirim
                    </span>
                  </div>

                  <div className="absolute inset-0 flex flex-col justify-end p-6">
                    <h3 className={`font-bold text-white mb-2 ${idx === 0 ? "text-2xl" : "text-xl"}`}>
                      {banner.title}
                    </h3>
                    <span className="inline-flex items-center gap-2 text-white/90 font-medium group-hover:text-white transition-colors">
                      {banner.buttonText}
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>

        {/* Mobile: Horizontal Scroll */}
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="flex md:hidden gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4 pb-4"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {sortedBanners.map((banner, idx) => (
            <div 
              key={banner.id}
              className="flex-shrink-0 w-[85vw] snap-center opacity-0 animate-[fadeIn_0.5s_ease-out_forwards]"
              style={{ animationDelay: `${idx * 0.1}s` }}
            >
              <Link href={banner.buttonLink}>
                <div className="group relative aspect-[16/10] rounded-2xl overflow-hidden shadow-lg">
                  <Image
                    src={banner.mobileImage || banner.image}
                    alt={banner.title}
                    fill
                    className="object-cover"
                    sizes="85vw"
                  />
                  
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  
                  {/* Discount Badge */}
                  <div className="absolute top-4 left-4">
                    <span className="px-3 py-1.5 rounded-full bg-[#7B1113] text-white text-sm font-bold">
                      %{banner.discount}
                    </span>
                  </div>

                  <div className="absolute inset-0 flex flex-col justify-end p-5">
                    <span className="text-white/80 text-xs uppercase tracking-wider mb-1">
                      {banner.subtitle}
                    </span>
                    <h3 className="text-xl font-bold text-white mb-3">
                      {banner.title}
                    </h3>
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-[#7B1113] text-sm font-semibold w-fit">
                      {banner.buttonText}
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>

        {/* Mobile Scroll Indicator */}
        <div className="flex md:hidden items-center justify-center gap-2 mt-6">
          {sortedBanners.map((_, idx) => (
            <button
              key={idx}
              onClick={() => goToSlide(idx)}
              className={`h-2 rounded-full transition-all duration-300 ${
                idx === currentIndex 
                  ? 'w-8 bg-[#7B1113]' 
                  : 'w-2 bg-[#7B1113]/30'
              }`}
              aria-label={`Kampanya ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </section>
  );
}
