import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { resolveStorefrontAssetUrl } from "@/lib/asset-url";

interface HeroBanner {
  id: string | number;
  desktop: string;
  mobile?: string;
  alt: string;
}

interface HeroSectionProps {
  slides?: HeroBanner[];
  banners?: HeroBanner[];
  productsHref: string;
  storesHref: string;
  copy?: {
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
}

const defaultBanners: HeroBanner[] = [
  {
    id: 1,
    desktop: "/Hero_banner_Bir.jpg",
    mobile: "/hero-banner-fistik-ezmeleri-mobile.jpg",
    alt: "Premium Leather Goods",
  },
];

const DEFAULT_STATS = [
  { value: "100%", label: "workshop production" },
  { value: "Full-grain", label: "premium leather selection" },
  { value: "1-3 days", label: "fast shipping support" },
];

export function HeroSection({
  slides,
  banners,
  productsHref,
  storesHref,
  copy,
}: HeroSectionProps) {
  const heroBanners =
    (slides && slides.length > 0 ? slides : null) ||
    (banners && banners.length > 0 ? banners : null) ||
    defaultBanners;

  const currentBanner = heroBanners[0];
  const desktopSrc = resolveStorefrontAssetUrl(
    currentBanner.desktop || currentBanner.mobile || defaultBanners[0].desktop,
  );
  const mobileSrc = resolveStorefrontAssetUrl(
    currentBanner.mobile || currentBanner.desktop || defaultBanners[0].mobile || desktopSrc,
  );
  const stats = copy?.stats && copy.stats.length > 0 ? copy.stats : DEFAULT_STATS;

  return (
    <section className="relative w-full overflow-hidden bg-[#EEE5DA]">
      <div className="relative w-full overflow-hidden">
        <picture>
          <source media="(max-width: 767px)" srcSet={mobileSrc} />
          <source media="(min-width: 768px)" srcSet={desktopSrc} />
          <img
            src={desktopSrc}
            alt={currentBanner.alt}
            fetchPriority="high"
            loading="eager"
            decoding="async"
            sizes="100vw"
            className="block w-full aspect-[4/5] object-cover object-center md:aspect-[16/7] lg:aspect-[16/6] xl:aspect-[16/5.6]"
          />
        </picture>

        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,11,4,0.12)_0%,rgba(17,11,4,0.24)_48%,rgba(17,11,4,0.56)_100%)] md:bg-[linear-gradient(90deg,rgba(17,11,4,0.7)_0%,rgba(17,11,4,0.32)_42%,rgba(17,11,4,0.08)_72%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.16),transparent_72%)]" />

        <div className="absolute inset-0">
          <div className="container-premium flex h-full items-end py-6 sm:py-8 md:items-center md:py-12 lg:py-16">
            <div className="max-w-[38rem] rounded-[30px] border border-white/16 bg-[linear-gradient(180deg,rgba(15,12,9,0.78)_0%,rgba(15,12,9,0.6)_100%)] p-5 text-white shadow-[0_32px_90px_-44px_rgba(10,8,5,0.95)] backdrop-blur-md sm:p-7 lg:p-8">
              <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.3em] text-white/82">
                {copy?.eyebrow || "Atelier Selection"}
              </span>

              <h1 className="mt-4 max-w-xl text-3xl font-semibold leading-[1.04] tracking-[-0.04em] text-white sm:text-[2.6rem] lg:text-[3.5rem]">
                {copy?.heading || "Carry genuine leather into your daily rhythm with refined ease"}
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/76 sm:text-[15px]">
                {copy?.description ||
                  "Handmade leather straps, lasting accessories and durable material choices in a quieter, more premium collection."}
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={productsHref}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-[#17110B] transition-transform duration-300 hover:-translate-y-0.5"
                >
                  {copy?.primaryCta || "Explore Collection"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href={storesHref}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/18 bg-white/6 px-5 py-3 text-sm font-medium text-white transition-colors duration-300 hover:bg-white/12"
                >
                  {copy?.secondaryCta || "View Stores"}
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="mt-6 grid gap-3 border-t border-white/12 pt-5 sm:grid-cols-3">
                {stats.slice(0, 3).map((item) => (
                  <div
                    key={`${item.value}-${item.label}`}
                    className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-3"
                  >
                    <p className="text-lg font-semibold tracking-[-0.03em] text-white">{item.value}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.24em] text-white/60">
                      {item.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
