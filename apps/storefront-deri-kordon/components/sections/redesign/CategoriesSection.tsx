"use client";

import Link from "next/link";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import type { CategoryInfo } from "@/types/product";
import { useRef, useState } from "react";

interface CategoryCard {
  id: string | number;
  name: string;
  subtitle: string;
  description: string;
  link: string;
  image?: string;
  size?: "large" | "medium" | "small";
}

const fallbackCategories: CategoryCard[] = [
  {
    id: 1,
    name: "Apple Watch",
    subtitle: "Deri Kayışlar",
    description: "Zamana meydan okuyan şıklık",
    image: "/hero-banner-fistik-ezmeleri.jpg",
    link: "/kategori/apple-watch-kayislari",
    size: "large",
  },
  {
    id: 2,
    name: "Klasik Saat",
    subtitle: "Kordonları",
    description: "Geleneksel el işçiliği",
    image: "/hero-banner-super-gidalar-mobile.jpg",
    link: "/kategori/klasik-saat-kordonlari",
    size: "medium",
  },
  {
    id: 3,
    name: "Kişiselleştir",
    subtitle: "Özel Tasarım",
    description: "Kendi hikayeni yaz",
    image: "/Findik_Ezmeleri_Kategorisi.webp",
    link: "/koleksiyon/kisisellestir",
    size: "medium",
  },
  {
    id: 4,
    name: "Hediye",
    subtitle: "Setleri",
    description: "Anlamlı jestler",
    image: "/fistik_ezmesi_kategori_gorsel.webp",
    link: "/koleksiyon/hediye-setleri",
    size: "small",
  },
];

interface CategoriesSectionProps {
  initialCategories?: CategoryInfo[];
}

// 3D Tilt Card Component
function TiltCard({ 
  children, 
  className,
  intensity = 10
}: { 
  children: React.ReactNode; 
  className?: string;
  intensity?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const springConfig = { stiffness: 150, damping: 20 };
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [intensity, -intensity]), springConfig);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-intensity, intensity]), springConfig);
  const scale = useSpring(isHovered ? 1.02 : 1, springConfig);
  
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set((e.clientX - centerX) / rect.width);
    y.set((e.clientY - centerY) / rect.height);
  };
  
  const handleMouseLeave = () => {
    setIsHovered(false);
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{
        rotateX: isHovered ? rotateX : 0,
        rotateY: isHovered ? rotateY : 0,
        scale,
        transformStyle: "preserve-3d",
        perspective: 1000,
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      
      {/* Grain texture overlay on hover */}
      <motion.div
        className="absolute inset-0 pointer-events-none opacity-0 mix-blend-overlay"
        animate={{ opacity: isHovered ? 0.03 : 0 }}
        transition={{ duration: 0.3 }}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
    </motion.div>
  );
}

// Animated counter for stats
function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="font-serif text-4xl md:text-5xl text-[#8A6B37]"
    >
      {value}{suffix}
    </motion.span>
  );
}

