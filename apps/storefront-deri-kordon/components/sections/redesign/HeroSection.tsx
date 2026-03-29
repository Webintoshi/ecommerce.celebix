"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Watch } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";

interface HeroSlide {
  id: number;
  title: string;
  subtitle: string;
  buttonText: string;
  buttonLink: string;
}

// Default slides without images
const defaultSlides: HeroSlide[] = [
  {
    id: 1,
    title: "El Yapımı Deri Kordon",
    subtitle: "Her dikişte bir hikaye, her üründe bir tutku. %100 el yapımı hakiki deri kordonlar.",
    buttonText: "Koleksiyonu Keşfet",
    buttonLink: ROUTES.products,
  },
  {
    id: 2,
    title: "Apple Watch Deri Kayış",
    subtitle: "Saatinize değer katan, zamanla güzelleşen özel tasarım deri kayışlar.",
    buttonText: "Kayışları İncele",
    buttonLink: "/koleksiyon/apple-watch",
  },
  {
    id: 3,
    title: "Kişiselleştir",
    subtitle: "Adınıza özel, monogramlı deri ürünler. Eşsiz bir hediye deneyimi.",
    buttonText: "Özel Tasarım Yaptır",
    buttonLink: "/koleksiyon/ozel-tasarim",
  },
];

export function HeroSection() {
  const [current, setCurrent] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  // Auto-advance slides
  useEffect(() => {
    const interval = setInterval(() => {
      setDirection(1);
      setCurrent((prev) => (prev + 1) % defaultSlides.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const goToSlide = useCallback((index: number) => {
    setDirection(index > current ? 1 : -1);
    setCurrent(index);
  }, [current]);

  const nextSlide = useCallback(() => {
    setDirection(1);
    setCurrent((prev) => (prev + 1) % defaultSlides.length);
  }, []);

  const prevSlide = useCallback(() => {
    setDirection(-1);
    setCurrent((prev) => (prev - 1 + defaultSlides.length) % defaultSlides.length);
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

  const slide = defaultSlides[current];

  return (
    <section className="relative w-full overflow-hidden bg-[#0F1626]">
      {/* Main Hero Container */}
      <div className="relative w-full min-h-[500px] md:min-h-[600px] lg:min-h-[700px] flex items-center">
        
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>

        {/* Decorative Elements */}
        <div className="absolute top-20 left-10 w-32 h-32 border border-[#8A6B37]/20 rounded-full hidden lg:block" />
        <div className="absolute bottom-20 right-10 w-48 h-48 border border-[#8A6B37]/10 rounded-full hidden lg:block" />
        <div className="absolute top-1/2 right-1/4 w-2 h-2 bg-[#8A6B37] rounded-full hidden lg:block" />

        {/* Content */}
        <div className="container-premium relative z-10 py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            
            {/* Left Side - Text Content */}
            <div>
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={current}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    x: { type: "tween", duration: 0.4, ease: [0.4, 0, 0.2, 1] },
                    opacity: { duration: 0.3 },
                  }}
                >
                  {/* Badge */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#8A6B37]/20 rounded-full text-[#8A6B37] text-xs font-medium tracking-widest uppercase mb-6"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#8A6B37] animate-pulse" />
                    %100 El Yapımı
                  </motion.div>

                  {/* Main Title */}
                  <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold text-white leading-[1.1] mb-6"
                  >
                    {slide.title}
                  </motion.h1>

                  {/* Subtitle */}
                  <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="text-white/70 text-lg md:text-xl mb-8 max-w-lg leading-relaxed"
                  >
                    {slide.subtitle}
                  </motion.p>

                  {/* CTA Button */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="flex flex-wrap gap-4"
                  >
                    <Link
                      href={slide.buttonLink}
                      className="inline-flex items-center gap-3 px-8 py-4 bg-[#8A6B37] text-white font-medium rounded-lg hover:bg-[#8A6B37]/90 transition-all hover:gap-4 group"
                    >
                      {slide.buttonText}
                      <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                    </Link>
                    <Link
                      href="/hakkimizda"
                      className="inline-flex items-center gap-3 px-8 py-4 border border-white/30 text-white font-medium rounded-lg hover:bg-white/10 transition-all"
                    >
                      Hakkımızda
                    </Link>
                  </motion.div>
                </motion.div>
              </AnimatePresence>

              {/* Dots Navigation */}
              <div className="flex gap-2 mt-10">
                {defaultSlides.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => goToSlide(idx)}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      idx === current 
                        ? "w-8 bg-[#8A6B37]" 
                        : "w-1.5 bg-white/30 hover:bg-white/50"
                    )}
                    aria-label={`Slide ${idx + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* Right Side - Large Icon Placeholder */}
            <div className="hidden lg:flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="relative"
              >
                {/* Main Icon Circle */}
                <div className="w-80 h-80 rounded-full bg-[#8A6B37]/10 flex items-center justify-center border border-[#8A6B37]/20">
                  <div className="w-60 h-60 rounded-full bg-[#8A6B37]/20 flex items-center justify-center">
                    <Watch className="w-32 h-32 text-[#8A6B37]" />
                  </div>
                </div>
                
                {/* Floating Badge */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="absolute -bottom-4 -right-4 bg-[#8A6B37] text-white px-6 py-3 rounded-xl font-medium"
                >
                  Est. 2018
                </motion.div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Navigation Arrows */}
        <button
          onClick={prevSlide}
          className="absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          aria-label="Önceki slide"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button
          onClick={nextSlide}
          className="absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          aria-label="Sonraki slide"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </section>
  );
}
