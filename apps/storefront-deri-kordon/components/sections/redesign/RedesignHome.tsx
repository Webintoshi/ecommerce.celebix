import { CategoriesSection } from "./CategoriesSection";
import { HeroSection } from "./HeroSection";
import { ProductShowcaseSections } from "./ProductShowcaseSections";
import { StoreLocationsSection } from "./StoreLocationsSection";
import { TestimonialsSection } from "./TestimonialsSection";
import type { HomepageData } from "@/lib/homepage";

interface RedesignHomeProps {
  data: HomepageData;
  productsHref: string;
  storesHref: string;
  blogPosts?: Array<{
    id: string;
    title: string;
    image: string;
    href: string;
  }>;
  blogViewAllHref?: string;
  uiCopy?: {
    hero?: {
      eyebrow?: string;
      heading?: string;
      description?: string;
      primaryCta?: string;
      secondaryCta?: string;
      stats?: Array<{
        value: string;
        label: string;
      }>;
    };
    categoriesEyebrow?: string;
    categoriesHeading?: string;
    categoriesDescription?: string;
    viewAllLabel?: string;
    showcaseDescription?: string;
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

export default function RedesignHome({
  data,
  productsHref,
  storesHref,
  blogPosts = [],
  blogViewAllHref,
  uiCopy,
}: RedesignHomeProps) {
  return (
    <main className="min-h-screen bg-[#F8F8F8F8]">
      <HeroSection
        slides={data.heroBanners || []}
        productsHref={productsHref}
        storesHref={storesHref}
        copy={uiCopy?.hero}
      />
      <CategoriesSection
        initialCategories={(data.categories as never[]) || []}
        eyebrow={uiCopy?.categoriesEyebrow}
        heading={uiCopy?.categoriesHeading}
        description={uiCopy?.categoriesDescription}
      />
      <ProductShowcaseSections
        categories={(data.categories as never[]) || []}
        allProducts={(data.allProducts as never[]) || []}
        description={uiCopy?.showcaseDescription}
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
        blogPosts={blogPosts}
        blogViewAllHref={blogViewAllHref}
      />
    </main>
  );
}
