import { HeroSection } from "./HeroSection";
import { CategoriesSection } from "./CategoriesSection";
import { BestSellersSection } from "./BestSellersSection";
import PromotionalBanners from "./PromotionalBanners";
import { TestimonialsSection } from "./TestimonialsSection";
import { NewsletterSection } from "./NewsletterSection";
import type { HomepageData } from "@/lib/homepage";

interface RedesignHomeProps {
  initialData?: HomepageData | null;
}

const emptyHomepageData: HomepageData = {
  heroBanners: [],
  categories: [],
  products: [],
  promoBanners: [],
  timestamp: "",
};

export default function RedesignHome({ initialData }: RedesignHomeProps) {
  const data = initialData ?? emptyHomepageData;

  return (
    <main className="min-h-screen bg-[#F8F8F8]">
      {/* Hero Section - Full-width image with transparent header */}
      <HeroSection slides={data.heroBanners} />
      
      {/* Categories Grid - Bento Style */}
      <CategoriesSection initialCategories={data.categories} />
      
      {/* Best Sellers */}
      <BestSellersSection initialProducts={data.products} />

      {/* Promotional Banners */}
      <PromotionalBanners initialBanners={data.promoBanners} />
      
      {/* Testimonials */}
      <TestimonialsSection />
      
      {/* Newsletter */}
      <NewsletterSection />
    </main>
  );
}
