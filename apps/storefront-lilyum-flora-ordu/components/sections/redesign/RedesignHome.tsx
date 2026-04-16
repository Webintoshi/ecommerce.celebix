import { CategoriesSection } from "./CategoriesSection";
import { HeroSection } from "./ExistingSections";
import { ProductShowcaseSections } from "./ProductShowcaseSections";
import PromotionalBanners from "./PromotionalBanners";
import { StoreLocationsSection } from "./StoreLocationsSection";
import { TestimonialsSection } from "./TestimonialsSection";
import { TrustStrip } from "./TrustStrip";
import type { HomepageData } from "@/lib/homepage";

interface RedesignHomeProps {
  data: HomepageData;
  storesHref: string;
  uiCopy?: {
    categoriesEyebrow?: string;
    categoriesHeading?: string;
    viewAllLabel?: string;
    productGroups?: Array<{
      title: string;
      subtitle: string;
    }>;
    storesEyebrow?: string;
    storesHeading?: string;
    storesDescription?: string;
    storesLinkLabel?: string;
    testimonialsHeading?: string;
    testimonialsCountLabel?: string;
  };
}

export default function RedesignHome({ data, storesHref, uiCopy }: RedesignHomeProps) {
  return (
    <main className="min-h-screen bg-[var(--store-surface)]">
      <HeroSection slides={data.heroBanners || []} />
      <TrustStrip />
      <CategoriesSection
        initialCategories={(data.categories as never[]) || []}
        eyebrow={uiCopy?.categoriesEyebrow}
        heading={uiCopy?.categoriesHeading}
      />
      <PromotionalBanners initialBanners={data.promoBanners as never[]} />
      <ProductShowcaseSections
        categories={data.categories}
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
        heroBanners={data.heroBanners}
        promoBanners={data.promoBanners}
      />
      <TestimonialsSection
        heading={uiCopy?.testimonialsHeading}
        countLabel={uiCopy?.testimonialsCountLabel}
        items={data.testimonials}
      />
    </main>
  );
}
