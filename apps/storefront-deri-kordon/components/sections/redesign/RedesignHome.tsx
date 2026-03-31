import { HeroSection } from "./HeroSection";
import { CategoriesSection } from "./CategoriesSection";
import { BestSellersSection } from "./BestSellersSection";
import { TestimonialsSection } from "./TestimonialsSection";
import type { HomepageData } from "@/lib/homepage";

export default function RedesignHome({ data }: { data: HomepageData }) {
  return (
    <main className="min-h-screen bg-[#F8F8F8]">
      <HeroSection slides={data.heroBanners || []} />
      <CategoriesSection initialCategories={(data.categories as never[]) || []} />
      <BestSellersSection initialProducts={(data.products as never[]) || []} />
      <TestimonialsSection />
    </main>
  );
}
