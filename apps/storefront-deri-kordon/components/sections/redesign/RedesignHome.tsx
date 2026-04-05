import { HeroSection } from "./HeroSection";
import { CategoriesSection } from "./CategoriesSection";
import { ProductShowcaseSections } from "./ProductShowcaseSections";
import { TestimonialsSection } from "./TestimonialsSection";
import type { HomepageData } from "@/lib/homepage";

interface RedesignHomeProps {
  data: HomepageData;
  uiCopy?: {
    categoriesEyebrow?: string;
    categoriesHeading?: string;
    viewAllLabel?: string;
    testimonialsHeading?: string;
    testimonialsCountLabel?: string;
    productGroups?: Array<{
      title: string;
      subtitle: string;
    }>;
  };
}

export default function RedesignHome({ data, uiCopy }: RedesignHomeProps) {
  return (
    <main className="min-h-screen bg-[#F8F8F8F8]">
      <HeroSection slides={data.heroBanners || []} />
      <CategoriesSection
        initialCategories={(data.categories as never[]) || []}
        eyebrow={uiCopy?.categoriesEyebrow}
        heading={uiCopy?.categoriesHeading}
      />
      <ProductShowcaseSections
        allProducts={(data.allProducts as never[]) || []}
        groupCopy={uiCopy?.productGroups}
        viewAllLabel={uiCopy?.viewAllLabel}
      />
      <TestimonialsSection
        heading={uiCopy?.testimonialsHeading}
        countLabel={uiCopy?.testimonialsCountLabel}
      />
    </main>
  );
}
