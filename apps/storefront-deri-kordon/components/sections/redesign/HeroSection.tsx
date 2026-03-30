"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";

interface HeroBanner {
  id: number;
  desktop: string;
  mobile?: string;
  alt: string;
  title?: string;
  subtitle?: string;
  description?: string;
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
    title: "El Yapımı",
    subtitle: "Hakiki Deri Kordonlar",
    description: "Ustalık ve zarafetin buluştuğu, zamana meydan okuyan deri aksesuarlar.",
    buttonText: "Koleksiyonu Keşfet",
    buttonLink: "/koleksiyon",
  },
];

// Animation variants
const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
    scale: 1.1,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      x: { type: "spring", stiffness: 300, damping: 30 },
      opacity: { duration: 0.5 },
      scale: { duration: 1.2, ease: [0.16, 1, 0.3, 1] },
    },
  },
  exit: (direction: number) => ({
    x: direction < 0 ? "100%" : "-100%",
    opacity: 0,
    scale: 0.95,
    transition: {
      x: { type: "spring", stiffness: 300, damping: 30 },
      opacity: { duration: 0.3 },
    },
  }),
};

const textContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.3,
    },
  },
};

const textItemVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

const letterVariants = {
  hidden: { opacity: 0, y: 50 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.03,
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1],
    },
  }),
};

// Split text into animated letters
function AnimatedText({ text, className }: { text: string; className?: string }) {
  return (
    <motion.span
      className={cn("inline-flex flex-wrap", className)}
      variants={textContainerVariants}
      initial="hidden"
      animate="visible"
    >
      {text.split("").map((char, i) => (
        <motion.span
          key={i}
          custom={i}
          variants={letterVariants}
          className="inline-block"
          style={{ whiteSpace: char === " " ? "pre" : "normal" }}
        >
          {char}
        </motion.span>
      ))}
    </motion.span>
  );
}

