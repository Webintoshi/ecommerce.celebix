"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface HeroSlide {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  buttonText: string;
  buttonLink: string;
  secondaryButton?: string;
  secondaryLink?: string;
}

const heroSlides: HeroSlide[] = [
  {
    id: 1,
    title: "El Yapımı",
    subtitle: "Deri Kordon",
    description: "Her dikişte bir hikaye, her üründe bir tutku. Ustalarımızın ellerinden çıkan %100 hakiki deri kordonlar.",
    buttonText: "Koleksiyonu Keşfet",
    buttonLink: "/urunler",
    secondaryButton: "Hakkımızda",
    secondaryLink: "/hakkimizda",
  },
  {
    id: 2,
    title: "Apple Watch",
    subtitle: "Deri Kayış",
    description: "Zamanla güzelleşen, saatinize karakter katan özel tasarım deri kayışlar. Kişiselleştirilebilir seçenekler.",
    buttonText: "Kayışları İncele",
    buttonLink: "/kategori/apple-watch-kayislari",
    secondaryButton: "Özel Tasarim",
    secondaryLink: "/koleksiyon/ozel-tasarim",
  },
  {
    id: 3,
    title: "Kişiye Özel",
    subtitle: "Monogram",
    description: "Adınıza özel işlemeli, eşsiz bir hediye deneyimi. Sevdiklerinize anlamli bir dokunuş yapın.",
    buttonText: "Kişiselleştir",
    buttonLink: "/koleksiyon/kisisellestir",
  },
];

