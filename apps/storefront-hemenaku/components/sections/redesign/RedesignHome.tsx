import { CategoriesSection } from "./CategoriesSection";
import { HeroSection, StorefrontCtaSection } from "./ExistingSections";
import { BlogPreviewSection } from "./BlogPreviewSection";
import { ProductShowcaseSections } from "./ProductShowcaseSections";
import { StoreLocationsSection } from "./StoreLocationsSection";
import { TestimonialsSection } from "./TestimonialsSection";
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

export default function RedesignHome({ data, storesHref, blogPosts = [], uiCopy }: RedesignHomeProps) {
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
      <BlogPreviewSection posts={blogPosts} />
      <StorefrontCtaSection />
    </main>
  );
}
