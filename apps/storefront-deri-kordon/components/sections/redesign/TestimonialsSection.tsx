"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Quote, Star, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

const testimonials = [
  {
    id: 1,
    name: "Ahmet Yılmaz",
    title: "Mimar",
    content: "Apple Watch'ıma aldığım deri kayış gerçekten muhteşem. Zamanla rengi daha da güzelleşti ve tam bir karakter kazandı. El işçiliği tartışılmaz.",
    rating: 5,
    location: "İstanbul",
    avatar: "AY",
    color: "#8A6B37",
  },
  {
    id: 2,
    name: "Zeynep Kaya",
    title: "İşletme Sahibi",
    content: "Eşime hediye olarak aldığım monogramlı kordon çok beğenildi. Kişiselleştirme hizmeti ve paketleme harikaydı. Kesinlikle tavsiye ederim.",
    rating: 5,
    location: "Ankara",
    avatar: "ZK",
    color: "#0F1626",
  },
  {
    id: 3,
    name: "Mehmet Demir",
    title: "Grafik Tasarımcı",
    content: "3 yıldır kullanıyorum, ilk günkü gibi sağlam. Deri kalitesi ve dikiş işçiliği gerçekten premium. Artık başka marka kullanmıyorum.",
    rating: 5,
    location: "İzmir",
    avatar: "MD",
    color: "#8A6B37",
  },
  {
    id: 4,
    name: "Selin Yıldız",
    title: "Moda Blogger",
    content: "Koleksiyonumda en çok övgü alan aksesuar. Hem şık hem dayanıklı. Instagram'da paylaştığımda nereden aldığımı çok sordular!",
    rating: 5,
    location: "Antalya",
    avatar: "SY",
    color: "#0F1626",
  },
];

// Progress Ring Component
function ProgressRing({ 
  progress, 
  isPaused 
}: { 
  progress: number; 
  isPaused: boolean;
}) {
  const circumference = 2 * Math.PI * 20;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative w-12 h-12">
      <svg className="transform -rotate-90 w-12 h-12">
        <circle
          cx="24"
          cy="24"
          r="20"
          stroke="#E5E2DE"
          strokeWidth="2"
          fill="transparent"
        />
        <motion.circle
          cx="24"
          cy="24"
          r="20"
          stroke="#8A6B37"
          strokeWidth="2"
          fill="transparent"
          strokeDasharray={circumference}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.1, ease: "linear" }}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {isPaused ? (
          <Play className="w-4 h-4 text-[#8A6B37]" />
        ) : (
          <Pause className="w-4 h-4 text-[#8A6B37]" />
        )}
      </div>
    </div>
  );
}

