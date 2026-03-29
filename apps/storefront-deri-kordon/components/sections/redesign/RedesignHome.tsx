"use client";

import { useState, useEffect } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import { HeroSection } from "./HeroSection";
import { CategoriesSection } from "./CategoriesSection";
import { CraftsmanshipSection } from "./CraftsmanshipSection";
import { BestSellersSection } from "./BestSellersSection";
import { FeaturesSection } from "./FeaturesSection";
import { TestimonialsSection } from "./TestimonialsSection";
import { NewsletterSection } from "./NewsletterSection";
import { InstagramFeed } from "./InstagramFeed";

interface HeroSlide {
  id: number;
  desktop: string;
  mobile: string;
  alt: string;
  link?: string;
  title?: string;
  subtitle?: string;
  buttonText?: string;
  buttonLink?: string;
}

interface HomepageData {
  heroBanners: HeroSlide[];
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

        setData({
          heroBanners: heroData?.value?.slides || [],
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
        <div className="w-full aspect-[3/4] sm:aspect-[16/9] lg:aspect-[21/9] max-h-[900px] bg-[#E5E2DE] animate-pulse" />
        
        {/* Categories Skeleton */}
        <section className="py-16 lg:py-24">
          <div className="container-premium">
            <div className="text-center mb-12">
              <div className="h-4 w-24 bg-[#E5E2DE] rounded-full mx-auto mb-4" />
              <div className="h-10 w-64 bg-[#E5E2DE] rounded-lg mx-auto" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="aspect-[4/5] bg-[#E5E2DE] rounded-2xl animate-pulse" />
              ))}
            </div>
          </div>
        </section>

        {/* Products Skeleton */}
        <section className="py-16 bg-white">
          <div className="container-premium">
            <div className="flex items-center justify-between mb-10">
              <div className="h-8 w-48 bg-[#E5E2DE] rounded-lg" />
              <div className="h-10 w-28 bg-[#E5E2DE] rounded-lg" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-[#F8F8F8] rounded-2xl overflow-hidden">
                  <div className="aspect-square bg-[#E5E2DE] animate-pulse" />
                  <div className="p-4 space-y-3">
                    <div className="h-3 bg-[#E5E2DE] rounded w-1/3" />
                    <div className="h-5 bg-[#E5E2DE] rounded w-3/4" />
                    <div className="h-3 bg-[#E5E2DE] rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8F8F8]">
      {/* Hero Section - Full-width cinematic */}
      <HeroSection slides={data?.heroBanners || []} />
      
      {/* Categories Grid - Bento style */}
      <CategoriesSection initialCategories={data?.categories || []} />
      
      {/* Craftsmanship Story */}
      <CraftsmanshipSection />
      
      {/* Best Sellers */}
      <BestSellersSection initialProducts={data?.products || []} />
      
      {/* Features / Quality Promise */}
      <FeaturesSection />
      
      {/* Testimonials */}
      <TestimonialsSection />
      
      {/* Instagram Feed */}
      <InstagramFeed />
      
      {/* Newsletter */}
      <NewsletterSection />
    </main>
  );
}