export function CategoriesSection({ initialCategories = [] }: CategoriesSectionProps) {
  const normalizedCategories: CategoryCard[] =
    initialCategories.length > 0
      ? initialCategories.map((category) => ({
          id: category.id,
          name: category.name,
          subtitle: category.productCount > 0 ? `${category.productCount} Ürün` : "Koleksiyon",
          description:
            category.description?.trim() ||
            "Bu koleksiyon admin panelinden güncellenen kategori verilerini kullanır.",
          link: ROUTES.category(category.slug),
        }))
      : [];

  const displayCategories = [...normalizedCategories, ...fallbackCategories].slice(0, 4);

  // Container animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
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

  return (
    <section className="bg-[#FAFAFA] py-24 lg:py-32 relative overflow-hidden">
      {/* Background ambient gradient */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#8A6B37]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#0F1626]/5 rounded-full blur-3xl" />
      </div>

      <div className="container-premium relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="mb-16 text-center lg:mb-24"
        >
          <motion.span 
            className="mb-6 inline-flex items-center gap-3 text-xs font-medium uppercase tracking-[0.3em] text-[#8A6B37]"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <motion.span 
              className="h-px w-8 bg-[#8A6B37]"
              initial={{ width: 0 }}
              whileInView={{ width: 32 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.4 }}
            />
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Kategoriler
              <Sparkles className="w-4 h-4" />
            </span>
            <motion.span 
              className="h-px w-8 bg-[#8A6B37]"
              initial={{ width: 0 }}
              whileInView={{ width: 32 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.4 }}
            />
          </motion.span>
          
          <motion.h2 
            className="mb-6 font-serif text-4xl text-[#0F1626] md:text-5xl lg:text-6xl"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            Koleksiyonlarımız
          </motion.h2>
          
          <motion.p 
            className="mx-auto max-w-2xl text-lg text-[#0F1626]/60"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            Her biri özenle seçilmiş deri ürünlerimiz arasından kendi tarzına uygun olanı bul.
          </motion.p>
        </motion.div>

        {/* Bento Grid */}
        <motion.div 
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12 lg:gap-6"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {/* Large Card - Featured */}
          <motion.div variants={itemVariants} className="lg:col-span-7 lg:row-span-2">
            <TiltCard intensity={5} className="h-full">
              <Link
                href={displayCategories[0].link}
                className="group relative block h-full min-h-[400px] overflow-hidden bg-[#0F1626] lg:min-h-[600px]"
              >
                {/* Animated background gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#1A2332] via-[#0F1626] to-[#1A2332] animate-gradient-shift" />
                
                {/* Pattern overlay */}
                <div
                  className="absolute inset-0 opacity-10"
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%238A6B37' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
                  }}
                />

                {/* Shine effect on hover */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12"
                  initial={{ x: "-200%" }}
                  whileHover={{ x: "200%" }}
                  transition={{ duration: 1 }}
                />

                <div className="absolute inset-0 flex flex-col justify-between p-8 lg:p-12">
                  <div>
                    <motion.span 
                      className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[#8A6B37]"
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.5 }}
                    >
                      <span className="w-6 h-px bg-[#8A6B37]" />
                      Öne Çıkan
                    </motion.span>
                  </div>

                  <div>
                    <motion.h3 
                      className="mb-2 font-serif text-4xl text-white lg:text-5xl xl:text-6xl"
                      initial={{ opacity: 0, y: 30 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.6 }}
                    >
                      {displayCategories[0].name}
                    </motion.h3>
                    <motion.p 
                      className="mb-4 text-xl text-[#8A6B37] lg:text-2xl"
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.7 }}
                    >
                      {displayCategories[0].subtitle}
                    </motion.p>
                    <motion.p 
                      className="mb-8 max-w-sm text-white/60"
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.8 }}
                    >
                      {displayCategories[0].description}
                    </motion.p>

                    <motion.span 
                      className="inline-flex items-center gap-2 text-white transition-colors duration-300 group-hover:text-[#8A6B37]"
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.9 }}
                    >
                      <span className="text-sm uppercase tracking-wider">Keşfet</span>
                      <motion.span
                        initial={{ x: 0, y: 0 }}
                        whileHover={{ x: 4, y: -4 }}
                        transition={{ type: "spring", stiffness: 400 }}
                      >
                        <ArrowUpRight className="h-5 w-5" />
                      </motion.span>
                    </motion.span>
                  </div>
                </div>

                {/* Border reveal on hover */}
                <motion.div 
                  className="absolute inset-0 border-2 border-transparent"
                  whileHover={{ borderColor: "rgba(138, 107, 55, 0.3)" }}
                  transition={{ duration: 0.3 }}
                />
                
                {/* Corner accent */}
                <div className="absolute top-0 right-0 w-24 h-24 overflow-hidden">
                  <div className="absolute top-0 right-0 w-full h-full bg-[#8A6B37]/10 transform rotate-45 translate-x-12 -translate-y-12" />
                </div>
              </Link>
            </TiltCard>
          </motion.div>

          {/* Medium Cards */}
          {displayCategories.slice(1, 3).map((category, index) => (
            <motion.div 
              key={category.id} 
              variants={itemVariants}
              className="lg:col-span-5"
            >
              <TiltCard intensity={8}>
                <Link
                  href={category.link}
                  className="group relative block h-full min-h-[280px] overflow-hidden border border-[#E5E2DE] bg-white transition-all duration-500 hover:border-[#8A6B37]/30"
                >
                  {/* Background pattern */}
                  <div 
                    className="absolute inset-0 opacity-[0.02]"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%230F1626' fill-opacity='1' fill-rule='evenodd'%3E%3Ccircle cx='3' cy='3' r='1'/%3E%3Ccircle cx='13' cy='13' r='1'/%3E%3C/g%3E%3C/svg%3E")`,
                    }}
                  />

                  <div className="absolute inset-0 flex flex-col justify-between p-8">
                    <div className="flex items-start justify-between">
                      <motion.span 
                        className="text-xs uppercase tracking-[0.3em] text-[#8A6B37]"
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 + index * 0.1 }}
                      >
                        0{index + 2}
                      </motion.span>
                      <motion.div 
                        className="flex h-12 w-12 items-center justify-center rounded-full border border-[#E5E2DE] transition-all duration-300 group-hover:border-[#8A6B37] group-hover:bg-[#8A6B37]"
                        whileHover={{ scale: 1.1, rotate: 45 }}
                        transition={{ type: "spring", stiffness: 400 }}
                      >
                        <ArrowUpRight className="h-5 w-5 text-[#0F1626] transition-colors group-hover:text-white" />
                      </motion.div>
                    </div>

                    <div>
                      <motion.h3 
                        className="mb-1 font-serif text-2xl text-[#0F1626] lg:text-3xl group-hover:text-[#8A6B37] transition-colors duration-300"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.4 + index * 0.1 }}
                      >
                        {category.name}
                      </motion.h3>
                      <motion.p 
                        className="mb-2 text-lg text-[#8A6B37]"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.5 + index * 0.1 }}
                      >
                        {category.subtitle}
                      </motion.p>
                      <motion.p 
                        className="text-sm text-[#0F1626]/50"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.6 + index * 0.1 }}
                      >
                        {category.description}
                      </motion.p>
                    </div>
                  </div>

                  {/* Progress bar on hover */}
                  <motion.div 
                    className="absolute bottom-0 left-0 h-1 bg-[#8A6B37]"
                    initial={{ width: "0%" }}
                    whileHover={{ width: "100%" }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  />
                </Link>
              </TiltCard>
            </motion.div>
          ))}

          {/* Wide Card - Bottom */}
          <motion.div variants={itemVariants} className="lg:col-span-12">
            <TiltCard intensity={4}>
              <Link
                href={displayCategories[3].link}
                className="group relative block overflow-hidden bg-[#0F1626]"
              >
                {/* Animated gradient background */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#0F1626] via-[#1A2332] to-[#0F1626] animate-gradient-shift" />
                
                <div className="grid lg:grid-cols-2">
                  <div className="flex flex-col justify-center p-8 lg:p-12 relative z-10">
                    <motion.span 
                      className="mb-4 text-xs uppercase tracking-[0.3em] text-[#8A6B37]"
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 }}
                    >
                      Özel
                    </motion.span>
                    <motion.h3 
                      className="mb-2 font-serif text-3xl text-white lg:text-4xl"
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.4 }}
                    >
                      {displayCategories[3].name}
                    </motion.h3>
                    <motion.p 
                      className="mb-4 text-xl text-[#8A6B37]"
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.5 }}
                    >
                      {displayCategories[3].subtitle}
                    </motion.p>
                    <motion.p 
                      className="mb-6 text-white/60"
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.6 }}
                    >
                      {displayCategories[3].description}
                    </motion.p>
                    <motion.span 
                      className="inline-flex items-center gap-2 text-white transition-colors duration-300 group-hover:text-[#8A6B37]"
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.7 }}
                    >
                      <span className="text-sm uppercase tracking-wider">İncele</span>
                      <motion.span
                        whileHover={{ x: 4, y: -4 }}
                        transition={{ type: "spring", stiffness: 400 }}
                      >
                        <ArrowUpRight className="h-5 w-5" />
                      </motion.span>
                    </motion.span>
                  </div>
                  
                  {/* Visual Element */}
                  <div className="relative hidden lg:block min-h-[280px]">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <motion.div 
                        className="relative"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
                      >
                        <div className="flex h-40 w-40 items-center justify-center rounded-full border border-[#8A6B37]/20">
                          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[#8A6B37]/10">
                            <motion.div
                              animate={{ scale: [1, 1.1, 1] }}
                              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                className="h-14 w-14 text-[#8A6B37]"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1"
                              >
                                <rect x="3" y="8" width="18" height="4" rx="1" />
                                <rect x="5" y="5" width="14" height="3" rx="1" />
                                <rect x="5" y="12" width="14" height="3" rx="1" />
                                <path d="M8 17v2M16 17v2" />
                              </svg>
                            </motion.div>
                          </div>
                        </div>
                      </motion.div>
                      
                      {/* Orbiting dots */}
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="absolute w-2 h-2 bg-[#8A6B37]/40 rounded-full"
                          animate={{
                            rotate: 360,
                          }}
                          transition={{
                            duration: 8 + i * 2,
                            repeat: Infinity,
                            ease: "linear",
                            delay: i * 2,
                          }}
                          style={{
                            originX: 0,
                            originY: 0,
                            left: "50%",
                            top: "50%",
                            marginLeft: 60 + i * 20,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom border animation */}
                <motion.div
                  className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-[#8A6B37] via-[#A67C3D] to-[#8A6B37]"
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: 0.5 }}
                />
              </Link>
            </TiltCard>
          </motion.div>
        </motion.div>

        {/* Stats Section */}
        <motion.div 
          className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          {[
            { value: "50+", label: "Ürün Çeşidi" },
            { value: "10K+", label: "Mutlu Müşteri" },
            { value: "5", label: "Yıllık Deneyim" },
            { value: "100", label: "El Yapımı" },
          ].map((stat, index) => (
            <motion.div 
              key={stat.label}
              className="text-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 + index * 0.1 }}
            >
              <div className="font-serif text-3xl md:text-4xl text-[#8A6B37] mb-2">
                {stat.value}
              </div>
              <div className="text-sm text-[#0F1626]/60 uppercase tracking-wider">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
