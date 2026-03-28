"use client";

import { useState, useEffect } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import { HeroSection } from "./ExistingSections";
import ShopByCategory from "./ShopByCategory";
import BestSellers from "./BestSellers";
import PromotionalBanners from "./PromotionalBanners";
import ShopByLifestyle from "./ShopByLifestyle";

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

        // Fetch all data in parallel
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
      <main className="min-h-screen">
        {/* Hero Skeleton */}
        <div className="w-full aspect-[3/4] sm:aspect-[4/5] md:aspect-[16/9] lg:aspect-[21/9] max-h-[900px] bg-gray-200 animate-pulse" />
        
        {/* Categories Skeleton */}
        <section className="py-16 md:py-24 bg-[#FFF5F5]">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <div className="h-6 w-32 bg-gray-200 rounded-full mx-auto mb-4" />
              <div className="h-10 w-56 bg-gray-200 rounded-lg mx-auto" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="aspect-[4/5] bg-gray-200 rounded-2xl animate-pulse" />
              ))}
            </div>
          </div>
        </section>

        {/* Products Skeleton */}
        <section className="py-12 md:py-20 bg-white">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="h-8 w-40 bg-gray-200 rounded-lg mb-8" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-white rounded-2xl overflow-hidden border border-gray-100">
                  <div className="aspect-square bg-gray-200 animate-pulse" />
                  <div className="p-4 space-y-3">
                    <div className="h-3 bg-gray-200 rounded w-1/3" />
                    <div className="h-5 bg-gray-200 rounded w-3/4" />
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
    <main className="min-h-screen">
      <HeroSection slides={data?.heroBanners || []} />
      
      <ShopByCategory initialCategories={data?.categories || []} />
      <BestSellers initialProducts={data?.products || []} />
      <PromotionalBanners initialBanners={data?.promoBanners || []} />
      <ShopByLifestyle />
    </main>
  );
}
