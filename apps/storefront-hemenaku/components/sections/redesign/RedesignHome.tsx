import { CategoriesSection } from "./CategoriesSection";
import { HeroSection } from "./ExistingSections";
import { ProductShowcaseSections } from "./ProductShowcaseSections";
import { VisualPromoRail, VisualServiceStrip, VisualSupportSection } from "./VisualHomeSections";
import type { HomepageData } from "@/lib/homepage";
import type { BlogPost } from "@/types/blog";

interface RedesignHomeProps {
  data: HomepageData;
  storesHref: string;
  blogPosts?: BlogPost[];
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

export default function RedesignHome({ data, storesHref: _storesHref, blogPosts: _blogPosts = [], uiCopy }: RedesignHomeProps) {
  return (
    <main className="min-h-screen bg-[#F3F6FA]">
      <HeroSection slides={data.heroBanners || []} />
      <VisualPromoRail categories={data.categories} products={(data.allProducts as never[]) || []} />
      <CategoriesSection
        initialCategories={(data.categories as never[]) || []}
        eyebrow={uiCopy?.categoriesEyebrow || "Kategoriler"}
        heading={uiCopy?.categoriesHeading || "Akü seçenekleri"}
      />
      <ProductShowcaseSections
        categories={data.featuredCategories}
        allProducts={(data.allProducts as never[]) || []}
        homepageCuration={data.homepageCuration}
        groupCopy={uiCopy?.productGroups}
        viewAllLabel={uiCopy?.viewAllLabel}
      />
      <VisualServiceStrip />
      <VisualSupportSection heroBanners={data.heroBanners} products={(data.allProducts as never[]) || []} />
    </main>
  );
}
