"use client";

import { useState, useEffect } from "react";
import { HeroSection } from "./HeroSection";
import { CategoriesSection } from "./CategoriesSection";
import { BestSellersSection } from "./BestSellersSection";
import PromotionalBanners from "./PromotionalBanners";
import { TestimonialsSection } from "./TestimonialsSection";
import { NewsletterSection } from "./NewsletterSection";

interface HeroBannerData {
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
        const response = await fetch("/api/homepage", { cache: "no-store" });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Anasayfa verileri yuklenemedi.");
        }

        setData({
          heroBanners: Array.isArray(payload.heroBanners) ? payload.heroBanners : [],
          categories: Array.isArray(payload.categories) ? payload.categories : [],
          products: Array.isArray(payload.products) ? payload.products : [],
          promoBanners: Array.isArray(payload.promoBanners) ? payload.promoBanners : []
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
      <HeroSection slides={data?.heroBanners || []} />
      
      {/* Categories Grid - Bento Style */}
      <CategoriesSection initialCategories={(data?.categories as never[]) || []} />
      
      {/* Best Sellers */}
      <BestSellersSection initialProducts={(data?.products as never[]) || []} />

      {/* Promotional Banners */}
      <PromotionalBanners initialBanners={(data?.promoBanners as never[]) || []} />
      
      {/* Testimonials */}
      <TestimonialsSection />
      
      {/* Newsletter */}
      <NewsletterSection />
    </main>
  );
}
