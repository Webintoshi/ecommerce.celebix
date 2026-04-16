"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { CategoryInfo } from "@/types/product";
import { fetchCategories } from "@/lib/categories";
import { ROUTES } from "@/lib/constants";
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
        <div className="h-6 w-32 bg-[#E8EDF2] rounded-full mx-auto mb-4 animate-pulse" />
        <div className="h-10 w-56 bg-[#E8EDF2] rounded-lg mx-auto mb-3 animate-pulse" />
        <div className="h-5 w-72 bg-[#E8EDF2] rounded mx-auto animate-pulse" />
          </div>
          {/* Cards Skeleton */}
          <div className="flex md:grid md:grid-cols-3 gap-4 md:gap-6 justify-center">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex-shrink-0 w-[280px] md:w-auto">
                <div className="aspect-[4/5] bg-[#E8EDF2] rounded-2xl md:rounded-3xl animate-pulse" />
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
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#DA630D]/20 bg-[#DA630D]/10 px-4 py-2 text-sm font-medium text-[#DA630D]">
              <span className="h-2 w-2 rounded-full bg-[#DA630D]" />
            Koleksiyonlar
          </span>
          
          {/* Main Title */}
          <h2 
            id="category-heading" 
              className="mb-4 text-3xl font-bold tracking-tight text-[#505E71] md:text-5xl"
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
                  href={ROUTES.category(cat.slug)}
                  className="group block relative"
                  aria-label={`${cat.name} kategorisini incele`}
                >
                  {/* Card Container with 4:5 Aspect Ratio */}
                  <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-[#505E71] shadow-lg transition-all duration-500 hover:shadow-2xl md:rounded-3xl">
                    {/* Gradient Border on Hover */}
                    <div className="absolute -inset-[2px] rounded-2xl bg-gradient-to-r from-[#505E71] via-[#E8EDF2] to-[#DA630D] opacity-0 blur-sm transition-opacity duration-500 group-hover:opacity-100 md:rounded-3xl" />
                    
                    {/* Main Card */}
                    <div className="relative w-full h-full rounded-2xl md:rounded-3xl overflow-hidden">
                      {/* Background Image */}
                      {cat.image && !imageErrors[cat.id] ? (
                        <Image
                          src={cat.image}
                          alt={cat.name}
                          fill
                          className="object-cover transition-transform duration-700 group-hover:scale-110"
                          sizes="(max-width: 768px) 320px, (max-width: 1200px) 33vw, 400px"
                          onError={() => handleImageError(cat.id)}
                        />
                      ) : (
                          <div className="absolute inset-0 bg-[#E8EDF2]" aria-hidden="true" />
                      )}
                      
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
                        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/20 text-white backdrop-blur-md transition-all duration-300 transform group-hover:scale-110 group-hover:bg-white group-hover:text-[#DA630D]">
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
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-md transition-all duration-300 group-hover:gap-3 group-hover:bg-white group-hover:text-[#DA630D]">
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
                          ? 'w-8 bg-[#DA630D]'
                          : 'w-2 bg-[#DA630D]/30 hover:bg-[#DA630D]/50'
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
            className="group inline-flex items-center gap-2 rounded-full border border-[#DA630D]/20 bg-white px-8 py-4 font-semibold text-[#DA630D] shadow-lg transition-all duration-300 hover:border-[#DA630D] hover:bg-[#DA630D] hover:text-white hover:shadow-xl"
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
