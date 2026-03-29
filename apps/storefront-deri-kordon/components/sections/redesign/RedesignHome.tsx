"use client";

import { useState, useEffect } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import { HeroSection } from "./HeroSection";
import { CategoriesSection } from "./CategoriesSection";
import { CraftsmanshipSection } from "./CraftsmanshipSection";
import { BestSellersSection } from "./BestSellersSection";
import { TestimonialsSection } from "./TestimonialsSection";
import { NewsletterSection } from "./NewsletterSection";

interface HomepageData {
  heroBanners: unknown[];
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
        <div className="w-full h-screen min-h-[700px] bg-[#0F1626] animate-pulse" />
        
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
      {/* Hero Section - Cinematic Fullscreen */}
      <HeroSection />
      
      {/* Categories Grid - Bento Style */}
      <CategoriesSection />
      
      {/* Craftsmanship Story */}
      <CraftsmanshipSection />
      
      {/* Best Sellers */}
      <BestSellersSection />
      
      {/* Testimonials */}
      <TestimonialsSection />
      
      {/* Newsletter */}
      <NewsletterSection />
    </main>
  );
}
