import { HeroSection } from "./ExistingSections";
import { ProductShowcaseSections } from "./ProductShowcaseSections";
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
      <TrustStrip
        categories={(data.categories as never[]) || []}
        eyebrow={uiCopy?.categoriesEyebrow}
        heading={uiCopy?.categoriesHeading}
        viewAllLabel={uiCopy?.viewAllLabel}
      />
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
      />
      <TestimonialsSection
        heading={uiCopy?.testimonialsHeading}
        countLabel={uiCopy?.testimonialsCountLabel}
        items={data.testimonials}
      />
    </main>
  );
}