export function HeroSection() {
  const [current, setCurrent] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setDirection(1);
      setCurrent((prev) => (prev + 1) % heroSlides.length);
    }, 7000);
    return () => clearInterval(interval);
  }, []);

  const goToSlide = useCallback((index: number) => {
    setDirection(index > current ? 1 : -1);
    setCurrent(index);
  }, [current]);

  const nextSlide = useCallback(() => {
    setDirection(1);
    setCurrent((prev) => (prev + 1) % heroSlides.length);
  }, []);

  const prevSlide = useCallback(() => {
    setDirection(-1);
    setCurrent((prev) => (prev - 1 + heroSlides.length) % heroSlides.length);
  }, []);

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 100 : -100,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 100 : -100,
      opacity: 0,
    }),
  };

  if (!isLoaded) return null;

  const slide = heroSlides[current];

  return (
    <section className="relative w-full h-screen min-h-[700px] max-h-[1080px] overflow-hidden bg-[#0F1626]">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0F1626] via-[#1A2332] to-[#0F1626]" />
      
      {/* Animated Background Pattern */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill='%23ffffff' fill-opacity='1' fill-rule='evenodd'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Gold Accent Lines */}
      <div className="absolute top-0 left-1/4 w-px h-32 bg-gradient-to-b from-transparent via-[#8A6B37]/30 to-transparent" />
      <div className="absolute top-0 right-1/3 w-px h-48 bg-gradient-to-b from-transparent via-[#8A6B37]/20 to-transparent" />

      {/* Decorative Circles */}
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
        className="absolute -top-40 -right-40 w-80 h-80 border border-[#8A6B37]/10 rounded-full"
      />
      <motion.div 
        animate={{ rotate: -360 }}
        transition={{ duration: 100, repeat: Infinity, ease: "linear" }}
        className="absolute -bottom-20 -left-20 w-60 h-60 border border-[#8A6B37]/10 rounded-full"
      />

      {/* Main Content */}
      <div className="relative z-10 h-full flex items-center">
        <div className="container-premium w-full">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            
            {/* Left Content */}
            <div className="order-2 lg:order-1">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={current}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    x: { type: "spring", stiffness: 300, damping: 30 },
                    opacity: { duration: 0.3 },
                  }}
                >
                  {/* Badge */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="inline-flex items-center gap-3 mb-8"
                  >
                    <span className="w-12 h-px bg-[#8A6B37]" />
                    <span className="text-[#8A6B37] text-xs font-medium tracking-[0.3em] uppercase">
                      Est. 2018 — Istanbul
                    </span>
                  </motion.div>

                  {/* Title */}
                  <motion.h1
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="font-serif text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-medium text-white leading-[0.95] mb-4"
                  >
                    {slide.title}
                  </motion.h1>
                  
                  <motion.h2
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-medium text-[#8A6B37] leading-[0.95] mb-8"
                  >
                    {slide.subtitle}
                  </motion.h2>

                  {/* Description */}
                  <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="text-white/60 text-lg md:text-xl max-w-lg leading-relaxed mb-10"
                  >
                    {slide.description}
                  </motion.p>

                  {/* CTA Buttons */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="flex flex-wrap gap-4"
                  >
                    <Link
                      href={slide.buttonLink}
                      className="group inline-flex items-center gap-3 px-8 py-4 bg-[#8A6B37] text-white font-medium rounded-none hover:bg-[#A67C3D] transition-all duration-300"
                    >
                      {slide.buttonText}
                      <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                    </Link>
                    {slide.secondaryButton && (
                      <Link
                        href={slide.secondaryLink || "#"}
                        className="inline-flex items-center gap-3 px-8 py-4 border border-white/30 text-white font-medium hover:bg-white/10 transition-all duration-300"
                      >
                        {slide.secondaryButton}
                      </Link>
                    )}
                  </motion.div>
                </motion.div>
              </AnimatePresence>

              {/* Slide Navigation */}
              <div className="flex items-center gap-8 mt-16">
                <div className="flex gap-3">
                  {heroSlides.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => goToSlide(idx)}
                      className={cn(
                        "h-1 transition-all duration-500",
                        idx === current 
                          ? "w-12 bg-[#8A6B37]" 
                          : "w-6 bg-white/20 hover:bg-white/40"
                      )}
                      aria-label={`Slide ${idx + 1}`}
                    />
                  ))}
                </div>
                <span className="text-white/40 text-sm font-medium">
                  {String(current + 1).padStart(2, '0')} / {String(heroSlides.length).padStart(2, '0')}
                </span>
              </div>
            </div>

            {/* Right - Visual Element */}
            <div className="order-1 lg:order-2 flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="relative"
              >
                {/* Main Circle Frame */}
                <div className="relative w-72 h-72 md:w-96 md:h-96 lg:w-[450px] lg:h-[450px]">
                  {/* Outer Ring */}
                  <div className="absolute inset-0 rounded-full border border-[#8A6B37]/20" />
                  
                  {/* Middle Ring */}
                  <div className="absolute inset-4 rounded-full border border-[#8A6B37]/30" />
                  
                  {/* Inner Content */}
                  <div className="absolute inset-8 rounded-full bg-gradient-to-br from-[#8A6B37]/20 to-[#8A6B37]/5 flex items-center justify-center border border-[#8A6B37]/20">
                    <div className="text-center">
                      <div className="w-24 h-24 md:w-32 md:h-32 mx-auto mb-4 rounded-full bg-[#8A6B37]/10 flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="w-12 h-12 md:w-16 md:h-16 text-[#8A6B37]" fill="none" stroke="currentColor" strokeWidth="1">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 6v6l4 2" />
                        </svg>
                      </div>
                      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Handcrafted</p>
                    </div>
                  </div>

                  {/* Floating Badge */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    className="absolute -bottom-4 -right-4 bg-[#8A6B37] text-white px-6 py-3"
                  >
                    <p className="text-xs tracking-wider uppercase">Premium</p>
                    <p className="text-lg font-serif">Quality</p>
                  </motion.div>
                </div>

                {/* Decorative Dots */}
                <div className="absolute -top-4 -left-4 w-3 h-3 rounded-full bg-[#8A6B37]" />
                <div className="absolute -bottom-8 right-1/4 w-2 h-2 rounded-full bg-[#8A6B37]/50" />
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Arrows */}
      <button
        onClick={prevSlide}
        className="absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 z-20 w-14 h-14 border border-white/20 flex items-center justify-center text-white hover:bg-white/10 hover:border-[#8A6B37] transition-all duration-300 group"
        aria-label="Önceki"
      >
        <ChevronLeft className="w-6 h-6 transition-transform group-hover:-translate-x-0.5" />
      </button>
      <button
        onClick={nextSlide}
        className="absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 z-20 w-14 h-14 border border-white/20 flex items-center justify-center text-white hover:bg-white/10 hover:border-[#8A6B37] transition-all duration-300 group"
        aria-label="Sonraki"
      >
        <ChevronRight className="w-6 h-6 transition-transform group-hover:translate-x-0.5" />
      </button>

      {/* Scroll Indicator */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
      >
        <span className="text-white/40 text-xs tracking-widest uppercase">Keşfet</span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-px h-12 bg-gradient-to-b from-[#8A6B37] to-transparent"
        />
      </motion.div>
    </section>
  );
}
