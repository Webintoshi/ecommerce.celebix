"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { CategoryInfo } from "@/types/product";
import { fetchCategories } from "@/lib/categories";
import { ArrowRight, ArrowUpRight } from "lucide-react";

interface ShopByCategoryProps {
  initialCategories?: CategoryInfo[];
}

export default function ShopByCategory({ initialCategories = [] }: ShopByCategoryProps) {
  const [categories, setCategories] = useState<CategoryInfo[]>(initialCategories);
  const [loading, setLoading] = useState(!initialCategories.length);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);

  const handleImageError = (categoryId: string) => {
    setImageErrors(prev => ({ ...prev, [categoryId]: true }));
  };

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (initialCategories.length > 0) {
      setCategories(initialCategories);
      setLoading(false);
      return;
    }

    async function loadCategories() {
      try {
        const data = await fetchCategories();
        if (data && data.length > 0) {
          setCategories(data);
        }
      } catch (error) {
        console.error("Error loading categories:", error);
      } finally {
        setLoading(false);
      }
    }
    loadCategories();
  }, [initialCategories]);

  // Scroll tracking for mobile indicator
  const handleScroll = useCallback(() => {
    if (scrollRef.current && isMobile) {
      const scrollLeft = scrollRef.current.scrollLeft;
      const cardWidth = scrollRef.current.offsetWidth * 0.85;
      const gap = 12;
      const newIndex = Math.round(scrollLeft / (cardWidth + gap));
      setCurrentIndex(Math.min(newIndex, categories.length - 1));
    }
  }, [categories.length, isMobile]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentIndex < categories.length - 1) {
        scrollToIndex(currentIndex + 1);
      } else if (diff < 0 && currentIndex > 0) {
        scrollToIndex(currentIndex - 1);
      }
    }
  };

  const scrollToIndex = (index: number) => {
    if (scrollRef.current) {
      const cardWidth = scrollRef.current.offsetWidth * 0.85;
      const gap = 12;
      scrollRef.current.scrollTo({
        left: index * (cardWidth + gap),
        behavior: 'smooth'
      });
    }
  };

  if (loading) {
    return (
      <section className="py-16 md:py-24 bg-[#FFF5F5]" id="shop-by-category">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header Skeleton */}
          <div className="text-center mb-10 md:mb-14">
            <div className="h-6 w-32 bg-[#F3E0E1] rounded-full mx-auto mb-4 animate-pulse" />
            <div className="h-10 w-56 bg-[#F3E0E1] rounded-lg mx-auto mb-3 animate-pulse" />
            <div className="h-5 w-72 bg-[#F3E0E1] rounded mx-auto animate-pulse" />
          </div>
          {/* Cards Skeleton */}
          <div className="flex md:grid md:grid-cols-3 gap-4 md:gap-6 justify-center">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex-shrink-0 w-[280px] md:w-auto">
                <div className="aspect-[4/5] bg-[#F3E0E1] rounded-2xl md:rounded-3xl animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (categories.length === 0) {
    return null;
  }

  return (
    <section 
      className="py-16 md:py-24 bg-[#FFF5F5] overflow-hidden" 
      id="shop-by-category"
      aria-labelledby="category-heading"
    >
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header - Premium Editorial Style */}
        <div className="text-center mb-10 md:mb-14 opacity-0 animate-[fadeIn_0.6s_ease-out_forwards]">
          {/* Eyebrow Badge */}
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#7B1113]/10 text-[#7B1113] text-sm font-medium mb-4 border border-[#7B1113]/20">
            <span className="w-2 h-2 rounded-full bg-[#7B1113]" />
            Koleksiyonlar
          </span>
          
          {/* Main Title */}
          <h2 
            id="category-heading" 
            className="text-3xl md:text-5xl font-bold text-[#7B1113] mb-4 tracking-tight"
          >
            Kategoriye Göz At
          </h2>
          
          {/* Subtitle */}
          <p className="text-[#6b4b4c] text-base md:text-lg max-w-lg mx-auto">
            Doğal lezzetleri keşfedin, size özel seçkilerimizi inceleyin
          </p>
        </div>

        {/* Cards Container */}
        <div className="relative">
          {/* Mobile: Horizontal Scroll | Desktop: Premium Grid */}
          <div 
            ref={scrollRef}
            onScroll={handleScroll}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="flex md:grid md:grid-cols-3 gap-4 md:gap-6 lg:gap-8 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 pb-4"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {categories.map((cat, index) => (
              <div
                key={cat.id}
                className="flex-shrink-0 w-[280px] sm:w-[320px] md:w-auto snap-center opacity-0 animate-[fadeIn_0.5s_ease-out_forwards]"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <Link
                  href={`/koleksiyon/${cat.slug}`}
                  className="group block relative"
                  aria-label={`${cat.name} kategorisini incele`}
                >
                  {/* Card Container with 4:5 Aspect Ratio */}
                  <div className="relative aspect-[4/5] rounded-2xl md:rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 bg-[#7B1113]">
                    {/* Gradient Border on Hover */}
                    <div className="absolute -inset-[2px] rounded-2xl md:rounded-3xl bg-gradient-to-r from-[#7B1113] via-[#F3E0E1] to-[#7B1113] opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm" />
                    
                    {/* Main Card */}
                    <div className="relative w-full h-full rounded-2xl md:rounded-3xl overflow-hidden">
                      {/* Background Image */}
                      <Image
                        src={imageErrors[cat.id] ? "/placeholder.svg" : (cat.image || "/placeholder.svg")}
                        alt={cat.name}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-110"
                        sizes="(max-width: 768px) 320px, (max-width: 1200px) 33vw, 400px"
                        onError={() => handleImageError(cat.id)}
                      />
                      
                      {/* Gradient Overlay - Bottom to Top */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      
                      {/* Top Badge - Product Count */}
                      {cat.productCount !== undefined && cat.productCount > 0 && (
                        <div className="absolute top-4 left-4">
                          <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-semibold border border-white/30">
                            {cat.productCount} ürün
                          </span>
                        </div>
                      )}

                      {/* Top Right - Arrow Icon (Glassmorphism) */}
                      <div className="absolute top-4 right-4">
                        <span className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20 backdrop-blur-md text-white border border-white/30 transform transition-all duration-300 group-hover:scale-110 group-hover:bg-white group-hover:text-[#7B1113]">
                          <ArrowUpRight size={20} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </span>
                      </div>

                      {/* Bottom Content */}
                      <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
                        <div className="transform transition-transform duration-500 group-hover:translate-y-[-4px]">
                          {/* Category Name */}
                          <h3 className="text-xl md:text-2xl font-bold text-white mb-2 leading-tight">
                            {cat.name}
                          </h3>
                          
                          {/* Description */}
                          {cat.description && (
                            <p className="text-sm text-white/80 line-clamp-2 mb-4">
                              {cat.description}
                            </p>
                          )}
                          
                          {/* CTA Button - Glassmorphism */}
                          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur-md text-white text-sm font-medium border border-white/30 transition-all duration-300 group-hover:bg-white group-hover:text-[#7B1113] group-hover:gap-3">
                            Koleksiyonu Gör
                            <ArrowRight size={16} />
                          </span>
                        </div>
                      </div>

                      {/* Shine Effect on Hover */}
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none">
                        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>

          {/* Mobile Scroll Indicator - Working */}
          <div className="flex md:hidden items-center justify-center gap-2 mt-6">
            {categories.map((_, idx) => (
              <button
                key={idx}
                onClick={() => scrollToIndex(idx)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  idx === currentIndex 
                    ? 'w-8 bg-[#7B1113]' 
                    : 'w-2 bg-[#7B1113]/30 hover:bg-[#7B1113]/50'
                }`}
                aria-label={`Kategori ${idx + 1}'e git`}
              />
            ))}
          </div>
        </div>

        {/* View All Link */}
        <div className="text-center mt-12 opacity-0 animate-[fadeIn_0.6s_ease-out_forwards]" style={{ animationDelay: '0.4s' }}>
          <Link
            href="/koleksiyon"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white text-[#7B1113] font-semibold border border-[#7B1113]/20 shadow-lg hover:shadow-xl hover:bg-[#7B1113] hover:text-white hover:border-[#7B1113] transition-all duration-300 group"
          >
            Tüm Kategorileri Keşfet
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>

      {/* Custom Styles */}
      <style jsx>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </section>
  );
}
