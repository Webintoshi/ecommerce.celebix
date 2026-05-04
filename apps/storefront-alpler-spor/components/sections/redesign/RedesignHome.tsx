import { CategoriesSection } from "./CategoriesSection";
import { HeroSection } from "./ExistingSections";
import { ProductShowcaseSections } from "./ProductShowcaseSections";
import { TestimonialsSection } from "./TestimonialsSection";
import type { HomepageData } from "@/lib/homepage";

interface RedesignHomeProps {
  data: HomepageData;
  uiCopy?: {
    categoriesEyebrow?: string;
    categoriesHeading?: string;
    viewAllLabel?: string;
    productGroups?: Array<{
      title: string;
      subtitle: string;
    }>;
    testimonialsHeading?: string;
    testimonialsCountLabel?: string;
  };
}

export default function RedesignHome({ data, uiCopy }: RedesignHomeProps) {
  return (
    <main className="min-h-screen bg-[#F5F7FA]">
      <HeroSection slides={data.heroBanners || []} />
      <CategoriesSection
        initialCategories={(data.categories as never[]) || []}
        eyebrow={uiCopy?.categoriesEyebrow}
        heading={uiCopy?.categoriesHeading}
      />
      <ProductShowcaseSections
        categories={data.featuredCategories}
        allProducts={(data.allProducts as never[]) || []}
        homepageCuration={data.homepageCuration}
        groupCopy={uiCopy?.productGroups}
        viewAllLabel={uiCopy?.viewAllLabel}
      />
      <TestimonialsSection
        heading={uiCopy?.testimonialsHeading}
        countLabel={uiCopy?.testimonialsCountLabel}
        items={data.testimonials}
      />
    </main>
  );
}
