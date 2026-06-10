import Link from "next/link";
import { resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { ROUTES } from "@/lib/constants";

interface HeroBanner {
  id: string | number;
  desktop: string;
  mobile?: string;
  alt: string;
}

interface HeroSectionProps {
  slides?: HeroBanner[];
  banners?: HeroBanner[];
}

const defaultBanners: HeroBanner[] = [
  {
    id: 1,
    desktop: "/Hero_banner_Bir.jpg",
    mobile: "/hero-banner-fistik-ezmeleri-mobile.jpg",
    alt: "Premium Leather Goods",
  },
];

export function HeroSection({ slides, banners }: HeroSectionProps) {
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

  return (
    <section className="relative w-full overflow-hidden">
      <div className="relative w-full aspect-[4/5] sm:aspect-[4/5] md:aspect-[16/9] lg:aspect-[21/9] max-h-[min(85vh,900px)]">
        <picture className="absolute inset-0 block h-full w-full">
          <source media="(max-width: 767px)" srcSet={mobileSrc} />
          <source media="(min-width: 768px)" srcSet={desktopSrc} />
          <img
            src={desktopSrc}
            alt={currentBanner.alt}
            fetchPriority="high"
            loading="eager"
            decoding="async"
            sizes="100vw"
            className="h-full w-full object-cover object-center"
          />
        </picture>

        <div className="absolute inset-0 z-10 flex items-end justify-center pb-10 md:pb-14">
          <Link
            href={ROUTES.products}
            className="inline-flex min-w-[200px] items-center justify-center border border-white/90 bg-transparent px-8 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white transition-colors hover:bg-white hover:text-neutral-900"
          >
            Hemen Keşfet
          </Link>
        </div>
      </div>
    </section>
  );
}
