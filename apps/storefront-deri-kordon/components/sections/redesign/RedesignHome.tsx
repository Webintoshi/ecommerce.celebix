"use client";

import { useState, useEffect } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import { HeroSection } from "./HeroSection";
import { CategoriesSection } from "./CategoriesSection";
import { BestSellersSection } from "./BestSellersSection";
import { TestimonialsSection } from "./TestimonialsSection";
import { NewsletterSection } from "./NewsletterSection";

interface HeroBannerData {
  id: number;
  image: string;
  mobileImage?: string;
  alt?: string;
}

interface HomepageData {
  heroBanners: HeroBannerData[];
  categories: unknown[];
  products: unknown[];
  promoBanners: unknown[];
}

export default function RedesignHome() {
  const [data, setData] = useState<HomepageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHomepageData() {
      try {
        const supabase = getBrowserSupabaseClient();

        const [
          { data: heroData },
          { data: categoriesData },
          { data: productsData },
          { data: promoData }
        ] = await Promise.all([
          supabase.from("settings").select("value").eq("key", "hero_banners").single(),
          supabase.from("categories").select("*").eq("is_active", true).order("sort_order", { ascending: true }).limit(6),
          supabase.from("products").select("*, variants:product_variants(*)").eq("is_active", true).eq("status", "published").limit(8),
          supabase.from("settings").select("value").eq("key", "promo_banners").single()
        ]);

        // Transform hero banners from admin format
        const heroSlides: HeroBannerData[] = heroData?.value?.slides?.map((slide: unknown, index: number) => ({
          id: index + 1,
          image: slide?.image || slide?.desktopImage || slide?.url || "/images/hero/banner-1.jpg",
          mobileImage: slide?.mobileImage || slide?.image,
          alt: slide?.alt || slide?.title || "Hero Banner",
        })) || [];

        setData({
          heroBanners: heroSlides,
          categories: categoriesData || [],
          products: productsData || [],
          promoBanners: promoData?.value?.banners || []
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchHomepageData();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F8F8F8]">
        {/* Hero Skeleton */}
        <div className="w-full h-[70vh] min-h-[500px] bg-[#0F1626] animate-pulse" />
        
        {/* Categories Skeleton */}
        <section className="py-24 lg:py-32 bg-[#FAFAFA]">
          <div className="container-premium">
            <div className="text-center mb-16">
              <div className="h-4 w-24 bg-[#E5E2DE] rounded-full mx-auto mb-4" />
              <div className="h-12 w-64 bg-[#E5E2DE] rounded-lg mx-auto" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 lg:gap-6">
              <div className="lg:col-span-7 lg:row-span-2 aspect-[4/5] bg-[#E5E2DE] rounded-lg animate-pulse" />
              <div className="lg:col-span-5 h-64 bg-[#E5E2DE] rounded-lg animate-pulse" />
              <div className="lg:col-span-5 h-64 bg-[#E5E2DE] rounded-lg animate-pulse" />
              <div className="lg:col-span-12 h-48 bg-[#E5E2DE] rounded-lg animate-pulse" />
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8F8F8]">
      {/* Hero Section - Full-width image with transparent header */}
      <HeroSection banners={data?.heroBanners} />
      
      {/* Categories Grid - Bento Style */}
      <CategoriesSection />
      
      {/* Best Sellers */}
      <BestSellersSection />
      
      {/* Testimonials */}
      <TestimonialsSection />
      
      {/* Newsletter */}
      <NewsletterSection />
    </main>
  );
}