export function TestimonialsSection() {
  const [current, setCurrent] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [direction, setDirection] = useState(0);

  const AUTO_PLAY_DURATION = 6000; // 6 seconds

  const next = useCallback(() => {
    setDirection(1);
    setCurrent((prev) => (prev + 1) % testimonials.length);
    setProgress(0);
  }, []);

  const prev = useCallback(() => {
    setDirection(-1);
    setCurrent((prev) => (prev - 1 + testimonials.length) % testimonials.length);
    setProgress(0);
  }, []);

  const goTo = useCallback((index: number) => {
    setDirection(index > current ? 1 : -1);
    setCurrent(index);
    setProgress(0);
  }, [current]);

  // Auto-play logic
  useEffect(() => {
    if (!isAutoPlaying) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          next();
          return 0;
        }
        return prev + (100 / (AUTO_PLAY_DURATION / 100));
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isAutoPlaying, next]);

  const currentTestimonial = testimonials[current];

  // Animation variants
  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 100 : -100,
      opacity: 0,
      scale: 0.95,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.6,
        ease: [0.16, 1, 0.3, 1],
      },
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 100 : -100,
      opacity: 0,
      scale: 0.95,
      transition: {
        duration: 0.4,
        ease: [0.16, 1, 0.3, 1],
      },
    }),
  };

  const textVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.1,
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
      },
    }),
  };

  return (
    <section className="py-24 lg:py-32 bg-[#FAFAFA] relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#8A6B37]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#0F1626]/5 rounded-full blur-3xl" />
        
        {/* Large Quote Background */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.02]">
          <Quote className="w-[600px] h-[600px] text-[#0F1626]" />
        </div>
      </div>

      <div className="container-premium relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-16 lg:mb-20"
        >
          <motion.span 
            className="inline-flex items-center gap-3 text-[#8A6B37] text-xs font-medium tracking-[0.3em] uppercase mb-6"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <motion.span 
              className="w-8 h-px bg-[#8A6B37]"
              initial={{ width: 0 }}
              whileInView={{ width: 32 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.4 }}
            />
            Müşteri Yorumları
            <motion.span 
              className="w-8 h-px bg-[#8A6B37]"
              initial={{ width: 0 }}
              whileInView={{ width: 32 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.4 }}
            />
          </motion.span>
          
          <motion.h2 
            className="font-serif text-4xl md:text-5xl lg:text-6xl text-[#0F1626]"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            Hikayelerimiz
          </motion.h2>
        </motion.div>

        {/* Testimonial Slider */}
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            {/* Main Content Card */}
            <div className="bg-white rounded-2xl shadow-xl shadow-[#0F1626]/5 overflow-hidden">
              <div className="grid lg:grid-cols-5 min-h-[400px]">
                {/* Left Side - Visual */}
                <div className="lg:col-span-2 bg-[#0F1626] relative overflow-hidden">
                  {/* Animated Background */}
                  <div 
                    className="absolute inset-0 opacity-20"
                    style={{
                      background: `linear-gradient(135deg, ${currentTestimonial.color}20 0%, transparent 100%)`,
                    }}
                  />
                  
                  {/* Pattern */}
                  <div 
                    className="absolute inset-0 opacity-10"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                    }}
                  />

                  {/* Avatar & Info */}
                  <div className="relative h-full flex flex-col items-center justify-center p-8 text-center">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={current}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        className="relative"
                      >
                        {/* Avatar Circle */}
                        <motion.div 
                          className="w-24 h-24 rounded-full flex items-center justify-center text-white text-2xl font-serif mb-6"
                          style={{ backgroundColor: currentTestimonial.color }}
                          initial={{ rotate: -180 }}
                          animate={{ rotate: 0 }}
                          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                        >
                          {currentTestimonial.avatar}
                        </motion.div>
                        
                        {/* Decorative Ring */}
                        <motion.div
                          className="absolute inset-0 rounded-full border-2 border-white/20"
                          initial={{ scale: 1.2, opacity: 0 }}
                          animate={{ scale: 1.4, opacity: 0 }}
                          transition={{ duration: 1, repeat: Infinity }}
                          style={{ width: 96, height: 96, top: 0, left: 0 }}
                        />
                      </motion.div>
                    </AnimatePresence>

                    <motion.h4 
                      className="text-white font-serif text-xl mb-1"
                      key={`name-${current}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      {currentTestimonial.name}
                    </motion.h4>
                    <motion.p 
                      className="text-white/60 text-sm mb-2"
                      key={`title-${current}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      {currentTestimonial.title}
                    </motion.p>
                    <motion.span 
                      className="text-[#8A6B37] text-xs uppercase tracking-wider"
                      key={`loc-${current}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      {currentTestimonial.location}
                    </motion.span>
                  </div>
                </div>

                {/* Right Side - Content */}
                <div className="lg:col-span-3 p-8 lg:p-12 flex flex-col justify-center relative">
                  {/* Quote Icon */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3, type: "spring", stiffness: 400 }}
                    className="absolute top-8 right-8"
                  >
                    <Quote className="w-12 h-12 text-[#8A6B37]/20" />
                  </motion.div>

                  <AnimatePresence mode="wait" custom={direction}>
                    <motion.div
                      key={current}
                      custom={direction}
                      variants={slideVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      className="relative"
                    >
                      {/* Rating */}
                      <motion.div 
                        className="flex items-center gap-1 mb-8"
                        custom={0}
                        variants={textVariants}
                        initial="hidden"
                        animate="visible"
                      >
                        {[...Array(testimonials[current].rating)].map((_, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.1 + i * 0.05, type: "spring", stiffness: 400 }}
                          >
                            <Star className="w-5 h-5 fill-[#8A6B37] text-[#8A6B37]" />
                          </motion.div>
                        ))}
                        <span className="ml-2 text-sm text-[#0F1626]/50">
                          {testimonials[current].rating}.0
                        </span>
                      </motion.div>

                      {/* Quote */}
                      <motion.blockquote 
                        className="font-serif text-2xl md:text-3xl text-[#0F1626] leading-relaxed mb-8"
                        custom={1}
                        variants={textVariants}
                        initial="hidden"
                        animate="visible"
                      >
                        "{testimonials[current].content}"
                      </motion.blockquote>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8">
              {/* Progress Indicators */}
              <div className="flex items-center gap-3">
                {testimonials.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => goTo(idx)}
                    className="group relative"
                    aria-label={`Yorum ${idx + 1}`}
                  >
                    <div className={cn(
                      "h-2 rounded-full transition-all duration-500",
                      idx === current 
                        ? "w-10 bg-[#8A6B37]" 
                        : "w-2 bg-[#E5E2DE] group-hover:bg-[#8A6B37]/50"
                    )} />
                    {idx === current && isAutoPlaying && (
                      <motion.div
                        className="absolute inset-0 bg-[#0F1626] rounded-full origin-left"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: progress / 100 }}
                        transition={{ duration: 0.1, ease: "linear" }}
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Controls */}
              <div className="flex items-center gap-3">
                {/* Play/Pause */}
                <motion.button
                  onClick={() => setIsAutoPlaying(!isAutoPlaying)}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-12 h-12 rounded-full border border-[#E5E2DE] flex items-center justify-center text-[#0F1626] hover:border-[#8A6B37] hover:text-[#8A6B37] transition-colors"
                  aria-label={isAutoPlaying ? "Durdur" : "Oynat"}
                >
                  {isAutoPlaying ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5" />
                  )}
                </motion.button>

                {/* Prev/Next */}
                <div className="flex items-center gap-2">
                  <motion.button
                    onClick={prev}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="w-12 h-12 rounded-full border border-[#E5E2DE] flex items-center justify-center text-[#0F1626] hover:bg-[#0F1626] hover:text-white hover:border-[#0F1626] transition-all"
                    aria-label="Önceki"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </motion.button>
                  <motion.button
                    onClick={next}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="w-12 h-12 rounded-full border border-[#E5E2DE] flex items-center justify-center text-[#0F1626] hover:bg-[#0F1626] hover:text-white hover:border-[#0F1626] transition-all"
                    aria-label="Sonraki"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </motion.button>
                </div>
              </div>
            </div>

            {/* Testimonial Counter */}
            <div className="mt-6 text-center">
              <span className="text-sm text-[#0F1626]/40">
                <span className="text-[#8A6B37] font-medium">{String(current + 1).padStart(2, '0')}</span>
                {" / "}
                {String(testimonials.length).padStart(2, '0')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
