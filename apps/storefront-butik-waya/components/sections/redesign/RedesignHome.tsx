import { CategoriesSection } from "./CategoriesSection";
import { HeroSection } from "./ExistingSections";
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

function EditorialIntro({ data }: { data: HomepageData }) {
  const metrics = [
    {
      label: "Aktif koleksiyon",
      value: String((data.categories || []).length).padStart(2, "0"),
    },
    {
      label: "Secili urun",
      value: String((data.allProducts || []).length).padStart(2, "0"),
    },
    {
      label: "Musteri notu",
      value: String((data.testimonials || []).length).padStart(2, "0"),
    },
  ];

  return (
    <section className="py-8 lg:py-12">
      <div className="container-premium">
        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[2.2rem] border border-[rgba(29,23,21,0.08)] bg-[rgba(255,248,242,0.82)] p-6 shadow-[0_30px_90px_-60px_rgba(19,13,11,0.7)] backdrop-blur sm:p-8">
            <p className="editorial-kicker">Brand Direction</p>
            <h2 className="mt-5 max-w-2xl font-serif text-4xl leading-[0.92] tracking-[-0.05em] text-[#1d1715] sm:text-5xl">
              Dikkati renk kalabaligiyla degil, kompozisyon ve kontrastla topluyoruz.
            </h2>
            <p className="editorial-copy mt-5 max-w-2xl text-sm sm:text-base">
              Zara ve Balmain benzeri premium moda storefront taktiklerinde ana mesele genellikle
              aynidir: siyaha yakin bir zemin, kirik beyaz yazi, az sayida camel vurgu ve buyuk
              editorial tipografi. Butik Waya anasayfasi icin bu sistemi baz aliyoruz.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            {metrics.map((item) => (
              <div
                key={item.label}
                className="rounded-[1.85rem] border border-[rgba(29,23,21,0.08)] bg-[#171210] p-5 text-white shadow-[0_30px_90px_-60px_rgba(19,13,11,0.85)]"
              >
                <p className="text-[11px] uppercase tracking-[0.28em] text-[#d6ae89]">{item.label}</p>
                <p className="mt-4 font-serif text-5xl leading-none tracking-[-0.06em] text-[#fff8f2]">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function RedesignHome({ data, storesHref, uiCopy }: RedesignHomeProps) {
  return (
    <main className="min-h-screen bg-[#F8F8F8F8]">
      <HeroSection slides={data.heroBanners || []} />
      <EditorialIntro data={data} />
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
    </main>
  );
}
