"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface HeroBanner {
  id: number;
  desktop: string;
  mobile?: string;
  alt: string;
  title?: string;
  subtitle?: string;
  buttonText?: string;
  buttonLink?: string;
}

interface HeroSectionProps {
  slides?: HeroBanner[];
  banners?: HeroBanner[];
}

// Default banners - admin panelinden yüklenmediğinde gösterilecek
const defaultBanners: HeroBanner[] = [
  {
    id: 1,
    desktop: "/Hero_banner_Bir.jpg",
    mobile: "/hero-banner-fistik-ezmeleri-mobile.jpg",
    alt: "Premium Deri Ürünler",
  },
];

export function HeroSection({ slides, banners }: HeroSectionProps) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);
  
  // Use provided banners or default
  const heroBanners =
    (slides && slides.length > 0 ? slides : null) ||
    (banners && banners.length > 0 ? banners : null) ||
    defaultBanners;

  // Auto-slide (optional - can be disabled if only one banner)
  useEffect(() => {
    if (heroBanners.length <= 1) return;
    
    const interval = setInterval(() => {
      setDirection(1);
      setCurrent((prev) => (prev + 1) % heroBanners.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [heroBanners.length]);

  const goToSlide = useCallback((index: number) => {
    setDirection(index > current ? 1 : -1);
    setCurrent(index);
  }, [current]);

  const nextSlide = useCallback(() => {
    if (heroBanners.length <= 1) return;
    setDirection(1);
    setCurrent((prev) => (prev + 1) % heroBanners.length);
  }, [heroBanners.length]);

  const prevSlide = useCallback(() => {
    if (heroBanners.length <= 1) return;
    setDirection(-1);
    setCurrent((prev) => (prev - 1 + heroBanners.length) % heroBanners.length);
  }, [heroBanners.length]);

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? "100%" : "-100%",
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? "100%" : "-100%",
      opacity: 0,
    }),
  };

  const currentBanner = heroBanners[current];
  const desktopSrc = currentBanner.desktop || currentBanner.mobile || defaultBanners[0].desktop;
  const mobileSrc =
    currentBanner.mobile || currentBanner.desktop || defaultBanners[0].mobile || desktopSrc;

  return (
    <section className="relative w-full h-[70vh] min-h-[500px] max-h-[900px] overflow-hidden bg-[#0F1626]">
      {/* Background Images */}
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={current}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: "tween", duration: 0.6, ease: [0.4, 0, 0.2, 1] },
            opacity: { duration: 0.4 },
          }}
          className="absolute inset-0"
        >
          {/* Desktop Image */}
          <div className="absolute inset-0 hidden md:block">
            <Image
              src={desktopSrc}
              alt={currentBanner.alt}
              fill
              priority
              className="object-cover"
              sizes="100vw"
              quality={90}
              unoptimized={desktopSrc.startsWith("http")}
            />
          </div>
          
          {/* Mobile Image */}
          <div className="absolute inset-0 md:hidden">
            <Image
              src={mobileSrc}
              alt={currentBanner.alt}
              fill
              priority
              className="object-cover"
              sizes="100vw"
              quality={85}
              unoptimized={mobileSrc.startsWith("http")}
            />
          </div>
          
          {/* Subtle Overlay for better header visibility */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* Navigation Arrows - Only show if multiple banners */}
      {heroBanners.length > 1 && (
        <>
          <button
            onClick={prevSlide}
            className="absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 z-20 w-12 h-12 border border-white/30 flex items-center justify-center text-white hover:bg-white/10 hover:border-white transition-all duration-300 group"
            aria-label="Önceki"
          >
            <ChevronLeft className="w-5 h-5 transition-transform group-hover:-translate-x-0.5" />
          </button>
          <button
            onClick={nextSlide}
            className="absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 z-20 w-12 h-12 border border-white/30 flex items-center justify-center text-white hover:bg-white/10 hover:border-white transition-all duration-300 group"
            aria-label="Sonraki"
          >
            <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </>
      )}

      {/* Slide Indicators - Only show if multiple banners */}
      {heroBanners.length > 1 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
          {heroBanners.map((_, idx) => (
            <button
              key={idx}
              onClick={() => goToSlide(idx)}
              className={cn(
                "h-1 transition-all duration-500",
                idx === current 
                  ? "w-10 bg-white" 
                  : "w-4 bg-white/40 hover:bg-white/60"
              )}
              aria-label={`Slide ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
