import { CategoriesSection } from "./CategoriesSection";
import { HeroSection } from "./HeroSection";
import { ProductShowcaseSections } from "./ProductShowcaseSections";
import { StoreLocationsSection } from "./StoreLocationsSection";
import { TestimonialsSection } from "./TestimonialsSection";
import type { HomepageData } from "@/lib/homepage";

interface RedesignHomeProps {
  data: HomepageData;
  storesHref: string;
  uiCopy?: {
    categoriesEyebrow?: string;
    categoriesHeading?: string;
    viewAllLabel?: string;
    storesEyebrow?: string;
    storesHeading?: string;
    storesDescription?: string;
    storesLinkLabel?: string;
    testimonialsHeading?: string;
    testimonialsCountLabel?: string;
    productGroups?: Array<{
      title: string;
      subtitle: string;
    }>;
  };
}

export default function RedesignHome({ data, storesHref, uiCopy }: RedesignHomeProps) {
  return (
    <main className="min-h-screen bg-[#F8F8F8F8]">
      <HeroSection slides={data.heroBanners || []} />
      <CategoriesSection
        initialCategories={(data.categories as never[]) || []}
        eyebrow={uiCopy?.categoriesEyebrow}
        heading={uiCopy?.categoriesHeading}
      />
      <ProductShowcaseSections
        categories={(data.categories as never[]) || []}
        allProducts={(data.allProducts as never[]) || []}
        groupCopy={uiCopy?.productGroups}
        viewAllLabel={uiCopy?.viewAllLabel}
      />
      <StoreLocationsSection
        eyebrow={uiCopy?.storesEyebrow}
        heading={uiCopy?.storesHeading}
        description={uiCopy?.storesDescription}
        linkLabel={uiCopy?.storesLinkLabel}
        storesHref={storesHref}
      />
      <TestimonialsSection
        heading={uiCopy?.testimonialsHeading}
        countLabel={uiCopy?.testimonialsCountLabel}
      />
    </main>
  );
}