export function HeroSection({ slides, banners }: HeroSectionProps) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const containerRef = useRef<HTMLElement>(null);
  
  // Parallax scroll effect
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });
  
  const imageY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const contentY = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  
  // Use provided banners or default
  const heroBanners =
    (slides && slides.length > 0 ? slides : null) ||
    (banners && banners.length > 0 ? banners : null) ||
    defaultBanners;

  // Auto-slide
  useEffect(() => {
    if (!isAutoPlaying || heroBanners.length <= 1) return;
    
    const interval = setInterval(() => {
      setDirection(1);
      setCurrent((prev) => (prev + 1) % heroBanners.length);
    }, 6000);
    
    return () => clearInterval(interval);
  }, [isAutoPlaying, heroBanners.length]);

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

  const currentBanner = heroBanners[current];
  const desktopSrc = currentBanner.desktop || currentBanner.mobile || defaultBanners[0].desktop;
  const mobileSrc = currentBanner.mobile || currentBanner.desktop || defaultBanners[0].mobile || desktopSrc;

  return (
    <section 
      ref={containerRef}
      className="relative w-full h-[85vh] min-h-[600px] max-h-[1000px] overflow-hidden bg-[#0F1626]"
      onMouseEnter={() => setIsAutoPlaying(false)}
      onMouseLeave={() => setIsAutoPlaying(true)}
    >
      {/* Background Images with Parallax */}
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={current}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          className="absolute inset-0"
        >
          {/* Desktop Image with Ken Burns */}
          <motion.div 
            className="absolute inset-0 hidden md:block"
            style={{ y: imageY }}
          >
            <div className="absolute inset-0 scale-110 animate-ken-burns">
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
          </motion.div>
          
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
          
          {/* Multi-layer Gradient Overlays */}
          {/* Vignette */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(15,22,38,0.4)_100%)]" />
          
          {/* Bottom fade for content readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0F1626] via-[#0F1626]/40 to-transparent" />
          
          {/* Side gradients */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#0F1626]/60 via-transparent to-[#0F1626]/30" />
          
          {/* Subtle noise texture overlay */}
          <div 
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            }}
          />
        </motion.div>
      </AnimatePresence>

      {/* Content with Parallax */}
      <motion.div 
        className="absolute inset-0 flex items-center"
        style={{ y: contentY, opacity }}
      >
        <div className="container-premium relative z-10">
          <div className="max-w-3xl">
            <AnimatePresence mode="wait">
              <motion.div
                key={current}
                initial="hidden"
                animate="visible"
                exit="hidden"
                variants={textContainerVariants}
              >
                {/* Eyebrow Text */}
                <motion.div 
                  variants={textItemVariants}
                  className="mb-6"
                >
                  <span className="inline-flex items-center gap-3 text-xs font-medium uppercase tracking-[0.3em] text-[#8A6B37]">
                    <span className="h-px w-8 bg-[#8A6B37]" />
                    Deri Kordon
                    <span className="h-px w-8 bg-[#8A6B37]" />
                  </span>
                </motion.div>

                {/* Main Title */}
                <motion.h1 
                  variants={textItemVariants}
                  className="mb-4 font-serif text-5xl text-white md:text-6xl lg:text-7xl xl:text-8xl leading-[0.95]"
                >
                  <AnimatedText text={currentBanner.title || "El Yapımı"} />
                </motion.h1>
                
                {/* Subtitle */}
                <motion.h2 
                  variants={textItemVariants}
                  className="mb-6 font-serif text-4xl text-[#8A6B37] md:text-5xl lg:text-6xl leading-[0.95]"
                >
                  <AnimatedText text={currentBanner.subtitle || "Hakiki Deri Kordonlar"} />
                </motion.h2>

                {/* Description */}
                <motion.p 
                  variants={textItemVariants}
                  className="mb-10 max-w-lg text-lg text-white/70 md:text-xl leading-relaxed"
                >
                  {currentBanner.description || "Ustalık ve zarafetin buluştuğu, zamana meydan okuyan deri aksesuarlar."}
                </motion.p>

                {/* CTA Button */}
                <motion.div variants={textItemVariants}>
                  <Link
                    href={currentBanner.buttonLink || "/koleksiyon"}
                    className="group inline-flex items-center gap-3 bg-[#8A6B37] px-8 py-4 text-sm font-medium uppercase tracking-wider text-white transition-all duration-300 hover:bg-[#A67C3D] hover:shadow-[0_8px_32px_rgba(138,107,55,0.35)] magnetic-btn"
                  >
                    <span>{currentBanner.buttonText || "Koleksiyonu Keşfet"}</span>
                    <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Navigation Arrows */}
      {heroBanners.length > 1 && (
        <>
          <button
            onClick={prevSlide}
            className="absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 z-20 w-14 h-14 border border-white/30 bg-white/5 backdrop-blur-sm flex items-center justify-center text-white transition-all duration-300 hover:bg-white/20 hover:border-white/50 hover:scale-110 group"
            aria-label="Önceki slayt"
          >
            <ChevronLeft className="w-6 h-6 transition-transform group-hover:-translate-x-0.5" />
          </button>
          <button
            onClick={nextSlide}
            className="absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 z-20 w-14 h-14 border border-white/30 bg-white/5 backdrop-blur-sm flex items-center justify-center text-white transition-all duration-300 hover:bg-white/20 hover:border-white/50 hover:scale-110 group"
            aria-label="Sonraki slayt"
          >
            <ChevronRight className="w-6 h-6 transition-transform group-hover:translate-x-0.5" />
          </button>
        </>
      )}

      {/* Slide Indicators */}
      {heroBanners.length > 1 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-4">
          {heroBanners.map((_, idx) => (
            <button
              key={idx}
              onClick={() => goToSlide(idx)}
              className="group relative flex items-center"
              aria-label={`Slayt ${idx + 1}`}
            >
              <span className={cn(
                "h-1 transition-all duration-500",
                idx === current 
                  ? "w-12 bg-[#8A6B37]" 
                  : "w-4 bg-white/40 group-hover:bg-white/60"
              )} />
              {idx === current && (
                <motion.span
                  layoutId="activeSlide"
                  className="absolute inset-0 bg-[#8A6B37]"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Scroll Indicator */}
      <motion.div 
        className="absolute bottom-8 right-8 z-20 hidden lg:flex flex-col items-center gap-2"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.5, duration: 0.6 }}
      >
        <span className="text-xs uppercase tracking-widest text-white/50 rotate-90 origin-center translate-x-4">
          Scroll
        </span>
        <motion.div
          className="w-px h-12 bg-gradient-to-b from-white/50 to-transparent"
          animate={{ scaleY: [1, 0.5, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
    </section>
  );
}
